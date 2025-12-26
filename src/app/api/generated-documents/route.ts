import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  createDocumentFromTemplateSchema,
  createBlankDocumentSchema,
  searchGeneratedDocumentsSchema,
} from '@/lib/validations/generated-document';
import {
  createDocumentFromTemplate,
  createBlankDocument,
  searchGeneratedDocuments,
} from '@/services/document-generator.service';

/**
 * GET /api/generated-documents
 * List/search generated documents
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check read permission
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);

    const params = searchGeneratedDocumentsSchema.parse({
      query: searchParams.get('query') || undefined,
      companyId: searchParams.get('companyId') || undefined,
      companyName: searchParams.get('companyName') || undefined,
      templateId: searchParams.get('templateId') || undefined,
      status: searchParams.get('status') || undefined,
      page: searchParams.get('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: searchParams.get('sortOrder') || undefined,
    });

    // For SUPER_ADMIN, allow specifying tenantId via query param or viewing all documents
    const tenantIdParam = searchParams.get('tenantId');
    let effectiveTenantId: string | null = session.tenantId;

    if (session.isSuperAdmin && tenantIdParam) {
      effectiveTenantId = tenantIdParam;
    } else if (session.isSuperAdmin && !session.tenantId) {
      // SUPER_ADMIN without tenant context - will show all documents across tenants
      effectiveTenantId = null;
    }

    const result = await searchGeneratedDocuments(params, effectiveTenantId, {
      skipTenantFilter: session.isSuperAdmin && !effectiveTenantId,
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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/generated-documents
 * Create a new generated document (from template or blank)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Check create permission
    await requirePermission(session, 'document', 'create');

    const body = await request.json();
    const { tenantId: bodyTenantId, type, ...documentData } = body;

    // Determine tenant ID: SUPER_ADMIN can specify tenantId, others use session
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && bodyTenantId) {
      tenantId = bodyTenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    let document;

    // Create from template or blank based on type
    if (type === 'blank' || !documentData.templateId) {
      const data = createBlankDocumentSchema.parse(documentData);
      document = await createBlankDocument(data, { tenantId, userId: session.id });
    } else {
      const data = createDocumentFromTemplateSchema.parse(documentData);
      document = await createDocumentFromTemplate(data, { tenantId, userId: session.id });
    }

    return NextResponse.json(document, { status: 201 });
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
