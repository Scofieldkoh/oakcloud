import { describe, expect, it } from 'vitest';
import { buildA4PrintCss } from '@/services/document-export.service';

describe('document export A4 layout', () => {
  it('prints four independent margins and saved line spacing', () => {
    const css = buildA4PrintCss({
      version: 1,
      lineHeight: 1.8,
      paragraphSpacing: '8px',
      marginsMm: { top: 10, right: 15, bottom: 20, left: 25 },
    });

    expect(css).toContain('@page { margin: 10mm 15mm 20mm 25mm; }');
    expect(css).toContain('line-height: 1.8');
    expect(css).toContain('margin: 0 0 8px 0');
  });
});
