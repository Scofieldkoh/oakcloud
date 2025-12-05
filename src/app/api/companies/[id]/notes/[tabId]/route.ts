import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createAuditContext } from '@/lib/audit';
import {
  updateNoteTab,
  deleteNoteTab,
  verifyNoteTabOwnership,
} from '@/services/notes.service';
import { z } from 'zod';

const updateNoteTabSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().optional(),
});

/**
 * PATCH /api/companies/:id/notes/:tabId
 * Update a note tab (title or content)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tabId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id, tabId } = await params;

    // Check permission
    await requirePermission(session, 'company', 'update', id);

    // Additional check for company-scoped users
    if (!(await canAccessCompany(session, id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify tab belongs to this company
    const isOwner = await verifyNoteTabOwnership(tabId, 'company', id);
    if (!isOwner) {
      return NextResponse.json({ error: 'Note tab not found' }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = updateNoteTabSchema.parse(body);

    const auditContext = await createAuditContext({
      tenantId: session.tenantId ?? undefined,
      userId: session.id,
      changeSource: 'MANUAL',
    });

    const tab = await updateNoteTab(tabId, validatedData, auditContext);

    return NextResponse.json(tab);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Note tab not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/companies/:id/notes/:tabId
 * Delete a note tab
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tabId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id, tabId } = await params;

    // Check permission
    await requirePermission(session, 'company', 'update', id);

    // Additional check for company-scoped users
    if (!(await canAccessCompany(session, id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify tab belongs to this company
    const isOwner = await verifyNoteTabOwnership(tabId, 'company', id);
    if (!isOwner) {
      return NextResponse.json({ error: 'Note tab not found' }, { status: 404 });
    }

    const auditContext = await createAuditContext({
      tenantId: session.tenantId ?? undefined,
      userId: session.id,
      changeSource: 'MANUAL',
    });

    await deleteNoteTab(tabId, auditContext);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message === 'Note tab not found') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
