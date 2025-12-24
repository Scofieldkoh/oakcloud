/**
 * Admin Backup API Routes
 *
 * GET  /api/admin/backup - List all backups
 * POST /api/admin/backup - Create new backup
 *
 * SUPER_ADMIN only
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { backupService } from '@/services/backup.service';
import { createBackupSchema, listBackupsSchema } from '@/lib/validations/backup';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin-backup');

/**
 * GET /api/admin/backup - List all backups
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // Parse and validate query params
    const params = listBackupsSchema.parse({
      tenantId: searchParams.get('tenantId') || undefined,
      status: searchParams.get('status') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
    });

    const result = await backupService.listBackups(params);

    // Convert BigInt to number for JSON serialization
    const backups = result.backups.map((backup) => ({
      ...backup,
      databaseSizeBytes: Number(backup.databaseSizeBytes),
      filesSizeBytes: Number(backup.filesSizeBytes),
      totalSizeBytes: Number(backup.totalSizeBytes),
    }));

    return NextResponse.json({
      backups,
      totalCount: result.totalCount,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(result.totalCount / params.limit),
    });
  } catch (error) {
    log.error('Failed to list backups:', error);

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/backup - Create new backup
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const data = createBackupSchema.parse(body);

    const result = await backupService.createTenantBackup(data.tenantId, session.id, {
      name: data.name,
      retentionDays: data.retentionDays,
      includeAuditLogs: data.includeAuditLogs,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    log.error('Failed to create backup:', error);

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (
        error.message.includes('not found') ||
        error.message.includes('already in progress') ||
        error.message.includes('deleted tenant')
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
