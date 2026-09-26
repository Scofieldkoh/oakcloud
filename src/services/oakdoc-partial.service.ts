import { createHash } from 'node:crypto';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { ValidationError } from '@/lib/errors';
import { storage, StorageKeys } from '@/lib/storage';
import { runSerializableTransaction } from '@/lib/prisma-transaction';
import { classifyRevisionMiss } from '@/lib/document-editor/revision-concurrency';
import { ensureA4ServerDomGlobals } from '@/lib/document-editor/a4-server-dom';
import { inspectOakDocPackage } from '@/lib/document-editor/oakdoc-package-policy';
import {
  OAKDOC_MIME_TYPE,
  readOakDocTemplateMetadata,
  type OakDocTemplateMetadata,
} from '@/lib/document-editor/oakdoc-template';
import {
  readOakDocPartialPins,
  type OakDocPartialPin,
} from '@/lib/document-editor/oakdoc-partials';
import {
  expandOakDocPartials,
  inspectOakDocPartialReferences,
  validateOakDocPartialPackage,
  type OakDocPartialExpansionResult,
} from '@/lib/document-editor/oakdoc-partials';
import { deriveOakDocTemplateFieldTags } from '@/lib/document-editor/oakdoc-field-manifest';
import type { OakDocDiagnostic } from '@/types/oakdoc';
import type { TenantAwareParams } from '@/lib/types';

export { readOakDocPartialPins, type OakDocPartialPin };

/**
 * C06 native partials: upload, pinning and expansion.
 *
 * A native partial is a `TemplatePartial` whose `contentJson.oakDoc` names a
 * content-addressed DOCX. Templates (and partials that nest other partials)
 * pin the exact version and hash they use in `contentJson.oakDocPartials`;
 * generation reads only pinned bytes, so later partial edits never change a
 * template until its pins are explicitly refreshed.
 */

export const OAKDOC_PARTIAL_CONTENT =
  '<p data-oakdoc-partial="true">Word-native partial. Open the Word document to edit its content.</p>';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function readOakDocPartialMetadata(contentJson: unknown): OakDocTemplateMetadata | null {
  return readOakDocTemplateMetadata(contentJson);
}

/**
 * Pin every partial the document references. References already pinned
 * keep their pin unless `refresh` names them; new references pin the
 * partial's current version. Missing, HTML-only or foreign partials fail.
 */
export async function pinOakDocPartials(input: {
  bytes: Uint8Array;
  tenantId: string;
  existingPins?: OakDocPartialPin[];
  refresh?: 'all' | string[];
  selfPartialId?: string;
}): Promise<OakDocPartialPin[]> {
  ensureA4ServerDomGlobals();
  const referenced = inspectOakDocPartialReferences(input.bytes);
  if (input.selfPartialId && referenced.includes(input.selfPartialId)) {
    throw new ValidationError('A partial cannot include itself', { reason: 'OAKDOC_PARTIAL_CYCLE' });
  }
  const existing = new Map((input.existingPins ?? []).map((pin) => [pin.partialId, pin]));
  const refresh = (id: string) => input.refresh === 'all' || (input.refresh ?? []).includes(id);
  const toLoad = referenced.filter((id) => !existing.has(id) || refresh(id));
  const rows = toLoad.length === 0
    ? []
    : await prisma.templatePartial.findMany({
        where: { id: { in: toLoad }, tenantId: input.tenantId, deletedAt: null },
        select: { id: true, version: true, contentJson: true },
      });
  const byId = new Map(rows.map((row) => [row.id, row]));

  const missing: string[] = [];
  const pins = referenced.map((partialId) => {
    if (!toLoad.includes(partialId)) return existing.get(partialId)!;
    const row = byId.get(partialId);
    const asset = row ? readOakDocPartialMetadata(row.contentJson) : null;
    if (!row || !asset) {
      missing.push(partialId);
      return null;
    }
    const nested = readOakDocPartialPins(row.contentJson);
    if (input.selfPartialId && pinTreeIncludes(nested, input.selfPartialId)) {
      throw new ValidationError('A partial cannot include itself', { reason: 'OAKDOC_PARTIAL_CYCLE' });
    }
    return {
      partialId,
      version: row.version,
      sha256: asset.sha256,
      storageKey: asset.storageKey,
      nested,
    };
  });
  if (missing.length > 0) {
    throw new ValidationError('The document uses partials that are missing or are not Word partials in this workspace', {
      reason: 'OAKDOC_PARTIAL_MISSING',
      partialIds: missing,
    });
  }
  return pins as OakDocPartialPin[];
}

