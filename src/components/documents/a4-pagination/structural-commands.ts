import { ensureFlowId, normalizeEditedFlowIds } from './model';
import {
  captureA4Position,
  createCanonicalEditorDocument,
  hydrateA4RuntimeIdentity,
  normalizeA4SelectionRange,
  resolveA4Position,
  validateA4Position,
  type A4DomPoint,
  type A4Position,
  type A4Selection,
  type A4TransactionResult,
  type CanonicalEditorDocument,
} from './structural-position';

export type A4DeleteDirection = 'backward' | 'forward';
export type A4CommandCapabilityCode =
  | 'invalid-position'
  | 'table-cell-interior-unsupported'
  | 'no-manual-break'
  | 'not-blank-section'
  | 'not-in-list';

export type A4CommandCapability =
  | { applicable: true }
  | {
      applicable: false;
      code: A4CommandCapabilityCode;
      reason: string;
    };

export interface A4ListLevelContext {
  inList: boolean;
  level: number;
  listNodeIds: readonly string[];
  itemNodeId: string | null;
}

export interface A4BlankPageCapability {
  applicable: boolean;
  scope: 'break' | 'blank-hard-section' | 'none';
  code?: A4CommandCapabilityCode;
  reason?: string;
}

const INLINE_BREAK_SELECTOR = 'span[data-a4-break="page"]';
const LEGACY_BREAK_SELECTOR = '.page-break[data-break-type="hard"], .page-break';
const EXPLICIT_BREAK_SELECTOR = `${INLINE_BREAK_SELECTOR}, ${LEGACY_BREAK_SELECTOR}`;

interface ResolvedSelection {
  root: HTMLElement;
  range: Range;
  collapsed: boolean;
  startPosition: A4Position;
}

function rootFor(canonical: CanonicalEditorDocument): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = canonical.internalHtml;
  return root;
}

function rejected(code: string, message: string): A4TransactionResult {
  return { status: 'rejected', code, message };
}

function elementForPoint(point: A4DomPoint): HTMLElement | null {
  return point.node.nodeType === Node.ELEMENT_NODE
    ? (point.node as HTMLElement)
    : point.node.parentElement;
}

function resolveSelection(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): ResolvedSelection | A4TransactionResult {
  const normalized = normalizeA4SelectionRange(canonical, selection);
  if (normalized.status === 'rejected') {
    return rejected('invalid-position', normalized.message);
  }
  const root = rootFor(canonical);
  const start = resolveA4Position(root, normalized.range.start);
  const end = resolveA4Position(root, normalized.range.end);
  if (!start || !end) {
    return rejected(
      'invalid-position',
      'The structural selection no longer resolves in this canonical document.',
    );
  }
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return {
    root,
    range,
    collapsed: normalized.range.collapsed,
    startPosition: normalized.range.start,
  };
}

function isTransactionResult(
  value: ResolvedSelection | A4TransactionResult,
): value is A4TransactionResult {
  return 'status' in value;
}

function changedNodeIds(
  before: CanonicalEditorDocument,
  afterRoot: HTMLElement,
): readonly string[] {
  const beforeRoot = rootFor(before);
  const beforeById = new Map<string, string>();
  const changed = new Set<string>();
  beforeRoot.querySelectorAll<HTMLElement>('[data-flow-id]').forEach((element) => {
    const nodeId = element.dataset.flowId;
    if (nodeId) beforeById.set(nodeId, element.outerHTML);
  });
  afterRoot.querySelectorAll<HTMLElement>('[data-flow-id]').forEach((element) => {
    const nodeId = element.dataset.flowId;
    if (!nodeId) return;
    if (beforeById.get(nodeId) !== element.outerHTML) changed.add(nodeId);
    beforeById.delete(nodeId);
  });
  beforeById.forEach((_html, nodeId) => changed.add(nodeId));
  return [...changed];
}

