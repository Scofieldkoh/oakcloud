'use client';

import { useMemo, type CSSProperties } from 'react';
import DOMPurify from 'dompurify';
import { getA4SanitizerPolicy } from '@/lib/a4-content-policy';
import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
  type A4DocumentLayout,
} from '@/components/documents/a4-pagination/layout';
import { cn } from '@/lib/utils';

const POLICY = getA4SanitizerPolicy();

/**
 * Sanitize stored A4 HTML for static display with the canonical A4 content
 * policy: no scripts, forms, event handlers or editor-only attributes.
 */
export function sanitizeA4HistoricalHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: POLICY.allowedTags,
    ALLOWED_ATTR: POLICY.allowedAttributes,
    FORBID_TAGS: POLICY.rejectedTags,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

interface A4HistoricalViewerProps {
  html: string;
  layout?: A4DocumentLayout;
  className?: string;
}

/**
 * Read-only view of a document written with the retired A4 editor. It
 * renders the stored HTML on an A4-width sheet without mounting the editor,
 * so historical records stay readable after A4 authoring is removed.
 */
export function A4HistoricalViewer({
  html,
  layout = DEFAULT_A4_DOCUMENT_LAYOUT,
  className,
}: A4HistoricalViewerProps) {
  const content = useMemo(() => sanitizeA4HistoricalHtml(html), [html]);
  const { top, right, bottom, left } = layout.marginsMm;
  const sheetStyle: CSSProperties = {
    fontFamily: layout.fontFamily,
    fontSize: layout.fontSize,
    lineHeight: layout.lineHeight,
    padding: `${top}mm ${right}mm ${bottom}mm ${left}mm`,
    ['--a4-paragraph-spacing' as string]: layout.paragraphSpacing,
  };

  return (
    <div className={cn('h-full overflow-auto bg-background-tertiary p-4', className)}>
      <article
        aria-label="Document content (read-only)"
        className={cn(
          'a4-historical-sheet mx-auto w-full max-w-[210mm] min-h-[297mm] bg-white text-black shadow-sm',
          '[&_p]:mb-[var(--a4-paragraph-spacing)] [&_table]:w-full [&_table]:border-collapse',
          '[&_td]:border [&_td]:border-gray-300 [&_td]:p-1 [&_th]:border [&_th]:border-gray-300 [&_th]:p-1',
          '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:underline',
          '[&_[data-a4-break=page]]:my-6 [&_[data-a4-break=page]]:block [&_[data-a4-break=page]]:border-t [&_[data-a4-break=page]]:border-dashed [&_[data-a4-break=page]]:border-gray-300',
          '[&_.page-break]:my-6 [&_.page-break]:border-t [&_.page-break]:border-dashed [&_.page-break]:border-gray-300',
        )}
        style={sheetStyle}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
