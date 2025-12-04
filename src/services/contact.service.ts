import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import type { CreateContactInput, UpdateContactInput, ContactSearchInput } from '@/lib/validations/contact';
import type { Prisma, Contact, ContactType } from '@prisma/client';

export interface TenantAwareParams {
  tenantId: string;
  userId: string;
}

function buildFullName(data: {
  contactType: ContactType;
  firstName?: string | null;
  lastName?: string | null;
  corporateName?: string | null;
}): string {
  if (data.contactType === 'CORPORATE') {
    return data.corporateName || 'Unknown Corporate';
  }
  const parts = [data.firstName, data.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

export async function createContact(
  data: CreateContactInput,
  params: TenantAwareParams
): Promise<Contact> {
  const { tenantId, userId } = params;
  const fullName = buildFullName(data);

  const contact = await prisma.contact.create({
    data: {
      tenantId,
      contactType: data.contactType,
      firstName: data.firstName,
      lastName: data.lastName,
      fullName,
      identificationType: data.identificationType,
      identificationNumber: data.identificationNumber,
      nationality: data.nationality,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      corporateName: data.corporateName,
      corporateUen: data.corporateUen,
      email: data.email,
      phone: data.phone,
      fullAddress: data.fullAddress,
      internalNotes: data.internalNotes,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'CREATE',
    entityType: 'Contact',
    entityId: contact.id,
    entityName: contact.fullName,
    summary: `Created contact "${contact.fullName}"`,
    changeSource: 'MANUAL',
    metadata: { fullName: contact.fullName },
  });

  return contact;
}

export async function updateContact(
  data: UpdateContactInput,
  params: TenantAwareParams
): Promise<Contact> {
  const { tenantId, userId } = params;

  const existing = await prisma.contact.findFirst({
    where: { id: data.id, tenantId },
  });

  if (!existing) {
    throw new Error('Contact not found');
  }

  const updateData: Prisma.ContactUpdateInput = {};

  if (data.contactType !== undefined) updateData.contactType = data.contactType;
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.identificationType !== undefined) updateData.identificationType = data.identificationType;
  if (data.identificationNumber !== undefined)
    updateData.identificationNumber = data.identificationNumber;
  if (data.nationality !== undefined) updateData.nationality = data.nationality;
  if (data.dateOfBirth !== undefined)
    updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
  if (data.corporateName !== undefined) updateData.corporateName = data.corporateName;
  if (data.corporateUen !== undefined) updateData.corporateUen = data.corporateUen;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.fullAddress !== undefined) updateData.fullAddress = data.fullAddress;
  if (data.internalNotes !== undefined) updateData.internalNotes = data.internalNotes;

  // Rebuild full name if relevant fields changed
  const newFullName = buildFullName({
    contactType: data.contactType || existing.contactType,
    firstName: data.firstName !== undefined ? data.firstName : existing.firstName,
    lastName: data.lastName !== undefined ? data.lastName : existing.lastName,
    corporateName: data.corporateName !== undefined ? data.corporateName : existing.corporateName,
  });

  updateData.fullName = newFullName;

  const contact = await prisma.contact.update({
    where: { id: data.id },
    data: updateData,
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'UPDATE',
    entityType: 'Contact',
    entityId: contact.id,
    entityName: contact.fullName,
    summary: `Updated contact "${contact.fullName}"`,
    changeSource: 'MANUAL',
  });

  return contact;
}

export async function findOrCreateContact(
  data: CreateContactInput,
  params: TenantAwareParams
): Promise<{ contact: Contact; isNew: boolean }> {
  const { tenantId } = params;

  // Enforce tenant context - this function must always be called with a valid tenantId
  if (!tenantId) {
    throw new Error('Tenant context required for findOrCreateContact');
  }

  // Try to find existing contact by identification number within tenant
  if (data.identificationNumber && data.identificationType) {
    const existing = await prisma.contact.findFirst({
      where: {
        tenantId,
        identificationType: data.identificationType,
        identificationNumber: data.identificationNumber,
        deletedAt: null,
      },
    });

    if (existing) {
      return { contact: existing, isNew: false };
    }
  }

  // Try to find by corporate UEN within tenant
  if (data.corporateUen) {
    const existing = await prisma.contact.findFirst({
      where: {
        tenantId,
        corporateUen: data.corporateUen,
        deletedAt: null,
      },
    });

    if (existing) {
      return { contact: existing, isNew: false };
    }
  }

  // Create new contact
  const contact = await createContact(data, params);
  return { contact, isNew: true };
}

export async function searchContacts(
  params: ContactSearchInput,
  tenantId?: string
): Promise<{
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const where: Prisma.ContactWhereInput = {
    deletedAt: null,
  };

  // Apply tenant filter if provided
  if (tenantId) {
    where.tenantId = tenantId;
  }

  if (params.query) {
    const searchTerm = params.query.trim();
    where.OR = [
      { fullName: { contains: searchTerm, mode: 'insensitive' } },
      { email: { contains: searchTerm, mode: 'insensitive' } },
      { identificationNumber: { contains: searchTerm, mode: 'insensitive' } },
      { corporateUen: { contains: searchTerm, mode: 'insensitive' } },
      { phone: { contains: searchTerm, mode: 'insensitive' } },
    ];
  }

  if (params.contactType) {
    where.contactType = params.contactType;
  }

  if (params.companyId) {
    where.companyRelations = {
      some: {
        companyId: params.companyId,
      },
    };
  }

  const orderBy: Prisma.ContactOrderByWithRelationInput = {};
  orderBy[params.sortBy] = params.sortOrder;

  const skip = (params.page - 1) * params.limit;

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy,
      skip,
      take: params.limit,
    }),
    prisma.contact.count({ where }),
  ]);

  return {
    contacts,
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(total / params.limit),
  };
}

