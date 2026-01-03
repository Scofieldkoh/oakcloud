/**
 * Bulk Merge API
 *
 * Merges multiple processing documents into a single PDF document.
 * - Creates a new ProcessingDocument for the merged result with pipelineStatus: QUEUED (triggers extraction)
 * - Soft deletes the source documents after successful merge
 * - Clears duplicate references for deleted documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { storage, StorageKeys } from '@/lib/storage';
import { PDFDocument } from 'pdf-lib';
import { createAuditLog } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { clearDuplicateReferencesToDocument } from '@/services/duplicate-detection.service';
import crypto from 'crypto';

const log = createLogger('bulk-merge');

interface BulkMergeRequest {
    documentIds: string[];
}

export async function POST(request: NextRequest) {
    try {
        const session = await requireAuth();

        const body: BulkMergeRequest = await request.json();
        const { documentIds } = body;

        if (!documentIds || !Array.isArray(documentIds) || documentIds.length < 2) {
            return NextResponse.json(
                { error: { message: 'At least 2 document IDs are required for merging' } },
                { status: 400 }
            );
        }

        // Fetch all source documents with their Document records
        const sourceDocs = await prisma.processingDocument.findMany({
            where: {
                id: { in: documentIds },
                deletedAt: null,
            },
            include: {
                document: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });

        // Filter by tenant access
        const accessibleDocs = sourceDocs.filter(
            (doc) => doc.document.tenantId === session.tenantId
        );

        if (accessibleDocs.length !== documentIds.length) {
            return NextResponse.json(
                { error: { message: 'One or more documents not found or access denied' } },
                { status: 404 }
            );
        }

        // Verify all documents belong to the same company
        const companyIds = new Set(accessibleDocs.map((d) => d.document.companyId).filter(Boolean));
        if (companyIds.size > 1) {
            return NextResponse.json(
                { error: { message: 'All documents must belong to the same company' } },
                { status: 400 }
            );
        }

        const tenantId = accessibleDocs[0].document.tenantId;
        const companyId = accessibleDocs[0].document.companyId;

        // Create merged PDF
        const mergedPdf = await PDFDocument.create();
        let totalPageCount = 0;

        for (const doc of accessibleDocs) {
            const pdfBytes = await storage.download(doc.document.storageKey);
            const sourcePdf = await PDFDocument.load(pdfBytes);
            const pageIndices = sourcePdf.getPageIndices();
            const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices);
            copiedPages.forEach((page) => mergedPdf.addPage(page));
            totalPageCount += pageIndices.length;
        }

        // Save merged PDF
        const mergedPdfBytes = await mergedPdf.save({ useObjectStreams: true });
        const mergedFileName = `Merged_${new Date().toISOString().split('T')[0]}_${accessibleDocs.length}docs.pdf`;

        // Generate storage key
        const docId = crypto.randomUUID();
        const mergedStorageKey = StorageKeys.documentOriginal(tenantId, companyId ?? 'no-company', docId, '.pdf');

        // Upload merged file
        await storage.upload(mergedStorageKey, Buffer.from(mergedPdfBytes), {
            contentType: 'application/pdf',
        });

        // Create Document record first
        const newDocument = await prisma.document.create({
            data: {
                tenantId,
                companyId,
                documentType: 'PROCESSING',
                uploadedById: session.id,
                fileName: mergedFileName,
                originalFileName: mergedFileName,
                mimeType: 'application/pdf',
                fileSize: mergedPdfBytes.length,
                storageKey: mergedStorageKey,
            },
        });

        // Create ProcessingDocument record
        const mergedProcessingDoc = await prisma.processingDocument.create({
            data: {
                documentId: newDocument.id,
                isContainer: true,
                pageCount: totalPageCount,
                pipelineStatus: 'QUEUED',
                uploadSource: 'WEB',
            },
        });

        // Create audit log for merged document
        await createAuditLog({
            tenantId,
            userId: session.id,
            action: 'CREATE',
            entityType: 'ProcessingDocument',
            entityId: mergedProcessingDoc.id,
            metadata: {
                action: 'MERGE',
                sourceDocumentIds: documentIds,
                mergedPageCount: totalPageCount,
            },
        });

        // Soft delete source documents
        const now = new Date();
        for (const doc of accessibleDocs) {
            await prisma.processingDocument.update({
                where: { id: doc.id },
                data: { deletedAt: now },
            });

            // Clear duplicate references pointing to deleted documents
            await clearDuplicateReferencesToDocument(doc.id);

            // Create audit log for each soft-deleted document
            await createAuditLog({
                tenantId,
                userId: session.id,
                companyId: doc.document.companyId ?? undefined,
                action: 'DELETE',
                entityType: 'ProcessingDocument',
                entityId: doc.id,
                summary: `Soft-deleted after merge into ${mergedProcessingDoc.id}`,
                metadata: {
                    action: 'MERGE_SOURCE_DELETED',
                    mergedDocumentId: mergedProcessingDoc.id,
                },
            });
        }

        log.info(`Merged ${accessibleDocs.length} documents into ${mergedProcessingDoc.id}, source documents soft-deleted`);

        return NextResponse.json({
            data: {
                success: true,
                mergedDocumentId: mergedProcessingDoc.id,
                sourceDocumentIds: documentIds,
                pageCount: totalPageCount,
                sourceDocumentsDeleted: true,
            },
        });
    } catch (error) {
        log.error('Failed to merge documents', error);
        return NextResponse.json(
            { error: { message: error instanceof Error ? error.message : 'Internal server error' } },
            { status: 500 }
        );
    }
}
