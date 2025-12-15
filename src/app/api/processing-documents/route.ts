/**
 * Processing Documents API
 *
 * POST /api/processing-documents - Upload document for processing
 * GET /api/processing-documents - List processing documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import {
  uploadDocument,
  checkExactDuplicate,
  queueDocumentForProcessing,
  listProcessingDocumentsPaged,
  PROCESSING_LIMITS,
} from '@/services/document-processing.service';
import type { ProcessingPriority, UploadSource, PipelineStatus, DuplicateStatus } from '@prisma/client';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

/**
 * GET /api/processing-documents
 * List processing documents with page-based pagination and filters
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - sortBy: Sort field (createdAt, updatedAt, pipelineStatus, duplicateStatus)
 * - sortOrder: Sort direction (asc, desc)
 * - pipelineStatus: Filter by pipeline status
 * - duplicateStatus: Filter by duplicate status
 * - isContainer: Filter by container/child type
 * - companyId: Optional company filter (if not provided, shows all accessible companies)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const pageStr = searchParams.get('page');
    const limitStr = searchParams.get('limit');
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    const pipelineStatus = searchParams.get('pipelineStatus') as PipelineStatus | null;
    const duplicateStatus = searchParams.get('duplicateStatus') as DuplicateStatus | null;
    const isContainerStr = searchParams.get('isContainer');
    const companyId = searchParams.get('companyId');

    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = Math.min(limitStr ? parseInt(limitStr, 10) : 20, 100);
    const isContainer =
      isContainerStr === 'true' ? true : isContainerStr === 'false' ? false : undefined;

    // Determine accessible company IDs
    let companyIds: string[] | undefined;

    if (companyId) {
      // If specific company requested, verify access
      if (!(await canAccessCompany(session, companyId))) {
        return NextResponse.json(
          {
            success: false,
            error: { code: 'PERMISSION_DENIED', message: 'Forbidden' },
          },
          { status: 403 }
        );
      }
      companyIds = [companyId];
    } else {
      // Use session's accessible company IDs
      companyIds = session.companyIds;
    }

    // Get documents with paged results
    const result = await listProcessingDocumentsPaged({
      tenantId: session.tenantId,
      companyIds,
      pipelineStatus: pipelineStatus ?? undefined,
      duplicateStatus: duplicateStatus ?? undefined,
      isContainer,
      page,
      limit,
      sortBy,
      sortOrder,
    });

    // Transform for API response (convert Decimal to string, Date to ISO string)
    const documents = result.documents.map((doc) => ({
      id: doc.id,
      documentId: doc.documentId,
      isContainer: doc.isContainer,
      parentProcessingDocId: doc.parentProcessingDocId,
      pageFrom: doc.pageFrom,
      pageTo: doc.pageTo,
      pageCount: doc.pageCount,
      pipelineStatus: doc.pipelineStatus,
      duplicateStatus: doc.duplicateStatus,
      currentRevisionId: doc.currentRevisionId,
      lockVersion: doc.lockVersion,
      createdAt: doc.createdAt.toISOString(),
      document: {
        id: doc.document.id,
        fileName: doc.document.originalFileName || doc.document.fileName,
        mimeType: doc.document.mimeType,
        fileSize: doc.document.fileSize,
        companyId: doc.document.companyId,
        company: doc.document.company,
      },
      currentRevision: doc.currentRevision
        ? {
            id: doc.currentRevision.id,
            revisionNumber: doc.currentRevision.revisionNumber,
            status: doc.currentRevision.status,
            documentCategory: doc.currentRevision.documentCategory,
            vendorName: doc.currentRevision.vendorName,
            documentNumber: doc.currentRevision.documentNumber,
            documentDate: doc.currentRevision.documentDate?.toISOString() ?? null,
            totalAmount: doc.currentRevision.totalAmount.toString(),
            currency: doc.currentRevision.currency,
          }
        : undefined,
    }));

    return NextResponse.json({
      success: true,
      data: {
        documents,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
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

/**
 * POST /api/processing-documents
 * Upload document for processing
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const companyId = formData.get('companyId') as string;
    const priority = (formData.get('priority') as ProcessingPriority) || 'NORMAL';
    const uploadSource = (formData.get('uploadSource') as UploadSource) || 'WEB';
    const metadataStr = formData.get('metadata') as string | null;
    const idempotencyKey = request.headers.get('Idempotency-Key');

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No file provided' },
        },
        { status: 400 }
      );
    }

    if (!companyId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'companyId is required' },
        },
        { status: 400 }
      );
    }

    // Check permission
    await requirePermission(session, 'document', 'create', companyId);

    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'Forbidden' },
        },
        { status: 403 }
      );
    }

    // Validate file size
    if (file.size > PROCESSING_LIMITS.MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File size exceeds maximum of ${PROCESSING_LIMITS.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
          },
        },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/tiff',
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Only PDF and image files are allowed',
          },
        },
        { status: 400 }
      );
    }

    // Check idempotency
    if (idempotencyKey) {
      const existing = await prisma.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });

      if (existing && existing.expiresAt > new Date()) {
        return NextResponse.json(existing.response, {
          status: existing.statusCode,
        });
      }
    }

    // Get company for tenant context
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { tenantId: true },
    });

    if (!company) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Company not found' },
        },
        { status: 404 }
      );
    }

    // Create upload directory
    const companyDir = join(UPLOAD_DIR, companyId, 'processing');
    await mkdir(companyDir, { recursive: true });

    // Save file
    const fileId = uuidv4();
    const extension = file.name.split('.').pop() || 'pdf';
    const fileName = `${fileId}.${extension}`;
    const filePath = join(companyDir, fileName);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Create base document record
    const document = await prisma.document.create({
      data: {
        tenantId: company.tenantId,
        companyId,
        uploadedById: session.id,
        documentType: 'UPLOADED',
        fileName,
        originalFileName: file.name,
        filePath,
        fileSize: file.size,
        mimeType: file.type,
        version: 1,
        extractionStatus: 'PENDING',
      },
    });

    // Check for exact duplicates
    const duplicateCheck = await checkExactDuplicate(
      filePath, // Will be hashed internally
      company.tenantId,
      companyId
    );

    // Upload document for processing
    const { processingDocument, jobId } = await uploadDocument({
      documentId: document.id,
      tenantId: company.tenantId,
      companyId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      filePath,
      priority,
      uploadSource,
      metadata: metadataStr ? JSON.parse(metadataStr) : undefined,
    });

    // Queue for processing
    await queueDocumentForProcessing(
      processingDocument.id,
      company.tenantId,
      companyId
    );

    // Create audit log
    await createAuditLog({
      tenantId: company.tenantId,
      userId: session.id,
      companyId,
      action: 'UPLOAD',
      entityType: 'ProcessingDocument',
      entityId: processingDocument.id,
      entityName: file.name,
      summary: `Uploaded document for processing: "${file.name}"`,
      changeSource: 'MANUAL',
      metadata: {
        priority,
        uploadSource,
        fileSize: file.size,
      },
    });

    const response = {
      success: true,
      data: {
        document: {
          id: processingDocument.id,
          documentId: document.id,
          fileName: file.name,
          pipelineStatus: processingDocument.pipelineStatus,
          isContainer: processingDocument.isContainer,
        },
        jobId,
        duplicateWarning: duplicateCheck.isDuplicate
          ? {
              originalDocumentId: duplicateCheck.originalDocumentId,
              message: 'An exact duplicate of this file already exists',
            }
          : undefined,
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    };

    // Store idempotency record
    if (idempotencyKey) {
      await prisma.idempotencyRecord.create({
        data: {
          key: idempotencyKey,
          tenantId: company.tenantId,
          endpoint: '/api/processing-documents',
          method: 'POST',
          requestHash: '',
          response: response as object,
          statusCode: 202,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });
    }

    return NextResponse.json(response, { status: 202 });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown): NextResponse {
  console.error('Processing documents API error:', error);

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