export async function getContactById(
  id: string,
  tenantId?: string
): Promise<Contact | null> {
  const where: Prisma.ContactWhereInput = { id, deletedAt: null };
  if (tenantId) {
    where.tenantId = tenantId;
  }
  return prisma.contact.findFirst({ where });
}

// ============================================================================
// Contact Link Information (for delete confirmation)
// ============================================================================

export interface ContactLinkInfo {
  hasLinks: boolean;
  companyRelationCount: number;
  officerPositionCount: number;
  shareholdingCount: number;
  chargeHolderCount: number;
  totalLinks: number;
}

/**
 * Get information about a contact's linked data
 * Used to warn users before deletion
 */
export async function getContactLinkInfo(
  contactId: string,
  tenantId: string
): Promise<ContactLinkInfo> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId, deletedAt: null },
    select: {
      _count: {
        select: {
          companyRelations: true,
          officerPositions: true,
          shareholdings: true,
          chargeHoldings: true,
        },
      },
    },
  });

  if (!contact) {
    return {
      hasLinks: false,
      companyRelationCount: 0,
      officerPositionCount: 0,
      shareholdingCount: 0,
      chargeHolderCount: 0,
      totalLinks: 0,
    };
  }

  const { companyRelations, officerPositions, shareholdings, chargeHoldings } = contact._count;
  const totalLinks = companyRelations + officerPositions + shareholdings + chargeHoldings;

  return {
    hasLinks: totalLinks > 0,
    companyRelationCount: companyRelations,
    officerPositionCount: officerPositions,
    shareholdingCount: shareholdings,
    chargeHolderCount: chargeHoldings,
    totalLinks,
  };
}

import type { OfficerRole } from '@prisma/client';

// Officer roles that create Officer records
const OFFICER_ROLES = ['Director', 'Secretary', 'Auditor', 'Authorized Representative'];

// Map display name to OfficerRole enum
const OFFICER_ROLE_MAP: Record<string, OfficerRole> = {
  'Director': 'DIRECTOR',
  'Secretary': 'SECRETARY',
  'Auditor': 'AUDITOR',
  'Authorized Representative': 'DIRECTOR', // Map to DIRECTOR as closest match
};

/**
 * Simple link that just creates a CompanyContact relationship
 * Used by bizfile service when Officer/Shareholder records are created separately
 */
export async function createCompanyContactRelation(
  contactId: string,
  companyId: string,
  relationship: string,
  isPrimary: boolean = false
): Promise<void> {
  await prisma.companyContact.upsert({
    where: {
      companyId_contactId_relationship: {
        companyId,
        contactId,
        relationship,
      },
    },
    create: {
      companyId,
      contactId,
      relationship,
      isPrimary,
    },
    update: {
      isPrimary,
    },
  });
}

interface LinkContactOptions {
  isPrimary?: boolean;
  appointmentDate?: string;
  numberOfShares?: number;
  shareClass?: string;
  tenantId: string;
  userId: string;
}

