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

/**
 * Generate an SVG placeholder image
 * Returns a simple SVG with "No Preview" text
 */
function generatePlaceholderSVG(width = 600, height = 800): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f3f4f6"/>
  <rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="#e5e7eb" stroke-width="2" stroke-dasharray="8,4"/>
  <g transform="translate(${width / 2}, ${height / 2})">
    <rect x="-60" y="-50" width="120" height="100" fill="#e5e7eb" rx="8"/>
    <path d="M-30,-20 L30,-20 L30,10 L20,0 L5,15 L-10,5 L-30,25 L-30,-20Z" fill="#9ca3af"/>
    <circle cx="15" cy="-5" r="8" fill="#9ca3af"/>
  </g>
  <text x="${width / 2}" y="${height / 2 + 80}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" fill="#6b7280">No Preview Available</text>
  <text x="${width / 2}" y="${height / 2 + 105}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#9ca3af">Image file not found</text>
</svg>`;
}

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
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.pdf': 'application/pdf',
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

    // Get the processing document with its document and page
    const processingDoc = await prisma.processingDocument.findUnique({
      where: { id: documentId },
      include: {
        document: {
          select: {
            companyId: true,
          },
        },
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

    const page = processingDoc.pages[0];
    if (!page) {
      // No page record exists - return placeholder
      const placeholderSVG = generatePlaceholderSVG();
      return new NextResponse(placeholderSVG, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Content-Length': Buffer.byteLength(placeholderSVG).toString(),
          'Cache-Control': 'no-cache',
          'X-Placeholder': 'true',
          'X-Reason': 'page-not-found',
        },
      });
    }

    // Determine the full file path
    // imagePath could be:
    // - Absolute path (starts with / or drive letter on Windows)
    // - Relative path already including 'uploads/' prefix
    // - Relative path without 'uploads/' prefix
    let imagePath: string;
    if (page.imagePath.startsWith('/') || /^[A-Za-z]:/.test(page.imagePath)) {
      // Absolute path
      imagePath = page.imagePath;
    } else if (page.imagePath.startsWith('uploads\\') || page.imagePath.startsWith('uploads/')) {
      // Already has uploads prefix - use relative to project root
      imagePath = join('.', page.imagePath);
    } else {
      // No uploads prefix - join with UPLOAD_DIR
      imagePath = join(UPLOAD_DIR, page.imagePath);
    }

    // Check if file exists
    let fileExists = false;
    try {
      await stat(imagePath);
      fileExists = true;
    } catch {
      // File doesn't exist - will serve placeholder
      fileExists = false;
    }

    // If file doesn't exist, return a placeholder SVG
    if (!fileExists) {
      const placeholderSVG = generatePlaceholderSVG();
      return new NextResponse(placeholderSVG, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Content-Length': Buffer.byteLength(placeholderSVG).toString(),
          'Cache-Control': 'no-cache', // Don't cache placeholder
          'X-Placeholder': 'true',
        },
      });
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
