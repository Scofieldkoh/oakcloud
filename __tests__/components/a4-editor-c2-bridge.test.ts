import { describe, expect, it } from 'vitest';
import {
  analyzeA4EditorFieldSource,
  getA4EditorListContext,
  runA4EditorSemanticCommand,
} from '@/components/documents/a4-editor-semantic-bridge';
import { createA4CommandDocument } from '@/components/documents/a4-pagination/structural-commands';
import type { FlowSelectionBookmark } from '@/components/documents/a4-pagination/selection';

function paragraphBookmark(html: string, offset: number, selector = 'p[data-flow-id]'): {
  html: string;
  bookmark: FlowSelectionBookmark;
} {
  const canonical = createA4CommandDocument(html);
  const root = document.createElement('div');
  root.innerHTML = canonical.internalHtml;
  const paragraph = root.querySelector<HTMLElement>(selector);
  const flowId = paragraph?.dataset.flowId;
  if (!flowId) throw new Error('Expected hydrated paragraph identity');
  const point = { flowId, offset };
  return {
    html: canonical.internalHtml,
    bookmark: { anchor: point, focus: point, collapsed: true },
  };
}

describe('A4Editor C2 semantic bridge', () => {
  it('inserts and removes a semantic page break without splitting the canonical list item', () => {
    const source = paragraphBookmark(
      '<ol start="5"><li><p>Before After</p></li><li><p>Next</p></li></ol>',
      7,
    );

    const inserted = runA4EditorSemanticCommand(
      source.html,
      source.bookmark,
      { type: 'insert-manual-break' },
    );
    expect(inserted.status).toBe('applied');
    if (inserted.status !== 'applied') return;

    const insertedRoot = document.createElement('div');
    insertedRoot.innerHTML = inserted.transaction.html;
    expect(insertedRoot.querySelectorAll('ol')).toHaveLength(1);
    expect(insertedRoot.querySelector('ol')?.getAttribute('start')).toBe('5');
    expect(insertedRoot.querySelectorAll('li')).toHaveLength(2);
    expect(insertedRoot.querySelectorAll('span[data-a4-break="page"]')).toHaveLength(1);
    expect(insertedRoot.textContent).toBe('Before AfterNext');

    const removed = runA4EditorSemanticCommand(
      inserted.transaction.html,
      inserted.transaction.selection!,
      { type: 'delete', direction: 'backward' },
    );
    expect(removed.status).toBe('applied');
    if (removed.status !== 'applied') return;
    expect(removed.transaction.html).not.toContain('data-a4-break="page"');
    const removedRoot = document.createElement('div');
    removedRoot.innerHTML = removed.transaction.html;
    expect(removedRoot.querySelectorAll('li')).toHaveLength(2);
    expect(removedRoot.textContent).toBe('Before AfterNext');
  });

  it('dispatches paragraph and line-break commands through the S1 structural boundary', () => {
    const paragraphSource = paragraphBookmark('<p>AlphaBeta</p>', 5);
    const paragraph = runA4EditorSemanticCommand(
      paragraphSource.html,
      paragraphSource.bookmark,
      { type: 'insert-paragraph' },
    );
    expect(paragraph.status).toBe('applied');
    if (paragraph.status !== 'applied') return;
    const paragraphRoot = document.createElement('div');
    paragraphRoot.innerHTML = paragraph.transaction.html;
    expect(Array.from(paragraphRoot.querySelectorAll('p')).map((node) => node.textContent)).toEqual([
      'Alpha',
      'Beta',
    ]);

    const lineSource = paragraphBookmark('<p>AlphaBeta</p>', 5);
    const line = runA4EditorSemanticCommand(
      lineSource.html,
      lineSource.bookmark,
      { type: 'insert-line-break' },
    );
    expect(line.status).toBe('applied');
    if (line.status !== 'applied') return;
    const lineRoot = document.createElement('div');
    lineRoot.innerHTML = line.transaction.html;
    expect(lineRoot.querySelectorAll('br')).toHaveLength(1);
    expect(lineRoot.textContent).toBe('AlphaBeta');
  });

  it('uses the S1 list context without creating a CORE list grammar', () => {
    const source = paragraphBookmark('<ol><li><p>Item</p></li></ol>', 2);
    const context = getA4EditorListContext(source.html, source.bookmark);
    expect(context).toMatchObject({ inList: true, level: 1 });
    expect(context?.itemNodeId).toBeTruthy();
  });

  it('exposes F1 parser occurrences and diagnostics without rewriting field source', () => {
    const content = '<p>{{ custom.name }}</p><p>{{broken</p>';
    const parsed = analyzeA4EditorFieldSource(content, {
      kind: 'template',
      id: 'template:42',
    });

    expect(parsed.source).toBe(content);
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0]).toMatchObject({
      scope: { kind: 'template', id: 'template:42' },
      span: { raw: '{{ custom.name }}' },
    });
    expect(parsed.nodes[0].occurrenceId).toContain('template%3A42');
    expect(parsed.diagnostics.some((entry) => entry.code === 'dangling-expression')).toBe(true);
  });

  it('routes Enter through S2 list semantics without duplicating later siblings', () => {
    const source = paragraphBookmark(
      '<ol start="5"><li><p>AlphaBeta</p></li><li><p>Next</p></li></ol>',
      5,
      'ol > li:first-child > p[data-flow-id]',
    );
    const result = runA4EditorSemanticCommand(
      source.html,
      source.bookmark,
      { type: 'insert-paragraph' },
    );
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    const root = document.createElement('div');
    root.innerHTML = result.transaction.html;
    expect(root.querySelector('ol')?.getAttribute('start')).toBe('5');
    expect(Array.from(root.querySelectorAll('ol > li > p'), (node) => node.textContent))
      .toEqual(['Alpha', 'Beta', 'Next']);
  });

  it('routes list indentation, list conversion and numbering through S2 transactions', () => {
    const list = paragraphBookmark(
      '<ol><li><p>A</p></li><li><p>B</p></li><li><p>C</p></li></ol>',
      0,
      'ol > li:nth-child(2) > p[data-flow-id]',
    );
    const indented = runA4EditorSemanticCommand(list.html, list.bookmark, {
      type: 'indent',
      direction: 'indent',
      metrics: { emPx: 16, remPx: 16, maxIndentPx: 600 },
    });
    expect(indented.status).toBe('applied');
    if (indented.status !== 'applied') return;
    const indentedRoot = document.createElement('div');
    indentedRoot.innerHTML = indented.transaction.html;
    expect(indentedRoot.querySelectorAll('ol > li:first-child > ol > li')).toHaveLength(1);

    const paragraphs = paragraphBookmark('<p>A</p><p>B</p>', 0, 'p:first-child[data-flow-id]');
    const converted = runA4EditorSemanticCommand(paragraphs.html, paragraphs.bookmark, {
      type: 'set-list-type',
      listType: 'unordered',
    });
    expect(converted.status).toBe('applied');
    if (converted.status !== 'applied') return;
    expect(converted.transaction.html).toContain('<ul');


  const activeList = paragraphBookmark(
    '<ol><li><p>Only</p></li></ol>',
    0,
    'ol > li > p[data-flow-id]',
  );
  const cleared = runA4EditorSemanticCommand(activeList.html, activeList.bookmark, {
    type: 'clear-list-type',
  });
  expect(cleared.status).toBe('applied');
  if (cleared.status !== 'applied') return;
  const clearedRoot = document.createElement('div');
  clearedRoot.innerHTML = cleared.transaction.html;
  expect(clearedRoot.querySelector('ol, ul')).toBeNull();
  expect(clearedRoot.querySelector('p')?.textContent).toBe('Only');
    const restart = paragraphBookmark(
      '<ol><li><p>A</p></li><li><p>B</p></li></ol>',
      0,
      'ol > li:nth-child(2) > p[data-flow-id]',
    );
    const restarted = runA4EditorSemanticCommand(restart.html, restart.bookmark, {
      type: 'restart-numbering',
      start: 7,
    });
    expect(restarted.status).toBe('applied');
    if (restarted.status !== 'applied') return;
    expect(restarted.transaction.html).toContain('start="7"');
  });

});
