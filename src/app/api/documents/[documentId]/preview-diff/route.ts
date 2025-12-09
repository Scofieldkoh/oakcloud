import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { extractBizFileWithVision, generateBizFileDiff, normalizeExtractedData } from '@/services/bizfile';
import { calculateCost, formatCost, getModelConfig } from '@/lib/ai';
import type { AIModel } from '@/lib/ai';

// Supported MIME types for vision extraction
const VISION_SUPPORTED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

/**
 * POST /api/documents/:documentId/preview-diff
 *
 * Extract data from a document and generate a diff against an existing company.
 * This is a preview-only operation that does NOT save any changes.
 * Used for update mode to show users what will change before confirming.
 *
 * Request body:
 * - companyId: string - The existing company ID to compare against
 * - modelId?: string - Optional AI model ID
 * - additionalContext?: string - Optional context for AI extraction
 *
 * Permissions:
 * - TENANT_ADMIN or COMPANY_ADMIN with update permission
 * - SUPER_ADMIN for any company
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await requireAuth();
    const { documentId } = await params;

    // Parse request body
    const body = await request.json();
    const { companyId, modelId, additionalContext } = body as {
      companyId: string;
      modelId?: AIModel;
      additionalContext?: string;
    };

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId is required for preview-diff' },
        { status: 400 }
      );
    }

    // Get document
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Get company for permission check
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, tenantId: true, name: true, uen: true, updatedAt: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Check tenant access
    if (!session.isSuperAdmin) {
      if (document.tenantId !== session.tenantId || company.tenantId !== session.tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Verify user can update this company (admin or document uploader)
    if (!session.isSuperAdmin && !session.isTenantAdmin) {
      const canUpdate = session.companyIds?.includes(companyId);
      if (!canUpdate) {
        return NextResponse.json(
          { error: 'You do not have permission to update this company' },
          { status: 403 }
        );
      }
    }

    // Validate file type for vision extraction
    if (!VISION_SUPPORTED_TYPES.includes(document.mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${document.mimeType}. Supported types: PDF, PNG, JPG, WebP` },
        { status: 400 }
      );
    }

    try {
      // Read file and convert to base64 for vision extraction
      const fileBuffer = await readFile(document.filePath);
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

      // Normalize extracted data before comparing
      const normalizedData = normalizeExtractedData(extractionResult.data);

      // Generate diff against existing company
      const diffResult = await generateBizFileDiff(
        companyId,
        normalizedData,
        company.tenantId
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

      return NextResponse.json({
        success: true,
        extractedData: normalizedData,
        diff: {
          hasDifferences: diffResult.hasDifferences,
          differences: diffResult.differences,
          existingCompany: diffResult.existingCompany,
          officerDiffs: diffResult.officerDiffs,
          shareholderDiffs: diffResult.shareholderDiffs,
          summary: diffResult.summary,
        },
        // Include company updatedAt for optimistic locking (concurrent update detection)
        companyUpdatedAt: company.updatedAt.toISOString(),
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
      console.error('BizFile preview extraction error:', extractionError);
      throw extractionError;
    }
  } catch (error) {
    console.error('BizFile preview-diff error:', error);
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
