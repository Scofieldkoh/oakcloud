import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/documents/:documentId/confirm
 *
 * Confirm the extracted data (no-op as extraction already saves the data).
 * This endpoint exists for API completeness but the actual saving is done in the extract endpoint.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await requireAuth();
    const { documentId } = await params;

    // Get document with company
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        company: { select: { id: true, name: true, uen: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Check tenant access
    if (!session.isSuperAdmin) {
      if (document.tenantId !== session.tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Verify the document was processed
    if (document.extractionStatus !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Document extraction not completed' },
        { status: 400 }
      );
    }

    if (!document.companyId) {
      return NextResponse.json(
        { error: 'Document not linked to a company' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      companyId: document.companyId,
      company: document.company,
    });
  } catch (error) {
    console.error('Document confirm error:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
