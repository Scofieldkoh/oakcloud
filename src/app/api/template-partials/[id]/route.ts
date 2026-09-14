import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { assertA4WriterCanPreserve } from '@/lib/document-editor/a4-editor-format';
import { updateTemplatePartialSchema } from '@/lib/validations/template-partial';
import {
  getTemplatePartial,
  updateTemplatePartial,
  deleteTemplatePartial,
  getPartialUsage,
} from '@/services/template-partial.service';
import { ZodError } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function withRevision<T extends { version: number }>(value: T) {
  return { ...value, revision: value.version };
}

function apiError(error: unknown, operation: string) {
  if (error instanceof ZodError) {
    const firstError = error.errors[0];
    return NextResponse.json(
      { error: firstError?.message || 'Validation error' },
      { status: 400 },
    );
  }
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code, ...(error.details === undefined ? {} : { details: error.details }) },
      { status: error.statusCode },
    );
  }
  if (error instanceof Error) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error.message === 'Partial not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (
      error.message === 'A partial with this name already exists'
      || error.message.startsWith('Cannot delete partial')
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error.message.includes('must start with a letter')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }
  console.error(`${operation} template partial error`);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');
    const effectiveTenantId =
      session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const { id } = await params;
    const partial = await getTemplatePartial(id, {
      tenantId: effectiveTenantId,
      userId: session.id,
    });

    if (!partial) {
      return NextResponse.json({ error: 'Partial not found' }, { status: 404 });
    }

    if (searchParams.get('includeUsage') === 'true') {
      const usage = await getPartialUsage(id, {
        tenantId: effectiveTenantId,
        userId: session.id,
      });
      return NextResponse.json({ ...withRevision(partial), usage });
    }

    return NextResponse.json(withRevision(partial));
  } catch (error) {
    return apiError(error, 'Get');
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'update');

    const { id } = await params;
    const body = await request.json();
    const { tenantId: bodyTenantId, reason, ...partialData } = body;
    let effectiveTenantId = session.tenantId;

    if (session.isSuperAdmin) {
      if (bodyTenantId) {
        effectiveTenantId = bodyTenantId;
      } else {
        const existingPartial = await prisma.templatePartial.findFirst({
          where: { id, deletedAt: null },
          select: { tenantId: true },
        });
        if (!existingPartial) {
          return NextResponse.json({ error: 'Partial not found' }, { status: 404 });
        }
        effectiveTenantId = existingPartial.tenantId;
      }
    }

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const input = updateTemplatePartialSchema.parse({ ...partialData, id });
    if (input.content !== undefined) assertA4WriterCanPreserve(input.content);
    const partial = await updateTemplatePartial(
      input,
      { tenantId: effectiveTenantId, userId: session.id },
      reason,
    );

    return NextResponse.json(withRevision(partial));
  } catch (error) {
    return apiError(error, 'Update');
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'delete');

    const { searchParams } = new URL(request.url);
    const { id } = await params;
    const tenantIdParam = searchParams.get('tenantId');
    let effectiveTenantId = session.tenantId;

    if (session.isSuperAdmin) {
      if (tenantIdParam) {
        effectiveTenantId = tenantIdParam;
      } else {
        const existingPartial = await prisma.templatePartial.findFirst({
          where: { id, deletedAt: null },
          select: { tenantId: true },
        });
        if (!existingPartial) {
          return NextResponse.json({ error: 'Partial not found' }, { status: 404 });
        }
        effectiveTenantId = existingPartial.tenantId;
      }
    }

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const reason = searchParams.get('reason') || undefined;
    const expectedRevisionValue = searchParams.get('expectedRevision');
    const expectedRevision = expectedRevisionValue === null ? undefined : Number(expectedRevisionValue);
    if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
      return NextResponse.json({ error: 'expectedRevision must be a non-negative integer' }, { status: 400 });
    }

    await deleteTemplatePartial(
      id,
      { tenantId: effectiveTenantId, userId: session.id },
      reason,
      expectedRevision,
    );
    const deleted = await prisma.templatePartial.findFirst({
      where: { id, tenantId: effectiveTenantId },
      select: { version: true },
    });
    if (!deleted) {
      return NextResponse.json({ error: 'Partial not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, revision: deleted.version });
  } catch (error) {
    return apiError(error, 'Delete');
  }
}
