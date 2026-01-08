import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
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

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

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

    const tenantId = session.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const body = await request.json();

    // Parse and validate input
    const data = createContactDetailSchema.parse({
      ...body,
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
