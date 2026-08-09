import { describe, expect, it } from 'vitest';
import {
  applyInlineFormat,
  normalizeFormattingSpans,
} from '@/components/documents/a4-pagination/formatting';
import { hydrateFlowHtml } from '@/components/documents/a4-pagination/model';

function flowIds(html: string): [string, string] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const ids = Array.from(
    body.querySelectorAll<HTMLElement>('[data-flow-id]'),
    (element) => element.dataset.flowId!,
  );
  return [ids[0], ids[1]];
}

function parseBody(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body;
}

describe('A4 inline formatting transactions', () => {
  it('colours text across two flow blocks without wrapping block elements', () => {
    const html = hydrateFlowHtml('<p>Alpha</p><p>Beta</p>');
    const [first, second] = flowIds(html);
    const result = applyInlineFormat(
      html,
      {
        anchor: { flowId: first, offset: 2 },
        focus: { flowId: second, offset: 2 },
        collapsed: false,
      },
      { color: '#ff0000' },
    );

    const body = parseBody(result.html);
    expect(body.querySelector('span > p')).toBeNull();
    expect(body.querySelectorAll('span[style*="color"]')).toHaveLength(2);
    expect(body.textContent).toBe('AlphaBeta');
  });

  it('merges adjacent spans with the same normalized style', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<p><span style="font-size: 14pt">A</span><span style="font-size:14pt">B</span></p>';
    normalizeFormattingSpans(root);
    expect(root.querySelectorAll('span')).toHaveLength(1);
    expect(root.textContent).toBe('AB');
  });
});
