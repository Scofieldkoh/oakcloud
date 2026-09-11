import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  createDocumentTemplateSchema,
  searchDocumentTemplatesSchema,
} from '@/lib/validations/document-template';
import {
  createDocumentTemplate,
  searchDocumentTemplates,
} from '@/services/document-template.service';

function withRevision<T extends { version: number }>(value: T) {
  return { ...value, revision: value.version };
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);
    const params = searchDocumentTemplatesSchema.parse({
      query: searchParams.get('query') || undefined,
      category: searchParams.get('category') || undefined,
      isActive: searchParams.get('isActive')
        ? searchParams.get('isActive') === 'true'
        : undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: searchParams.get('sortOrder') || undefined,
    });

    const tenantIdParam = searchParams.get('tenantId');
    const effectiveTenantId =
      session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const result = await searchDocumentTemplates(params, effectiveTenantId);
    return NextResponse.json({
      ...result,
      templates: result.templates.map(withRevision),
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

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission(session, 'document', 'create');

    const body = await request.json();
    const { tenantId: bodyTenantId, ...templateData } = body;
    const data = createDocumentTemplateSchema.parse(templateData);

    let tenantId = session.tenantId;
    if (session.isSuperAdmin && bodyTenantId) tenantId = bodyTenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const template = await createDocumentTemplate(data, { tenantId, userId: session.id });
    return NextResponse.json(withRevision(template), { status: 201 });
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
