import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
  type A4DocumentLayout,
} from '@/components/documents/a4-pagination/layout';
import {
  createA4MeasurementCache,
  createA4MeasurementCacheKey,
  createA4MeasurerLayout,
  createA4PageMeasurer,
  type A4MeasurerLayout,
} from '@/components/documents/a4-pagination/measure';
import {
  createA4FontRevision,
  waitForA4FontReadiness,
  type A4FontSetLike,
} from '@/components/documents/a4-pagination/a4-font-faces';
import {
  paginateFlowHtml,
  type HtmlMeasurer,
} from '@/components/documents/a4-pagination/engine';
import {
  hydrateFlowHtml,
  reassemblePageFragments,
  stripFlowMetadata,
} from '@/components/documents/a4-pagination/model';
import { paginateA4Document } from '@/components/documents/a4-pagination/paginate-in-browser.entry';

const originalScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollHeight',
);

function installSyntheticScrollHeight(multiplier = 1): void {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return ((this as HTMLElement).textContent?.length ?? 0) * multiplier;
    },
  });
}

afterEach(() => {
  if (originalScrollHeight) {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollHeight',
      originalScrollHeight,
    );
  } else {
    delete (HTMLElement.prototype as unknown as { scrollHeight?: unknown })
      .scrollHeight;
  }
});

function baseMeasurerLayout(overrides: Partial<A4MeasurerLayout> = {}): A4MeasurerLayout {
  return {
    contentWidthPx: 642,
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '11pt',
    lineHeight: '1.5',
    paragraphSpacing: '0.5em',
    layoutVersion: 1,
    layoutRevision: 4,
    fontRevision: createA4FontRevision('Arial, Helvetica, sans-serif', 7),
    ...overrides,
  };
}

function pageSignature(
  pages: readonly { content: string; hardBreakBefore: boolean; oversized?: boolean }[],
) {
  return pages.map((page) => {
    const root = document.createElement('div');
    root.innerHTML = stripFlowMetadata(page.content);
    return {
      text: root.textContent,
      hardBreakBefore: page.hardBreakBefore,
      oversized: page.oversized === true,
    };
  });
}

