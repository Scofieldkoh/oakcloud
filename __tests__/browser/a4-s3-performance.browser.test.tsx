import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  A4PageEditor,
  type A4PageEditorRef,
} from '@/components/documents/a4-page-editor';
import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
} from '@/components/documents/a4-pagination/layout';
import {
  createA4MeasurerLayout,
} from '@/components/documents/a4-pagination/measure';
import {
  waitForA4FontReadiness,
} from '@/components/documents/a4-pagination/a4-font-faces';
import {
  paginateA4Document,
} from '@/components/documents/a4-pagination/paginate-in-browser.entry';

interface PerformanceTrace {
  pages: number;
  canonicalBytes: number;
  paginationMs: number;
  inputToPaintMs: number;
  renderedPages: number;
  fontRevision: string;
}

function representativeFixture(pageCount: number): string {
  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const body = Array.from(
      { length: 3 },
      (_, paragraphIndex) =>
        `<p>S3 page ${pageNumber} paragraph ${paragraphIndex + 1} ` +
        `${'representative A4 pagination text '.repeat(4)}</p>`,
    ).join('');
    const breakHtml = pageIndex === 0
      ? ''
      : '<div class="page-break" data-break-type="hard"></div>';
    return `${breakHtml}<h2>S3 page ${pageNumber}</h2>${body}`;
  }).join('');
}

async function waitForEditorPaint(host: HTMLElement): Promise<HTMLElement> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    );
    if (surface?.getAttribute('aria-busy') === 'false') return surface;
  }
  throw new Error('A4 editor never reached final painted idle state');
}

describe('A4 S3 representative performance traces', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.height = '1400px';
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('records separate pagination and canonical input-to-paint traces for 1/10/30 pages', async () => {
    const layout = createA4MeasurerLayout(DEFAULT_A4_DOCUMENT_LAYOUT);
    const font = await waitForA4FontReadiness(
      DEFAULT_A4_DOCUMENT_LAYOUT.fontFamily,
      { runtimeRevision: 0 },
    );
    const traces: PerformanceTrace[] = [];

    for (const pageCount of [1, 10, 30]) {
      const canonical = representativeFixture(pageCount);

      const paginationStart = performance.now();
      const fragments = paginateA4Document(canonical, {
        ...layout,
        fontRevision: font.revision,
      });
      const paginationMs = performance.now() - paginationStart;
      expect(fragments).toHaveLength(pageCount);
      expect(fragments.at(-1)?.content).toContain(`S3 page ${pageCount}`);

      const editorRef = createRef<A4PageEditorRef>();
      const paintStart = performance.now();
      await act(async () => {
        root.render(
          <A4PageEditor
            key={`s3-${pageCount}`}
            ref={editorRef}
            sessionKey={`s3-performance:${pageCount}`}
            value={canonical}
          />,
        );
      });
      await waitForEditorPaint(host);
      const inputToPaintMs = performance.now() - paintStart;
      const renderedPages = host.querySelectorAll(
        '[data-testid^="a4-page-content-"]',
      ).length;
      expect(renderedPages).toBe(pageCount);
      expect(editorRef.current?.getContent()).toContain(`S3 page ${pageCount}`);

      traces.push({
        pages: pageCount,
        canonicalBytes: new TextEncoder().encode(canonical).byteLength,
        paginationMs,
        inputToPaintMs,
        renderedPages,
        fontRevision: font.revision,
      });
    }

    expect(traces.map((trace) => trace.pages)).toEqual([1, 10, 30]);
    expect(
      traces.every(
        (trace) =>
          Number.isFinite(trace.paginationMs) &&
          trace.paginationMs >= 0 &&
          Number.isFinite(trace.inputToPaintMs) &&
          trace.inputToPaintMs >= 0,
      ),
    ).toBe(true);

    // Machine-readable evidence for the S3 handoff. These are measurements,
    // not pass/fail budgets; regressions are judged together with equivalence.
    console.info('A4_S3_PERFORMANCE_TRACE', JSON.stringify({
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      layout,
      traces,
    }));
  }, 120_000);
});
