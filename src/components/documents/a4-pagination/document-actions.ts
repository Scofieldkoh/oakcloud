import DOMPurify from 'dompurify';
import type { FlowPoint, FlowSelectionBookmark } from './selection';
import {
  documentTextOffsetForFlowPoint,
  flowPointAtDocumentTextOffset,
} from './selection';
import {
  HARD_PAGE_BREAK_HTML,
  domPointForFlowPoint,
  hydrateFlowContainer,
  normalizeEditedFlowIds,
  normalizeCanonicalHtml,
  splitHardSections,
  stripFlowMetadata,
  type DomPoint,
  type PageFragment,
} from './model';

const EMPTY_PARAGRAPH_HTML = '<p><br></p>';
const EMBEDDED_CONTENT_SELECTOR = [
  'audio',
  'canvas',
  'embed',
  'hr',
  'iframe',
  'img',
  'input',
  'object',
  'svg',
  'table',
  'textarea',
  'video',
].join(',');

export interface DocumentTransactionResult {
  html: string;
  selection: FlowSelectionBookmark | null;
  changed: boolean;
}

type LogicalUnit =
  | { type: 'break'; element: HTMLElement }
  | { type: 'text'; node: Text };

function createContainer(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = normalizeCanonicalHtml(html);
  return container;
}

export function sanitizeReplacementHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'div',
      'span',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'strike',
      'ul',
      'ol',
      'li',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'a',
      'hr',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'caption',
    ],
    ALLOWED_ATTR: [
      'href',
      'target',
      'rel',
      'style',
      'class',
      'colspan',
      'rowspan',
      'scope',
      'start',
      'align',
      'valign',
      'width',
      'height',
      'data-break-type',
      'data-flow-id',
      'data-flow-continuation',
      'data-flow-oversized',
      'data-flow-keep-together',
    ],
  });

  // Flow metadata is editor-owned: clipboard HTML must never carry flow ids
  // into the canonical document.
  return stripFlowMetadata(sanitized);
}

function fragmentTextLength(fragment: DocumentFragment): number {
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment.cloneNode(true));
  return wrapper.textContent?.length ?? 0;
}

/**
 * Normalizes one half of a split list item so both halves keep the editor's
 * canonical `li > p` structure. An empty half becomes an empty paragraph so
 * pressing Enter there again can lift the item out of the list.
 */
function normalizeListItemSplitHtml(html: string): string {
  if (!html.trim() || html === '<br>') return EMPTY_PARAGRAPH_HTML;

  const container = document.createElement('div');
  container.innerHTML = html;
  const hasBlockChild = Array.from(container.childNodes).some(
    (node) =>
      node.nodeType === Node.ELEMENT_NODE &&
      /^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|TABLE|HR)$/.test(
        (node as HTMLElement).tagName,
      ),
  );
  if (!hasBlockChild) return `<p>${html}</p>`;
  return hasSubstantiveContent(container) ? html : EMPTY_PARAGRAPH_HTML;
}

