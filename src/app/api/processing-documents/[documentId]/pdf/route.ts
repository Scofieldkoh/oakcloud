/**
 * PDF Streaming API
 *
 * GET /api/processing-documents/{documentId}/pdf - Stream the original PDF file
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

/**
 * GET /api/processing-documents/{documentId}/pdf
 * Stream the original PDF file for client-side rendering
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { documentId } = await params;

    // Get the processing document with its file path (from Document relation)
    const processingDoc = await prisma.processingDocument.findUnique({
      where: { id: documentId },
      include: {
        document: {
          select: {
            companyId: true,
            filePath: true,
            originalFileName: true,
            mimeType: true,
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

    // Get file info from the Document relation
    const documentFilePath = processingDoc.document?.filePath;
    const documentMimeType = processingDoc.document?.mimeType;
    const documentOriginalFileName = processingDoc.document?.originalFileName;

    if (!documentFilePath) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FILE_NOT_FOUND', message: 'Document file path not found' },
        },
        { status: 404 }
      );
    }

    // Verify this is a PDF file
    const isPdf =
      documentMimeType === 'application/pdf' ||
      documentOriginalFileName?.toLowerCase().endsWith('.pdf') ||
      documentFilePath?.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Document is not a PDF' },
        },
        { status: 400 }
      );
    }

    // Determine the full file path
    let filePath: string;
    if (documentFilePath.startsWith('/') || /^[A-Za-z]:/.test(documentFilePath)) {
      // Absolute path
      filePath = documentFilePath;
    } else if (documentFilePath.startsWith('uploads\\') || documentFilePath.startsWith('uploads/')) {
      // Already has uploads prefix - use relative to project root
      filePath = join('.', documentFilePath);
    } else {
      // No uploads prefix - join with UPLOAD_DIR
      filePath = join(UPLOAD_DIR, documentFilePath);
    }

    // Check if file exists
    try {
      await stat(filePath);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'FILE_NOT_FOUND', message: 'PDF file not found on disk' },
        },
        { status: 404 }
      );
    }

    // Read the PDF file
    const pdfBuffer = await readFile(filePath);

    // Return the PDF with appropriate headers
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': pdfBuffer.length.toString(),
        'Content-Disposition': `inline; filename="${documentOriginalFileName || 'document.pdf'}"`,
        'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('PDF streaming API error:', error);

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
