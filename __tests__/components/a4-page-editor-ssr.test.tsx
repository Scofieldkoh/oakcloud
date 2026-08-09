import { renderToString } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { A4PageEditor } from '@/components/documents/a4-page-editor';

const BROWSER_GLOBALS = [
  'document',
  'window',
  'Node',
  'Range',
  'DOMParser',
] as const;

function renderWithoutBrowserGlobals(node: ReactElement): string {
  const saved = BROWSER_GLOBALS.map(
    (key) =>
      [key, (globalThis as Record<string, unknown>)[key]] as const,
  );
  try {
    for (const key of BROWSER_GLOBALS) {
      Reflect.deleteProperty(globalThis, key);
    }
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    return renderToString(node);
  } finally {
    for (const [key, value] of saved) {
      try {
        Object.defineProperty(globalThis, key, {
          value,
          configurable: true,
          writable: true,
        });
      } catch {
        (globalThis as Record<string, unknown>)[key] = value;
      }
    }
  }
}

function visibleText(markup: string): string {
  return markup.replace(/<!--[\s\S]*?-->/g, '');
}

describe('A4PageEditor server rendering', () => {
  it('server-renders a blank editor without installing browser globals', () => {
    const markup = renderWithoutBrowserGlobals(
      <A4PageEditor value="" placeholder="Start writing" />,
    );
    const text = visibleText(markup);

    expect(text).toContain('Document Editor');
    expect(text).toContain('Start writing');
    expect(text).toContain('Page 1 of 1');
    expect(text).not.toContain('[object Object]');
  });

  it('server-renders populated content without touching the DOM', () => {
    const markup = renderWithoutBrowserGlobals(
      <A4PageEditor value="<p>Persisted SSR text</p>" />,
    );
    const text = visibleText(markup);

    expect(text).toContain('Document Editor');
    expect(text).toContain('Page 1 of 1');
    expect(text).not.toContain('Persisted SSR text');
  });

  it('server-renders the read-only view with the View Only badge', () => {
    const markup = renderWithoutBrowserGlobals(
      <A4PageEditor value="<p>Read only SSR</p>" readOnly />,
    );
    const text = visibleText(markup);

    expect(text).toContain('View Only');
    expect(text).not.toContain('Persisted SSR text');
  });

  it('server-renders the preview-enabled editor state without a client fallback', () => {
    const markup = renderWithoutBrowserGlobals(
      <A4PageEditor
        value="<p>Edit SSR</p>"
        previewContent="<p>Preview content</p>"
        showPreviewToggle
      />,
    );
    const text = visibleText(markup);

    expect(text).toContain('Document Editor');
    expect(text).toContain('Preview');
    expect(text).toContain('Page 1 of 1');
  });
});
