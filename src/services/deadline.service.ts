/**
 * Deadline Service
 *
 * Business logic for deadline management including CRUD operations,
 * search, statistics, and bulk operations.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import type {
  Deadline,
  DeadlineCategory,
  DeadlineStatus,
  DeadlineBillingStatus,
  DeadlineGenerationType,
  Prisma,
  PrismaClient,
} from '@/generated/prisma';

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

export type DeadlineTimingStatus =
  | 'OVERDUE'
  | 'DUE_SOON'
  | 'UPCOMING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'WAIVED';

const ACTIVE_WORKFLOW_STATUSES: DeadlineStatus[] = [
  'PENDING',
  'PENDING_CLIENT',
  'IN_PROGRESS',
  'PENDING_REVIEW',
];
const TERMINAL_WORKFLOW_STATUSES: DeadlineStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'WAIVED',
];
const DUE_SOON_DAYS = 14;

export interface CreateDeadlineInput {
  companyId: string;
  contractServiceId?: string | null;
  deadlineTemplateId?: string | null;
  title: string;
  description?: string | null;
  internalNotes?: string | null;
  category: DeadlineCategory;
  referenceCode?: string | null;
  periodLabel: string;
  periodStart?: string | Date | null;
  periodEnd?: string | Date | null;
  statutoryDueDate: string | Date;
  extendedDueDate?: string | Date | null;
  internalDueDate?: string | Date | null;
  isInScope?: boolean;
  scopeNote?: string | null;
  isBacklog?: boolean;
  backlogNote?: string | null;
  status?: DeadlineStatus;
  isBillable?: boolean;
  amount?: number | null;
  currency?: string;
  assigneeId?: string | null;
  generationType?: DeadlineGenerationType;
}

export interface UpdateDeadlineInput {
  id: string;
  title?: string;
  description?: string | null;
  internalNotes?: string | null;
  category?: DeadlineCategory;
  referenceCode?: string | null;
  periodLabel?: string;
  periodStart?: string | Date | null;
  periodEnd?: string | Date | null;
  extendedDueDate?: string | Date | null;
  internalDueDate?: string | Date | null;
  eotReference?: string | null;
  eotNote?: string | null;
  isInScope?: boolean;
  scopeNote?: string | null;
  isBacklog?: boolean;
  backlogNote?: string | null;
  status?: DeadlineStatus;
  isBillable?: boolean;
  overrideBillable?: boolean | null;
  amount?: number | null;
  overrideAmount?: number | null;
  currency?: string;
  assigneeId?: string | null;
}

export interface CompleteDeadlineInput {
  id: string;
  completionNote?: string | null;
  filingDate?: string | Date | null;
  filingReference?: string | null;
  billingStatus?: DeadlineBillingStatus;
  invoiceReference?: string | null;
}

export interface UpdateBillingInput {
  id: string;
  billingStatus: DeadlineBillingStatus;
  invoiceReference?: string | null;
}

export interface DeadlineSearchParams {
  companyId?: string;
  contractServiceId?: string;
  category?: DeadlineCategory;
  status?: DeadlineStatus | DeadlineStatus[];
  timing?: DeadlineTimingStatus;
  assigneeId?: string;
  isInScope?: boolean;
  isBacklog?: boolean;
  billingStatus?: DeadlineBillingStatus;
  amountFrom?: number;
  amountTo?: number;
  dueDateFrom?: string | Date | null;
  dueDateTo?: string | Date | null;
  query?: string;
  period?: string;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'title' | 'periodLabel' | 'service' | 'billingStatus' | 'amount' | 'assignee' | 'statutoryDueDate' | 'status' | 'category' | 'company' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface DeadlineWithRelations extends Deadline {
  company?: {
    id: string;
    name: string;
    uen: string;
  };
  contractService?: {
    id: string;
    name: string;
    contract?: {
      id: string;
      title: string;
    };
  };
  deadlineTemplate?: {
    id: string;
    code: string;
    name: string;
  };
  assignee?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  completedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

function buildEffectiveDueDateWhere(
  range: Prisma.DateTimeFilter
): Prisma.DeadlineWhereInput {
  return {
    OR: [
      { extendedDueDate: null, statutoryDueDate: range },
      { extendedDueDate: range },
    ],
  };
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new deadline
 */
