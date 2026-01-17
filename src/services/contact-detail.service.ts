import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import type { ContactDetail, ContactDetailType, Prisma, PrismaClient } from '@/generated/prisma';

/**
 * Type for Prisma transaction client (interactive transaction)
 */
export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface TenantAwareParams {
  tenantId: string;
  userId: string;
  tx?: PrismaTransactionClient;
}

// ============================================================================
// TYPES
// ============================================================================

export interface CreateContactDetailInput {
  contactId?: string;
  companyId?: string;
  detailType: ContactDetailType;
  value: string;
  label?: string;
  purposes?: string[];
  description?: string;
  displayOrder?: number;
  isPrimary?: boolean;
  isPoc?: boolean;
}

export interface UpdateContactDetailInput {
  id: string;
  detailType?: ContactDetailType;
  value?: string;
  label?: string | null;
  purposes?: string[];
  description?: string | null;
  displayOrder?: number;
  isPrimary?: boolean;
  isPoc?: boolean;
}

export interface ContactDetailSearchParams {
  contactId?: string;
  companyId?: string;
  detailType?: ContactDetailType;
  includeDeleted?: boolean;
}

export interface ContactDetailWithRelations extends ContactDetail {
  contact?: {
    id: string;
    fullName: string;
    contactType: string;
  } | null;
  company?: {
    id: string;
    name: string;
    uen: string;
  } | null;
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new contact detail
 */
export async function createContactDetail(
  data: CreateContactDetailInput,
  params: TenantAwareParams
): Promise<ContactDetail> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  // Validate that at least one of contactId or companyId is provided
  if (!data.contactId && !data.companyId) {
    throw new Error('Contact detail must be linked to either a contact or a company');
  }

  // Validate contact belongs to tenant if contactId is provided
  if (data.contactId) {
    const contact = await db.contact.findFirst({
      where: { id: data.contactId, tenantId, deletedAt: null },
    });
    if (!contact) {
      throw new Error('Contact not found');
    }
  }

  // Validate company belongs to tenant if companyId is provided
  if (data.companyId) {
    const company = await db.company.findFirst({
      where: { id: data.companyId, tenantId, deletedAt: null },
    });
    if (!company) {
      throw new Error('Company not found');
    }
  }

  // Uniqueness validation: Only one EMAIL and one PHONE per scope (for contact-level details only)
  // Scope is defined by: contactId + companyId combination
  // - Default detail: contactId set, companyId null - RESTRICTED to one per type
  // - Company-specific: contactId set, companyId set - RESTRICTED to one per type
  // - Company-level: contactId null, companyId set - NO RESTRICTION (can have multiple)
  const isCompanyLevelDetail = !data.contactId && data.companyId;

  if (!isCompanyLevelDetail && (data.detailType === 'EMAIL' || data.detailType === 'PHONE')) {
    const existingDetail = await db.contactDetail.findFirst({
      where: {
        tenantId,
        detailType: data.detailType,
        contactId: data.contactId || null,
        companyId: data.companyId || null,
        deletedAt: null,
      },
    });

    if (existingDetail) {
      const scopeDesc = data.contactId && data.companyId
        ? 'company-specific'
        : 'default';
      throw new Error(
        `A ${scopeDesc} ${data.detailType.toLowerCase()} already exists. ` +
        `Each contact can only have one ${data.detailType.toLowerCase()} per scope.`
      );
    }
  }

  // If isPrimary is true, unset other primary details of the same type
  if (data.isPrimary) {
    const where: Prisma.ContactDetailWhereInput = {
      tenantId,
      detailType: data.detailType,
      isPrimary: true,
      deletedAt: null,
    };
    if (data.contactId) where.contactId = data.contactId;
    if (data.companyId) where.companyId = data.companyId;

    await db.contactDetail.updateMany({
      where,
      data: { isPrimary: false },
    });
  }

  const contactDetail = await db.contactDetail.create({
    data: {
      tenantId,
      contactId: data.contactId,
      companyId: data.companyId,
      detailType: data.detailType,
      value: data.value,
      label: data.label,
      purposes: data.purposes ?? [],
      description: data.description,
      displayOrder: data.displayOrder ?? 0,
      isPrimary: data.isPrimary ?? false,
      isPoc: data.isPoc ?? false,
    },
  });

