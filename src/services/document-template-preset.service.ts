import { Prisma } from '@/generated/prisma';
import { createAuditLog } from '@/lib/audit';
import { isOakDocTemplate } from '@/lib/document-editor/oakdoc-template';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import { mapTemplateSummary } from '@/lib/document-generation-option-mappers';
import { prisma } from '@/lib/prisma';
import {
  createDocumentTemplatePresetSchema,
  updateDocumentTemplatePresetSchema,
  type CreateDocumentTemplatePresetInput,
  type UpdateDocumentTemplatePresetInput,
} from '@/lib/validations/document-template-preset';
import { resolveTemplateIdsForNewRun } from '@/services/oakdoc-migration.service';
import type {
  DocumentTemplatePresetDto,
  DocumentTemplatePresetItemDto,
  DocumentTemplatePresetUnavailableReason,
} from '@/types/document-template-preset';

/**
 * Workspace-shared, named, ordered sets of Word templates. A preset only fills
 * the Documents selection of a generation batch (see the batch template
 * picker); batch creation and generation never read presets. Every query is
 * filtered by the session workspace.
 */

export interface DocumentTemplatePresetParams {
  tenantId: string;
  userId: string;
}

const ENTITY_TYPE = 'DocumentTemplatePreset';
/** Generic on purpose: it must not reveal templates of other workspaces. */
const UNUSABLE_TEMPLATES_MESSAGE = 'One or more templates can’t be used in a preset';
const PRESET_NOT_FOUND = 'Template preset not found';

const presetInclude = {
  items: { orderBy: { displayOrder: 'asc' as const } },
} satisfies Prisma.DocumentTemplatePresetInclude;

type PresetWithItems = Prisma.DocumentTemplatePresetGetPayload<{ include: typeof presetInclude }>;
type Db = Prisma.TransactionClient;

export function normalizePresetName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Every member must be an active Word template of this workspace. */
async function assertUsableTemplates(db: Db, tenantId: string, templateIds: string[]) {
  const unique = [...new Set(templateIds)];
  const rows = await db.documentTemplate.findMany({
    where: { id: { in: unique }, tenantId, deletedAt: null, isActive: true },
    select: { id: true, contentJson: true },
  });
  const usable = new Set(rows.filter((row) => isOakDocTemplate(row.contentJson)).map((row) => row.id));
  if (unique.some((id) => !usable.has(id))) throw new BadRequestError(UNUSABLE_TEMPLATES_MESSAGE);
}

/**
 * Presets with each member's availability right now. A member that was
 * deleted, switched off or is still A4 is flagged, never dropped: the preset
 * stays as saved and the loader skips what is unavailable.
 */
async function toDtos(tenantId: string, presets: PresetWithItems[]): Promise<DocumentTemplatePresetDto[]> {
  const storedIds = [...new Set(presets.flatMap((preset) => preset.items.map((item) => item.templateId)))];
  const resolvedIds = await resolveTemplateIdsForNewRun(storedIds, tenantId);
  const resolvedByStored = new Map(storedIds.map((id, index) => [id, resolvedIds[index] ?? id]));
  const lookupIds = [...new Set([...storedIds, ...resolvedIds])];
  const templates = lookupIds.length === 0
    ? []
    : await prisma.documentTemplate.findMany({
      where: { id: { in: lookupIds }, tenantId },
      // Generation needs the current definition, including resolution defaults.
      // Do not depend on the picker's first page (which may not contain it).
    });
  const byId = new Map(templates.map((template) => [template.id, template]));

  const toItem = (templateId: string): DocumentTemplatePresetItemDto => {
    const resolvedTemplateId = resolvedByStored.get(templateId) ?? templateId;
    const target = byId.get(resolvedTemplateId);
    const templateName = target?.name ?? byId.get(templateId)?.name ?? 'Unknown template';
    let unavailableReason: DocumentTemplatePresetUnavailableReason | undefined;
    if (!target || target.deletedAt) unavailableReason = 'deleted';
    else if (!target.isActive) unavailableReason = 'inactive';
    else if (!isOakDocTemplate(target.contentJson)) unavailableReason = 'not-word';
    return unavailableReason
      ? { templateId, resolvedTemplateId, templateName, available: false, unavailableReason }
      : {
        templateId, resolvedTemplateId, templateName, available: true,
        template: mapTemplateSummary({
          ...target!,
          createdAt: target!.createdAt.toISOString(),
          updatedAt: target!.updatedAt.toISOString(),
        }),
      };
  };

  return presets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    createdAt: preset.createdAt.toISOString(),
    updatedAt: preset.updatedAt.toISOString(),
    items: preset.items.map((item) => toItem(item.templateId)),
  }));
}

