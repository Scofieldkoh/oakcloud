/**
 * Deadlines API Routes
 *
 * GET /api/deadlines - List/search deadlines
 * POST /api/deadlines - Create a new deadline
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import {
  createDeadline,
  searchDeadlines,
  getDeadlineStats,
  getUpcomingDeadlines,
  getOverdueDeadlines,
  bulkAssignDeadlines,
  bulkUpdateStatus,
  bulkDeleteDeadlines,
} from '@/services/deadline.service';
import {
  generateDeadlinesForCompany,
  getAllDeadlineTemplates,
} from '@/services/deadline-generation.service';
import {
  createDeadlineSchema,
  bulkAssignSchema,
  bulkStatusSchema,
  bulkDeleteSchema,
  generateDeadlinesSchema,
} from '@/lib/validations/deadline';
import type { DeadlineCategory, DeadlineStatus, DeadlineBillingStatus } from '@/generated/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const tenantId = session.tenantId;
    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action');

    // Special actions
    if (action === 'stats') {
      const companyId = searchParams.get('companyId') || undefined;
      const assigneeId = searchParams.get('assigneeId') || undefined;

      const stats = await getDeadlineStats(tenantId, { companyId, assigneeId });
      return NextResponse.json(stats);
    }

    if (action === 'upcoming') {
      const daysAhead = parseInt(searchParams.get('daysAhead') || '30', 10);
      const companyId = searchParams.get('companyId') || undefined;
      const assigneeId = searchParams.get('assigneeId') || undefined;
      const category = searchParams.get('category') as DeadlineCategory | undefined;
      const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

      const deadlines = await getUpcomingDeadlines(tenantId, daysAhead, {
        companyId,
        assigneeId,
        category,
        limit,
      });
      return NextResponse.json(deadlines);
    }

    if (action === 'overdue') {
      const companyId = searchParams.get('companyId') || undefined;
      const assigneeId = searchParams.get('assigneeId') || undefined;
      const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

      const deadlines = await getOverdueDeadlines(tenantId, {
        companyId,
        assigneeId,
        limit,
      });
      return NextResponse.json(deadlines);
    }

    if (action === 'templates') {
      const templates = getAllDeadlineTemplates();
      return NextResponse.json(templates);
    }

    // Regular search/list
    const params = {
      companyId: searchParams.get('companyId') || undefined,
      contractServiceId: searchParams.get('contractServiceId') || undefined,
      category: searchParams.get('category') as DeadlineCategory | undefined,
      status: searchParams.has('status')
        ? searchParams.getAll('status') as DeadlineStatus[]
        : undefined,
      assigneeId: searchParams.has('assigneeId')
        ? searchParams.get('assigneeId') || undefined
        : undefined,
      isInScope: searchParams.has('isInScope')
        ? searchParams.get('isInScope') === 'true'
        : undefined,
      isBacklog: searchParams.has('isBacklog')
        ? searchParams.get('isBacklog') === 'true'
        : undefined,
      billingStatus: searchParams.get('billingStatus') as DeadlineBillingStatus | undefined,
      dueDateFrom: searchParams.get('dueDateFrom') || undefined,
      dueDateTo: searchParams.get('dueDateTo') || undefined,
      query: searchParams.get('query') || undefined,
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(searchParams.get('limit') || '20', 10), 100),
      sortBy: searchParams.get('sortBy') as 'title' | 'statutoryDueDate' | 'status' | 'category' | 'company' | 'createdAt' | 'updatedAt' | undefined,
      sortOrder: searchParams.get('sortOrder') as 'asc' | 'desc' | undefined,
    };

    const result = await searchDeadlines(tenantId, params);

    return NextResponse.json({
      deadlines: result.deadlines,
      total: result.total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(result.total / params.limit),
    });
  } catch (error) {
    console.error('Error in GET /api/deadlines:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const tenantId = session.tenantId;
    const body = await req.json();

    // Handle bulk operations
    if (body.action) {
      switch (body.action) {
        case 'bulk-assign': {
          // Validate input
          const parseResult = bulkAssignSchema.safeParse(body);
          if (!parseResult.success) {
            return NextResponse.json(
              { error: parseResult.error.errors[0]?.message || 'Invalid input' },
              { status: 400 }
            );
          }
          const { deadlineIds, assigneeId } = parseResult.data;

          // Verify permission for all affected deadlines
          const deadlines = await prisma.deadline.findMany({
            where: { id: { in: deadlineIds }, tenantId, deletedAt: null },
            select: { id: true, companyId: true },
          });

          // Check permissions for each unique company
          const uniqueCompanyIds = [...new Set(deadlines.map((d) => d.companyId))];
          for (const companyId of uniqueCompanyIds) {
            const canUpdate = await hasPermission(session.id, 'company', 'update', companyId);
            if (!canUpdate) {
              return NextResponse.json({ error: 'Permission denied for one or more deadlines' }, { status: 403 });
            }
          }

          const count = await bulkAssignDeadlines(
            deadlineIds,
            assigneeId,
            { tenantId: tenantId, userId: session.id }
          );
          return NextResponse.json({ success: true, count });
        }

        case 'bulk-status': {
          // Validate input
          const parseResult = bulkStatusSchema.safeParse(body);
          if (!parseResult.success) {
            return NextResponse.json(
              { error: parseResult.error.errors[0]?.message || 'Invalid input' },
              { status: 400 }
            );
          }
          const { deadlineIds, status } = parseResult.data;

          // Verify permission for all affected deadlines
          const deadlines = await prisma.deadline.findMany({
            where: { id: { in: deadlineIds }, tenantId, deletedAt: null },
            select: { id: true, companyId: true },
          });

          const uniqueCompanyIds = [...new Set(deadlines.map((d) => d.companyId))];
          for (const companyId of uniqueCompanyIds) {
            const canUpdate = await hasPermission(session.id, 'company', 'update', companyId);
            if (!canUpdate) {
              return NextResponse.json({ error: 'Permission denied for one or more deadlines' }, { status: 403 });
            }
          }

          const count = await bulkUpdateStatus(
            deadlineIds,
            status,
            { tenantId: tenantId, userId: session.id }
          );
          return NextResponse.json({ success: true, count });
        }

        case 'bulk-delete': {
          // Validate input
          const parseResult = bulkDeleteSchema.safeParse(body);
          if (!parseResult.success) {
            return NextResponse.json(
              { error: parseResult.error.errors[0]?.message || 'Invalid input' },
              { status: 400 }
            );
          }
          const { deadlineIds } = parseResult.data;

          // Verify permission for all affected deadlines
          const deadlines = await prisma.deadline.findMany({
            where: { id: { in: deadlineIds }, tenantId, deletedAt: null },
            select: { id: true, companyId: true },
          });

          const uniqueCompanyIds = [...new Set(deadlines.map((d) => d.companyId))];
          for (const companyId of uniqueCompanyIds) {
            const canUpdate = await hasPermission(session.id, 'company', 'update', companyId);
            if (!canUpdate) {
              return NextResponse.json({ error: 'Permission denied for one or more deadlines' }, { status: 403 });
            }
          }

          const count = await bulkDeleteDeadlines(
            deadlineIds,
            { tenantId: tenantId, userId: session.id }
          );
          return NextResponse.json({ success: true, count });
        }

        case 'generate': {
          // Validate input
          const parseResult = generateDeadlinesSchema.safeParse(body);
          if (!parseResult.success) {
            return NextResponse.json(
              { error: parseResult.error.errors[0]?.message || 'Invalid input' },
              { status: 400 }
            );
          }
          const { companyId, templateCodes, monthsAhead, serviceId } = parseResult.data;

          // Check permission
          const canCreate = await hasPermission(session.id, 'company', 'update', companyId);
          if (!canCreate) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
          }

          const result = await generateDeadlinesForCompany(
            companyId,
            { tenantId: tenantId, userId: session.id },
            { templateCodes, monthsAhead, serviceId }
          );
          return NextResponse.json({ success: true, ...result });
        }

        default:
          return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
      }
    }

    // Create single deadline - validate with Zod
    const parseResult = createDeadlineSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const validatedData = parseResult.data;

    // Check permission
    const canCreate = await hasPermission(session.id, 'company', 'update', validatedData.companyId);
    if (!canCreate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const deadline = await createDeadline(validatedData, {
      tenantId: tenantId,
      userId: session.id,
    });

    return NextResponse.json(deadline, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/deadlines:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
