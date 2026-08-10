import { describe, expect, it } from 'vitest';
import {
  HARD_PAGE_BREAK_HTML,
  hardSectionCountFromPages,
  hydrateFlowHtml,
  normalizeEditedFlowIds,
  normalizeCanonicalHtml,
  reassemblePageFragments,
  splitHardSections,
  stripFlowMetadata,
} from '@/components/documents/a4-pagination/model';

describe('A4 pagination canonical model', () => {
  it('counts hard sections from derived pages without touching the DOM', () => {
    expect(hardSectionCountFromPages([])).toBe(0);
    expect(hardSectionCountFromPages([{ hardBreakBefore: false }])).toBe(1);
    expect(
      hardSectionCountFromPages([
        { hardBreakBefore: false },
        { hardBreakBefore: true },
        { hardBreakBefore: false },
        { hardBreakBefore: true },
      ]),
    ).toBe(3);
  });

  it('treats legacy comment page breaks as soft boundaries', () => {
    expect(
      normalizeCanonicalHtml(
        '<p>First</p><!-- PAGE_BREAK --><p>Second</p>',
      ),
    ).toBe('<p>First</p><p>Second</p>');
  });

  it('filters legacy pages containing only the remove-page directive', () => {
    expect(
      normalizeCanonicalHtml(
        '<p>First</p><!-- PAGE_BREAK --><p>[Remove Page]</p><!-- PAGE_BREAK --><p>Third</p>',
      ),
    ).toBe('<p>First</p><p>Third</p>');
  });

  it('preserves class-based page breaks as hard sections', () => {
    const sections = splitHardSections(
      '<p>First</p><div class="page-break"></div><p>Second</p>',
    );

    expect(sections).toEqual(['<p>First</p>', '<p>Second</p>']);
    expect(sections.join(HARD_PAGE_BREAK_HTML)).toContain(
      'data-break-type="hard"',
    );
  });

  it('adds stable flow ids internally and strips them from saved HTML', () => {
    const hydrated = hydrateFlowHtml('<p>First</p><p>Second</p>');

    expect(hydrated).toMatch(/data-flow-id="[^"]+"/);
    expect(stripFlowMetadata(hydrated)).toBe('<p>First</p><p>Second</p>');
  });

  it('assigns distinct flow ids to blocks split by native editing', () => {
    const root = document.createElement('div');
    root.innerHTML = [
      '<p data-flow-id="paragraph-1">First</p>',
      '<p data-flow-id="paragraph-1">Second</p>',
    ].join('');

    normalizeEditedFlowIds(root);

    const paragraphs = root.querySelectorAll<HTMLElement>('[data-flow-id]');
    expect(paragraphs[0].dataset.flowId).toBe('paragraph-1');
    expect(paragraphs[1].dataset.flowId).toBeTruthy();
    expect(paragraphs[1].dataset.flowId).not.toBe('paragraph-1');
  });

  it('reassembles split paragraph fragments without duplicating the block', () => {
    const canonical = reassemblePageFragments([
      {
        content:
          '<p data-flow-id="paragraph-1" data-flow-continuation="start">Hello </p>',
        hardBreakBefore: false,
      },
      {
        content:
          '<p data-flow-id="paragraph-1" data-flow-continuation="end"><strong>world</strong></p>',
        hardBreakBefore: false,
      },
    ]);

    expect(stripFlowMetadata(canonical)).toBe(
      '<p>Hello <strong>world</strong></p>',
    );
  });

  it('recursively merges a proven nested-list continuation', () => {
    const reassembled = reassemblePageFragments([
      {
        hardBreakBefore: false,
        content:
          '<ol data-flow-id="outer-list"><li data-flow-id="outer-item">' +
          '<p>Parent</p><ol><li data-flow-id="nested-item"><p>First</p></li></ol>' +
          '</li></ol>',
      },
      {
        hardBreakBefore: false,
        content:
          '<ol data-flow-id="outer-list" data-flow-continuation="end">' +
          '<li data-flow-id="outer-item" data-flow-continuation-item="true">' +
          '<ol style="--flow-list-start: 1">' +
          '<li data-flow-id="nested-item" data-flow-continuation-item="true"><p>Second</p></li>' +
          '<li data-flow-id="next-item"><p>Next</p></li>' +
          '</ol></li></ol>',
      },
    ]);
    const root = document.createElement('div');
    root.innerHTML = reassembled;

    expect(root.querySelectorAll('ol')).toHaveLength(2);
    expect(root.querySelectorAll('ol ol')).toHaveLength(1);
    expect(root.querySelectorAll('ol ol > li')).toHaveLength(2);
    expect(root.querySelector('ol ol')?.textContent).toBe('FirstSecondNext');
  });

  it('keeps adjacent nested lists separate without a shared boundary flow id', () => {
    const reassembled = reassemblePageFragments([
      {
        hardBreakBefore: false,
        content:
          '<ol data-flow-id="outer-list"><li data-flow-id="outer-item">' +
          '<ol><li data-flow-id="first-list-item"><p>First list</p></li></ol>' +
          '</li></ol>',
      },
      {
        hardBreakBefore: false,
        content:
          '<ol data-flow-id="outer-list" data-flow-continuation="end">' +
          '<li data-flow-id="outer-item" data-flow-continuation-item="true">' +
          '<ol><li data-flow-id="second-list-item"><p>Second list</p></li></ol>' +
          '</li></ol>',
      },
    ]);
    const root = document.createElement('div');
    root.innerHTML = reassembled;

    expect(root.querySelectorAll('ol ol')).toHaveLength(2);
    expect(root.querySelectorAll('ol ol > li')).toHaveLength(2);
  });

  it('keeps hard page boundaries while reassembling page fragments', () => {
    const canonical = reassemblePageFragments([
      {
        content: '<p data-flow-id="first">First</p>',
        hardBreakBefore: false,
      },
      {
        content: '<p data-flow-id="second">Second</p>',
        hardBreakBefore: true,
      },
    ]);

    expect(stripFlowMetadata(canonical)).toBe(
      `<p>First</p>${HARD_PAGE_BREAK_HTML}<p>Second</p>`,
    );
  });
});
