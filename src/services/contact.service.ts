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
      alternatePhone: data.alternatePhone,
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2,
      postalCode: data.postalCode,
      city: data.city,
      country: data.country,
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
  if (data.alternatePhone !== undefined) updateData.alternatePhone = data.alternatePhone;
  if (data.addressLine1 !== undefined) updateData.addressLine1 = data.addressLine1;
  if (data.addressLine2 !== undefined) updateData.addressLine2 = data.addressLine2;
  if (data.postalCode !== undefined) updateData.postalCode = data.postalCode;
  if (data.city !== undefined) updateData.city = data.city;
  if (data.country !== undefined) updateData.country = data.country;
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

export async function linkContactToCompany(
  contactId: string,
  companyId: string,
  relationship: string,
  isPrimary: boolean = false
): Promise<void> {
  // Validate both contact and company belong to the same tenant
  const [contact, company] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId }, select: { tenantId: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { tenantId: true } }),
  ]);

  if (!contact || !company) {
    throw new Error('Contact or company not found');
  }

  if (contact.tenantId !== company.tenantId) {
    throw new Error('Contact and company must belong to the same tenant');
  }

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

export async function unlinkContactFromCompany(
  contactId: string,
  companyId: string,
  relationship: string,
  tenantId: string
): Promise<void> {
  // REQUIRED: Validate the company belongs to the tenant
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tenantId: true },
  });

  if (!company || company.tenantId !== tenantId) {
    throw new Error('Company not found or access denied');
  }

  // Also validate that the contact belongs to the same tenant
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { tenantId: true },
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

export async function getContactWithRelationships(
  id: string,
  tenantId?: string
): Promise<ContactWithRelationships | null> {
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
            },
          },
        },
      },
    },
  });

  if (!contact) {
    return null;
  }

  return {
    ...contact,
    companyRelations: contact.companyRelations.map((r) => ({
      id: r.id,
      relationship: r.relationship,
      isPrimary: r.isPrimary,
      company: r.company,
    })),
    officerPositions: contact.officerPositions.map((o) => ({
      id: o.id,
      role: o.role,
      designation: o.designation,
      appointmentDate: o.appointmentDate,
      cessationDate: o.cessationDate,
      isCurrent: o.isCurrent,
      company: o.company,
    })),
    shareholdings: contact.shareholdings.map((s) => ({
      id: s.id,
      shareClass: s.shareClass,
      numberOfShares: s.numberOfShares,
      percentageHeld: s.percentageHeld ? Number(s.percentageHeld) : null,
      isCurrent: s.isCurrent,
      company: s.company,
    })),
  };
}

export async function searchContactsWithCounts(
  params: ContactSearchInput,
  tenantId?: string
): Promise<{
  contacts: Array<Contact & { _count: { companyRelations: number } }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const where: Prisma.ContactWhereInput = {
    deletedAt: null,
  };

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
