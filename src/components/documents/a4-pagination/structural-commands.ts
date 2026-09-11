import { ensureFlowId, normalizeEditedFlowIds } from './model';
import {
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

export type A4CommandCapability =
  | { applicable: true }
  | {
      applicable: false;
      code:
        | 'invalid-position'
        | 'table-cell-interior-unsupported'
        | 'no-manual-break'
        | 'not-blank-section'
        | 'not-in-list';
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
  code?: A4CommandCapability extends { applicable: false; code: infer C } ? C : never;
  reason?: string;
}

const INLINE_BREAK_SELECTOR = 'span[data-a4-break="page"]';
const LEGACY_BREAK_SELECTOR = '.page-break[data-break-type="hard"], .page-break';
const EXPLICIT_BREAK_SELECTOR = `${INLINE_BREAK_SELECTOR}, ${LEGACY_BREAK_SELECTOR}`;
const ATOMIC_SELECTOR = [
  '[data-field-id]',
  '[data-placeholder-id]',
  '[data-placeholder-key]',
  '[data-reference-id]',
  '[data-field-key]',
  '[data-field-reference]',
  '[contenteditable="false"]',
].join(',');

function rootFor(canonical: CanonicalEditorDocument): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = canonical.internalHtml;
  return root;
}

function elementForDomPoint(point: A4DomPoint): HTMLElement | null {
  return point.node.nodeType === Node.ELEMENT_NODE
    ? (point.node as HTMLElement)
    : point.node.parentElement;
}

function rejected(code: string, message: string): A4TransactionResult {
  return { status: 'rejected', code, message };
}

function changedIdsBeforeAfter(
  before: CanonicalEditorDocument,
  afterRoot: HTMLElement,
): readonly string[] {
  const beforeRoot = rootFor(before);
  const ids = new Set<string>();
  const beforeById = new Map<string, string>();
  beforeRoot.querySelectorAll<HTMLElement>('[data-flow-id]').forEach((element) => {
    const nodeId = element.dataset.flowId;
    if (nodeId) beforeById.set(nodeId, element.outerHTML);
  });
  afterRoot.querySelectorAll<HTMLElement>('[data-flow-id]').forEach((element) => {
    const nodeId = element.dataset.flowId;
    if (!nodeId) return;
    if (beforeById.get(nodeId) !== element.outerHTML) ids.add(nodeId);
    beforeById.delete(nodeId);
  });
  beforeById.forEach((_html, nodeId) => ids.add(nodeId));
  return Array.from(ids);
}

function finalizeApplied(
  before: CanonicalEditorDocument,
  root: HTMLElement,
  selection: A4Selection,
): A4TransactionResult {
  hydrateA4RuntimeIdentity(root);
  normalizeEditedFlowIds(root);
  const document: CanonicalEditorDocument = { internalHtml: root.innerHTML };
  const validation = normalizeA4SelectionRange(document, selection);
  if (validation.status === 'rejected') {
    return rejected('invalid-result-selection', validation.message);
  }
  return {
    status: 'applied',
    document,
    selection,
    changedNodeIds: changedIdsBeforeAfter(before, root),
  };
}

function resolvedRange(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
):
  | {
      ok: true;
      root: HTMLElement;
      range: Range;
      start: A4Position;
      end: A4Position;
      direction: 'forward' | 'reverse';
    }
  | { ok: false; result: A4TransactionResult } {
  const normalized = normalizeA4SelectionRange(canonical, selection);
  if (normalized.status === 'rejected') {
    return {
      ok: false,
      result: rejected('invalid-position', normalized.message),
    };
  }
  const root = rootFor(canonical);
  const startPoint = resolveA4Position(root, normalized.range.start);
  const endPoint = resolveA4Position(root, normalized.range.end);
  if (!startPoint || !endPoint) {
    return {
      ok: false,
      result: rejected(
        'invalid-position',
        'The structural selection no longer resolves in this document.',
      ),
    };
  }
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return {
    ok: true,
    root,
    range,
    start: normalized.range.start,
    end: normalized.range.end,
    direction: normalized.range.direction,
  };
}

