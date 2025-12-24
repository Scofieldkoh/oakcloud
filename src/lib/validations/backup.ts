/**
 * Backup Validation Schemas
 *
 * Zod schemas for validating backup-related API inputs.
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const backupStatusEnum = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'RESTORING',
  'RESTORED',
  'DELETED',
]);

export const backupTypeEnum = z.enum(['MANUAL', 'SCHEDULED']);

// ============================================================================
// Create Backup
// ============================================================================

export const createBackupSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  name: z
    .string()
    .max(200, 'Name must be at most 200 characters')
    .optional(),
  retentionDays: z
    .number()
    .int()
    .min(1, 'Retention must be at least 1 day')
    .max(365, 'Retention must be at most 365 days')
    .optional(),
  includeAuditLogs: z.boolean().optional().default(true),
});

export type CreateBackupInput = z.infer<typeof createBackupSchema>;

// ============================================================================
// List Backups
// ============================================================================

export const listBackupsSchema = z.object({
  tenantId: z.string().uuid().optional(),
  status: backupStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListBackupsInput = z.infer<typeof listBackupsSchema>;

// ============================================================================
// Restore Backup
// ============================================================================

export const restoreBackupSchema = z.object({
  dryRun: z.boolean().default(false),
  overwriteExisting: z.boolean().default(false),
});

export type RestoreBackupInput = z.infer<typeof restoreBackupSchema>;

// ============================================================================
// Backup Schedule
// ============================================================================

// Simple cron pattern validation (5 fields: minute hour day month weekday)
const cronPatternRegex = /^[\d*,\-\/]+ [\d*,\-\/]+ [\d*,\-\/]+ [\d*,\-\/]+ [\d*,\-\/]+$/;

export const createBackupScheduleSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  cronPattern: z
    .string()
    .min(9, 'Cron pattern too short')
    .max(100, 'Cron pattern too long')
    .regex(cronPatternRegex, 'Invalid cron pattern format (expected: minute hour day month weekday)'),
  isEnabled: z.boolean().default(false),
  timezone: z.string().min(1).max(50).default('UTC'),
  retentionDays: z.coerce.number().int().min(1).max(365).default(30),
  maxBackups: z.coerce.number().int().min(1).max(100).default(10),
});

export type CreateBackupScheduleInput = z.infer<typeof createBackupScheduleSchema>;

export const updateBackupScheduleSchema = z.object({
  cronPattern: z
    .string()
    .min(9, 'Cron pattern too short')
    .max(100, 'Cron pattern too long')
    .regex(cronPatternRegex, 'Invalid cron pattern format (expected: minute hour day month weekday)')
    .optional(),
  isEnabled: z.boolean().optional(),
  timezone: z.string().min(1).max(50).optional(),
  retentionDays: z.coerce.number().int().min(1).max(365).optional(),
  maxBackups: z.coerce.number().int().min(1).max(100).optional(),
});

export type UpdateBackupScheduleInput = z.infer<typeof updateBackupScheduleSchema>;

export const listBackupSchedulesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListBackupSchedulesInput = z.infer<typeof listBackupSchedulesSchema>;
