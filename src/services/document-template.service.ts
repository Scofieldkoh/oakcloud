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
import type { Prisma, DocumentTemplate, DocumentTemplateCategory } from '@prisma/client';
import type { TenantAwareParams } from '@/lib/types';

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
  'content',
  'isActive',
  'defaultShareExpiryHours',
];

// ============================================================================
// Create Template
// ============================================================================

export async function createDocumentTemplate(
  data: CreateDocumentTemplateInput,
  params: TenantAwareParams
): Promise<DocumentTemplate> {
  const { tenantId, userId } = params;

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
      content: data.content,
      contentJson: data.contentJson ?? undefined,
      placeholders: data.placeholders,
      isActive: data.isActive,
      defaultShareExpiryHours: data.defaultShareExpiryHours,
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
  if (data.content !== undefined) updateData.content = data.content;
  if (data.contentJson !== undefined) updateData.contentJson = data.contentJson;
  if (data.placeholders !== undefined) updateData.placeholders = data.placeholders;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.defaultShareExpiryHours !== undefined)
    updateData.defaultShareExpiryHours = data.defaultShareExpiryHours;

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
      content: existing.content,
      contentJson: existing.contentJson ?? undefined,
      placeholders: existing.placeholders ?? [],
      isActive: true,
      defaultShareExpiryHours: existing.defaultShareExpiryHours,
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
}> {
  const [total, active, byCategory, recentlyCreated, mostUsed] = await Promise.all([
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
  ]);

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
  };
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
