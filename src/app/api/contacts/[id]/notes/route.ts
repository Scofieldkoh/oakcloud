import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createAuditContext } from '@/lib/audit';
import { parseIdParams } from '@/lib/validations/params';
import { prisma } from '@/lib/prisma';
import { requireTenantContext } from '@/lib/api-helpers';
import {
  getNoteTabs,
  createNoteTab,
} from '@/services/notes.service';
import { z } from 'zod';

const createNoteTabSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  content: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/contacts/:id/notes
 * Get all note tabs for a contact
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await parseIdParams(params);
    const { searchParams } = new URL(request.url);
    const tenantResult = await requireTenantContext(session, searchParams.get('tenantId'));
    if ('error' in tenantResult) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    const contact = await prisma.contact.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    await requirePermission(session, 'contact', 'read');

    const tabs = await getNoteTabs('contact', id, tenantId);

    return NextResponse.json(tabs);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/contacts/:id/notes
 * Create a new note tab for a contact
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await parseIdParams(params);
    const { searchParams } = new URL(request.url);

    const body = await request.json();
    const tenantResult = await requireTenantContext(
      session,
      typeof body.tenantId === 'string' ? body.tenantId : searchParams.get('tenantId')
    );
    if ('error' in tenantResult) return tenantResult.error;
    const tenantId = tenantResult.tenantId;

    const contact = await prisma.contact.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    await requirePermission(session, 'contact', 'update');

    const validatedData = createNoteTabSchema.parse(body);

    const auditContext = await createAuditContext({
      tenantId,
      userId: session.id,
      changeSource: 'MANUAL',
    });

    const tab = await createNoteTab('contact', id, validatedData, auditContext, tenantId);

    return NextResponse.json(tab, { status: 201 });
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
      if (error.message === 'Parent entity not found') {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
