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
      lineHeight: 1.8,
      paragraphSpacing: '8px',
      marginsMm: { top: 12, right: 18, bottom: 5, left: 60 },
    });
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
