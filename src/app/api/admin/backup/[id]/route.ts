/**
 * Admin Backup Detail API Routes
 *
 * GET    /api/admin/backup/[id] - Get backup details
 * DELETE /api/admin/backup/[id] - Delete backup
 *
 * SUPER_ADMIN only
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { backupService } from '@/services/backup.service';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin-backup-detail');

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/backup/[id] - Get backup details
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Return backup details
    const backup = await backupService.getBackupDetails(id);

    // Convert BigInt to number for JSON serialization
    return NextResponse.json({
      ...backup,
      databaseSizeBytes: Number(backup.databaseSizeBytes),
      filesSizeBytes: Number(backup.filesSizeBytes),
      totalSizeBytes: Number(backup.totalSizeBytes),
    });
  } catch (error) {
    log.error('Failed to get backup details:', error);

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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/backup/[id] - Delete backup
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    await backupService.deleteBackup(id, session.id);

    return NextResponse.json({ success: true, message: 'Backup deleted successfully' });
  } catch (error) {
    log.error('Failed to delete backup:', error);

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
      if (error.message.includes('in progress')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
