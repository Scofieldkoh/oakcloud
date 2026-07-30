/**
 * Document Template Service
 *
 * Business logic for document template management including CRUD operations,
 * search, and template duplication. Fully integrated with multi-tenancy support.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog, computeChanges } from '@/lib/audit';
import type {
  CreateDocumentTemplateInput,
  UpdateDocumentTemplateInput,
  SearchDocumentTemplatesInput,
  DuplicateDocumentTemplateInput,
} from '@/lib/validations/document-template';
import { Prisma } from '@/generated/prisma';
import type { DocumentTemplate, DocumentTemplateCategory } from '@/generated/prisma';
import type { TenantAwareParams } from '@/lib/types';
import {
  analyzeTemplateContent,
  extractPartialReferences,
  normalizePlaceholderKey,
  normalizeStoredPlaceholders,
  type StoredPlaceholderLike,
} from '@/lib/template-analysis';
import { assertValidTemplateComposition } from '@/lib/service-agreement-template';

// ============================================================================
// Types
// ============================================================================

export interface DocumentTemplateWithRelations extends DocumentTemplate {
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  _count?: {
    generatedDocuments: number;
  };
}

// Re-export shared type for backwards compatibility
export type { TenantAwareParams } from '@/lib/types';

// Fields tracked for audit logging
const TRACKED_FIELDS: (keyof DocumentTemplate)[] = [
  'name',
  'description',
  'category',
  'compositionType',
  'content',
  'isActive',
];

// ============================================================================
// Create Template
// ============================================================================

export async function createDocumentTemplate(
  data: CreateDocumentTemplateInput,
  params: TenantAwareParams
): Promise<DocumentTemplate> {
  const { tenantId, userId } = params;
  assertValidTemplateComposition(data.compositionType, data.content);

  // Check for duplicate name within tenant
  const existingName = await prisma.documentTemplate.findFirst({
    where: { tenantId, name: data.name, deletedAt: null },
  });

  if (existingName) {
    throw new Error('A template with this name already exists');
  }

  const template = await prisma.documentTemplate.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description,
      category: data.category,
      compositionType: data.compositionType,
      content: data.content,
      contentJson: data.contentJson ?? undefined,
      placeholders: data.placeholders,
      isActive: data.isActive,
      createdById: userId,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'DOCUMENT_TEMPLATE_CREATED',
    entityType: 'DocumentTemplate',
    entityId: template.id,
    entityName: template.name,
    summary: `Created document template "${template.name}"`,
    changeSource: 'MANUAL',
    metadata: { category: template.category, name: template.name },
  });

  return template;
}

// ============================================================================
// Update Template
// ============================================================================

export async function updateDocumentTemplate(
  data: UpdateDocumentTemplateInput,
  params: TenantAwareParams,
  reason?: string
): Promise<DocumentTemplate> {
  const { tenantId, userId } = params;

  const existing = await prisma.documentTemplate.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Template not found');
  }

  assertValidTemplateComposition(
    data.compositionType ?? existing.compositionType,
    data.content ?? existing.content,
  );

  // Check for duplicate name if being changed
  if (data.name && data.name !== existing.name) {
    const existingName = await prisma.documentTemplate.findFirst({
      where: {
        tenantId,
        name: data.name,
        deletedAt: null,
        NOT: { id: data.id },
      },
    });

    if (existingName) {
      throw new Error('A template with this name already exists');
    }
  }

  const updateData: Prisma.DocumentTemplateUpdateInput = {
    version: { increment: 1 }, // Increment version on each update
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.compositionType !== undefined) updateData.compositionType = data.compositionType;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.contentJson !== undefined) {
    updateData.contentJson = data.contentJson === null
      ? Prisma.JsonNull
      : data.contentJson;
  }
  if (data.placeholders !== undefined) updateData.placeholders = data.placeholders;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const template = await prisma.documentTemplate.update({
    where: { id: data.id },
    data: updateData,
  });

  const changes = computeChanges(
    existing as Record<string, unknown>,
    data,
    TRACKED_FIELDS as string[]
  );

  if (changes) {
    const changedFields = Object.keys(changes).join(', ');
    await createAuditLog({
      tenantId,
      userId,
      action: 'DOCUMENT_TEMPLATE_UPDATED',
      entityType: 'DocumentTemplate',
      entityId: template.id,
      entityName: template.name,
      summary: `Updated document template "${template.name}" (${changedFields})`,
      changeSource: 'MANUAL',
      changes,
      reason,
    });
  }

  return template;
}

// ============================================================================
// Delete Template (Soft Delete)
// ============================================================================

export async function deleteDocumentTemplate(
  id: string,
  params: TenantAwareParams,
  reason: string
): Promise<DocumentTemplate> {
  const { tenantId, userId } = params;

  const existing = await prisma.documentTemplate.findFirst({
    where: { id, tenantId },
    include: {
      _count: {
        select: { generatedDocuments: true },
      },
    },
  });

  if (!existing) {
    throw new Error('Template not found');
  }

  if (existing.deletedAt) {
    throw new Error('Template is already deleted');
  }

  const template = await prisma.documentTemplate.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'DOCUMENT_TEMPLATE_DELETED',
    entityType: 'DocumentTemplate',
    entityId: template.id,
    entityName: template.name,
    summary: `Deleted document template "${template.name}"`,
    changeSource: 'MANUAL',
    reason,
    metadata: {
      name: template.name,
      category: template.category,
      documentCount: existing._count.generatedDocuments,
    },
  });

  return template;
}

// ============================================================================
// Restore Template
// ============================================================================

export async function restoreDocumentTemplate(
  id: string,
  params: TenantAwareParams
): Promise<DocumentTemplate> {
  const { tenantId, userId } = params;

  const existing = await prisma.documentTemplate.findFirst({
    where: { id, tenantId },
  });

  if (!existing) {
    throw new Error('Template not found');
  }

  if (!existing.deletedAt) {
    throw new Error('Template is not deleted');
  }

  // Check for name conflict with active templates
  const conflicting = await prisma.documentTemplate.findFirst({
    where: {
      tenantId,
      name: existing.name,
      deletedAt: null,
      NOT: { id },
    },
  });

  if (conflicting) {
    throw new Error('Cannot restore: a template with this name already exists');
  }

  const template = await prisma.documentTemplate.update({
    where: { id },
    data: {
      deletedAt: null,
      isActive: true,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'RESTORE',
    entityType: 'DocumentTemplate',
    entityId: template.id,
    entityName: template.name,
    summary: `Restored document template "${template.name}"`,
    changeSource: 'MANUAL',
    metadata: { name: template.name, category: template.category },
  });

  return template;
}

// ============================================================================
// Duplicate Template
// ============================================================================

export async function duplicateDocumentTemplate(
  data: DuplicateDocumentTemplateInput,
  params: TenantAwareParams
): Promise<DocumentTemplate> {
  const { tenantId, userId } = params;

  const existing = await prisma.documentTemplate.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Template not found');
  }

  assertValidTemplateComposition(existing.compositionType, existing.content);

  // Generate new name
  let newName = data.name || `Copy of ${existing.name}`;

  // Ensure name is unique
  let counter = 1;
  while (true) {
    const existingName = await prisma.documentTemplate.findFirst({
      where: { tenantId, name: newName, deletedAt: null },
    });
    if (!existingName) break;
    counter++;
    newName = data.name ? `${data.name} (${counter})` : `Copy of ${existing.name} (${counter})`;
    if (counter > 100) throw new Error('Unable to generate unique name');
  }

  const template = await prisma.documentTemplate.create({
    data: {
      tenantId,
      name: newName,
      description: existing.description,
      category: existing.category,
      compositionType: existing.compositionType,
      content: existing.content,
      contentJson: existing.contentJson ?? undefined,
      placeholders: existing.placeholders ?? [],
      isActive: true,
      createdById: userId,
      version: 1, // Reset version for duplicated template
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'DOCUMENT_TEMPLATE_DUPLICATED',
    entityType: 'DocumentTemplate',
    entityId: template.id,
    entityName: template.name,
    summary: `Duplicated template "${existing.name}" as "${template.name}"`,
    changeSource: 'MANUAL',
    metadata: {
      sourceTemplateId: existing.id,
      sourceTemplateName: existing.name,
      newName: template.name,
    },
  });

  return template;
}

// ============================================================================
// Get Template by ID
// ============================================================================

export interface GetTemplateOptions {
  includeDeleted?: boolean;
}

export async function getDocumentTemplateById(
  id: string,
  tenantId: string,
  options: GetTemplateOptions = {}
): Promise<DocumentTemplateWithRelations | null> {
  const { includeDeleted = false } = options;

  const where: Prisma.DocumentTemplateWhereInput = { id, tenantId };

  if (!includeDeleted) {
    where.deletedAt = null;
  }

  return prisma.documentTemplate.findFirst({
    where,
    include: {
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      _count: {
        select: {
          generatedDocuments: true,
        },
      },
    },
  });
}

// ============================================================================
// Search Templates
// ============================================================================

export async function searchDocumentTemplates(
  params: SearchDocumentTemplatesInput,
  tenantId: string
): Promise<{
  templates: DocumentTemplateWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const where: Prisma.DocumentTemplateWhereInput = {
    tenantId,
    deletedAt: null,
  };

  // Text search
  if (params.query) {
    const searchTerm = params.query.trim();
    where.OR = [
      { name: { contains: searchTerm, mode: 'insensitive' } },
      { description: { contains: searchTerm, mode: 'insensitive' } },
    ];
  }

  // Filters
  if (params.category) {
    where.category = params.category;
  }

  if (params.isActive !== undefined) {
    where.isActive = params.isActive;
  }

  // Sorting
  const orderBy: Prisma.DocumentTemplateOrderByWithRelationInput = {};
  orderBy[params.sortBy] = params.sortOrder;

  // Pagination
  const skip = (params.page - 1) * params.limit;

  const [templates, total] = await Promise.all([
    prisma.documentTemplate.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            generatedDocuments: true,
          },
        },
      },
      orderBy,
      skip,
      take: params.limit,
    }),
    prisma.documentTemplate.count({ where }),
  ]);

  return {
    templates,
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(total / params.limit),
  };
}

// ============================================================================
// Get Template Statistics
// ============================================================================

export async function getTemplateStats(tenantId: string): Promise<{
  total: number;
  active: number;
  byCategory: Record<string, number>;
  recentlyCreated: number;
  mostUsed: Array<{ id: string; name: string; usageCount: number }>;
  health: {
    activeTemplatesCanGenerateCleanly: number;
    activeTemplatesWithMissingPartials: number;
    missingPartialReferences: Array<{ templateId: string; templateName: string; partialName: string }>;
    inactivePartialReferences: Array<{ templateId: string; templateName: string; partialName: string }>;
    circularPartialReferences: Array<{ templateId: string; templateName: string; cycle: string }>;
    unknownPlaceholders: Array<{ templateId: string; templateName: string; key: string }>;
    syntaxErrors: Array<{ templateId: string; templateName: string; message: string }>;
    stalePartialMetadata: Array<{ templateId: string; templateName: string; partialName: string; key: string }>;
    requiredCustomFields: Array<{ templateId: string; templateName: string; key: string; label: string }>;
    templates: Array<{
      id: string;
      name: string;
      isActive: boolean;
      missingPartials: string[];
      inactivePartials: string[];
      circularPartials: string[];
      unknownPlaceholders: string[];
      syntaxErrors: string[];
      stalePartialMetadata: Array<{ partialName: string; key: string }>;
      requiredCustomFields: Array<{ key: string; label: string }>;
      lastSuccessfulTest: string | null;
      canGenerateCleanly: boolean;
      canGenerateWithSampleData: boolean;
      dependencyCount: number;
    }>;
  };
}> {
  const [total, active, byCategory, recentlyCreated, mostUsed, templatesForHealth, partials] = await Promise.all([
    prisma.documentTemplate.count({
      where: { tenantId, deletedAt: null },
    }),
    prisma.documentTemplate.count({
      where: { tenantId, deletedAt: null, isActive: true },
    }),
    prisma.documentTemplate.groupBy({
      by: ['category'],
      where: { tenantId, deletedAt: null },
      _count: true,
    }),
    prisma.documentTemplate.count({
      where: {
        tenantId,
        deletedAt: null,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
    }),
    prisma.documentTemplate.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        _count: {
          select: { generatedDocuments: true },
        },
      },
      orderBy: {
        generatedDocuments: {
          _count: 'desc',
        },
      },
      take: 5,
    }),
    prisma.documentTemplate.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        content: true,
        placeholders: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.templatePartial.findMany({
      where: { tenantId },
      select: {
        name: true,
        displayName: true,
        content: true,
        placeholders: true,
        updatedAt: true,
        deletedAt: true,
      },
    }),
  ]);

  const activePartials = partials.filter((partial) => !partial.deletedAt);
  const activePartialNames = new Set(activePartials.map((partial) => partial.name));
  const allPartialsByName = new Map(partials.map((partial) => [partial.name, partial]));
  const templateHealth = templatesForHealth.map((template) => {
    const diagnostics = analyzeTemplateContent({
      content: template.content,
      placeholders: template.placeholders,
      partials: activePartials,
    });
    const inactivePartials = extractPartialReferences(template.content)
      .filter((partialName) => allPartialsByName.get(partialName)?.deletedAt);
    const stalePartialMetadata = findStalePartialMetadata(
      template.placeholders,
      template.content,
      activePartials
    );
    const missingPartials = diagnostics.missingPartials
      .filter((partialName) => !activePartialNames.has(partialName));
    const requiredCustomFields = normalizeStoredPlaceholders(template.placeholders)
      .filter((placeholder) => (
        placeholder.required
        && !placeholder.sourcePartial
        && (placeholder.category === 'custom' || placeholder.key?.startsWith('custom.'))
      ))
      .map((placeholder) => ({
        key: (placeholder.key || '').replace(/^custom\./, ''),
        label: placeholder.label || (placeholder.key || '').replace(/^custom\./, ''),
      }))
      .filter((placeholder) => placeholder.key);

    return {
      id: template.id,
      name: template.name,
      isActive: template.isActive,
      missingPartials,
      inactivePartials,
      circularPartials: diagnostics.circularPartials,
      unknownPlaceholders: diagnostics.unknownPlaceholders,
      syntaxErrors: diagnostics.syntaxErrors,
      stalePartialMetadata,
      requiredCustomFields,
      lastSuccessfulTest: null,
      canGenerateCleanly:
        template.isActive
        && missingPartials.length === 0
        && inactivePartials.length === 0
        && diagnostics.circularPartials.length === 0
        && diagnostics.syntaxErrors.length === 0,
      canGenerateWithSampleData:
        missingPartials.length === 0
        && inactivePartials.length === 0
        && diagnostics.circularPartials.length === 0
        && diagnostics.syntaxErrors.length === 0
        && diagnostics.unknownPlaceholders.length === 0,
      dependencyCount: diagnostics.dependencies.filter((dependency) => dependency.found).length,
    };
  });

  return {
    total,
    active,
    byCategory: Object.fromEntries(
      byCategory.map((c) => [c.category, c._count])
    ),
    recentlyCreated,
    mostUsed: mostUsed.map((t) => ({
      id: t.id,
      name: t.name,
      usageCount: t._count.generatedDocuments,
    })),
    health: {
      activeTemplatesCanGenerateCleanly: templateHealth.filter(
        (template) => template.isActive && template.canGenerateCleanly
      ).length,
      activeTemplatesWithMissingPartials: templateHealth.filter(
        (template) => template.isActive && template.missingPartials.length > 0
      ).length,
      missingPartialReferences: templateHealth.flatMap((template) => (
        template.missingPartials.map((partialName) => ({
          templateId: template.id,
          templateName: template.name,
          partialName,
        }))
      )),
      inactivePartialReferences: templateHealth.flatMap((template) => (
        template.inactivePartials.map((partialName) => ({
          templateId: template.id,
          templateName: template.name,
          partialName,
        }))
      )),
      circularPartialReferences: templateHealth.flatMap((template) => (
        template.circularPartials.map((cycle) => ({
          templateId: template.id,
          templateName: template.name,
          cycle,
        }))
      )),
      unknownPlaceholders: templateHealth.flatMap((template) => (
        template.unknownPlaceholders.map((key) => ({
          templateId: template.id,
          templateName: template.name,
          key,
        }))
      )),
      syntaxErrors: templateHealth.flatMap((template) => (
        template.syntaxErrors.map((message) => ({
          templateId: template.id,
          templateName: template.name,
          message,
        }))
      )),
      stalePartialMetadata: templateHealth.flatMap((template) => (
        template.stalePartialMetadata.map((item) => ({
          templateId: template.id,
          templateName: template.name,
          partialName: item.partialName,
          key: item.key,
        }))
      )),
      requiredCustomFields: templateHealth.flatMap((template) => (
        template.requiredCustomFields.map((field) => ({
          templateId: template.id,
          templateName: template.name,
          key: field.key,
          label: field.label,
        }))
      )),
      templates: templateHealth,
    },
  };
}

function findStalePartialMetadata(
  templatePlaceholders: unknown,
  templateContent: string,
  activePartials: Array<{ name: string; placeholders: unknown }>
): Array<{ partialName: string; key: string }> {
  const referencedPartials = new Set(extractPartialReferences(templateContent));
  const partialCustomKeys = new Map<string, Set<string>>();
  for (const partial of activePartials) {
    partialCustomKeys.set(
      partial.name,
      new Set(
        normalizeStoredPlaceholders(partial.placeholders)
          .filter((placeholder) => (
            placeholder.category === 'custom'
            || placeholder.source === 'custom'
            || placeholder.key?.startsWith('custom.')
          ))
          .map((placeholder) => normalizePlaceholderKey(placeholder.key))
          .filter(Boolean)
      )
    );
  }

  return normalizeStoredPlaceholders(templatePlaceholders)
    .filter((placeholder): placeholder is StoredPlaceholderLike & { sourcePartial: string } => (
      Boolean(placeholder.sourcePartial)
    ))
    .map((placeholder) => ({
      partialName: placeholder.sourcePartial,
      key: normalizePlaceholderKey(placeholder.key),
    }))
    .filter((item) => {
      if (!referencedPartials.has(item.partialName)) return true;
      const currentKeys = partialCustomKeys.get(item.partialName);
      return !currentKeys || !currentKeys.has(item.key);
    });
}

// ============================================================================
// Get Templates by Category
// ============================================================================

export async function getTemplatesByCategory(
  tenantId: string,
  category: DocumentTemplateCategory,
  activeOnly = true
): Promise<DocumentTemplate[]> {
  return prisma.documentTemplate.findMany({
    where: {
      tenantId,
      category,
      deletedAt: null,
      ...(activeOnly ? { isActive: true } : {}),
    },
    orderBy: { name: 'asc' },
  });
}

// ============================================================================
// Extract Placeholders from Content
// ============================================================================

/**
 * Extracts placeholder keys from template content.
 * Supports Handlebars-style syntax: {{placeholder}}, {{#each items}}, {{#if condition}}
 */