function pinTreeIncludes(pins: OakDocPartialPin[], partialId: string): boolean {
  return pins.some((pin) => pin.partialId === partialId || pinTreeIncludes(pin.nested, partialId));
}

async function downloadPinnedPartial(pin: OakDocPartialPin, tenantId: string): Promise<Uint8Array> {
  if (!pin.storageKey.startsWith(`${tenantId}/template-partials/${pin.partialId}/oakdoc/`)) {
    throw new ValidationError('Partial storage scope is invalid', { reason: 'OAKDOC_PARTIAL_SCOPE_INVALID' });
  }
  const buffer = await storage.download(pin.storageKey);
  const bytes = new Uint8Array(buffer);
  if (sha256(bytes) !== pin.sha256) {
    throw new ValidationError('Partial asset integrity check failed', { reason: 'OAKDOC_PARTIAL_INTEGRITY' });
  }
  return bytes;
}

/**
 * Expand a document's partial references using only its pinned bytes.
 * When one partial is pinned at different versions in different branches,
 * the first pin found (top level first) is used and a warning is reported.
 */
export async function expandPinnedOakDocPartials(input: {
  bytes: Uint8Array;
  pins: OakDocPartialPin[];
  tenantId: string;
}): Promise<OakDocPartialExpansionResult> {
  // Every reference is pinned when the template is saved, so no pins means
  // nothing to insert. A stray reference stays unresolved and blocks
  // finalization like any other unresolved control.
  if (input.pins.length === 0) {
    return { bytes: input.bytes, diagnostics: [], expanded: [] };
  }
  const selected = new Map<string, OakDocPartialPin>();
  const diagnostics: OakDocDiagnostic[] = [];
  const queue = [...input.pins];
  while (queue.length > 0) {
    const pin = queue.shift()!;
    const chosen = selected.get(pin.partialId);
    if (chosen) {
      if (chosen.sha256 !== pin.sha256) {
        diagnostics.push({
          code: 'OAKDOC_PARTIAL_VERSION_CONFLICT',
          severity: 'warning',
          stage: 'render',
          message: 'A partial is pinned at different versions; the template\'s own pin is used everywhere.',
        });
      }
      continue;
    }
    selected.set(pin.partialId, pin);
    queue.push(...pin.nested);
  }

  const fragments = new Map<string, Uint8Array>();
  for (const pin of selected.values()) {
    fragments.set(pin.partialId, await downloadPinnedPartial(pin, input.tenantId));
  }
  ensureA4ServerDomGlobals();
  const result = expandOakDocPartials({ docxBytes: input.bytes, fragments });
  return { ...result, diagnostics: [...diagnostics, ...result.diagnostics] };
}

async function persistPartialAsset(input: {
  tenantId: string;
  partialId: string;
  userId: string;
  fileName: string;
  buffer: Buffer;
}): Promise<OakDocTemplateMetadata> {
  inspectOakDocPackage(input.buffer, 'master');
  ensureA4ServerDomGlobals();
  const bytes = new Uint8Array(input.buffer);
  const errors = validateOakDocPartialPackage(bytes).filter((entry) => entry.severity === 'error');
  if (errors.length > 0) {
    throw new ValidationError(errors[0].message, {
      reason: 'OAKDOC_PARTIAL_UNSUPPORTED',
      codes: errors.map((entry) => entry.code),
    });
  }
  const digest = sha256(bytes);
  const storageKey = StorageKeys.oakDocPartialAsset(input.tenantId, input.partialId, digest);
  await storage.upload(storageKey, input.buffer, {
    contentType: OAKDOC_MIME_TYPE,
    metadata: {
      tenantId: input.tenantId,
      templatePartialId: input.partialId,
      uploadedBy: input.userId,
      sha256: digest,
    },
  });
  const base = input.fileName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'partial.docx';
  return {
    schemaVersion: 1,
    storageKey,
    fileName: base.toLowerCase().endsWith('.docx') ? base : `${base}.docx`,
    fileSize: input.buffer.byteLength,
    sha256: digest,
    mimeType: OAKDOC_MIME_TYPE,
    fieldTags: deriveOakDocTemplateFieldTags(bytes),
  };
}

function partialContentJson(asset: OakDocTemplateMetadata, pins: OakDocPartialPin[]) {
  return { oakDoc: asset, oakDocPartials: pins } as unknown as Prisma.InputJsonValue;
}

