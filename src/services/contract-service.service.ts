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
import type { DeadlineExclusionInput, DeadlineRuleInput } from '@/lib/validations/service';

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

// Input type that includes 'BOTH' for API layer (splits into two services)
export type InputServiceType = ServiceType | 'BOTH';

export interface CreateContractServiceInput {
  contractId: string;
  name: string;
  serviceType?: InputServiceType;
  status?: ServiceStatus;
  rate?: number | null;
  currency?: string;
  frequency?: BillingFrequency;
  startDate: string | Date;
  endDate?: string | Date | null;
  scope?: string | null;
  displayOrder?: number;
  // Service template integration for deadline management (backward compatible)
  serviceTemplateCode?: string | null;
  deadlineTemplateCodes?: string[] | null;
  generateDeadlines?: boolean;
  // NEW: Custom deadline rules
  deadlineRules?: DeadlineRuleInput[] | null;
  excludedDeadlines?: DeadlineExclusionInput[] | null;
  fyeYearOverride?: number | null;
  // For "BOTH" service type - creates linked one-time and recurring services
  oneTimeSuffix?: string | null;
  recurringSuffix?: string | null;
  oneTimeRate?: number | null;
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
  scope?: string | null;
  displayOrder?: number;
  serviceTemplateCode?: string | null;
  deadlineRules?: DeadlineRuleInput[] | null;
  fyeYearOverride?: number | null;
  excludedDeadlines?: DeadlineExclusionInput[] | null;
}

export interface ServiceSearchParams {
  contractId?: string;
  companyId?: string;
  status?: ServiceStatus;
  serviceType?: InputServiceType;
  query?: string;
  startDateFrom?: string | Date | null;
  startDateTo?: string | Date | null;
  endDateFrom?: string | Date | null;
  endDateTo?: string | Date | null;
  rateFrom?: number;
  rateTo?: number;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'startDate' | 'endDate' | 'status' | 'rate' | 'serviceType' | 'company' | 'updatedAt' | 'createdAt';
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

/**
 * Build the exclusive threshold for "after cutoff date" comparisons.
 * Example: cutoff=2026-02-05 -> delete deadlines with due date >= 2026-02-06 00:00.
 */
function getAfterDateThreshold(cutoffDate: Date): Date {
  const threshold = new Date(cutoffDate);
  threshold.setHours(0, 0, 0, 0);
  threshold.setDate(threshold.getDate() + 1);
  return threshold;
}

async function pruneServiceDeadlinesAfterDate(
  serviceId: string,
  companyId: string,
  cutoffDate: Date,
  params: Pick<TenantAwareParams, 'tenantId' | 'tx'>
): Promise<number> {
  const { tenantId, tx } = params;
  const db = tx || prisma;
  const threshold = getAfterDateThreshold(cutoffDate);

  const result = await db.deadline.deleteMany({
    where: {
      tenantId,
      companyId,
      contractServiceId: serviceId,
      deletedAt: null,
      statutoryDueDate: {
        gte: threshold,
      },
    },
  });

  return result.count;
}

async function deleteAllServiceDeadlines(
  serviceId: string,
  companyId: string,
  params: Pick<TenantAwareParams, 'tenantId' | 'tx'>
): Promise<number> {
  const { tenantId, tx } = params;
  const db = tx || prisma;

  const result = await db.deadline.deleteMany({
    where: {
      tenantId,
      companyId,
      contractServiceId: serviceId,
      deletedAt: null,
    },
  });

  return result.count;
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
  const fyeYearOverride = data.fyeYearOverride ?? null;

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
      // BOTH is handled by createBothServices, so this should always be RECURRING or ONE_TIME
      serviceType: (data.serviceType === 'BOTH' ? 'RECURRING' : data.serviceType) ?? 'RECURRING',
      status: data.status ?? 'ACTIVE',
      rate: data.rate != null ? data.rate : null,
      currency: data.currency ?? 'SGD',
      frequency: data.frequency ?? 'MONTHLY',
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      scope: data.scope,
      displayOrder: data.displayOrder ?? 0,
      // Store template code for reference
      serviceTemplateCode: data.serviceTemplateCode,
      fyeYearOverride: data.fyeYearOverride ?? null,
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
  }, tx as unknown as Prisma.TransactionClient | undefined);

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
        { tenantId, userId, tx: db },
        {
          ...(fyeYearOverride ? { fyeYearOverride } : {}),
          ...(data.excludedDeadlines && data.excludedDeadlines.length > 0
            ? { excludedDeadlines: data.excludedDeadlines }
            : {}),
        }
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
 * Result type for creating both services
 */
export interface CreateBothServicesResult {
  oneTimeService: ContractService & { deadlinesGenerated?: number };
  recurringService: ContractService & { deadlinesGenerated?: number };
}

