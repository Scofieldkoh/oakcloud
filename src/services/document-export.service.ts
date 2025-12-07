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
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

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

// Default page margins in mm
const DEFAULT_MARGINS: PageMargins = {
  top: 25,
  right: 20,
  bottom: 25,
  left: 20,
};

// ============================================================================
// Document Styles
// ============================================================================

const DOCUMENT_STYLES = `
  @page {
    size: A4;
    margin: 0;
  }

  * {
    box-sizing: border-box;
  }

  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #000;
    margin: 0;
    padding: 0;
    background: #fff;
  }

  .document-content {
    padding: 25mm 20mm;
  }

  h1 {
    font-size: 18pt;
    font-weight: bold;
    margin: 1em 0 0.5em;
    color: #000;
    page-break-after: avoid;
  }

  h2 {
    font-size: 14pt;
    font-weight: bold;
    margin: 0.8em 0 0.4em;
    color: #000;
    page-break-after: avoid;
  }

  h3 {
    font-size: 12pt;
    font-weight: bold;
    margin: 0.6em 0 0.3em;
    color: #000;
    page-break-after: avoid;
  }

  p {
    margin: 0.5em 0;
    text-align: justify;
  }

  ul, ol {
    margin: 0.5em 0;
    padding-left: 2em;
  }

  li {
    margin: 0.25em 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    page-break-inside: avoid;
  }

  th, td {
    border: 1px solid #000;
    padding: 8px;
    text-align: left;
  }

  th {
    background-color: #f0f0f0;
    font-weight: bold;
  }

  .page-break {
    page-break-after: always;
    height: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  .signature-block {
    margin: 2em 0;
    page-break-inside: avoid;
  }

  .signature-line {
    border-top: 1px solid #000;
    width: 200px;
    margin: 2em 0 0.5em;
  }

  /* Draft watermark */
  .draft-watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 100pt;
    color: rgba(200, 200, 200, 0.3);
    font-weight: bold;
    z-index: 1000;
    pointer-events: none;
  }

  @media print {
    .page-break {
      page-break-after: always;
    }

    .draft-watermark {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

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

  // Generate PDF
  const pdfBuffer = await generatePDF(htmlContent, {
    format,
    orientation,
    margins,
    headerHtml: buildHeaderHtml(letterhead),
    footerHtml: buildFooterHtml(letterhead),
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

/**
 * Generate PDF using Puppeteer
 */
async function generatePDF(
  html: string,
  options: {
    format: 'A4' | 'Letter';
    orientation: 'portrait' | 'landscape';
    margins: PageMargins;
    headerHtml: string;
    footerHtml: string;
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

    const pdfBuffer = await page.pdf({
      format: options.format,
      landscape: options.orientation === 'landscape',
      printBackground: true,
      displayHeaderFooter: !!(options.headerHtml || options.footerHtml),
      headerTemplate: options.headerHtml || '<div></div>',
      footerTemplate: options.footerHtml || '<div></div>',
      margin: {
        top: `${options.margins.top}mm`,
        right: `${options.margins.right}mm`,
        bottom: `${options.margins.bottom}mm`,
        left: `${options.margins.left}mm`,
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
async function findChromePath(): Promise<string> {
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
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
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
      ${includeStyles ? `<style>${DOCUMENT_STYLES}</style>` : ''}
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
    styles: includeStyles ? DOCUMENT_STYLES : '',
    sections,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build complete HTML for PDF generation
 */
function buildPDFHtml(
  document: {
    title: string;
    content: string;
    status: string;
  },
  letterhead: Awaited<ReturnType<typeof getLetterhead>>,
  margins: PageMargins
): string {
  // Sanitize content using JSDOM
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

  // Add draft watermark if not finalized
  const watermark = document.status !== 'FINALIZED'
    ? '<div class="draft-watermark">DRAFT</div>'
    : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(document.title)}</title>
      <style>${DOCUMENT_STYLES}</style>
    </head>
    <body>
      ${watermark}
      <div class="document-content">
        ${sanitizedContent}
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

  const margins = letterhead?.pageMargins
    ? parseMargins(letterhead.pageMargins)
    : DEFAULT_MARGINS;

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
        ${DOCUMENT_STYLES}

        .preview-page {
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          margin: 20px auto;
          max-width: 210mm;
          min-height: 297mm;
          position: relative;
        }

        .preview-header {
          padding: 15mm 20mm 5mm;
          border-bottom: 1px solid #eee;
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
