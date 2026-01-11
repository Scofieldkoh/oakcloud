import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import type {
  Contract,
  ContractType,
  ContractStatus,
  Prisma,
  PrismaClient,
} from '@/generated/prisma';
import { getContractTypeLabel } from '@/lib/constants/contracts';

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

export interface CreateContractInput {
  companyId: string;
  title: string;
  contractType?: ContractType;
  status?: ContractStatus;
  startDate: string | Date;
  signedDate?: string | Date | null;
  documentId?: string | null;
  internalNotes?: string | null;
}

export interface UpdateContractInput {
  id: string;
  title?: string;
  contractType?: ContractType;
  status?: ContractStatus;
  startDate?: string | Date;
  signedDate?: string | Date | null;
  documentId?: string | null;
  internalNotes?: string | null;
}

export interface ContractSearchParams {
  companyId?: string;
  status?: ContractStatus;
  contractType?: ContractType;
  query?: string;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'title' | 'startDate' | 'status' | 'updatedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ContractWithServices extends Contract {
  services: {
    id: string;
    name: string;
    serviceType: string;
    status: string;
    rate: Prisma.Decimal | null;
    currency: string;
    frequency: string;
    startDate: Date;
    endDate: Date | null;
    scope: string | null;
    autoRenewal: boolean;
    renewalPeriodMonths: number | null;
    displayOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }[];
  document?: {
    id: string;
    fileName: string;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
  } | null;
  company?: {
    id: string;
    name: string;
    uen: string;
  };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new contract
 */
export async function createContract(
  data: CreateContractInput,
  params: TenantAwareParams
): Promise<Contract> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  // Validate company belongs to tenant
  const company = await db.company.findFirst({
    where: { id: data.companyId, tenantId, deletedAt: null },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  // Validate document belongs to tenant if provided
  if (data.documentId) {
    const document = await db.document.findFirst({
      where: { id: data.documentId, tenantId, deletedAt: null },
    });
    if (!document) {
      throw new Error('Document not found');
    }
  }

  const contract = await db.contract.create({
    data: {
      tenantId,
      companyId: data.companyId,
      title: data.title,
      contractType: data.contractType ?? 'OTHER',
      status: data.status ?? 'DRAFT',
      startDate: new Date(data.startDate),
      signedDate: data.signedDate ? new Date(data.signedDate) : null,
      documentId: data.documentId,
      internalNotes: data.internalNotes,
    },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: data.companyId,
    action: 'CREATE',
    entityType: 'Contract',
    entityId: contract.id,
    entityName: contract.title,
    summary: `Created ${getContractTypeLabel(contract.contractType)} contract "${contract.title}"`,
    changeSource: 'MANUAL',
    metadata: {
      contractType: contract.contractType,
      status: contract.status,
    },
  });

  return contract;
}

/**
 * Update a contract
 */
export async function updateContract(
  data: UpdateContractInput,
  params: TenantAwareParams
): Promise<Contract> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const existing = await db.contract.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
    include: { company: { select: { id: true } } },
  });

  if (!existing) {
    throw new Error('Contract not found');
  }

  // Validate document if being updated
  if (data.documentId && data.documentId !== existing.documentId) {
    const document = await db.document.findFirst({
      where: { id: data.documentId, tenantId, deletedAt: null },
    });
    if (!document) {
      throw new Error('Document not found');
    }
  }

  const contract = await db.contract.update({
    where: { id: data.id },
    data: {
      title: data.title,
      contractType: data.contractType,
      status: data.status,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      signedDate: data.signedDate !== undefined
        ? (data.signedDate ? new Date(data.signedDate) : null)
        : undefined,
      documentId: data.documentId !== undefined ? data.documentId : undefined,
      internalNotes: data.internalNotes !== undefined ? data.internalNotes : undefined,
    },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: existing.companyId,
    action: 'UPDATE',
    entityType: 'Contract',
    entityId: contract.id,
    entityName: contract.title,
    summary: `Updated contract "${contract.title}"`,
    changeSource: 'MANUAL',
  });

  return contract;
}

/**
 * Delete a contract (soft delete)
 */
export async function deleteContract(
  id: string,
  reason: string,
  params: TenantAwareParams
): Promise<Contract> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const existing = await db.contract.findFirst({
    where: { id, tenantId, deletedAt: null },
  });

  if (!existing) {
    throw new Error('Contract not found');
  }

  // Soft delete the contract (cascade will handle services due to onDelete: Cascade)
  // However, for soft delete we need to explicitly soft delete services
  await db.contractService.updateMany({
    where: { contractId: id, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  const contract = await db.contract.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedReason: reason,
    },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: existing.companyId,
    action: 'DELETE',
    entityType: 'Contract',
    entityId: id,
    entityName: existing.title,
    summary: `Deleted contract "${existing.title}"`,
    reason,
    changeSource: 'MANUAL',
  });

  return contract;
}

// ============================================================================
// QUERY OPERATIONS
// ============================================================================

/**
 * Get contracts for a company
 */
export async function getCompanyContracts(
  companyId: string,
  tenantId: string,
  params?: ContractSearchParams
): Promise<{ contracts: ContractWithServices[]; total: number }> {
  const {
    status,
    contractType,
    query,
    includeDeleted = false,
    page = 1,
    limit = 20,
    sortBy = 'updatedAt',
    sortOrder = 'desc',
  } = params || {};

  // Validate company belongs to tenant
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId, deletedAt: null },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  const where: Prisma.ContractWhereInput = {
    tenantId,
    companyId,
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(status && { status }),
    ...(contractType && { contractType }),
    ...(query && {
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { internalNotes: { contains: query, mode: 'insensitive' } },
      ],
    }),
  };

  const [contracts, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: {
        services: {
          where: { deletedAt: null },
          orderBy: { displayOrder: 'asc' },
        },
        document: {
          select: {
            id: true,
            fileName: true,
            originalFileName: true,
            mimeType: true,
            fileSize: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contract.count({ where }),
  ]);

  return { contracts: contracts as ContractWithServices[], total };
}

/**
 * Get a single contract by ID
 */
export async function getContractById(
  id: string,
  tenantId: string
): Promise<ContractWithServices | null> {
  const contract = await prisma.contract.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      services: {
        where: { deletedAt: null },
        orderBy: { displayOrder: 'asc' },
      },
      document: {
        select: {
          id: true,
          fileName: true,
          originalFileName: true,
          mimeType: true,
          fileSize: true,
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

  return contract as ContractWithServices | null;
}

/**
 * Get all contracts across tenant (for admin/overview)
 */
export async function getAllContracts(
  tenantId: string,
  params?: ContractSearchParams
): Promise<{ contracts: ContractWithServices[]; total: number }> {
  const {
    companyId,
    status,
    contractType,
    query,
    includeDeleted = false,
    page = 1,
    limit = 20,
    sortBy = 'updatedAt',
    sortOrder = 'desc',
  } = params || {};

  const where: Prisma.ContractWhereInput = {
    tenantId,
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(companyId && { companyId }),
    ...(status && { status }),
    ...(contractType && { contractType }),
    ...(query && {
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { internalNotes: { contains: query, mode: 'insensitive' } },
        { company: { name: { contains: query, mode: 'insensitive' } } },
      ],
    }),
  };

  const [contracts, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: {
        services: {
          where: { deletedAt: null },
          orderBy: { displayOrder: 'asc' },
        },
        document: {
          select: {
            id: true,
            fileName: true,
            originalFileName: true,
            mimeType: true,
            fileSize: true,
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
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contract.count({ where }),
  ]);

  return { contracts: contracts as ContractWithServices[], total };
}
