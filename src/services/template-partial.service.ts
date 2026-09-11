/**
 * Template Partial Service
 *
 * Business logic for reusable template partial (snippet) management.
 * Partials are template fragments that can be included in multiple templates
 * using the {{> partial-name}} syntax.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { createAuditLog, computeChanges } from '@/lib/audit';
import { Prisma } from '@/generated/prisma';
import type { TemplatePartial } from '@/generated/prisma';
import type { TenantAwareParams } from '@/lib/types';
import { PARTIAL_REFERENCE_REGEX, extractPartialReferences } from '@/lib/template-analysis';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import {
  assertRevisionPrecondition,
  classifyRevisionMiss,
} from '@/lib/document-editor/revision-concurrency';
import {
  assertA4WriterCanPreserve,
  readA4StoredDocument,
} from '@/lib/document-editor/a4-editor-format';
import {
  normalizeStoredFieldDefinitionInput,
  preserveStoredFieldDefinitions,
} from '@/lib/document-editor/template-field-workflow';

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

export type { TenantAwareParams } from '@/lib/types';

export interface CreatePartialInput {
  name: string;
  displayName: string;
  description?: string | null;
  content: string;
  placeholders?: Prisma.InputJsonValue;
}

export interface UpdatePartialInput {
  id: string;
  expectedRevision?: number;
  name?: string;
  displayName?: string;
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

export interface PartialServiceVariantUsageInfo {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PartialUsageResult {
  templates: PartialUsageInfo[];
  serviceVariants: PartialServiceVariantUsageInfo[];
}

const TRACKED_FIELDS: (keyof TemplatePartial)[] = [
  'name',
  'displayName',
  'description',
  'content',
  'placeholders',
];

export function normalizeMaterialContent(content: string): string {
  return content.replace(/\r\n/g, '\n').trim();
}

export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function preservePartialPlaceholders(value: unknown, partialId: string): Prisma.InputJsonValue {
  if (!Array.isArray(value)) return (value ?? []) as Prisma.InputJsonValue;
  const definitions = normalizeStoredFieldDefinitionInput(value);
  return preserveStoredFieldDefinitions(
    definitions,
    { kind: 'partial', id: partialId },
  ) as Prisma.InputJsonValue;
}

function assertReadablePartial<T extends { content: string }>(partial: T): T {
  readA4StoredDocument(partial.content);
  return partial;
}

async function classifyPartialRevisionMiss(
  tx: Prisma.TransactionClient,
  id: string,
  tenantId: string,
  expectedRevision: number | undefined,
): Promise<never> {
  const state = await tx.templatePartial.findFirst({
    where: { id, tenantId },
    select: { version: true, deletedAt: true },
  });
  classifyRevisionMiss(
    state
      ? { revision: state.version, deleted: state.deletedAt !== null, locked: false }
      : null,
    { resource: 'template-partial', expectedRevision },
  );
}

export async function createTemplatePartial(
  data: CreatePartialInput,
  params: TenantAwareParams,
): Promise<TemplatePartial> {
  const { tenantId, userId } = params;

  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(data.name)) {
    throw new Error(
      'Partial name must start with a letter and contain only letters, numbers, hyphens, and underscores',
    );
  }
  assertA4WriterCanPreserve(data.content);

  const existingName = await prisma.templatePartial.findFirst({
    where: { tenantId, name: data.name, deletedAt: null },
  });
  if (existingName) throw new Error('A partial with this name already exists');

  const id = randomUUID();
  const partial = await prisma.templatePartial.create({
    data: {
      id,
      tenantId,
      name: data.name,
      displayName: data.displayName,
      description: data.description ?? null,
      content: data.content,
      placeholders: preservePartialPlaceholders(data.placeholders, id),
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

export async function updateTemplatePartial(
  data: UpdatePartialInput,
  params: TenantAwareParams,
  reason?: string,
): Promise<TemplatePartial> {
  const { tenantId, userId } = params;
  assertRevisionPrecondition(data.expectedRevision, 'template-partial');

  if (data.name && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(data.name)) {
    throw new Error(
      'Partial name must start with a letter and contain only letters, numbers, hyphens, and underscores',
    );
  }

  return runSerializableTransaction(prisma, async (tx) => {
    const existing = await tx.templatePartial.findFirst({
      where: { id: data.id, tenantId, deletedAt: null },
    });
    if (!existing) throw new Error('Partial not found');

    if (data.content !== undefined) assertA4WriterCanPreserve(data.content);

    if (data.name && data.name !== existing.name) {
      const existingName = await tx.templatePartial.findFirst({
        where: {
          tenantId,
          name: data.name,
          deletedAt: null,
          NOT: { id: data.id },
        },
      });
      if (existingName) throw new Error('A partial with this name already exists');
    }

    const updateData: Prisma.TemplatePartialUpdateManyMutationInput = {
      version: { increment: 1 },
    };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.placeholders !== undefined) {
      updateData.placeholders = preservePartialPlaceholders(data.placeholders, data.id);
    }

    const contentChanged =
      data.content !== undefined
      && normalizeMaterialContent(data.content) !== normalizeMaterialContent(existing.content);
    const placeholdersChanged =
      data.placeholders !== undefined
      && stableSerialize(updateData.placeholders) !== stableSerialize(existing.placeholders);
    const materialChanged = contentChanged || placeholdersChanged;

    const result = await tx.templatePartial.updateMany({
      where: {
        id: data.id,
        tenantId,
        deletedAt: null,
        ...(data.expectedRevision !== undefined ? { version: data.expectedRevision } : {}),
      },
      data: updateData,
    });
    if (result.count !== 1) {
      return classifyPartialRevisionMiss(tx, data.id, tenantId, data.expectedRevision);
    }

    const partial = await tx.templatePartial.findFirstOrThrow({
      where: { id: data.id, tenantId },
    });
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
        metadata: {
          oldVersion: existing.version,
          newVersion: partial.version,
          materialChanged,
        },
      }, tx);
    }

    return partial;
  });
}

export async function deleteTemplatePartial(
  partialId: string,
  params: TenantAwareParams,
  reason?: string,
  expectedRevision?: number,
): Promise<void> {
  const { tenantId, userId } = params;
  assertRevisionPrecondition(expectedRevision, 'template-partial');

  await runSerializableTransaction(prisma, async (tx) => {
    const partial = await tx.templatePartial.findFirst({
      where: { id: partialId, tenantId, deletedAt: null },
    });
    if (!partial) throw new Error('Partial not found');

    const usage = await getPartialUsageWithClient(partialId, params, tx, partial);
    if (usage.serviceVariants.length > 0) {
      const variantNames = usage.serviceVariants.slice(0, 3).map((variant) => variant.name).join(', ');
      const moreText = usage.serviceVariants.length > 3
        ? ` and ${usage.serviceVariants.length - 3} more`
        : '';
      throw new Error(
        `Cannot delete partial: relink or archive ${usage.serviceVariants.length} service variant(s) (${variantNames}${moreText}) first`,
      );
    }
    if (usage.templates.length > 0) {
      const templateNames = usage.templates.slice(0, 3).map((u) => u.templateName).join(', ');
      const moreText = usage.templates.length > 3 ? ` and ${usage.templates.length - 3} more` : '';
      throw new Error(
        `Cannot delete partial: it is used in ${usage.templates.length} template(s) (${templateNames}${moreText})`,
      );
    }

    const result = await tx.templatePartial.updateMany({
      where: {
        id: partialId,
        tenantId,
        deletedAt: null,
        ...(expectedRevision !== undefined ? { version: expectedRevision } : {}),
      },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count !== 1) {
      return classifyPartialRevisionMiss(tx, partialId, tenantId, expectedRevision);
    }

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
    }, tx);
  });
}

export async function getTemplatePartial(
  partialId: string,
  params: TenantAwareParams,
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
  assertReadablePartial(partial);
  const usageCount = await countPartialUsage(partialId, params);
  return { ...partial, _count: { usedInTemplates: usageCount } };
}

export async function getTemplatePartialByName(
  name: string,
  tenantId: string,
): Promise<TemplatePartial | null> {
  const partial = await prisma.templatePartial.findFirst({
    where: { name, tenantId, deletedAt: null },
  });
  return partial ? assertReadablePartial(partial) : null;
}

export async function searchTemplatePartials(
  input: SearchPartialsInput,
  params: TenantAwareParams,
): Promise<SearchPartialsResult> {
  const { tenantId } = params;
  const {
    search,
    page = 1,
    limit = 20,
    sortBy = 'name',
    sortOrder = 'asc',
  } = input;

  const where: Prisma.TemplatePartialWhereInput = { tenantId, deletedAt: null };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [partials, total] = await Promise.all([
    prisma.templatePartial.findMany({
      where,
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.templatePartial.count({ where }),
  ]);

  const partialsWithCounts = await Promise.all(
    partials.map(async (partial) => {
      assertReadablePartial(partial);
      const usageCount = await countPartialUsage(partial.id, params);
      return { ...partial, _count: { usedInTemplates: usageCount } };
    }),
  );

  return {
    partials: partialsWithCounts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getAllTemplatePartials(
  tenantId: string,
): Promise<Pick<TemplatePartial, 'id' | 'name' | 'displayName' | 'description' | 'content' | 'placeholders'>[]> {
  const partials = await prisma.templatePartial.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true, name: true, displayName: true, description: true, content: true, placeholders: true },
    orderBy: { name: 'asc' },
  });
  return partials.map(assertReadablePartial);
}

export async function getPartialUsage(
  partialId: string,
  params: TenantAwareParams,
): Promise<PartialUsageResult> {
  return getPartialUsageWithClient(partialId, params, prisma);
}

async function getPartialUsageWithClient(
  partialId: string,
  params: TenantAwareParams,
  client: Prisma.TransactionClient | typeof prisma,
  knownPartial?: TemplatePartial,
): Promise<PartialUsageResult> {
  const { tenantId } = params;

  const partial = knownPartial ?? await client.templatePartial.findFirst({
    where: { id: partialId, tenantId, deletedAt: null },
  });
  if (!partial) return { templates: [], serviceVariants: [] };

  const [templates, serviceVariants] = await Promise.all([
    client.documentTemplate.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, category: true, content: true },
    }),
    client.serviceVariant.findMany({
      where: { tenantId, sowPartialId: partialId, deletedAt: null },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    templates: templates
      .filter((template) => extractPartialReferences(template.content).includes(partial.name))
      .map((template) => ({
        templateId: template.id,
        templateName: template.name,
        category: template.category,
      })),
    serviceVariants,
  };
}

async function countPartialUsage(
  partialId: string,
  params: TenantAwareParams,
): Promise<number> {
  const usage = await getPartialUsage(partialId, params);
  return usage.templates.length;
}

export async function getPartialsUsedInTemplate(
  templateContent: string,
  tenantId: string,
): Promise<TemplatePartial[]> {
  const initialPartialNames = extractPartialReferences(templateContent);
  if (initialPartialNames.length === 0) return [];

  const allPartials = await prisma.templatePartial.findMany({
    where: { tenantId, deletedAt: null },
  });
  const partialByName = new Map(allPartials.map((partial) => [partial.name, partial]));
  const resolvedNames = new Set<string>();

  const visit = (partialName: string) => {
    if (resolvedNames.has(partialName)) return;
    resolvedNames.add(partialName);
    const partial = partialByName.get(partialName);
    if (!partial) return;
    readA4StoredDocument(partial.content);
    for (const nestedName of extractPartialReferences(partial.content)) visit(nestedName);
  };

  initialPartialNames.forEach(visit);
  return Array.from(resolvedNames)
    .map((partialName) => partialByName.get(partialName))
    .filter((partial): partial is TemplatePartial => Boolean(partial));
}

export async function resolvePartials(
  content: string,
  tenantId: string,
  resolvedPartials = new Set<string>(),
): Promise<string> {
  const matches = Array.from(content.matchAll(PARTIAL_REFERENCE_REGEX));
  if (matches.length === 0) return content;

  const partialNames = matches.map((m) => m[1]);
  const partials = await prisma.templatePartial.findMany({
    where: { tenantId, name: { in: partialNames }, deletedAt: null },
  });
  const partialMap = new Map(partials.map((p) => [p.name, p.content]));

  let resolved = content;
  for (const match of matches) {
    const partialName = match[1];
    const fullMatch = match[0];
    if (resolvedPartials.has(partialName)) {
      throw new Error(`Circular partial reference detected: ${partialName}`);
    }

    const partialContent = partialMap.get(partialName);
    if (partialContent) {
      readA4StoredDocument(partialContent);
      resolvedPartials.add(partialName);
      const resolvedPartialContent = await resolvePartials(
        partialContent,
        tenantId,
        resolvedPartials,
      );
      resolved = resolved.replace(fullMatch, resolvedPartialContent);
    } else {
      throw new Error(`Template partial not found: ${partialName}`);
    }
  }

  return resolved;
}

export async function duplicateTemplatePartial(
  partialId: string,
  newName: string,
  params: TenantAwareParams,
): Promise<TemplatePartial> {
  const { tenantId, userId } = params;

  const source = await prisma.templatePartial.findFirst({
    where: { id: partialId, tenantId, deletedAt: null },
  });
  if (!source) throw new Error('Partial not found');
  assertA4WriterCanPreserve(source.content);

  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(newName)) {
    throw new Error(
      'Partial name must start with a letter and contain only letters, numbers, hyphens, and underscores',
    );
  }

  const existingName = await prisma.templatePartial.findFirst({
    where: { tenantId, name: newName, deletedAt: null },
  });
  if (existingName) throw new Error('A partial with this name already exists');

  const id = randomUUID();
  const partial = await prisma.templatePartial.create({
    data: {
      id,
      tenantId,
      name: newName,
      displayName: source.displayName
        ? `Copy of ${source.displayName}`
        : `Copy of ${source.name}`,
      description: source.description
        ? `Copy of: ${source.description}`
        : `Copy of ${source.name}`,
      content: source.content,
      placeholders: preservePartialPlaceholders(source.placeholders, id),
      createdById: userId,
      version: 1,
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
