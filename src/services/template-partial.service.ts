/**
 * Template Partial Service
 *
 * Business logic for reusable template partial (snippet) management.
 * Partials are template fragments that can be included in multiple templates
 * using the {{> partial-name}} syntax.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog, computeChanges } from '@/lib/audit';
import type { Prisma, TemplatePartial } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface TemplatePartialWithRelations extends TemplatePartial {
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  _count?: {
    usedInTemplates: number;
  };
}

export interface TenantAwareParams {
  tenantId: string;
  userId: string;
}

export interface CreatePartialInput {
  name: string;
  description?: string | null;
  content: string;
  placeholders?: Prisma.InputJsonValue;
}

export interface UpdatePartialInput {
  id: string;
  name?: string;
  description?: string | null;
  content?: string;
  placeholders?: Prisma.InputJsonValue;
}

export interface SearchPartialsInput {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchPartialsResult {
  partials: TemplatePartialWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PartialUsageInfo {
  templateId: string;
  templateName: string;
  category: string;
}

// Fields tracked for audit logging
const TRACKED_FIELDS: (keyof TemplatePartial)[] = [
  'name',
  'description',
  'content',
];

// Regex to find partial references in template content
const PARTIAL_REFERENCE_REGEX = /\{\{>\s*([a-zA-Z0-9_-]+)\s*\}\}/g;

// ============================================================================
// Create Partial
// ============================================================================

export async function createTemplatePartial(
  data: CreatePartialInput,
  params: TenantAwareParams
): Promise<TemplatePartial> {
  const { tenantId, userId } = params;

  // Validate partial name format (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(data.name)) {
    throw new Error(
      'Partial name must start with a letter and contain only letters, numbers, hyphens, and underscores'
    );
  }

  // Check for duplicate name within tenant
  const existingName = await prisma.templatePartial.findFirst({
    where: { tenantId, name: data.name, deletedAt: null },
  });

  if (existingName) {
    throw new Error('A partial with this name already exists');
  }

  const partial = await prisma.templatePartial.create({
    data: {
      tenantId,
      name: data.name,
      description: data.description ?? null,
      content: data.content,
      placeholders: data.placeholders ?? [],
      createdById: userId,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'CREATE',
    entityType: 'TemplatePartial',
    entityId: partial.id,
    entityName: partial.name,
    summary: `Created template partial "${partial.name}"`,
    changeSource: 'MANUAL',
    metadata: { name: partial.name },
  });

  return partial;
}

// ============================================================================
// Update Partial
// ============================================================================

export async function updateTemplatePartial(
  data: UpdatePartialInput,
  params: TenantAwareParams,
  reason?: string
): Promise<TemplatePartial> {
  const { tenantId, userId } = params;

  const existing = await prisma.templatePartial.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Partial not found');
  }

  // Validate name format if being changed
  if (data.name && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(data.name)) {
    throw new Error(
      'Partial name must start with a letter and contain only letters, numbers, hyphens, and underscores'
    );
  }

  // Check for duplicate name if being changed
  if (data.name && data.name !== existing.name) {
    const existingName = await prisma.templatePartial.findFirst({
      where: {
        tenantId,
        name: data.name,
        deletedAt: null,
        NOT: { id: data.id },
      },
    });

    if (existingName) {
      throw new Error('A partial with this name already exists');
    }
  }

  const updateData: Prisma.TemplatePartialUpdateInput = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.placeholders !== undefined) updateData.placeholders = data.placeholders;

  const partial = await prisma.templatePartial.update({
    where: { id: data.id },
    data: updateData,
  });

  // Compute changes for audit log
  const changes = computeChanges(existing, partial, TRACKED_FIELDS) ?? {};
  const changedFields = Object.keys(changes);

  if (changedFields.length > 0) {
    await createAuditLog({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'TemplatePartial',
      entityId: partial.id,
      entityName: partial.name,
      summary: `Updated template partial "${partial.name}" (${changedFields.join(', ')})`,
      changeSource: 'MANUAL',
      changes,
      reason,
    });
  }

  return partial;
}

// ============================================================================
// Delete Partial
// ============================================================================

export async function deleteTemplatePartial(
  partialId: string,
  params: TenantAwareParams,
  reason?: string
): Promise<void> {
  const { tenantId, userId } = params;

  const partial = await prisma.templatePartial.findFirst({
    where: { id: partialId, tenantId, deletedAt: null },
  });

  if (!partial) {
    throw new Error('Partial not found');
  }

  // Check if partial is used in any templates
  const usage = await getPartialUsage(partialId, params);
  if (usage.length > 0) {
    const templateNames = usage.slice(0, 3).map((u) => u.templateName).join(', ');
    const moreText = usage.length > 3 ? ` and ${usage.length - 3} more` : '';
    throw new Error(
      `Cannot delete partial: it is used in ${usage.length} template(s) (${templateNames}${moreText})`
    );
  }

  await prisma.templatePartial.update({
    where: { id: partialId },
    data: { deletedAt: new Date() },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'DELETE',
    entityType: 'TemplatePartial',
    entityId: partial.id,
    entityName: partial.name,
    summary: `Deleted template partial "${partial.name}"`,
    changeSource: 'MANUAL',
    reason,
  });
}

// ============================================================================
// Get Single Partial
// ============================================================================

export async function getTemplatePartial(
  partialId: string,
  params: TenantAwareParams
): Promise<TemplatePartialWithRelations | null> {
  const { tenantId } = params;

  const partial = await prisma.templatePartial.findFirst({
    where: { id: partialId, tenantId, deletedAt: null },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  if (!partial) return null;

  // Count usage in templates
  const usageCount = await countPartialUsage(partialId, params);

  return {
    ...partial,
    _count: { usedInTemplates: usageCount },
  };
}

// ============================================================================
// Get Partial by Name
// ============================================================================

export async function getTemplatePartialByName(
  name: string,
  tenantId: string
): Promise<TemplatePartial | null> {
  return prisma.templatePartial.findFirst({
    where: { name, tenantId, deletedAt: null },
  });
}

// ============================================================================
// Search/List Partials
// ============================================================================

export async function searchTemplatePartials(
  input: SearchPartialsInput,
  params: TenantAwareParams
): Promise<SearchPartialsResult> {
  const { tenantId } = params;
  const {
    search,
    page = 1,
    limit = 20,
    sortBy = 'name',
    sortOrder = 'asc',
  } = input;

  const where: Prisma.TemplatePartialWhereInput = {
    tenantId,
    deletedAt: null,
  };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [partials, total] = await Promise.all([
    prisma.templatePartial.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.templatePartial.count({ where }),
  ]);

  // Add usage counts
  const partialsWithCounts = await Promise.all(
    partials.map(async (partial) => {
      const usageCount = await countPartialUsage(partial.id, params);
      return {
        ...partial,
        _count: { usedInTemplates: usageCount },
      };
    })
  );

  return {
    partials: partialsWithCounts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ============================================================================
// Get All Partials (for dropdown selection)
// ============================================================================

export async function getAllTemplatePartials(
  tenantId: string
): Promise<Pick<TemplatePartial, 'id' | 'name' | 'description'>[]> {
  return prisma.templatePartial.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, description: true },
    orderBy: { name: 'asc' },
  });
}

// ============================================================================
// Usage Tracking
// ============================================================================

/**
 * Get list of templates that use a specific partial
 */