function reorderDeadlineRules(rules: DeadlineRuleInput[]): DeadlineRuleInput[] {
  return rules.map((rule, index) => ({
    ...rule,
    displayOrder: index,
  }));
}

function splitDeadlineRulesForBothServices(
  rules: DeadlineRuleInput[] | null | undefined
): {
  oneTimeRules: DeadlineRuleInput[] | null;
  recurringRules: DeadlineRuleInput[] | null;
} {
  if (!rules || rules.length === 0) {
    return {
      oneTimeRules: null,
      recurringRules: null,
    };
  }

  const oneTimeRules = rules.filter(
    (rule) => !rule.isRecurring || rule.frequency === 'ONE_TIME'
  );
  const recurringRules = rules.filter(
    (rule) => rule.isRecurring && rule.frequency !== 'ONE_TIME'
  );

  return {
    oneTimeRules: oneTimeRules.length > 0 ? reorderDeadlineRules(oneTimeRules) : null,
    recurringRules: recurringRules.length > 0 ? reorderDeadlineRules(recurringRules) : null,
  };
}

/**
 * Create two linked services (one-time + recurring) for "BOTH" service type
 */
export async function createBothServices(
  data: CreateContractServiceInput,
  params: TenantAwareParams
): Promise<CreateBothServicesResult> {
  const { tenantId, userId } = params;

  // Default suffixes if not provided
  const oneTimeSuffix = data.oneTimeSuffix?.trim() || ' (Setup)';
  const recurringSuffix = data.recurringSuffix?.trim() || ' (Recurring)';
  const { oneTimeRules, recurringRules } = splitDeadlineRulesForBothServices(data.deadlineRules);

  // Use a transaction to ensure both services are created or none
  return await prisma.$transaction(async (tx) => {
    // Create the one-time service first
    const oneTimeData: CreateContractServiceInput = {
      ...data,
      name: data.name + oneTimeSuffix,
      serviceType: 'ONE_TIME',
      frequency: 'ONE_TIME',
      rate: data.oneTimeRate ?? data.rate,
      deadlineRules: oneTimeRules,
    };

    const oneTimeService = await createContractService(oneTimeData, {
      tenantId,
      userId,
      tx: tx as unknown as PrismaTransactionClient
    });

    // Create the recurring service, linked to the one-time service
    const recurringData: CreateContractServiceInput = {
      ...data,
      name: data.name + recurringSuffix,
      serviceType: 'RECURRING',
      frequency: data.frequency === 'ONE_TIME' ? 'ANNUALLY' : data.frequency,
      // Rate stays as the original rate for recurring
      deadlineRules: recurringRules,
    };

    const recurringService = await createContractService(recurringData, {
      tenantId,
      userId,
      tx: tx as unknown as PrismaTransactionClient
    });

    // Link the services together
    await tx.contractService.update({
      where: { id: oneTimeService.id },
      data: { linkedServiceId: recurringService.id },
    });

    // Create audit log for the linked creation
    await createAuditLog({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'ContractService',
      entityId: oneTimeService.id,
      entityName: data.name,
      summary: `Created linked services: "${oneTimeService.name}" and "${recurringService.name}"`,
      changeSource: 'MANUAL',
      metadata: {
        linkedServiceIds: [oneTimeService.id, recurringService.id],
        oneTimeServiceId: oneTimeService.id,
        recurringServiceId: recurringService.id,
      },
    }, tx);

    return {
      oneTimeService: { ...oneTimeService, linkedServiceId: recurringService.id },
      recurringService,
    };
  });
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

  const nextStatus = data.status ?? existing.status;
  const nextEndDate = data.endDate !== undefined
    ? (data.endDate ? new Date(data.endDate) : null)
    : existing.endDate;

  const wasAlreadyStopped = existing.status === 'CANCELLED' || existing.status === 'COMPLETED';
  const isNowStopped = nextStatus === 'CANCELLED' || nextStatus === 'COMPLETED';
  const stoppedNow = !wasAlreadyStopped && isNowStopped;

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
      scope: data.scope !== undefined ? data.scope : undefined,
      displayOrder: data.displayOrder,
      serviceTemplateCode: data.serviceTemplateCode !== undefined ? data.serviceTemplateCode : undefined,
      fyeYearOverride: data.fyeYearOverride !== undefined ? data.fyeYearOverride : undefined,
    },
  });

  const cutoffDate = nextEndDate ?? (stoppedNow ? new Date() : null);
  if (cutoffDate) {
    await pruneServiceDeadlinesAfterDate(service.id, existing.contract.companyId, cutoffDate, {
      tenantId,
      tx,
    });
  }

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
  }, tx as unknown as Prisma.TransactionClient | undefined);

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

  await deleteAllServiceDeadlines(id, existing.contract.companyId, {
    tenantId,
    tx,
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
  }, tx as unknown as Prisma.TransactionClient | undefined);

  return service;
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk update end date for services
 */
