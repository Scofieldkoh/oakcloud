import { Prisma } from '@/generated/prisma';
import { assertA4WriterCanPreserve } from '@/lib/document-editor/a4-editor-format';
import { readGeneratedDocumentRevision } from '@/lib/document-editor/generated-document-revision';
import { VersionConflictError } from '@/lib/document-editor/revision-concurrency';
import { ApiError, ErrorCodes, NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import type { TenantAwareParams } from '@/lib/types';
import type { SaveDraftInput } from '@/lib/validations/generated-document';

const EDITOR_SESSION_KEY = 'editorSessionKey';
const WRITER_INSTANCE_ID = 'writerInstanceId';
const LOCAL_SNAPSHOT_REVISION = 'localSnapshotRevision';
const BASE_CANONICAL_REVISION = 'baseCanonicalRevision';

type DraftMetadata = Record<string, unknown>;

export interface EditorDraftSnapshot {
  id: string;
  content: string;
  contentJson: unknown | null;
  savedAt: Date;
  baseRevision: number;
  sessionKey: string | null;
  writerInstanceId: string | null;
  localSnapshotRevision: number | null;
  ignoredAsStale?: boolean;
}

function metadataRecord(value: unknown): DraftMetadata {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as DraftMetadata) }
    : {};
}

function metadataString(metadata: DraftMetadata, key: string): string | null {
  return typeof metadata[key] === 'string' && metadata[key]
    ? metadata[key] as string
    : null;
}