export async function createDeadline(
  data: CreateDeadlineInput,
  params: TenantAwareParams
): Promise<Deadline> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  // Validate company belongs to tenant
  const company = await db.company.findFirst({
    where: { id: data.companyId, tenantId, deletedAt: null },
    select: { id: true, name: true },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  // Validate contract service if provided
  if (data.contractServiceId) {
    const service = await db.contractService.findFirst({
      where: { id: data.contractServiceId, tenantId, deletedAt: null },
    });
    if (!service) {
      throw new Error('Contract service not found');
    }
  }

  // Validate assignee if provided
  if (data.assigneeId) {
    const assignee = await db.user.findFirst({
      where: { id: data.assigneeId, tenantId, deletedAt: null, isActive: true },
    });
    if (!assignee) {
      throw new Error('Assignee not found');
    }
  }

  const isBillable = data.isBillable ?? false;

  const deadline = await db.deadline.create({
    data: {
      tenantId,
      companyId: data.companyId,
      contractServiceId: data.contractServiceId,
      deadlineTemplateId: data.deadlineTemplateId,
      title: data.title.slice(0, 200),
      description: data.description,
      internalNotes: data.internalNotes,
      category: data.category,
      referenceCode: data.referenceCode,
      periodLabel: data.periodLabel,
      periodStart: data.periodStart ? new Date(data.periodStart) : null,
      periodEnd: data.periodEnd ? new Date(data.periodEnd) : null,
      statutoryDueDate: new Date(data.statutoryDueDate),
      extendedDueDate: data.extendedDueDate ? new Date(data.extendedDueDate) : null,
      internalDueDate: data.internalDueDate ? new Date(data.internalDueDate) : null,
      isInScope: data.isInScope ?? true,
      scopeNote: data.scopeNote,
      isBacklog: data.isBacklog ?? false,
      backlogNote: data.backlogNote,
      status: data.status ?? 'PENDING',
      isBillable,
      billingStatus: isBillable ? 'PENDING' : 'NOT_APPLICABLE',
      amount: data.amount,
      currency: data.currency ?? 'SGD',
      assigneeId: data.assigneeId,
      assignedAt: data.assigneeId ? new Date() : null,
      generationType: data.generationType ?? 'MANUAL',
    },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: data.companyId,
    action: 'CREATE',
    entityType: 'Deadline',
    entityId: deadline.id,
    entityName: deadline.title,
    summary: `Created deadline "${deadline.title}" for ${company.name}`,
    changeSource: 'MANUAL',
    metadata: {
      category: deadline.category,
      status: deadline.status,
      statutoryDueDate: deadline.statutoryDueDate.toISOString(),
    },
  });

  return deadline;
}

/**
 * Update a deadline
 */
export async function updateDeadline(
  data: UpdateDeadlineInput,
  params: TenantAwareParams
): Promise<Deadline> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const existing = await db.deadline.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
    include: { company: { select: { id: true, name: true } } },
  });

  if (!existing) {
    throw new Error('Deadline not found');
  }

  const nextIsBillable = data.isBillable ?? existing.isBillable;
  const nextOverrideBillable =
    data.overrideBillable !== undefined ? data.overrideBillable : existing.overrideBillable;
  const effectiveBillable = nextOverrideBillable ?? nextIsBillable;

  const completionUpdate: Prisma.DeadlineUpdateInput = {};
  if (data.status) {
    if (data.status === 'COMPLETED') {
      completionUpdate.completedAt = new Date();
      completionUpdate.completedBy = { connect: { id: userId } };
    } else {
      completionUpdate.completedAt = null;
      completionUpdate.completedBy = { disconnect: true };
      completionUpdate.completionNote = null;
      completionUpdate.filingDate = null;
      completionUpdate.filingReference = null;
    }
  }

  const billingStatusUpdate: Prisma.DeadlineUpdateInput = {};
  if (data.status === 'COMPLETED' && effectiveBillable) {
    if (existing.billingStatus !== 'INVOICED' && existing.billingStatus !== 'PAID') {
      billingStatusUpdate.billingStatus = 'TO_BE_BILLED';
    }
  }

  // Validate assignee if provided
  if (data.assigneeId !== undefined && data.assigneeId !== null) {
    const assignee = await db.user.findFirst({
      where: { id: data.assigneeId, tenantId, deletedAt: null, isActive: true },
    });
    if (!assignee) {
      throw new Error('Assignee not found');
    }
  }

  const deadline = await db.deadline.update({
    where: { id: data.id },
    data: {
      title: data.title !== undefined ? data.title.slice(0, 200) : undefined,
      description: data.description !== undefined ? data.description : undefined,
      internalNotes: data.internalNotes !== undefined ? data.internalNotes : undefined,
      category: data.category,
      referenceCode: data.referenceCode !== undefined ? data.referenceCode : undefined,
      periodLabel: data.periodLabel,
      periodStart: data.periodStart !== undefined
        ? (data.periodStart ? new Date(data.periodStart) : null)
        : undefined,
      periodEnd: data.periodEnd !== undefined
        ? (data.periodEnd ? new Date(data.periodEnd) : null)
        : undefined,
      extendedDueDate: data.extendedDueDate !== undefined
        ? (data.extendedDueDate ? new Date(data.extendedDueDate) : null)
        : undefined,
      internalDueDate: data.internalDueDate !== undefined
        ? (data.internalDueDate ? new Date(data.internalDueDate) : null)
        : undefined,
      eotReference: data.eotReference !== undefined ? data.eotReference : undefined,
      eotNote: data.eotNote !== undefined ? data.eotNote : undefined,
      eotGrantedAt: data.extendedDueDate && !existing.extendedDueDate ? new Date() : undefined,
      isInScope: data.isInScope,
      scopeNote: data.scopeNote !== undefined ? data.scopeNote : undefined,
      isBacklog: data.isBacklog,
      backlogNote: data.backlogNote !== undefined ? data.backlogNote : undefined,
      status: data.status,
      isBillable: data.isBillable,
      overrideBillable: data.overrideBillable !== undefined ? data.overrideBillable : undefined,
      amount: data.amount !== undefined ? data.amount : undefined,
      overrideAmount: data.overrideAmount !== undefined ? data.overrideAmount : undefined,
      currency: data.currency,
      assignee: data.assigneeId !== undefined
        ? (data.assigneeId ? { connect: { id: data.assigneeId } } : { disconnect: true })
        : undefined,
      assignedAt: data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId
        ? (data.assigneeId ? new Date() : null)
        : undefined,
      ...billingStatusUpdate,
      ...completionUpdate,
    },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: existing.companyId,
    action: 'UPDATE',
    entityType: 'Deadline',
    entityId: deadline.id,
    entityName: deadline.title,
    summary: `Updated deadline "${deadline.title}"`,
    changeSource: 'MANUAL',
  });

  return deadline;
}