function pointAfterMutation(
  root: HTMLElement,
  nodeId: string,
  domPoint: A4DomPoint,
  affinity: A4Position['affinity'] = 'after',
): A4Position | null {
  const owner = Array.from(root.querySelectorAll<HTMLElement>('[data-flow-id]')).find(
    (candidate) => candidate.dataset.flowId === nodeId,
  );
  if (!owner) return null;
  if (domPoint.node === owner) {
    return {
      kind: 'children',
      nodeId,
      index: Math.min(domPoint.offset, owner.childNodes.length),
      affinity,
    };
  }
  const probe = document.createRange();
  probe.setStart(owner, 0);
  try {
    probe.setEnd(domPoint.node, domPoint.offset);
  } catch {
    return null;
  }
  return {
    kind: 'text',
    nodeId,
    offset: probe.toString().length,
    affinity,
  };
}

function semanticOwnerId(root: HTMLElement, point: A4DomPoint): string | null {
  const element = elementForDomPoint(point);
  if (!element || !root.contains(element)) return null;
  const owner = element.closest<HTMLElement>('[data-flow-id]');
  return owner?.dataset.flowId ?? null;
}

function adjacentChild(
  point: A4DomPoint,
  direction: A4DeleteDirection,
): Node | null {
  if (point.node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = point.node as HTMLElement;
  return direction === 'backward'
    ? element.childNodes[point.offset - 1] ?? null
    : element.childNodes[point.offset] ?? null;
}

function adjacentExplicitBreak(
  root: HTMLElement,
  point: A4DomPoint,
  direction: A4DeleteDirection,
): HTMLElement | null {
  const direct = adjacentChild(point, direction);
  if (
    direct?.nodeType === Node.ELEMENT_NODE &&
    (direct as Element).matches(EXPLICIT_BREAK_SELECTOR)
  ) {
    return direct as HTMLElement;
  }

  const collapsed = document.createRange();
  collapsed.setStart(point.node, point.offset);
  collapsed.collapse(true);
  const breaks = Array.from(root.querySelectorAll<HTMLElement>(EXPLICIT_BREAK_SELECTOR));
  const ordered = direction === 'backward' ? breaks.reverse() : breaks;
  for (const marker of ordered) {
    const parent = marker.parentNode;
    if (!parent) continue;
    const index = Array.prototype.indexOf.call(parent.childNodes, marker) as number;
    const boundary = document.createRange();
    boundary.setStart(parent, index + (direction === 'backward' ? 1 : 0));
    boundary.collapse(true);
    if (collapsed.compareBoundaryPoints(Range.START_TO_START, boundary) === 0) {
      return marker;
    }
  }
  return null;
}

function adjacentAtomic(
  point: A4DomPoint,
  direction: A4DeleteDirection,
): HTMLElement | null {
  const child = adjacentChild(point, direction);
  return child?.nodeType === Node.ELEMENT_NODE &&
    (child as Element).matches(ATOMIC_SELECTOR)
    ? (child as HTMLElement)
    : null;
}

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) nodes.push(current as Text);
  return nodes;
}

function comparePoints(left: A4DomPoint, right: A4DomPoint): number {
  const a = document.createRange();
  a.setStart(left.node, left.offset);
  a.collapse(true);
  const b = document.createRange();
  b.setStart(right.node, right.offset);
  b.collapse(true);
  return a.compareBoundaryPoints(Range.START_TO_START, b);
}

function graphemeBounds(
  text: string,
  requestedIndex: number,
): { start: number; end: number } | null {
  if (!text.length) return null;
  const Segmenter = Intl.Segmenter;
  if (Segmenter) {
    const segments = Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text));
    for (const segment of segments) {
      const start = segment.index;
      const end = start + segment.segment.length;
      if (requestedIndex >= start && requestedIndex < end) return { start, end };
    }
  }
  const codePoint = Array.from(text.slice(requestedIndex))[0];
  if (!codePoint) return null;
  return { start: requestedIndex, end: requestedIndex + codePoint.length };
}

