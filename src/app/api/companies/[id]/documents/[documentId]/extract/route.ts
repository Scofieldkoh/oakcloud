import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { extractBizFileData, processBizFileExtraction } from '@/services/bizfile';
import type { AIModel } from '@/lib/ai';
import { storage } from '@/lib/storage';

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
    const session = await requireAuth();
    const { id: companyId, documentId } = await params;

    // Parse request body for optional model selection
    let modelId: AIModel | undefined;
    try {
      const body = await request.json();
      modelId = body.modelId as AIModel | undefined;
    } catch {
      // No body or invalid JSON - use default model
    }

    // Check permission
    await requirePermission(session, 'document', 'update', companyId);

    // Get document with company info for tenantId
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        companyId,
      },
      include: {
        company: { select: { tenantId: true } },
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
      // Read PDF file from storage
      if (!document.storageKey) {
        throw new Error('Document has no storage key');
      }
      const pdfBuffer = await storage.download(document.storageKey);
      const pdfData = await parsePdf(pdfBuffer);
      const pdfText = pdfData.text;

      if (!pdfText || pdfText.trim().length === 0) {
        throw new Error('Could not extract text from PDF');
      }

      // Use tenantId from company if available, otherwise from document directly
      const tenantId = document.company?.tenantId || document.tenantId;
      if (!tenantId) {
        throw new Error('Unable to determine tenant for document');
      }

      // Extract data using AI with optional model selection (connector-aware)
      const extractionResult = await extractBizFileData(pdfText, {
        modelId,
        tenantId, // Use tenant's configured AI connector
      });

      // Process and save extracted data
      const result = await processBizFileExtraction(
        documentId,
        extractionResult.data,
        session.id,
        tenantId
      );

      return NextResponse.json({
        success: true,
        companyId: result.companyId,
        created: result.created,
        extractedData: extractionResult.data,
        aiMetadata: {
          modelUsed: extractionResult.modelUsed,
          providerUsed: extractionResult.providerUsed,
          usage: extractionResult.usage,
        },
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
    const session = await requireAuth();
    const { id: companyId, documentId } = await params;

    // Get optional model selection from query params
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('modelId') as AIModel | null;

    // Check permission
    await requirePermission(session, 'document', 'read', companyId);

    // Get document with company info for tenantId
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        companyId,
      },
      include: {
        company: { select: { tenantId: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // If already extracted and no specific model requested, return the stored data
    if (document.extractedData && document.extractionStatus === 'COMPLETED' && !modelId) {
      return NextResponse.json({
        extractedData: document.extractedData,
        fromCache: true,
      });
    }

    // Read PDF from storage and extract
    if (!document.storageKey) {
      return NextResponse.json({ error: 'Document has no storage key' }, { status: 400 });
    }
    const pdfBuffer = await storage.download(document.storageKey);
    const pdfData = await parsePdf(pdfBuffer);
    const pdfText = pdfData.text;

    if (!pdfText || pdfText.trim().length === 0) {
      return NextResponse.json(
        { error: 'Could not extract text from PDF' },
        { status: 400 }
      );
    }

    // Use tenant's configured AI connector
    const tenantId = document.company?.tenantId || document.tenantId;
    const extractionResult = await extractBizFileData(pdfText, {
      modelId: modelId || undefined,
      tenantId,
    });

    return NextResponse.json({
      extractedData: extractionResult.data,
      fromCache: false,
      aiMetadata: {
        modelUsed: extractionResult.modelUsed,
        providerUsed: extractionResult.providerUsed,
        usage: extractionResult.usage,
      },
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
