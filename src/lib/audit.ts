import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import type { AuditAction, ChangeSource } from '@prisma/client';

export interface AuditLogParams {
  userId?: string;
  companyId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  changeSource?: ChangeSource;
  changes?: Record<string, { old: unknown; new: unknown }>;
  reason?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(params: AuditLogParams) {
  return prisma.auditLog.create({
    data: {
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
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}

export function computeChanges<T extends Record<string, unknown>>(
  oldData: T,
  newData: Partial<T>,
  fieldsToTrack: (keyof T)[]
): Record<string, { old: unknown; new: unknown }> | null {
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const field of fieldsToTrack) {
    const oldValue = oldData[field];
    const newValue = newData[field];

    if (newValue !== undefined && oldValue !== newValue) {
      changes[field as string] = { old: oldValue, new: newValue };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

export async function getAuditHistory(
  entityType: string,
  entityId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
) {
  return prisma.auditLog.findMany({
    where: {
      entityType,
      entityId,
    },
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

export async function getCompanyAuditHistory(
  companyId: string,
  options?: {
    limit?: number;
    offset?: number;
    actions?: AuditAction[];
  }
) {
  return prisma.auditLog.findMany({
    where: {
      companyId,
      ...(options?.actions && { action: { in: options.actions } }),
    },
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
