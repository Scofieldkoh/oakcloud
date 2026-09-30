/**
 * Backup Scheduled Task
 *
 * Handles scheduled backup execution: the full-backup schedule (Backup page >
 * Full backups) and the older per-workspace schedules.
 *
 * Configuration:
 * - SCHEDULER_BACKUP_ENABLED=true (enable backup scheduling)
 * - SCHEDULER_BACKUP_CRON="0,15,30,45 * * * *" (check every 15 minutes)
 */

import { createLogger } from '@/lib/logger';
import { backupService } from '@/services/backup.service';
import { cleanupStaleFullBackups, processScheduledFullBackup } from '@/services/backup/full/full-backup.service';
import type { TaskRegistration, TaskResult } from '../types';

const log = createLogger('backup-task');

/**
 * Execute backup task
 *
 * Checks for due scheduled backups and processes them.
 */
async function executeBackupTask(): Promise<TaskResult> {
  log.info('Checking for due scheduled backups...');

  try {
    await cleanupStaleFullBackups();
    const full = await processScheduledFullBackup();
    const result = await backupService.processScheduledBackups();

    if (result.processed === 0 && !full) {
      return {
        success: true,
        message: 'No scheduled backups due at this time',
        data: { processed: 0 },
      };
    }

    const fullFailed = Boolean(full?.error);
    return {
      success: result.failed === 0 && !fullFailed,
      message: `Processed ${result.processed} workspace backups (${result.succeeded} succeeded, ${result.failed} failed)` +
        (full ? `; full backup ${fullFailed ? `failed: ${full.error}` : 'started'}` : ''),
      data: {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        results: result.results,
        fullBackup: full,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Failed to process scheduled backups:', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Backup task registration
 *
 * Register this with the scheduler to enable scheduled backups.
 */
export const backupTask: TaskRegistration = {
  id: 'backup',
  name: 'Scheduled Backups',
  description: 'Processes due backup schedules and creates backups for tenants',
  defaultCronPattern: '0,15,30,45 * * * *', // Every 15 minutes
  execute: executeBackupTask,
};
