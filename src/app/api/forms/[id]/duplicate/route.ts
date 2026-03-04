import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { duplicateFormSchema } from '@/lib/validations/form-builder';
import { duplicateForm } from '@/services/form-builder.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function resolveTenantId(session: Awaited<ReturnType<typeof requireAuth>>, requestedTenantId?: string | null): string {
  if (session.isSuperAdmin) {
    const tenantId = requestedTenantId || session.tenantId;
    if (!tenantId) {
      throw new Error('Tenant context required');
    }
    return tenantId;
  }

  if (!session.tenantId) {
    throw new Error('Tenant context required');
  }

  return session.tenantId;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    await requirePermission(session, 'document', 'create');

    const body = await request.json().catch(() => ({}));
    const tenantId = resolveTenantId(session, body?.tenantId);
    const payload = duplicateFormSchema.parse(body ?? {});

    const form = await duplicateForm(id, { tenantId, userId: session.id }, payload.title);

    return NextResponse.json(form, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', details: error.errors }, { status: 400 });
    }

    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
