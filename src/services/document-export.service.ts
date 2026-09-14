/**
 * Document Export Service
 *
 * Handles PDF and HTML export of generated documents. W3 routes canonical
 * content through one revision-compatible pagination/assembly path for server
 * PDF and HTML while exposing the same pure assembler to CORE local print.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import { ApiError, ErrorCodes } from '@/lib/errors';
import {
  getLetterhead,
  buildHeaderHtml,
  buildFooterHtml,
  type PageMargins,
} from '@/services/letterhead.service';
import { extractSections, type DocumentSection } from '@/services/document-validation.service';
import { extractA4DocumentLayout, type A4DocumentLayout } from '@/components/documents/a4-pagination/layout';
import { createA4PageLayout } from '@/components/documents/a4-pagination/a4-page-layout';
import { buildA4FontFaceCssDataUris } from '@/components/documents/a4-pagination/a4-font-faces-server';
import {
  serializeA4CanonicalBreakDocument,
} from '@/components/documents/a4-pagination/semantic-break-projection';
import { buildA4PrintCss, PAGE_NUMBER_STRIP_MM } from '@/components/documents/a4-print-styles';
import { readA4StoredDocument } from '@/lib/document-editor/a4-editor-format';
import {
  assembleA4OutputPages,
  createA4OutputPreparationSession,
  type A4OutputPageFragment,
} from '@/lib/document-editor/a4-output-preparation';
import { generatedDocumentPdfFileName } from '@/lib/generated-document-filename';
import { findChromePath } from '@/lib/chrome-executable';
import {
  paginateA4BrowserPage,
  renderPaginatedA4Html,
} from '@/services/a4-output-browser.service';
import { sanitizeCanonicalA4Html } from '@/services/a4-content-sanitizer.service';
import archiver from 'archiver';

export { buildA4PrintCss } from '@/components/documents/a4-print-styles';
export { findChromePath };

export interface ExportPDFParams {
  documentId: string;
  tenantId: string;
  userId?: string;
  includeLetterhead?: boolean;
  format?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  filename?: string;
  signal?: AbortSignal;
}

export interface PDFResult {
  buffer: Buffer;
  filename: string;
  pageCount: number;
  mimeType: string;
}

export interface ExportHTMLParams {
  documentId: string;
  tenantId: string;
  includeStyles?: boolean;
  includeSections?: boolean;
  includeLetterhead?: boolean;
  signal?: AbortSignal;
}

export interface HTMLResult {
  html: string;
  styles: string;
  sections: DocumentSection[];
}

export class ExportPaginationError extends ApiError {
  constructor(details?: unknown) {
    super(
      ErrorCodes.SERVICE_UNAVAILABLE,
      'PDF pagination could not be completed safely. Please retry the export.',
      503,
      details,
    );
    this.name = 'ExportPaginationError';
  }
}

const DEFAULT_MARGINS: PageMargins = {
  top: 20,
  right: 20,
  bottom: 20,
  left: 20,
};

const PDF_PAGE_TIMEOUT_MS = 30_000;

export interface ExportPaginationLayout {
  contentWidthPx: number;
  contentHeightPx: number;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  paragraphSpacing: string;
}

export interface ExportPaginationOptions {
  canonicalHtml: string;
  layout: ExportPaginationLayout;
}

type ExportPageFragment = A4OutputPageFragment;

function canonicalOutputHtml(content: string, contentJson?: unknown): string {
  const reader = readA4StoredDocument(content, contentJson);
  return serializeA4CanonicalBreakDocument(reader.canonical);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ExportPaginationError({ action: 'retry', reason: 'cancelled' });
  }
}

function outputLayoutForDocument(
  contentJson: unknown,
  letterhead: Awaited<ReturnType<typeof getLetterhead>>,
): A4DocumentLayout {
  const storedLayout = extractA4DocumentLayout(contentJson);
  if (!letterhead?.isEnabled || !letterhead.pageMargins) return storedLayout;
  return {
    ...storedLayout,
    marginsMm: parseMargins(letterhead.pageMargins),
  };
}

function paginationLayoutForDocument(layout: A4DocumentLayout): ExportPaginationLayout {
  const pageLayout = createA4PageLayout(layout.marginsMm);
  return {
    contentWidthPx: pageLayout.contentWidthPx,
    contentHeightPx: pageLayout.contentHeightPx,
    fontFamily: layout.fontFamily,
    fontSize: layout.fontSize,
    lineHeight: String(layout.lineHeight),
    paragraphSpacing: layout.paragraphSpacing,
  };
}

function outputPrintStyles(layout: A4DocumentLayout): string {
  return buildA4PrintCss(layout, {
    pageNumberStripMm: PAGE_NUMBER_STRIP_MM,
    fontFaceCss: buildA4FontFaceCssDataUris(),
  });
}

export async function exportToPDF(params: ExportPDFParams): Promise<PDFResult> {
  const {
    documentId,
    tenantId,
    userId,
    includeLetterhead = true,
    format = 'A4',
    orientation = 'portrait',
    filename,
    signal,
  } = params;

  throwIfAborted(signal);
  const document = await prisma.generatedDocument.findFirst({
    where: { id: documentId, tenantId, deletedAt: null },
    include: {
      company: { select: { name: true, uen: true } },
      template: { select: { name: true, category: true } },
    },
  });
  if (!document) throw new Error('Document not found');

  const canonicalHtml = canonicalOutputHtml(document.content, document.contentJson);
  const letterhead = includeLetterhead && document.useLetterhead
    ? await getLetterhead(tenantId)
    : null;
  const layout = outputLayoutForDocument(document.contentJson, letterhead);
  const margins = layout.marginsMm;
  const htmlContent = buildPDFHtml(
    { ...document, content: canonicalHtml },
    letterhead,
    margins,
  );

  throwIfAborted(signal);
  const pdfBuffer = await generatePDF(htmlContent, {
    format,
    orientation,
    margins,
    headerHtml: buildHeaderHtml(letterhead),
    footerHtml: buildFooterHtml(letterhead, { includePageNumbers: false }),
    signal,
    pagination: {
      canonicalHtml,
      layout: paginationLayoutForDocument(layout),
    },
  });

  // Audit only after PDF bytes exist. Failure/cancellation never records a
  // successful export and never includes document HTML or field values in logs.
  await createAuditLog({
    action: 'EXPORT',
    entityType: 'GeneratedDocument',
    entityId: documentId,
    entityName: document.title,
    summary: `Exported document "${document.title}" to PDF`,
    metadata: { format: 'PDF', includeLetterhead, orientation },
    userId,
    tenantId,
    companyId: document.companyId || undefined,
  });

  return {
    buffer: pdfBuffer,
    filename: filename || generatedDocumentPdfFileName(document.title),
    pageCount: await countPDFPages(pdfBuffer),
    mimeType: 'application/pdf',
  };
}

/**
 * Generates a PDF only after the shared W3 readiness session has observed
 * canonical content, fonts, S pagination and page installation. There is no
 * clipped fixed-height fallback. Browser/page resources are session cleanups
 * for success, error, cancellation and timeout paths.
 */
