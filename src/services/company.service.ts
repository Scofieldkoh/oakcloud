/**
 * Company Service
 *
 * Business logic for company management including CRUD operations,
 * search, and statistics. Fully integrated with multi-tenancy support.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog, computeChanges, type AuditContext } from '@/lib/audit';
import { canAddCompany } from '@/lib/tenant';
import type {
  CreateCompanyInput,
  UpdateCompanyInput,
  CompanySearchInput,
} from '@/lib/validations/company';
import type { Prisma, Company } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// Types
// ============================================================================

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

export interface TenantAwareParams {
  tenantId: string;
  userId: string;
}

// Fields tracked for audit logging
const TRACKED_FIELDS: (keyof Company)[] = [
  'name',
  'formerName',
  'dateOfNameChange',
  'uen',
  'entityType',
  'status',
  'statusDate',
  'incorporationDate',
  'dateOfAddress',
  'primarySsicCode',
  'primarySsicDescription',
  'secondarySsicCode',
  'secondarySsicDescription',
  'financialYearEndDay',
  'financialYearEndMonth',
  'fyeAsAtLastAr',
  'homeCurrency',
  'paidUpCapitalAmount',
  'issuedCapitalAmount',
  'isGstRegistered',
  'gstRegistrationNumber',
  'internalNotes',
];

// ============================================================================
// Create Company
// ============================================================================

export async function createCompany(
  data: CreateCompanyInput,
  params: TenantAwareParams
): Promise<Company> {
  const { tenantId, userId } = params;

  // Check tenant company limit
  const canAdd = await canAddCompany(tenantId);
  if (!canAdd) {
    throw new Error('Tenant has reached the maximum number of companies');
  }

  // Check UEN uniqueness within tenant
  const existingUen = await prisma.company.findFirst({
    where: { tenantId, uen: data.uen.toUpperCase(), deletedAt: null },
  });

  if (existingUen) {
    throw new Error('A company with this UEN already exists');
  }

  // Validate financial year fields if provided
  if (data.financialYearEndDay !== undefined && data.financialYearEndDay !== null) {
    if (data.financialYearEndDay < 1 || data.financialYearEndDay > 31) {
      throw new Error('Financial year end day must be between 1 and 31');
    }
  }
  if (data.financialYearEndMonth !== undefined && data.financialYearEndMonth !== null) {
    if (data.financialYearEndMonth < 1 || data.financialYearEndMonth > 12) {
      throw new Error('Financial year end month must be between 1 and 12');
    }
  }

  const company = await prisma.company.create({
    data: {
      tenantId,
      uen: data.uen.toUpperCase(),
      name: data.name,
      formerName: data.formerName,
      dateOfNameChange: data.dateOfNameChange ? new Date(data.dateOfNameChange) : null,
      entityType: data.entityType,
      status: data.status,
      statusDate: data.statusDate ? new Date(data.statusDate) : null,
      incorporationDate: data.incorporationDate ? new Date(data.incorporationDate) : null,
      registrationDate: data.registrationDate ? new Date(data.registrationDate) : null,
      dateOfAddress: data.dateOfAddress ? new Date(data.dateOfAddress) : null,
      primarySsicCode: data.primarySsicCode,
      primarySsicDescription: data.primarySsicDescription,
      secondarySsicCode: data.secondarySsicCode,
      secondarySsicDescription: data.secondarySsicDescription,
      financialYearEndDay: data.financialYearEndDay,
      financialYearEndMonth: data.financialYearEndMonth,
      fyeAsAtLastAr: data.fyeAsAtLastAr ? new Date(data.fyeAsAtLastAr) : null,
      homeCurrency: data.homeCurrency,
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
    tenantId,
    userId,
    companyId: company.id,
    action: 'CREATE',
    entityType: 'Company',
    entityId: company.id,
    entityName: company.name,
    summary: `Created company "${company.name}" (UEN: ${company.uen})`,
    changeSource: 'MANUAL',
    metadata: { uen: company.uen, name: company.name },
  });

  return company;
}

// ============================================================================
// Update Company
// ============================================================================

export async function updateCompany(
  data: UpdateCompanyInput,
  params: TenantAwareParams,
  reason?: string
): Promise<Company> {
  const { tenantId, userId } = params;

  const existing = await prisma.company.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Company not found');
  }

  // Check UEN uniqueness if being changed
  if (data.uen && data.uen.toUpperCase() !== existing.uen) {
    const existingUen = await prisma.company.findFirst({
      where: {
        tenantId,
        uen: data.uen.toUpperCase(),
        deletedAt: null,
        NOT: { id: data.id },
      },
    });

    if (existingUen) {
      throw new Error('A company with this UEN already exists');
    }
  }

  const updateData: Prisma.CompanyUpdateInput = {};

  if (data.uen !== undefined) updateData.uen = data.uen.toUpperCase();
  if (data.name !== undefined) updateData.name = data.name;
  if (data.formerName !== undefined) updateData.formerName = data.formerName;
  if (data.dateOfNameChange !== undefined)
    updateData.dateOfNameChange = data.dateOfNameChange ? new Date(data.dateOfNameChange) : null;
  if (data.entityType !== undefined) updateData.entityType = data.entityType;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.statusDate !== undefined)
    updateData.statusDate = data.statusDate ? new Date(data.statusDate) : null;
  if (data.incorporationDate !== undefined)
    updateData.incorporationDate = data.incorporationDate ? new Date(data.incorporationDate) : null;
  if (data.registrationDate !== undefined)
    updateData.registrationDate = data.registrationDate ? new Date(data.registrationDate) : null;
  if (data.dateOfAddress !== undefined)
    updateData.dateOfAddress = data.dateOfAddress ? new Date(data.dateOfAddress) : null;
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
  if (data.fyeAsAtLastAr !== undefined)
    updateData.fyeAsAtLastAr = data.fyeAsAtLastAr ? new Date(data.fyeAsAtLastAr) : null;
  if (data.homeCurrency !== undefined) updateData.homeCurrency = data.homeCurrency;
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
    const changedFields = Object.keys(changes).join(', ');
    await createAuditLog({
      tenantId,
      userId,
      companyId: company.id,
      action: 'UPDATE',
      entityType: 'Company',
      entityId: company.id,
      entityName: company.name,
      summary: `Updated company "${company.name}" (${changedFields})`,
      changeSource: 'MANUAL',
      changes,
      reason,
    });
  }

  return company;
}

// ============================================================================
// Delete Company
// ============================================================================

export async function deleteCompany(
  id: string,
  params: TenantAwareParams,
  reason: string
): Promise<Company> {
  const { tenantId, userId } = params;

  const existing = await prisma.company.findFirst({
    where: { id, tenantId },
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
    tenantId,
    userId,
    companyId: company.id,
    action: 'DELETE',
    entityType: 'Company',
    entityId: company.id,
    entityName: company.name,
    summary: `Deleted company "${company.name}" (UEN: ${company.uen})`,
    changeSource: 'MANUAL',
    reason,
    metadata: { uen: company.uen, name: company.name },
  });

  return company;
}

// ============================================================================
// Restore Company
// ============================================================================

export async function restoreCompany(
  id: string,
  params: TenantAwareParams
): Promise<Company> {
  const { tenantId, userId } = params;

  const existing = await prisma.company.findFirst({
    where: { id, tenantId },
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
    tenantId,
    userId,
    companyId: company.id,
    action: 'RESTORE',
    entityType: 'Company',
    entityId: company.id,
    entityName: company.name,
    summary: `Restored company "${company.name}" (UEN: ${company.uen})`,
    changeSource: 'MANUAL',
    metadata: { uen: company.uen, name: company.name },
  });

  return company;
}

// ============================================================================
// Get Company
// ============================================================================

export interface GetCompanyOptions {
  includeDeleted?: boolean;
  /**
   * Skip tenant filtering - ONLY use for SUPER_ADMIN operations that need
   * cross-tenant access. Regular operations MUST always provide tenantId.
   */
  skipTenantFilter?: boolean;
}

