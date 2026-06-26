import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { finalizeDocument, unfinalizeDocument } from '@/services/document-generator.service';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/generated-documents/[id]/finalize
 * Finalize a document
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check update permission
    await requirePermission(session, 'document', 'update');

    await request.json().catch(() => ({}));
    const tenantId = requireSessionWorkspaceId(session);

    const document = await finalizeDocument(id, { tenantId, userId: session.id });

    return NextResponse.json(document);
  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * DELETE /api/generated-documents/[id]/finalize
 * Unfinalize a document (return to draft)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check update permission
    await requirePermission(session, 'document', 'update');

    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason');

    if (!reason) {
      return NextResponse.json(
        { error: 'Reason is required for un-finalizing' },
        { status: 400 }
      );
    }

    const tenantId = requireSessionWorkspaceId(session);

    const document = await unfinalizeDocument(id, { tenantId, userId: session.id }, reason);

    return NextResponse.json(document);
  } catch (error) {
    return createErrorResponse(error);
  }
}
