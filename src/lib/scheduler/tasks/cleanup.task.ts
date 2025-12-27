/**
 * Cleanup Scheduled Task
 *
 * Handles periodic cleanup of expired and stale backups.
 *
 * Configuration:
 * - SCHEDULER_CLEANUP_ENABLED=true (enable cleanup scheduling)
 * - SCHEDULER_CLEANUP_CRON="0 2 * * *" (run daily at 2 AM)
 */

import { createLogger } from '@/lib/logger';
import type { TaskRegistration, TaskResult } from '../types';

const log = createLogger('cleanup-task');

// Lazy-loaded backup service reference
let backupServiceInstance: typeof import('@/services/backup.service').backupService | null = null;

/**
 * Get backup service (lazy-loaded to avoid chunking issues in instrumentation context)
 */
async function getBackupService(): Promise<typeof import('@/services/backup.service').backupService> {
  if (!backupServiceInstance) {
    // Use relative path - path aliases don't work in instrumentation context with Turbopack
    const backupModule = await import('../../../services/backup.service');
    backupServiceInstance = backupModule.backupService;

    // Validate the service was loaded correctly
    if (!backupServiceInstance || typeof backupServiceInstance.runCleanup !== 'function') {
      throw new Error(
        'Failed to load backup service: runCleanup method not found. ' +
        `Module exports: ${Object.keys(backupModule).join(', ')}`
      );
    }
  }
  return backupServiceInstance;
}

/**
 * Execute cleanup task
 *
 * Cleans up expired backups and marks stale in-progress backups as failed.
 */
async function executeCleanupTask(): Promise<TaskResult> {
  log.info('Running backup cleanup...');

  try {
    const backupService = await getBackupService();
    const result = await backupService.runCleanup();

    const message = [
      `Stale: ${result.staleBackups.markedFailedCount}/${result.staleBackups.staleCount} marked failed`,
      `Expired: ${result.expiredBackups.deletedCount}/${result.expiredBackups.expiredCount} deleted`,
    ].join('; ');

    const hasErrors = result.expiredBackups.failedCount > 0;

    return {
      success: !hasErrors,
      message,
      data: {
        staleBackups: result.staleBackups,
        expiredBackups: {
          scanned: result.expiredBackups.scannedCount,
          deleted: result.expiredBackups.deletedCount,
          failed: result.expiredBackups.failedCount,
        },
      },
      error: hasErrors ? `${result.expiredBackups.failedCount} cleanup errors` : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Failed to run cleanup:', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Cleanup task registration
 *
 * Register this with the scheduler to enable periodic cleanup.
 */
export const cleanupTask: TaskRegistration = {
  id: 'cleanup',
  name: 'Backup Cleanup',
  description: 'Cleans up expired backups and marks stale backups as failed',
  defaultCronPattern: '0 2 * * *', // Daily at 2 AM
  execute: executeCleanupTask,
};
