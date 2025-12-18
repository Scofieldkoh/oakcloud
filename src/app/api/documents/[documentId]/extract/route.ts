import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { extractBizFileWithVision, processBizFileExtraction, normalizeExtractedData } from '@/services/bizfile';
import { calculateCost, formatCost, getModelConfig } from '@/lib/ai';
import type { AIModel } from '@/lib/ai';
import { storage } from '@/lib/storage';

// Supported MIME types for vision extraction
const VISION_SUPPORTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

/**
 * POST /api/documents/:documentId/extract
 *
 * Extract data from a pending document using AI vision.
 * Supports PDF and image files (PNG, JPG, WebP).
 * Creates/updates the company and links the document to it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await requireAuth();
    const { documentId } = await params;

    // Parse request body for optional model selection and context
    let modelId: AIModel | undefined;
    let additionalContext: string | undefined;
    try {
      const body = await request.json();
      modelId = body.modelId as AIModel | undefined;
      additionalContext = body.additionalContext as string | undefined;
    } catch {
      // No body or invalid JSON - use defaults
    }

    // Get document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
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

    // Verify the document was uploaded by this user or user has admin access
    if (document.uploadedById !== session.id && !session.isSuperAdmin && !session.isTenantAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (document.extractionStatus === 'PROCESSING') {
      return NextResponse.json({ error: 'Extraction already in progress' }, { status: 409 });
    }

    // Validate file type for vision extraction
    if (!VISION_SUPPORTED_TYPES.includes(document.mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${document.mimeType}. Supported types: PDF, PNG, JPG, WebP` },
        { status: 400 }
      );
    }

    // Update status to processing
    await prisma.document.update({
      where: { id: documentId },
      data: { extractionStatus: 'PROCESSING' },
    });

    try {
      // Download file from storage and convert to base64 for vision extraction
      if (!document.storageKey) {
        throw new Error('Document has no storage key');
      }
      const fileBuffer = await storage.download(document.storageKey);
      const base64Data = fileBuffer.toString('base64');

      // Extract data using AI vision (connector-aware for tenant)
      const extractionResult = await extractBizFileWithVision(
        {
          base64: base64Data,
          mimeType: document.mimeType,
        },
        {
          modelId,
          additionalContext,
          tenantId: document.tenantId, // Use tenant's configured AI connector
        }
      );

      // Process and save extracted data
      const result = await processBizFileExtraction(
        documentId,
        extractionResult.data,
        session.id,
        document.tenantId
      );

      // Calculate estimated cost
      const modelConfig = getModelConfig(extractionResult.modelUsed);
      let estimatedCost: number | undefined;
      let formattedCost: string | undefined;

      if (extractionResult.usage) {
        estimatedCost = calculateCost(
          extractionResult.modelUsed,
          extractionResult.usage.inputTokens,
          extractionResult.usage.outputTokens
        );
        formattedCost = formatCost(estimatedCost);
      }

      // Normalize the extracted data for preview (same normalization applied when saving)
      const normalizedData = normalizeExtractedData(extractionResult.data);

      return NextResponse.json({
        success: true,
        companyId: result.companyId,
        created: result.created,
        extractedData: normalizedData,
        aiMetadata: {
          modelUsed: extractionResult.modelUsed,
          modelName: modelConfig.name,
          providerUsed: extractionResult.providerUsed,
          usage: extractionResult.usage,
          estimatedCost,
          formattedCost,
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
