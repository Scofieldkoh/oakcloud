import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { exportToHTML } from '@/services/document-export.service';
import { getGeneratedDocumentById } from '@/services/document-generator.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/generated-documents/[id]/export/html
 * Export document to HTML
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Check export permission
    await requirePermission(session, 'document', 'read');

    const { searchParams } = new URL(request.url);

    // Determine tenant ID
    const tenantIdParam = searchParams.get('tenantId');
    const tenantId = session.isSuperAdmin && tenantIdParam ? tenantIdParam : session.tenantId;

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    // Verify document exists
    const document = await getGeneratedDocumentById(id, tenantId);
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Parse export options from query params
    const includeStyles = searchParams.get('styles') !== 'false';
    const includeSections = searchParams.get('sections') !== 'false';
    const download = searchParams.get('download') === 'true';

    // Generate HTML
    const result = await exportToHTML({
      documentId: id,
      tenantId,
      includeStyles,
      includeSections,
    });

    if (download) {
      // Return as downloadable file
      const filename = document.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);

      return new NextResponse(result.html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.html"`,
        },
      });
    }

    // Return as JSON with metadata
    return NextResponse.json({
      html: result.html,
      sections: result.sections,
      document: {
        id: document.id,
        title: document.title,
        status: document.status,
      },
    });
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
