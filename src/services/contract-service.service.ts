import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import type {
  ContractService,
  ServiceType,
  ServiceStatus,
  BillingFrequency,
  Prisma,
  PrismaClient,
} from '@/generated/prisma';
import { getServiceTypeLabel } from '@/lib/constants/contracts';
import { generateDeadlinesFromRules } from '@/services/deadline-generation.service';
import {
  createDeadlineRules,
} from '@/services/deadline-rule.service';
import type { DeadlineRuleInput } from '@/lib/validations/service';

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

export interface CreateContractServiceInput {
  contractId: string;
  name: string;
  serviceType?: ServiceType;
  status?: ServiceStatus;
  rate?: number | null;
  currency?: string;
  frequency?: BillingFrequency;
  startDate: string | Date;
  endDate?: string | Date | null;
  nextBillingDate?: string | Date | null;
  scope?: string | null;
  autoRenewal?: boolean;
  renewalPeriodMonths?: number | null;
  displayOrder?: number;
  // Service template integration for deadline management (backward compatible)
  serviceTemplateCode?: string | null;
  deadlineTemplateCodes?: string[] | null;
  generateDeadlines?: boolean;
  // NEW: Custom deadline rules
  deadlineRules?: DeadlineRuleInput[] | null;
}

export interface UpdateContractServiceInput {
  id: string;
  name?: string;
  serviceType?: ServiceType;
  status?: ServiceStatus;
  rate?: number | null;
  currency?: string;
  frequency?: BillingFrequency;
  startDate?: string | Date;
  endDate?: string | Date | null;
  nextBillingDate?: string | Date | null;
  scope?: string | null;
  autoRenewal?: boolean;
  renewalPeriodMonths?: number | null;
  displayOrder?: number;
}

export interface ServiceSearchParams {
  contractId?: string;
  companyId?: string;
  status?: ServiceStatus;
  serviceType?: ServiceType;
  query?: string;
  endDateFrom?: string | Date | null;
  endDateTo?: string | Date | null;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'startDate' | 'endDate' | 'status' | 'rate' | 'updatedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ContractServiceWithRelations extends ContractService {
  contract?: {
    id: string;
    title: string;
    contractType: string;
    status: string;
    companyId: string;
    company?: {
      id: string;
      name: string;
      uen: string;
    };
  };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new contract service
 */
export async function createContractService(
  data: CreateContractServiceInput,
  params: TenantAwareParams
): Promise<ContractService & { deadlinesGenerated?: number }> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  // Validate contract belongs to tenant
  const contract = await db.contract.findFirst({
    where: { id: data.contractId, tenantId, deletedAt: null },
    include: { company: { select: { id: true, name: true } } },
  });

  if (!contract) {
    throw new Error('Contract not found');
  }

  const service = await db.contractService.create({
    data: {
      tenantId,
      contractId: data.contractId,
      name: data.name,
      serviceType: data.serviceType ?? 'RECURRING',
      status: data.status ?? 'ACTIVE',
      rate: data.rate != null ? data.rate : null,
      currency: data.currency ?? 'SGD',
      frequency: data.frequency ?? 'MONTHLY',
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      nextBillingDate: data.nextBillingDate ? new Date(data.nextBillingDate) : null,
      scope: data.scope,
      autoRenewal: data.autoRenewal ?? false,
      renewalPeriodMonths: data.renewalPeriodMonths,
      displayOrder: data.displayOrder ?? 0,
      // Store template code for reference
      serviceTemplateCode: data.serviceTemplateCode,
    },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: contract.companyId,
    action: 'CREATE',
    entityType: 'ContractService',
    entityId: service.id,
    entityName: service.name,
    summary: `Added ${getServiceTypeLabel(service.serviceType)} service "${service.name}" to contract "${contract.title}"`,
    changeSource: 'MANUAL',
    metadata: {
      serviceType: service.serviceType,
      status: service.status,
      contractId: contract.id,
      contractTitle: contract.title,
      serviceTemplateCode: data.serviceTemplateCode,
    },
  });

  // Generate deadlines from rules
  let deadlinesGenerated = 0;

  if (data.deadlineRules && data.deadlineRules.length > 0) {
    try {
      // Create deadline rules
      await createDeadlineRules(service.id, data.deadlineRules, { tenantId, userId, tx: db });

      // Mark service as having custom deadlines
      await db.contractService.update({
        where: { id: service.id },
        data: { hasCustomDeadlines: true },
      });

      // Generate initial deadlines from rules
      const result = await generateDeadlinesFromRules(
        service.id,
        contract.companyId,
        { tenantId, userId, tx: db }
      );
      deadlinesGenerated = result.created;
    } catch (error) {
      // Log but don't fail the service creation
      console.error('Error creating deadline rules for service:', error);
    }
  }

  return { ...service, deadlinesGenerated };
}

/**
 * Update a contract service
 */
export async function updateContractService(
  data: UpdateContractServiceInput,
  params: TenantAwareParams
): Promise<ContractService> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const existing = await db.contractService.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
    include: {
      contract: {
        select: { id: true, title: true, companyId: true },
      },
    },
  });

  if (!existing) {
    throw new Error('Service not found');
  }

  const service = await db.contractService.update({
    where: { id: data.id },
    data: {
      name: data.name,
      serviceType: data.serviceType,
      status: data.status,
      rate: data.rate !== undefined ? (data.rate != null ? data.rate : null) : undefined,
      currency: data.currency,
      frequency: data.frequency,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate !== undefined
        ? (data.endDate ? new Date(data.endDate) : null)
        : undefined,
      nextBillingDate: data.nextBillingDate !== undefined
        ? (data.nextBillingDate ? new Date(data.nextBillingDate) : null)
        : undefined,
      scope: data.scope !== undefined ? data.scope : undefined,
      autoRenewal: data.autoRenewal,
      renewalPeriodMonths: data.renewalPeriodMonths !== undefined ? data.renewalPeriodMonths : undefined,
      displayOrder: data.displayOrder,
    },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: existing.contract.companyId,
    action: 'UPDATE',
    entityType: 'ContractService',
    entityId: service.id,
    entityName: service.name,
    summary: `Updated service "${service.name}" in contract "${existing.contract.title}"`,
    changeSource: 'MANUAL',
  });

  return service;
}