function finishApplied(
  before: CanonicalEditorDocument,
  root: HTMLElement,
  point: A4DomPoint,
  affinity: A4Position['affinity'] = 'after',
): A4TransactionResult {
  hydrateA4RuntimeIdentity(root);
  normalizeEditedFlowIds(root);
  const position = captureA4Position(root, point.node, point.offset, affinity);
  if (!position) {
    return rejected(
      'invalid-result-selection',
      'The semantic command applied but its resulting caret could not be mapped.',
    );
  }
  const nextDocument: CanonicalEditorDocument = { internalHtml: root.innerHTML };
  const validation = normalizeA4SelectionRange(nextDocument, {
    anchor: position,
    focus: position,
  });
  if (validation.status === 'rejected') {
    return rejected('invalid-result-selection', validation.message);
  }
  return {
    status: 'applied',
    document: nextDocument,
    selection: { anchor: position, focus: position },
    changedNodeIds: changedNodeIds(before, root),
  };
}

function collapseSelectedRange(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
):
  | { root: HTMLElement; point: A4DomPoint }
  | A4TransactionResult {
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) return resolved;
  if (!resolved.collapsed) resolved.range.deleteContents();
  const point = resolveA4Position(resolved.root, resolved.startPosition);
  return point
    ? { root: resolved.root, point }
    : rejected(
        'invalid-result-selection',
        'The normalized logical selection start could not be restored after range deletion.',
      );
}

function pointAtBoundarySibling(
  root: HTMLElement,
  point: A4DomPoint,
  direction: A4DeleteDirection,
): Node | null {
  const backwards = direction === 'backward';
  const node: Node = point.node;
  const offset = point.offset;

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const direct = backwards
      ? element.childNodes[offset - 1] ?? null
      : element.childNodes[offset] ?? null;
    if (direct) return direct;
    if ((backwards && offset !== 0) || (!backwards && offset !== element.childNodes.length)) {
      return null;
    }
  } else if (node.nodeType === Node.TEXT_NODE) {
    const length = node.textContent?.length ?? 0;
    if ((backwards && offset !== 0) || (!backwards && offset !== length)) {
      return null;
    }
  }

  let child: Node = node;
  let parent = child.parentNode;
  while (parent && parent !== root) {
    const index = Array.prototype.indexOf.call(parent.childNodes, child) as number;
    if (backwards) {
      if (index > 0) return parent.childNodes[index - 1];
      if (index !== 0) return null;
    } else {
      if (index + 1 < parent.childNodes.length) return parent.childNodes[index + 1];
      if (index !== parent.childNodes.length - 1) return null;
    }
    child = parent;
    parent = parent.parentNode;
  }

  if (parent === root) {
    const index = Array.prototype.indexOf.call(root.childNodes, child) as number;
    return backwards
      ? root.childNodes[index - 1] ?? null
      : root.childNodes[index + 1] ?? null;
  }
  return null;
}

function adjacentExplicitBreak(
  root: HTMLElement,
  point: A4DomPoint,
  direction: A4DeleteDirection,
): HTMLElement | null {
  const candidate = pointAtBoundarySibling(root, point, direction);
  return candidate?.nodeType === Node.ELEMENT_NODE &&
    (candidate as Element).matches(EXPLICIT_BREAK_SELECTOR)
    ? (candidate as HTMLElement)
    : null;
}

function caretAfterRemovingNode(
  root: HTMLElement,
  node: HTMLElement,
): A4DomPoint | null {
  const parent = node.parentNode;
  if (!parent || !(parent === root || root.contains(parent))) return null;
  const index = Array.prototype.indexOf.call(parent.childNodes, node) as number;
  node.remove();

  if (parent === root) {
    const previous = root.childNodes[index - 1] ?? null;
    if (previous) {
      return previous.nodeType === Node.TEXT_NODE
        ? { node: previous, offset: previous.textContent?.length ?? 0 }
        : { node: previous, offset: previous.childNodes.length };
    }
    const next = root.childNodes[index] ?? null;
    return next ? { node: next, offset: 0 } : null;
  }

  return { node: parent, offset: Math.max(0, index) };
}

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) nodes.push(current as Text);
  return nodes;
}