  // Create audit log
  const entityName = data.label || `${data.detailType}: ${data.value}`;
  await createAuditLog({
    tenantId,
    userId,
    companyId: data.companyId,
    action: 'CREATE',
    entityType: 'ContactDetail',
    entityId: contactDetail.id,
    entityName,
    summary: `Created ${data.detailType.toLowerCase()} contact detail "${data.value}"`,
    changeSource: 'MANUAL',
    metadata: {
      detailType: data.detailType,
      value: data.value,
      contactId: data.contactId,
      companyId: data.companyId,
    },
  });

  return contactDetail;
}

/**
 * Update a contact detail
 */
export async function updateContactDetail(
  data: UpdateContactDetailInput,
  params: TenantAwareParams
): Promise<ContactDetail> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const existing = await db.contactDetail.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Contact detail not found');
  }

  // If isPrimary is being set to true, unset other primary details of the same type
  if (data.isPrimary && !existing.isPrimary) {
    const where: Prisma.ContactDetailWhereInput = {
      tenantId,
      detailType: data.detailType || existing.detailType,
      isPrimary: true,
      deletedAt: null,
      id: { not: data.id },
    };
    if (existing.contactId) where.contactId = existing.contactId;
    if (existing.companyId) where.companyId = existing.companyId;

    await db.contactDetail.updateMany({
      where,
      data: { isPrimary: false },
    });
  }

  const contactDetail = await db.contactDetail.update({
    where: { id: data.id },
    data: {
      detailType: data.detailType,
      value: data.value,
      label: data.label,
      purposes: data.purposes,
      description: data.description,
      displayOrder: data.displayOrder,
      isPrimary: data.isPrimary,
      isPoc: data.isPoc,
    },
  });

  // Create audit log
  const entityName = contactDetail.label || `${contactDetail.detailType}: ${contactDetail.value}`;
  await createAuditLog({
    tenantId,
    userId,
    companyId: existing.companyId || undefined,
    action: 'UPDATE',
    entityType: 'ContactDetail',
    entityId: contactDetail.id,
    entityName,
    summary: `Updated ${contactDetail.detailType.toLowerCase()} contact detail`,
    changeSource: 'MANUAL',
  });

  return contactDetail;
}

/**
 * Delete a contact detail (soft delete)
 */