function metadataRevision(metadata: DraftMetadata, key: string): number | null {
  const value = metadata[key];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function toSnapshot(
  draft: {
    id: string;
    content: string;
    contentJson: unknown;
    metadata: unknown;
    createdAt: Date;
  },
  fallbackRevision: number,
): EditorDraftSnapshot {
  const metadata = metadataRecord(draft.metadata);
  return {
    id: draft.id,
    content: draft.content,
    contentJson: draft.contentJson ?? null,
    savedAt: draft.createdAt,
    baseRevision: metadataRevision(metadata, BASE_CANONICAL_REVISION) ?? fallbackRevision,
    sessionKey: metadataString(metadata, EDITOR_SESSION_KEY),
    writerInstanceId: metadataString(metadata, WRITER_INSTANCE_ID),
    localSnapshotRevision: metadataRevision(metadata, LOCAL_SNAPSHOT_REVISION),
  };
}

async function lockDocumentDraftLane(
  tx: Prisma.TransactionClient,
  tenantId: string,
  documentId: string,
): Promise<void> {
  const key = `${tenantId}:${documentId}`;
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
  `);
}

function assertDocumentEditable(status: string): void {
  if (status === 'DRAFT') return;
  throw new ApiError(
    ErrorCodes.CONFLICT,
    'This resource is not editable in its current state.',
    409,
    {
      resourceType: 'GeneratedDocument',
      action: 'reload-read-only',
    },
  );
}

export async function getLatestEditorDraft(
  documentId: string,
  userId: string,
  tenantId: string,
): Promise<EditorDraftSnapshot | null> {
  const document = await prisma.generatedDocument.findFirst({
    where: { id: documentId, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!document) throw new NotFoundError('Document not found');

  const [draft, revision] = await Promise.all([
    prisma.documentDraft.findFirst({
      where: { documentId, userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        contentJson: true,
        metadata: true,
        createdAt: true,
      },
    }),
    readGeneratedDocumentRevision(prisma, documentId, tenantId),
  ]);

  return draft ? toSnapshot(draft, revision) : null;
}

/**
 * Serializes draft replacement for one generated document and rejects stale
 * canonical bases. C1 local revisions are stored only as client
 * acknowledgement metadata; the W1 GeneratedDocument revision remains the
 * sole server concurrency authority. A writer instance scopes local revision
 * ordering so a fresh reload (whose C1 revision restarts) can supersede an old
 * tab/session draft without being misclassified as stale.
 */
export async function saveSequencedEditorDraft(
  data: SaveDraftInput,
  params: TenantAwareParams,
): Promise<EditorDraftSnapshot> {
  assertA4WriterCanPreserve(data.content, data.contentJson ?? null);

  return prisma.$transaction(async (tx) => {
    await lockDocumentDraftLane(tx, params.tenantId, data.documentId);

    const document = await tx.generatedDocument.findFirst({
      where: {
        id: data.documentId,
        tenantId: params.tenantId,
        deletedAt: null,
      },
      select: { status: true },
    });
    if (!document) throw new NotFoundError('Document not found');
    assertDocumentEditable(document.status);

    const canonicalRevision = await readGeneratedDocumentRevision(
      tx,
      data.documentId,
      params.tenantId,
    );
    if (data.baseRevision !== undefined && data.baseRevision !== canonicalRevision) {
      throw new VersionConflictError({
        resource: 'generated-document',
        expectedRevision: data.baseRevision,
        revision: canonicalRevision,
      });
    }

    const incomingMetadata = metadataRecord(data.metadata);
    const incomingSessionKey = metadataString(incomingMetadata, EDITOR_SESSION_KEY);
    const incomingWriterInstanceId = metadataString(incomingMetadata, WRITER_INSTANCE_ID);
    const incomingLocalRevision = metadataRevision(incomingMetadata, LOCAL_SNAPSHOT_REVISION);

    const existing = await tx.documentDraft.findFirst({
      where: { documentId: data.documentId, userId: params.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        content: true,
        contentJson: true,
        metadata: true,
        createdAt: true,
      },
    });

    if (
      existing
      && incomingSessionKey
      && incomingWriterInstanceId
      && incomingLocalRevision !== null
    ) {
      const existingMetadata = metadataRecord(existing.metadata);
      const existingSessionKey = metadataString(existingMetadata, EDITOR_SESSION_KEY);
      const existingWriterInstanceId = metadataString(existingMetadata, WRITER_INSTANCE_ID);
      const existingLocalRevision = metadataRevision(existingMetadata, LOCAL_SNAPSHOT_REVISION);
      const sameWriter = existingSessionKey === incomingSessionKey
        && existingWriterInstanceId === incomingWriterInstanceId;
      if (
        sameWriter
        && existingLocalRevision !== null
        && existingLocalRevision > incomingLocalRevision
      ) {
        return {
          ...toSnapshot(existing, canonicalRevision),
          ignoredAsStale: true,
        };
      }
      if (
        sameWriter
        && existingLocalRevision === incomingLocalRevision
        && existing.content === data.content
        && JSON.stringify(existing.contentJson ?? null) === JSON.stringify(data.contentJson ?? null)
      ) {
        return toSnapshot(existing, canonicalRevision);
      }
    }

    const metadata: DraftMetadata = {
      ...incomingMetadata,
      [BASE_CANONICAL_REVISION]: canonicalRevision,
    };

    await tx.documentDraft.deleteMany({
      where: { documentId: data.documentId, userId: params.userId },
    });
    const draft = await tx.documentDraft.create({
      data: {
        documentId: data.documentId,
        userId: params.userId,
        content: data.content,
        contentJson: data.contentJson === undefined
          ? Prisma.DbNull
          : data.contentJson as Prisma.InputJsonValue,
        metadata: metadata as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        content: true,
        contentJson: true,
        metadata: true,
        createdAt: true,
      },
    });

    return toSnapshot(draft, canonicalRevision);
  });
}

export async function deleteEditorDrafts(
  input: {
    documentId: string;
    userId: string;
    tenantId: string;
    sessionKey?: string;
    writerInstanceId?: string;
    throughLocalSnapshotRevision?: number;
  },
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await lockDocumentDraftLane(tx, input.tenantId, input.documentId);
    const document = await tx.generatedDocument.findFirst({
      where: { id: input.documentId, tenantId: input.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!document) throw new NotFoundError('Document not found');

    if (
      input.sessionKey === undefined
      || input.writerInstanceId === undefined
      || input.throughLocalSnapshotRevision === undefined
    ) {
      const result = await tx.documentDraft.deleteMany({
        where: { documentId: input.documentId, userId: input.userId },
      });
      return result.count;
    }

    const draft = await tx.documentDraft.findFirst({
      where: { documentId: input.documentId, userId: input.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, metadata: true },
    });
    if (!draft) return 0;

    const metadata = metadataRecord(draft.metadata);
    const draftSessionKey = metadataString(metadata, EDITOR_SESSION_KEY);
    const draftWriterInstanceId = metadataString(metadata, WRITER_INSTANCE_ID);
    const draftLocalRevision = metadataRevision(metadata, LOCAL_SNAPSHOT_REVISION);
    if (
      draftSessionKey !== input.sessionKey
      || draftWriterInstanceId !== input.writerInstanceId
      || draftLocalRevision === null
      || draftLocalRevision > input.throughLocalSnapshotRevision
    ) {
      return 0;
    }

    const result = await tx.documentDraft.deleteMany({
      where: { id: draft.id, documentId: input.documentId, userId: input.userId },
    });
    return result.count;
  });
}
