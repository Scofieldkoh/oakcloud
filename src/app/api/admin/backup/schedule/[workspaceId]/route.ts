/**
 * Admin Backup Schedule API Routes (by Workspace ID)
 *
 * GET /api/admin/backup/schedule/[workspaceId] - Get schedule for a workspace
 * PUT /api/admin/backup/schedule/[workspaceId] - Update schedule for a workspace
 * DELETE /api/admin/backup/schedule/[workspaceId] - Delete schedule for a workspace
 *
 * SUPER_ADMIN only
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateBackupScheduleSchema } from '@/lib/validations/backup';
import { backupService } from '@/services/backup.service';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin-backup-schedule');

type RouteParams = { params: Promise<{ workspaceId: string }> };

/**
 * GET /api/admin/backup/schedule/[workspaceId] - Get schedule for a workspace
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { workspaceId } = await params;

    const schedule = await prisma.backupSchedule.findUnique({
      where: { tenantId: workspaceId },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    return NextResponse.json(schedule);
  } catch (error) {
    log.error('Failed to get backup schedule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/backup/schedule/[workspaceId] - Update schedule for a workspace
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { workspaceId } = await params;
    const body = await request.json();
    const data = updateBackupScheduleSchema.parse(body);

    // Check if workspace exists in the legacy tenant table.
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, deletedAt: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    if (workspace.deletedAt) {
      return NextResponse.json({ error: 'Cannot update schedule for deleted workspace' }, { status: 400 });
    }

    // Get existing schedule or use defaults
    const existingSchedule = await prisma.backupSchedule.findUnique({
      where: { tenantId: workspaceId },
    });

    // Update or create the schedule
    const schedule = await backupService.upsertSchedule(workspaceId, {
      cronPattern: data.cronPattern ?? existingSchedule?.cronPattern ?? '0 2 * * *',
      isEnabled: data.isEnabled ?? existingSchedule?.isEnabled,
      timezone: data.timezone ?? existingSchedule?.timezone,
      retentionDays: data.retentionDays ?? existingSchedule?.retentionDays,
      maxBackups: data.maxBackups ?? existingSchedule?.maxBackups,
    });

    log.info(`Backup schedule updated for workspace ${workspace.name} by ${session.email}`);

    return NextResponse.json(schedule);
  } catch (error) {
    log.error('Failed to update backup schedule:', error);

    if (error instanceof Error) {
      if (error.message === 'Tenant not found') {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/backup/schedule/[workspaceId] - Delete schedule for a workspace
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { workspaceId } = await params;

    // Check if schedule exists
    const schedule = await prisma.backupSchedule.findUnique({
      where: { tenantId: workspaceId },
      include: {
        tenant: { select: { name: true } },
      },
    });

    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    await backupService.deleteSchedule(workspaceId);

    log.info(`Backup schedule deleted for workspace ${schedule.tenant.name} by ${session.email}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Failed to delete backup schedule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
