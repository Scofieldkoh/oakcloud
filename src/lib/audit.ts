/**
 * Audit Logging System
 *
 * Provides comprehensive audit logging for tracking all changes,
 * user actions, and system events across the application.
 * Fully integrated with multi-tenancy support.
 */

import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import type { AuditAction, ChangeSource } from '@prisma/client';
import { getAuditRequestContext } from './request-context';

// ============================================================================
// Types
// ============================================================================

export interface AuditLogParams {
  tenantId?: string;
  userId?: string;
  companyId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  changeSource?: ChangeSource;
  changes?: Record<string, { old: unknown; new: unknown }>;
  reason?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string;
  sessionId?: string;
}

export interface AuditContext {
  tenantId?: string;
  userId?: string;
  companyId?: string;
  changeSource?: ChangeSource;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;
}

export interface AuditHistoryOptions {
  limit?: number;
  offset?: number;
  actions?: AuditAction[];
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  entityTypes?: string[];
}

// ============================================================================
// Core Audit Functions
// ============================================================================

/**
 * Create a single audit log entry
 */
export async function createAuditLog(params: AuditLogParams) {
  // Get request context if not provided
  let requestContext: {
    ipAddress: string | null | undefined;
    userAgent: string | null | undefined;
    requestId: string | undefined;
  } = {
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    requestId: params.requestId,
  };

  if (!requestContext.ipAddress && !requestContext.userAgent) {
    try {
      requestContext = await getAuditRequestContext();
    } catch {
      // Running outside of request context (e.g., background job)
    }
  }

  return prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      companyId: params.companyId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      changeSource: params.changeSource || 'MANUAL',
      changes: params.changes
        ? (params.changes as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      reason: params.reason,
      metadata: params.metadata
        ? (params.metadata as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      ipAddress: requestContext.ipAddress || params.ipAddress,
      userAgent: requestContext.userAgent || params.userAgent,
      requestId: requestContext.requestId || params.requestId,
      sessionId: params.sessionId,
    },
  });
}

/**
 * Create multiple audit log entries in a batch (transaction)
 */
export async function createAuditLogBatch(entries: AuditLogParams[]) {
  // Get request context once for all entries
  let requestContext = { ipAddress: null as string | null, userAgent: null as string | null, requestId: '' };
  try {
    requestContext = await getAuditRequestContext();
  } catch {
    // Running outside of request context
  }

  return prisma.auditLog.createMany({
    data: entries.map((params) => ({
      tenantId: params.tenantId,
      userId: params.userId,
      companyId: params.companyId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      changeSource: params.changeSource || 'MANUAL',
      changes: params.changes
        ? (params.changes as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      reason: params.reason,
      metadata: params.metadata
        ? (params.metadata as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      ipAddress: params.ipAddress || requestContext.ipAddress,
      userAgent: params.userAgent || requestContext.userAgent,
      requestId: params.requestId || requestContext.requestId,
      sessionId: params.sessionId,
    })),
  });
}

// ============================================================================
// Audit Context Builder
// ============================================================================

/**
 * Create an audit context for consistent logging within a request
 */
export async function createAuditContext(params: {
  tenantId?: string;
  userId?: string;
  companyId?: string;
  changeSource?: ChangeSource;
  sessionId?: string;
}): Promise<AuditContext> {
  const requestContext = await getAuditRequestContext().catch(() => ({
    ipAddress: null,
    userAgent: null,
    requestId: '',
  }));

  return {
    ...params,
    ipAddress: requestContext.ipAddress || undefined,
    userAgent: requestContext.userAgent || undefined,
    requestId: requestContext.requestId || undefined,
  };
}

/**
 * Log an action using a pre-built audit context
 */
export async function logWithContext(
  context: AuditContext,
  action: AuditAction,
  entityType: string,
  entityId: string,
  options?: {
    changes?: Record<string, { old: unknown; new: unknown }>;
    reason?: string;
    metadata?: Record<string, unknown>;
    companyId?: string;
  }
) {
  return createAuditLog({
    ...context,
    companyId: options?.companyId || context.companyId,
    action,
    entityType,
    entityId,
    changes: options?.changes,
    reason: options?.reason,
    metadata: options?.metadata,
  });
}

// ============================================================================
// Change Detection
// ============================================================================

/**
 * Compute changes between old and new data
 * @returns Object with changed fields or null if no changes
 */
export function computeChanges<T extends Record<string, unknown>>(
  oldData: T,
  newData: Partial<T>,
  fieldsToTrack: (keyof T)[]
): Record<string, { old: unknown; new: unknown }> | null {
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const field of fieldsToTrack) {
    const oldValue = oldData[field];
    const newValue = newData[field];

    // Skip if new value is undefined (field not being updated)
    if (newValue === undefined) continue;

    // Deep comparison for objects and arrays
    if (!isEqual(oldValue, newValue)) {
      changes[field as string] = { old: oldValue, new: newValue };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Deep equality check for comparing values
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  // Handle Date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle Decimal comparison (Prisma Decimal)
  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    'toNumber' in (a as object) &&
    'toNumber' in (b as object)
  ) {
    return (a as { toNumber: () => number }).toNumber() === (b as { toNumber: () => number }).toNumber();
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => isEqual(val, b[i]));
  }

  // Handle objects
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      isEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    );
  }

  return false;
}