function splitBlockAtDomPoint(
  root: HTMLElement,
  point: DomPoint,
): HTMLElement | null {
  const splitTags = new Set([
    'P',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'LI',
    'BLOCKQUOTE',
  ]);
  let block =
    point.node.nodeType === Node.ELEMENT_NODE
      ? (point.node as HTMLElement)
      : point.node.parentElement;
  while (block && block !== root && !splitTags.has(block.tagName)) {
    block = block.parentElement;
  }
  if (!block || block === root) return null;

  // When the caret sits inside a list item, split the list item itself so the
  // continuation becomes a new numbered/bulleted item instead of a new
  // paragraph nested inside the same item.
  if (block.tagName !== 'LI') {
    const listItem = block.closest('li');
    if (listItem && root.contains(listItem)) {
      block = listItem;
    }
  }

  const beforeRange = document.createRange();
  beforeRange.setStart(block, 0);
  beforeRange.setEnd(point.node, point.offset);
  const afterRange = document.createRange();
  afterRange.setStart(point.node, point.offset);
  afterRange.setEnd(block, block.childNodes.length);

  const beforeWrapper = document.createElement('div');
  beforeWrapper.appendChild(beforeRange.cloneContents());
  const afterWrapper = document.createElement('div');
  afterWrapper.appendChild(afterRange.cloneContents());

  const nextBlock = document.createElement(block.tagName);
  let beforeHtml = beforeWrapper.innerHTML || '<br>';
  let afterHtml = afterWrapper.innerHTML || '<br>';

  // When the caret splits a paragraph mid-word, the continuation starts with
  // the whitespace that separated the two words. Move that leading whitespace
  // to the end of the split part so the new paragraph starts with a word and
  // the preserved text still reassembles losslessly.
  const leadingWhitespace = afterHtml.match(/^\s+/);
  if (
    leadingWhitespace &&
    beforeHtml !== '<br>' &&
    beforeHtml.trim().length > 0
  ) {
    beforeHtml += leadingWhitespace[0];
    afterHtml = afterHtml.slice(leadingWhitespace[0].length) || '<br>';
  }

  if (block.tagName === 'LI') {
    beforeHtml = normalizeListItemSplitHtml(beforeHtml);
    afterHtml = normalizeListItemSplitHtml(afterHtml);
  }

  nextBlock.innerHTML = afterHtml;
  block.innerHTML = beforeHtml;
  block.after(nextBlock);
  return nextBlock;
}

/**
 * Lifts an empty list item out of its list, placing a fresh editable
 * paragraph where the item was. When the item is in the middle of the list,
 * the list is split around the paragraph so the remaining items stay
 * numbered/bulleted lists on both sides.
 */
function exitEmptyListItem(listItem: HTMLElement): HTMLParagraphElement | null {
  const list = listItem.parentElement;
  if (!list || (list.tagName !== 'OL' && list.tagName !== 'UL')) return null;

  const previous = listItem.previousElementSibling;
  const next = listItem.nextElementSibling;
  const paragraph = document.createElement('p');
  paragraph.innerHTML = '<br>';

  if (!previous && !next) {
    list.replaceWith(paragraph);
    return paragraph;
  }

  listItem.remove();

  if (!previous && next) {
    list.before(paragraph);
    return paragraph;
  }

  if (previous && !next) {
    list.after(paragraph);
    return paragraph;
  }

  const continuation = document.createElement(list.tagName);
  Array.from(list.attributes).forEach((attribute) => {
    if (attribute.name.startsWith('data-flow-')) return;
    continuation.setAttribute(attribute.name, attribute.value);
  });
  const trailing: Element[] = [];
  let cursor = next;
  while (cursor) {
    trailing.push(cursor);
    cursor = cursor.nextElementSibling;
  }
  trailing.forEach((element) => continuation.appendChild(element));
  list.after(paragraph);
  paragraph.after(continuation);
  return paragraph;
}

function finalizeListExit(
  root: HTMLElement,
  paragraph: HTMLParagraphElement,
): DocumentTransactionResult {
  hydrateFlowContainer(root);
  normalizeEditedFlowIds(root);
  const paragraphFlowId = paragraph.dataset.flowId;
  const selectionPoint = paragraphFlowId
    ? flowPointAtElementStart(root, paragraph)
    : null;
  const finalized = finalizeDocumentRoot(
    root,
    selectionPoint ? collapsedFlowSelection(selectionPoint) : null,
    true,
  );
  return { ...finalized, changed: true };
}

/**
 * Root replacement nodes that must never be nested inside a paragraph-style
 * text block. Lists, tables, and horizontal rules are insertable root blocks
 * even though they are not splittable text containers.
 */
const INSERTABLE_ROOT_BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'HR',
  'TABLE',
]);

/**
 * Paragraph-style text blocks that can be split at a logical caret. Table
 * internals remain children of `table`, and list items remain children of
 * `ul`/`ol`, so they are intentionally not in this set.
 */
const SPLITTABLE_CONTAINING_BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
]);

function isInsertableRootBlock(element: HTMLElement): boolean {
  return INSERTABLE_ROOT_BLOCK_TAGS.has(element.tagName);
}