export function extractPlaceholdersFromContent(content: string): string[] {
  const placeholders = new Set<string>();

  // Match simple placeholders: {{company.name}}, {{date}}
  const simpleRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_.\[\]]*)\}\}/g;
  let match;
  while ((match = simpleRegex.exec(content)) !== null) {
    // Skip block helpers (if, each, unless)
    if (!['if', 'each', 'unless', 'with', '/if', '/each', '/unless', '/with'].includes(match[1])) {
      placeholders.add(match[1]);
    }
  }

  // Match block helpers: {{#each directors}}
  const blockRegex = /\{\{#(each|with)\s+([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g;
  while ((match = blockRegex.exec(content)) !== null) {
    placeholders.add(match[2]);
  }

  return Array.from(placeholders);
}

// ============================================================================
// Validate Template Content
// ============================================================================

/**
 * Validates template content for syntax errors.
 * Returns an array of validation errors, empty if valid.
 */
export function validateTemplateContent(content: string): string[] {
  const errors: string[] = [];

  // Check for unclosed placeholders
  const openCount = (content.match(/\{\{/g) || []).length;
  const closeCount = (content.match(/\}\}/g) || []).length;
  if (openCount !== closeCount) {
    errors.push('Mismatched placeholder brackets: ensure all {{ have matching }}');
  }

  // Check for unclosed block helpers
  const eachOpens = (content.match(/\{\{#each\s/g) || []).length;
  const eachCloses = (content.match(/\{\{\/each\}\}/g) || []).length;
  if (eachOpens !== eachCloses) {
    errors.push(`Unclosed #each blocks: ${eachOpens} opens, ${eachCloses} closes`);
  }

  const ifOpens = (content.match(/\{\{#if\s/g) || []).length;
  const ifCloses = (content.match(/\{\{\/if\}\}/g) || []).length;
  if (ifOpens !== ifCloses) {
    errors.push(`Unclosed #if blocks: ${ifOpens} opens, ${ifCloses} closes`);
  }

  return errors;
}
