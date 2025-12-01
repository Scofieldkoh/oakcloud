import { prisma } from '@/lib/prisma';
import { createAuditLog, computeChanges } from '@/lib/audit';
import type {
  CreateCompanyInput,
  UpdateCompanyInput,
  CompanySearchInput,
} from '@/lib/validations/company';
import type { Prisma, Company } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export interface CompanyWithRelations extends Company {
  addresses?: Array<{
    id: string;
    addressType: string;
    fullAddress: string;
    isCurrent: boolean;
  }>;
  officers?: Array<{
    id: string;
    name: string;
    role: string;
    isCurrent: boolean;
  }>;
  shareholders?: Array<{
    id: string;
    name: string;
    numberOfShares: number;
    percentageHeld: Decimal | null;
    isCurrent: boolean;
  }>;
  _count?: {
    documents: number;
    officers: number;
    shareholders: number;
    charges: number;
  };
}

const TRACKED_FIELDS: (keyof Company)[] = [
  'name',
  'uen',
  'entityType',
  'status',
  'incorporationDate',
  'primarySsicCode',
  'primarySsicDescription',
  'secondarySsicCode',
  'secondarySsicDescription',
  'financialYearEndDay',
  'financialYearEndMonth',
  'paidUpCapitalAmount',
  'issuedCapitalAmount',
  'isGstRegistered',
  'gstRegistrationNumber',
  'internalNotes',
];

export async function createCompany(
  data: CreateCompanyInput,
  userId: string
): Promise<Company> {
  const company = await prisma.company.create({
    data: {
      uen: data.uen.toUpperCase(),
      name: data.name,
      entityType: data.entityType,
      status: data.status,
      incorporationDate: data.incorporationDate ? new Date(data.incorporationDate) : null,
      registrationDate: data.registrationDate ? new Date(data.registrationDate) : null,
      primarySsicCode: data.primarySsicCode,
      primarySsicDescription: data.primarySsicDescription,
      secondarySsicCode: data.secondarySsicCode,
      secondarySsicDescription: data.secondarySsicDescription,
      financialYearEndDay: data.financialYearEndDay,
      financialYearEndMonth: data.financialYearEndMonth,
      paidUpCapitalCurrency: data.paidUpCapitalCurrency,
      paidUpCapitalAmount: data.paidUpCapitalAmount,
      issuedCapitalCurrency: data.issuedCapitalCurrency,
      issuedCapitalAmount: data.issuedCapitalAmount,
      isGstRegistered: data.isGstRegistered,
      gstRegistrationNumber: data.gstRegistrationNumber,
      gstRegistrationDate: data.gstRegistrationDate ? new Date(data.gstRegistrationDate) : null,
      internalNotes: data.internalNotes,
    },
  });

  await createAuditLog({
    userId,
    companyId: company.id,
    action: 'CREATE',
    entityType: 'Company',
    entityId: company.id,
    changeSource: 'MANUAL',
    metadata: { uen: company.uen, name: company.name },
  });

  return company;
}