export async function linkContactToCompany(
  contactId: string,
  companyId: string,
  relationship: string,
  options: LinkContactOptions
): Promise<void> {
  const { isPrimary = false, appointmentDate, numberOfShares, shareClass, tenantId, userId } = options;

  // Validate both contact and company belong to the same tenant
  const [contact, company] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId }, select: { tenantId: true, fullName: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { tenantId: true, name: true } }),
  ]);

  if (!contact || !company) {
    throw new Error('Contact or company not found');
  }

  if (contact.tenantId !== company.tenantId) {
    throw new Error('Contact and company must belong to the same tenant');
  }

  if (contact.tenantId !== tenantId) {
    throw new Error('Access denied');
  }

  // Determine the type of link to create
  const isOfficerRole = OFFICER_ROLES.includes(relationship);
  const isShareholder = relationship === 'Shareholder';

  if (isOfficerRole) {
    // Check for existing active officer with same role at this company
    const officerRole = OFFICER_ROLE_MAP[relationship] || 'DIRECTOR';
    const existingOfficer = await prisma.companyOfficer.findFirst({
      where: {
        companyId,
        contactId,
        role: officerRole,
        isCurrent: true,
      },
    });

    if (existingOfficer) {
      throw new Error(`Contact is already an active ${relationship} at this company`);
    }

    // Create CompanyOfficer record
    await prisma.companyOfficer.create({
      data: {
        companyId,
        contactId,
        name: contact.fullName,
        role: officerRole,
        designation: relationship,
        appointmentDate: appointmentDate ? new Date(appointmentDate) : null,
        isCurrent: true,
      },
    });

    await createAuditLog({
      tenantId,
      userId,
      companyId,
      action: 'UPDATE',
      entityType: 'CompanyOfficer',
      entityId: companyId,
      entityName: contact.fullName,
      summary: `Linked "${contact.fullName}" as ${relationship} to "${company.name}"`,
      changeSource: 'MANUAL',
    });
  } else if (isShareholder) {
    // Create CompanyShareholder record
    if (!numberOfShares || numberOfShares <= 0) {
      throw new Error('Number of shares is required for shareholders');
    }

    // Check for existing active shareholding at this company
    const existingShareholder = await prisma.companyShareholder.findFirst({
      where: {
        companyId,
        contactId,
        isCurrent: true,
      },
    });

    if (existingShareholder) {
      throw new Error('Contact already has an active shareholding at this company');
    }

    await prisma.companyShareholder.create({
      data: {
        companyId,
        contactId,
        name: contact.fullName,
        shareholderType: 'INDIVIDUAL',
        shareClass: shareClass || 'Ordinary',
        numberOfShares,
        isCurrent: true,
      },
    });

    await createAuditLog({
      tenantId,
      userId,
      companyId,
      action: 'UPDATE',
      entityType: 'CompanyShareholder',
      entityId: companyId,
      entityName: contact.fullName,
      summary: `Linked "${contact.fullName}" as shareholder with ${numberOfShares} ${shareClass || 'Ordinary'} shares to "${company.name}"`,
      changeSource: 'MANUAL',
    });
  } else {
    // Create general CompanyContact relationship
    await prisma.companyContact.upsert({
      where: {
        companyId_contactId_relationship: {
          companyId,
          contactId,
          relationship,
        },
      },
      create: {
        companyId,
        contactId,
        relationship,
        isPrimary,
      },
      update: {
        isPrimary,
      },
    });

    await createAuditLog({
      tenantId,
      userId,
      companyId,
      action: 'UPDATE',
      entityType: 'CompanyContact',
      entityId: companyId,
      entityName: contact.fullName,
      summary: `Linked "${contact.fullName}" as ${relationship} to "${company.name}"`,
      changeSource: 'MANUAL',
    });
  }
}

export async function unlinkContactFromCompany(
  contactId: string,
  companyId: string,
  relationship: string,
  tenantId: string,
  userId?: string
): Promise<void> {
  // REQUIRED: Validate the company belongs to the tenant
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tenantId: true, name: true },
  });

  if (!company || company.tenantId !== tenantId) {
    throw new Error('Company not found or access denied');
  }

  // Also validate that the contact belongs to the same tenant
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { tenantId: true, fullName: true },
  });

  if (!contact || contact.tenantId !== tenantId) {
    throw new Error('Contact not found or access denied');
  }

  await prisma.companyContact.delete({
    where: {
      companyId_contactId_relationship: {
        companyId,
        contactId,
        relationship,
      },
    },
  });

  // Create audit log for the unlink operation
  if (userId) {
    await createAuditLog({
      tenantId,
      userId,
      companyId,
      action: 'UPDATE',
      entityType: 'CompanyContact',
      entityId: `${companyId}-${contactId}`,
      entityName: contact.fullName,
      summary: `Unlinked contact "${contact.fullName}" from company "${company.name}" (${relationship})`,
      changeSource: 'MANUAL',
      metadata: {
        contactId,
        contactName: contact.fullName,
        companyName: company.name,
        relationship,
      },
    });
  }
}

