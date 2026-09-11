import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { saveDraftSchema } from '@/lib/validations/generated-document';
import {
  saveDraft,
  getLatestDraft,
  getGeneratedDocumentById,
} from '@/services/document-generator.service';
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

    const draft = await getLatestDraft(id, session.id);
    if (!draft) {
      return NextResponse.json({ draft: null, revision: document.revision });
    }

    const revisionChanged = draft.baseRevision !== null && draft.baseRevision !== document.revision;
    const jsonChanged = stableJson(draft.contentJson) !== stableJson(document.contentJson);
    return NextResponse.json({
      draft: {
        content: draft.content,
        contentJson: draft.contentJson,
        savedAt: draft.createdAt,
        baseRevision: draft.baseRevision,
      },
      document: {
        content: document.content,
        contentJson: document.contentJson,
        updatedAt: document.updatedAt,
        revision: document.revision,
      },
      revision: document.revision,
      hasDifferentContent: revisionChanged || jsonChanged || draft.content !== document.content,
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

    await saveDraft(data, { tenantId, userId: session.id });
    const acknowledgedDraft = await getLatestDraft(id, session.id);

    return NextResponse.json({
      success: true,
      savedAt: acknowledgedDraft?.createdAt ?? new Date().toISOString(),
      baseRevision: acknowledgedDraft?.baseRevision ?? data.baseRevision ?? null,
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'update');
    const tenantId = requireSessionWorkspaceId(session);

    const document = await getGeneratedDocumentById(id, tenantId);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const { prisma } = await import('@/lib/prisma');
    await prisma.documentDraft.deleteMany({
      where: { documentId: id, userId: session.id },
    });

    return NextResponse.json({ success: true, revision: document.revision });
  } catch (error) {
    return createErrorResponse(error);
  }
}
