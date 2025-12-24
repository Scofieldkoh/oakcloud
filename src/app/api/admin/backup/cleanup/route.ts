/**
 * Admin Backup Cleanup API Route
 *
 * POST /api/admin/backup/cleanup - Run backup cleanup (expired + stale)
 *
 * This endpoint is designed to be called by:
 * - Cron jobs (e.g., Vercel Cron, external scheduler)
 * - Manual trigger from admin UI
 * - Application startup (optional)
 *
 * Authentication:
 * - SUPER_ADMIN session, OR
 * - CRON_SECRET header for automated jobs
 *
 * IMPORTANT: This is NOT activated by default.
 * To enable scheduled cleanup:
 * 1. Set CRON_SECRET environment variable
 * 2. Configure a cron job to call this endpoint
 *    - For Vercel: Add to vercel.json
 *    - For external: Use cron service to POST to this endpoint with CRON_SECRET header
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { backupService } from '@/services/backup.service';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin-backup-cleanup');

// Environment variables
const CRON_SECRET = process.env.CRON_SECRET;
const BACKUP_CLEANUP_ENABLED = process.env.BACKUP_CLEANUP_ENABLED === 'true';

/**
 * POST /api/admin/backup/cleanup - Run backup cleanup
 *
 * Query params:
 * - dryRun: boolean (default: false) - Preview what would be cleaned up
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
      log.info('Backup cleanup triggered by cron job');
    } else {
      // Fall back to session auth
      try {
        const session = await requireAuth();
        if (session.isSuperAdmin) {
          isAuthorized = true;
          triggeredBy = `user:${session.id}`;
          log.info(`Backup cleanup triggered by SUPER_ADMIN ${session.email}`);
        }
      } catch {
        // Session auth failed, check if we have a valid cron secret configured
        if (!CRON_SECRET) {
          log.warn('No CRON_SECRET configured - cron job authentication disabled');
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if cleanup is enabled (only for cron jobs)
    if (isCronJob && !BACKUP_CLEANUP_ENABLED) {
      log.debug('Backup cleanup disabled (BACKUP_CLEANUP_ENABLED != true)');
      return NextResponse.json({
        success: true,
        message: 'Backup cleanup is disabled',
        enabled: false,
      });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';

    // Run cleanup
    const result = await backupService.runCleanup({ dryRun });

    return NextResponse.json({
      success: true,
      triggeredBy,
      dryRun,
      enabled: true,
      ...result,
    });
  } catch (error) {
    log.error('Backup cleanup failed:', error);

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
 * GET /api/admin/backup/cleanup - Get cleanup status/preview
 *
 * Returns a preview of what would be cleaned up without actually doing it.
 * Useful for monitoring dashboards.
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

    // Run cleanup in dry-run mode to preview
    const result = await backupService.runCleanup({ dryRun: true });

    return NextResponse.json({
      preview: true,
      enabled: BACKUP_CLEANUP_ENABLED,
      ...result,
    });
  } catch (error) {
    log.error('Backup cleanup preview failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