function isSplittableContainingBlock(element: HTMLElement): boolean {
  return SPLITTABLE_CONTAINING_BLOCK_TAGS.has(element.tagName);
}

function fragmentHasBlockNodes(fragment: DocumentFragment): boolean {
  return Array.from(fragment.childNodes).some(
    (node) =>
      node.nodeType === Node.ELEMENT_NODE &&
      isInsertableRootBlock(node as HTMLElement),
  );
}

/**
 * Insert a replacement fragment at a collapsed DOM point. When the fragment
 * contains block-level nodes, the containing flow block is split at the point:
 * the leading inline fragment stays in a valid block, the pasted sibling
 * blocks are inserted between, and the trailing inline fragment becomes a
 * valid sibling block. This never nests p, headings, lists, blockquotes, or
 * tables inside a p.
 */
export function insertReplacementNodes(
  root: HTMLElement,
  point: DomPoint,
  fragment: DocumentFragment,
): void {
  if (!fragmentHasBlockNodes(fragment)) {
    const range = document.createRange();
    range.setStart(point.node, point.offset);
    range.collapse(true);
    range.insertNode(fragment);
    return;
  }

  let block =
    point.node.nodeType === Node.ELEMENT_NODE
      ? (point.node as HTMLElement)
      : point.node.parentElement;
  while (
    block &&
    block !== root &&
    !isSplittableContainingBlock(block)
  ) {
    block = block.parentElement;
  }
  if (!block || block === root) {
    const range = document.createRange();
    range.setStart(point.node, point.offset);
    range.collapse(true);
    range.insertNode(fragment);
    return;
  }

  const beforeRange = document.createRange();
  beforeRange.setStart(block, 0);
  beforeRange.setEnd(point.node, point.offset);
  const leading = beforeRange.cloneContents();

  const afterRange = document.createRange();
  afterRange.setStart(point.node, point.offset);
  afterRange.setEnd(block, block.childNodes.length);
  const trailing = afterRange.cloneContents();

  const replacements: Node[] = [];
  const leadingHasContent = hasSubstantiveContent(leading);
  if (leadingHasContent) {
    const leadingBlock = document.createElement(block.tagName);
    leadingBlock.appendChild(leading);
    replacements.push(leadingBlock);
  }
  replacements.push(...Array.from(fragment.childNodes));
  const trailingHasContent = hasSubstantiveContent(trailing);
  if (trailingHasContent) {
    const trailingBlock = document.createElement(block.tagName);
    trailingBlock.appendChild(trailing);
    replacements.push(trailingBlock);
  }

  block.replaceWith(...replacements);
}

function createBlankParagraph(): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.appendChild(document.createElement('br'));
  return paragraph;
}

function createHardBreak(): HTMLDivElement {
  const hardBreak = document.createElement('div');
  hardBreak.className = 'page-break';
  hardBreak.dataset.breakType = 'hard';
  return hardBreak;
}

export function collapsedFlowSelection(point: FlowPoint): FlowSelectionBookmark {
  return { anchor: point, focus: point, collapsed: true };
}

function containsFlowId(root: ParentNode, flowId: string): boolean {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-flow-id]'),
  ).some((element) => element.dataset.flowId === flowId);
}

function flowPointAtElementStart(
  root: HTMLElement,
  element: HTMLElement,
): FlowPoint | null {
  const flowId = element.dataset.flowId;
  if (!flowId) return null;

  let offset = 0;
  for (const fragment of root.querySelectorAll<HTMLElement>('[data-flow-id]')) {
    if (fragment === element) return { flowId, offset };
    if (fragment.dataset.flowId === flowId) {
      offset += fragment.textContent?.length ?? 0;
    }
  }

  return null;
}

function firstFlowPoint(root: HTMLElement): FlowPoint | null {
  const first = root.querySelector<HTMLElement>('[data-flow-id]');
  return first ? flowPointAtElementStart(root, first) : null;
}

function hasSubstantiveContent(root: ParentNode): boolean {
  return Boolean(
    root.textContent?.length || root.querySelector(EMBEDDED_CONTENT_SELECTOR),
  );
}