describe('A4 S3 measurement/font contract', () => {
  it('derives measurement geometry from legacy layout v1 without changing default margins', () => {
    const measured = createA4MeasurerLayout(DEFAULT_A4_DOCUMENT_LAYOUT);

    expect(DEFAULT_A4_DOCUMENT_LAYOUT).toEqual({
      version: 1,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '11pt',
      lineHeight: 1.5,
      paragraphSpacing: '0.5em',
      marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
    });
    expect(measured.layoutVersion).toBe(1);
    expect(measured.contentWidthPx).toBe(642);
    expect(measured.contentHeightPx).toBe(971);
  });

  it('includes content, width, layout and font revision in cache identity', () => {
    const base = baseMeasurerLayout();
    const key = createA4MeasurementCacheKey(base, '<p>Alpha</p>');

    expect(createA4MeasurementCacheKey(base, '<p>Beta</p>')).not.toBe(key);
    expect(createA4MeasurementCacheKey({ ...base, contentWidthPx: 640 }, '<p>Alpha</p>')).not.toBe(key);
    expect(createA4MeasurementCacheKey({ ...base, layoutRevision: 5 }, '<p>Alpha</p>')).not.toBe(key);
    expect(createA4MeasurementCacheKey({ ...base, paragraphSpacing: '1em' }, '<p>Alpha</p>')).not.toBe(key);
    expect(createA4MeasurementCacheKey({ ...base, fontRevision: 'font-revision-8' }, '<p>Alpha</p>')).not.toBe(key);
  });

  it('reuses unchanged measurements but invalidates them for a font revision change', () => {
    installSyntheticScrollHeight();
    const cache = createA4MeasurementCache(16);
    const first = createA4PageMeasurer(baseMeasurerLayout(), { cache });
    expect(first.measure('<p>Alpha</p>')).toBe(5);
    expect(first.measure('<p>Alpha</p>')).toBe(5);
    expect(first.getStats()).toMatchObject({
      requests: 2,
      domMeasurements: 1,
      cacheHits: 1,
    });
    first.dispose();

    const warm = createA4PageMeasurer(baseMeasurerLayout(), { cache });
    expect(warm.measure('<p>Alpha</p>')).toBe(5);
    expect(warm.getStats()).toMatchObject({ domMeasurements: 0, cacheHits: 1 });
    warm.dispose();

    const changedFont = createA4PageMeasurer(
      baseMeasurerLayout({ fontRevision: 'font-revision-8' }),
      { cache },
    );
    expect(changedFont.measure('<p>Alpha</p>')).toBe(5);
    expect(changedFont.getStats()).toMatchObject({ domMeasurements: 1, cacheHits: 0 });
    changedFont.dispose();
  });

  it('bounds shared measurement caches', () => {
    installSyntheticScrollHeight();
    const cache = createA4MeasurementCache(2);
    const measurer = createA4PageMeasurer(baseMeasurerLayout(), { cache });

    measurer.measure('<p>One</p>');
    measurer.measure('<p>Two</p>');
    measurer.measure('<p>Three</p>');

    expect(cache.size).toBe(2);
    measurer.dispose();
  });

  it('produces one deterministic readiness revision for cold and warm font loads', async () => {
    const requests: string[] = [];
    const fontSet: A4FontSetLike = {
      ready: Promise.resolve(),
      async load(font) {
        requests.push(font);
        return [];
      },
    };

    const cold = await waitForA4FontReadiness('Arial, Helvetica, sans-serif', {
      fontSet,
      runtimeRevision: 3,
    });
    const warm = await waitForA4FontReadiness('Arial, Helvetica, sans-serif', {
      fontSet,
      runtimeRevision: 3,
    });

    expect(cold.ready).toBe(true);
    expect(warm.ready).toBe(true);
    expect(warm.revision).toBe(cold.revision);
    expect(cold.requests).toHaveLength(4);
    expect(requests).toEqual([...cold.requests, ...warm.requests]);
    expect(
      createA4FontRevision('Arial, Helvetica, sans-serif', 4),
    ).not.toBe(cold.revision);
  });

  it('keeps warmed incremental measurement pagination equivalent to a fresh full pagination', () => {
    installSyntheticScrollHeight();
    const layout = baseMeasurerLayout();
    const cache = createA4MeasurementCache(512);
    const initial = Array.from(
      { length: 24 },
      (_, index) => `<p data-flow-id="p-${index + 1}">Paragraph ${index + 1} alpha beta</p>`,
    ).join('');
    const edited = initial.replace(
      'Paragraph 22 alpha beta',
      'Paragraph 22 alpha beta changed',
    );

    const warmup = createA4PageMeasurer(layout, { cache });
    paginateFlowHtml(hydrateFlowHtml(initial), warmup, 80);
    warmup.dispose();

    const incremental = createA4PageMeasurer(layout, { cache });
    const incrementalPages = paginateFlowHtml(
      hydrateFlowHtml(edited),
      incremental,
      80,
    );
    const incrementalStats = incremental.getStats();
    incremental.dispose();

    const full = createA4PageMeasurer(layout);
    const fullPages = paginateFlowHtml(hydrateFlowHtml(edited), full, 80);
    full.dispose();

    expect(pageSignature(incrementalPages)).toEqual(pageSignature(fullPages));
    expect(incrementalStats.cacheHits).toBeGreaterThan(0);
    expect(stripFlowMetadata(reassemblePageFragments(incrementalPages))).toBe(
      stripFlowMetadata(reassemblePageFragments(fullPages)),
    );
  });

  it('keeps browser/output entry breaks equivalent to direct full pagination', () => {
    installSyntheticScrollHeight();
    const documentLayout: A4DocumentLayout = {
      ...DEFAULT_A4_DOCUMENT_LAYOUT,
      marginsMm: { ...DEFAULT_A4_DOCUMENT_LAYOUT.marginsMm },
    };
    const layout = createA4MeasurerLayout(documentLayout);
    const input =
      '<h2>Heading</h2>' +
      '<ol start="5"><li><p>Alpha beta gamma</p></li><li><p>Delta epsilon</p></li></ol>' +
      '<div class="page-break" data-break-type="hard"></div>' +
      '<p>Final sentinel</p>';

    const directMeasurer = createA4PageMeasurer(layout);
    const direct = paginateFlowHtml(
      hydrateFlowHtml(input),
      directMeasurer,
      layout.contentHeightPx,
    );
    directMeasurer.dispose();

    const output = paginateA4Document(input, layout);
    expect(pageSignature(output)).toEqual(pageSignature(direct));
  });

  it('retains canonical order and numbering intent across different cold/warm metrics', () => {
    const input =
      '<ol start="5">' +
      '<li><p>Item five alpha beta gamma</p></li>' +
      '<li><p>Item six delta epsilon zeta</p></li>' +
      '<li><p>Item seven eta theta iota</p></li>' +
      '</ol>';
    const canonical = hydrateFlowHtml(input);
    const visibleLength = (html: string) => {
      const root = document.createElement('div');
      root.innerHTML = html;
      return root.textContent?.length ?? 0;
    };
    const warm: HtmlMeasurer = { measure: visibleLength };
    const cold: HtmlMeasurer = { measure: (html) => visibleLength(html) * 2 };

    const coldPages = paginateFlowHtml(canonical, cold, 36);
    const warmPages = paginateFlowHtml(canonical, warm, 36);
    const coldCanonical = stripFlowMetadata(reassemblePageFragments(coldPages));
    const warmCanonical = stripFlowMetadata(reassemblePageFragments(warmPages));

    expect(coldCanonical).toBe(warmCanonical);
    const root = document.createElement('div');
    root.innerHTML = coldCanonical;
    expect(root.querySelector('ol')?.getAttribute('start')).toBe('5');
    expect(root.textContent).toBe(
      'Item five alpha beta gammaItem six delta epsilon zetaItem seven eta theta iota',
    );
  });

  it('keeps oversized table caption, row and footer content present in one marked page', () => {
    const tableMeasurer: HtmlMeasurer = {
      measure(html) {
        return html.includes('<table') ? 200 : 0;
      },
    };
    const canonical = hydrateFlowHtml(
      '<table>' +
        '<caption>Caption sentinel</caption>' +
        '<tbody><tr><td>Oversized row sentinel</td></tr></tbody>' +
        '<tfoot><tr><td>Footer sentinel</td></tr></tfoot>' +
        '</table>',
    );

    const pages = paginateFlowHtml(canonical, tableMeasurer, 100);

    expect(pages).toHaveLength(1);
    expect(pages[0].oversized).toBe(true);
    expect(pages[0].content).toContain('data-flow-oversized="true"');
    expect(pages[0].content).toContain('Caption sentinel');
    expect(pages[0].content).toContain('Oversized row sentinel');
    expect(pages[0].content).toContain('Footer sentinel');
    const reassembled = stripFlowMetadata(reassemblePageFragments(pages));
    const root = document.createElement('div');
    root.innerHTML = reassembled;
    expect(root.querySelectorAll('caption')).toHaveLength(1);
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(root.querySelectorAll('tfoot tr')).toHaveLength(1);
  });
});
