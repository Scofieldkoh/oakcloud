import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { updateGeneratedDocumentSchema } from '@/lib/validations/generated-document';
import {
  getGeneratedDocumentById,
  updateGeneratedDocument,
  deleteGeneratedDocument,
  archiveDocument,
} from '@/services/document-generator.service';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/generated-documents/[id]
 * Get a specific generated document
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check read permission
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);
    const tenantId = requireSessionWorkspaceId(session);

    const includeDeleted = searchParams.get('includeDeleted') === 'true' && session.isWorkspaceAdmin;
    const includeShares = searchParams.get('includeShares') === 'true';
    const includeComments = searchParams.get('includeComments') === 'true';

    const document = await getGeneratedDocumentById(id, tenantId, {
      includeDeleted,
      includeShares,
      includeComments,
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json(document);
  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * PUT /api/generated-documents/[id]
 * Update a generated document
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check update permission
    await requirePermission(session, 'document', 'update');

    const body = await request.json();
    const data = updateGeneratedDocumentSchema.parse({ ...body, id });

    const tenantId = requireSessionWorkspaceId(session);

    const document = await updateGeneratedDocument(data, { tenantId, userId: session.id }, body.reason);

    return NextResponse.json(document);
  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * DELETE /api/generated-documents/[id]
 * Delete (soft delete) a generated document
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check delete permission
    await requirePermission(session, 'document', 'delete');

    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason');

    if (!reason) {
      return NextResponse.json(
        { error: 'Reason is required for deletion' },
        { status: 400 }
      );
    }

    const tenantId = requireSessionWorkspaceId(session);

    const document = await deleteGeneratedDocument(id, { tenantId, userId: session.id }, reason);

    return NextResponse.json(document);
  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * PATCH /api/generated-documents/[id]
 * Archive a document
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check update permission
    await requirePermission(session, 'document', 'update');

    const body = await request.json();

    if (body.action !== 'archive') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (!body.reason) {
      return NextResponse.json(
        { error: 'Reason is required for archiving' },
        { status: 400 }
      );
    }

    const tenantId = requireSessionWorkspaceId(session);

    const document = await archiveDocument(id, { tenantId, userId: session.id }, body.reason);

    return NextResponse.json(document);
  } catch (error) {
    return createErrorResponse(error);
  }
}