function ensureEditableDocument(root: HTMLElement): boolean {
  if (
    hasSubstantiveContent(root) ||
    root.querySelector('.page-break')
  ) {
    return false;
  }

  root.replaceChildren(createBlankParagraph());
  return true;
}

export function finalizeDocumentRoot(
  root: HTMLElement,
  requestedSelection: FlowSelectionBookmark | null,
  selectFallback: boolean,
): Pick<DocumentTransactionResult, 'html' | 'selection'> {
  ensureEditableDocument(root);
  hydrateFlowContainer(root);

  const requestedIsValid =
    requestedSelection &&
    containsFlowId(root, requestedSelection.anchor.flowId) &&
    containsFlowId(root, requestedSelection.focus.flowId);
  const fallbackPoint = selectFallback ? firstFlowPoint(root) : null;

  return {
    html: root.innerHTML,
    selection: requestedIsValid
      ? requestedSelection
      : fallbackPoint
        ? collapsedFlowSelection(fallbackPoint)
        : null,
  };
}

function compareDomPoints(left: DomPoint, right: DomPoint): number {
  const leftRange = document.createRange();
  leftRange.setStart(left.node, left.offset);
  leftRange.collapse(true);
  const rightRange = document.createRange();
  rightRange.setStart(right.node, right.offset);
  rightRange.collapse(true);
  return leftRange.compareBoundaryPoints(Range.START_TO_START, rightRange);
}

function hardBreakBoundary(
  element: HTMLElement,
  side: 'after' | 'before',
): DomPoint {
  const parent = element.parentNode!;
  const index = Array.prototype.indexOf.call(parent.childNodes, element);
  return { node: parent, offset: index + (side === 'after' ? 1 : 0) };
}

function collectLogicalUnits(root: HTMLElement): LogicalUnit[] {
  const units: LogicalUnit[] = [];

  function visit(node: Node): void {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).classList.contains('page-break')
    ) {
      units.push({ type: 'break', element: node as HTMLElement });
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.length) units.push({ type: 'text', node: node as Text });
      return;
    }

    node.childNodes.forEach(visit);
  }

  root.childNodes.forEach(visit);
  return units;
}

function nextLogicalUnit(
  root: HTMLElement,
  point: DomPoint,
): LogicalUnit | null {
  for (const unit of collectLogicalUnits(root)) {
    if (unit.type === 'break') {
      if (compareDomPoints(point, hardBreakBoundary(unit.element, 'before')) <= 0) {
        return unit;
      }
      continue;
    }

    if (unit.node === point.node) {
      if (point.offset < unit.node.length) return unit;
      continue;
    }

    if (compareDomPoints(point, { node: unit.node, offset: 0 }) <= 0) {
      return unit;
    }
  }

  return null;
}

function previousLogicalUnit(
  root: HTMLElement,
  point: DomPoint,
): LogicalUnit | null {
  const units = collectLogicalUnits(root);
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    if (unit.type === 'break') {
      if (compareDomPoints(point, hardBreakBoundary(unit.element, 'after')) >= 0) {
        return unit;
      }
      continue;
    }

    if (unit.node === point.node) {
      if (point.offset > 0) return unit;
      continue;
    }

    if (
      compareDomPoints(point, { node: unit.node, offset: unit.node.length }) >= 0
    ) {
      return unit;
    }
  }

  return null;
}

function flowIdForTextNode(node: Text): string | null {
  return node.parentElement?.closest<HTMLElement>('[data-flow-id]')?.dataset
    .flowId ?? null;
}

function deleteTextUnit(
  unit: Extract<LogicalUnit, { type: 'text' }>,
  point: DomPoint,
  direction: 'backward' | 'forward',
): void {
  const requestedOffset =
    unit.node === point.node
      ? point.offset + (direction === 'backward' ? -1 : 0)
      : direction === 'backward'
        ? unit.node.length - 1
        : 0;
  unit.node.deleteData(Math.max(0, requestedOffset), 1);
}

