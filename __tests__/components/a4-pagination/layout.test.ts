import { describe, expect, it } from 'vitest';
import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
  a4LayoutsEqual,
  extractA4DocumentLayout,
  mergeA4DocumentLayout,
  normalizeA4DocumentLayout,
} from '@/components/documents/a4-pagination/layout';

describe('A4 document layout', () => {
  it('normalizes four independent margins and clamps unsafe values', () => {
    expect(normalizeA4DocumentLayout({
      version: 1,
      lineHeight: 1.8,
      paragraphSpacing: '8px',
      marginsMm: { top: 12, right: 18, bottom: -2, left: 200 },
    })).toEqual({
      version: 1,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '11pt',
      lineHeight: 1.8,
      paragraphSpacing: '8px',
      marginsMm: { top: 12, right: 18, bottom: 5, left: 60 },
    });
  });

  it('normalizes allowlisted typography and falls back independently', () => {
    expect(normalizeA4DocumentLayout({
      version: 1,
      fontFamily: 'Georgia, serif',
      fontSize: '14pt',
      lineHeight: 1.8,
      paragraphSpacing: '8px',
      marginsMm: { top: 12, right: 18, bottom: 20, left: 20 },
    })).toMatchObject({ fontFamily: 'Georgia, serif', fontSize: '14pt' });
    expect(normalizeA4DocumentLayout({
      version: 1,
      fontFamily: 'url(javascript:bad)',
      fontSize: '999px',
    })).toMatchObject({
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '11pt',
    });
  });

  it('treats typography as part of layout equality', () => {
    expect(a4LayoutsEqual(
      DEFAULT_A4_DOCUMENT_LAYOUT,
      { ...DEFAULT_A4_DOCUMENT_LAYOUT, fontSize: '12pt' },
    )).toBe(false);
  });

  it('falls back for absent or malformed legacy metadata', () => {
    expect(extractA4DocumentLayout(null)).toEqual(DEFAULT_A4_DOCUMENT_LAYOUT);
    expect(extractA4DocumentLayout({ layout: { version: 99 } }))
      .toEqual(DEFAULT_A4_DOCUMENT_LAYOUT);
  });

  it('merges layout without losing unrelated contentJson keys', () => {
    const contentJson = { tiptap: { type: 'doc' }, customKey: true };
    const merged = mergeA4DocumentLayout(
      contentJson,
      { ...DEFAULT_A4_DOCUMENT_LAYOUT, lineHeight: 2 },
    );
    expect(merged).toMatchObject({
      tiptap: { type: 'doc' },
      customKey: true,
      version: 1,
      layout: { lineHeight: 2 },
    });
    expect(extractA4DocumentLayout(merged).lineHeight).toBe(2);
    expect(merged).not.toBe(contentJson);
    expect(contentJson).toEqual({ tiptap: { type: 'doc' }, customKey: true });
  });

  it('compares layouts structurally', () => {
    expect(a4LayoutsEqual(
      DEFAULT_A4_DOCUMENT_LAYOUT,
      {
        version: 1,
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '11pt',
        lineHeight: 1.5,
        paragraphSpacing: '0.5em',
        marginsMm: { top: 20, right: 20, bottom: 20, left: 20 },
      },
    )).toBe(true);
    expect(a4LayoutsEqual(
      DEFAULT_A4_DOCUMENT_LAYOUT,
      { ...DEFAULT_A4_DOCUMENT_LAYOUT, marginsMm: { ...DEFAULT_A4_DOCUMENT_LAYOUT.marginsMm, left: 21 } },
    )).toBe(false);
  });
});
