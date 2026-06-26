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

/**
 * GET /api/generated-documents/[id]/draft
 * Get the latest draft for a document
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check read permission
    await requirePermission(session, 'document', 'read');

    const tenantId = requireSessionWorkspaceId(session);

    // Verify document exists and belongs to the current workspace.
    const document = await getGeneratedDocumentById(id, tenantId);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Get the latest draft for this user
    const draft = await getLatestDraft(id, session.id);

    if (!draft) {
      return NextResponse.json({ draft: null });
    }

    return NextResponse.json({
      draft: {
        content: draft.content,
        contentJson: draft.contentJson,
        savedAt: draft.createdAt,
      },
      document: {
        content: document.content,
        contentJson: document.contentJson,
        updatedAt: document.updatedAt,
      },
      hasDifferentContent: draft.content !== document.content,
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * POST /api/generated-documents/[id]/draft
 * Save a draft (auto-save)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check update permission
    await requirePermission(session, 'document', 'update');

    const body = await request.json();
    const data = saveDraftSchema.parse({ ...body, documentId: id });

    const tenantId = requireSessionWorkspaceId(session);

    await saveDraft(data, { tenantId, userId: session.id });

    return NextResponse.json({ success: true, savedAt: new Date().toISOString() });
  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * DELETE /api/generated-documents/[id]/draft
 * Discard the current draft
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check update permission
    await requirePermission(session, 'document', 'update');

    const tenantId = requireSessionWorkspaceId(session);

    // Verify document exists
    const document = await getGeneratedDocumentById(id, tenantId);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Import prisma to delete draft
    const { prisma } = await import('@/lib/prisma');
    await prisma.documentDraft.deleteMany({
      where: { documentId: id, userId: session.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return createErrorResponse(error);
  }
}