function deleteSelectedRange(
  html: string,
  selection: FlowSelectionBookmark,
): DocumentTransactionResult {
  const root = createContainer(html);
  let start = domPointForFlowPoint(root, selection.anchor);
  let end = domPointForFlowPoint(root, selection.focus);
  if (!start || !end) return { html, selection, changed: false };

  let startPoint = selection.anchor;
  if (compareDomPoints(start, end) > 0) {
    [start, end] = [end, start];
    startPoint = selection.focus;
  }

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const before = root.innerHTML;
  range.deleteContents();
  if (root.innerHTML === before) return { html, selection, changed: false };

  const finalized = finalizeDocumentRoot(
    root,
    collapsedFlowSelection(startPoint),
    true,
  );
  return { ...finalized, changed: true };
}

function deleteCollapsedUnit(
  html: string,
  point: FlowPoint,
  direction: 'backward' | 'forward',
): DocumentTransactionResult {
  const root = createContainer(html);
  const domPoint = domPointForFlowPoint(root, point);
  if (!domPoint) {
    return {
      html,
      selection: collapsedFlowSelection(point),
      changed: false,
    };
  }

  const unit =
    direction === 'forward'
      ? nextLogicalUnit(root, domPoint)
      : previousLogicalUnit(root, domPoint);
  if (!unit) {
    return {
      html,
      selection: collapsedFlowSelection(point),
      changed: false,
    };
  }

  let nextPoint = point;
  if (unit.type === 'break') {
    unit.element.remove();
  } else {
    if (
      direction === 'backward' &&
      flowIdForTextNode(unit.node) === point.flowId &&
      point.offset > 0
    ) {
      nextPoint = { ...point, offset: point.offset - 1 };
    }
    deleteTextUnit(unit, domPoint, direction);
  }

  const finalized = finalizeDocumentRoot(
    root,
    collapsedFlowSelection(nextPoint),
    true,
  );
  return { ...finalized, changed: true };
}

export function applyLogicalDelete(
  html: string,
  selection: FlowSelectionBookmark,
  direction: 'backward' | 'forward',
): DocumentTransactionResult {
  if (!selection.collapsed) return deleteSelectedRange(html, selection);
  return deleteCollapsedUnit(html, selection.anchor, direction);
}

export function replaceLogicalSelection(
  html: string,
  selection: FlowSelectionBookmark,
  replacementHtml: string,
): DocumentTransactionResult {
  const root = createContainer(html);
  let start = domPointForFlowPoint(root, selection.anchor);
  let end = domPointForFlowPoint(root, selection.focus);
  if (!start || !end) return { html, selection, changed: false };

  const startProbe = document.createRange();
  startProbe.setStart(start.node, start.offset);
  startProbe.collapse(true);
  const endProbe = document.createRange();
  endProbe.setStart(end.node, end.offset);
  endProbe.collapse(true);
  const startBeforeEnd =
    startProbe.compareBoundaryPoints(Range.START_TO_START, endProbe) <= 0;
  if (!startBeforeEnd) [start, end] = [end, start];

  const replacementStartPoint =
    startBeforeEnd ? selection.anchor : selection.focus;
  const replacementStartOffset = documentTextOffsetForFlowPoint(
    root.innerHTML,
    replacementStartPoint,
  );

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const hadSelection = !range.collapsed;
  range.deleteContents();

  const template = document.createElement('template');
  template.innerHTML = sanitizeReplacementHtml(replacementHtml);
  const replacement = template.content;
  const replacementTextLength = fragmentTextLength(replacement);
  if (replacement.childNodes.length > 0) {
    insertReplacementNodes(root, start, replacement);
  } else if (!hadSelection) {
    const blank = document.createElement('p');
    blank.innerHTML = '<br>';
    const blankRange = document.createRange();
    blankRange.setStart(start.node, start.offset);
    blankRange.collapse(true);
    blankRange.insertNode(blank);
  }

  hydrateFlowContainer(root);
  normalizeEditedFlowIds(root);
  const caret =
    replacementStartOffset === null
      ? replacementStartPoint
      : flowPointAtDocumentTextOffset(
          root.innerHTML,
          replacementStartOffset + replacementTextLength,
        ) ?? replacementStartPoint;
  const finalized = finalizeDocumentRoot(
    root,
    collapsedFlowSelection(caret),
    true,
  );
  return { ...finalized, changed: true };
}

