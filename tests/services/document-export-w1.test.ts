import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  failPagination: false,
  fragments: [] as Array<{ content: string; hardBreakBefore: boolean; oversized?: boolean }>,
  replacementHtml: '',
  launch: vi.fn(),
  newPage: vi.fn(),
  setContent: vi.fn(),
  addStyleTag: vi.fn(),
  addScriptTag: vi.fn(),
  evaluate: vi.fn(),
  pdf: vi.fn(),
  pageContent: vi.fn(),
  pageIsClosed: vi.fn(),
  pageClose: vi.fn(),
  browserClose: vi.fn(),
  generatedDocumentFindFirst: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    generatedDocument: {
      findFirst: mocks.generatedDocumentFindFirst,
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/chrome-executable', () => ({
  findChromePath: vi.fn(async () => '/synthetic/chrome'),
}));

vi.mock('puppeteer-core', () => ({
  default: {
    launch: mocks.launch,
  },
}));

import {
  ExportPaginationError,
  buildPDFHtml,
  exportToHTML,
  generatePDF,
} from '@/services/document-export.service';

const pagination = {
  canonicalHtml: '<p>FIRST-W1-SENTINEL</p><p>LAST-W1-SENTINEL</p>',
  layout: {
    contentWidthPx: 640,
    contentHeightPx: 900,
    fontFamily: 'Arial',
    fontSize: '12pt',
    lineHeight: '1.4',
    paragraphSpacing: '0.5em',
  },
};

const options = {
  format: 'A4' as const,
  orientation: 'portrait' as const,
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  headerHtml: '',
  footerHtml: '',
  pagination,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.failPagination = false;
  mocks.fragments = [
    { content: '<p>FIRST-W1-SENTINEL</p>', hardBreakBefore: false },
    { content: '<p>LAST-W1-SENTINEL</p>', hardBreakBefore: true },
  ];
  mocks.replacementHtml = '';

  const page = {
    setDefaultTimeout: vi.fn(),
    setDefaultNavigationTimeout: vi.fn(),
    setContent: mocks.setContent,
    addStyleTag: mocks.addStyleTag,
    addScriptTag: mocks.addScriptTag,
    evaluate: mocks.evaluate,
    pdf: mocks.pdf,
    content: mocks.pageContent,
    isClosed: mocks.pageIsClosed,
    close: mocks.pageClose,
  };
  const browser = { newPage: mocks.newPage, close: mocks.browserClose };
  mocks.newPage.mockResolvedValue(page);
  mocks.launch.mockResolvedValue(browser);
  mocks.setContent.mockResolvedValue(undefined);
  mocks.addStyleTag.mockResolvedValue(undefined);
  mocks.addScriptTag.mockResolvedValue(undefined);
  mocks.pdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  mocks.pageContent.mockImplementation(async () => (
    `<html><body><div id="a4-paginated-sections">${mocks.replacementHtml}</div></body></html>`
  ));
  mocks.pageIsClosed.mockReturnValue(false);
  mocks.pageClose.mockResolvedValue(undefined);
  mocks.browserClose.mockResolvedValue(undefined);
  mocks.evaluate.mockImplementation(async (_fn: unknown, arg?: unknown) => {
    if (arg === undefined) return undefined; // document.fonts.ready
    if (typeof arg === 'string') {
      mocks.replacementHtml = arg;
      return true;
    }
    if (mocks.failPagination) throw new Error('synthetic pagination failure');
    return mocks.fragments;
  });
});

