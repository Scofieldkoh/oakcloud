import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { processBizFileExtraction } from '@/services/bizfile';
import {
  bizFileReviewSchema,
  issuesFromZodError,
  normalizeBizFileReviewDraft,
} from '@/lib/validations/bizfile-review';

/**
 * POST /api/documents/:documentId/confirm
 *
 * Save the previously extracted BizFile data.
 * Creates/updates the company and all related records.
 * Document must be in EXTRACTED status (set by the extract endpoint).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await requireAuth();
    const { documentId } = await params;

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!session.isSuperAdmin && document.tenantId !== session.tenantId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (
      document.uploadedById !== session.id &&
      !session.isSuperAdmin &&
      !session.isWorkspaceAdmin
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (document.extractionStatus !== 'EXTRACTED') {
      // Backwards compatibility: accept already-confirmed documents
      if (document.extractionStatus === 'COMPLETED' && document.companyId) {
        return NextResponse.json({
          success: true,
          companyId: document.companyId,
        });
      }
      return NextResponse.json(
        { error: 'Document extraction not ready for confirmation' },
        { status: 400 }
      );
    }

    if (!document.extractedData) {
      return NextResponse.json(
        { error: 'No extracted data found on document' },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: 'Please correct the highlighted fields',
          issues: [{
            path: 'request',
            message: 'Enter a valid request body',
            section: 'entity',
          }],
        },
        { status: 400 }
      );
    }
    const candidate = typeof body === 'object' && body !== null && 'extractedData' in body
      ? (body as { extractedData: unknown }).extractedData
      : undefined;
    const parsed = bizFileReviewSchema.safeParse(candidate);

    if (!parsed.success) {
      const validation = issuesFromZodError(parsed.error);
      return NextResponse.json(
        { error: 'Please correct the highlighted fields', issues: validation.issues },
        { status: 400 }
      );
    }

    const correctedData = normalizeBizFileReviewDraft(parsed.data);
    await prisma.document.update({
      where: { id: documentId },
      data: { extractedData: correctedData as object },
    });

    const result = await processBizFileExtraction(
      documentId,
      correctedData,
      session.id,
      document.tenantId,
      document.storageKey || undefined,
      document.mimeType
    );

    return NextResponse.json({
      success: true,
      companyId: result.companyId,
      created: result.created,
    });
  } catch (error) {
    console.error('Document confirm error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