export function insertParagraphAtSelection(
  html: string,
  selection: FlowSelectionBookmark,
): DocumentTransactionResult {
  if (!selection.collapsed) {
    const deleted = deleteSelectedRange(html, selection);
    if (!deleted.changed || !deleted.selection?.collapsed) {
      return { html, selection, changed: false };
    }
    return insertParagraphAtSelection(deleted.html, deleted.selection);
  }

  const root = createContainer(html);
  const point = domPointForFlowPoint(root, selection.anchor);
  if (!point) return { html, selection, changed: false };

  const caretElement =
    point.node.nodeType === Node.ELEMENT_NODE
      ? (point.node as HTMLElement)
      : point.node.parentElement;
  const emptyListItem = caretElement?.closest('li') ?? null;
  if (emptyListItem && !hasSubstantiveContent(emptyListItem)) {
    const paragraph = exitEmptyListItem(emptyListItem);
    if (paragraph) {
      return finalizeListExit(root, paragraph);
    }
  }

  // A fast second Enter can arrive before repagination moves the caret into
  // the empty item the first Enter created. If the caret is at the very end
  // of a non-empty item whose list already ends in an empty item, treat this
  // press as Enter on that empty item so the user exits the list (Word-style
  // "Enter twice") instead of inserting another numbered item.
  if (emptyListItem && hasSubstantiveContent(emptyListItem)) {
    const itemLength = emptyListItem.textContent?.length ?? 0;
    const next = emptyListItem.nextElementSibling as HTMLElement | null;
    const list = emptyListItem.parentElement;
    const hasEmptyTrailingItem =
      next?.tagName === 'LI' &&
      next === list?.lastElementChild &&
      !hasSubstantiveContent(next);
    if (selection.anchor.offset >= itemLength && hasEmptyTrailingItem) {
      const paragraph = exitEmptyListItem(next);
      if (paragraph) {
        return finalizeListExit(root, paragraph);
      }
    }
  }

  const nextBlock = splitBlockAtDomPoint(root, point);
  if (!nextBlock) return { html, selection, changed: false };

  hydrateFlowContainer(root);
  normalizeEditedFlowIds(root);
  const nextFlowId = nextBlock.dataset.flowId;
  const selectionPoint = nextFlowId
    ? flowPointAtElementStart(root, nextBlock)
    : null;
  const finalized = finalizeDocumentRoot(
    root,
    selectionPoint ? collapsedFlowSelection(selectionPoint) : null,
    true,
  );
  return { ...finalized, changed: true };
}

function tableCellForPoint(
  root: HTMLElement,
  point: DomPoint,
): HTMLTableCellElement | null {
  const element =
    point.node.nodeType === Node.ELEMENT_NODE
      ? (point.node as HTMLElement)
      : point.node.parentElement;
  return element?.closest<HTMLTableCellElement>('td, th') ?? null;
}

export function insertTableRowAtSelection(
  html: string,
  selection: FlowSelectionBookmark,
): DocumentTransactionResult {
  const root = createContainer(html);
  const point = domPointForFlowPoint(root, selection.anchor);
  if (!point) return { html, selection, changed: false };
  const cell = tableCellForPoint(root, point);
  const row = cell?.closest('tr');
  if (!cell || !row) return { html, selection, changed: false };

  const newRow = document.createElement('tr');
  Array.from(row.children).forEach((sourceCell) => {
    const tagName = sourceCell.tagName.toLowerCase() === 'th' ? 'th' : 'td';
    const newCell = document.createElement(tagName);
    newCell.innerHTML = '<br>';
    newRow.appendChild(newCell);
  });
  row.insertAdjacentElement('afterend', newRow);

  hydrateFlowContainer(root);
  normalizeEditedFlowIds(root);
  const finalized = finalizeDocumentRoot(root, selection, true);
  return { ...finalized, changed: true };
}