/**
 * Mark a deadline as completed
 */
export async function completeDeadline(
  data: CompleteDeadlineInput,
  params: TenantAwareParams
): Promise<Deadline> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const existing = await db.deadline.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
    include: { company: { select: { id: true, name: true } } },
  });

  if (!existing) {
    throw new Error('Deadline not found');
  }

  if (existing.status === 'COMPLETED') {
    throw new Error('Deadline is already completed');
  }

  const effectiveBillable = existing.overrideBillable ?? existing.isBillable;

  const updateData: Prisma.DeadlineUpdateInput = {
    status: 'COMPLETED',
    completedAt: new Date(),
    completedBy: { connect: { id: userId } },
    completionNote: data.completionNote,
    filingDate: data.filingDate ? new Date(data.filingDate) : null,
    filingReference: data.filingReference,
  };

  let resolvedBillingStatus = data.billingStatus;
  if (effectiveBillable) {
    if (
      resolvedBillingStatus === undefined ||
      resolvedBillingStatus === 'PENDING' ||
      resolvedBillingStatus === 'NOT_APPLICABLE'
    ) {
      if (existing.billingStatus !== 'INVOICED' && existing.billingStatus !== 'PAID') {
        resolvedBillingStatus = 'TO_BE_BILLED';
      }
    }
  }

  if (resolvedBillingStatus !== undefined) {
    updateData.billingStatus = resolvedBillingStatus;
    if (data.invoiceReference !== undefined) {
      updateData.invoiceReference = data.invoiceReference;
    }
    if (resolvedBillingStatus === 'INVOICED' && !existing.invoicedAt) {
      updateData.invoicedAt = new Date();
    }
  } else if (data.invoiceReference !== undefined) {
    updateData.invoiceReference = data.invoiceReference;
  }

  const deadline = await db.deadline.update({
    where: { id: data.id },
    data: updateData,
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: existing.companyId,
    action: 'UPDATE',
    entityType: 'Deadline',
    entityId: deadline.id,
    entityName: deadline.title,
    summary: `Completed deadline "${deadline.title}" for ${existing.company.name}`,
    changeSource: 'MANUAL',
    metadata: {
      filingDate: deadline.filingDate?.toISOString(),
      filingReference: deadline.filingReference,
      billingStatus: deadline.billingStatus,
      invoiceReference: deadline.invoiceReference,
    },
  });

  return deadline;
}

