import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { extractBizFileData, processBizFileExtraction } from '@/services/bizfile.service';

// Lazy load pdf-parse to reduce initial bundle size
async function parsePdf(buffer: Buffer) {
  const pdf = (await import('pdf-parse')).default;
  return pdf(buffer);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const session = await requireRole(['SUPER_ADMIN']);
    const { id: companyId, documentId } = await params;

    // Get document
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        companyId,
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (document.extractionStatus === 'PROCESSING') {
      return NextResponse.json(
        { error: 'Extraction already in progress' },
        { status: 409 }
      );
    }

    // Update status to processing
    await prisma.document.update({
      where: { id: documentId },
      data: { extractionStatus: 'PROCESSING' },
    });

    try {
      // Read PDF file
      const pdfBuffer = await readFile(document.filePath);
      const pdfData = await parsePdf(pdfBuffer);
      const pdfText = pdfData.text;

      if (!pdfText || pdfText.trim().length === 0) {
        throw new Error('Could not extract text from PDF');
      }

      // Extract data using AI
      const extractedData = await extractBizFileData(pdfText);

      // Process and save extracted data
      const result = await processBizFileExtraction(documentId, extractedData, session.id);

      return NextResponse.json({
        success: true,
        companyId: result.companyId,
        created: result.created,
        extractedData,
      });
    } catch (extractionError) {
      // Update document with error
      await prisma.document.update({
        where: { id: documentId },
        data: {
          extractionStatus: 'FAILED',
          extractionError:
            extractionError instanceof Error ? extractionError.message : 'Unknown error',
        },
      });

      throw extractionError;
    }
  } catch (error) {
    console.error('BizFile extraction error:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Preview extraction without saving
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const session = await requireRole(['SUPER_ADMIN']);
    const { id: companyId, documentId } = await params;

    // Get document
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        companyId,
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // If already extracted, return the stored data
    if (document.extractedData && document.extractionStatus === 'COMPLETED') {
      return NextResponse.json({
        extractedData: document.extractedData,
        fromCache: true,
      });
    }

    // Read PDF and extract
    const pdfBuffer = await readFile(document.filePath);
    const pdfData = await parsePdf(pdfBuffer);
    const pdfText = pdfData.text;

    if (!pdfText || pdfText.trim().length === 0) {
      return NextResponse.json(
        { error: 'Could not extract text from PDF' },
        { status: 400 }
      );
    }

    const extractedData = await extractBizFileData(pdfText);

    return NextResponse.json({
      extractedData,
      fromCache: false,
    });
  } catch (error) {
    console.error('BizFile preview error:', error);
    if (error instanceof Error) {
      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