export function insertTableColumnAtSelection(
  html: string,
  selection: FlowSelectionBookmark,
): DocumentTransactionResult {
  const root = createContainer(html);
  const point = domPointForFlowPoint(root, selection.anchor);
  if (!point) return { html, selection, changed: false };
  const cell = tableCellForPoint(root, point);
  const table = cell?.closest('table');
  const row = cell?.closest('tr');
  if (!cell || !table || !row) return { html, selection, changed: false };

  const columnIndex = Array.from(row.children).indexOf(cell);
  if (columnIndex === -1) return { html, selection, changed: false };

  Array.from(table.querySelectorAll('tr')).forEach((tableRow) => {
    const cells = Array.from(tableRow.children);
    const referenceCell = cells[Math.min(columnIndex, cells.length - 1)] as
      | HTMLTableCellElement
      | undefined;
    const tagName = referenceCell?.tagName.toLowerCase() === 'th' ? 'th' : 'td';
    const newCell = document.createElement(tagName);
    newCell.innerHTML = '<br>';

    if (referenceCell) {
      referenceCell.insertAdjacentElement('afterend', newCell);
    } else {
      tableRow.appendChild(newCell);
    }
  });

  hydrateFlowContainer(root);
  normalizeEditedFlowIds(root);
  const finalized = finalizeDocumentRoot(root, selection, true);
  return { ...finalized, changed: true };
}

function flowIdForPoint(root: HTMLElement, point: DomPoint): string | null {
  const element =
    point.node.nodeType === Node.ELEMENT_NODE
      ? (point.node as HTMLElement)
      : point.node.parentElement;
  return element?.closest<HTMLElement>('[data-flow-id]')?.dataset.flowId ?? null;
}

function trimEmptyBoundaryClone(
  fragment: DocumentFragment,
  edge: 'first' | 'last',
  boundaryFlowId: string | null,
): void {
  if (!boundaryFlowId) return;
  const candidate =
    edge === 'first' ? fragment.firstElementChild : fragment.lastElementChild;
  if (!candidate || hasSubstantiveContent(candidate)) return;

  const containsBoundary =
    (candidate as HTMLElement).dataset.flowId === boundaryFlowId ||
    Array.from(candidate.querySelectorAll<HTMLElement>('[data-flow-id]')).some(
      (element) => element.dataset.flowId === boundaryFlowId,
    );
  if (containsBoundary) candidate.remove();
}

function ensureEditableFragment(fragment: DocumentFragment): boolean {
  if (hasSubstantiveContent(fragment) || fragment.querySelector('.page-break')) {
    return false;
  }

  fragment.replaceChildren(createBlankParagraph());
  return true;
}

function normalizedSectionHtml(section: string): string {
  return section.trim() ? section : EMPTY_PARAGRAPH_HTML;
}

function materializeHardSections(root: HTMLElement): void {
  root.innerHTML = splitHardSections(root.innerHTML)
    .map(normalizedSectionHtml)
    .join(HARD_PAGE_BREAK_HTML);
}

