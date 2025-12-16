/**
 * Document Pages API
 *
 * GET /api/processing-documents/{documentId}/pages - Get document page metadata
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

/**
 * GET /api/processing-documents/{documentId}/pages
 * Get all pages for a processing document with their metadata
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { documentId } = await params;

    // Get the processing document with its pages and document for company context
    const processingDoc = await prisma.processingDocument.findUnique({
      where: { id: documentId },
      include: {
        document: {
          select: {
            companyId: true,
            tenantId: true,
          },
        },
        pages: {
          orderBy: { pageNumber: 'asc' },
          select: {
            id: true,
            pageNumber: true,
            widthPx: true,
            heightPx: true,
            rotationDeg: true,
            renderDpi: true,
            imagePath: true,
            imageFingerprint: true,
            ocrProvider: true,
            textAcquisitionDecision: true,
            createdAt: true,
          },
        },
      },
    });

    if (!processingDoc) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Processing document not found' },
        },
        { status: 404 }
      );
    }

    // Check access to the company via document relation
    const companyId = processingDoc.document?.companyId;
    if (!companyId || !(await canAccessCompany(session, companyId))) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'Forbidden' },
        },
        { status: 403 }
      );
    }

    // Transform pages to include image URL
    const pages = processingDoc.pages.map((page) => ({
      id: page.id,
      pageNumber: page.pageNumber,
      width: page.widthPx,
      height: page.heightPx,
      rotation: page.rotationDeg,
      dpi: page.renderDpi,
      imageUrl: `/api/processing-documents/${documentId}/pages/${page.pageNumber}/image`,
      fingerprint: page.imageFingerprint,
      ocrProvider: page.ocrProvider,
      textAcquisition: page.textAcquisitionDecision,
      createdAt: page.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        documentId,
        pageCount: pages.length,
        pages,
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Document pages API error:', error);

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
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      },
      { status: 500 }
    );
  }
}
