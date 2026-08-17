/**
 * Document Export Service
 *
 * Handles PDF and HTML export of generated documents.
 * Uses Puppeteer for high-fidelity PDF generation.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit';
import {
  getLetterhead,
  buildHeaderHtml,
  buildFooterHtml,
  type PageMargins,
} from '@/services/letterhead.service';
import { extractSections, type DocumentSection } from '@/services/document-validation.service';
import { splitHardPageSections } from '@/lib/document-page-breaks';
import {
  extractA4DocumentLayout,
} from '@/components/documents/a4-pagination/layout';
import { createA4PageLayout } from '@/components/documents/a4-pagination/a4-page-layout';
import { buildA4PageContentStyles } from '@/components/documents/a4-pagination/a4-page-content-css';
import { buildA4FontFaceCssDataUris } from '@/components/documents/a4-pagination/a4-font-faces-server';
import { A4_PAGINATION_BUNDLE } from '@/components/documents/a4-pagination/pagination-bundle.generated';
import { buildA4PrintCss, PAGE_NUMBER_STRIP_MM } from '@/components/documents/a4-print-styles';
export { buildA4PrintCss } from '@/components/documents/a4-print-styles';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import archiver from 'archiver';

// ============================================================================
// Types
// ============================================================================

export interface ExportPDFParams {
  documentId: string;
  tenantId: string;
  userId?: string; // Optional for public share access
  includeLetterhead?: boolean;
  format?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  filename?: string;
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
}

export interface HTMLResult {
  html: string;
  styles: string;
  sections: DocumentSection[];
}

// Default page margins in mm (matches A4PageEditor's 20mm margins)
const DEFAULT_MARGINS: PageMargins = {
  top: 20,
  right: 20,
  bottom: 20,
  left: 20,
};

// ============================================================================
// PDF Export
// ============================================================================

/**
 * Export document to PDF using Puppeteer
 */
