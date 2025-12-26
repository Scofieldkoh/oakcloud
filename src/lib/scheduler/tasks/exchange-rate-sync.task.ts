/**
 * Exchange Rate Sync Scheduled Task
 *
 * Syncs daily exchange rates from MAS (Monetary Authority of Singapore) API.
 *
 * Configuration:
 * - SCHEDULER_EXCHANGE_RATE_SYNC_ENABLED=true (enable sync scheduling)
 * - SCHEDULER_EXCHANGE_RATE_SYNC_CRON="0 6 * * *" (run daily at 6 AM SGT)
 *
 * Note: MAS typically updates rates around 6 PM SGT the previous day,
 * so 6 AM is a safe time to fetch the latest rates.
 */

import { createLogger } from '@/lib/logger';
import type { TaskRegistration, TaskResult } from '../types';

const log = createLogger('exchange-rate-sync-task');

/**
 * Execute exchange rate sync task
 *
 * Fetches the latest exchange rates from MAS API and updates the database.
 */
async function executeExchangeRateSyncTask(): Promise<TaskResult> {
  log.info('Running exchange rate sync from MAS...');

  try {
    // Dynamic import to avoid circular dependencies
    const { syncFromMAS } = await import('@/services/exchange-rate.service');

    const result = await syncFromMAS();

    if (result.success) {
      const message = `Synced ${result.ratesCreated + result.ratesUpdated} rates (${result.ratesCreated} new, ${result.ratesUpdated} updated)`;

      return {
        success: true,
        message,
        data: {
          ratesCreated: result.ratesCreated,
          ratesUpdated: result.ratesUpdated,
          syncedAt: result.syncedAt.toISOString(),
        },
      };
    } else {
      return {
        success: false,
        error: result.errors.join('; '),
        data: {
          errors: result.errors,
          syncedAt: result.syncedAt.toISOString(),
        },
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Failed to sync exchange rates:', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Exchange rate sync task registration
 *
 * Register this with the scheduler to enable periodic rate syncing.
 */
export const exchangeRateSyncTask: TaskRegistration = {
  id: 'exchange-rate-sync',
  name: 'Exchange Rate Sync',
  description: 'Syncs daily exchange rates from MAS (Monetary Authority of Singapore) API',
  defaultCronPattern: '0 6 * * *', // Daily at 6 AM SGT
  execute: executeExchangeRateSyncTask,
};
