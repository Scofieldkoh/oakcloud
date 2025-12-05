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

    // For SUPER_ADMIN, allow specifying tenantId via query param
    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');
    const effectiveTenantId =
      session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const includeDeleted = searchParams.get('includeDeleted') === 'true' && session.isTenantAdmin;
    const includeShares = searchParams.get('includeShares') === 'true';
    const includeComments = searchParams.get('includeComments') === 'true';

    const document = await getGeneratedDocumentById(id, effectiveTenantId, {
      includeDeleted,
      includeShares,
      includeComments,
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json(document);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

    // Determine tenant ID
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && body.tenantId) {
      tenantId = body.tenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const document = await updateGeneratedDocument(data, { tenantId, userId: session.id }, body.reason);

    return NextResponse.json(document);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Document not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

    // Determine tenant ID
    const tenantIdParam = searchParams.get('tenantId');
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && tenantIdParam) {
      tenantId = tenantIdParam;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const document = await deleteGeneratedDocument(id, { tenantId, userId: session.id }, reason);

    return NextResponse.json(document);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Document not found' || error.message === 'Document is already deleted') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

    // Determine tenant ID
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && body.tenantId) {
      tenantId = body.tenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const document = await archiveDocument(id, { tenantId, userId: session.id }, body.reason);

    return NextResponse.json(document);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Document not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
