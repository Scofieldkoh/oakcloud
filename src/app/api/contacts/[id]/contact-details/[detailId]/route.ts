import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import {
  getContactDetailById,
  updateContactDetail,
  deleteContactDetail,
} from '@/services/contact-detail.service';

/**
 * GET /api/contacts/[id]/contact-details/[detailId]
 * Get a specific contact detail
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; detailId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id, detailId } = await params;

    // Get tenantId from query params (for super admin) or session
    const searchParams = request.nextUrl.searchParams;
    const tenantId = session.isSuperAdmin
      ? searchParams.get('tenantId') || session.tenantId
      : session.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Check permission
    const canView = await hasPermission(session.id, 'contact', 'read', id);
    if (!canView) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const detail = await getContactDetailById(detailId, tenantId);
    if (!detail || detail.contactId !== id) {
      return NextResponse.json({ error: 'Contact detail not found' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error('Error fetching contact detail:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch contact detail' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/contacts/[id]/contact-details/[detailId]
 * Update a contact detail
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; detailId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id, detailId } = await params;
    const body = await request.json();

    // Get tenantId from body (for super admin) or session
    const tenantId = session.isSuperAdmin
      ? body.tenantId || session.tenantId
      : session.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Check permission
    const canUpdate = await hasPermission(session.id, 'contact', 'update', id);
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify the detail belongs to this contact
    const existing = await getContactDetailById(detailId, tenantId);
    if (!existing || existing.contactId !== id) {
      return NextResponse.json({ error: 'Contact detail not found' }, { status: 404 });
    }

    const { detailType, value, label, purposes, description, displayOrder, isPrimary } = body;

    const detail = await updateContactDetail(
      {
        id: detailId,
        detailType,
        value,
        label,
        purposes,
        description,
        displayOrder,
        isPrimary,
      },
      { tenantId, userId: session.id }
    );

    return NextResponse.json(detail);
  } catch (error) {
    console.error('Error updating contact detail:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update contact detail' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/contacts/[id]/contact-details/[detailId]
 * Delete a contact detail
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; detailId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id, detailId } = await params;

    // Get tenantId from query params (for super admin) or session
    const searchParams = request.nextUrl.searchParams;
    const tenantId = session.isSuperAdmin
      ? searchParams.get('tenantId') || session.tenantId
      : session.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Check permission
    const canUpdate = await hasPermission(session.id, 'contact', 'update', id);
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify the detail belongs to this contact
    const existing = await getContactDetailById(detailId, tenantId);
    if (!existing || existing.contactId !== id) {
      return NextResponse.json({ error: 'Contact detail not found' }, { status: 404 });
    }

    await deleteContactDetail(detailId, { tenantId, userId: session.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact detail:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete contact detail' },
      { status: 500 }
    );
  }
}
