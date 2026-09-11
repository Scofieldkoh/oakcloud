import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { updateDocumentTemplateSchema } from '@/lib/validations/document-template';
import {
  getDocumentTemplateById,
  updateDocumentTemplate,
  deleteDocumentTemplate,
  restoreDocumentTemplate,
} from '@/services/document-template.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function withRevision<T extends { version: number }>(value: T) {
  return { ...value, revision: value.version };
}

function apiError(error: unknown) {
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
    if (error.message === 'Template not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

/** GET /api/document-templates/[id] */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');
    const effectiveTenantId =
      session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const includeDeleted = searchParams.get('includeDeleted') === 'true' && session.isWorkspaceAdmin;
    const template = await getDocumentTemplateById(id, effectiveTenantId, { includeDeleted });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json(withRevision(template));
  } catch (error) {
    return apiError(error);
  }
}

/** PUT /api/document-templates/[id] */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'update');

    const body = await request.json();
    const data = updateDocumentTemplateSchema.parse({ ...body, id });

    let tenantId = session.tenantId;
    if (session.isSuperAdmin) {
      if (body.tenantId) {
        tenantId = body.tenantId;
      } else {
        const existingTemplate = await prisma.documentTemplate.findFirst({
          where: { id, deletedAt: null },
          select: { tenantId: true },
        });
        if (!existingTemplate) {
          return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        tenantId = existingTemplate.tenantId;
      }
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const template = await updateDocumentTemplate(
      data,
      { tenantId, userId: session.id },
      body.reason,
    );

    return NextResponse.json(withRevision(template));
  } catch (error) {
    return apiError(error);
  }
}

/** DELETE /api/document-templates/[id] */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'delete');

    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason');
    const expectedRevisionValue = searchParams.get('expectedRevision');
    const expectedRevision = expectedRevisionValue === null
      ? undefined
      : Number(expectedRevisionValue);

    if (!reason) {
      return NextResponse.json({ error: 'Reason is required for deletion' }, { status: 400 });
    }
    if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
      return NextResponse.json({ error: 'expectedRevision must be a non-negative integer' }, { status: 400 });
    }

    const tenantIdParam = searchParams.get('tenantId');
    let tenantId = session.tenantId;
    if (session.isSuperAdmin) {
      if (tenantIdParam) {
        tenantId = tenantIdParam;
      } else {
        const existingTemplate = await prisma.documentTemplate.findFirst({
          where: { id, deletedAt: null },
          select: { tenantId: true },
        });
        if (!existingTemplate) {
          return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        tenantId = existingTemplate.tenantId;
      }
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const template = await deleteDocumentTemplate(
      id,
      { tenantId, userId: session.id },
      reason,
      expectedRevision,
    );

    return NextResponse.json(withRevision(template));
  } catch (error) {
    return apiError(error);
  }
}

/** PATCH /api/document-templates/[id] */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'update');

    const body = await request.json();
    if (body.action !== 'restore') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    const expectedRevision = body.expectedRevision;
    if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
      return NextResponse.json({ error: 'expectedRevision must be a non-negative integer' }, { status: 400 });
    }

    let tenantId = session.tenantId;
    if (session.isSuperAdmin) {
      if (body.tenantId) {
        tenantId = body.tenantId;
      } else {
        const existingTemplate = await prisma.documentTemplate.findFirst({
          where: { id },
          select: { tenantId: true },
        });
        if (!existingTemplate) {
          return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        tenantId = existingTemplate.tenantId;
      }
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const template = await restoreDocumentTemplate(
      id,
      { tenantId, userId: session.id },
      expectedRevision,
    );

    return NextResponse.json(withRevision(template));
  } catch (error) {
    return apiError(error);
  }
}
