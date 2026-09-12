import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { saveDraftSchema } from '@/lib/validations/generated-document';
import { getGeneratedDocumentById } from '@/services/document-generator.service';
import {
  deleteEditorDrafts,
  getLatestEditorDraft,
  saveSequencedEditorDraft,
} from '@/services/document-draft-workflow.service';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseOptionalRevision(value: string | null): number | undefined {
  if (value === null) return undefined;
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error('throughLocalSnapshotRevision must be a non-negative integer');
  }
  return revision;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'read');
    const tenantId = requireSessionWorkspaceId(session);

    const document = await getGeneratedDocumentById(id, tenantId);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const draft = await getLatestEditorDraft(id, session.id, tenantId);
    if (!draft) {
      return NextResponse.json({ draft: null, revision: document.revision });
    }

    const revisionChanged = draft.baseRevision !== document.revision;
    const jsonChanged = stableJson(draft.contentJson) !== stableJson(document.contentJson);
    return NextResponse.json({
      draft: {
        content: draft.content,
        contentJson: draft.contentJson,
        savedAt: draft.savedAt,
        baseRevision: draft.baseRevision,
        sessionKey: draft.sessionKey,
        localSnapshotRevision: draft.localSnapshotRevision,
      },
      document: {
        content: document.content,
        contentJson: document.contentJson,
        updatedAt: document.updatedAt,
        revision: document.revision,
        status: document.status,
      },
      revision: document.revision,
      hasDifferentContent: revisionChanged || jsonChanged || draft.content !== document.content,
      recoveryState: revisionChanged ? 'server-revision-changed' : 'same-server-revision',
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'update');

    const body = await request.json();
    const data = saveDraftSchema.parse({ ...body, documentId: id });
    const tenantId = requireSessionWorkspaceId(session);
    const draft = await saveSequencedEditorDraft(data, {
      tenantId,
      userId: session.id,
    });

    return NextResponse.json({
      success: true,
      savedAt: draft.savedAt,
      baseRevision: draft.baseRevision,
      sessionKey: draft.sessionKey,
      localSnapshotRevision: draft.localSnapshotRevision,
      ignoredAsStale: draft.ignoredAsStale ?? false,
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'update');
    const tenantId = requireSessionWorkspaceId(session);

    const { searchParams } = new URL(request.url);
    const sessionKey = searchParams.get('sessionKey') ?? undefined;
    const throughLocalSnapshotRevision = parseOptionalRevision(
      searchParams.get('throughLocalSnapshotRevision'),
    );
    const deletedCount = await deleteEditorDrafts({
      documentId: id,
      userId: session.id,
      tenantId,
      sessionKey,
      throughLocalSnapshotRevision,
    });
    const document = await getGeneratedDocumentById(id, tenantId);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      revision: document.revision,
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}
