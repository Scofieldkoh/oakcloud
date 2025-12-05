import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { updateDocumentTemplateSchema } from '@/lib/validations/document-template';
import {
  getDocumentTemplateById,
  updateDocumentTemplate,
  deleteDocumentTemplate,
  restoreDocumentTemplate,
} from '@/services/document-template.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/document-templates/[id]
 * Get a specific document template
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

    const template = await getDocumentTemplateById(id, effectiveTenantId, { includeDeleted });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json(template);
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
 * PUT /api/document-templates/[id]
 * Update a document template
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check update permission
    await requirePermission(session, 'document', 'update');

    const body = await request.json();
    const data = updateDocumentTemplateSchema.parse({ ...body, id });

    // Determine tenant ID
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && body.tenantId) {
      tenantId = body.tenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const template = await updateDocumentTemplate(data, { tenantId, userId: session.id }, body.reason);

    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Template not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/document-templates/[id]
 * Delete (soft delete) a document template
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

    const template = await deleteDocumentTemplate(id, { tenantId, userId: session.id }, reason);

    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Template not found' || error.message === 'Template is already deleted') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/document-templates/[id]
 * Restore a deleted document template
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check update permission
    await requirePermission(session, 'document', 'update');

    const body = await request.json();

    if (body.action !== 'restore') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Determine tenant ID
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && body.tenantId) {
      tenantId = body.tenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const template = await restoreDocumentTemplate(id, { tenantId, userId: session.id });

    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Template not found' || error.message === 'Template is not deleted') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
