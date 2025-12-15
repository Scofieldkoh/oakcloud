/**
 * Page Image API
 *
 * GET /api/processing-documents/{documentId}/pages/{pageNumber}/image - Serve page image
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ documentId: string; pageNumber: string }>;
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * GET /api/processing-documents/{documentId}/pages/{pageNumber}/image
 * Serve the rendered page image
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { documentId, pageNumber: pageNumberStr } = await params;
    const pageNumber = parseInt(pageNumberStr, 10);

    if (isNaN(pageNumber) || pageNumber < 1) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid page number' },
        },
        { status: 400 }
      );
    }

    // Get the processing document and page
    const processingDoc = await prisma.processingDocument.findUnique({
      where: { id: documentId },
      select: {
        companyId: true,
        pages: {
          where: { pageNumber },
          select: {
            imagePath: true,
            imageFingerprint: true,
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

    // Check access to the company
    if (!(await canAccessCompany(session, processingDoc.companyId))) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'Forbidden' },
        },
        { status: 403 }
      );
    }

    const page = processingDoc.pages[0];
    if (!page) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'RESOURCE_NOT_FOUND', message: `Page ${pageNumber} not found` },
        },
        { status: 404 }
      );
    }

    // Determine the full file path
    // imagePath could be absolute or relative to UPLOAD_DIR
    const imagePath = page.imagePath.startsWith('/')
      ? page.imagePath
      : join(UPLOAD_DIR, page.imagePath);

    // Check if file exists
    try {
      await stat(imagePath);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Page image file not found' },
        },
        { status: 404 }
      );
    }

    // Read the image file
    const imageBuffer = await readFile(imagePath);

    // Determine content type from file extension
    const extension = imagePath.substring(imagePath.lastIndexOf('.')).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';

    // Return the image with appropriate headers
    const response = new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': imageBuffer.length.toString(),
        'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
      },
    });

    // Add ETag based on fingerprint if available
    if (page.imageFingerprint) {
      response.headers.set('ETag', `"${page.imageFingerprint}"`);
    }

    return response;
  } catch (error) {
    console.error('Page image API error:', error);

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