export async function bulkUpdateServiceEndDate(
  serviceIds: string[],
  endDate: string | Date | null,
  params: TenantAwareParams
): Promise<number> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;
  const normalizedEndDate = endDate ? new Date(endDate) : null;

  const services = await db.contractService.findMany({
    where: {
      id: { in: serviceIds },
      tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      contract: {
        select: {
          id: true,
          title: true,
          companyId: true,
        },
      },
    },
  });

  if (services.length === 0) {
    return 0;
  }

  const result = await db.contractService.updateMany({
    where: {
      id: { in: services.map((service) => service.id) },
      tenantId,
      deletedAt: null,
    },
    data: {
      endDate: normalizedEndDate,
    },
  });

  if (normalizedEndDate) {
    for (const service of services) {
      await pruneServiceDeadlinesAfterDate(service.id, service.contract.companyId, normalizedEndDate, {
        tenantId,
        tx: db,
      });
    }
  }

  await createAuditLog({
    tenantId,
    userId,
    action: 'BULK_UPDATE',
    entityType: 'ContractService',
    entityId: services.map((service) => service.id).join(','),
    summary: `Bulk updated end date for ${result.count} services`,
    changeSource: 'MANUAL',
    metadata: {
      serviceIds: services.map((service) => service.id),
      endDate: normalizedEndDate ? normalizedEndDate.toISOString() : null,
    },
  }, tx as unknown as Prisma.TransactionClient | undefined);

  return result.count;
}

/**
 * Bulk hard delete services (permanent)
 */
export async function bulkHardDeleteServices(
  serviceIds: string[],
  params: TenantAwareParams
): Promise<number> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const services = await db.contractService.findMany({
    where: {
      id: { in: serviceIds },
      tenantId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      contract: {
        select: {
          id: true,
          title: true,
          companyId: true,
        },
      },
    },
  });

  if (services.length === 0) {
    return 0;
  }

  const result = await db.contractService.deleteMany({
    where: {
      id: { in: services.map((service) => service.id) },
      tenantId,
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'BULK_UPDATE',
    entityType: 'ContractService',
    entityId: services.map((service) => service.id).join(','),
    summary: `Bulk hard deleted ${result.count} services`,
    changeSource: 'MANUAL',
    metadata: {
      serviceIds: services.map((service) => service.id),
    },
  }, tx as unknown as Prisma.TransactionClient | undefined);

  return result.count;
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
    startDateFrom,
    startDateTo,
    endDateFrom,
    endDateTo,
    rateFrom,
    rateTo,
    includeDeleted = false,
    page = 1,
    limit = 20,
    sortBy = 'updatedAt',
    sortOrder = 'desc',
  } = params || {};

  const andFilters: Prisma.ContractServiceWhereInput[] = [];

  if (startDateFrom || startDateTo) {
    andFilters.push({
      startDate: {
        ...(startDateFrom ? { gte: new Date(startDateFrom) } : {}),
        ...(startDateTo ? { lte: new Date(startDateTo) } : {}),
      },
    });
  }

  if (endDateFrom || endDateTo) {
    andFilters.push({
      endDate: {
        ...(endDateFrom ? { gte: new Date(endDateFrom) } : {}),
        ...(endDateTo ? { lte: new Date(endDateTo) } : {}),
      },
    });
  }

  const where: Prisma.ContractServiceWhereInput = {
    tenantId,
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(contractId && { contractId }),
    ...(companyId && { contract: { companyId } }),
    ...(status && { status }),
    // BOTH is not a valid Prisma ServiceType - skip filter if BOTH (shows all types)
    ...(serviceType && serviceType !== 'BOTH' && { serviceType: serviceType as ServiceType }),
    ...(query && {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { scope: { contains: query, mode: 'insensitive' } },
        { contract: { title: { contains: query, mode: 'insensitive' } } },
        { contract: { company: { name: { contains: query, mode: 'insensitive' } } } },
      ],
    }),
    ...(andFilters.length > 0 ? { AND: andFilters } : {}),
    ...(rateFrom !== undefined || rateTo !== undefined
      ? {
        rate: {
          ...(rateFrom !== undefined ? { gte: rateFrom } : {}),
          ...(rateTo !== undefined ? { lte: rateTo } : {}),
        },
      }
      : {}),
  };

  // Handle sortBy for nested fields
  let orderBy: Prisma.ContractServiceOrderByWithRelationInput = {};
  if (sortBy === 'company') {
    orderBy = { contract: { company: { name: sortOrder } } };
  } else if (sortBy === 'name' || sortBy === 'startDate' || sortBy === 'endDate' ||
    sortBy === 'status' || sortBy === 'rate' || sortBy === 'serviceType' ||
    sortBy === 'updatedAt' || sortBy === 'createdAt') {
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
