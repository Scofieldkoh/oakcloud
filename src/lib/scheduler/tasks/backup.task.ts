/**
 * Backup Scheduled Task
 *
 * Handles scheduled backup execution. Checks for due backup schedules
 * and processes them.
 *
 * Configuration:
 * - SCHEDULER_BACKUP_ENABLED=true (enable backup scheduling)
 * - SCHEDULER_BACKUP_CRON="0,15,30,45 * * * *" (check every 15 minutes)
 */

import { createLogger } from '@/lib/logger';
import type { TaskRegistration, TaskResult } from '../types';

const log = createLogger('backup-task');

// Lazy-loaded backup service reference
let backupServiceInstance: typeof import('@/services/backup.service').backupService | null = null;

/**
 * Get backup service (lazy-loaded to avoid chunking issues in instrumentation context)
 */
async function getBackupService(): Promise<typeof import('@/services/backup.service').backupService> {
  if (!backupServiceInstance) {
    // Use dynamic import which works correctly with Next.js path aliases
    const module = await import('@/services/backup.service');
    backupServiceInstance = module.backupService;

    // Validate the service was loaded correctly
    if (!backupServiceInstance || typeof backupServiceInstance.processScheduledBackups !== 'function') {
      throw new Error(
        'Failed to load backup service: processScheduledBackups method not found. ' +
        `Module exports: ${Object.keys(module).join(', ')}`
      );
    }
  }
  return backupServiceInstance;
}

/**
 * Execute backup task
 *
 * Checks for due scheduled backups and processes them.
 */
async function executeBackupTask(): Promise<TaskResult> {
  log.info('Checking for due scheduled backups...');

  try {
    const backupService = await getBackupService();
    const result = await backupService.processScheduledBackups();

    if (result.processed === 0) {
      return {
        success: true,
        message: 'No scheduled backups due at this time',
        data: { processed: 0 },
      };
    }

    return {
      success: result.failed === 0,
      message: `Processed ${result.processed} scheduled backups: ${result.succeeded} succeeded, ${result.failed} failed`,
      data: {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        results: result.results,
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