export async function generatePDF(
  html: string,
  options: {
    format: 'A4' | 'Letter';
    orientation: 'portrait' | 'landscape';
    margins: PageMargins;
    headerHtml: string;
    footerHtml: string;
    pagination?: ExportPaginationOptions;
    signal?: AbortSignal;
  },
): Promise<Buffer> {
  throwIfAborted(options.signal);
  const session = createA4OutputPreparationSession('pdf', options.signal);
  const puppeteer = await import('puppeteer-core');
  const executablePath = await findChromePath();
  throwIfAborted(options.signal);

  const browser = await puppeteer.default.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  session.addCleanup(() => browser.close());

  try {
    const page = await browser.newPage();
    session.addCleanup(async () => {
      if (!page.isClosed()) await page.close();
    });
    page.setDefaultTimeout(PDF_PAGE_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PDF_PAGE_TIMEOUT_MS);
    throwIfAborted(options.signal);

    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: PDF_PAGE_TIMEOUT_MS,
    });
    throwIfAborted(options.signal);

    if (options.pagination) {
      try {
        await paginateA4BrowserPage({
          page,
          canonicalHtml: options.pagination.canonicalHtml,
          layout: options.pagination.layout,
          session,
        });
      } catch (error) {
        if (error instanceof ExportPaginationError) throw error;
        if (options.signal?.aborted) {
          throw new ExportPaginationError({ action: 'retry', reason: 'cancelled' });
        }
        throw new ExportPaginationError({
          action: 'retry',
          reason: error instanceof Error ? error.message : 'pagination-failed',
        });
      }
    } else {
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
      });
      session.markFontsReady();
      session.markPaginationReady();
      session.markInstalled();
    }

    throwIfAborted(options.signal);
    session.assertReady();
    const pdfBuffer = await page.pdf({
      format: options.format,
      landscape: options.orientation === 'landscape',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: !!(options.headerHtml || options.footerHtml),
      headerTemplate: options.headerHtml || '<div></div>',
      footerTemplate: options.footerHtml || '<div></div>',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      timeout: PDF_PAGE_TIMEOUT_MS,
    });
    throwIfAborted(options.signal);
    return Buffer.from(pdfBuffer);
  } finally {
    await session.dispose();
  }
}

