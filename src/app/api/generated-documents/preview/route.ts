import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import {
  resolvePlaceholders,
  prepareCompanyContext,
  type PlaceholderContext,
} from '@/lib/placeholder-resolver';
import { extractSections, addSectionAnchors } from '@/services/document-validation.service';

// Validation schema for preview request
const previewSchema = z.object({
  templateId: z.string().uuid(),
  companyId: z.string().uuid().optional(),
  contactIds: z.array(z.string().uuid()).optional(),
  customData: z.record(z.unknown()).optional(),
  tenantId: z.string().uuid().optional(), // For SUPER_ADMIN
});

/**
 * POST /api/generated-documents/preview
 * Preview a document without saving
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check read permission (preview only requires read)
    await requirePermission(session, 'document', 'read');

    const body = await request.json();
    const data = previewSchema.parse(body);

    // Determine tenant ID
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && data.tenantId) {
      tenantId = data.tenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Fetch template
    const template = await prisma.documentTemplate.findFirst({
      where: { id: data.templateId, tenantId, deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        content: true,
        contentJson: true,
        category: true,
        placeholders: true,
      },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Build placeholder context
    let context: PlaceholderContext = {
      system: {
        currentDate: new Date(),
        generatedBy: `${session.firstName} ${session.lastName}`.trim(),
      },
      custom: data.customData || {},
    };

    // Add company data if provided
    if (data.companyId) {
      const company = await prisma.company.findFirst({
        where: { id: data.companyId, tenantId, deletedAt: null },
        include: {
          addresses: {
            select: {
              addressType: true,
              fullAddress: true,
              isCurrent: true,
            },
          },
          officers: {
            select: {
              name: true,
              role: true,
              nationality: true,
              address: true,
              appointmentDate: true,
              cessationDate: true,
              isCurrent: true,
              contact: {
                select: {
                  email: true,
                  phone: true,
                },
              },
            },
          },
          shareholders: {
            select: {
              name: true,
              shareholderType: true,
              nationality: true,
              numberOfShares: true,
              percentageHeld: true,
              shareClass: true,
              isCurrent: true,
              contact: {
                select: {
                  email: true,
                  phone: true,
                },
              },
            },
          },
        },
      });

      if (company) {
        const companyContext = prepareCompanyContext({
          id: company.id,
          name: company.name,
          uen: company.uen,
          formerName: company.formerName,
          entityType: company.entityType,
          status: company.status,
          incorporationDate: company.incorporationDate,
          homeCurrency: company.homeCurrency,
          paidUpCapitalAmount: company.paidUpCapitalAmount,
          issuedCapitalAmount: company.issuedCapitalAmount,
          financialYearEndMonth: company.financialYearEndMonth,
          financialYearEndDay: company.financialYearEndDay,
          isGstRegistered: company.isGstRegistered,
          gstRegistrationNumber: company.gstRegistrationNumber,
          addresses: company.addresses,
          officers: company.officers,
          shareholders: company.shareholders,
        });
        context = {
          ...context,
          company: companyContext.company,
          custom: { ...context.custom, ...companyContext.custom },
        };
      }
    }

    // Add contact data if provided
    if (data.contactIds && data.contactIds.length > 0) {
      const contacts = await prisma.contact.findMany({
        where: { id: { in: data.contactIds }, tenantId, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          fullAddress: true,
          nationality: true,
          identificationNumber: true,
          contactType: true,
        },
      });

      if (contacts.length > 0) {
        const firstContact = contacts[0];
        context.contact = {
          id: firstContact.id,
          fullName: `${firstContact.firstName || ''} ${firstContact.lastName || ''}`.trim(),
          firstName: firstContact.firstName,
          lastName: firstContact.lastName,
          contactType: firstContact.contactType,
          email: firstContact.email,
          phone: firstContact.phone,
          fullAddress: firstContact.fullAddress,
          nationality: firstContact.nationality,
          identificationNumber: firstContact.identificationNumber,
        };

        // Add all contacts to custom data for iteration
        context.custom = {
          ...context.custom,
          contacts: contacts.map(c => ({
            id: c.id,
            fullName: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            phone: c.phone,
            address: c.fullAddress,
            nationality: c.nationality,
            identificationNumber: c.identificationNumber,
          })),
        };
      }
    }

    // Get tenant name for system context
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    if (tenant && context.system) {
      context.system.tenantName = tenant.name;
    }

    // Resolve placeholders
    const { resolved, missing } = resolvePlaceholders(template.content, context);

    // Add section anchors
    const contentWithAnchors = addSectionAnchors(resolved);

    // Extract sections for navigation
    const sections = extractSections(contentWithAnchors);

    return NextResponse.json({
      preview: {
        content: contentWithAnchors,
        contentHtml: contentWithAnchors,
        sections,
        unresolvedPlaceholders: missing,
      },
      template: {
        id: template.id,
        name: template.name,
        category: template.category,
      },
      context: {
        hasCompany: !!data.companyId,
        hasContacts: (data.contactIds?.length || 0) > 0,
        hasCustomData: Object.keys(data.customData || {}).length > 0,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
