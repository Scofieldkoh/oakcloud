import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  getContactDetailById,
  updateContactDetail,
  deleteContactDetail,
} from '@/services/contact-detail.service';
import { updateContactDetailSchema } from '@/lib/validations/contact-detail';
import { ZodError } from 'zod';

type RouteParams = {
  params: Promise<{ id: string; detailId: string }>;
};

/**
 * GET /api/companies/[id]/contact-details/[detailId]
 * Get a specific contact detail
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, detailId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check read permission
    await requirePermission(session, 'company', 'read', companyId);

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const contactDetail = await getContactDetailById(detailId, tenantId);

    if (!contactDetail) {
      return NextResponse.json({ error: 'Contact detail not found' }, { status: 404 });
    }

    // Verify the detail belongs to this company (or has no company)
    if (contactDetail.companyId && contactDetail.companyId !== companyId) {
      return NextResponse.json({ error: 'Contact detail not found' }, { status: 404 });
    }

    return NextResponse.json(contactDetail);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    console.error('Error fetching contact detail:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/companies/[id]/contact-details/[detailId]
 * Update a contact detail
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, detailId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check update permission
    await requirePermission(session, 'company', 'update', companyId);

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Verify the contact detail exists and belongs to this company
    const existing = await getContactDetailById(detailId, tenantId);
    if (!existing) {
      return NextResponse.json({ error: 'Contact detail not found' }, { status: 404 });
    }

    // For company-level details, ensure it belongs to this company
    if (existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Contact detail not found' }, { status: 404 });
    }

    const body = await request.json();

    // Parse and validate input
    const data = updateContactDetailSchema.parse({
      ...body,
      id: detailId,
    });

    const contactDetail = await updateContactDetail(data, {
      tenantId,
      userId: session.id,
    });

    return NextResponse.json(contactDetail);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Contact detail not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Error updating contact detail:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/companies/[id]/contact-details/[detailId]
 * Delete a contact detail
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId, detailId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check update permission (deleting a detail requires update permission)
    await requirePermission(session, 'company', 'update', companyId);

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Verify the contact detail exists and belongs to this company
    const existing = await getContactDetailById(detailId, tenantId);
    if (!existing) {
      return NextResponse.json({ error: 'Contact detail not found' }, { status: 404 });
    }

    // For company-level details, ensure it belongs to this company
    if (existing.companyId && existing.companyId !== companyId) {
      return NextResponse.json({ error: 'Contact detail not found' }, { status: 404 });
    }

    await deleteContactDetail(detailId, {
      tenantId,
      userId: session.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Contact detail not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Error deleting contact detail:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