export async function listDocumentTemplatePresets(
  params: Pick<DocumentTemplatePresetParams, 'tenantId'> & Partial<DocumentTemplatePresetParams>,
): Promise<DocumentTemplatePresetDto[]> {
  const presets = await prisma.documentTemplatePreset.findMany({
    where: { tenantId: params.tenantId },
    include: presetInclude,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return toDtos(params.tenantId, presets);
}

async function loadOne(tenantId: string, id: string): Promise<DocumentTemplatePresetDto> {
  const preset = await prisma.documentTemplatePreset.findFirst({
    where: { id, tenantId },
    include: presetInclude,
  });
  if (!preset) throw new NotFoundError(PRESET_NOT_FOUND);
  return (await toDtos(tenantId, [preset]))[0];
}

export async function createDocumentTemplatePreset(
  input: CreateDocumentTemplatePresetInput,
  params: DocumentTemplatePresetParams,
): Promise<DocumentTemplatePresetDto> {
  input = createDocumentTemplatePresetSchema.parse(input);
  const { tenantId, userId } = params;
  const name = input.name.trim();
  const normalizedName = normalizePresetName(name);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const clash = await tx.documentTemplatePreset.findFirst({
        where: { tenantId, normalizedName },
        select: { id: true },
      });
      if (clash) throw new ConflictError('A preset with this name already exists');
      await assertUsableTemplates(tx, tenantId, input.templateIds);

      const preset = await tx.documentTemplatePreset.create({
        data: {
          tenantId,
          name,
          normalizedName,
          createdById: userId,
          updatedById: userId,
          items: {
            create: input.templateIds.map((templateId, displayOrder) => ({ templateId, displayOrder })),
          },
        },
      });
      await createAuditLog({
        tenantId,
        userId,
        action: 'DOCUMENT_TEMPLATE_PRESET_CREATED',
        entityType: ENTITY_TYPE,
        entityId: preset.id,
        entityName: preset.name,
        summary: `Created document template preset "${preset.name}"`,
        changeSource: 'MANUAL',
        metadata: { itemCount: input.templateIds.length, templateIds: input.templateIds },
      }, tx);
      return preset;
    });
    return await loadOne(tenantId, created.id);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError('A preset with this name already exists');
    throw error;
  }
}

export async function updateDocumentTemplatePreset(
  id: string,
  input: UpdateDocumentTemplatePresetInput,
  params: DocumentTemplatePresetParams,
): Promise<DocumentTemplatePresetDto> {
  input = updateDocumentTemplatePresetSchema.parse(input);
  const { tenantId, userId } = params;

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.documentTemplatePreset.findFirst({
        where: { id, tenantId },
        include: presetInclude,
      });
      if (!current) throw new NotFoundError(PRESET_NOT_FOUND);

      const name = input.name?.trim();
      const normalizedName = name === undefined ? undefined : normalizePresetName(name);
      if (normalizedName !== undefined && normalizedName !== current.normalizedName) {
        const clash = await tx.documentTemplatePreset.findFirst({
          where: { tenantId, normalizedName, NOT: { id } },
          select: { id: true },
        });
        if (clash) throw new ConflictError('A preset with this name already exists');
      }
      if (input.templateIds) await assertUsableTemplates(tx, tenantId, input.templateIds);

      // The update itself carries the precondition, so two saves cannot both win.
      const updated = await tx.documentTemplatePreset.updateMany({
        where: {
          id,
          tenantId,
          ...(input.expectedUpdatedAt ? { updatedAt: new Date(input.expectedUpdatedAt) } : {}),
        },
        data: {
          updatedById: userId,
          ...(name === undefined ? {} : { name, normalizedName }),
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('This preset was changed by someone else. Reload it and try again.');
      }

      if (input.templateIds) {
        await tx.documentTemplatePresetItem.deleteMany({ where: { presetId: id } });
        await tx.documentTemplatePresetItem.createMany({
          data: input.templateIds.map((templateId, displayOrder) => ({ presetId: id, templateId, displayOrder })),
        });
      }

      const changes: Record<string, { old: unknown; new: unknown }> = {};
      if (name !== undefined && name !== current.name) changes.name = { old: current.name, new: name };
      if (input.templateIds) {
        changes.templateIds = { old: current.items.map((item) => item.templateId), new: input.templateIds };
      }
      await createAuditLog({
        tenantId,
        userId,
        action: 'DOCUMENT_TEMPLATE_PRESET_UPDATED',
        entityType: ENTITY_TYPE,
        entityId: id,
        entityName: name ?? current.name,
        summary: `Updated document template preset "${name ?? current.name}"`,
        changeSource: 'MANUAL',
        changes,
        metadata: { itemCount: input.templateIds?.length ?? current.items.length },
      }, tx);
    });
    return await loadOne(tenantId, id);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError('A preset with this name already exists');
    throw error;
  }
}

export async function deleteDocumentTemplatePreset(
  id: string,
  params: DocumentTemplatePresetParams,
): Promise<{ success: true }> {
  const { tenantId, userId } = params;
  await prisma.$transaction(async (tx) => {
    const current = await tx.documentTemplatePreset.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { items: true } } },
    });
    if (!current) throw new NotFoundError(PRESET_NOT_FOUND);

    // Items go with the preset (cascade); the templates themselves are untouched.
    const deleted = await tx.documentTemplatePreset.deleteMany({ where: { id, tenantId } });
    if (deleted.count === 0) throw new NotFoundError(PRESET_NOT_FOUND);
    await createAuditLog({
      tenantId,
      userId,
      action: 'DOCUMENT_TEMPLATE_PRESET_DELETED',
      entityType: ENTITY_TYPE,
      entityId: id,
      entityName: current.name,
      summary: `Deleted document template preset "${current.name}"`,
      changeSource: 'MANUAL',
      metadata: { itemCount: current._count.items },
    }, tx);
  });
  return { success: true };
}
