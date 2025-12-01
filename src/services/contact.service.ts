import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import type { CreateContactInput, UpdateContactInput, ContactSearchInput } from '@/lib/validations/contact';
import type { Prisma, Contact, ContactType } from '@prisma/client';

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
  userId?: string
): Promise<Contact> {
  const fullName = buildFullName(data);

  const contact = await prisma.contact.create({
    data: {
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

  if (userId) {
    await createAuditLog({
      userId,
      action: 'CREATE',
      entityType: 'Contact',
      entityId: contact.id,
      changeSource: 'MANUAL',
      metadata: { fullName: contact.fullName },
    });
  }

  return contact;
}

export async function updateContact(
  data: UpdateContactInput,
  userId?: string
): Promise<Contact> {
  const existing = await prisma.contact.findUnique({
    where: { id: data.id },
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

  if (userId) {
    await createAuditLog({
      userId,
      action: 'UPDATE',
      entityType: 'Contact',
      entityId: contact.id,
      changeSource: 'MANUAL',
    });
  }

  return contact;
}

export async function findOrCreateContact(
  data: CreateContactInput,
  userId?: string
): Promise<{ contact: Contact; isNew: boolean }> {
  // Try to find existing contact by identification number
  if (data.identificationNumber && data.identificationType) {
    const existing = await prisma.contact.findFirst({
      where: {
        identificationType: data.identificationType,
        identificationNumber: data.identificationNumber,
        deletedAt: null,
      },
    });

    if (existing) {
      return { contact: existing, isNew: false };
    }
  }

  // Try to find by corporate UEN
  if (data.corporateUen) {
    const existing = await prisma.contact.findFirst({
      where: {
        corporateUen: data.corporateUen,
        deletedAt: null,
      },
    });

    if (existing) {
      return { contact: existing, isNew: false };
    }
  }

  // Create new contact
  const contact = await createContact(data, userId);
  return { contact, isNew: true };
}

export async function searchContacts(params: ContactSearchInput): Promise<{
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const where: Prisma.ContactWhereInput = {
    deletedAt: null,
  };

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

export async function getContactById(id: string): Promise<Contact | null> {
  return prisma.contact.findFirst({
    where: { id, deletedAt: null },
  });
}

export async function linkContactToCompany(
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

export async function unlinkContactFromCompany(
  contactId: string,
  companyId: string,
  relationship: string
): Promise<void> {
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

export async function getContactsByCompany(companyId: string): Promise<
  Array<{
    contact: Contact;
    relationship: string;
    isPrimary: boolean;
  }>
> {
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