export async function getPartialUsage(
  partialId: string,
  params: TenantAwareParams
): Promise<PartialUsageInfo[]> {
  const { tenantId } = params;

  // Get the partial to find its name
  const partial = await prisma.templatePartial.findFirst({
    where: { id: partialId, tenantId, deletedAt: null },
  });

  if (!partial) return [];

  // Search for templates using this partial
  const partialPattern = `{{> ${partial.name}}}`;
  const partialPatternAlt = `{{>${partial.name}}}`;

  const templates = await prisma.documentTemplate.findMany({
    where: {
      tenantId,
      deletedAt: null,
      OR: [
        { content: { contains: partialPattern } },
        { content: { contains: partialPatternAlt } },
      ],
    },
    select: { id: true, name: true, category: true },
  });

  return templates.map((t) => ({
    templateId: t.id,
    templateName: t.name,
    category: t.category,
  }));
}

/**
 * Count how many templates use a specific partial
 */
async function countPartialUsage(
  partialId: string,
  params: TenantAwareParams
): Promise<number> {
  const usage = await getPartialUsage(partialId, params);
  return usage.length;
}

/**
 * Get all partials used in a template's content
 */
export async function getPartialsUsedInTemplate(
  templateContent: string,
  tenantId: string
): Promise<TemplatePartial[]> {
  const matches = templateContent.matchAll(PARTIAL_REFERENCE_REGEX);
  const partialNames = new Set<string>();

  for (const match of matches) {
    partialNames.add(match[1]);
  }

  if (partialNames.size === 0) return [];

  return prisma.templatePartial.findMany({
    where: {
      tenantId,
      name: { in: Array.from(partialNames) },
      deletedAt: null,
    },
  });
}