/** Create a Word-native partial. */
export async function createOakDocPartial(
  input: {
    id: string;
    name: string;
    displayName?: string | null;
    description?: string | null;
    fileName: string;
    buffer: Buffer;
  },
  params: TenantAwareParams,
) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input.name)) {
    throw new ValidationError('Partial name must start with a letter and contain only letters, numbers, hyphens, and underscores');
  }
  const duplicate = await prisma.templatePartial.findFirst({
    where: { tenantId: params.tenantId, name: input.name, deletedAt: null },
    select: { id: true },
  });
  if (duplicate) throw new ValidationError('A partial with this name already exists');

  const pins = await pinOakDocPartials({
    bytes: new Uint8Array(input.buffer),
    tenantId: params.tenantId,
    selfPartialId: input.id,
  });
  const asset = await persistPartialAsset({ ...params, partialId: input.id, fileName: input.fileName, buffer: input.buffer });
  const partial = await prisma.templatePartial.create({
    data: {
      id: input.id,
      tenantId: params.tenantId,
      name: input.name,
      displayName: input.displayName ?? null,
      description: input.description ?? null,
      content: OAKDOC_PARTIAL_CONTENT,
      contentJson: partialContentJson(asset, pins),
      placeholders: [],
      createdById: params.userId,
    },
  });
  await createAuditLog({
    tenantId: params.tenantId,
    userId: params.userId,
    action: 'CREATE',
    entityType: 'TemplatePartial',
    entityId: partial.id,
    entityName: partial.name,
    summary: `Created Word partial "${partial.name}"`,
    changeSource: 'MANUAL',
    metadata: { documentEngine: 'OAKDOC', sha256: asset.sha256 },
  });
  return partial;
}

/**
 * Save new bytes for a native partial. The version increases and the old
 * asset stays in storage for templates that pinned it. Existing nested pins
 * are kept unless `refreshPins` asks for the latest versions.
 */
export async function updateOakDocPartial(
  input: {
    id: string;
    expectedRevision: number;
    fileName: string;
    buffer: Buffer;
    displayName?: string | null;
    description?: string | null;
    refreshPins?: 'all' | string[];
  },
  params: TenantAwareParams,
) {
  const existing = await prisma.templatePartial.findFirst({
    where: { id: input.id, tenantId: params.tenantId, deletedAt: null },
  });
  if (!existing) throw new ValidationError('Partial not found');
  if (!readOakDocPartialMetadata(existing.contentJson)) {
    throw new ValidationError('This partial is an HTML partial, not a Word partial');
  }
  const pins = await pinOakDocPartials({
    bytes: new Uint8Array(input.buffer),
    tenantId: params.tenantId,
    existingPins: readOakDocPartialPins(existing.contentJson),
    refresh: input.refreshPins,
    selfPartialId: input.id,
  });
  const asset = await persistPartialAsset({ ...params, partialId: input.id, fileName: input.fileName, buffer: input.buffer });

  return runSerializableTransaction(prisma, async (tx) => {
    const result = await tx.templatePartial.updateMany({
      where: { id: input.id, tenantId: params.tenantId, deletedAt: null, version: input.expectedRevision },
      data: {
        contentJson: partialContentJson(asset, pins),
        version: { increment: 1 },
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    if (result.count !== 1) {
      const state = await tx.templatePartial.findFirst({
        where: { id: input.id, tenantId: params.tenantId },
        select: { version: true, deletedAt: true },
      });
      classifyRevisionMiss(
        state ? { revision: state.version, deleted: state.deletedAt !== null, locked: false } : null,
        { resource: 'template-partial', expectedRevision: input.expectedRevision },
      );
    }
    const partial = await tx.templatePartial.findFirstOrThrow({ where: { id: input.id, tenantId: params.tenantId } });
    await createAuditLog({
      tenantId: params.tenantId,
      userId: params.userId,
      action: 'UPDATE',
      entityType: 'TemplatePartial',
      entityId: partial.id,
      entityName: partial.name,
      summary: `Updated Word partial "${partial.name}"`,
      changeSource: 'MANUAL',
      metadata: {
        documentEngine: 'OAKDOC',
        oldVersion: existing.version,
        newVersion: partial.version,
        sha256: asset.sha256,
      },
    }, tx);
    return partial;
  });
}

/** Download the current bytes of a native partial for editing. */
export async function downloadOakDocPartial(partialId: string, tenantId: string) {
  const partial = await prisma.templatePartial.findFirst({
    where: { id: partialId, tenantId, deletedAt: null },
    select: { id: true, version: true, contentJson: true },
  });
  const asset = partial ? readOakDocPartialMetadata(partial.contentJson) : null;
  if (!partial || !asset) throw new ValidationError('This partial is not a Word partial');
  const bytes = await downloadPinnedPartial({
    partialId: partial.id,
    version: partial.version,
    sha256: asset.sha256,
    storageKey: asset.storageKey,
    nested: [],
  }, tenantId);
  return { buffer: Buffer.from(bytes), metadata: asset, version: partial.version };
}