export async function getContactsByCompany(
  companyId: string,
  tenantId: string
): Promise<
  Array<{
    contact: Contact;
    relationship: string;
    isPrimary: boolean;
  }>
> {
  // REQUIRED: Validate the company belongs to the tenant
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tenantId: true },
  });

  if (!company || company.tenantId !== tenantId) {
    throw new Error('Company not found or access denied');
  }

  const relations = await prisma.companyContact.findMany({
    where: { companyId },
    include: {
      contact: true,
    },
  });

  return relations.map((r) => ({
    contact: r.contact,
    relationship: r.relationship,
    isPrimary: r.isPrimary,
  }));
}

export async function deleteContact(
  id: string,
  reason: string,
  params: TenantAwareParams
): Promise<Contact> {
  const { tenantId, userId } = params;

  const existing = await prisma.contact.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      _count: {
        select: {
          companyRelations: true,
          officerPositions: true,
          shareholdings: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error('Contact not found');
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'DELETE',
    entityType: 'Contact',
    entityId: contact.id,
    entityName: contact.fullName,
    summary: `Deleted contact "${contact.fullName}"`,
    reason,
    changeSource: 'MANUAL',
    metadata: {
      companyRelations: existing._count.companyRelations,
      officerPositions: existing._count.officerPositions,
      shareholdings: existing._count.shareholdings,
    },
  });

  return contact;
}

export async function restoreContact(
  id: string,
  params: TenantAwareParams
): Promise<Contact> {
  const { tenantId, userId } = params;

  const existing = await prisma.contact.findFirst({
    where: { id, tenantId, deletedAt: { not: null } },
  });

  if (!existing) {
    throw new Error('Contact not found or not deleted');
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: { deletedAt: null },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'RESTORE',
    entityType: 'Contact',
    entityId: contact.id,
    entityName: contact.fullName,
    summary: `Restored contact "${contact.fullName}"`,
    changeSource: 'MANUAL',
  });

  return contact;
}

export interface ContactWithRelationships extends Contact {
  companyRelations: Array<{
    id: string;
    relationship: string;
    isPrimary: boolean;
    company: {
      id: string;
      name: string;
      uen: string;
      status: string;
      deletedAt: Date | null;
    };
  }>;
  officerPositions: Array<{
    id: string;
    role: string;
    designation: string | null;
    appointmentDate: Date | null;
    cessationDate: Date | null;
    isCurrent: boolean;
    company: {
      id: string;
      name: string;
      uen: string;
    };
  }>;
  shareholdings: Array<{
    id: string;
    shareClass: string;
    numberOfShares: number;
    percentageHeld: number | null;
    isCurrent: boolean;
    company: {
      id: string;
      name: string;
      uen: string;
    };
  }>;
}

interface ContactWithRelationshipsOptions {
  tenantId?: string;
  companyIds?: string[];  // If provided, filter relationships to only these companies
}

