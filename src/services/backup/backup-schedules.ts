/**
 * Reads and writes workspace backup schedules.
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { getNextCronOccurrence } from '@/lib/cron-utils';

const log = createLogger('backup-service');

/**
 * Get or create a backup schedule for a tenant
 */
export async function getSchedule(tenantId: string): Promise<{
  id: string;
  tenantId: string;
  cronPattern: string;
  isEnabled: boolean;
  timezone: string;
  retentionDays: number;
  maxBackups: number;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
} | null> {
  const schedule = await prisma.backupSchedule.findUnique({
    where: { tenantId },
  });

  return schedule;
}

/**
 * Create or update a backup schedule for a tenant
 */
export async function upsertSchedule(
  tenantId: string,
  data: {
    cronPattern: string;
    isEnabled?: boolean;
    timezone?: string;
    retentionDays?: number;
    maxBackups?: number;
  }
): Promise<{
  id: string;
  tenantId: string;
  cronPattern: string;
  isEnabled: boolean;
  timezone: string;
  retentionDays: number;
  maxBackups: number;
  nextRunAt: Date | null;
}> {
  // Validate tenant exists
  const tenant = await prisma.workspace.findUnique({
    where: { id: tenantId },
    select: { id: true, deletedAt: true },
  });

  if (!tenant || tenant.deletedAt) {
    throw new Error('Tenant not found');
  }

  // Calculate next run time based on cron pattern
  const nextRunAt = data.isEnabled ? getNextCronOccurrence(data.cronPattern, data.timezone || 'UTC') : null;

  const schedule = await prisma.backupSchedule.upsert({
    where: { tenantId },
    create: {
      tenantId,
      cronPattern: data.cronPattern,
      isEnabled: data.isEnabled ?? false,
      timezone: data.timezone ?? 'UTC',
      retentionDays: data.retentionDays ?? 30,
      maxBackups: data.maxBackups ?? 10,
      nextRunAt,
    },
    update: {
      cronPattern: data.cronPattern,
      isEnabled: data.isEnabled,
      timezone: data.timezone,
      retentionDays: data.retentionDays,
      maxBackups: data.maxBackups,
      nextRunAt,
    },
  });

  log.info(`Backup schedule ${schedule.isEnabled ? 'enabled' : 'updated'} for tenant ${tenantId}`);

  return schedule;
}

/**
 * Delete a backup schedule
 */
export async function deleteSchedule(tenantId: string): Promise<void> {
  await prisma.backupSchedule.delete({
    where: { tenantId },
  });

  log.info(`Backup schedule deleted for tenant ${tenantId}`);
}

/**
 * List all enabled backup schedules
 */
export async function listEnabledSchedules(): Promise<
  Array<{
    id: string;
    tenantId: string;
    cronPattern: string;
    timezone: string;
    retentionDays: number;
    maxBackups: number;
    nextRunAt: Date | null;
    lastRunAt: Date | null;
    consecutiveFailures: number;
  }>
> {
  const schedules = await prisma.backupSchedule.findMany({
    where: { isEnabled: true },
    orderBy: { nextRunAt: 'asc' },
  });

  return schedules;
}

/**
 * Get schedules that are due to run
 */
export async function getDueSchedules(): Promise<
  Array<{
    id: string;
    tenantId: string;
    cronPattern: string;
    timezone: string;
    retentionDays: number;
    maxBackups: number;
  }>
> {
  const now = new Date();

  const dueSchedules = await prisma.backupSchedule.findMany({
    where: {
      isEnabled: true,
      nextRunAt: { lte: now },
    },
    orderBy: { nextRunAt: 'asc' },
  });

  return dueSchedules;
}