export async function getCompanyById(
  id: string,
  tenantId: string | null,
  options: GetCompanyOptions = {}
): Promise<CompanyWithRelations | null> {
  const { includeDeleted = false, skipTenantFilter = false } = options;

  // Require tenantId unless explicitly skipping for SUPER_ADMIN
  if (!tenantId && !skipTenantFilter) {
    throw new Error('tenantId is required for company queries');
  }

  const where: Prisma.CompanyWhereInput = { id };

  if (tenantId && !skipTenantFilter) {
    where.tenantId = tenantId;
  }

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
  tenantId: string | null,
  options: GetCompanyOptions = {}
): Promise<Company | null> {
  const { includeDeleted = false, skipTenantFilter = false } = options;

  // Require tenantId unless explicitly skipping for SUPER_ADMIN
  if (!tenantId && !skipTenantFilter) {
    throw new Error('tenantId is required for company queries');
  }

  const where: Prisma.CompanyWhereInput = { uen: uen.toUpperCase() };

  if (tenantId && !skipTenantFilter) {
    where.tenantId = tenantId;
  }

  if (!includeDeleted) {
    where.deletedAt = null;
  }

  return prisma.company.findFirst({ where });
}

// ============================================================================
// Search Companies
// ============================================================================

export interface SearchCompaniesOptions {
  /**
   * Skip tenant filtering - ONLY use for SUPER_ADMIN operations that need
   * cross-tenant access. Regular operations MUST always provide tenantId.
   */
  skipTenantFilter?: boolean;
  /**
   * Filter to specific company IDs - used for company-scoped users who have
   * access to multiple companies via role assignments.
   */
  companyIds?: string[];
}