async function countPDFPages(buffer: Buffer): Promise<number> {
  const pdfString = buffer.toString('binary');
  const matches = pdfString.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 1;
}

export interface ExportZipResult {
  buffer: Buffer;
  filename: string;
}

export async function exportDocumentsToZip(
  ids: string[],
  params: { tenantId: string; userId?: string },
): Promise<ExportZipResult> {
  const { tenantId, userId } = params;
  const documents = await prisma.generatedDocument.findMany({
    where: { id: { in: ids }, tenantId, deletedAt: null },
    select: { id: true },
  });
  const foundIds = new Set(documents.map((document) => document.id));
  const archive = archiver('zip', { zlib: { level: 5 } });
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finalized = new Promise<Buffer>((resolve, reject) => {
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
  });
  const usedFilenames = new Map<string, number>();

  for (const id of ids) {
    if (!foundIds.has(id)) continue;
    const result = await exportToPDF({ documentId: id, tenantId, userId });
    let fileName = result.filename;
    const count = usedFilenames.get(result.filename) ?? 0;
    if (count > 0) {
      const extensionIndex = result.filename.lastIndexOf('.');
      fileName = extensionIndex > 0
        ? `${result.filename.slice(0, extensionIndex)} (${count})${result.filename.slice(extensionIndex)}`
        : `${result.filename} (${count})`;
    }
    usedFilenames.set(result.filename, count + 1);
    archive.append(result.buffer, { name: fileName });
  }

  await archive.finalize();
  const buffer = await finalized;
  const dateStr = new Date().toISOString().split('T')[0];
  return { buffer, filename: `documents-${dateStr}.zip` };
}

export async function exportToHTML(params: ExportHTMLParams): Promise<HTMLResult> {
  const {
    documentId,
    tenantId,
    includeStyles = true,
    includeSections = true,
    includeLetterhead = true,
    signal,
  } = params;
  throwIfAborted(signal);
  const document = await prisma.generatedDocument.findFirst({
    where: { id: documentId, tenantId, deletedAt: null },
  });
  if (!document) throw new Error('Document not found');

  const canonicalHtml = canonicalOutputHtml(document.content, document.contentJson);
  const letterhead = includeLetterhead && document.useLetterhead
    ? await getLetterhead(tenantId)
    : null;
  const layout = outputLayoutForDocument(document.contentJson, letterhead);
  const styles = includeStyles ? outputPrintStyles(layout) : '';
  const sanitizedContent = sanitizeCanonicalA4Html(canonicalHtml);
  const sections = includeSections ? extractSections(sanitizedContent) : [];
  const baseHtml = buildPDFHtml(
    { ...document, content: canonicalHtml },
    letterhead,
    layout.marginsMm,
    includeStyles,
  );
  const rendered = await renderPaginatedA4Html({
    html: baseHtml,
    canonicalHtml,
    layout: paginationLayoutForDocument(layout),
    pageChrome: {
      headerHtml: buildHeaderHtml(letterhead),
      footerHtml: buildFooterHtml(letterhead, { includePageNumbers: false }),
    },
    signal,
    timeoutMs: PDF_PAGE_TIMEOUT_MS,
  });

  return {
    html: rendered.html,
    styles,
    sections,
  };
}