/**
 * Resolve all partial references in template content
 * Replaces {{> partial-name}} with actual partial content
 */
export async function resolvePartials(
  content: string,
  tenantId: string,
  resolvedPartials = new Set<string>()
): Promise<string> {
  // Find all partial references
  const matches = Array.from(content.matchAll(PARTIAL_REFERENCE_REGEX));

  if (matches.length === 0) return content;

  // Get all referenced partials
  const partialNames = matches.map((m) => m[1]);
  const partials = await prisma.templatePartial.findMany({
    where: {
      tenantId,
      name: { in: partialNames },
      deletedAt: null,
    },
  });

  const partialMap = new Map(partials.map((p) => [p.name, p.content]));

  // Replace each partial reference with its content
  let resolved = content;
  for (const match of matches) {
    const partialName = match[1];
    const fullMatch = match[0];

    // Check for circular reference
    if (resolvedPartials.has(partialName)) {
      throw new Error(`Circular partial reference detected: ${partialName}`);
    }

    const partialContent = partialMap.get(partialName);
    if (partialContent) {
      // Mark as resolved to detect circular references
      resolvedPartials.add(partialName);

      // Recursively resolve nested partials
      const resolvedPartialContent = await resolvePartials(
        partialContent,
        tenantId,
        resolvedPartials
      );

      resolved = resolved.replace(fullMatch, resolvedPartialContent);
    } else {
      // Partial not found - leave placeholder or throw error
      throw new Error(`Template partial not found: ${partialName}`);
    }
  }

  return resolved;
}

// ============================================================================
// Duplicate Partial
// ============================================================================

export async function duplicateTemplatePartial(
  partialId: string,
  newName: string,
  params: TenantAwareParams
): Promise<TemplatePartial> {
  const { tenantId, userId } = params;

  const source = await prisma.templatePartial.findFirst({
    where: { id: partialId, tenantId, deletedAt: null },
  });

  if (!source) {
    throw new Error('Partial not found');
  }

  // Validate new name format
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(newName)) {
    throw new Error(
      'Partial name must start with a letter and contain only letters, numbers, hyphens, and underscores'
    );
  }

  // Check for duplicate name
  const existingName = await prisma.templatePartial.findFirst({
    where: { tenantId, name: newName, deletedAt: null },
  });

  if (existingName) {
    throw new Error('A partial with this name already exists');
  }

  const partial = await prisma.templatePartial.create({
    data: {
      tenantId,
      name: newName,
      description: source.description
        ? `Copy of: ${source.description}`
        : `Copy of ${source.name}`,
      content: source.content,
      placeholders: source.placeholders ?? [],
      createdById: userId,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'CREATE',
    entityType: 'TemplatePartial',
    entityId: partial.id,
    entityName: partial.name,
    summary: `Duplicated template partial "${source.name}" as "${partial.name}"`,
    changeSource: 'MANUAL',
    metadata: { sourceId: source.id, sourceName: source.name },
  });

  return partial;
}