export async function deleteContactDetail(
  id: string,
  params: TenantAwareParams
): Promise<ContactDetail> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const existing = await db.contactDetail.findFirst({
    where: { id, tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Contact detail not found');
  }

  const contactDetail = await db.contactDetail.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  // Create audit log
  const entityName = existing.label || `${existing.detailType}: ${existing.value}`;
  await createAuditLog({
    tenantId,
    userId,
    companyId: existing.companyId || undefined,
    action: 'DELETE',
    entityType: 'ContactDetail',
    entityId: id,
    entityName,
    summary: `Deleted ${existing.detailType.toLowerCase()} contact detail "${existing.value}"`,
    changeSource: 'MANUAL',
  });

  return contactDetail;
}

// ============================================================================
// QUERY OPERATIONS
// ============================================================================

/**
 * Get contact details for a company
 * Includes both company-level details and details of linked contacts
 * POC status is company-specific (stored on CompanyContact)
 */
export async function getCompanyContactDetails(
  companyId: string,
  tenantId: string
): Promise<{
  companyDetails: ContactDetailWithRelations[];
  contactDetails: Array<{
    contact: {
      id: string;
      fullName: string;
      contactType: string;
      relationship?: string;
    };
    details: ContactDetailWithRelations[];
    isPoc: boolean; // Company-specific POC status from CompanyContact
  }>;
  hasPoc: boolean;
}> {
  // Validate company belongs to tenant
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  // Get company-level contact details (directly linked to company, not via contact)
  const companyDetails = await prisma.contactDetail.findMany({
    where: {
      tenantId,
      companyId,
      contactId: null, // Only company-level details
      deletedAt: null,
    },
    orderBy: [
      { detailType: 'asc' },
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  // Get all contacts linked to this company (via CompanyContact, officers, shareholders)
  // For officers, exclude those with cessation dates (ceased officers)
  const linkedContacts = await prisma.contact.findMany({
    where: {
      tenantId,
      deletedAt: null,
      OR: [
        { companyRelations: { some: { companyId, deletedAt: null } } },
        { officerPositions: { some: { companyId, isCurrent: true, cessationDate: null } } },
        { shareholdings: { some: { companyId, isCurrent: true } } },
      ],
    },
    include: {
      companyRelations: {
        where: { companyId, deletedAt: null },
        select: { id: true, relationship: true, isPoc: true },
      },
      officerPositions: {
        where: { companyId, isCurrent: true, cessationDate: null },
        select: { role: true },
      },
      shareholdings: {
        where: { companyId, isCurrent: true },
        select: { shareClass: true },
      },
      contactDetails: {
        where: { deletedAt: null },
        orderBy: [
          { detailType: 'asc' },
          { displayOrder: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    },
  });

  // Format contact details with relationships and company-specific POC status
  const contactDetails = linkedContacts.map((contact) => {
    // Determine the relationship
    const relationships: string[] = [];
    contact.companyRelations.forEach((r) => relationships.push(r.relationship));
    contact.officerPositions.forEach((o) => relationships.push(o.role));
    contact.shareholdings.forEach((s) => relationships.push(`${s.shareClass} Shareholder`));

    // Get POC status from CompanyContact (company-specific)
    const isPoc = contact.companyRelations.some((r) => r.isPoc);

    return {
      contact: {
        id: contact.id,
        fullName: contact.fullName,
        contactType: contact.contactType,
        relationship: relationships.join(', ') || undefined,
      },
      details: contact.contactDetails as ContactDetailWithRelations[],
      isPoc,
    };
  });

  // Check if any linked contact is marked as POC for this company
  const hasPoc = contactDetails.some((c) => c.isPoc);

  return {
    companyDetails: companyDetails as ContactDetailWithRelations[],
    contactDetails,
    hasPoc,
  };
}

/**
 * Toggle POC status for a contact linked to a company
 * This sets isPoc on the CompanyContact relationship
 * If the contact is linked via Officer/Shareholder but no CompanyContact exists,
 * a CompanyContact entry will be created with relationship "Point of Contact"
 */
export async function toggleContactPoc(
  companyId: string,
  contactId: string,
  isPoc: boolean,
  params: TenantAwareParams
): Promise<void> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  // Validate company belongs to tenant
  const company = await db.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  // Get the contact info
  const contact = await db.contact.findFirst({
    where: { id: contactId, tenantId, deletedAt: null },
    select: { fullName: true },
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  // Find or create the CompanyContact relationship
  let companyContact = await db.companyContact.findFirst({
    where: {
      companyId,
      contactId,
      deletedAt: null,
    },
  });

  // If no CompanyContact exists, verify the contact is linked via other means
  // (officer or shareholder), then create a CompanyContact for POC tracking
  if (!companyContact) {
    const hasOfficerRole = await db.companyOfficer.findFirst({
      where: { companyId, contactId, isCurrent: true, cessationDate: null },
    });
    const hasShareholding = await db.companyShareholder.findFirst({
      where: { companyId, contactId, isCurrent: true },
    });

    if (!hasOfficerRole && !hasShareholding) {
      throw new Error('Contact is not linked to this company');
    }

    // Create a CompanyContact entry for POC tracking
    companyContact = await db.companyContact.create({
      data: {
        companyId,
        contactId,
        relationship: 'Point of Contact',
        isPoc: false, // Will be updated below
      },
    });
  }

  // Update the CompanyContact isPoc status (multiple POCs allowed per company)
  await db.companyContact.update({
    where: { id: companyContact.id },
    data: { isPoc },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId,
    action: 'UPDATE',
    entityType: 'CompanyContact',
    entityId: companyContact.id,
    entityName: contact.fullName || 'Contact',
    summary: isPoc
      ? `Set ${contact.fullName} as Point of Contact`
      : `Removed ${contact.fullName} as Point of Contact`,
    changeSource: 'MANUAL',
    metadata: { isPoc, contactId },
  });
}

/**
 * Get contact details for a specific contact
 */
export async function getContactDetails(
  contactId: string,
  tenantId: string
): Promise<ContactDetailWithRelations[]> {
  // Validate contact belongs to tenant
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId, deletedAt: null },
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  const details = await prisma.contactDetail.findMany({
    where: {
      tenantId,
      contactId,
      deletedAt: null,
    },
    orderBy: [
      { detailType: 'asc' },
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  return details as ContactDetailWithRelations[];
}

/**
 * Get contact details for a contact, grouped by company
 * Returns default details (not company-specific) and company-specific details
 */
export async function getContactDetailsGrouped(
  contactId: string,
  tenantId: string
): Promise<{
  defaultDetails: ContactDetailWithRelations[];
  companyDetails: Array<{
    companyId: string;
    companyName: string;
    companyUen: string;
    details: ContactDetailWithRelations[];
  }>;
}> {
  // Validate contact belongs to tenant
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId, deletedAt: null },
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  // Get all contact details for this contact
  const details = await prisma.contactDetail.findMany({
    where: {
      tenantId,
      contactId,
      deletedAt: null,
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          uen: true,
        },
      },
    },
    orderBy: [
      { detailType: 'asc' },
      { displayOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  // Separate default details (no companyId) from company-specific details
  const defaultDetails: ContactDetailWithRelations[] = [];
  const companyDetailsMap = new Map<string, {
    companyId: string;
    companyName: string;
    companyUen: string;
    details: ContactDetailWithRelations[];
  }>();

  for (const detail of details) {
    if (!detail.companyId) {
      // Default detail (contact-only, no company)
      defaultDetails.push(detail as ContactDetailWithRelations);
    } else if (detail.company) {
      // Company-specific detail
      if (!companyDetailsMap.has(detail.companyId)) {
        companyDetailsMap.set(detail.companyId, {
          companyId: detail.company.id,
          companyName: detail.company.name,
          companyUen: detail.company.uen,
          details: [],
        });
      }
      companyDetailsMap.get(detail.companyId)!.details.push(detail as ContactDetailWithRelations);
    }
  }

  return {
    defaultDetails,
    companyDetails: Array.from(companyDetailsMap.values()),
  };
}

/**
 * Get a single contact detail by ID
 */
export async function getContactDetailById(
  id: string,
  tenantId: string
): Promise<ContactDetailWithRelations | null> {
  return prisma.contactDetail.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      contact: {
        select: {
          id: true,
          fullName: true,
          contactType: true,
        },
      },
      company: {
        select: {
          id: true,
          name: true,
          uen: true,
        },
      },
    },
  });
}

// ============================================================================
// EXPORT OPERATIONS
// ============================================================================

export interface ExportContactDetail {
  companyName: string;
  companyUen: string;
  contactName: string | null;
  relationship: string | null;
  detailType: string;
  value: string;
  label: string | null;
  purposes: string[];
  isPrimary: boolean;
}

/**
 * Get all contact details for export for multiple companies
 */
export async function getContactDetailsForExport(
  companyIds: string[],
  tenantId: string
): Promise<ExportContactDetail[]> {
  // Get all companies with their contact details
  const companies = await prisma.company.findMany({
    where: {
      id: { in: companyIds },
      tenantId,
      deletedAt: null,
    },
    include: {
      // Company-level contact details
      contactDetails: {
        where: { deletedAt: null, contactId: null },
        orderBy: [{ detailType: 'asc' }, { displayOrder: 'asc' }],
      },
      // Linked contacts via CompanyContact
      contacts: {
        where: { deletedAt: null },
        include: {
          contact: {
            include: {
              contactDetails: {
                where: { deletedAt: null },
                orderBy: [{ detailType: 'asc' }, { displayOrder: 'asc' }],
              },
            },
          },
        },
      },
      // Officers (exclude those with cessation dates)
      officers: {
        where: { isCurrent: true, cessationDate: null },
        include: {
          contact: {
            include: {
              contactDetails: {
                where: { deletedAt: null },
                orderBy: [{ detailType: 'asc' }, { displayOrder: 'asc' }],
              },
            },
          },
        },
      },
      // Shareholders
      shareholders: {
        where: { isCurrent: true },
        include: {
          contact: {
            include: {
              contactDetails: {
                where: { deletedAt: null },
                orderBy: [{ detailType: 'asc' }, { displayOrder: 'asc' }],
              },
            },
          },
        },
      },
    },
  });

  const exportDetails: ExportContactDetail[] = [];

  for (const company of companies) {
    // Add company-level contact details
    for (const detail of company.contactDetails) {
      exportDetails.push({
        companyName: company.name,
        companyUen: company.uen,
        contactName: null,
        relationship: null,
        detailType: detail.detailType,
        value: detail.value,
        label: detail.label,
        purposes: detail.purposes,
        isPrimary: detail.isPrimary,
      });
    }

    // Track processed contacts to avoid duplicates
    const processedContactIds = new Set<string>();

    // Add contact details from CompanyContact relations
    for (const rel of company.contacts) {
      if (!rel.contact || processedContactIds.has(rel.contact.id)) continue;
      processedContactIds.add(rel.contact.id);

      // Add all contact details from ContactDetail records
      for (const detail of rel.contact.contactDetails) {
        exportDetails.push({
          companyName: company.name,
          companyUen: company.uen,
          contactName: rel.contact.fullName,
          relationship: rel.relationship,
          detailType: detail.detailType,
          value: detail.value,
          label: detail.label,
          purposes: detail.purposes,
          isPrimary: detail.isPrimary,
        });
      }
    }

    // Add contact details from officers
    for (const officer of company.officers) {
      if (!officer.contact || processedContactIds.has(officer.contact.id)) continue;
      processedContactIds.add(officer.contact.id);

      const relationship = officer.role.charAt(0).toUpperCase() + officer.role.slice(1).toLowerCase().replace(/_/g, ' ');

      for (const detail of officer.contact.contactDetails) {
        exportDetails.push({
          companyName: company.name,
          companyUen: company.uen,
          contactName: officer.contact.fullName,
          relationship,
          detailType: detail.detailType,
          value: detail.value,
          label: detail.label,
          purposes: detail.purposes,
          isPrimary: detail.isPrimary,
        });
      }
    }

    // Add contact details from shareholders
    for (const shareholder of company.shareholders) {
      if (!shareholder.contact || processedContactIds.has(shareholder.contact.id)) continue;
      processedContactIds.add(shareholder.contact.id);

      const relationship = `${shareholder.shareClass || 'Ordinary'} Shareholder`;

      for (const detail of shareholder.contact.contactDetails) {
        exportDetails.push({
          companyName: company.name,
          companyUen: company.uen,
          contactName: shareholder.contact.fullName,
          relationship,
          detailType: detail.detailType,
          value: detail.value,
          label: detail.label,
          purposes: detail.purposes,
          isPrimary: detail.isPrimary,
        });
      }
    }
  }

  return exportDetails;
}

// ============================================================================
// AUTOMATION HELPERS
// ============================================================================

/**
 * Get contact details for a company filtered by purpose
 * Used for automation to find the right contact for specific purposes (e.g., invoicing)
 */
export async function getContactDetailsByPurpose(
  companyId: string,
  purpose: string,
  tenantId: string
): Promise<ContactDetailWithRelations[]> {
  // Get all contact details for this company (both company-level and contact-level)
  const { companyDetails, contactDetails } = await getCompanyContactDetails(companyId, tenantId);

  // Filter by purpose
  const matchingDetails: ContactDetailWithRelations[] = [];

  // Check company-level details
  for (const detail of companyDetails) {
    if (detail.purposes.includes(purpose)) {
      matchingDetails.push(detail);
    }
  }

  // Check contact-level details
  for (const contactData of contactDetails) {
    for (const detail of contactData.details) {
      if (detail.purposes.includes(purpose)) {
        // Attach contact info to the detail for context
        matchingDetails.push({
          ...detail,
          contact: {
            id: contactData.contact.id,
            fullName: contactData.contact.fullName,
            contactType: contactData.contact.contactType,
          },
        });
      }
    }
  }

  // Sort by isPrimary (primary first), then by displayOrder
  matchingDetails.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.displayOrder - b.displayOrder;
  });

  return matchingDetails;
}

/**
 * Get the primary contact detail for a specific purpose and type
 * Returns the first matching detail (prioritized by isPrimary, then displayOrder)
 */
export async function getPrimaryContactForPurpose(
  companyId: string,
  purpose: string,
  detailType: ContactDetailType,
  tenantId: string
): Promise<ContactDetailWithRelations | null> {
  const matchingDetails = await getContactDetailsByPurpose(companyId, purpose, tenantId);

  // Filter by type and return the first match
  const filtered = matchingDetails.filter((d) => d.detailType === detailType);
  return filtered[0] || null;
}
