import type { HtmlMeasurer } from './engine';
import { createA4FontRevision } from './a4-font-faces';
import { createA4PageLayout } from './a4-page-layout';
import {
  normalizeA4DocumentLayout,
  type A4DocumentLayout,
} from './layout';

export interface A4MeasurerLayout {
  contentWidthPx: number;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  paragraphSpacing: string;
  /** Canonical layout format revision; legacy A4 remains version 1. */
  layoutVersion?: 1;
  /** Runtime layout generation supplied by CORE when available. */
  layoutRevision?: string | number;
  /** Versioned font identity; defaults to the shared font manifest revision. */
  fontRevision?: string;
}

export interface A4MeasurementCache {
  readonly size: number;
  get(key: string): number | undefined;
  set(key: string, value: number): void;
  clear(): void;
}

export interface A4PageMeasurerStats {
  requests: number;
  domMeasurements: number;
  cacheHits: number;
  cacheEntries: number;
}

export interface A4PageMeasurer extends HtmlMeasurer {
  dispose(): void;
  clearCache(): void;
  getStats(): A4PageMeasurerStats;
}

export interface A4PageMeasurerOptions {
  /** Browser/server sanitizer adapter. S3 owns metrics, not C06 sanitization. */
  prepareHtml?: (html: string) => string;
  /** Reuse this cache across incremental pagination runs. */
  cache?: A4MeasurementCache;
  maxCacheEntries?: number;
}

class BoundedA4MeasurementCache implements A4MeasurementCache {
  private readonly values = new Map<string, number>();

  constructor(private readonly maxEntries: number) {}

  get size(): number {
    return this.values.size;
  }

  get(key: string): number | undefined {
    const value = this.values.get(key);
    if (value === undefined) return undefined;
    // Refresh recency for bounded LRU eviction.
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }

  set(key: string, value: number): void {
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
  }

  clear(): void {
    this.values.clear();
  }
}

export function createA4MeasurementCache(
  maxEntries = 512,
): A4MeasurementCache {
  return new BoundedA4MeasurementCache(Math.max(1, maxEntries));
}

/**
 * One canonical adapter from persisted A4 layout to measurement geometry.
 * CORE can pass its layout/font revision counters; output callers use the same
 * geometry with revision zero and the shared font-asset revision.
 */
export function createA4MeasurerLayout(
  layout: A4DocumentLayout,
  revisions: {
    layoutRevision?: string | number;
    fontRevision?: string | number;
  } = {},
): A4MeasurerLayout & { contentHeightPx: number } {
  const normalized = normalizeA4DocumentLayout(layout);
  const page = createA4PageLayout(normalized.marginsMm);
  return {
    contentWidthPx: page.contentWidthPx,
    contentHeightPx: page.contentHeightPx,
    fontFamily: normalized.fontFamily,
    fontSize: normalized.fontSize,
    lineHeight: String(normalized.lineHeight),
    paragraphSpacing: normalized.paragraphSpacing,
    layoutVersion: normalized.version,
    layoutRevision: revisions.layoutRevision ?? 0,
    fontRevision: createA4FontRevision(
      normalized.fontFamily,
      revisions.fontRevision ?? 0,
    ),
  };
}

function resolvedFontRevision(layout: A4MeasurerLayout): string {
  return layout.fontRevision ?? createA4FontRevision(layout.fontFamily);
}

/**
 * Cache identity is intentionally complete: prepared content + usable width +
 * every layout value that affects text metrics + the explicit font revision.
 */
export function createA4MeasurementCacheKey(
  layout: A4MeasurerLayout,
  preparedHtml: string,
): string {
  return JSON.stringify([
    preparedHtml,
    layout.contentWidthPx,
    layout.layoutVersion ?? 1,
    layout.layoutRevision ?? 0,
    layout.fontFamily,
    layout.fontSize,
    layout.lineHeight,
    layout.paragraphSpacing,
    resolvedFontRevision(layout),
  ]);
}

/**
 * Measures content height exactly like the editor's pagination measurer.
 * The `.a4-page-content` stylesheet must be present in the document for
 * paragraph/list/table metrics to match (see `buildA4PageContentStyles`).
 *
 * Callers that repaginate after a small edit should reuse `options.cache`.
 * Complete cache keys make unchanged-node measurements reusable while width,
 * layout or font changes automatically miss and remeasure.
 */
export function createA4PageMeasurer(
  layout: A4MeasurerLayout,
  options: A4PageMeasurerOptions = {},
): A4PageMeasurer {
  const element = document.createElement('div');
  element.className = 'a4-page-content';
  Object.assign(element.style, {
    position: 'fixed',
    visibility: 'hidden',
    pointerEvents: 'none',
    contain: 'layout style',
    top: '-100000px',
    left: '0',
    width: `${layout.contentWidthPx}px`,
    height: 'auto',
    minHeight: '0',
    overflow: 'visible',
    fontFamily: layout.fontFamily,
    fontSize: layout.fontSize,
    lineHeight: layout.lineHeight,
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  });
  element.style.setProperty('--a4-paragraph-spacing', layout.paragraphSpacing);
  document.body.appendChild(element);

  const ownsCache = !options.cache;
  const cache = options.cache ?? createA4MeasurementCache(options.maxCacheEntries);
  const prepareHtml = options.prepareHtml ?? ((html: string) => html);
  let requests = 0;
  let domMeasurements = 0;
  let cacheHits = 0;

  return {
    measure(html: string) {
      requests += 1;
      const preparedHtml = prepareHtml(html);
      const key = createA4MeasurementCacheKey(layout, preparedHtml);
      const cached = cache.get(key);
      if (cached !== undefined) {
        cacheHits += 1;
        return cached;
      }

      element.innerHTML = preparedHtml;
      const height = element.scrollHeight;
      domMeasurements += 1;
      cache.set(key, height);
      return height;
    },
    clearCache() {
      cache.clear();
    },
    getStats() {
      return {
        requests,
        domMeasurements,
        cacheHits,
        cacheEntries: cache.size,
      };
    },
    dispose() {
      element.remove();
      if (ownsCache) cache.clear();
    },
  };
}
