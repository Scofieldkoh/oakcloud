import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { updateTemplatePartialSchema } from '@/lib/validations/template-partial';
import {
  getTemplatePartial,
  updateTemplatePartial,
  deleteTemplatePartial,
  getPartialUsage,
} from '@/services/template-partial.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ============================================================================
// GET /api/template-partials/[id]
// Get a single template partial
// ============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);

    // For SUPER_ADMIN, allow specifying tenantId via query param
    const tenantIdParam = searchParams.get('tenantId');
    const effectiveTenantId =
      session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const { id } = await params;

    const partial = await getTemplatePartial(id, {
      tenantId: effectiveTenantId,
      userId: session.id,
    });

    if (!partial) {
      return NextResponse.json({ error: 'Partial not found' }, { status: 404 });
    }

    // Check if usage info is requested
    if (searchParams.get('includeUsage') === 'true') {
      const usage = await getPartialUsage(id, {
        tenantId: effectiveTenantId,
        userId: session.id,
      });
      return NextResponse.json({ ...partial, usage });
    }

    return NextResponse.json(partial);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    console.error('Get template partial error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// PATCH /api/template-partials/[id]
// Update a template partial
// ============================================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'update');

    const { id } = await params;
    const body = await request.json();
    const { tenantId: bodyTenantId, reason, ...partialData } = body;

    // For SUPER_ADMIN, allow specifying tenantId in body
    const effectiveTenantId =
      session.isSuperAdmin && bodyTenantId ? bodyTenantId : session.tenantId;

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const input = updateTemplatePartialSchema.parse({ ...partialData, id });

    const partial = await updateTemplatePartial(
      input,
      { tenantId: effectiveTenantId, userId: session.id },
      reason
    );

    return NextResponse.json(partial);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Partial not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message === 'A partial with this name already exists') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.includes('must start with a letter')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Update template partial error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// DELETE /api/template-partials/[id]
// Delete a template partial
// ============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'delete');

    const { searchParams } = new URL(request.url);

    // For SUPER_ADMIN, allow specifying tenantId via query param
    const tenantIdParam = searchParams.get('tenantId');
    const effectiveTenantId =
      session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const { id } = await params;
    const reason = searchParams.get('reason') || undefined;

    await deleteTemplatePartial(
      id,
      { tenantId: effectiveTenantId, userId: session.id },
      reason
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Partial not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message.startsWith('Cannot delete partial')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
    }
    console.error('Delete template partial error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
