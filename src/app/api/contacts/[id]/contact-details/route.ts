import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import {
  getContactDetails,
  getContactDetailsGrouped,
  createContactDetail,
} from '@/services/contact-detail.service';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/contacts/[id]/contact-details
 * Get all contact details for a contact
 *
 * Query params:
 * - tenantId: (super admin only) specify tenant context
 * - grouped: if "true", returns details grouped by company (default vs company-specific)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

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

    // Check if grouped format is requested
    const grouped = searchParams.get('grouped') === 'true';

    if (grouped) {
      const groupedDetails = await getContactDetailsGrouped(id, tenantId);
      return NextResponse.json(groupedDetails);
    }

    const details = await getContactDetails(id, tenantId);
    return NextResponse.json(details);
  } catch (error) {
    console.error('Error fetching contact details:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch contact details' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/contacts/[id]/contact-details
 * Create a new contact detail for a contact
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
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

    // Validate contact exists and belongs to tenant
    const contact = await prisma.contact.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    const {
      detailType,
      value,
      label,
      purposes,
      description,
      displayOrder,
      isPrimary,
      // For company-specific details from standalone modal
      selectedCompanyId,
      isCompanySpecific,
    } = body;

    if (!detailType || !value) {
      return NextResponse.json(
        { error: 'Detail type and value are required' },
        { status: 400 }
      );
    }

    // Determine if this should be a company-specific detail
    // selectedCompanyId comes from standalone modal when user selects a company
    const companyId = selectedCompanyId || (isCompanySpecific ? body.companyId : undefined);

    // Validate company if companyId is provided
    if (companyId) {
      const company = await prisma.company.findFirst({
        where: { id: companyId, tenantId, deletedAt: null },
      });
      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
    }

    const detail = await createContactDetail(
      {
        contactId: id,
        companyId,
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
    console.error('Error creating contact detail:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create contact detail' },
      { status: 500 }
    );
  }
}
