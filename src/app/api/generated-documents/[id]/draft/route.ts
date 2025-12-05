import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { saveDraftSchema } from '@/lib/validations/generated-document';
import {
  saveDraft,
  getLatestDraft,
  getGeneratedDocumentById,
} from '@/services/document-generator.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/generated-documents/[id]/draft
 * Get the latest draft for a document
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check read permission
    await requirePermission(session, 'document', 'read');

    // For SUPER_ADMIN, allow specifying tenantId via query param
    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');
    const effectiveTenantId =
      session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Verify document exists and belongs to tenant
    const document = await getGeneratedDocumentById(id, effectiveTenantId);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Get the latest draft for this user
    const draft = await getLatestDraft(id, session.id);

    if (!draft) {
      return NextResponse.json({ draft: null });
    }

    return NextResponse.json({
      draft: {
        content: draft.content,
        contentJson: draft.contentJson,
        savedAt: draft.createdAt,
      },
      document: {
        content: document.content,
        contentJson: document.contentJson,
        updatedAt: document.updatedAt,
      },
      hasDifferentContent: draft.content !== document.content,
    });
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

/**
 * POST /api/generated-documents/[id]/draft
 * Save a draft (auto-save)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check update permission
    await requirePermission(session, 'document', 'update');

    const body = await request.json();
    const data = saveDraftSchema.parse({ ...body, documentId: id });

    // Determine tenant ID
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && body.tenantId) {
      tenantId = body.tenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    await saveDraft(data, { tenantId, userId: session.id });

    return NextResponse.json({ success: true, savedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Document not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/generated-documents/[id]/draft
 * Discard the current draft
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check update permission
    await requirePermission(session, 'document', 'update');

    const { searchParams } = new URL(request.url);
    const tenantIdParam = searchParams.get('tenantId');
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && tenantIdParam) {
      tenantId = tenantIdParam;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Verify document exists
    const document = await getGeneratedDocumentById(id, tenantId);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Import prisma to delete draft
    const { prisma } = await import('@/lib/prisma');
    await prisma.documentDraft.deleteMany({
      where: { documentId: id, userId: session.id },
    });

    return NextResponse.json({ success: true });
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
