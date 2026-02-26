import { NextRequest, NextResponse } from 'next/server';
import { canAccessCompany, requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getTenantById } from '@/services/tenant.service';
import {
  createWorkflowProject,
  searchWorkflowProjects,
  type WorkflowProjectSearchParams,
  type WorkflowProjectSortField,
  type WorkflowProjectStatus,
  type WorkflowDueBucket,
} from '@/services/workflow-project.service';
import { z } from 'zod';

function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createEmptyResult(page: number, limit: number) {
  return {
    projects: [],
    total: 0,
    page,
    limit,
    totalPages: 0,
    stats: {
      total: 0,
      dueToday: 0,
      dueThisWeek: 0,
      dueNextWeek: 0,
      overdue: 0,
      inProgress: 0,
      completed: 0,
    },
    projectOptions: [],
    clientOptions: [],
    templateOptions: [],
    assigneeOptions: [],
  };
}

const createWorkflowProjectSchema = z.object({
  companyId: z.string().uuid('Invalid company ID'),
  name: z.string().trim().min(1, 'Project name is required').max(255, 'Project name is too long'),
  startDate: z.string().date('Invalid start date'),
  dueDate: z.string().date('Invalid due date'),
  recurrenceMonths: z.number().int().min(1, 'Recurring interval must be at least 1 month').max(120).nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'company', 'read');

    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');

    let effectiveTenantId = session.tenantId;
    if (session.isSuperAdmin && tenantIdParam) {
      const tenant = await getTenantById(tenantIdParam);
      if (!tenant) {
        return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      }
      effectiveTenantId = tenantIdParam;
    }

    const params: WorkflowProjectSearchParams = {
      query: searchParams.get('q') || undefined,
      page: parseOptionalNumber(searchParams.get('page')),
      limit: parseOptionalNumber(searchParams.get('limit')),
      sortBy: (searchParams.get('sortBy') || undefined) as WorkflowProjectSortField | undefined,
      sortOrder: (searchParams.get('sortOrder') || undefined) as 'asc' | 'desc' | undefined,
      dueBucket: (searchParams.get('dueBucket') || undefined) as WorkflowDueBucket | undefined,
      status: (searchParams.get('status') || undefined) as WorkflowProjectStatus | undefined,
      projectName: searchParams.get('projectName') || undefined,
      clientName: searchParams.get('clientName') || undefined,
      templateName: searchParams.get('templateName') || undefined,
      assignee: searchParams.get('assignee') || undefined,
      startDateFrom: searchParams.get('startDateFrom') || undefined,
      startDateTo: searchParams.get('startDateTo') || undefined,
      nextTaskDueDateFrom: searchParams.get('nextTaskDueDateFrom') || undefined,
      nextTaskDueDateTo: searchParams.get('nextTaskDueDateTo') || undefined,
      dueDateFrom: searchParams.get('dueDateFrom') || undefined,
      dueDateTo: searchParams.get('dueDateTo') || undefined,
      progressMin: parseOptionalNumber(searchParams.get('progressMin')),
      progressMax: parseOptionalNumber(searchParams.get('progressMax')),
      teamTasksMin: parseOptionalNumber(searchParams.get('teamTasksMin')),
      teamTasksMax: parseOptionalNumber(searchParams.get('teamTasksMax')),
      clientTasksMin: parseOptionalNumber(searchParams.get('clientTasksMin')),
      clientTasksMax: parseOptionalNumber(searchParams.get('clientTasksMax')),
      billingMin: parseOptionalNumber(searchParams.get('billingMin')),
      billingMax: parseOptionalNumber(searchParams.get('billingMax')),
    };

    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    if (!session.isSuperAdmin && !session.isTenantAdmin && !session.hasAllCompaniesAccess) {
      if (!session.companyIds || session.companyIds.length === 0) {
        return NextResponse.json(createEmptyResult(page, limit));
      }
    }

    const result = await searchWorkflowProjects(params, {
      tenantId: effectiveTenantId,
      companyIds:
        !session.isSuperAdmin && !session.isTenantAdmin && !session.hasAllCompaniesAccess
          ? session.companyIds
          : undefined,
      skipTenantFilter: session.isSuperAdmin && !effectiveTenantId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    const payload = createWorkflowProjectSchema.parse(await request.json());
    if (payload.dueDate < payload.startDate) {
      return NextResponse.json({ error: 'Due date must be on or after start date' }, { status: 400 });
    }

    await requirePermission(session, 'company', 'update', payload.companyId);

    if (!(await canAccessCompany(session, payload.companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const detail = await createWorkflowProject(payload, {
      tenantId: session.tenantId,
      skipTenantFilter: session.isSuperAdmin && !session.tenantId,
    });

    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
