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
  pageClose: vi.fn(),
  browserClose: vi.fn(),
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
    close: mocks.pageClose,
  };
  const browser = { newPage: mocks.newPage, close: mocks.browserClose };
  mocks.newPage.mockResolvedValue(page);
  mocks.launch.mockResolvedValue(browser);
  mocks.setContent.mockResolvedValue(undefined);
  mocks.addStyleTag.mockResolvedValue(undefined);
  mocks.addScriptTag.mockResolvedValue(undefined);
  mocks.pdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
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
});
