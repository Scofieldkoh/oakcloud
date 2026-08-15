import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { bulkDeleteGeneratedDocuments } from '@/services/document-generator.service';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';

const MAX_BULK_DELETE_DOCUMENTS = 200;

/**
 * POST /api/generated-documents/bulk-delete
 * Soft-delete multiple generated documents in a single request.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    await requirePermission(session, 'document', 'delete');

    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    const reason = typeof body?.reason === 'string' ? body.reason : '';

    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    if (!reason) {
      return NextResponse.json(
        { error: 'Reason is required for deletion' },
        { status: 400 }
      );
    }

    if (ids.length > MAX_BULK_DELETE_DOCUMENTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BULK_DELETE_DOCUMENTS} documents per bulk delete` },
        { status: 400 }
      );
    }

    const tenantId = requireSessionWorkspaceId(session);
    const result = await bulkDeleteGeneratedDocuments(
      ids,
      { tenantId, userId: session.id },
      reason,
    );

    return NextResponse.json({
      deleted: result.deleted,
      failed: result.failed,
      message:
        result.failed.length > 0
          ? `Deleted ${result.deleted} of ${ids.length} documents`
          : `Deleted ${result.deleted} documents`,
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}
