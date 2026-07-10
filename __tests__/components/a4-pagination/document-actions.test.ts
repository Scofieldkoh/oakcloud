import { describe, expect, it } from 'vitest';
import {
  appendHardPage,
  applyLogicalDelete,
  deleteHardPageSection,
  insertHardPageAtSelection,
} from '@/components/documents/a4-pagination/document-actions';
import {
  HARD_PAGE_BREAK_HTML,
  stripFlowMetadata,
} from '@/components/documents/a4-pagination/model';
import type { FlowSelectionBookmark } from '@/components/documents/a4-pagination/selection';

function collapsed(flowId: string, offset: number): FlowSelectionBookmark {
  const point = { flowId, offset };
  return { anchor: point, focus: point, collapsed: true };
}

describe('A4 canonical document actions', () => {
  it('forward Delete removes the next character at a soft page boundary', () => {
    const result = applyLogicalDelete(
      '<p data-flow-id="a">One</p><p data-flow-id="b">Two</p>',
      collapsed('a', 3),
      'forward',
    );

    expect(stripFlowMetadata(result.html)).toBe('<p>One</p><p>wo</p>');
    expect(result.selection).toEqual(collapsed('a', 3));
    expect(result.changed).toBe(true);
  });

  it('backward Delete removes the previous character at a soft page boundary', () => {
    const result = applyLogicalDelete(
      '<p data-flow-id="a">One</p><p data-flow-id="b">Two</p>',
      collapsed('b', 0),
      'backward',
    );

    expect(stripFlowMetadata(result.html)).toBe('<p>On</p><p>Two</p>');
    expect(result.selection).toEqual(collapsed('b', 0));
    expect(result.changed).toBe(true);
  });

  it('forward Delete immediately before a hard break joins sections', () => {
    const result = applyLogicalDelete(
      `<p data-flow-id="a">One</p>${HARD_PAGE_BREAK_HTML}<p data-flow-id="b">Two</p>`,
      collapsed('a', 3),
      'forward',
    );

    expect(stripFlowMetadata(result.html)).not.toContain('page-break');
    expect(stripFlowMetadata(result.html)).toBe('<p>One</p><p>Two</p>');
    expect(result.changed).toBe(true);
  });

  it('backward Delete immediately after a hard break joins sections', () => {
    const result = applyLogicalDelete(
      `<p data-flow-id="a">One</p>${HARD_PAGE_BREAK_HTML}<p data-flow-id="b">Two</p>`,
      collapsed('b', 0),
      'backward',
    );

    expect(stripFlowMetadata(result.html)).toBe('<p>One</p><p>Two</p>');
    expect(result.changed).toBe(true);
  });

  it('deletes one non-collapsed logical range across a hard break', () => {
    const result = applyLogicalDelete(
      `<p data-flow-id="a">Alpha</p>${HARD_PAGE_BREAK_HTML}<p data-flow-id="b">Beta</p>`,
      {
        anchor: { flowId: 'a', offset: 2 },
        focus: { flowId: 'b', offset: 2 },
        collapsed: false,
      },
      'forward',
    );

    expect(stripFlowMetadata(result.html)).toBe('<p>Al</p><p>ta</p>');
    expect(result.selection).toEqual(collapsed('a', 2));
    expect(result.changed).toBe(true);
  });

  it('retains an editable paragraph when a selection empties the document', () => {
    const result = applyLogicalDelete(
      '<p data-flow-id="a">All</p>',
      {
        anchor: { flowId: 'a', offset: 0 },
        focus: { flowId: 'a', offset: 3 },
        collapsed: false,
      },
      'backward',
    );

    expect(stripFlowMetadata(result.html)).toBe('<p><br></p>');
    expect(result.html).toMatch(/data-flow-id="[^"]+"/);
    expect(result.selection?.collapsed).toBe(true);
    expect(result.changed).toBe(true);
  });

  it('leaves the document unchanged for an unknown flow point', () => {
    const html = '<p data-flow-id="a">One</p>';
    const selection = collapsed('missing', 0);

    expect(applyLogicalDelete(html, selection, 'forward')).toEqual({
      html,
      selection,
      changed: false,
    });
  });

  it('inserts a hard page by splitting the selected flow block', () => {
    const result = insertHardPageAtSelection(
      '<p data-flow-id="a">OneTwo</p>',
      collapsed('a', 3),
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>One</p>${HARD_PAGE_BREAK_HTML}<p>Two</p>`,
    );
    expect(result.selection).toEqual(collapsed('a', 3));
    expect(result.changed).toBe(true);
  });

  it('inserts an editable empty paragraph when splitting at document end', () => {
    const result = insertHardPageAtSelection(
      '<p data-flow-id="a">One</p>',
      collapsed('a', 3),
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>One</p>${HARD_PAGE_BREAK_HTML}<p><br></p>`,
    );
    expect(result.selection?.anchor.offset).toBe(0);
    expect(result.selection?.anchor.flowId).not.toBe('a');
    expect(result.changed).toBe(true);
  });

  it('restores after the newly inserted break in a later hard section', () => {
    const result = insertHardPageAtSelection(
      `<p data-flow-id="a">First</p>${HARD_PAGE_BREAK_HTML}<p data-flow-id="b">Second</p>`,
      collapsed('b', 3),
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>First</p>${HARD_PAGE_BREAK_HTML}<p>Sec</p>${HARD_PAGE_BREAK_HTML}<p>ond</p>`,
    );
    expect(result.selection).toEqual(collapsed('b', 3));
  });

  it('preserves a whitespace-only remainder when splitting a flow block', () => {
    const result = insertHardPageAtSelection(
      '<p data-flow-id="a">One   </p>',
      collapsed('a', 3),
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>One</p>${HARD_PAGE_BREAK_HTML}<p>   </p>`,
    );
  });

  it('appends one persistent hard blank page in one transaction', () => {
    const result = appendHardPage('<p data-flow-id="a">One</p>');

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>One</p>${HARD_PAGE_BREAK_HTML}<p><br></p>`,
    );
    expect(result.selection?.anchor.offset).toBe(0);
    expect(result.changed).toBe(true);
  });

  it('materializes an existing trailing blank section before appending', () => {
    const result = appendHardPage(
      `<p data-flow-id="a">One</p>${HARD_PAGE_BREAK_HTML}`,
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>One</p>${HARD_PAGE_BREAK_HTML}<p><br></p>${HARD_PAGE_BREAK_HTML}<p><br></p>`,
    );
    expect(result.html).not.toContain(
      `${HARD_PAGE_BREAK_HTML}${HARD_PAGE_BREAK_HTML}`,
    );
  });

  it('deletes the requested hard page section and adjacent break once', () => {
    const result = deleteHardPageSection(
      `<p>A</p>${HARD_PAGE_BREAK_HTML}<p>B</p>${HARD_PAGE_BREAK_HTML}<p>C</p>`,
      1,
    );

    expect(stripFlowMetadata(result.html)).toBe(
      `<p>A</p>${HARD_PAGE_BREAK_HTML}<p>C</p>`,
    );
    expect(result.changed).toBe(true);
  });

  it('retains an editable blank document when deleting its only section', () => {
    const result = deleteHardPageSection(
      '<p data-flow-id="a">Only</p>',
      0,
    );

    expect(stripFlowMetadata(result.html)).toBe('<p><br></p>');
    expect(result.html).toMatch(/data-flow-id="[^"]+"/);
    expect(result.changed).toBe(true);
  });

  it('does not change the document for an invalid hard section index', () => {
    const html = `<p>A</p>${HARD_PAGE_BREAK_HTML}<p>B</p>`;

    expect(deleteHardPageSection(html, 2)).toEqual({
      html,
      selection: null,
      changed: false,
    });
  });
});