/**
 * Reopen a completed deadline
 */
export async function reopenDeadline(
  id: string,
  params: TenantAwareParams
): Promise<Deadline> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const existing = await db.deadline.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: { company: { select: { id: true, name: true } } },
  });

  if (!existing) {
    throw new Error('Deadline not found');
  }

  if (existing.status !== 'COMPLETED') {
    throw new Error('Deadline is not completed');
  }

  const billingStatusUpdate: Prisma.DeadlineUpdateInput =
    existing.billingStatus === 'TO_BE_BILLED'
      ? { billingStatus: 'PENDING' }
      : {};

  const deadline = await db.deadline.update({
    where: { id },
    data: {
      status: 'PENDING',
      completedAt: null,
      completedBy: { disconnect: true },
      completionNote: null,
      filingDate: null,
      filingReference: null,
      ...billingStatusUpdate,
    },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: existing.companyId,
    action: 'UPDATE',
    entityType: 'Deadline',
    entityId: deadline.id,
    entityName: deadline.title,
    summary: `Reopened deadline "${deadline.title}" for ${existing.company.name}`,
    changeSource: 'MANUAL',
  });

  return deadline;
}

/**
 * Update billing status for a deadline
 */
export async function updateBillingStatus(
  data: UpdateBillingInput,
  params: TenantAwareParams
): Promise<Deadline> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const existing = await db.deadline.findFirst({
    where: { id: data.id, tenantId, deletedAt: null },
    include: { company: { select: { id: true, name: true } } },
  });

  if (!existing) {
    throw new Error('Deadline not found');
  }

  const deadline = await db.deadline.update({
    where: { id: data.id },
    data: {
      billingStatus: data.billingStatus,
      invoiceReference: data.invoiceReference ?? existing.invoiceReference,
      invoicedAt: data.billingStatus === 'INVOICED' && !existing.invoicedAt ? new Date() : undefined,
    },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: existing.companyId,
    action: 'UPDATE',
    entityType: 'Deadline',
    entityId: deadline.id,
    entityName: deadline.title,
    summary: `Updated billing status to "${data.billingStatus}" for deadline "${deadline.title}"`,
    changeSource: 'MANUAL',
    metadata: {
      billingStatus: data.billingStatus,
      invoiceReference: data.invoiceReference,
    },
  });

  return deadline;
}

/**
 * Delete a deadline (soft delete)
 */
export async function deleteDeadline(
  id: string,
  params: TenantAwareParams
): Promise<Deadline> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const existing = await db.deadline.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: { company: { select: { id: true, name: true } } },
  });

  if (!existing) {
    throw new Error('Deadline not found');
  }

  const deadline = await db.deadline.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    companyId: existing.companyId,
    action: 'DELETE',
    entityType: 'Deadline',
    entityId: id,
    entityName: existing.title,
    summary: `Deleted deadline "${existing.title}" for ${existing.company.name}`,
    changeSource: 'MANUAL',
  });

  return deadline;
}

// ============================================================================
// QUERY OPERATIONS
// ============================================================================

/**
 * Get a single deadline by ID
 */
export async function getDeadlineById(
  id: string,
  tenantId: string
): Promise<DeadlineWithRelations | null> {
  return prisma.deadline.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          uen: true,
        },
      },
      contractService: {
        select: {
          id: true,
          name: true,
          contract: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
      deadlineTemplate: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      assignee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      completedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  }) as Promise<DeadlineWithRelations | null>;
}

