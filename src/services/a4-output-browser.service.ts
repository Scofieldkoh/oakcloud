import type { Page } from 'puppeteer-core';

import { buildA4PageContentStyles } from '@/components/documents/a4-pagination/a4-page-content-css';
import { A4_PAGINATION_BUNDLE } from '@/components/documents/a4-pagination/pagination-bundle.generated';
import {
  assembleA4OutputPages,
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