export async function exportToPDF(params: ExportPDFParams): Promise<PDFResult> {
  const {
    documentId,
    tenantId,
    userId,
    includeLetterhead = true,
    format = 'A4',
    orientation = 'portrait',
    filename,
  } = params;

  // Fetch document
  const document = await prisma.generatedDocument.findFirst({
    where: { id: documentId, tenantId, deletedAt: null },
    include: {
      company: { select: { name: true, uen: true } },
      template: { select: { name: true, category: true } },
    },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  // Fetch letterhead if needed
  const letterhead = includeLetterhead && document.useLetterhead
    ? await getLetterhead(tenantId)
    : null;

  // Get page margins
  const margins = letterhead?.pageMargins
    ? parseMargins(letterhead.pageMargins)
    : DEFAULT_MARGINS;

  // Build HTML content
  const htmlContent = buildPDFHtml(document, letterhead, margins);

  // Paginate with the same engine as the editor so page boundaries match
  // the on-screen preview exactly.
  const layout = extractA4DocumentLayout(document.contentJson);
  const pageLayout = createA4PageLayout(layout.marginsMm);

  // Generate PDF
  const pdfBuffer = await generatePDF(htmlContent, {
    format,
    orientation,
    margins,
    headerHtml: buildHeaderHtml(letterhead),
    footerHtml: buildFooterHtml(letterhead, { includePageNumbers: false }),
    pagination: {
      canonicalHtml: document.content,
      layout: {
        contentWidthPx: pageLayout.contentWidthPx,
        contentHeightPx: pageLayout.contentHeightPx,
        fontFamily: layout.fontFamily,
        fontSize: layout.fontSize,
        lineHeight: String(layout.lineHeight),
        paragraphSpacing: layout.paragraphSpacing,
      },
    },
  });

  // Log export
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

  // Generate filename
  const exportFilename = filename || generateFilename(document.title, 'pdf');

  return {
    buffer: pdfBuffer,
    filename: exportFilename,
    pageCount: await countPDFPages(pdfBuffer),
    mimeType: 'application/pdf',
  };
}

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

interface ExportPageFragment {
  content: string;
  hardBreakBefore: boolean;
  oversized?: boolean;
}

/**
 * Generate PDF using Puppeteer
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
  }
): Promise<Buffer> {
  // Lazy load puppeteer-core
  const puppeteer = await import('puppeteer-core');

  // Try to find Chrome executable or use remote browser
  const executablePath = await findChromePath();

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

  try {
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    if (options.pagination) {
      try {
        await page.addStyleTag({
          content: buildA4PageContentStyles(
            options.pagination.layout.paragraphSpacing,
          ),
        });
        await page.addScriptTag({ content: A4_PAGINATION_BUNDLE });
        const fragments = await page.evaluate((payload) => {
          const globalScope = window as unknown as {
            A4Pagination?: {
              paginateA4Document: (
                input: string,
                layout: unknown,
              ) => ExportPageFragment[];
            };
          };
          const paginate = globalScope.A4Pagination?.paginateA4Document;
          if (!paginate) return null;
          return paginate(payload.canonicalHtml, payload.layout);
        }, {
          canonicalHtml: options.pagination.canonicalHtml,
          layout: options.pagination.layout,
        } satisfies { canonicalHtml: string; layout: unknown });
        if (fragments) {
          const sectionsHtml = buildPaginatedSectionsHtml(fragments);
          await page.evaluate((replacement) => {
            const container = document.getElementById('a4-paginated-sections');
            if (container) container.innerHTML = replacement;
          }, sectionsHtml);
        }
      } catch (paginationError) {
        console.warn(
          'A4 pagination in export failed; falling back to natural page flow',
          paginationError,
        );
      }
    }

    // Use preferCSSPageSize to let CSS @page handle margins (matches browser print)
    // This ensures PDF export looks identical to browser print dialog
    const pdfBuffer = await page.pdf({
      format: options.format,
      landscape: options.orientation === 'landscape',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: !!(options.headerHtml || options.footerHtml),
      headerTemplate: options.headerHtml || '<div></div>',
      footerTemplate: options.footerHtml || '<div></div>',
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Find Chrome executable path
 */
export async function findChromePath(): Promise<string> {
  // Check environment variable first
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  // Common paths
  const paths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];

  const fs = await import('fs');
  for (const path of paths) {
    try {
      await fs.promises.access(path);
      return path;
    } catch {
      // Path doesn't exist, try next
    }
  }

  // If no Chrome found, throw helpful error
  throw new Error(
    'Chrome/Chromium not found. Set CHROME_PATH environment variable or install Chrome/Chromium.'
  );
}

/**
 * Count pages in PDF buffer
 */
async function countPDFPages(buffer: Buffer): Promise<number> {
  // Simple page count by looking for PDF page markers
  const pdfString = buffer.toString('binary');
  const matches = pdfString.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 1;
}

// ============================================================================
// Bulk ZIP Export
// ============================================================================

export interface ExportZipResult {
  buffer: Buffer;
  filename: string;
}

/**
 * Export multiple documents to a single ZIP archive of PDFs.
 */
export async function exportDocumentsToZip(
  ids: string[],
  params: { tenantId: string; userId?: string }
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

// ============================================================================
// HTML Export
// ============================================================================

/**
 * Export document to clean HTML
 */
export async function exportToHTML(params: ExportHTMLParams): Promise<HTMLResult> {
  const { documentId, tenantId, includeStyles = true, includeSections = true } = params;

  // Fetch document
  const document = await prisma.generatedDocument.findFirst({
    where: { id: documentId, tenantId, deletedAt: null },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  // Sanitize content
  const window = new JSDOM('').window;
  const purify = DOMPurify(window);
  const sanitizedContent = purify.sanitize(document.content, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'ul', 'ol', 'li', 'a', 'span', 'div', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class', 'id', 'src', 'alt'],
  });

  // Extract sections if needed
  const sections = includeSections ? extractSections(sanitizedContent) : [];

  // Build HTML
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(document.title)}</title>
      ${includeStyles ? `<style>${buildA4PrintCss(extractA4DocumentLayout(document.contentJson))}</style>` : ''}
    </head>
    <body>
      <div class="document-content">
        ${sanitizedContent}
      </div>
    </body>
    </html>
  `;

  return {
    html,
    styles: includeStyles
      ? buildA4PrintCss(extractA4DocumentLayout(document.contentJson))
      : '',
    sections,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a page content should be removed (contains only [Remove Page])
 */
function shouldRemovePage(content: string): boolean {
  const textContent = (content || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return /^\[Remove\s*Page\]$/i.test(textContent);
}

/**
 * Parse content into hard page sections.
 * Legacy <!-- PAGE_BREAK --> comments are soft layout hints and are discarded;
 * class-based page-break elements remain explicit hard boundaries.
 */
function parsePages(content: string): string[] {
  return splitHardPageSections(content)
    .map((page) => page.trim())
    .filter((page) => page.length > 0);
}

function sanitizeExportPage(
  window: Parameters<typeof DOMPurify>[0],
  pageContent: string,
): string {
  const purify = DOMPurify(window);
  return purify.sanitize(
    pageContent,
    {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
        'ul', 'ol', 'li', 'a', 'span', 'div', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'img', 'sup', 'sub',
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel', 'style', 'class', 'id', 'src', 'alt',
        'colspan', 'rowspan',
        'data-flow-id',
        'data-flow-continuation',
        'data-flow-continuation-item',
        'data-flow-oversized',
        'data-flow-keep-together',
      ],
    },
  );
}

/**
 * Renders engine-paginated fragments as print-page sections, mirroring the
 * editor's print frame (including oversized pages that flow naturally).
 */
export function buildPaginatedSectionsHtml(fragments: ExportPageFragment[]): string {
  const window = new JSDOM('').window;
  const sections = fragments
    .filter((fragment) => !shouldRemovePage(fragment.content))
    .map((fragment, index) => {
      const content = sanitizeExportPage(window, fragment.content) || '&nbsp;';
      const oversized = fragment.oversized ? ' data-oversized="true"' : '';
      return `<section class="print-page"${oversized}><div class="content">${content}</div><div class="print-page-number">${index + 1}</div></section>`;
    });

  return sections.length > 0
    ? sections.join('')
    : '<section class="print-page"><div class="content">&nbsp;</div><div class="print-page-number">1</div></section>';
}

/**
 * Build complete HTML for PDF generation.
 *
 * Mirrors the A4 editor's print typography and margins via the shared A4
 * print stylesheet. Content taller than one page (e.g. long tables) is
 * allowed to flow onto following pages instead of being clipped, and page
 * numbers come from the PDF footer template so they never duplicate.
 */
export function buildPDFHtml(
  document: {
    title: string;
    content: string;
    status: string;
    contentJson?: unknown;
  },
  _letterhead: Awaited<ReturnType<typeof getLetterhead>>,
  _margins: PageMargins
): string {
  // Parse content into pages
  const pages = parsePages(document.content);

  // Filter out pages marked with [Remove Page]
  const filteredPages = pages.filter(page => !shouldRemovePage(page));

  const window = new JSDOM('').window;

  const pagesHtml = filteredPages.length > 0
    ? filteredPages
        .map((pageContent, index) => {
          const content = sanitizeExportPage(window, pageContent) || '&nbsp;';
          return `<section class="print-page"><div class="content">${content}</div><div class="print-page-number">${index + 1}</div></section>`;
        })
        .join('')
    : '<section class="print-page"><div class="content">&nbsp;</div><div class="print-page-number">1</div></section>';

  // Add draft watermark if not finalized (fixed so it overlays every page
  // without shifting the printed page layout)
  const watermark = document.status !== 'FINALIZED'
    ? '<div class="draft-watermark" style="position: fixed; top: 45%; left: 0; right: 0; z-index: 10; text-align: center; font-family: \'Times New Roman\', Times, serif; font-size: 60pt; color: rgba(128, 128, 128, 0.25);">DRAFT</div>'
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(document.title)}</title>
      <style>${buildA4PrintCss(extractA4DocumentLayout(document.contentJson), {
        pageNumberStripMm: PAGE_NUMBER_STRIP_MM,
        fontFaceCss: buildA4FontFaceCssDataUris(),
      })}</style>
    </head>
    <body>
      ${watermark}
      <div id="a4-paginated-sections">
        ${pagesHtml}
      </div>
    </body>
    </html>
  `;
}

/**
 * Parse page margins from JSON
 */
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

/**
 * Generate filename for export
 */
function generateFilename(title: string, extension: string): string {
  const sanitizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const timestamp = new Date().toISOString().split('T')[0];
  return `${sanitizedTitle}-${timestamp}.${extension}`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m] || m);
}

