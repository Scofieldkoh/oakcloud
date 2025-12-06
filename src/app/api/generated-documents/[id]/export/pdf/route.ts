import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { exportToPDF } from '@/services/document-export.service';
import { getGeneratedDocumentById } from '@/services/document-generator.service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/generated-documents/[id]/export/pdf
 * Export document to PDF
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
    const includeLetterhead = searchParams.get('letterhead') !== 'false';
    const format = (searchParams.get('format') || 'A4') as 'A4' | 'Letter';
    const orientation = (searchParams.get('orientation') || 'portrait') as 'portrait' | 'landscape';
    const filename = searchParams.get('filename') || undefined;

    // Generate PDF
    const result = await exportToPDF({
      documentId: id,
      tenantId,
      userId: session.id,
      includeLetterhead,
      format,
      orientation,
      filename,
    });

    // Return PDF as downloadable file
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': result.buffer.length.toString(),
        'X-Page-Count': result.pageCount.toString(),
      },
    });
  } catch (error) {
    console.error('PDF export error:', error);

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
      if (error.message.includes('Chrome') || error.message.includes('Chromium')) {
        return NextResponse.json(
          {
            error: 'PDF generation unavailable',
            details: 'Chrome/Chromium is not installed on the server',
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
