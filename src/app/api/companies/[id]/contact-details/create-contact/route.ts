import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { requireTenantContext } from '@/lib/api-helpers';
import { prisma } from '@/lib/prisma';
import { createContact, linkContactToCompany } from '@/services/contact.service';
import { createContactDetail } from '@/services/contact-detail.service';
import { createContactWithDetailsSchema } from '@/lib/validations/contact-detail';
import { ZodError } from 'zod';

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/companies/[id]/contact-details/create-contact
 * Create a new contact with details and link to the company
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
    const { tenantId: bodyTenantId, ...contactData } = body;
    const tenantResult = await requireTenantContext(session, bodyTenantId);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    // Parse and validate input
    const data = createContactWithDetailsSchema.parse({
      ...contactData,
      companyId,
    });

    // Use a transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create the contact
      const contact = await createContact(data.contact, {
        tenantId,
        userId: session.id,
        tx,
      });

      // Link the contact to the company
      await linkContactToCompany(contact.id, companyId, data.relationship, {
        tenantId,
        userId: session.id,
      });

      // Create additional contact details if provided
      if (data.contactDetails && data.contactDetails.length > 0) {
        for (let i = 0; i < data.contactDetails.length; i++) {
          const detail = data.contactDetails[i];
          await createContactDetail(
            {
              contactId: contact.id,
              detailType: detail.detailType,
              value: detail.value,
              label: detail.label,
              description: detail.description,
              displayOrder: i,
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

      return contact;
    });

    return NextResponse.json(result, { status: 201 });
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
      if (error.message === 'Company not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    console.error('Error creating contact with details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