export async function getContactWithRelationships(
  id: string,
  options: ContactWithRelationshipsOptions = {}
): Promise<(ContactWithRelationships & { hiddenCompanyCount?: number }) | null> {
  const { tenantId, companyIds } = options;

  const where: Prisma.ContactWhereInput = { id, deletedAt: null };
  if (tenantId) {
    where.tenantId = tenantId;
  }

  const contact = await prisma.contact.findFirst({
    where,
    include: {
      companyRelations: {
        include: {
          company: {
            select: {
              id: true,
              name: true,
              uen: true,
              status: true,
              deletedAt: true,
            },
          },
        },
      },
      officerPositions: {
        include: {
          company: {
            select: {
              id: true,
              name: true,
              uen: true,
              deletedAt: true,
            },
          },
        },
      },
      shareholdings: {
        include: {
          company: {
            select: {
              id: true,
              name: true,
              uen: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  });

  if (!contact) {
    return null;
  }

  // First, filter out relationships to deleted companies
  let filteredCompanyRelations = contact.companyRelations.filter(r => !r.company.deletedAt);
  let filteredOfficerPositions = contact.officerPositions.filter(o => !o.company.deletedAt);
  let filteredShareholdings = contact.shareholdings.filter(s => !s.company.deletedAt);
  let hiddenCompanyCount = 0;

  // If companyIds filter is provided (for company-scoped users), further filter relationships
  if (companyIds && companyIds.length >= 0) {
    const companyIdSet = new Set(companyIds);

    // Count unique companies that will be hidden (from non-deleted companies only)
    const allCompanyIds = new Set<string>();
    filteredCompanyRelations.forEach(r => allCompanyIds.add(r.company.id));
    filteredOfficerPositions.forEach(o => allCompanyIds.add(o.company.id));
    filteredShareholdings.forEach(s => allCompanyIds.add(s.company.id));

    const hiddenCompanyIds = new Set<string>();
    allCompanyIds.forEach(cid => {
      if (!companyIdSet.has(cid)) {
        hiddenCompanyIds.add(cid);
      }
    });
    hiddenCompanyCount = hiddenCompanyIds.size;

    // Filter to only show relationships for accessible companies
    filteredCompanyRelations = filteredCompanyRelations.filter(r => companyIdSet.has(r.company.id));
    filteredOfficerPositions = filteredOfficerPositions.filter(o => companyIdSet.has(o.company.id));
    filteredShareholdings = filteredShareholdings.filter(s => companyIdSet.has(s.company.id));
  }

  return {
    ...contact,
    companyRelations: filteredCompanyRelations.map((r) => ({
      id: r.id,
      relationship: r.relationship,
      isPrimary: r.isPrimary,
      company: r.company,
    })),
    officerPositions: filteredOfficerPositions.map((o) => ({
      id: o.id,
      role: o.role,
      designation: o.designation,
      appointmentDate: o.appointmentDate,
      cessationDate: o.cessationDate,
      isCurrent: o.isCurrent,
      company: o.company,
    })),
    shareholdings: filteredShareholdings.map((s) => ({
      id: s.id,
      shareClass: s.shareClass,
      numberOfShares: s.numberOfShares,
      percentageHeld: s.percentageHeld ? Number(s.percentageHeld) : null,
      isCurrent: s.isCurrent,
      company: s.company,
    })),
    hiddenCompanyCount,
  };
}

export async function searchContactsWithCounts(
  params: ContactSearchInput,
  tenantId?: string,
  companyIds?: string[]
): Promise<{
  contacts: Array<Contact & { _count: { companyRelations: number } }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  // For company-scoped users with no assignments, return empty result early
  if (companyIds && companyIds.length === 0) {
    return {
      contacts: [],
      total: 0,
      page: params.page,
      limit: params.limit,
      totalPages: 0,
    };
  }

  const andConditions: Prisma.ContactWhereInput[] = [{ deletedAt: null }];

  if (tenantId) {
    andConditions.push({ tenantId });
  }

  if (params.query) {
    const searchTerm = params.query.trim();
    andConditions.push({
      OR: [
        { fullName: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { identificationNumber: { contains: searchTerm, mode: 'insensitive' } },
        { corporateUen: { contains: searchTerm, mode: 'insensitive' } },
        { phone: { contains: searchTerm, mode: 'insensitive' } },
      ],
    });
  }

  if (params.contactType) {
    andConditions.push({ contactType: params.contactType });
  }

  // Filter by specific company IDs (for company-scoped users)
  // This filters contacts linked to any of the user's assigned companies
  if (companyIds && companyIds.length > 0) {
    andConditions.push({
      OR: [
        // Contacts linked via company relations
        { companyRelations: { some: { companyId: { in: companyIds } } } },
        // Contacts linked as officers
        { officerPositions: { some: { companyId: { in: companyIds } } } },
        // Contacts linked as shareholders
        { shareholdings: { some: { companyId: { in: companyIds } } } },
      ],
    });
  }

  if (params.companyId) {
    andConditions.push({
      companyRelations: {
        some: {
          companyId: params.companyId,
        },
      },
    });
  }

  const where: Prisma.ContactWhereInput = {
    AND: andConditions,
  };

  const orderBy: Prisma.ContactOrderByWithRelationInput = {};
  orderBy[params.sortBy] = params.sortOrder;

  const skip = (params.page - 1) * params.limit;

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy,
      skip,
      take: params.limit,
      include: {
        _count: {
          select: {
            companyRelations: true,
          },
        },
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return {
    contacts,
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(total / params.limit),
  };
}
