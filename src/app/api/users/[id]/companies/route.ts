/**
 * User Company Assignments API Routes
 *
 * GET    /api/users/:id/companies - Get user's company assignments
 * POST   /api/users/:id/companies - Assign user to a company
 * DELETE /api/users/:id/companies/:companyId - Remove company assignment
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, requireRole } from '@/lib/auth';
import {
  getUserCompanyAssignments,
  assignUserToCompany,
  removeCompanyAssignment,
  updateCompanyAssignment,
} from '@/services/user-company.service';
import { z } from 'zod';

const assignCompanySchema = z.object({
  companyId: z.string().uuid('Invalid company ID'),
  accessLevel: z.enum(['VIEW', 'EDIT', 'MANAGE']).optional(),
  isPrimary: z.boolean().optional(),
});

const updateAssignmentSchema = z.object({
  assignmentId: z.string().uuid('Invalid assignment ID'),
  accessLevel: z.enum(['VIEW', 'EDIT', 'MANAGE']).optional(),
  isPrimary: z.boolean().optional(),
});

const removeAssignmentSchema = z.object({
  assignmentId: z.string().uuid('Invalid assignment ID'),
});

// GET - Get user's company assignments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);
    const { id: userId } = await params;

    if (!session.tenantId && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const assignments = await getUserCompanyAssignments(
      userId,
      session.tenantId || ''
    );

    return NextResponse.json({ assignments });
  } catch (error) {
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

// POST - Assign user to company
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);
    const { id: userId } = await params;
    const body = await request.json();

    if (!session.tenantId && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = assignCompanySchema.parse(body);

    const assignment = await assignUserToCompany(
      { userId, ...data },
      session.tenantId || '',
      session.id
    );

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
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

// PATCH - Update assignment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);
    const body = await request.json();

    if (!session.tenantId && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { assignmentId, ...updateData } = updateAssignmentSchema.parse(body);

    const assignment = await updateCompanyAssignment(
      assignmentId,
      updateData,
      session.tenantId || '',
      session.id
    );

    return NextResponse.json({ assignment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
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

// DELETE - Remove assignment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);
    const body = await request.json();

    if (!session.tenantId && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { assignmentId } = removeAssignmentSchema.parse(body);

    await removeCompanyAssignment(
      assignmentId,
      session.tenantId || '',
      session.id
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
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
