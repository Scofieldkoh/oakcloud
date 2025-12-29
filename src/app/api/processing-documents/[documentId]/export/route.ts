/**
 * Single Document Export API
 *
 * GET /api/processing-documents/{documentId}/export - Export document to Excel
 * Query params:
 *   - includeLinked: boolean (default: false) - Include linked documents
 */

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireAuth, canAccessCompany } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { CATEGORY_LABELS, SUBCATEGORY_LABELS } from '@/lib/document-categories';

const log = createLogger('document-export');

interface RouteParams {
  params: Promise<{ documentId: string }>;
}

// Status label mappings
const PIPELINE_STATUS_LABELS: Record<string, string> = {
  UPLOADED: 'Uploaded',
  QUEUED: 'Queued',
  PROCESSING: 'Processing',
  SPLIT_PENDING: 'Split Pending',
  SPLIT_DONE: 'Split Done',
  EXTRACTION_DONE: 'Extracted',
  FAILED_RETRYABLE: 'Failed (Retry)',
  FAILED_PERMANENT: 'Failed',
  DEAD_LETTER: 'Dead Letter',
};

const DUPLICATE_STATUS_LABELS: Record<string, string> = {
  NONE: 'Not Checked',
  SUSPECTED: 'Suspected Duplicate',
  CONFIRMED: 'Confirmed Duplicate',
  REJECTED: 'Not Duplicate',
};

const REVISION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  SUPERSEDED: 'Superseded',
};

const GST_TREATMENT_LABELS: Record<string, string> = {
  STANDARD_RATED: 'Standard Rated',
  ZERO_RATED: 'Zero Rated',
  EXEMPT: 'Exempt',
  OUT_OF_SCOPE: 'Out of Scope',
  NOT_APPLICABLE: 'Not Applicable',
};

function formatDate(date: Date | null): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-SG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDecimal(value: unknown): number | string {
  if (value === null || value === undefined) return '';
  const num = typeof value === 'object' && 'toNumber' in value
    ? (value as { toNumber(): number }).toNumber()
    : Number(value);
  return isNaN(num) ? '' : num;
}

// Type for document with includes
type DocumentWithRevision = Awaited<ReturnType<typeof getDocumentWithRevision>>;

