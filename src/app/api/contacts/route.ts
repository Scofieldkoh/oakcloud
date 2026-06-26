import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createContactWithDetailsSchema, contactSearchSchema } from '@/lib/validations/contact';
import { createContact, searchContactsWithCounts } from '@/services/contact.service';
import { createContactDetail } from '@/services/contact-detail.service';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check read permission
    await requirePermission(session, 'contact', 'read');

    const { searchParams } = new URL(request.url);

    const params = contactSearchSchema.parse({
      query: searchParams.get('query') || undefined,
      fullName: searchParams.get('fullName') || undefined,
      contactType: searchParams.get('contactType') || undefined,
      identificationType: searchParams.get('identificationType') || undefined,
      identificationNumber: searchParams.get('identificationNumber') || undefined,
      nationality: searchParams.get('nationality') || undefined,
      email: searchParams.get('email') || undefined,
      phone: searchParams.get('phone') || undefined,
      companyId: searchParams.get('companyId') || undefined,
      companiesMin: searchParams.get('companiesMin') ? Number(searchParams.get('companiesMin')) : undefined,
      companiesMax: searchParams.get('companiesMax') ? Number(searchParams.get('companiesMax')) : undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: searchParams.get('sortOrder') || undefined,
    });

    const effectiveTenantId = session.tenantId;

    // For company-scoped users, filter by their assigned companies
    // SUPER_ADMIN, TENANT_ADMIN, and users with "All Companies" access see all contacts in their tenant
    const companyIds = (!session.isSuperAdmin && !session.isWorkspaceAdmin && !session.hasAllCompaniesAccess)
      ? session.companyIds
      : undefined;

    const result = await searchContactsWithCounts(params, effectiveTenantId, {
      companyIds,
    });

    return NextResponse.json(result);
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

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check create permission
    await requirePermission(session, 'contact', 'create');

    const body = await request.json();
    const data = createContactWithDetailsSchema.parse(body);
    const { contactDetails = [], ...createData } = data;

    const tenantId = session.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const contact = await prisma.$transaction(async (tx) => {
      const createdContact = await createContact(createData, {
        tenantId,
        userId: session.id,
        tx,
      });

      if (contactDetails.length > 0) {
        for (let i = 0; i < contactDetails.length; i++) {
          const detail = contactDetails[i];
          await createContactDetail(
            {
              contactId: createdContact.id,
              companyId: detail.companyId,
              detailType: detail.detailType,
              value: detail.value,
              label: detail.label,
              purposes: detail.purposes,
              description: detail.description,
              displayOrder: detail.displayOrder ?? i,
              isPrimary: detail.isPrimary,
            },
            {
              tenantId,
              userId: session.id,
              tx,
            }
          );
        }
      }

      return createdContact;
    });

    return NextResponse.json(contact, { status: 201 });
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