export async function updateCompany(
  data: UpdateCompanyInput,
  userId: string,
  reason?: string
): Promise<Company> {
  const existing = await prisma.company.findUnique({
    where: { id: data.id },
  });

  if (!existing) {
    throw new Error('Company not found');
  }

  if (existing.deletedAt) {
    throw new Error('Cannot update a deleted company');
  }

  const updateData: Prisma.CompanyUpdateInput = {};

  if (data.uen !== undefined) updateData.uen = data.uen.toUpperCase();
  if (data.name !== undefined) updateData.name = data.name;
  if (data.entityType !== undefined) updateData.entityType = data.entityType;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.incorporationDate !== undefined)
    updateData.incorporationDate = data.incorporationDate ? new Date(data.incorporationDate) : null;
  if (data.registrationDate !== undefined)
    updateData.registrationDate = data.registrationDate ? new Date(data.registrationDate) : null;
  if (data.primarySsicCode !== undefined) updateData.primarySsicCode = data.primarySsicCode;
  if (data.primarySsicDescription !== undefined)
    updateData.primarySsicDescription = data.primarySsicDescription;
  if (data.secondarySsicCode !== undefined) updateData.secondarySsicCode = data.secondarySsicCode;
  if (data.secondarySsicDescription !== undefined)
    updateData.secondarySsicDescription = data.secondarySsicDescription;
  if (data.financialYearEndDay !== undefined)
    updateData.financialYearEndDay = data.financialYearEndDay;
  if (data.financialYearEndMonth !== undefined)
    updateData.financialYearEndMonth = data.financialYearEndMonth;
  if (data.paidUpCapitalCurrency !== undefined)
    updateData.paidUpCapitalCurrency = data.paidUpCapitalCurrency;
  if (data.paidUpCapitalAmount !== undefined)
    updateData.paidUpCapitalAmount = data.paidUpCapitalAmount;
  if (data.issuedCapitalCurrency !== undefined)
    updateData.issuedCapitalCurrency = data.issuedCapitalCurrency;
  if (data.issuedCapitalAmount !== undefined)
    updateData.issuedCapitalAmount = data.issuedCapitalAmount;
  if (data.isGstRegistered !== undefined) updateData.isGstRegistered = data.isGstRegistered;
  if (data.gstRegistrationNumber !== undefined)
    updateData.gstRegistrationNumber = data.gstRegistrationNumber;
  if (data.gstRegistrationDate !== undefined)
    updateData.gstRegistrationDate = data.gstRegistrationDate
      ? new Date(data.gstRegistrationDate)
      : null;
  if (data.internalNotes !== undefined) updateData.internalNotes = data.internalNotes;

  const company = await prisma.company.update({
    where: { id: data.id },
    data: updateData,
  });

  const changes = computeChanges(existing as Record<string, unknown>, data, TRACKED_FIELDS as string[]);

  if (changes) {
    await createAuditLog({
      userId,
      companyId: company.id,
      action: 'UPDATE',
      entityType: 'Company',
      entityId: company.id,
      changeSource: 'MANUAL',
      changes,
      reason,
    });
  }

  return company;
}

export async function deleteCompany(
  id: string,
  userId: string,
  reason: string
): Promise<Company> {
  const existing = await prisma.company.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Company not found');
  }

  if (existing.deletedAt) {
    throw new Error('Company is already deleted');
  }

  const company = await prisma.company.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedReason: reason,
    },
  });

  await createAuditLog({
    userId,
    companyId: company.id,
    action: 'DELETE',
    entityType: 'Company',
    entityId: company.id,
    changeSource: 'MANUAL',
    reason,
    metadata: { uen: company.uen, name: company.name },
  });

  return company;
}

export async function restoreCompany(id: string, userId: string): Promise<Company> {
  const existing = await prisma.company.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Company not found');
  }

  if (!existing.deletedAt) {
    throw new Error('Company is not deleted');
  }

  const company = await prisma.company.update({
    where: { id },
    data: {
      deletedAt: null,
      deletedReason: null,
    },
  });

  await createAuditLog({
    userId,
    companyId: company.id,
    action: 'RESTORE',
    entityType: 'Company',
    entityId: company.id,
    changeSource: 'MANUAL',
    metadata: { uen: company.uen, name: company.name },
  });

  return company;
}

export async function getCompanyById(
  id: string,
  includeDeleted: boolean = false
): Promise<CompanyWithRelations | null> {
  const where: Prisma.CompanyWhereInput = { id };
  if (!includeDeleted) {
    where.deletedAt = null;
  }

  return prisma.company.findFirst({
    where,
    include: {
      addresses: {
        where: { isCurrent: true },
        select: {
          id: true,
          addressType: true,
          fullAddress: true,
          isCurrent: true,
        },
      },
      officers: {
        where: { isCurrent: true },
        select: {
          id: true,
          name: true,
          role: true,
          isCurrent: true,
        },
        orderBy: { appointmentDate: 'desc' },
      },
      shareholders: {
        where: { isCurrent: true },
        select: {
          id: true,
          name: true,
          numberOfShares: true,
          percentageHeld: true,
          isCurrent: true,
        },
        orderBy: { numberOfShares: 'desc' },
      },
      _count: {
        select: {
          documents: true,
          officers: true,
          shareholders: true,
          charges: true,
        },
      },
    },
  });
}

export async function getCompanyByUen(
  uen: string,
  includeDeleted: boolean = false
): Promise<Company | null> {
  const where: Prisma.CompanyWhereInput = { uen: uen.toUpperCase() };
  if (!includeDeleted) {
    where.deletedAt = null;
  }

  return prisma.company.findFirst({ where });
}

