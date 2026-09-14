export type A4OutputTarget = 'local-print' | 'pdf' | 'html';

export type A4OutputReadinessState = 'pending' | 'ready' | 'failed';

export interface A4OutputReadinessSnapshot {
  target: A4OutputTarget;
  canonical: 'ready';
  fonts: A4OutputReadinessState;
  pagination: A4OutputReadinessState;
  installed: A4OutputReadinessState;
  cancelled: boolean;
  disposed: boolean;
  failure: string | null;
}

export interface A4OutputPageFragment {
  content: string;
  hardBreakBefore: boolean;
  oversized?: boolean;
}

export interface A4OutputPageAssemblyOptions {
  /**
   * Canonical C06 sanitizer owned by the caller's runtime. Server output uses
   * the server DOMPurify adapter; local print uses the browser/editor adapter.
   * Keeping this mandatory prevents the shared assembler from becoming a raw
   * HTML trust bypass.
   */
  sanitizeFragment: (html: string) => string;
  includePageNumbers?: boolean;
}

export interface A4OutputPageAssembly {
  html: string;
  pageCount: number;
  pages: readonly A4OutputPageFragment[];
}

export interface A4OutputPreparationSession {
  readonly target: A4OutputTarget;
  readonly signal: AbortSignal;
  snapshot(): A4OutputReadinessSnapshot;
  markFontsReady(): void;
  markPaginationReady(): void;
  markInstalled(): void;
  fail(reason: string): void;
  cancel(reason?: string): void;
  assertActive(): void;
  assertReady(): void;
  addCleanup(cleanup: () => void | Promise<void>): void;
  dispose(): Promise<void>;
}

function isRemovePageMarker(content: string): boolean {
  const textContent = (content || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return /^\[Remove\s*Page\]$/i.test(textContent);
}

/**
 * Shared W3 page assembly for PDF, HTML and CORE local-print consumption.
 * Pagination remains an S producer; this function only turns verified S page
 * fragments into one output-neutral page surface without changing semantics.
 */
export function assembleA4OutputPages(
  fragments: readonly A4OutputPageFragment[],
  options: A4OutputPageAssemblyOptions,
): A4OutputPageAssembly {
  const pages = fragments.filter((fragment) => !isRemovePageMarker(fragment.content));
  if (pages.length === 0) throw new Error('A4 output contains no printable pages');

  const includePageNumbers = options.includePageNumbers ?? true;
  const html = pages.map((fragment, index) => {
    const content = options.sanitizeFragment(fragment.content) || '&nbsp;';
    const oversized = fragment.oversized ? ' data-oversized="true"' : '';
    const hardBreak = fragment.hardBreakBefore ? ' data-hard-break-before="true"' : '';
    const pageNumber = includePageNumbers
      ? `<div class="print-page-number">${index + 1}</div>`
      : '';
    return `<section class="print-page"${oversized}${hardBreak}><div class="content">${content}</div>${pageNumber}</section>`;
  }).join('');

  return { html, pageCount: pages.length, pages };
}

/**
 * Lifecycle producer shared by browser local print and server browser output.
 * Readiness is explicit: callers may not report success until fonts,
 * pagination and installation are all ready. Cleanup runs LIFO on every exit;
 * cancellation is an AbortSignal rather than an untracked boolean.
 */
export function createA4OutputPreparationSession(
  target: A4OutputTarget,
  parentSignal?: AbortSignal,
): A4OutputPreparationSession {
  const controller = new AbortController();
  const cleanups: Array<() => void | Promise<void>> = [];
  let fonts: A4OutputReadinessState = 'pending';
  let pagination: A4OutputReadinessState = 'pending';
  let installed: A4OutputReadinessState = 'pending';
  let failure: string | null = null;
  let disposed = false;

  const onParentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) onParentAbort();
    else parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  const snapshot = (): A4OutputReadinessSnapshot => ({
    target,
    canonical: 'ready',
    fonts,
    pagination,
    installed,
    cancelled: controller.signal.aborted,
    disposed,
    failure,
  });

  const assertActive = () => {
    if (disposed) throw new Error('A4 output preparation session is disposed');
    if (controller.signal.aborted) throw new Error('A4 output preparation was cancelled');
    if (failure) throw new Error(failure);
  };

  return {
    target,
    signal: controller.signal,
    snapshot,
    markFontsReady() {
      assertActive();
      fonts = 'ready';
    },
    markPaginationReady() {
      assertActive();
      pagination = 'ready';
    },
    markInstalled() {
      assertActive();
      installed = 'ready';
    },
    fail(reason) {
      if (disposed) return;
      failure = reason || 'A4 output preparation failed';
      if (fonts === 'pending') fonts = 'failed';
      if (pagination === 'pending') pagination = 'failed';
      if (installed === 'pending') installed = 'failed';
    },
    cancel(reason) {
      if (!controller.signal.aborted) controller.abort(reason);
    },
    assertActive,
    assertReady() {
      assertActive();
      if (fonts !== 'ready' || pagination !== 'ready' || installed !== 'ready') {
        throw new Error('A4 output preparation is not ready');
      }
    },
    addCleanup(cleanup) {
      assertActive();
      cleanups.push(cleanup);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
      const errors: unknown[] = [];
      for (const cleanup of [...cleanups].reverse()) {
        try {
          await cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      cleanups.length = 0;
      if (errors.length > 0) {
        throw new AggregateError(errors, 'A4 output cleanup failed');
      }
    },
  };
}
