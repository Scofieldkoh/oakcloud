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
  listProcessingDocuments,
  PROCESSING_LIMITS,
} from '@/services/document-processing.service';
import type { ProcessingPriority, UploadSource, PipelineStatus } from '@prisma/client';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

/**
 * GET /api/processing-documents
 * List processing documents with filters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);

    const companyId = searchParams.get('companyId');
    const statusStr = searchParams.get('status');
    const isContainerStr = searchParams.get('isContainer');
    const limitStr = searchParams.get('limit');
    const cursor = searchParams.get('cursor');

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
    await requirePermission(session, 'document', 'read', companyId);

    if (!(await canAccessCompany(session, companyId))) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'Forbidden' },
        },
        { status: 403 }
      );
    }

    const status = statusStr
      ? (statusStr.split(',') as PipelineStatus[])
      : undefined;
    const isContainer =
      isContainerStr === 'true' ? true : isContainerStr === 'false' ? false : undefined;
    const limit = limitStr ? parseInt(limitStr, 10) : 50;

    const result = await listProcessingDocuments({
      companyId,
      status,
      isContainer,
      limit: Math.min(limit, 100),
      cursor: cursor ?? undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        items: result.items,
        pagination: {
          hasMore: !!result.nextCursor,
          nextCursor: result.nextCursor,
        },
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
