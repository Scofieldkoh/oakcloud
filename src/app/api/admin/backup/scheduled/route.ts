/**
 * Admin Backup Scheduled Runner API Route
 *
 * POST /api/admin/backup/scheduled - Run due scheduled backups
 *
 * This endpoint is designed to be called by:
 * - Cron jobs (e.g., Vercel Cron, external scheduler)
 * - Manual trigger from admin UI
 *
 * Authentication:
 * - SUPER_ADMIN session, OR
 * - CRON_SECRET header for automated jobs
 *
 * IMPORTANT: This is NOT activated by default.
 * To enable scheduled backups:
 * 1. Set CRON_SECRET environment variable
 * 2. Set BACKUP_SCHEDULE_ENABLED=true
 * 3. Configure a cron job to call this endpoint every minute or as needed
 *    - For Vercel: Add to vercel.json
 *    - For external: Use cron service to POST to this endpoint with CRON_SECRET header
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { backupService } from '@/services/backup.service';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin-backup-scheduled');

// Environment variables
const CRON_SECRET = process.env.CRON_SECRET;
const BACKUP_SCHEDULE_ENABLED = process.env.BACKUP_SCHEDULE_ENABLED === 'true';

/**
 * POST /api/admin/backup/scheduled - Run due scheduled backups
 *
 * Headers (for cron jobs):
 * - x-cron-secret: string - Must match CRON_SECRET env var
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication: either SUPER_ADMIN session or CRON_SECRET
    const cronSecret = request.headers.get('x-cron-secret');
    let isAuthorized = false;
    let triggeredBy = 'unknown';
    let isCronJob = false;

    // Check cron secret first (for automated jobs)
    if (CRON_SECRET && cronSecret === CRON_SECRET) {
      isAuthorized = true;
      triggeredBy = 'cron';
      isCronJob = true;
      log.info('Scheduled backup check triggered by cron job');
    } else {
      // Fall back to session auth
      try {
        const session = await requireAuth();
        if (session.isSuperAdmin) {
          isAuthorized = true;
          triggeredBy = `user:${session.id}`;
          log.info(`Scheduled backup check triggered by SUPER_ADMIN ${session.email}`);
        }
      } catch {
        // Session auth failed
        if (!CRON_SECRET) {
          log.warn('No CRON_SECRET configured - cron job authentication disabled');
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if scheduled backups are enabled (only for cron jobs)
    if (isCronJob && !BACKUP_SCHEDULE_ENABLED) {
      log.debug('Scheduled backups disabled (BACKUP_SCHEDULE_ENABLED != true)');
      return NextResponse.json({
        success: true,
        message: 'Scheduled backups are disabled',
        enabled: false,
        processed: 0,
      });
    }

    // Process scheduled backups
    const result = await backupService.processScheduledBackups();

    return NextResponse.json({
      success: true,
      triggeredBy,
      enabled: true,
      ...result,
    });
  } catch (error) {
    log.error('Scheduled backup processing failed:', error);

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/admin/backup/scheduled - Get scheduled backup status
 *
 * Returns the list of enabled schedules and their next run times.
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const cronSecret = request.headers.get('x-cron-secret');
    let isAuthorized = false;

    if (CRON_SECRET && cronSecret === CRON_SECRET) {
      isAuthorized = true;
    } else {
      try {
        const session = await requireAuth();
        if (session.isSuperAdmin) {
          isAuthorized = true;
        }
      } catch {
        // Not authenticated
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get enabled schedules
    const schedules = await backupService.listEnabledSchedules();
    const dueSchedules = await backupService.getDueSchedules();

    return NextResponse.json({
      enabled: BACKUP_SCHEDULE_ENABLED,
      totalSchedules: schedules.length,
      dueNow: dueSchedules.length,
      schedules: schedules.map((s) => ({
        id: s.id,
        tenantId: s.tenantId,
        cronPattern: s.cronPattern,
        timezone: s.timezone,
        retentionDays: s.retentionDays,
        maxBackups: s.maxBackups,
        nextRunAt: s.nextRunAt,
        lastRunAt: s.lastRunAt,
        consecutiveFailures: s.consecutiveFailures,
      })),
    });
  } catch (error) {
    log.error('Failed to get scheduled backup status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