function deleteAdjacentGrapheme(
  root: HTMLElement,
  point: A4DomPoint,
  direction: A4DeleteDirection,
): { changed: boolean; caret: A4DomPoint; ownerId: string | null } {
  const nodes = textNodes(root);
  const candidates = direction === 'backward' ? [...nodes].reverse() : nodes;
  for (const text of candidates) {
    const startPoint = { node: text, offset: 0 } satisfies A4DomPoint;
    const endPoint = { node: text, offset: text.length } satisfies A4DomPoint;
    const relationToStart = comparePoints(point, startPoint);
    const relationToEnd = comparePoints(point, endPoint);
    let targetIndex: number | null = null;
    if (point.node === text) {
      if (direction === 'backward' && point.offset > 0) targetIndex = point.offset - 1;
      if (direction === 'forward' && point.offset < text.length) targetIndex = point.offset;
    } else if (direction === 'backward' && relationToEnd >= 0) {
      targetIndex = text.length - 1;
    } else if (direction === 'forward' && relationToStart <= 0) {
      targetIndex = 0;
    }
    if (targetIndex === null || targetIndex < 0) continue;
    const bounds = graphemeBounds(text.data, targetIndex);
    if (!bounds) continue;
    const ownerId = text.parentElement?.closest<HTMLElement>('[data-flow-id]')?.dataset.flowId ?? null;
    text.deleteData(bounds.start, bounds.end - bounds.start);
    return {
      changed: true,
      caret: { node: text, offset: bounds.start },
      ownerId,
    };
  }
  return { changed: false, caret: point, ownerId: semanticOwnerId(root, point) };
}

function collapseAfterRangeDeletion(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
):
  | { ok: true; root: HTMLElement; point: A4DomPoint; position: A4Position }
  | { ok: false; result: A4TransactionResult } {
  const resolved = resolvedRange(canonical, selection);
  if (!resolved.ok) return resolved;
  const ownerId = semanticOwnerId(resolved.root, {
    node: resolved.range.startContainer,
    offset: resolved.range.startOffset,
  });
  resolved.range.deleteContents();
  const point: A4DomPoint = {
    node: resolved.range.startContainer,
    offset: resolved.range.startOffset,
  };
  hydrateA4RuntimeIdentity(resolved.root);
  const fallbackOwner = ownerId ?? semanticOwnerId(resolved.root, point);
  if (!fallbackOwner) {
    return {
      ok: false,
      result: rejected('invalid-position', 'The selected range has no semantic caret target.'),
    };
  }
  const position = pointAfterMutation(resolved.root, fallbackOwner, point) ?? {
    kind: 'text' as const,
    nodeId: fallbackOwner,
    offset: 0,
    affinity: 'after' as const,
  };
  return { ok: true, root: resolved.root, point, position };
}