describe('W1 PDF fail-closed pagination', () => {
  it('rejects a pagination failure explicitly and never calls page.pdf', async () => {
    mocks.failPagination = true;
    await expect(generatePDF('<html><body><div id="a4-paginated-sections"></div></body></html>', options))
      .rejects.toBeInstanceOf(ExportPaginationError);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.pageClose).toHaveBeenCalledOnce();
    expect(mocks.browserClose).toHaveBeenCalledOnce();
  });

  it('installs all page fragments before PDF creation and retains first/last sentinels', async () => {
    const buffer = await generatePDF(
      '<html><body><div id="a4-paginated-sections"></div></body></html>',
      options,
    );
    expect(buffer.length).toBeGreaterThan(0);
    expect(mocks.replacementHtml).toContain('FIRST-W1-SENTINEL');
    expect(mocks.replacementHtml).toContain('LAST-W1-SENTINEL');
    expect(mocks.replacementHtml.match(/<section class="print-page"/g)).toHaveLength(2);
    expect(mocks.pdf).toHaveBeenCalledOnce();
    expect(mocks.pageClose).toHaveBeenCalledOnce();
    expect(mocks.browserClose).toHaveBeenCalledOnce();
  });

  it('cleans up browser resources when cancellation is observed after pagination', async () => {
    const controller = new AbortController();
    mocks.evaluate.mockImplementation(async (_fn: unknown, arg?: unknown) => {
      if (arg === undefined) return undefined;
      if (typeof arg === 'string') {
        mocks.replacementHtml = arg;
        return true;
      }
      controller.abort();
      return mocks.fragments;
    });

    await expect(generatePDF(
      '<html><body><div id="a4-paginated-sections"></div></body></html>',
      { ...options, signal: controller.signal },
    )).rejects.toBeInstanceOf(ExportPaginationError);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.pageClose).toHaveBeenCalledOnce();
    expect(mocks.browserClose).toHaveBeenCalledOnce();
  });

  it('closes page and browser when page loading times out before pagination', async () => {
    mocks.setContent.mockRejectedValueOnce(new Error('synthetic navigation timeout'));

    await expect(generatePDF(
      '<html><body><div id="a4-paginated-sections"></div></body></html>',
      options,
    )).rejects.toThrow('synthetic navigation timeout');
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.pageClose).toHaveBeenCalledOnce();
    expect(mocks.browserClose).toHaveBeenCalledOnce();
  });

  it('applies the same shared C06 canonical sanitizer policy to HTML export and PDF preparation', async () => {
    const content = [
      '<blockquote><p>Quoted governance text</p></blockquote>',
      '<table><caption>Approval matrix</caption><tbody><tr><td>Body</td></tr></tbody><tfoot><tr><td>Footer</td></tr></tfoot></table>',
      '<ol start="5"><li>Fifth resolution</li></ol>',
      '<p><span data-field-reference="field-1">Synthetic field/reference</span></p>',
      '<p><span data-a4-break="page" data-source="fixture" data-whatever="nope" aria-label="client" onclick="alert(1)" data-flow-id="canonical-only"></span></p>',
      '<div class="page-break" data-break-type="hard"></div>',
    ].join('');
    mocks.generatedDocumentFindFirst.mockResolvedValueOnce({
      id: 'synthetic-document',
      title: 'Synthetic sanitizer parity',
      content,
      contentJson: null,
      status: 'FINALIZED',
      useLetterhead: false,
    });
    mocks.fragments = [{
      content,
      hardBreakBefore: false,
    }];

    const htmlExport = await exportToHTML({
      documentId: 'synthetic-document',
      tenantId: 'synthetic-tenant',
      includeStyles: false,
      includeSections: false,
    });
    const pdfPreparation = buildPDFHtml(
      {
        title: 'Synthetic sanitizer parity',
        status: 'FINALIZED',
        content,
        contentJson: null,
      },
      null,
      { top: 20, right: 20, bottom: 20, left: 20 },
    );

    for (const output of [htmlExport.html, pdfPreparation]) {
      expect(output).toContain('<blockquote>');
      expect(output).toContain('<caption>Approval matrix</caption>');
      expect(output).toContain('<tfoot>');
      expect(output).toContain('start="5"');
      expect(output).toContain('data-a4-break="page"');
      expect(output).toContain('data-break-type="hard"');
      expect(output).toContain('Synthetic field/reference');
      expect(output).not.toContain('data-source="fixture"');
      expect(output).not.toContain('data-whatever="nope"');
      expect(output).not.toContain('aria-label="client"');
      expect(output).not.toContain('onclick=');
      expect(output).not.toContain('data-flow-id="canonical-only"');
      expect(output).not.toContain('data-field-reference="field-1"');
    }
  });
});