export async function searchCompanies(params: CompanySearchInput): Promise<{
  companies: CompanyWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const where: Prisma.CompanyWhereInput = {
    deletedAt: null,
  };

  // Text search across multiple fields
  if (params.query) {
    const searchTerm = params.query.trim();
    where.OR = [
      { uen: { contains: searchTerm, mode: 'insensitive' } },
      { name: { contains: searchTerm, mode: 'insensitive' } },
      { primarySsicCode: { contains: searchTerm, mode: 'insensitive' } },
      { primarySsicDescription: { contains: searchTerm, mode: 'insensitive' } },
      {
        officers: {
          some: {
            name: { contains: searchTerm, mode: 'insensitive' },
            isCurrent: true,
          },
        },
      },
      {
        shareholders: {
          some: {
            name: { contains: searchTerm, mode: 'insensitive' },
            isCurrent: true,
          },
        },
      },
      {
        addresses: {
          some: {
            fullAddress: { contains: searchTerm, mode: 'insensitive' },
            isCurrent: true,
          },
        },
      },
    ];
  }

  // Filters
  if (params.entityType) {
    where.entityType = params.entityType;
  }

  if (params.status) {
    where.status = params.status;
  }

  if (params.incorporationDateFrom || params.incorporationDateTo) {
    where.incorporationDate = {};
    if (params.incorporationDateFrom) {
      where.incorporationDate.gte = new Date(params.incorporationDateFrom);
    }
    if (params.incorporationDateTo) {
      where.incorporationDate.lte = new Date(params.incorporationDateTo);
    }
  }

  if (params.hasCharges !== undefined) {
    where.hasCharges = params.hasCharges;
  }

  if (params.financialYearEndMonth) {
    where.financialYearEndMonth = params.financialYearEndMonth;
  }

  // Sorting
  const orderBy: Prisma.CompanyOrderByWithRelationInput = {};
  orderBy[params.sortBy] = params.sortOrder;

  // Pagination
  const skip = (params.page - 1) * params.limit;

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      include: {
        addresses: {
          where: { isCurrent: true, addressType: 'REGISTERED_OFFICE' },
          take: 1,
          select: {
            id: true,
            addressType: true,
            fullAddress: true,
            isCurrent: true,
          },
        },
        _count: {
          select: {
            documents: true,
            officers: { where: { isCurrent: true } },
            shareholders: { where: { isCurrent: true } },
            charges: { where: { isFullyDischarged: false } },
          },
        },
      },
      orderBy,
      skip,
      take: params.limit,
    }),
    prisma.company.count({ where }),
  ]);

  return {
    companies,
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(total / params.limit),
  };
}

export async function getCompanyFullDetails(id: string): Promise<CompanyWithRelations | null> {
  return prisma.company.findFirst({
    where: { id, deletedAt: null },
    include: {
      formerNames: {
        orderBy: { effectiveFrom: 'desc' },
      },
      addresses: {
        orderBy: [{ isCurrent: 'desc' }, { effectiveFrom: 'desc' }],
      },
      officers: {
        orderBy: [{ isCurrent: 'desc' }, { appointmentDate: 'desc' }],
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              phone: true,
            },
          },
        },
      },
      shareholders: {
        orderBy: [{ isCurrent: 'desc' }, { numberOfShares: 'desc' }],
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              phone: true,
            },
          },
        },
      },
      shareCapital: {
        orderBy: { effectiveDate: 'desc' },
      },
      charges: {
        orderBy: [{ isFullyDischarged: 'asc' }, { registrationDate: 'desc' }],
      },
      documents: {
        where: { isLatest: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          documentType: true,
          originalFileName: true,
          extractionStatus: true,
          createdAt: true,
          uploadedBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      _count: {
        select: {
          documents: true,
          officers: true,
          shareholders: true,
          charges: true,
          auditLogs: true,
        },
      },
    },
  });
}

export async function getCompanyStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byEntityType: Record<string, number>;
  recentlyAdded: number;
  withOverdueFilings: number;
}> {
  const [total, byStatus, byEntityType, recentlyAdded, withOverdueFilings] = await Promise.all([
    prisma.company.count({ where: { deletedAt: null } }),
    prisma.company.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: true,
    }),
    prisma.company.groupBy({
      by: ['entityType'],
      where: { deletedAt: null },
      _count: true,
    }),
    prisma.company.count({
      where: {
        deletedAt: null,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
    }),
    // Simplified overdue check - companies where AR is overdue
    prisma.company.count({
      where: {
        deletedAt: null,
        status: 'LIVE',
        nextArDueDate: {
          lt: new Date(),
        },
      },
    }),
  ]);

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    byEntityType: Object.fromEntries(byEntityType.map((e) => [e.entityType, e._count])),
    recentlyAdded,
    withOverdueFilings,
  };
}