export function getInsertManualBreakCapability(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4CommandCapability {
  const normalized = normalizeA4SelectionRange(canonical, selection);
  if (normalized.status === 'rejected') {
    return { applicable: false, code: 'invalid-position', reason: normalized.message };
  }
  const root = rootFor(canonical);
  const start = resolveA4Position(root, normalized.range.start);
  const end = resolveA4Position(root, normalized.range.end);
  if (!start || !end) {
    return {
      applicable: false,
      code: 'invalid-position',
      reason: 'The structural selection no longer resolves.',
    };
  }
  const startElement = elementForDomPoint(start);
  const endElement = elementForDomPoint(end);
  if (startElement?.closest('td, th') || endElement?.closest('td, th')) {
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
  const prepared = collapseAfterRangeDeletion(canonical, selection);
  if (!prepared.ok) return prepared.result;
  const marker = document.createElement('span');
  marker.dataset.a4Break = 'page';
  ensureFlowId(marker);
  const range = document.createRange();
  range.setStart(prepared.point.node, prepared.point.offset);
  range.collapse(true);
  range.insertNode(marker);
  const parent = marker.parentElement;
  if (!parent) return rejected('invalid-position', 'The page break could not be inserted.');
  const parentId = ensureFlowId(parent);
  const index = Array.prototype.indexOf.call(parent.childNodes, marker) as number;
  const caret: A4Position = {
    kind: 'children',
    nodeId: parentId,
    index: index + 1,
    affinity: 'after',
  };
  return finalizeApplied(canonical, prepared.root, { anchor: caret, focus: caret });
}

function breakAtSelectionBoundary(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): { root: HTMLElement; marker: HTMLElement; position: A4Position } | null {
  const normalized = normalizeA4SelectionRange(canonical, selection);
  if (normalized.status === 'rejected' || !normalized.range.collapsed) return null;
  const root = rootFor(canonical);
  const point = resolveA4Position(root, normalized.range.start);
  if (!point) return null;
  const marker =
    adjacentExplicitBreak(root, point, 'backward') ??
    adjacentExplicitBreak(root, point, 'forward');
  if (!marker) return null;
  const parent = marker.parentElement;
  const parentId = parent?.dataset.flowId;
  if (!parent || !parentId) return null;
  const index = Array.prototype.indexOf.call(parent.childNodes, marker) as number;
  return {
    root,
    marker,
    position: { kind: 'children', nodeId: parentId, index, affinity: 'after' },
  };
}

export function getRemoveManualBreakCapability(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4CommandCapability {
  return breakAtSelectionBoundary(canonical, selection)
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
  const found = breakAtSelectionBoundary(canonical, selection);
  if (!found) {
    return {
      status: 'unchanged',
      reason: 'There is no explicit manual page break at this structural boundary.',
    };
  }
  found.marker.remove();
  const caret = found.position;
  return finalizeApplied(canonical, found.root, { anchor: caret, focus: caret });
}

export function deleteA4Selection(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
  direction: A4DeleteDirection,
): A4TransactionResult {
  const normalized = normalizeA4SelectionRange(canonical, selection);
  if (normalized.status === 'rejected') {
    return rejected('invalid-position', normalized.message);
  }
  if (!normalized.range.collapsed) {
    const prepared = collapseAfterRangeDeletion(canonical, selection);
    if (!prepared.ok) return prepared.result;
    return finalizeApplied(canonical, prepared.root, {
      anchor: prepared.position,
      focus: prepared.position,
    });
  }

  const root = rootFor(canonical);
  const point = resolveA4Position(root, normalized.range.start);
  if (!point) {
    return rejected('invalid-position', 'The structural caret no longer resolves.');
  }

  const explicitBreak = adjacentExplicitBreak(root, point, direction);
  if (explicitBreak) {
    const parent = explicitBreak.parentElement;
    const parentId = parent?.dataset.flowId;
    if (!parent || !parentId) {
      return rejected('invalid-position', 'The manual page-break boundary is invalid.');
    }
    const index = Array.prototype.indexOf.call(parent.childNodes, explicitBreak) as number;
    explicitBreak.remove();
    const caret: A4Position = {
      kind: 'children',
      nodeId: parentId,
      index,
      affinity: 'after',
    };
    return finalizeApplied(canonical, root, { anchor: caret, focus: caret });
  }

  const atomic = adjacentAtomic(point, direction);
  if (atomic) {
    const parent = atomic.parentElement;
    const parentId = parent?.dataset.flowId;
    if (parent && parentId) {
      const index = Array.prototype.indexOf.call(parent.childNodes, atomic) as number;
      atomic.remove();
      const caret: A4Position = {
        kind: 'children',
        nodeId: parentId,
        index,
        affinity: 'after',
      };
      return finalizeApplied(canonical, root, { anchor: caret, focus: caret });
    }
  }

  const deletion = deleteAdjacentGrapheme(root, point, direction);
  if (!deletion.changed) {
    return { status: 'unchanged', reason: 'There is no logical content to delete.' };
  }
  hydrateA4RuntimeIdentity(root);
  const ownerId = deletion.ownerId ?? semanticOwnerId(root, deletion.caret);
  if (!ownerId) return rejected('invalid-position', 'Deleted text has no semantic owner.');
  const caret = pointAfterMutation(root, ownerId, deletion.caret, 'after');
  if (!caret) return rejected('invalid-position', 'The post-delete caret could not be mapped.');
  return finalizeApplied(canonical, root, { anchor: caret, focus: caret });
}

export function insertA4LineBreak(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4TransactionResult {
  const prepared = collapseAfterRangeDeletion(canonical, selection);
  if (!prepared.ok) return prepared.result;
  const ownerId = semanticOwnerId(prepared.root, prepared.point);
  if (!ownerId) return rejected('invalid-position', 'The line-break caret has no semantic owner.');
  const lineBreak = document.createElement('br');
  ensureFlowId(lineBreak);
  const range = document.createRange();
  range.setStart(prepared.point.node, prepared.point.offset);
  range.collapse(true);
  range.insertNode(lineBreak);
  const parent = lineBreak.parentElement;
  if (!parent) return rejected('invalid-position', 'The line break could not be inserted.');
  const parentId = ensureFlowId(parent);
  const index = Array.prototype.indexOf.call(parent.childNodes, lineBreak) as number;
  const caret: A4Position = {
    kind: 'children',
    nodeId: parentId,
    index: index + 1,
    affinity: 'after',
  };
  return finalizeApplied(canonical, prepared.root, { anchor: caret, focus: caret });
}

function closestParagraphLike(root: HTMLElement, point: A4DomPoint): HTMLElement | null {
  let element = elementForDomPoint(point);
  while (element && element !== root) {
    if (/^(P|DIV|BLOCKQUOTE|H[1-6]|LI)$/.test(element.tagName)) return element;
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
  const prepared = collapseAfterRangeDeletion(canonical, selection);
  if (!prepared.ok) return prepared.result;
  const block = closestParagraphLike(prepared.root, prepared.point);
  if (!block) {
    return { status: 'unchanged', reason: 'The caret is not in a splittable logical block.' };
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

  if (block.tagName === 'LI') {
    const nextItem = cloneBlockShell(block);
    nextItem.appendChild(after);
    block.replaceChildren(before);
    if (!block.hasChildNodes()) block.appendChild(document.createElement('br'));
    if (!nextItem.hasChildNodes()) nextItem.appendChild(document.createElement('p')).appendChild(document.createElement('br'));
    block.after(nextItem);
    hydrateA4RuntimeIdentity(prepared.root);
    const nextId = ensureFlowId(nextItem);
    const caret: A4Position = { kind: 'children', nodeId: nextId, index: 0, affinity: 'after' };
    return finalizeApplied(canonical, prepared.root, { anchor: caret, focus: caret });
  }

  const nextBlock = cloneBlockShell(block);
  nextBlock.appendChild(after);
  block.replaceChildren(before);
  if (!block.hasChildNodes()) block.appendChild(document.createElement('br'));
  if (!nextBlock.hasChildNodes()) nextBlock.appendChild(document.createElement('br'));
  block.after(nextBlock);
  hydrateA4RuntimeIdentity(prepared.root);
  const nextId = ensureFlowId(nextBlock);
  const caret: A4Position = { kind: 'children', nodeId: nextId, index: 0, affinity: 'after' };
  return finalizeApplied(canonical, prepared.root, { anchor: caret, focus: caret });
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
  const element = point ? elementForDomPoint(point) : null;
  const item = element?.closest<HTMLElement>('li') ?? null;
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

function isBlankBlock(element: Element | null): boolean {
  if (!element) return false;
  return !(element.textContent ?? '').trim() && !element.querySelector('img,table,hr,input,textarea,video,audio,svg');
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
      reason: normalized.status === 'rejected' ? normalized.message : 'Select a single structural caret.',
    };
  }
  const root = rootFor(canonical);
  const point = resolveA4Position(root, normalized.range.start);
  if (!point) {
    return { applicable: false, scope: 'none', code: 'invalid-position', reason: 'The caret no longer resolves.' };
  }
  if (
    adjacentExplicitBreak(root, point, 'backward') ||
    adjacentExplicitBreak(root, point, 'forward')
  ) {
    return { applicable: true, scope: 'break' };
  }
  const element = elementForDomPoint(point);
  const topBlock = element?.closest<HTMLElement>('[data-flow-id]') ?? null;
  if (topBlock && isBlankBlock(topBlock)) {
    const previous = topBlock.previousElementSibling;
    const next = topBlock.nextElementSibling;
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

/** Convenience for callers that start from persisted HTML. */
export function createA4CommandDocument(html: string): CanonicalEditorDocument {
  return createCanonicalEditorDocument(html);
}