// ============================================================================
// Audit History Queries
// ============================================================================

/**
 * Get audit history for a specific entity
 */
export async function getAuditHistory(
  entityType: string,
  entityId: string,
  options?: AuditHistoryOptions
) {
  const where: Prisma.AuditLogWhereInput = {
    entityType,
    entityId,
    ...(options?.actions && { action: { in: options.actions } }),
    ...(options?.startDate && { createdAt: { gte: options.startDate } }),
    ...(options?.endDate && { createdAt: { lte: options.endDate } }),
    ...(options?.userId && { userId: options.userId }),
  };

  return prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50,
    skip: options?.offset || 0,
  });
}

/**
 * Get audit history for a company (all entities within the company)
 */
export async function getCompanyAuditHistory(
  companyId: string,
  options?: AuditHistoryOptions
) {
  const where: Prisma.AuditLogWhereInput = {
    companyId,
    ...(options?.actions && { action: { in: options.actions } }),
    ...(options?.startDate && { createdAt: { gte: options.startDate } }),
    ...(options?.endDate && { createdAt: { lte: options.endDate } }),
    ...(options?.userId && { userId: options.userId }),
    ...(options?.entityTypes && { entityType: { in: options.entityTypes } }),
  };

  return prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50,
    skip: options?.offset || 0,
  });
}

/**
 * Get audit history for a tenant (all entities within the tenant)
 */
export async function getTenantAuditHistory(
  tenantId: string,
  options?: AuditHistoryOptions
) {
  const where: Prisma.AuditLogWhereInput = {
    tenantId,
    ...(options?.actions && { action: { in: options.actions } }),
    ...(options?.startDate && { createdAt: { gte: options.startDate } }),
    ...(options?.endDate && { createdAt: { lte: options.endDate } }),
    ...(options?.userId && { userId: options.userId }),
    ...(options?.entityTypes && { entityType: { in: options.entityTypes } }),
  };

  const [logs, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
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
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, totalCount };
}

/**
 * Get audit history for a user (all actions by the user)
 */
