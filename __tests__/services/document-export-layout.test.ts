import { describe, expect, it } from 'vitest';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';
import { A4_PAGINATION_BUNDLE } from '@/components/documents/a4-pagination/pagination-bundle.generated';
import {
  buildA4PrintCss,
  buildPDFHtml,
  buildPaginatedSectionsHtml,
} from '@/services/document-export.service';

describe('document export A4 layout', () => {
  it('prints four independent margins and saved line spacing', () => {
    const css = buildA4PrintCss({
      ...DEFAULT_A4_DOCUMENT_LAYOUT,
      version: 1,
      lineHeight: 1.8,
      paragraphSpacing: '8px',
      marginsMm: { top: 10, right: 15, bottom: 20, left: 25 },
    });

    expect(css).toContain('margin: 10mm 15mm 20mm 25mm');
    expect(css).toContain('line-height: 1.8');
    expect(css).toContain('margin: 0 0 8px 0');
  });

  it('prints normalized global typography without overriding inline styles', () => {
    const css = buildA4PrintCss({
      ...DEFAULT_A4_DOCUMENT_LAYOUT,
      fontFamily: 'Georgia, serif',
      fontSize: '14pt',
    });

    expect(css).toContain('font-family: Georgia, serif;');
    expect(css).toContain('font-size: 14pt;');
    expect(css).not.toContain('font-family: Georgia, serif !important');
  });

  it('builds one print-page section per page with a page number strip like the print frame', () => {
    const html = buildPDFHtml(
      {
        title: 'Test document',
        status: 'FINALIZED',
        content:
          '<p>Page one</p><div class="page-break"></div><p>Page two</p>',
        contentJson: undefined,
      },
      null,
      { top: 20, right: 20, bottom: 20, left: 20 },
    );

    expect(html.match(/<section class="print-page">/g)).toHaveLength(2);
    expect(html).toContain('<div class="print-page-number">1</div>');
    expect(html).toContain('<div class="print-page-number">2</div>');
    expect(html).toContain('margin: 20mm 20mm 14mm 20mm');
    expect(html).toContain('height: calc(calc(297mm - 20mm - 20mm) + 6mm);');
    expect(html).toContain('overflow: hidden;');
    expect(html).toContain('.print-page[data-oversized="true"] .content');
    expect(html).not.toContain('class="page-break"');
  });

  it('overlays a fixed DRAFT watermark without shifting page layout', () => {
    const html = buildPDFHtml(
      {
        title: 'Draft document',
        status: 'DRAFT',
        content: '<p>One</p>',
        contentJson: undefined,
      },
      null,
      { top: 20, right: 20, bottom: 20, left: 20 },
    );

    expect(html).toContain('class="draft-watermark"');
    expect(html).toContain('position: fixed');
  });

  it('renders engine fragments with continuation markers, oversized pages, and remove-page filtering', () => {
    const html = buildPaginatedSectionsHtml([
      { content: '<p>One</p>', hardBreakBefore: false },
      {
        content:
          '<ol><li data-flow-continuation-item="true"><p>Two</p></li></ol>',
        hardBreakBefore: false,
        oversized: true,
      },
      { content: '<p>[Remove Page]</p>', hardBreakBefore: false },
    ]);

    expect(html.match(/<section class="print-page"/g)).toHaveLength(2);
    expect(html).toContain('data-oversized="true"');
    expect(html).toContain('data-flow-continuation-item="true"');
    expect(html).toContain('<div class="print-page-number">1</div>');
    expect(html).toContain('<div class="print-page-number">2</div>');
    expect(html).not.toContain('[Remove Page]');
  });

  it('ships the bundled pagination engine for in-browser export pagination', () => {
    expect(A4_PAGINATION_BUNDLE.length).toBeGreaterThan(1000);
    expect(A4_PAGINATION_BUNDLE).toContain('paginateA4Document');
  });

  it('embeds metric-compatible font data so export metrics match the editor', () => {
    const html = buildPDFHtml(
      {
        title: 'Font test',
        status: 'FINALIZED',
        content: '<p>One</p>',
        contentJson: undefined,
      },
      null,
      { top: 20, right: 20, bottom: 20, left: 20 },
    );

    expect(html).toContain('data:font/woff2;base64,');
    expect(html).toContain("font-family: 'Arial';");
    expect(html).not.toContain("/fonts/arimo");
  });
});