function comparePoints(left: A4DomPoint, right: A4DomPoint): number {
  const leftRange = document.createRange();
  leftRange.setStart(left.node, left.offset);
  leftRange.collapse(true);
  const rightRange = document.createRange();
  rightRange.setStart(right.node, right.offset);
  rightRange.collapse(true);
  return leftRange.compareBoundaryPoints(Range.START_TO_START, rightRange);
}

function graphemeBounds(
  value: string,
  targetIndex: number,
): { start: number; end: number } | null {
  if (!value.length || targetIndex < 0 || targetIndex >= value.length) return null;
  if (typeof Intl.Segmenter === 'function') {
    const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value);
    for (const segment of segments) {
      const start = segment.index;
      const end = start + segment.segment.length;
      if (targetIndex >= start && targetIndex < end) return { start, end };
    }
  }
  const codePoint = Array.from(value.slice(targetIndex))[0];
  return codePoint
    ? { start: targetIndex, end: targetIndex + codePoint.length }
    : null;
}

function deleteAdjacentGrapheme(
  root: HTMLElement,
  point: A4DomPoint,
  direction: A4DeleteDirection,
): A4DomPoint | null {
  const candidates = direction === 'backward'
    ? textNodes(root).reverse()
    : textNodes(root);
  for (const text of candidates) {
    let target: number | null = null;
    if (point.node === text) {
      target = direction === 'backward'
        ? point.offset > 0 ? point.offset - 1 : null
        : point.offset < text.length ? point.offset : null;
    } else {
      const start: A4DomPoint = { node: text, offset: 0 };
      const end: A4DomPoint = { node: text, offset: text.length };
      if (direction === 'backward' && comparePoints(point, end) >= 0) {
        target = text.length - 1;
      }
      if (direction === 'forward' && comparePoints(point, start) <= 0) {
        target = 0;
      }
    }
    if (target === null) continue;
    const bounds = graphemeBounds(text.data, target);
    if (!bounds) continue;
    text.deleteData(bounds.start, bounds.end - bounds.start);
    return { node: text, offset: bounds.start };
  }
  return null;
}

export function getInsertManualBreakCapability(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4CommandCapability {
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) {
    return {
      applicable: false,
      code: 'invalid-position',
      reason: resolved.status === 'rejected' ? resolved.message : 'Invalid structural selection.',
    };
  }
  const start = elementForPoint({
    node: resolved.range.startContainer,
    offset: resolved.range.startOffset,
  });
  const end = elementForPoint({
    node: resolved.range.endContainer,
    offset: resolved.range.endOffset,
  });
  if (start?.closest('td, th') || end?.closest('td, th')) {
    return {
      applicable: false,
      code: 'table-cell-interior-unsupported',
      reason: 'Manual page breaks inside table cells are not supported.',
    };
  }
  return { applicable: true };
}

