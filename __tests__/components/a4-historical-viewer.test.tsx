import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  A4HistoricalViewer,
  sanitizeA4HistoricalHtml,
} from '@/components/documents/a4-historical-viewer';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';

describe('A4HistoricalViewer', () => {
  it('shows stored A4 content read-only without mounting the editor', () => {
    const { container } = render(
      <A4HistoricalViewer
        html={'<h2>Engagement letter</h2><p>Signed terms</p><span data-a4-break="page"></span><table><tr><td>Fee</td></tr></table>'}
        layout={{ ...DEFAULT_A4_DOCUMENT_LAYOUT, fontSize: '12pt', marginsMm: { top: 25, right: 20, bottom: 25, left: 30 } }}
      />,
    );

    const sheet = screen.getByRole('article', { name: 'Document content (read-only)' });
    expect(screen.getByText('Engagement letter')).toBeInTheDocument();
    expect(sheet).not.toHaveAttribute('contenteditable');
    expect(container.querySelector('[contenteditable]')).toBeNull();
    expect(sheet.querySelector('[data-a4-break="page"]')).not.toBeNull();
    expect(sheet.style.fontSize).toBe('12pt');
    expect(sheet.style.padding).toBe('25mm 20mm 25mm 30mm');
  });

  it('removes scripts, event handlers, forms and unsafe links', () => {
    const clean = sanitizeA4HistoricalHtml(
      '<p onclick="alert(1)">Text</p><script>alert(1)</script><form><input></form>'
      + '<a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a>'
      + '<p data-flow-id="x">Flow</p>',
    );

    expect(clean).toContain('<p>Text</p>');
    expect(clean).not.toMatch(/onclick|<script|<form|<input|javascript:|data-flow-id/);
    expect(clean).toContain('href="https://example.com"');
  });
});