async function getDocumentWithRevision(documentId: string) {
  return prisma.processingDocument.findUnique({
    where: { id: documentId },
    include: {
      document: {
        select: {
          companyId: true,
          fileName: true,
          originalFileName: true,
          createdAt: true,
        },
      },
      currentRevision: {
        include: {
          lineItems: {
            orderBy: { lineNo: 'asc' },
          },
        },
      },
      sourceLinks: {
        include: {
          targetDocument: {
            include: {
              document: {
                select: {
                  companyId: true,
                  fileName: true,
                  originalFileName: true,
                  createdAt: true,
                },
              },
              currentRevision: {
                include: {
                  lineItems: {
                    orderBy: { lineNo: 'asc' },
                  },
                },
              },
            },
          },
        },
      },
      targetLinks: {
        include: {
          sourceDocument: {
            include: {
              document: {
                select: {
                  companyId: true,
                  fileName: true,
                  originalFileName: true,
                  createdAt: true,
                },
              },
              currentRevision: {
                include: {
                  lineItems: {
                    orderBy: { lineNo: 'asc' },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

function addHeaderRow(
  sheet: ExcelJS.Worksheet,
  doc: NonNullable<DocumentWithRevision>
) {
  const revision = doc.currentRevision;
  const fileName = doc.document?.originalFileName || doc.document?.fileName || '';

  sheet.addRow({
    fileName,
    pipelineStatus: PIPELINE_STATUS_LABELS[doc.pipelineStatus] || doc.pipelineStatus,
    revisionStatus: revision ? (REVISION_STATUS_LABELS[revision.status] || revision.status) : '',
    duplicateStatus: DUPLICATE_STATUS_LABELS[doc.duplicateStatus] || doc.duplicateStatus,
    documentCategory: revision?.documentCategory ? (CATEGORY_LABELS[revision.documentCategory] || revision.documentCategory) : '',
    documentSubCategory: revision?.documentSubCategory ? (SUBCATEGORY_LABELS[revision.documentSubCategory] || revision.documentSubCategory) : '',
    vendorName: revision?.vendorName || '',
    documentNumber: revision?.documentNumber || '',
    documentDate: revision?.documentDate ? formatDate(revision.documentDate) : '',
    dueDate: revision?.dueDate ? formatDate(revision.dueDate) : '',
    currency: revision?.currency || '',
    subtotal: formatDecimal(revision?.subtotal),
    taxAmount: formatDecimal(revision?.taxAmount),
    totalAmount: formatDecimal(revision?.totalAmount),
    gstTreatment: revision?.gstTreatment ? (GST_TREATMENT_LABELS[revision.gstTreatment] || revision.gstTreatment) : '',
    supplierGstNo: revision?.supplierGstNo || '',
    homeCurrency: revision?.homeCurrency || '',
    homeExchangeRate: formatDecimal(revision?.homeExchangeRate),
    homeEquivalent: formatDecimal(revision?.homeEquivalent),
    createdDate: doc.document?.createdAt ? formatDate(doc.document.createdAt) : '',
    approvedDate: revision?.approvedAt ? formatDate(revision.approvedAt) : '',
  });
}

function addLineItemRows(
  sheet: ExcelJS.Worksheet,
  doc: NonNullable<DocumentWithRevision>
) {
  const revision = doc.currentRevision;
  if (!revision?.lineItems || revision.lineItems.length === 0) return;

  const fileName = doc.document?.originalFileName || doc.document?.fileName || '';

  for (const item of revision.lineItems) {
    sheet.addRow({
      fileName,
      vendorName: revision.vendorName || '',
      documentNumber: revision.documentNumber || '',
      lineNo: item.lineNo,
      description: item.description || '',
      quantity: formatDecimal(item.quantity),
      unitPrice: formatDecimal(item.unitPrice),
      amount: formatDecimal(item.amount),
      gstAmount: formatDecimal(item.gstAmount),
      taxCode: item.taxCode || '',
      accountCode: item.accountCode || '',
      homeAmount: formatDecimal(item.homeAmount),
      homeGstAmount: formatDecimal(item.homeGstAmount),
    });
  }
}

/**
 * GET /api/processing-documents/{documentId}/export
 * Export document to Excel with optional linked documents
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { documentId } = await params;
    const { searchParams } = new URL(request.url);
    const includeLinked = searchParams.get('includeLinked') === 'true';

    // Fetch the document with its revision and linked documents
    const doc = await getDocumentWithRevision(documentId);

    if (!doc) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Document not found' },
        },
        { status: 404 }
      );
    }

    // Check access to the company
    const companyId = doc.document?.companyId;
    if (!companyId || !(await canAccessCompany(session, companyId))) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'Forbidden' },
        },
        { status: 403 }
      );
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Oakcloud';
    workbook.created = new Date();

    // ========================
    // Worksheet 1: Headers
    // ========================
    const headersSheet = workbook.addWorksheet('Document Headers');
    headersSheet.columns = [
      { header: 'File Name', key: 'fileName', width: 35 },
      { header: 'Pipeline Status', key: 'pipelineStatus', width: 15 },
      { header: 'Revision Status', key: 'revisionStatus', width: 15 },
      { header: 'Duplicate Status', key: 'duplicateStatus', width: 18 },
      { header: 'Document Category', key: 'documentCategory', width: 20 },
      { header: 'Document Sub-Category', key: 'documentSubCategory', width: 22 },
      { header: 'Vendor Name', key: 'vendorName', width: 30 },
      { header: 'Document Number', key: 'documentNumber', width: 20 },
      { header: 'Document Date', key: 'documentDate', width: 15 },
      { header: 'Due Date', key: 'dueDate', width: 15 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Subtotal', key: 'subtotal', width: 15 },
      { header: 'Tax Amount', key: 'taxAmount', width: 15 },
      { header: 'Total Amount', key: 'totalAmount', width: 15 },
      { header: 'GST Treatment', key: 'gstTreatment', width: 18 },
      { header: 'Supplier GST No', key: 'supplierGstNo', width: 18 },
      { header: 'Home Currency', key: 'homeCurrency', width: 15 },
      { header: 'Exchange Rate', key: 'homeExchangeRate', width: 15 },
      { header: 'Home Equivalent', key: 'homeEquivalent', width: 15 },
      { header: 'Created Date', key: 'createdDate', width: 18 },
      { header: 'Approved Date', key: 'approvedDate', width: 18 },
    ];

    // Style header row
    headersSheet.getRow(1).font = { bold: true };
    headersSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // ========================
    // Worksheet 2: Line Items
    // ========================
    const lineItemsSheet = workbook.addWorksheet('Line Items');
    lineItemsSheet.columns = [
      { header: 'File Name', key: 'fileName', width: 35 },
      { header: 'Vendor Name', key: 'vendorName', width: 30 },
      { header: 'Document Number', key: 'documentNumber', width: 20 },
      { header: 'Line No', key: 'lineNo', width: 10 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Unit Price', key: 'unitPrice', width: 15 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'GST Amount', key: 'gstAmount', width: 15 },
      { header: 'Tax Code', key: 'taxCode', width: 12 },
      { header: 'Account Code', key: 'accountCode', width: 15 },
      { header: 'Home Amount', key: 'homeAmount', width: 15 },
      { header: 'Home GST Amount', key: 'homeGstAmount', width: 15 },
    ];

    // Style header row
    lineItemsSheet.getRow(1).font = { bold: true };
    lineItemsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Add main document data
    addHeaderRow(headersSheet, doc);
    addLineItemRows(lineItemsSheet, doc);

    // Add linked documents if requested
    if (includeLinked) {
      const processedIds = new Set<string>([doc.id]);

      // Add target documents (documents this one links to)
      for (const link of doc.sourceLinks || []) {
        const linkedDoc = link.targetDocument;
        if (processedIds.has(linkedDoc.id)) continue;
        processedIds.add(linkedDoc.id);

        // Check access to linked document's company
        const linkedCompanyId = linkedDoc.document?.companyId;
        if (linkedCompanyId && await canAccessCompany(session, linkedCompanyId)) {
          addHeaderRow(headersSheet, linkedDoc as NonNullable<DocumentWithRevision>);
          addLineItemRows(lineItemsSheet, linkedDoc as NonNullable<DocumentWithRevision>);
        }
      }

      // Add source documents (documents that link to this one)
      for (const link of doc.targetLinks || []) {
        const linkedDoc = link.sourceDocument;
        if (processedIds.has(linkedDoc.id)) continue;
        processedIds.add(linkedDoc.id);

        // Check access to linked document's company
        const linkedCompanyId = linkedDoc.document?.companyId;
        if (linkedCompanyId && await canAccessCompany(session, linkedCompanyId)) {
          addHeaderRow(headersSheet, linkedDoc as NonNullable<DocumentWithRevision>);
          addLineItemRows(lineItemsSheet, linkedDoc as NonNullable<DocumentWithRevision>);
        }
      }
    }

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Generate filename
    const docName = doc.document?.originalFileName || doc.document?.fileName || 'document';
    const baseName = docName.replace(/\.[^/.]+$/, ''); // Remove extension
    const sanitizedName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
    const dateStr = new Date().toISOString().split('T')[0];
    const excelFileName = `${sanitizedName}-export-${dateStr}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${excelFileName}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (error) {
    log.error('Document export API error:', error);

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
