import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireTenantContext } from '@/lib/api-helpers';
import {
  getCompanyContactDetails,
  createContactDetail,
} from '@/services/contact-detail.service';
import { createContactDetailSchema } from '@/lib/validations/contact-detail';
import { ZodError } from 'zod';

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/companies/[id]/contact-details
 * Get all contact details for a company (including linked contacts' details)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check read permission
    await requirePermission(session, 'company', 'read', companyId);

    // Resolve tenant context - SUPER_ADMIN can specify via query param
    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    const result = await getCompanyContactDetails(companyId, tenantId);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Company not found') {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      }
    }
    console.error('Error fetching company contact details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/companies/[id]/contact-details
 * Create a new contact detail for the company
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id: companyId } = await params;

    // Check company access
    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check update permission
    await requirePermission(session, 'company', 'update', companyId);

    const body = await request.json();

    // Resolve tenant context - SUPER_ADMIN can specify via body
    const { tenantId: bodyTenantId, ...detailData } = body;
    const tenantResult = await requireTenantContext(session, bodyTenantId);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    // Parse and validate input
    const data = createContactDetailSchema.parse({
      ...detailData,
      companyId,
    });

    const contactDetail = await createContactDetail(data, {
      tenantId,
      userId: session.id,
    });

    return NextResponse.json(contactDetail, { status: 201 });
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
      if (error.message === 'Company not found' || error.message === 'Contact not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Error creating contact detail:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
