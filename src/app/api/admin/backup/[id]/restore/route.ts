/**
 * Admin Backup Restore API Route
 *
 * POST /api/admin/backup/[id]/restore - Restore from backup
 *
 * SUPER_ADMIN only
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { backupService } from '@/services/backup.service';
import { restoreBackupSchema } from '@/lib/validations/backup';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin-backup-restore');

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/backup/[id]/restore - Restore from backup
 *
 * Body:
 * - dryRun: boolean (default: false) - Validate without restoring
 * - overwriteExisting: boolean (default: false) - Overwrite existing tenant data
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const options = restoreBackupSchema.parse(body);

    const result = await backupService.restoreTenantBackup(id, session.id, {
      dryRun: options.dryRun,
      overwriteExisting: options.overwriteExisting,
    });

    return NextResponse.json(result);
  } catch (error) {
    log.error('Failed to restore backup:', error);

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Backup not found') {
        return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      }
      if (
        error.message.includes('not in COMPLETED status') ||
        error.message.includes('already exists') ||
        error.message.includes('corrupted') ||
        error.message.includes('validation failed')
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
