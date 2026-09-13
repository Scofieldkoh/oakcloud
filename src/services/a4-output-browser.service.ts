import type { Page } from 'puppeteer-core';

import { buildA4PageContentStyles } from '@/components/documents/a4-pagination/a4-page-content-css';
import { A4_PAGINATION_BUNDLE } from '@/components/documents/a4-pagination/pagination-bundle.generated';
import { findChromePath } from '@/lib/chrome-executable';
import {
  assembleA4OutputPages,
  createA4OutputPreparationSession,
  type A4OutputPageAssembly,
  type A4OutputPageFragment,
  type A4OutputPreparationSession,
} from '@/lib/document-editor/a4-output-preparation';
import { sanitizeCanonicalA4Html } from '@/services/a4-content-sanitizer.service';

export interface A4BrowserPaginationLayout {
  contentWidthPx: number;
  contentHeightPx: number;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  paragraphSpacing: string;
}

export interface PaginateA4BrowserPageOptions {
  page: Page;
  canonicalHtml: string;
  layout: A4BrowserPaginationLayout;
  session: A4OutputPreparationSession;
  targetElementId?: string;
}

export interface A4ServerPageChrome {
  headerHtml?: string;
  footerHtml?: string;
}

export interface RenderPaginatedA4HtmlOptions {
  html: string;
  canonicalHtml: string;
  layout: A4BrowserPaginationLayout;
  pageChrome?: A4ServerPageChrome;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function validateFragments(value: unknown): A4OutputPageFragment[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Pagination returned no printable fragments');
  }
  return value.map((fragment) => {
    if (!fragment || typeof fragment !== 'object') {
      throw new Error('Pagination returned an invalid fragment');
    }
    const record = fragment as Record<string, unknown>;
    if (typeof record.content !== 'string' || typeof record.hardBreakBefore !== 'boolean') {
      throw new Error('Pagination returned an invalid fragment');
    }
    return {
      content: record.content,
      hardBreakBefore: record.hardBreakBefore,
      ...(typeof record.oversized === 'boolean' ? { oversized: record.oversized } : {}),
    };
  });
}

/**
 * Shared Chromium paginator/installer for W3 server PDF and HTML output.
 * S owns pagination semantics and the checked generated bundle; W owns only
 * readiness, validation and installation into the output surface.
 */
export async function paginateA4BrowserPage(
  options: PaginateA4BrowserPageOptions,
): Promise<A4OutputPageAssembly> {
  const targetElementId = options.targetElementId ?? 'a4-paginated-sections';
  options.session.assertActive();

  await options.page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  options.session.markFontsReady();
  options.session.assertActive();

  await options.page.addStyleTag({
    content: buildA4PageContentStyles(options.layout.paragraphSpacing),
  });
  await options.page.addScriptTag({ content: A4_PAGINATION_BUNDLE });
  options.session.assertActive();

  const rawFragments = await options.page.evaluate((payload) => {
    const globalScope = window as unknown as {
      A4Pagination?: {
        paginateA4Document: (input: string, layout: unknown) => unknown;
      };
    };
    const paginate = globalScope.A4Pagination?.paginateA4Document;
    if (!paginate) throw new Error('Pagination bundle did not expose paginateA4Document');
    return paginate(payload.canonicalHtml, payload.layout);
  }, {
    canonicalHtml: options.canonicalHtml,
    layout: options.layout,
  } satisfies { canonicalHtml: string; layout: unknown });

  const fragments = validateFragments(rawFragments);
  const assembly = assembleA4OutputPages(fragments, {
    sanitizeFragment: (html) => sanitizeCanonicalA4Html(html, { projection: true }),
  });
  options.session.markPaginationReady();
  options.session.assertActive();

  const installed = await options.page.evaluate(({ id, replacement }) => {
    const container = document.getElementById(id);
    if (!container) return false;
    container.innerHTML = replacement;
    return true;
  }, { id: targetElementId, replacement: assembly.html });
  if (!installed) throw new Error('A4 pagination target was unavailable');

  options.session.markInstalled();
  options.session.assertReady();
  return assembly;
}

async function installServerPageChrome(page: Page, chrome: A4ServerPageChrome): Promise<void> {
  if (!chrome.headerHtml && !chrome.footerHtml) return;
  await page.evaluate(({ headerHtml, footerHtml }) => {
    document.querySelectorAll<HTMLElement>('.print-page').forEach((printPage) => {
      printPage.style.position = 'relative';
      if (headerHtml) {
        const header = document.createElement('div');
        header.className = 'a4-output-page-header';
        header.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:4;pointer-events:none;';
        header.innerHTML = headerHtml;
        printPage.prepend(header);
      }
      if (footerHtml) {
        const footer = document.createElement('div');
        footer.className = 'a4-output-page-footer';
        footer.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:4;pointer-events:none;';
        footer.innerHTML = footerHtml;
        printPage.append(footer);
      }
    });
  }, {
    headerHtml: chrome.headerHtml ?? '',
    footerHtml: chrome.footerHtml ?? '',
  });
}

/**
 * Server HTML uses the same real-browser font/pagination/install path as PDF.
 * No fixed-height or JSDOM fallback is accepted as successful pagination.
 * Page chrome is supplied only by server-owned builders; this API exposes no
 * client-controlled trusted-rich promotion switch.
 */
export async function renderPaginatedA4Html(
  options: RenderPaginatedA4HtmlOptions,
): Promise<{ html: string; assembly: A4OutputPageAssembly }> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const session = createA4OutputPreparationSession('html', options.signal);
  const puppeteer = await import('puppeteer-core');
  const executablePath = await findChromePath();
  session.assertActive();
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
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    session.assertActive();
    await page.setContent(options.html, { waitUntil: 'networkidle0', timeout: timeoutMs });
    const assembly = await paginateA4BrowserPage({
      page,
      canonicalHtml: options.canonicalHtml,
      layout: options.layout,
      session,
    });
    await installServerPageChrome(page, options.pageChrome ?? {});
    session.assertReady();
    const html = await page.content();
    return { html, assembly };
  } finally {
    await session.dispose();
  }
}
