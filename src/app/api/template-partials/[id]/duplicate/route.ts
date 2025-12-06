import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { duplicateTemplatePartialSchema } from '@/lib/validations/template-partial';
import { duplicateTemplatePartial } from '@/services/template-partial.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ============================================================================
// POST /api/template-partials/[id]/duplicate
// Duplicate a template partial
// ============================================================================

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'create');

    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const { id } = await params;
    const body = await request.json();

    const input = duplicateTemplatePartialSchema.parse({ ...body, id });

    const partial = await duplicateTemplatePartial(id, input.name, {
      tenantId: session.tenantId,
      userId: session.id,
    });

    return NextResponse.json(partial, { status: 201 });
  } catch (error) {
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
      if (error.message === 'A partial with this name already exists') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.includes('must start with a letter')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Duplicate template partial error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
