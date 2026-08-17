import { describe, expect, it } from 'vitest';
import { buildA4PrintCss } from '@/components/documents/a4-print-styles';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';

describe('shared A4 print styles', () => {
  it('does not add print-only spacing to br elements', () => {
    const css = buildA4PrintCss(DEFAULT_A4_DOCUMENT_LAYOUT);
    expect(css).not.toContain('br { display: block');
    expect(css).toContain('br { margin: 0; }');
  });

  it('does not add print-only height to empty blocks', () => {
    const css = buildA4PrintCss(DEFAULT_A4_DOCUMENT_LAYOUT);
    expect(css).not.toContain('p:empty');
    expect(css).not.toContain('div:empty');
    expect(css).toContain('br { margin: 0; }');
  });

  it('uses the saved margins, typography, and paragraph spacing', () => {
    const css = buildA4PrintCss({
      ...DEFAULT_A4_DOCUMENT_LAYOUT,
      fontFamily: 'Georgia, serif',
      fontSize: '14pt',
      lineHeight: 1.8,
      paragraphSpacing: '8px',
      marginsMm: { top: 10, right: 15, bottom: 20, left: 25 },
    });
    expect(css).toContain('margin: 10mm 15mm 20mm 25mm');
    expect(css).toContain('font-family: Georgia, serif');
    expect(css).toContain('font-size: 14pt');
    expect(css).toContain('line-height: 1.8');
    expect(css).toContain('margin: 0 0 8px 0');
  });

  it('places print page numbers inside the effective bottom margin', () => {
    const tenMillimeter = buildA4PrintCss({
      ...DEFAULT_A4_DOCUMENT_LAYOUT,
      marginsMm: { top: 20, right: 20, bottom: 10, left: 20 },
    });
    const twentyMillimeter = buildA4PrintCss({
      ...DEFAULT_A4_DOCUMENT_LAYOUT,
      marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
    });
    expect(tenMillimeter).toContain('bottom: calc(-1 * 10mm / 2)');
    expect(twentyMillimeter).toContain('bottom: calc(-1 * 20mm / 2)');
  });

  it('renders ordered lists with flush CSS counter markers', () => {
    const css = buildA4PrintCss(DEFAULT_A4_DOCUMENT_LAYOUT);
    expect(css).toContain('ul, ol { margin: 0 0 0.5em 0; padding-left: 0; }');
    expect(css).toContain('ul { list-style: none; }');
    expect(css).toContain(
      'ol {\n      list-style: none;\n      counter-reset: item var(--list-start, 0);\n    }',
    );
    expect(css).toContain('ol > li { counter-increment: item; }');
    expect(css).toContain(
      'ol > li::before {\n      content: counter(item) ". ";\n      position: absolute;\n      left: 0;\n      top: 0;\n    }',
    );
    expect(css).toContain(
      'ol.list-bold-numbers > li::before { font-weight: 700; }',
    );
    expect(css).toContain(
      'ol.list-alpha > li::before { content: counter(item, lower-alpha) ") "; }',
    );
    expect(css).toContain('ul > li, ol > li {');
    expect(css).toContain('position: relative;');
    expect(css).toContain('ol > li { padding-left: 5ch; }');
    expect(css).toContain('ol ol > li { padding-left: 6ch; }');
    expect(css).toContain('ol ol ol > li { padding-left: 8ch; }');
    expect(css).toContain('ul > li::before {');
    expect(css).toContain('position: absolute;');
  });

  it('keeps nested lists flush with parent content and 1.1 counter numbering', () => {
    const css = buildA4PrintCss(DEFAULT_A4_DOCUMENT_LAYOUT);
    expect(css).toContain('ol ol, ol ul, ul ol, ul ul { padding-left: 0; }');
    expect(css).toContain('ol ol { counter-reset: item; }');
    expect(css).toContain(
      'ol ol > li::before { content: counters(item, ".") " "; }',
    );
  });

  it('continues list counters on paginated continuation fragments', () => {
    const css = buildA4PrintCss(DEFAULT_A4_DOCUMENT_LAYOUT);
    expect(css).toContain(
      'ol[style*="--flow-list-start"] {\n      counter-reset: item var(--flow-list-start, 0);\n    }',
    );
    expect(css).toContain(
      'ol > li[data-flow-continuation-item] { counter-increment: none; }',
    );
    expect(css).toContain(
      'ol > li[data-flow-continuation-item]::before { content: none; }',
    );
    expect(css).toContain(
      'ul > li[data-flow-continuation-item]::before { content: none; }',
    );
  });

  it('clips each print page to exactly one physical page', () => {
    const css = buildA4PrintCss({
      ...DEFAULT_A4_DOCUMENT_LAYOUT,
      marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
    });
    expect(css).toContain('.print-page .content {');
    expect(css).toContain('height: calc(297mm - 20mm - 20mm)');
    expect(css).toContain('overflow: hidden');
  });

  it('keeps oversized pages unclipped so the editor warning content is not hidden', () => {
    const css = buildA4PrintCss(DEFAULT_A4_DOCUMENT_LAYOUT);
    expect(css).toContain('.print-page[data-oversized="true"] .content {');
    expect(css).toContain('height: auto;');
    expect(css).toContain('overflow: visible;');
  });

  it('reserves an in-page strip for page numbers and shrinks the page bottom margin', () => {
    const css = buildA4PrintCss(
      {
        ...DEFAULT_A4_DOCUMENT_LAYOUT,
        marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
      },
      { pageNumberStripMm: 6 },
    );
    expect(css).toContain('margin: 20mm 20mm 14mm 20mm');
    expect(css).toContain(
      'height: calc(calc(297mm - 20mm - 20mm) + 6mm);',
    );
    expect(css).toContain('bottom: 0;');
    expect(css).not.toContain('bottom: calc(-1 * 20mm / 2)');
    expect(css).toContain('.print-page .content {\n      height: calc(297mm - 20mm - 20mm);');
  });

  it('clamps the page number strip to the configured bottom margin', () => {
    const css = buildA4PrintCss(
      {
        ...DEFAULT_A4_DOCUMENT_LAYOUT,
        marginsMm: { top: 20, right: 20, bottom: 5, left: 20 },
      },
      { pageNumberStripMm: 6 },
    );
    expect(css).toContain('margin: 20mm 20mm 0mm 20mm');
    expect(css).toContain(
      'height: calc(calc(297mm - 20mm - 5mm) + 5mm);',
    );
  });

  it('lets export pages overflow instead of clipping when requested', () => {
    const css = buildA4PrintCss(
      {
        ...DEFAULT_A4_DOCUMENT_LAYOUT,
        marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
      },
      { allowPageOverflow: true },
    );
    expect(css).toContain('.print-page .content {\n      overflow: visible;');
    expect(css).not.toContain('overflow: hidden');
    expect(css).toContain('margin: 20mm 20mm 20mm 20mm');
  });

  it('bundles metric-compatible font faces so print matches every environment', () => {
    const css = buildA4PrintCss(DEFAULT_A4_DOCUMENT_LAYOUT);
    expect(css).toContain("@font-face {\n      font-family: 'Arial';");
    expect(css).toContain('arimo-latin-400-normal.woff2');
    expect(css).toContain("font-family: 'Times New Roman';");
    expect(css).toContain('tinos-latin-400-normal.woff2');
    expect(css).toContain("font-family: 'Courier New';");
    expect(css).toContain('cousine-latin-400-normal.woff2');
  });

  it('allows overriding the font faces with embedded data URIs', () => {
    const css = buildA4PrintCss(DEFAULT_A4_DOCUMENT_LAYOUT, {
      fontFaceCss: '@font-face { font-family: \'Test\'; src: url(data:font/woff2;base64,AAAA); }',
    });
    expect(css).toContain('data:font/woff2;base64,AAAA');
    expect(css).not.toContain('/fonts/arimo');
  });
});