export async function getUserAuditHistory(
  userId: string,
  options?: Omit<AuditHistoryOptions, 'userId'>
) {
  const where: Prisma.AuditLogWhereInput = {
    userId,
    ...(options?.actions && { action: { in: options.actions } }),
    ...(options?.startDate && { createdAt: { gte: options.startDate } }),
    ...(options?.endDate && { createdAt: { lte: options.endDate } }),
    ...(options?.entityTypes && { entityType: { in: options.entityTypes } }),
  };

  return prisma.auditLog.findMany({
    where,
    include: {
      company: {
        select: {
          id: true,
          name: true,
          uen: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit || 50,
    skip: options?.offset || 0,
  });
}

// ============================================================================
// Audit Statistics
// ============================================================================

/**
 * Get audit statistics for a tenant
 */
export async function getTenantAuditStats(
  tenantId: string,
  startDate: Date,
  endDate: Date
) {
  const [
    totalLogs,
    actionCounts,
    entityTypeCounts,
    topUsers,
  ] = await Promise.all([
    // Total logs count
    prisma.auditLog.count({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
    }),

    // Count by action type
    prisma.auditLog.groupBy({
      by: ['action'],
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      _count: true,
    }),

    // Count by entity type
    prisma.auditLog.groupBy({
      by: ['entityType'],
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      _count: true,
    }),

    // Top active users
    prisma.auditLog.groupBy({
      by: ['userId'],
      where: {
        tenantId,
        userId: { not: null },
        createdAt: { gte: startDate, lte: endDate },
      },
      _count: true,
      orderBy: { _count: { userId: 'desc' } },
      take: 10,
    }),
  ]);

  return {
    totalLogs,
    actionCounts: actionCounts.map((a) => ({
      action: a.action,
      count: a._count,
    })),
    entityTypeCounts: entityTypeCounts.map((e) => ({
      entityType: e.entityType,
      count: e._count,
    })),
    topUsers: topUsers.map((u) => ({
      userId: u.userId,
      count: u._count,
    })),
  };
}

// ============================================================================
// Specialized Audit Loggers
// ============================================================================

/**
 * Log a CREATE action
 */
export async function logCreate(
  context: AuditContext,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>
) {
  return createAuditLog({
    ...context,
    action: 'CREATE',
    entityType,
    entityId,
    metadata,
  });
}

/**
 * Log an UPDATE action with changes
 */
export async function logUpdate(
  context: AuditContext,
  entityType: string,
  entityId: string,
  changes: Record<string, { old: unknown; new: unknown }>,
  reason?: string
) {
  return createAuditLog({
    ...context,
    action: 'UPDATE',
    entityType,
    entityId,
    changes,
    reason,
  });
}

/**
 * Log a DELETE action (soft delete)
 */
export async function logDelete(
  context: AuditContext,
  entityType: string,
  entityId: string,
  reason: string,
  metadata?: Record<string, unknown>
) {
  return createAuditLog({
    ...context,
    action: 'DELETE',
    entityType,
    entityId,
    reason,
    metadata,
  });
}

/**
 * Log a RESTORE action
 */
export async function logRestore(
  context: AuditContext,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>
) {
  return createAuditLog({
    ...context,
    action: 'RESTORE',
    entityType,
    entityId,
    metadata,
  });
}

/**
 * Log an authentication event
 */
export async function logAuthEvent(
  action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'PASSWORD_CHANGED' | 'PASSWORD_RESET',
  userId: string | undefined,
  metadata?: Record<string, unknown>
) {
  const requestContext = await getAuditRequestContext().catch(() => ({
    ipAddress: null,
    userAgent: null,
    requestId: '',
  }));

  return createAuditLog({
    userId,
    action,
    entityType: 'User',
    entityId: userId || 'unknown',
    changeSource: 'SYSTEM',
    metadata,
    ...requestContext,
  });
}

/**
 * Log a document operation
 */
export async function logDocumentOperation(
  context: AuditContext,
  action: 'UPLOAD' | 'DOWNLOAD' | 'EXTRACT',
  documentId: string,
  metadata?: Record<string, unknown>
) {
  return createAuditLog({
    ...context,
    action,
    entityType: 'Document',
    entityId: documentId,
    metadata,
  });
}

/**
 * Log a tenant operation
 */
export async function logTenantOperation(
  action: 'TENANT_CREATED' | 'TENANT_UPDATED' | 'TENANT_SUSPENDED' | 'TENANT_ACTIVATED',
  tenantId: string,
  userId?: string,
  changes?: Record<string, { old: unknown; new: unknown }>,
  reason?: string
) {
  return createAuditLog({
    tenantId,
    userId,
    action,
    entityType: 'Tenant',
    entityId: tenantId,
    changeSource: 'SYSTEM',
    changes,
    reason,
  });
}

/**
 * Log a user invitation or removal
 */
export async function logUserMembership(
  context: AuditContext,
  action: 'USER_INVITED' | 'USER_REMOVED',
  targetUserId: string,
  metadata?: Record<string, unknown>
) {
  return createAuditLog({
    ...context,
    action,
    entityType: 'User',
    entityId: targetUserId,
    metadata,
  });
}

/**
 * Log a role change
 */
export async function logRoleChange(
  context: AuditContext,
  targetUserId: string,
  oldRole: string,
  newRole: string
) {
  return createAuditLog({
    ...context,
    action: 'ROLE_CHANGED',
    entityType: 'User',
    entityId: targetUserId,
    changes: { role: { old: oldRole, new: newRole } },
  });
}
