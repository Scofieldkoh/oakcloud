import { describe, expect, it } from 'vitest';
import {
  normalizeLegacySoftPageBreaks,
  splitHardPageSections,
} from '@/lib/document-page-breaks';

describe('document page-break serialization', () => {
  it('removes legacy comment boundaries without removing content', () => {
    expect(
      normalizeLegacySoftPageBreaks(
        '<p>First</p><!-- PAGE_BREAK --><p>Second</p>',
      ),
    ).toBe('<p>First</p><p>Second</p>');
  });

  it('filters remove-page segments before discarding legacy boundaries', () => {
    expect(
      normalizeLegacySoftPageBreaks(
        '<p>First</p><!-- PAGE_BREAK --><p>[Remove Page]</p><!-- PAGE_BREAK --><p>Third</p>',
      ),
    ).toBe('<p>First</p><p>Third</p>');
  });

  it('splits only class-based hard page breaks', () => {
    expect(
      splitHardPageSections(
        '<p>First</p><!-- PAGE_BREAK --><p>Flow</p><div class="page-break" data-break-type="hard"></div><p>Second</p>',
      ),
    ).toEqual(['<p>First</p><p>Flow</p>', '<p>Second</p>']);
  });
});
