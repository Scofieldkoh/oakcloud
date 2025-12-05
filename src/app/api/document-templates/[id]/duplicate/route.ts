import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { duplicateDocumentTemplateSchema } from '@/lib/validations/document-template';
import { duplicateDocumentTemplate } from '@/services/document-template.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/document-templates/[id]/duplicate
 * Duplicate a document template
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check create permission (duplicating creates a new template)
    await requirePermission(session, 'document', 'create');

    const body = await request.json();
    const data = duplicateDocumentTemplateSchema.parse({ ...body, id });

    // Determine tenant ID
    let tenantId = session.tenantId;
    if (session.isSuperAdmin && body.tenantId) {
      tenantId = body.tenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const template = await duplicateDocumentTemplate(data, { tenantId, userId: session.id });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
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
}
