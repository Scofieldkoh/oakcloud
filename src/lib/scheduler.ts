/**
 * Backup Scheduler
 *
 * Auto-starts when the application starts and runs scheduled backups
 * based on enabled BackupSchedule records in the database.
 *
 * Configuration via .env:
 * - BACKUP_SCHEDULE_ENABLED=true  (enable the scheduler)
 * - BACKUP_SCHEDULE_CHECK_CRON (how often to check for due backups, default: every 15 minutes)
 * - BACKUP_DEFAULT_RETENTION_DAYS=30
 * - BACKUP_DEFAULT_MAX_BACKUPS=10
 */

import cron, { ScheduledTask } from 'node-cron';
import { createLogger } from '@/lib/logger';

const log = createLogger('scheduler');

let isSchedulerInitialized = false;
let scheduledTask: ScheduledTask | null = null;

/**
 * Initialize the backup scheduler
 * Called once when the application starts via instrumentation.ts
 */
export async function initializeScheduler(): Promise<void> {
  // Prevent double initialization
  if (isSchedulerInitialized) {
    log.debug('Scheduler already initialized, skipping');
    return;
  }

  const isEnabled = process.env.BACKUP_SCHEDULE_ENABLED === 'true';
  if (!isEnabled) {
    log.info('Backup scheduler is disabled (BACKUP_SCHEDULE_ENABLED != true)');
    return;
  }

  // Default: check every 15 minutes (0,15,30,45 * * * *)
  // This ensures schedules at :00, :15, :30, :45 are caught promptly
  const checkCron = process.env.BACKUP_SCHEDULE_CHECK_CRON || '0,15,30,45 * * * *';

  if (!cron.validate(checkCron)) {
    log.error(`Invalid cron pattern: ${checkCron}`);
    return;
  }

  log.info(`Initializing backup scheduler with check pattern: ${checkCron}`);

  scheduledTask = cron.schedule(checkCron, async () => {
    await runScheduledBackups();
  });

  isSchedulerInitialized = true;
  log.info('Backup scheduler initialized successfully');
}

/**
 * Run all due scheduled backups
 * This is called by the cron job
 */
async function runScheduledBackups(): Promise<void> {
  log.info('Checking for due scheduled backups...');

  try {
    // Dynamic import to avoid circular dependencies
    const { backupService } = await import('@/services/backup.service');

    const result = await backupService.processScheduledBackups();

    if (result.processed === 0) {
      log.debug('No scheduled backups due at this time');
    } else {
      log.info(
        `Processed ${result.processed} scheduled backups: ${result.succeeded} succeeded, ${result.failed} failed`
      );
    }
  } catch (error) {
    log.error('Failed to process scheduled backups:', error);
  }
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    isSchedulerInitialized = false;
    log.info('Backup scheduler stopped');
  }
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
  return isSchedulerInitialized && scheduledTask !== null;
}

/**
 * Get scheduler status for admin UI
 */
export function getSchedulerStatus(): {
  enabled: boolean;
  running: boolean;
  checkCron: string;
} {
  return {
    enabled: process.env.BACKUP_SCHEDULE_ENABLED === 'true',
    running: isSchedulerRunning(),
    checkCron: process.env.BACKUP_SCHEDULE_CHECK_CRON || '0 * * * *',
  };
}
