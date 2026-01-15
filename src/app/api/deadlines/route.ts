/**
 * Deadlines API Routes
 *
 * GET /api/deadlines - List/search deadlines
 * POST /api/deadlines - Create a new deadline
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
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
          if (!Array.isArray(body.deadlineIds) || body.deadlineIds.length === 0) {
            return NextResponse.json({ error: 'deadlineIds array is required' }, { status: 400 });
          }
          const count = await bulkAssignDeadlines(
            body.deadlineIds,
            body.assigneeId || null,
            { tenantId: tenantId, userId: session.id }
          );
          return NextResponse.json({ success: true, count });
        }

        case 'bulk-status': {
          if (!Array.isArray(body.deadlineIds) || body.deadlineIds.length === 0) {
            return NextResponse.json({ error: 'deadlineIds array is required' }, { status: 400 });
          }
          if (!body.status) {
            return NextResponse.json({ error: 'status is required' }, { status: 400 });
          }
          const count = await bulkUpdateStatus(
            body.deadlineIds,
            body.status,
            { tenantId: tenantId, userId: session.id }
          );
          return NextResponse.json({ success: true, count });
        }

        case 'bulk-delete': {
          if (!Array.isArray(body.deadlineIds) || body.deadlineIds.length === 0) {
            return NextResponse.json({ error: 'deadlineIds array is required' }, { status: 400 });
          }
          const count = await bulkDeleteDeadlines(
            body.deadlineIds,
            { tenantId: tenantId, userId: session.id }
          );
          return NextResponse.json({ success: true, count });
        }

        case 'generate': {
          // Generate deadlines for a company
          if (!body.companyId) {
            return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
          }

          // Check permission
          const canCreate = await hasPermission(session.id, 'company', 'update', body.companyId);
          if (!canCreate) {
            return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
          }

          const result = await generateDeadlinesForCompany(
            body.companyId,
            { tenantId: tenantId, userId: session.id },
            {
              templateCodes: body.templateCodes,
              monthsAhead: body.monthsAhead,
              serviceId: body.serviceId,
            }
          );
          return NextResponse.json({ success: true, ...result });
        }

        default:
          return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
      }
    }

    // Create single deadline
    if (!body.companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }
    if (!body.title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (!body.category) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 });
    }
    if (!body.periodLabel) {
      return NextResponse.json({ error: 'periodLabel is required' }, { status: 400 });
    }
    if (!body.statutoryDueDate) {
      return NextResponse.json({ error: 'statutoryDueDate is required' }, { status: 400 });
    }

    // Check permission
    const canCreate = await hasPermission(session.id, 'company', 'update', body.companyId);
    if (!canCreate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const deadline = await createDeadline(body, {
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