export function buildPaginatedSectionsHtml(fragments: ExportPageFragment[]): string {
  try {
    return assembleA4OutputPages(fragments, {
      sanitizeFragment: (html) => sanitizeCanonicalA4Html(html, { projection: true }),
    }).html;
  } catch (error) {
    throw new ExportPaginationError({
      action: 'retry',
      reason: error instanceof Error ? error.message : 'no-printable-fragments',
    });
  }
}

export function buildPDFHtml(
  document: {
    title: string;
    content: string;
    status: string;
    contentJson?: unknown;
  },
  letterhead: Awaited<ReturnType<typeof getLetterhead>>,
  margins: PageMargins,
  includeStyles = true,
): string {
  const canonicalHtml = canonicalOutputHtml(document.content, document.contentJson);
  const content = sanitizeCanonicalA4Html(canonicalHtml) || '&nbsp;';
  const storedLayout = extractA4DocumentLayout(document.contentJson);
  const layout: A4DocumentLayout = {
    ...storedLayout,
    marginsMm: letterhead?.isEnabled ? margins : storedLayout.marginsMm,
  };
  const watermark = document.status !== 'FINALIZED'
    ? '<div class="draft-watermark" style="position: fixed; top: 45%; left: 0; right: 0; z-index: 10; text-align: center; font-family: \'Times New Roman\', Times, serif; font-size: 60pt; color: rgba(128, 128, 128, 0.25);">DRAFT</div>'
    : '';
  const styles = includeStyles ? outputPrintStyles(layout) : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(document.title)}</title>
      ${includeStyles ? `<style>${styles}</style>` : ''}
    </head>
    <body>
      ${watermark}
      <div id="a4-paginated-sections">
        <section class="print-page"><div class="content">${content}</div><div class="print-page-number">1</div></section>
      </div>
    </body>
    </html>
  `;
}

function parseMargins(margins: unknown): PageMargins {
  if (margins && typeof margins === 'object' && !Array.isArray(margins)) {
    const m = margins as Record<string, unknown>;
    return {
      top: typeof m.top === 'number' ? m.top : DEFAULT_MARGINS.top,
      right: typeof m.right === 'number' ? m.right : DEFAULT_MARGINS.right,
      bottom: typeof m.bottom === 'number' ? m.bottom : DEFAULT_MARGINS.bottom,
      left: typeof m.left === 'number' ? m.left : DEFAULT_MARGINS.left,
    };
  }
  return DEFAULT_MARGINS;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m] || m);
}

export async function generatePreviewHtml(
  documentId: string,
  tenantId: string,
  options: { includeLetterhead?: boolean; showDraftWatermark?: boolean } = {},
): Promise<string> {
  const { includeLetterhead = true, showDraftWatermark = true } = options;
  const document = await prisma.generatedDocument.findFirst({
    where: { id: documentId, tenantId, deletedAt: null },
  });
  if (!document) throw new Error('Document not found');

  const letterhead = includeLetterhead && document.useLetterhead
    ? await getLetterhead(tenantId)
    : null;
  const headerHtml = buildHeaderHtml(letterhead);
  const footerHtml = buildFooterHtml(letterhead);
  const canonicalHtml = canonicalOutputHtml(document.content, document.contentJson);
  const sanitizedContent = sanitizeCanonicalA4Html(canonicalHtml);
  const watermark = showDraftWatermark && document.status !== 'FINALIZED'
    ? '<div class="draft-watermark">DRAFT</div>'
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(document.title)}</title>
      <style>
        ${outputPrintStyles(outputLayoutForDocument(document.contentJson, letterhead))}
        .preview-page { background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin: 20px auto; max-width: 210mm; min-height: 297mm; position: relative; padding: 20mm; }
        .preview-header { padding: 15mm 20mm 5mm; border-bottom: 1px solid #eee; margin: -20mm -20mm 20mm -20mm; }
        .preview-footer { position: absolute; bottom: 0; left: 0; right: 0; padding: 5mm 20mm 15mm; border-top: 1px solid #eee; }
      </style>
    </head>
    <body style="background: #f5f5f5; padding: 20px;">
      <div class="preview-page">
        ${watermark}
        ${headerHtml ? `<div class="preview-header">${headerHtml}</div>` : ''}
        <div class="document-content">${sanitizedContent}</div>
        ${footerHtml ? `<div class="preview-footer">${footerHtml}</div>` : ''}
      </div>
    </body>
    </html>
  `;
}