export function insertHardPageAtSelection(
  html: string,
  selection: FlowSelectionBookmark,
): DocumentTransactionResult {
  const root = createContainer(html);
  let start = domPointForFlowPoint(root, selection.anchor);
  let end = domPointForFlowPoint(root, selection.focus);
  if (!start || !end) return { html, selection, changed: false };
  if (compareDomPoints(start, end) > 0) [start, end] = [end, start];

  const startFlowId = flowIdForPoint(root, start);
  const endFlowId = flowIdForPoint(root, end);
  const beforeRange = document.createRange();
  beforeRange.setStart(root, 0);
  beforeRange.setEnd(start.node, start.offset);
  const before = beforeRange.cloneContents();
  const afterRange = document.createRange();
  afterRange.setStart(end.node, end.offset);
  afterRange.setEnd(root, root.childNodes.length);
  const after = afterRange.cloneContents();

  trimEmptyBoundaryClone(before, 'last', startFlowId);
  trimEmptyBoundaryClone(after, 'first', endFlowId);
  ensureEditableFragment(before);
  ensureEditableFragment(after);
  const insertedBreakIndex = before.querySelectorAll('.page-break').length;

  root.replaceChildren(before, createHardBreak(), after);
  materializeHardSections(root);
  hydrateFlowContainer(root);

  const hardBreak = root.querySelectorAll<HTMLElement>('.page-break')[
    insertedBreakIndex
  ];
  const firstAfterBreak = hardBreak?.nextElementSibling as HTMLElement | null;
  const afterFlow = firstAfterBreak?.dataset.flowId
    ? firstAfterBreak
    : firstAfterBreak?.querySelector<HTMLElement>('[data-flow-id]') ?? null;
  const selectionPoint = afterFlow
    ? flowPointAtElementStart(root, afterFlow)
    : null;
  const finalized = finalizeDocumentRoot(
    root,
    selectionPoint ? collapsedFlowSelection(selectionPoint) : null,
    true,
  );
  return { ...finalized, changed: true };
}

export function appendHardPage(html: string): DocumentTransactionResult {
  const sections = splitHardSections(html).map(normalizedSectionHtml);
  sections.push(EMPTY_PARAGRAPH_HTML);
  const root = createContainer(sections.join(HARD_PAGE_BREAK_HTML));
  hydrateFlowContainer(root);

  const lastFlow = Array.from(
    root.querySelectorAll<HTMLElement>('[data-flow-id]'),
  ).at(-1);
  const selectionPoint = lastFlow
    ? flowPointAtElementStart(root, lastFlow)
    : null;
  const finalized = finalizeDocumentRoot(
    root,
    selectionPoint ? collapsedFlowSelection(selectionPoint) : null,
    true,
  );
  return { ...finalized, changed: true };
}

export function deleteHardPageSection(
  html: string,
  sectionIndex: number,
): DocumentTransactionResult {
  const sections = splitHardSections(html);
  if (
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0 ||
    sectionIndex >= sections.length
  ) {
    return { html, selection: null, changed: false };
  }

  sections.splice(sectionIndex, 1);
  const remainingSections =
    sections.length > 0 ? sections.map(normalizedSectionHtml) : [EMPTY_PARAGRAPH_HTML];
  const root = createContainer(remainingSections.join(HARD_PAGE_BREAK_HTML));
  const finalized = finalizeDocumentRoot(root, null, false);
  return { ...finalized, changed: true };
}

/**
 * Removes the explicit hard break before the requested section, merging that
 * section's content into the previous one without deleting any text. The
 * caret is placed at the start of the merged section's first flow block.
 */
export function removeHardPageBreak(
  html: string,
  sectionIndex: number,
): DocumentTransactionResult {
  if (!Number.isInteger(sectionIndex) || sectionIndex < 1) {
    return { html, selection: null, changed: false };
  }

  const root = createContainer(html);
  const breakElements = Array.from(
    root.querySelectorAll<HTMLElement>('.page-break'),
  );
  const breakElement = breakElements[sectionIndex - 1];
  if (!breakElement) {
    return { html, selection: null, changed: false };
  }

  const sectionStart = breakElement.nextElementSibling as HTMLElement | null;
  breakElement.remove();
  hydrateFlowContainer(root);
  const selectionPoint = sectionStart?.dataset.flowId
    ? flowPointAtElementStart(root, sectionStart)
    : null;
  const finalized = finalizeDocumentRoot(
    root,
    selectionPoint ? collapsedFlowSelection(selectionPoint) : null,
    true,
  );
  return { ...finalized, changed: true };
}

export function hardSectionIndexForFragment(
  fragments: PageFragment[],
  fragmentIndex: number,
): number | null {
  if (
    !Number.isInteger(fragmentIndex) ||
    fragmentIndex < 0 ||
    fragmentIndex >= fragments.length
  ) {
    return null;
  }
  return fragments
    .slice(0, fragmentIndex + 1)
    .reduce(
      (section, fragment) => section + (fragment.hardBreakBefore ? 1 : 0),
      0,
    );
}