/**
 * Delete a contract service (soft delete)
 */
export async function deleteContractService(
  id: string,
  params: TenantAwareParams
): Promise<ContractService> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const existing = await db.contractService.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      contract: {
        select: { id: true, title: true, companyId: true },
      },
    },
  });

  if (!existing) {
    throw new Error('Service not found');
  }

  const service = await db.contractService.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: existing.contract.companyId,
    action: 'DELETE',
    entityType: 'ContractService',
    entityId: id,
    entityName: existing.name,
    summary: `Deleted service "${existing.name}" from contract "${existing.contract.title}"`,
    changeSource: 'MANUAL',
  });

  return service;
}

// ============================================================================
// QUERY OPERATIONS
// ============================================================================

/**
 * Get services for a specific contract
 */
export async function getContractServices(
  contractId: string,
  tenantId: string
): Promise<ContractService[]> {
  // Validate contract belongs to tenant
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, tenantId, deletedAt: null },
  });

  if (!contract) {
    throw new Error('Contract not found');
  }

  return prisma.contractService.findMany({
    where: {
      contractId,
      tenantId,
      deletedAt: null,
    },
    orderBy: { displayOrder: 'asc' },
  });
}

/**
 * Get a single service by ID
 */
export async function getContractServiceById(
  id: string,
  tenantId: string
): Promise<ContractServiceWithRelations | null> {
  return prisma.contractService.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      contract: {
        select: {
          id: true,
          title: true,
          contractType: true,
          status: true,
          companyId: true,
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
  }) as Promise<ContractServiceWithRelations | null>;
}

/**
 * Get all services across tenant (for Services Overview)
 */
export async function getAllServices(
  tenantId: string,
  params?: ServiceSearchParams
): Promise<{ services: ContractServiceWithRelations[]; total: number }> {
  const {
    contractId,
    companyId,
    status,
    serviceType,
    query,
    endDateFrom,
    endDateTo,
    includeDeleted = false,
    page = 1,
    limit = 20,
    sortBy = 'updatedAt',
    sortOrder = 'desc',
  } = params || {};

  const where: Prisma.ContractServiceWhereInput = {
    tenantId,
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(contractId && { contractId }),
    ...(companyId && { contract: { companyId } }),
    ...(status && { status }),
    ...(serviceType && { serviceType }),
    ...(query && {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { scope: { contains: query, mode: 'insensitive' } },
        { contract: { title: { contains: query, mode: 'insensitive' } } },
        { contract: { company: { name: { contains: query, mode: 'insensitive' } } } },
      ],
    }),
    // Date range filters for end date
    ...(endDateFrom || endDateTo
      ? {
          AND: [
            ...(endDateFrom
              ? [{ endDate: { gte: new Date(endDateFrom) } }]
              : []),
            ...(endDateTo
              ? [{ endDate: { lte: new Date(endDateTo) } }]
              : []),
          ],
        }
      : {}),
  };

  // Handle sortBy for nested fields
  let orderBy: Prisma.ContractServiceOrderByWithRelationInput = {};
  if (sortBy === 'name' || sortBy === 'startDate' || sortBy === 'endDate' ||
      sortBy === 'status' || sortBy === 'rate' || sortBy === 'updatedAt' || sortBy === 'createdAt') {
    orderBy = { [sortBy]: sortOrder };
  }

  const [services, total] = await Promise.all([
    prisma.contractService.findMany({
      where,
      include: {
        contract: {
          select: {
            id: true,
            title: true,
            contractType: true,
            status: true,
            companyId: true,
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
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contractService.count({ where }),
  ]);

  return { services: services as ContractServiceWithRelations[], total };
}

/**
 * Get services expiring soon (for notifications/dashboard)
 */
export async function getExpiringServices(
  tenantId: string,
  daysAhead: number = 30
): Promise<ContractServiceWithRelations[]> {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const services = await prisma.contractService.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: 'ACTIVE',
      endDate: {
        not: null,
        lte: futureDate,
        gte: new Date(),
      },
    },
    include: {
      contract: {
        select: {
          id: true,
          title: true,
          contractType: true,
          status: true,
          companyId: true,
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
    orderBy: { endDate: 'asc' },
  });

  return services as ContractServiceWithRelations[];
}

/**
 * Reorder services within a contract
 */
export async function reorderServices(
  contractId: string,
  serviceIds: string[],
  params: TenantAwareParams
): Promise<void> {
  const { tenantId, tx } = params;
  const db = tx || prisma;

  // Validate contract belongs to tenant
  const contract = await db.contract.findFirst({
    where: { id: contractId, tenantId, deletedAt: null },
  });

  if (!contract) {
    throw new Error('Contract not found');
  }

  // Update display order for each service
  await Promise.all(
    serviceIds.map((serviceId, index) =>
      db.contractService.updateMany({
        where: { id: serviceId, contractId, tenantId },
        data: { displayOrder: index },
      })
    )
  );
}