export async function searchCompanies(
  params: CompanySearchInput,
  tenantId: string | null,
  options: SearchCompaniesOptions = {}
): Promise<{
  companies: CompanyWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const { skipTenantFilter = false, companyIds } = options;

  // Require tenantId unless explicitly skipping for SUPER_ADMIN
  if (!tenantId && !skipTenantFilter) {
    throw new Error('tenantId is required for company queries');
  }

  const where: Prisma.CompanyWhereInput = {
    deletedAt: null,
  };

  // Tenant scope
  if (tenantId && !skipTenantFilter) {
    where.tenantId = tenantId;
  }

  // Company IDs filter (for users with specific company role assignments)
  if (companyIds && companyIds.length > 0) {
    where.id = { in: companyIds };
  }

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

// ============================================================================
// Get Company Full Details
// ============================================================================

export async function getCompanyFullDetails(
  id: string,
  tenantId: string | null,
  options: GetCompanyOptions = {}
): Promise<CompanyWithRelations | null> {
  const { skipTenantFilter = false } = options;

  // Require tenantId unless explicitly skipping for SUPER_ADMIN
  if (!tenantId && !skipTenantFilter) {
    throw new Error('tenantId is required for company queries');
  }

  const where: Prisma.CompanyWhereInput = { id, deletedAt: null };

  if (tenantId && !skipTenantFilter) {
    where.tenantId = tenantId;
  }

  return prisma.company.findFirst({
    where,
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

// ============================================================================
// Company Statistics
// ============================================================================

export interface GetCompanyStatsOptions {
  /**
   * Skip tenant filtering - ONLY use for SUPER_ADMIN operations that need
   * cross-tenant statistics. Regular operations MUST always provide tenantId.
   */
  skipTenantFilter?: boolean;
}

export async function getCompanyStats(
  tenantId: string | null,
  options: GetCompanyStatsOptions = {}
): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byEntityType: Record<string, number>;
  recentlyAdded: number;
  withOverdueFilings: number;
}> {
  const { skipTenantFilter = false } = options;

  // Require tenantId unless explicitly skipping for SUPER_ADMIN
  if (!tenantId && !skipTenantFilter) {
    throw new Error('tenantId is required for company statistics');
  }

  const baseWhere: Prisma.CompanyWhereInput = { deletedAt: null };

  if (tenantId && !skipTenantFilter) {
    baseWhere.tenantId = tenantId;
  }

  const [total, byStatus, byEntityType, recentlyAdded, withOverdueFilings] = await Promise.all([
    prisma.company.count({ where: baseWhere }),
    prisma.company.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: true,
    }),
    prisma.company.groupBy({
      by: ['entityType'],
      where: baseWhere,
      _count: true,
    }),
    prisma.company.count({
      where: {
        ...baseWhere,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
    }),
    // Simplified overdue check - companies where AR is overdue
    prisma.company.count({
      where: {
        ...baseWhere,
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