export function insertA4ManualPageBreak(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4TransactionResult {
  const capability = getInsertManualBreakCapability(canonical, selection);
  if (!capability.applicable) return rejected(capability.code, capability.reason);
  const prepared = collapseSelectedRange(canonical, selection);
  if ('status' in prepared) return prepared;
  const marker = document.createElement('span');
  marker.dataset.a4Break = 'page';
  ensureFlowId(marker);
  const range = document.createRange();
  range.setStart(prepared.point.node, prepared.point.offset);
  range.collapse(true);
  range.insertNode(marker);
  const parent = marker.parentNode;
  if (!parent) return rejected('invalid-position', 'The manual break could not be inserted.');
  const index = Array.prototype.indexOf.call(parent.childNodes, marker) as number;
  return finishApplied(canonical, prepared.root, { node: parent, offset: index + 1 }, 'after');
}

function breakAtCaret(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): { root: HTMLElement; marker: HTMLElement } | null {
  const normalized = normalizeA4SelectionRange(canonical, selection);
  if (normalized.status === 'rejected' || !normalized.range.collapsed) return null;
  const root = rootFor(canonical);
  const point = resolveA4Position(root, normalized.range.start);
  if (!point) return null;
  const marker =
    adjacentExplicitBreak(root, point, 'backward') ??
    adjacentExplicitBreak(root, point, 'forward');
  return marker ? { root, marker } : null;
}

export function getRemoveManualBreakCapability(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4CommandCapability {
  return breakAtCaret(canonical, selection)
    ? { applicable: true }
    : {
        applicable: false,
        code: 'no-manual-break',
        reason: 'There is no explicit manual page break at this structural boundary.',
      };
}

export function removeA4ManualPageBreak(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4TransactionResult {
  const found = breakAtCaret(canonical, selection);
  if (!found) {
    return {
      status: 'unchanged',
      reason: 'There is no explicit manual page break at this structural boundary.',
    };
  }
  const point = caretAfterRemovingNode(found.root, found.marker);
  return point
    ? finishApplied(canonical, found.root, point, 'after')
    : rejected('invalid-position', 'The manual page-break boundary is invalid.');
}

export function deleteA4Selection(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
  direction: A4DeleteDirection,
): A4TransactionResult {
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) return resolved;

  if (!resolved.collapsed) {
    resolved.range.deleteContents();
    const point = resolveA4Position(resolved.root, resolved.startPosition);
    return point
      ? finishApplied(canonical, resolved.root, point)
      : rejected(
          'invalid-result-selection',
          'The normalized logical selection start could not be restored after range deletion.',
        );
  }

  const point: A4DomPoint = {
    node: resolved.range.startContainer,
    offset: resolved.range.startOffset,
  };
  const marker = adjacentExplicitBreak(resolved.root, point, direction);
  if (marker) {
    const next = caretAfterRemovingNode(resolved.root, marker);
    return next
      ? finishApplied(canonical, resolved.root, next)
      : rejected('invalid-position', 'The manual page-break boundary is invalid.');
  }

  const next = deleteAdjacentGrapheme(resolved.root, point, direction);
  return next
    ? finishApplied(canonical, resolved.root, next)
    : { status: 'unchanged', reason: 'There is no logical content to delete.' };
}

export function insertA4LineBreak(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4TransactionResult {
  const prepared = collapseSelectedRange(canonical, selection);
  if ('status' in prepared) return prepared;
  const br = document.createElement('br');
  ensureFlowId(br);
  const range = document.createRange();
  range.setStart(prepared.point.node, prepared.point.offset);
  range.collapse(true);
  range.insertNode(br);
  const parent = br.parentNode;
  if (!parent) return rejected('invalid-position', 'The line break could not be inserted.');
  const index = Array.prototype.indexOf.call(parent.childNodes, br) as number;
  return finishApplied(canonical, prepared.root, { node: parent, offset: index + 1 }, 'after');
}

function paragraphBlockForPoint(root: HTMLElement, point: A4DomPoint): HTMLElement | null {
  let element = elementForPoint(point);
  while (element && element !== root) {
    if (/^(P|DIV|BLOCKQUOTE|H[1-6])$/.test(element.tagName)) return element;
    element = element.parentElement;
  }
  return null;
}

function cloneBlockShell(block: HTMLElement): HTMLElement {
  const clone = block.cloneNode(false) as HTMLElement;
  clone.removeAttribute('data-flow-id');
  clone.removeAttribute('data-flow-continuation');
  clone.removeAttribute('data-flow-continuation-item');
  clone.removeAttribute('data-flow-oversized');
  return clone;
}

export function insertA4ParagraphBreak(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4TransactionResult {
  const prepared = collapseSelectedRange(canonical, selection);
  if ('status' in prepared) return prepared;
  const block = paragraphBlockForPoint(prepared.root, prepared.point);
  if (!block) {
    return { status: 'unchanged', reason: 'The caret is not in a splittable paragraph block.' };
  }
  if (block.closest('td, th')) {
    return {
      status: 'unchanged',
      reason: 'Paragraph splitting inside table cells remains browser-native until a table command contract is assigned.',
    };
  }

  const beforeRange = document.createRange();
  beforeRange.setStart(block, 0);
  beforeRange.setEnd(prepared.point.node, prepared.point.offset);
  const afterRange = document.createRange();
  afterRange.setStart(prepared.point.node, prepared.point.offset);
  afterRange.setEnd(block, block.childNodes.length);
  const before = beforeRange.cloneContents();
  const after = afterRange.cloneContents();

  const next = cloneBlockShell(block);
  next.appendChild(after);
  block.replaceChildren(before);
  if (!block.hasChildNodes()) block.appendChild(document.createElement('br'));
  if (!next.hasChildNodes()) next.appendChild(document.createElement('br'));
  block.after(next);
  hydrateA4RuntimeIdentity(prepared.root);
  ensureFlowId(next);
  return finishApplied(canonical, prepared.root, { node: next, offset: 0 }, 'after');
}

export function getA4ListLevelContext(
  canonical: CanonicalEditorDocument,
  position: A4Position,
): A4ListLevelContext {
  const root = rootFor(canonical);
  const validation = validateA4Position(root, position);
  if (validation.status === 'rejected') {
    return { inList: false, level: 0, listNodeIds: [], itemNodeId: null };
  }
  const point = resolveA4Position(root, position);
  const item = point
    ? elementForPoint(point)?.closest<HTMLElement>('li') ?? null
    : null;
  if (!item) return { inList: false, level: 0, listNodeIds: [], itemNodeId: null };
  const listNodeIds: string[] = [];
  let current: HTMLElement | null = item.parentElement;
  while (current && current !== root) {
    if ((current.tagName === 'OL' || current.tagName === 'UL') && current.dataset.flowId) {
      listNodeIds.unshift(current.dataset.flowId);
    }
    current = current.parentElement;
  }
  return {
    inList: true,
    level: listNodeIds.length,
    listNodeIds,
    itemNodeId: item.dataset.flowId ?? null,
  };
}

export function getTableBreakCapability(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4CommandCapability {
  return getInsertManualBreakCapability(canonical, selection);
}

function isBlankBlock(element: HTMLElement): boolean {
  return !(element.textContent ?? '').trim() &&
    !element.querySelector('img,table,hr,input,textarea,video,audio,svg');
}

export function getDeleteBlankPageOrBreakCapability(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4BlankPageCapability {
  const normalized = normalizeA4SelectionRange(canonical, selection);
  if (normalized.status === 'rejected' || !normalized.range.collapsed) {
    return {
      applicable: false,
      scope: 'none',
      code: 'invalid-position',
      reason: normalized.status === 'rejected'
        ? normalized.message
        : 'A blank-page capability requires a collapsed structural caret.',
    };
  }
  const root = rootFor(canonical);
  const point = resolveA4Position(root, normalized.range.start);
  if (!point) {
    return {
      applicable: false,
      scope: 'none',
      code: 'invalid-position',
      reason: 'The structural caret no longer resolves.',
    };
  }
  if (
    adjacentExplicitBreak(root, point, 'backward') ||
    adjacentExplicitBreak(root, point, 'forward')
  ) {
    return { applicable: true, scope: 'break' };
  }
  const block = elementForPoint(point)?.closest<HTMLElement>('[data-flow-id]');
  if (block && isBlankBlock(block)) {
    const previous = block.previousElementSibling;
    const next = block.nextElementSibling;
    if (previous?.matches(EXPLICIT_BREAK_SELECTOR) || next?.matches(EXPLICIT_BREAK_SELECTOR)) {
      return { applicable: true, scope: 'blank-hard-section' };
    }
  }
  return {
    applicable: false,
    scope: 'none',
    code: 'not-blank-section',
    reason: 'Soft page continuation is a projection and has no physical delete-page mutation.',
  };
}

export function createA4CommandDocument(html: string): CanonicalEditorDocument {
  return createCanonicalEditorDocument(html);
}