/**
 * Get deadlines for a specific company
 */
export async function getCompanyDeadlines(
  companyId: string,
  tenantId: string,
  options?: {
    status?: DeadlineStatus | DeadlineStatus[];
    category?: DeadlineCategory;
    limit?: number;
  }
): Promise<DeadlineWithRelations[]> {
  const { status, category, limit } = options || {};

  const where: Prisma.DeadlineWhereInput = {
    companyId,
    tenantId,
    deletedAt: null,
  };

  if (status) {
    where.status = Array.isArray(status) ? { in: status } : status;
  }

  if (category) {
    where.category = category;
  }

  return prisma.deadline.findMany({
    where,
    include: {
      company: {
        select: { id: true, name: true, uen: true },
      },
      contractService: {
        select: {
          id: true,
          name: true,
          contract: { select: { id: true, title: true } },
        },
      },
      deadlineTemplate: {
        select: { id: true, code: true, name: true },
      },
      assignee: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      completedBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: [
      { statutoryDueDate: 'asc' },
    ],
    take: limit,
  }) as Promise<DeadlineWithRelations[]>;
}

/**
 * Search and filter deadlines
 */
export async function searchDeadlines(
  tenantId: string,
  params?: DeadlineSearchParams
): Promise<{ deadlines: DeadlineWithRelations[]; total: number }> {
  const {
    companyId,
    contractServiceId,
    category,
    status,
    timing,
    assigneeId,
    isInScope,
    isBacklog,
    billingStatus,
    amountFrom,
    amountTo,
    dueDateFrom,
    dueDateTo,
    query,
    period,
    includeDeleted = false,
    page = 1,
    limit = 20,
    sortBy = 'statutoryDueDate',
    sortOrder = 'asc',
  } = params || {};

  const where: Prisma.DeadlineWhereInput = {
    tenantId,
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(companyId && { companyId }),
    ...(contractServiceId && { contractServiceId }),
    ...(category && { category }),
    ...(status && { status: Array.isArray(status) ? { in: status } : status }),
    ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
    ...(isInScope !== undefined && { isInScope }),
    ...(isBacklog !== undefined && { isBacklog }),
    ...(billingStatus && { billingStatus }),
    ...(period && { periodLabel: { contains: period, mode: 'insensitive' } }),
    ...(query && {
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { referenceCode: { contains: query, mode: 'insensitive' } },
        { periodLabel: { contains: query, mode: 'insensitive' } },
        { company: { name: { contains: query, mode: 'insensitive' } } },
        { company: { uen: { contains: query, mode: 'insensitive' } } },
      ],
    }),
    // Date range filters
    ...(dueDateFrom || dueDateTo
      ? {
        statutoryDueDate: {
          ...(dueDateFrom && { gte: new Date(dueDateFrom) }),
          ...(dueDateTo && { lte: new Date(dueDateTo) }),
        },
      }
      : {}),
  };

  if (timing) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueSoonDate = new Date(today);
    dueSoonDate.setDate(dueSoonDate.getDate() + DUE_SOON_DAYS);

    const timingFilters: Prisma.DeadlineWhereInput[] = [];

    if (timing === 'OVERDUE') {
      timingFilters.push({ status: { in: ACTIVE_WORKFLOW_STATUSES } });
      timingFilters.push(buildEffectiveDueDateWhere({ lt: today }));
    } else if (timing === 'DUE_SOON') {
      timingFilters.push({ status: { in: ACTIVE_WORKFLOW_STATUSES } });
      timingFilters.push(buildEffectiveDueDateWhere({ gte: today, lte: dueSoonDate }));
    } else if (timing === 'UPCOMING') {
      timingFilters.push({ status: { in: ACTIVE_WORKFLOW_STATUSES } });
      timingFilters.push(buildEffectiveDueDateWhere({ gt: dueSoonDate }));
    } else if (TERMINAL_WORKFLOW_STATUSES.includes(timing as DeadlineStatus)) {
      timingFilters.push({ status: timing as DeadlineStatus });
    }

    if (timingFilters.length > 0) {
      const existingAnd = Array.isArray(where.AND) ? where.AND : (where.AND ? [where.AND] : []);
      where.AND = [...existingAnd, ...timingFilters];
    }
  }

  if (amountFrom !== undefined || amountTo !== undefined) {
    const range = {
      ...(amountFrom !== undefined ? { gte: amountFrom } : {}),
      ...(amountTo !== undefined ? { lte: amountTo } : {}),
    };
    const existingAnd = Array.isArray(where.AND) ? where.AND : (where.AND ? [where.AND] : []);
    where.AND = [
      ...existingAnd,
      {
        OR: [
          { overrideAmount: range },
          { overrideAmount: null, amount: range },
        ],
      },
    ];
  }

  // Build orderBy
  const orderBy: Prisma.DeadlineOrderByWithRelationInput[] = [];
  if (sortBy === 'company') {
    orderBy.push({ company: { name: sortOrder } });
  } else if (sortBy === 'service') {
    orderBy.push({ contractService: { name: sortOrder } });
  } else if (sortBy === 'assignee') {
    orderBy.push(
      { assignee: { lastName: sortOrder } },
      { assignee: { firstName: sortOrder } }
    );
  } else if (sortBy === 'title' || sortBy === 'periodLabel' || sortBy === 'billingStatus' ||
    sortBy === 'amount' || sortBy === 'statutoryDueDate' || sortBy === 'status' ||
    sortBy === 'category' || sortBy === 'createdAt' || sortBy === 'updatedAt') {
    orderBy.push({ [sortBy]: sortOrder });
  }

  const [deadlines, total] = await Promise.all([
    prisma.deadline.findMany({
      where,
      include: {
        company: {
          select: { id: true, name: true, uen: true },
        },
        contractService: {
          select: {
            id: true,
            name: true,
            contract: { select: { id: true, title: true } },
          },
        },
        deadlineTemplate: {
          select: { id: true, code: true, name: true },
        },
        assignee: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        completedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: orderBy.length > 0 ? orderBy : [{ statutoryDueDate: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.deadline.count({ where }),
  ]);

  return { deadlines: deadlines as DeadlineWithRelations[], total };
}

/**
 * Get upcoming deadlines (due within X days)
 */
export async function getUpcomingDeadlines(
  tenantId: string,
  daysAhead: number = 30,
  options?: {
    companyId?: string;
    assigneeId?: string;
    category?: DeadlineCategory;
    limit?: number;
  }
): Promise<DeadlineWithRelations[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const where: Prisma.DeadlineWhereInput = {
    tenantId,
    deletedAt: null,
    status: { in: ACTIVE_WORKFLOW_STATUSES },
    isInScope: true,
    ...buildEffectiveDueDateWhere({ gte: today, lte: futureDate }),
    ...(options?.companyId && { companyId: options.companyId }),
    ...(options?.assigneeId && { assigneeId: options.assigneeId }),
    ...(options?.category && { category: options.category }),
  };

  return prisma.deadline.findMany({
    where,
    include: {
      company: {
        select: { id: true, name: true, uen: true },
      },
      contractService: {
        select: {
          id: true,
          name: true,
          contract: { select: { id: true, title: true } },
        },
      },
      deadlineTemplate: {
        select: { id: true, code: true, name: true },
      },
      assignee: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { statutoryDueDate: 'asc' },
    take: options?.limit,
  }) as Promise<DeadlineWithRelations[]>;
}

/**
 * Get overdue deadlines
 * A deadline is considered overdue if the effective due date is before today (not including today)
 */
export async function getOverdueDeadlines(
  tenantId: string,
  options?: {
    companyId?: string;
    assigneeId?: string;
    limit?: number;
  }
): Promise<DeadlineWithRelations[]> {
  // Use start of today for comparison (deadlines due today are not overdue yet)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const where: Prisma.DeadlineWhereInput = {
    tenantId,
    deletedAt: null,
    status: { in: ACTIVE_WORKFLOW_STATUSES },
    isInScope: true,
    ...buildEffectiveDueDateWhere({ lt: today }),
    ...(options?.companyId && { companyId: options.companyId }),
    ...(options?.assigneeId && { assigneeId: options.assigneeId }),
  };

  return prisma.deadline.findMany({
    where,
    include: {
      company: {
        select: { id: true, name: true, uen: true },
      },
      contractService: {
        select: {
          id: true,
          name: true,
          contract: { select: { id: true, title: true } },
        },
      },
      deadlineTemplate: {
        select: { id: true, code: true, name: true },
      },
      assignee: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { statutoryDueDate: 'asc' },
    take: options?.limit,
  }) as Promise<DeadlineWithRelations[]>;
}

// ============================================================================
// STATISTICS
// ============================================================================

export interface DeadlineStats {
  total: number;
  byStatus: Record<DeadlineStatus, number>;
  byCategory: Record<DeadlineCategory, number>;
  overdue: number;
  dueSoon: number; // Due within 14 days
  unassigned: number;
  billable: {
    pending: number;
    invoiced: number;
    paid: number;
    totalAmount: number;
  };
}

/**
 * Get deadline statistics for dashboard
 */
export async function getDeadlineStats(
  tenantId: string,
  options?: {
    companyId?: string;
    assigneeId?: string;
  }
): Promise<DeadlineStats> {
  const baseWhere: Prisma.DeadlineWhereInput = {
    tenantId,
    deletedAt: null,
    isInScope: true,
    ...(options?.companyId && { companyId: options.companyId }),
    ...(options?.assigneeId && { assigneeId: options.assigneeId }),
  };

  // Use start of today for overdue calculation
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueSoonDate = new Date();
  dueSoonDate.setDate(dueSoonDate.getDate() + DUE_SOON_DAYS);

  const [
    total,
    byStatus,
    byCategory,
    overdue,
    dueSoon,
    unassigned,
    billablePending,
    billableInvoiced,
    billablePaid,
    billableTotalResult,
  ] = await Promise.all([
    // Total
    prisma.deadline.count({ where: baseWhere }),

    // By status
    prisma.deadline.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: true,
    }),

    // By category
    prisma.deadline.groupBy({
      by: ['category'],
      where: baseWhere,
      _count: true,
    }),

    // Overdue (due before today, not including today)
    prisma.deadline.count({
      where: {
        ...baseWhere,
        status: { in: ACTIVE_WORKFLOW_STATUSES },
        ...buildEffectiveDueDateWhere({ lt: today }),
      },
    }),

    // Due soon (within 14 days, including today)
    prisma.deadline.count({
      where: {
        ...baseWhere,
        status: { in: ACTIVE_WORKFLOW_STATUSES },
        ...buildEffectiveDueDateWhere({ gte: today, lte: dueSoonDate }),
      },
    }),

    // Unassigned
    prisma.deadline.count({
      where: {
        ...baseWhere,
        status: { in: ACTIVE_WORKFLOW_STATUSES },
        assigneeId: null,
      },
    }),

    // Billable pending
    prisma.deadline.count({
      where: {
        ...baseWhere,
        isBillable: true,
        billingStatus: { in: ['PENDING', 'TO_BE_BILLED'] },
      },
    }),

    // Billable invoiced
    prisma.deadline.count({
      where: {
        ...baseWhere,
        isBillable: true,
        billingStatus: 'INVOICED',
      },
    }),

    // Billable paid
    prisma.deadline.count({
      where: {
        ...baseWhere,
        isBillable: true,
        billingStatus: 'PAID',
      },
    }),

    // Billable total amount
    prisma.deadline.aggregate({
      where: {
        ...baseWhere,
        isBillable: true,
        billingStatus: { in: ['PENDING', 'TO_BE_BILLED'] },
      },
      _sum: { amount: true },
    }),
  ]);

  // Convert grouped results to records
  const statusRecord: Record<DeadlineStatus, number> = {
    PENDING: 0,
    PENDING_CLIENT: 0,
    IN_PROGRESS: 0,
    PENDING_REVIEW: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    WAIVED: 0,
  };
  byStatus.forEach((s) => {
    statusRecord[s.status] = s._count;
  });

  const categoryRecord: Record<DeadlineCategory, number> = {
    CORPORATE_SECRETARY: 0,
    TAX: 0,
    ACCOUNTING: 0,
    AUDIT: 0,
    COMPLIANCE: 0,
    OTHER: 0,
  };
  byCategory.forEach((c) => {
    categoryRecord[c.category] = c._count;
  });

  return {
    total,
    byStatus: statusRecord,
    byCategory: categoryRecord,
    overdue,
    dueSoon,
    unassigned,
    billable: {
      pending: billablePending,
      invoiced: billableInvoiced,
      paid: billablePaid,
      totalAmount: Number(billableTotalResult._sum.amount) || 0,
    },
  };
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk assign deadlines to a user
 */
export async function bulkAssignDeadlines(
  deadlineIds: string[],
  assigneeId: string | null,
  params: TenantAwareParams
): Promise<number> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  // Validate assignee if provided
  if (assigneeId) {
    const assignee = await db.user.findFirst({
      where: { id: assigneeId, tenantId, deletedAt: null, isActive: true },
    });
    if (!assignee) {
      throw new Error('Assignee not found');
    }
  }

  const result = await db.deadline.updateMany({
    where: {
      id: { in: deadlineIds },
      tenantId,
      deletedAt: null,
    },
    data: {
      assigneeId,
      assignedAt: assigneeId ? new Date() : null,
    },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    action: 'BULK_UPDATE',
    entityType: 'Deadline',
    entityId: deadlineIds.join(','),
    summary: assigneeId
      ? `Bulk assigned ${result.count} deadlines`
      : `Bulk unassigned ${result.count} deadlines`,
    changeSource: 'MANUAL',
    metadata: {
      deadlineIds,
      assigneeId,
    },
  });

  return result.count;
}

/**
 * Bulk update deadline status
 */
export async function bulkUpdateStatus(
  deadlineIds: string[],
  status: DeadlineStatus,
  params: TenantAwareParams
): Promise<number> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const result = await db.deadline.updateMany({
    where: {
      id: { in: deadlineIds },
      tenantId,
      deletedAt: null,
    },
    data: {
      status,
      ...(status === 'COMPLETED'
        ? { completedAt: new Date(), completedById: userId }
        : {
          completedAt: null,
          completedById: null,
          completionNote: null,
          filingDate: null,
          filingReference: null,
        }),
    },
  });

  if (status === 'COMPLETED') {
    await db.deadline.updateMany({
      where: {
        id: { in: deadlineIds },
        tenantId,
        deletedAt: null,
        billingStatus: { notIn: ['INVOICED', 'PAID'] },
        OR: [
          { overrideBillable: true },
          { overrideBillable: null, isBillable: true },
        ],
      },
      data: {
        billingStatus: 'TO_BE_BILLED',
      },
    });
  }

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    action: 'BULK_UPDATE',
    entityType: 'Deadline',
    entityId: deadlineIds.join(','),
    summary: `Bulk updated status to "${status}" for ${result.count} deadlines`,
    changeSource: 'MANUAL',
    metadata: {
      deadlineIds,
      status,
    },
  });

  return result.count;
}

