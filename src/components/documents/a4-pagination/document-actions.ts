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
  normalizeCanonicalHtml,
  splitHardSections,
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

function sanitizeReplacementHtml(html: string): string {
  return DOMPurify.sanitize(html, {
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
      'align',
      'valign',
      'width',
      'height',
      'data-break-type',
      'data-flow-id',
      'data-flow-continuation',
      'data-flow-oversized',
    ],
  });
}

function fragmentTextLength(fragment: DocumentFragment): number {
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment.cloneNode(true));
  return wrapper.textContent?.length ?? 0;
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
  nextBlock.innerHTML = afterWrapper.innerHTML || '<br>';
  block.innerHTML = beforeWrapper.innerHTML || '<br>';
  block.after(nextBlock);
  return nextBlock;
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

function collapsed(point: FlowPoint): FlowSelectionBookmark {
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

function finalizeRoot(
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
        ? collapsed(fallbackPoint)
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

  const finalized = finalizeRoot(root, collapsed(startPoint), true);
  return { ...finalized, changed: true };
}

function deleteCollapsedUnit(
  html: string,
  point: FlowPoint,
  direction: 'backward' | 'forward',
): DocumentTransactionResult {
  const root = createContainer(html);
  const domPoint = domPointForFlowPoint(root, point);
  if (!domPoint) return { html, selection: collapsed(point), changed: false };

  const unit =
    direction === 'forward'
      ? nextLogicalUnit(root, domPoint)
      : previousLogicalUnit(root, domPoint);
  if (!unit) return { html, selection: collapsed(point), changed: false };

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

  const finalized = finalizeRoot(root, collapsed(nextPoint), true);
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
    range.insertNode(replacement);
  } else if (!hadSelection) {
    const blank = document.createElement('p');
    blank.innerHTML = '<br>';
    range.insertNode(blank);
  }

  hydrateFlowContainer(root);
  const caret =
    replacementStartOffset === null
      ? replacementStartPoint
      : flowPointAtDocumentTextOffset(
          root.innerHTML,
          replacementStartOffset + replacementTextLength,
        ) ?? replacementStartPoint;
  const finalized = finalizeRoot(root, collapsed(caret), true);
  return { ...finalized, changed: true };
}

export function insertParagraphAtSelection(
  html: string,
  selection: FlowSelectionBookmark,
): DocumentTransactionResult {
  const root = createContainer(html);
  const point = domPointForFlowPoint(root, selection.anchor);
  if (!point) return { html, selection, changed: false };

  const nextBlock = splitBlockAtDomPoint(root, point);
  if (!nextBlock) return { html, selection, changed: false };

  hydrateFlowContainer(root);
  const nextFlowId = nextBlock.dataset.flowId;
  const selectionPoint = nextFlowId
    ? flowPointAtElementStart(root, nextBlock)
    : null;
  const finalized = finalizeRoot(
    root,
    selectionPoint ? collapsed(selectionPoint) : null,
    true,
  );
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
  const finalized = finalizeRoot(
    root,
    selectionPoint ? collapsed(selectionPoint) : null,
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
  const finalized = finalizeRoot(
    root,
    selectionPoint ? collapsed(selectionPoint) : null,
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
  const finalized = finalizeRoot(root, null, false);
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
