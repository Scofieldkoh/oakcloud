/**
 * Single Deadline API Routes
 *
 * GET /api/deadlines/[id] - Get a deadline by ID
 * PATCH /api/deadlines/[id] - Update a deadline
 * DELETE /api/deadlines/[id] - Delete a deadline
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { requireTenantContext } from '@/lib/api-helpers';
import {
  getDeadlineById,
  updateDeadline,
  deleteDeadline,
  completeDeadline,
  reopenDeadline,
  updateBillingStatus,
} from '@/services/deadline.service';
import {
  updateDeadlineSchema,
  completeDeadlineSchema,
  updateBillingSchema,
} from '@/lib/validations/deadline';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantIdParam = req.nextUrl.searchParams.get('tenantId');
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;
    const tenantId = tenantResult.tenantId;
    const { id } = await params;

    const deadline = await getDeadlineById(id, tenantId);
    if (!deadline) {
      return NextResponse.json({ error: 'Deadline not found' }, { status: 404 });
    }

    // Check permission to view company
    const canView = await hasPermission(session.id, 'company', 'read', deadline.companyId);
    if (!canView) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    return NextResponse.json(deadline);
  } catch (error) {
    console.error('Error in GET /api/deadlines/[id]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const tenantIdParam = (body && typeof body === 'object' && 'tenantId' in body)
      ? (body.tenantId as string | null | undefined)
      : undefined;
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;

    const tenantId = tenantResult.tenantId;
    const userId = session.id;
    const { id } = await params;

    // Get existing deadline to check permissions
    const existing = await getDeadlineById(id, tenantId);
    if (!existing) {
      return NextResponse.json({ error: 'Deadline not found' }, { status: 404 });
    }

    // Check permission
    const canUpdate = await hasPermission(session.id, 'company', 'update', existing.companyId);
    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Handle special actions
    if (body.action === 'complete') {
      // Validate complete input
      const parseResult = completeDeadlineSchema.safeParse({ id, ...body });
      if (!parseResult.success) {
        return NextResponse.json(
          { error: parseResult.error.errors[0]?.message || 'Invalid input' },
          { status: 400 }
        );
      }

      const deadline = await completeDeadline(
        parseResult.data,
        { tenantId, userId }
      );
      return NextResponse.json(deadline);
    }

    if (body.action === 'reopen') {
      const deadline = await reopenDeadline(
        id,
        { tenantId, userId }
      );
      return NextResponse.json(deadline);
    }

    if (body.action === 'update-billing') {
      // Validate billing input
      const parseResult = updateBillingSchema.safeParse({ id, ...body });
      if (!parseResult.success) {
        return NextResponse.json(
          { error: parseResult.error.errors[0]?.message || 'Invalid input' },
          { status: 400 }
        );
      }

      const deadline = await updateBillingStatus(
        parseResult.data,
        { tenantId, userId }
      );
      return NextResponse.json(deadline);
    }

    // Regular update - validate with Zod
    const parseResult = updateDeadlineSchema.safeParse({ id, ...body });
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const deadline = await updateDeadline(
      parseResult.data,
      { tenantId, userId }
    );

    return NextResponse.json(deadline);
  } catch (error) {
    console.error('Error in PATCH /api/deadlines/[id]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantIdParam = req.nextUrl.searchParams.get('tenantId');
    const tenantResult = await requireTenantContext(session, tenantIdParam);
    if (tenantResult.error) return tenantResult.error;

    const tenantId = tenantResult.tenantId;
    const userId = session.id;
    const { id } = await params;

    // Get existing deadline to check permissions
    const existing = await getDeadlineById(id, tenantId);
    if (!existing) {
      return NextResponse.json({ error: 'Deadline not found' }, { status: 404 });
    }

    // Check permission
    const canDelete = await hasPermission(session.id, 'company', 'update', existing.companyId);
    if (!canDelete) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    await deleteDeadline(id, { tenantId, userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/deadlines/[id]:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