/**
 * Bulk update billing status
 */
export async function bulkUpdateBillingStatus(
  deadlineIds: string[],
  billingStatus: DeadlineBillingStatus,
  params: TenantAwareParams
): Promise<number> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const result = await db.deadline.updateMany({
    where: {
      id: { in: deadlineIds },
      tenantId,
      deletedAt: null,
    },
    data: {
      billingStatus,
      ...(billingStatus === 'INVOICED' ? { invoicedAt: new Date() } : {}),
    },
  });

  await createAuditLog({
    tenantId,
    userId,
    action: 'BULK_UPDATE',
    entityType: 'Deadline',
    entityId: deadlineIds.join(','),
    summary: `Bulk updated billing status to "${billingStatus}" for ${result.count} deadlines`,
    changeSource: 'MANUAL',
    metadata: {
      deadlineIds,
      billingStatus,
    },
  });

  return result.count;
}

/**
 * Bulk delete deadlines
 */
export async function bulkDeleteDeadlines(
  deadlineIds: string[],
  params: TenantAwareParams
): Promise<number> {
  const { tenantId, userId, tx } = params;
  const db = tx || prisma;

  const result = await db.deadline.updateMany({
    where: {
      id: { in: deadlineIds },
      tenantId,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });

  // Create audit log
  await createAuditLog({
    tenantId,
    userId,
    action: 'BULK_UPDATE',
    entityType: 'Deadline',
    entityId: deadlineIds.join(','),
    summary: `Bulk deleted ${result.count} deadlines`,
    changeSource: 'MANUAL',
    metadata: { deadlineIds },
  });

  return result.count;
}
