import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { updateGeneratedDocumentSchema } from '@/lib/validations/generated-document';
import {
  getGeneratedDocumentById,
  updateGeneratedDocument,
  deleteGeneratedDocument,
  archiveDocument,
} from '@/services/document-generator.service';
import { createErrorResponse, requireSessionWorkspaceId } from '@/lib/api-helpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseExpectedRevision(value: string | null): number | undefined {
  if (value === null) return undefined;
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error('expectedRevision must be a non-negative integer');
  }
  return revision;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);
    const tenantId = requireSessionWorkspaceId(session);
    const includeDeleted = searchParams.get('includeDeleted') === 'true' && session.isWorkspaceAdmin;
    const includeComments = searchParams.get('includeComments') === 'true';
    const document = await getGeneratedDocumentById(id, tenantId, {
      includeDeleted,
      includeComments,
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    return NextResponse.json(document);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'update');

    const body = await request.json();
    const data = updateGeneratedDocumentSchema.parse({ ...body, id });
    const tenantId = requireSessionWorkspaceId(session);
    const document = await updateGeneratedDocument(
      data,
      { tenantId, userId: session.id },
      body.reason,
    );
    return NextResponse.json(document);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'delete');

    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason');
    if (!reason) {
      return NextResponse.json({ error: 'Reason is required for deletion' }, { status: 400 });
    }
    const expectedRevision = parseExpectedRevision(searchParams.get('expectedRevision'));
    const tenantId = requireSessionWorkspaceId(session);
    const document = await deleteGeneratedDocument(
      id,
      { tenantId, userId: session.id },
      reason,
      expectedRevision,
    );
    return NextResponse.json(document);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requirePermission(session, 'document', 'update');

    const body = await request.json();
    if (body.action !== 'archive') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    if (!body.reason) {
      return NextResponse.json({ error: 'Reason is required for archiving' }, { status: 400 });
    }
    if (
      body.expectedRevision !== undefined
      && (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0)
    ) {
      return NextResponse.json({ error: 'expectedRevision must be a non-negative integer' }, { status: 400 });
    }

    const tenantId = requireSessionWorkspaceId(session);
    const document = await archiveDocument(
      id,
      { tenantId, userId: session.id },
      body.reason,
      body.expectedRevision,
    );
    return NextResponse.json(document);
  } catch (error) {
    return createErrorResponse(error);
  }
}
