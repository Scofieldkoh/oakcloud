/**
 * Admin Backup Schedule API Routes
 *
 * GET /api/admin/backup/schedule - List all backup schedules
 * POST /api/admin/backup/schedule - Create a new backup schedule
 *
 * SUPER_ADMIN only
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createBackupScheduleSchema, listBackupSchedulesSchema } from '@/lib/validations/backup';
import { backupService } from '@/services/backup.service';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin-backup-schedule');

/**
 * GET /api/admin/backup/schedule - List all backup schedules
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const params = listBackupSchedulesSchema.parse({
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 20,
    });

    const where = { tenant: { deletedAt: null } };

    const [schedules, totalCount] = await Promise.all([
      prisma.backupSchedule.findMany({
        where,
        include: {
          tenant: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: [{ isEnabled: 'desc' }, { nextRunAt: 'asc' }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.backupSchedule.count({ where }),
    ]);

    return NextResponse.json({
      schedules,
      totalCount,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(totalCount / params.limit),
    });
  } catch (error) {
    log.error('Failed to list backup schedules:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/backup/schedule - Create a new backup schedule
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!session.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const data = createBackupScheduleSchema.parse(body);

    // Check if tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: data.tenantId },
      select: { id: true, name: true, deletedAt: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    if (tenant.deletedAt) {
      return NextResponse.json({ error: 'Cannot create schedule for deleted tenant' }, { status: 400 });
    }

    // Check if schedule already exists for this tenant
    const existingSchedule = await prisma.backupSchedule.findUnique({
      where: { tenantId: data.tenantId },
    });

    if (existingSchedule) {
      return NextResponse.json(
        { error: 'Schedule already exists for this tenant. Use PUT to update.' },
        { status: 409 }
      );
    }

    // Create the schedule
    const schedule = await backupService.upsertSchedule(data.tenantId, {
      cronPattern: data.cronPattern,
      isEnabled: data.isEnabled,
      timezone: data.timezone,
      retentionDays: data.retentionDays,
      maxBackups: data.maxBackups,
    });

    log.info(`Backup schedule created for tenant ${tenant.name} by ${session.email}`);

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    log.error('Failed to create backup schedule:', error);

    if (error instanceof Error) {
      if (error.message === 'Tenant not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
