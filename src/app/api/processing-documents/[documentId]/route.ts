/**
 * Processing Document API
 *
 * GET /api/processing-documents/:documentId - Get document details
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { getProcessingDocument } from '@/services/document-processing.service';
import { getCurrentRevision } from '@/services/document-revision.service';

type Params = { documentId: string };

/**
 * GET /api/processing-documents/:documentId
 * Get processing document details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const session = await requireAuth();
    const { documentId } = await params;

    const processingDoc = await getProcessingDocument(documentId);

    if (!processingDoc) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Document not found' },
        },
        { status: 404 }
      );
    }

    // Get the base document for company context
    const document = await prisma.document.findUnique({
      where: { id: processingDoc.documentId },
      select: { companyId: true, tenantId: true },
    });

    if (!document || !document.companyId || !document.tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Base document not found' },
        },
        { status: 404 }
      );
    }

    // Check permission
    await requirePermission(session, 'document', 'read', document.companyId);

    if (!(await canAccessCompany(session, document.companyId))) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'Forbidden' },
        },
        { status: 403 }
      );
    }

    // Get current revision if available
    const currentRevision = processingDoc.currentRevisionId
      ? await getCurrentRevision(documentId)
      : null;

    // Get pages info
    const pages = await prisma.documentPage.findMany({
      where: { processingDocumentId: documentId },
      select: {
        pageNumber: true,
        widthPx: true,
        heightPx: true,
      },
      orderBy: { pageNumber: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        document: {
          id: processingDoc.id,
          documentId: processingDoc.documentId,
          isContainer: processingDoc.isContainer,
          parentDocumentId: processingDoc.parentProcessingDocId,
          pageFrom: processingDoc.pageFrom,
          pageTo: processingDoc.pageTo,
          pageCount: processingDoc.pageCount,
          pipelineStatus: processingDoc.pipelineStatus,
          duplicateStatus: processingDoc.duplicateStatus,
          currentRevisionId: processingDoc.currentRevisionId,
          lockVersion: processingDoc.lockVersion,
          createdAt: processingDoc.createdAt,
          pages: pages.length,
        },
        currentRevision: currentRevision
          ? {
              id: currentRevision.id,
              revisionNumber: currentRevision.revisionNumber,
              status: currentRevision.status,
              documentCategory: currentRevision.documentCategory,
              vendorName: currentRevision.vendorName,
              documentNumber: currentRevision.documentNumber,
              documentDate: currentRevision.documentDate,
              totalAmount: currentRevision.totalAmount.toString(),
              currency: currentRevision.currency,
              homeEquivalent: currentRevision.homeEquivalent?.toString(),
              validationStatus: currentRevision.validationStatus,
              lineItemCount: currentRevision.items.length,
            }
          : null,
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown): NextResponse {
  console.error('Processing document API error:', error);

  if (error instanceof Error) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'AUTHENTICATION_REQUIRED', message: 'Unauthorized' },
        },
        { status: 401 }
      );
    }
    if (error.message === 'Forbidden') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'Forbidden' },
        },
        { status: 403 }
      );
    }
  }

  return NextResponse.json(
    {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    },
    { status: 500 }
  );
}