// ============================================================================
// Preview Generation (no Puppeteer required)
// ============================================================================

/**
 * Generate preview HTML for display in browser
 */
export async function generatePreviewHtml(
  documentId: string,
  tenantId: string,
  options: {
    includeLetterhead?: boolean;
    showDraftWatermark?: boolean;
  } = {}
): Promise<string> {
  const { includeLetterhead = true, showDraftWatermark = true } = options;

  // Fetch document
  const document = await prisma.generatedDocument.findFirst({
    where: { id: documentId, tenantId, deletedAt: null },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  // Fetch letterhead if needed
  const letterhead = includeLetterhead && document.useLetterhead
    ? await getLetterhead(tenantId)
    : null;

  // Parse margins for future use (currently not used in preview)
  const _margins = letterhead?.pageMargins
    ? parseMargins(letterhead.pageMargins)
    : DEFAULT_MARGINS;
  void _margins; // Reserved for future use

  // Build preview HTML (includes header/footer inline)
  const headerHtml = buildHeaderHtml(letterhead);
  const footerHtml = buildFooterHtml(letterhead);

  // Sanitize content
  const window = new JSDOM('').window;
  const purify = DOMPurify(window);
  const sanitizedContent = purify.sanitize(document.content, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'ul', 'ol', 'li', 'a', 'span', 'div', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class', 'id'],
  });

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
        ${buildA4PrintCss(extractA4DocumentLayout(document.contentJson))}

        .preview-page {
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          margin: 20px auto;
          max-width: 210mm;
          min-height: 297mm;
          position: relative;
          padding: 20mm;
        }

        .preview-page .document-content {
          /* Content area within preview page */
        }

        .preview-header {
          padding: 15mm 20mm 5mm;
          border-bottom: 1px solid #eee;
          margin: -20mm -20mm 20mm -20mm;
        }

        .preview-footer {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 5mm 20mm 15mm;
          border-top: 1px solid #eee;
        }
      </style>
    </head>
    <body style="background: #f5f5f5; padding: 20px;">
      <div class="preview-page">
        ${watermark}
        ${headerHtml ? `<div class="preview-header">${headerHtml}</div>` : ''}
        <div class="document-content">
          ${sanitizedContent}
        </div>
        ${footerHtml ? `<div class="preview-footer">${footerHtml}</div>` : ''}
      </div>
    </body>
    </html>
  `;
}
