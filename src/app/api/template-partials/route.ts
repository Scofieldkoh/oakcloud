import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  createTemplatePartialSchema,
  searchTemplatePartialsSchema,
} from '@/lib/validations/template-partial';
import {
  createTemplatePartial,
  searchTemplatePartials,
  getAllTemplatePartials,
} from '@/services/template-partial.service';

// ============================================================================
// GET /api/template-partials
// List/search template partials
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);

    // For SUPER_ADMIN, allow specifying tenantId via query param
    const tenantIdParam = searchParams.get('tenantId');
    const effectiveTenantId =
      session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Check if requesting all partials (for dropdown)
    if (searchParams.get('all') === 'true') {
      const partials = await getAllTemplatePartials(effectiveTenantId);
      return NextResponse.json({ partials });
    }

    // Parse search parameters
    const input = searchTemplatePartialsSchema.parse({
      search: searchParams.get('search') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20,
      sortBy: searchParams.get('sortBy') || 'name',
      sortOrder: searchParams.get('sortOrder') || 'asc',
    });

    const result = await searchTemplatePartials(input, {
      tenantId: effectiveTenantId,
      userId: session.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden' || error.message.startsWith('Permission denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    console.error('Get template partials error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// POST /api/template-partials
// Create a new template partial
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'create');

    const body = await request.json();
    const { tenantId: bodyTenantId, ...partialData } = body;

    // For SUPER_ADMIN, allow specifying tenantId in body
    const effectiveTenantId =
      session.isSuperAdmin && bodyTenantId ? bodyTenantId : session.tenantId;

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const input = createTemplatePartialSchema.parse(partialData);

    const partial = await createTemplatePartial(input, {
      tenantId: effectiveTenantId,
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
      if (error.message === 'A partial with this name already exists') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.includes('must start with a letter')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Create template partial error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
