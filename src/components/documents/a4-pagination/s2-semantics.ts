import { normalizeEditedFlowIds } from './model';
import type { InlineFormatPatch, InlineToggleState } from './formatting';
import {
  captureA4Position,
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

export type A4S2ListType = 'ordered' | 'unordered' | 'alpha';
export type A4S2IndentDirection = 'indent' | 'outdent';

export interface A4S2Capability {
  applicable: boolean;
  code?:
    | 'invalid-position'
    | 'not-in-list'
    | 'first-item-cannot-indent'
    | 'outermost-item-cannot-outdent'
    | 'not-ordered-list'
    | 'no-continuation-source'
    | 'incompatible-continuation-source'
    | 'unsupported-indent-unit'
    | 'indent-limit-reached';
  reason?: string;
}

export interface A4S2IndentMetrics {
  /** Measured font size of the target paragraph in CSS pixels. */
  emPx: number;
  /** Measured root font size in CSS pixels. */
  remPx: number;
  /** Maximum usable left indent in CSS pixels for this layout. */
  maxIndentPx: number;
}

export interface A4S2IndentValueResult {
  changed: boolean;
  value: string | null;
  code?: 'unsupported-indent-unit' | 'indent-limit-reached';
}

export type A4S2UniformValue<T> =
  | { state: 'uniform'; value: T }
  | { state: 'mixed' };

export interface A4S2FormattingState {
  bold: InlineToggleState;
  italic: InlineToggleState;
  underline: InlineToggleState;
  fontFamily: A4S2UniformValue<string | null>;
  fontSize: A4S2UniformValue<string | null>;
  textColor: A4S2UniformValue<string | null>;
  highlightColor: A4S2UniformValue<string | null>;
}

interface ResolvedSelection {
  root: HTMLElement;
  range: Range;
  collapsed: boolean;
  startPosition: A4Position;
}

interface ListSegment {
  selected: boolean;
  startIndex: number;
  startValue: number | undefined;
  items: HTMLElement[];
}

const EDITABLE_BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,blockquote';
const ATOMIC_CONTENT_SELECTOR = [
  'img',
  'hr',
  'table',
  'input',
  'textarea',
  'video',
  'audio',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
  '[data-field-id]',
  '[data-a4-break="page"]',
].join(',');

function rootFor(canonical: CanonicalEditorDocument): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = canonical.internalHtml;
  return root;
}

function rejected(code: string, message: string): A4TransactionResult {
  return { status: 'rejected', code, message };
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

function elementForPoint(point: A4DomPoint): HTMLElement | null {
  return point.node.nodeType === Node.ELEMENT_NODE
    ? (point.node as HTMLElement)
    : point.node.parentElement;
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

function prepareResultRoot(root: HTMLElement): void {
  hydrateA4RuntimeIdentity(root);
  normalizeEditedFlowIds(root);
}

function finishPreservingSelection(
  before: CanonicalEditorDocument,
  root: HTMLElement,
  selection: A4Selection,
): A4TransactionResult {
  prepareResultRoot(root);
  const anchor = validateA4Position(root, selection.anchor);
  const focus = validateA4Position(root, selection.focus);
  if (anchor.status === 'rejected' || focus.status === 'rejected') {
    return rejected(
      'invalid-result-selection',
      'The semantic command applied but the original structural selection no longer maps safely.',
    );
  }
  return {
    status: 'applied',
    document: { internalHtml: root.innerHTML },
    selection,
    changedNodeIds: changedNodeIds(before, root),
  };
}

function finishAtPoint(
  before: CanonicalEditorDocument,
  root: HTMLElement,
  point: A4DomPoint,
  affinity: A4Position['affinity'] = 'after',
): A4TransactionResult {
  prepareResultRoot(root);
  const position = captureA4Position(root, point.node, point.offset, affinity);
  if (!position) {
    return rejected(
      'invalid-result-selection',
      'The semantic command applied but its resulting caret could not be mapped.',
    );
  }
  return {
    status: 'applied',
    document: { internalHtml: root.innerHTML },
    selection: { anchor: position, focus: position },
    changedNodeIds: changedNodeIds(before, root),
  };
}

function collapseSelectionForEnter(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): { root: HTMLElement; point: A4DomPoint } | A4TransactionResult {
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

function isGraphemeBoundary(node: Node, offset: number): boolean {
  if (node.nodeType !== Node.TEXT_NODE) return true;
  const value = node.textContent ?? '';
  if (offset <= 0 || offset >= value.length || typeof Intl.Segmenter !== 'function') {
    return true;
  }
  const boundaries = new Set<number>([0, value.length]);
  for (const segment of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)) {
    boundaries.add(segment.index);
    boundaries.add(segment.index + segment.segment.length);
  }
  return boundaries.has(offset);
}

function hasMeaningfulContent(root: ParentNode): boolean {
  return Boolean((root.textContent ?? '').trim().length || root.querySelector(ATOMIC_CONTENT_SELECTOR));
}

function editableBlockForPoint(root: HTMLElement, point: A4DomPoint): HTMLElement | null {
  let element = elementForPoint(point);
  while (element && element !== root) {
    if (element.matches(EDITABLE_BLOCK_SELECTOR)) return element;
    element = element.parentElement;
  }
  return null;
}

function copySemanticAttributes(
  source: HTMLElement,
  target: HTMLElement,
  options: { includeIdentity?: boolean } = {},
): void {
  for (const attribute of Array.from(source.attributes)) {
    if (attribute.name === 'data-flow-id') {
      if (options.includeIdentity) target.setAttribute(attribute.name, attribute.value);
      continue;
    }
    if (attribute.name.startsWith('data-flow-')) continue;
    target.setAttribute(attribute.name, attribute.value);
  }
  target.style.removeProperty('--flow-list-start');
  if (target.style.length === 0) target.removeAttribute('style');
}

function cloneBlockShell(block: HTMLElement, tagName = block.tagName): HTMLElement {
  const clone = document.createElement(tagName);
  copySemanticAttributes(block, clone);
  return clone;
}

function ensureEditableBlock(block: HTMLElement): void {
  if (!block.hasChildNodes()) block.appendChild(document.createElement('br'));
}

function orderedListStart(list: HTMLElement): number {
  const parsed = Number.parseInt(list.getAttribute('start') ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function directListItems(list: HTMLElement): HTMLElement[] {
  return Array.from(list.children).filter(
    (child): child is HTMLElement => child.tagName === 'LI',
  );
}

function orderedItemValueAt(list: HTMLElement, index: number): number {
  const items = directListItems(list);
  let value = orderedListStart(list);
  for (let cursor = 0; cursor <= index && cursor < items.length; cursor += 1) {
    const explicit = Number.parseInt(items[cursor].getAttribute('value') ?? '', 10);
    if (Number.isFinite(explicit)) value = explicit;
    if (cursor === index) return value;
    value += 1;
  }
  return value;
}

function orderedNextValue(list: HTMLElement): number {
  const items = directListItems(list);
  return items.length
    ? orderedItemValueAt(list, items.length - 1) + 1
    : orderedListStart(list);
}

function setOrderedListStart(list: HTMLElement, start: number): void {
  const safeStart = Math.max(1, Math.floor(start) || 1);
  if (safeStart === 1) {
    list.removeAttribute('start');
    list.style.removeProperty('--list-start');
  } else {
    list.setAttribute('start', String(safeStart));
    // Existing shared editor/output CSS consumes this semantic mirror. The
    // pagination-only --flow-list-start value remains transient and is removed.
    list.style.setProperty('--list-start', String(safeStart - 1));
  }
  list.style.removeProperty('--flow-list-start');
  if (list.style.length === 0) list.removeAttribute('style');
}

function listTypeOf(list: HTMLElement): A4S2ListType | null {
  if (list.tagName === 'UL') return 'unordered';
  if (list.tagName !== 'OL') return null;
  return list.classList.contains('list-alpha') ? 'alpha' : 'ordered';
}

function listTag(type: A4S2ListType): 'OL' | 'UL' {
  return type === 'unordered' ? 'UL' : 'OL';
}

function configureListType(
  list: HTMLElement,
  source: HTMLElement | null,
  type: A4S2ListType,
  start?: number,
): void {
  if (source) copySemanticAttributes(source, list);
  list.removeAttribute('start');
  list.removeAttribute('reversed');
  list.classList.remove('list-alpha');
  if (type === 'unordered') {
    list.classList.remove('list-bold-numbers');
    list.style.removeProperty('--list-start');
    list.style.removeProperty('--flow-list-start');
  } else {
    if (type === 'alpha') list.classList.add('list-alpha');
    setOrderedListStart(list, start ?? (source?.tagName === 'OL' ? orderedListStart(source) : 1));
  }
  if (list.classList.length === 0) list.removeAttribute('class');
  if (list.style.length === 0) list.removeAttribute('style');
}

function cloneListShell(
  source: HTMLElement,
  type: A4S2ListType,
  options: { keepIdentity: boolean; start?: number },
): HTMLElement {
  const clone = document.createElement(listTag(type));
  copySemanticAttributes(source, clone, { includeIdentity: options.keepIdentity });
  configureListType(clone, source, type, options.start);
  return clone;
}

function primaryBlockForItem(item: HTMLElement): HTMLElement | null {
  return Array.from(item.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement && child.matches(EDITABLE_BLOCK_SELECTOR),
  ) ?? null;
}

function topLevelExitParagraph(item: HTMLElement): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  const block = primaryBlockForItem(item);
  if (block) copySemanticAttributes(block, paragraph);
  paragraph.innerHTML = '<br>';
  return paragraph;
}

function exitEmptyListItem(item: HTMLElement): { point: A4DomPoint } | null {
  const list = item.parentElement;
  if (!list || (list.tagName !== 'OL' && list.tagName !== 'UL')) return null;
  const ownerItem = list.parentElement?.closest<HTMLElement>('li') ?? null;
  const outerList = ownerItem?.parentElement ?? null;

  if (
    ownerItem &&
    outerList &&
    (outerList.tagName === 'OL' || outerList.tagName === 'UL')
  ) {
    outerList.insertBefore(item, ownerItem.nextSibling);
    if (directListItems(list).length === 0) list.remove();
    const block = primaryBlockForItem(item);
    return block ? { point: { node: block, offset: 0 } } : null;
  }

  const items = directListItems(list);
  const index = items.indexOf(item);
  if (index < 0) return null;
  const paragraph = topLevelExitParagraph(item);
  const nextItem = items[index + 1] ?? null;
  const nextOrderedValue = list.tagName === 'OL' && nextItem
    ? orderedItemValueAt(list, index + 1)
    : undefined;
  item.remove();

  if (items.length === 1) {
    list.replaceWith(paragraph);
    return { point: { node: paragraph, offset: 0 } };
  }
  if (index === 0) {
    if (list.tagName === 'OL' && nextOrderedValue !== undefined) {
      setOrderedListStart(list, nextOrderedValue);
      directListItems(list)[0]?.removeAttribute('value');
    }
    list.before(paragraph);
    return { point: { node: paragraph, offset: 0 } };
  }
  if (!nextItem) {
    list.after(paragraph);
    return { point: { node: paragraph, offset: 0 } };
  }

  const trailingType = listTypeOf(list);
  if (!trailingType) return null;
  const trailing = cloneListShell(list, trailingType, {
    keepIdentity: false,
    start: nextOrderedValue,
  });
  let cursor: Element | null = nextItem;
  while (cursor) {
    const next = cursor.nextElementSibling;
    trailing.appendChild(cursor);
    cursor = next;
  }
  if (trailing.tagName === 'OL') directListItems(trailing)[0]?.removeAttribute('value');
  list.after(paragraph, trailing);
  return { point: { node: paragraph, offset: 0 } };
}

function splitListItemAtPoint(
  item: HTMLElement,
  block: HTMLElement,
  point: A4DomPoint,
): HTMLElement {
  const beforeRange = document.createRange();
  beforeRange.setStart(block, 0);
  beforeRange.setEnd(point.node, point.offset);
  const afterRange = document.createRange();
  afterRange.setStart(point.node, point.offset);
  afterRange.setEnd(block, block.childNodes.length);
  const before = beforeRange.cloneContents();
  const after = afterRange.cloneContents();
  const nextTag = /^H[1-6]$/.test(block.tagName) && !hasMeaningfulContent(after)
    ? 'P'
    : block.tagName;
  const nextBlock = cloneBlockShell(block, nextTag);
  nextBlock.appendChild(after);
  ensureEditableBlock(nextBlock);
  block.replaceChildren(before);
  ensureEditableBlock(block);

  const nextItem = document.createElement('li');
  copySemanticAttributes(item, nextItem);
  nextItem.removeAttribute('value');
  nextItem.appendChild(nextBlock);
  let trailing = block.nextSibling;
  while (trailing) {
    const next = trailing.nextSibling;
    nextItem.appendChild(trailing);
    trailing = next;
  }
  item.after(nextItem);
  return nextBlock;
}

function splitOrdinaryBlockAtPoint(
  block: HTMLElement,
  point: A4DomPoint,
): HTMLElement {
  const beforeRange = document.createRange();
  beforeRange.setStart(block, 0);
  beforeRange.setEnd(point.node, point.offset);
  const afterRange = document.createRange();
  afterRange.setStart(point.node, point.offset);
  afterRange.setEnd(block, block.childNodes.length);
  const before = beforeRange.cloneContents();
  const after = afterRange.cloneContents();
  const nextTag = /^H[1-6]$/.test(block.tagName) && !hasMeaningfulContent(after)
    ? 'P'
    : block.tagName;
  const next = cloneBlockShell(block, nextTag);
  next.appendChild(after);
  ensureEditableBlock(next);
  block.replaceChildren(before);
  ensureEditableBlock(block);
  block.after(next);
  return next;
}

/** Pure S2 Enter semantics on the canonical unsplit tree. */
export function insertA4S2ParagraphBreak(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4TransactionResult {
  const prepared = collapseSelectionForEnter(canonical, selection);
  if ('status' in prepared) return prepared;
  if (!isGraphemeBoundary(prepared.point.node, prepared.point.offset)) {
    return rejected('invalid-grapheme-boundary', 'Enter cannot split inside a Unicode grapheme cluster.');
  }
  const block = editableBlockForPoint(prepared.root, prepared.point);
  if (!block) return { status: 'unchanged', reason: 'The caret is not in an editable paragraph block.' };
  if (block.closest('td, th')) {
    return {
      status: 'unchanged',
      reason: 'Paragraph splitting inside table cells is not assigned to the S2 list contract.',
    };
  }

  const item = block.closest<HTMLElement>('li');
  if (item && !hasMeaningfulContent(item)) {
    const exited = exitEmptyListItem(item);
    return exited
      ? finishAtPoint(canonical, prepared.root, exited.point, 'after')
      : rejected('invalid-list-structure', 'The empty list item could not be lifted safely.');
  }
  if (item) {
    const nextBlock = splitListItemAtPoint(item, block, prepared.point);
    return finishAtPoint(canonical, prepared.root, { node: nextBlock, offset: 0 }, 'after');
  }
  const next = splitOrdinaryBlockAtPoint(block, prepared.point);
  return finishAtPoint(canonical, prepared.root, { node: next, offset: 0 }, 'after');
}

function rangeIntersectsNode(range: Range, node: Node): boolean {
  if (range.collapsed) {
    const element = elementForPoint({ node: range.startContainer, offset: range.startOffset });
    return element === node || (node instanceof Element && node.contains(element));
  }
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

function editableBlocksForRange(root: HTMLElement, range: Range): HTMLElement[] {
  if (range.collapsed) {
    const block = editableBlockForPoint(root, {
      node: range.startContainer,
      offset: range.startOffset,
    });
    return block ? [block] : [];
  }
  return Array.from(root.querySelectorAll<HTMLElement>(EDITABLE_BLOCK_SELECTOR))
    .filter((block) => rangeIntersectsNode(range, block));
}

function selectedItemsForRange(root: HTMLElement, range: Range): HTMLElement[] {
  const items = new Set<HTMLElement>();
  editableBlocksForRange(root, range).forEach((block) => {
    const item = block.closest<HTMLElement>('li');
    if (item) items.add(item);
  });
  const all = Array.from(items);
  return all.filter(
    (item) => !all.some((other) => other !== item && other.contains(item)),
  );
}

function selectedItemsByList(root: HTMLElement, range: Range): Map<HTMLElement, HTMLElement[]> {
  const result = new Map<HTMLElement, HTMLElement[]>();
  selectedItemsForRange(root, range).forEach((item) => {
    const list = item.parentElement;
    if (!list || (list.tagName !== 'OL' && list.tagName !== 'UL')) return;
    const group = result.get(list);
    if (group) group.push(item);
    else result.set(list, [item]);
  });
  return result;
}

function contiguousGroups(items: HTMLElement[]): HTMLElement[][] {
  const result: HTMLElement[][] = [];
  let group: HTMLElement[] = [];
  items.forEach((item) => {
    const previous = group.at(-1);
    if (!previous || item.previousElementSibling === previous) {
      group.push(item);
      return;
    }
    result.push(group);
    group = [item];
  });
  if (group.length) result.push(group);
  return result;
}

export function getA4S2ListIndentCapability(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
  direction: A4S2IndentDirection,
): A4S2Capability {
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) {
    return {
      applicable: false,
      code: 'invalid-position',
      reason: resolved.status === 'rejected' ? resolved.message : 'Invalid structural selection.',
    };
  }
  const byList = selectedItemsByList(resolved.root, resolved.range);
  if (!byList.size) {
    return { applicable: false, code: 'not-in-list', reason: 'The selection is not in a list item.' };
  }
  for (const [list, items] of byList) {
    if (direction === 'indent') {
      for (const group of contiguousGroups(items)) {
        const previous = group[0].previousElementSibling;
        if (!previous || previous.tagName !== 'LI') {
          return {
            applicable: false,
            code: 'first-item-cannot-indent',
            reason: 'The first item at a list level cannot be indented without a preceding owner item.',
          };
        }
      }
    } else {
      const owner = list.parentElement;
      const outer = owner?.parentElement;
      if (!owner || owner.tagName !== 'LI' || !outer || (outer.tagName !== 'OL' && outer.tagName !== 'UL')) {
        return {
          applicable: false,
          code: 'outermost-item-cannot-outdent',
          reason: 'An outermost list item has no parent list level to lift into.',
        };
      }
    }
  }
  return { applicable: true };
}

function nestedListForOwner(owner: HTMLElement, sourceList: HTMLElement): HTMLElement {
  const type = listTypeOf(sourceList)!;
  const existing = Array.from(owner.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement && listTypeOf(child) === type,
  );
  if (existing) return existing;
  const nested = cloneListShell(sourceList, type, { keepIdentity: false, start: 1 });
  if (nested.tagName === 'OL') setOrderedListStart(nested, 1);
  owner.appendChild(nested);
  return nested;
}

export function indentA4S2ListItems(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4TransactionResult {
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) return resolved;
  const capability = getA4S2ListIndentCapability(canonical, selection, 'indent');
  if (!capability.applicable) {
    return { status: 'unchanged', reason: capability.reason ?? 'List indent is not applicable.' };
  }
  for (const [list, items] of selectedItemsByList(resolved.root, resolved.range)) {
    for (const group of contiguousGroups(items)) {
      const previous = group[0].previousElementSibling as HTMLElement;
      const nested = nestedListForOwner(previous, list);
      group.forEach((item) => nested.appendChild(item));
    }
  }
  return finishPreservingSelection(canonical, resolved.root, selection);
}

export function outdentA4S2ListItems(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4TransactionResult {
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) return resolved;
  const capability = getA4S2ListIndentCapability(canonical, selection, 'outdent');
  if (!capability.applicable) {
    return { status: 'unchanged', reason: capability.reason ?? 'List outdent is not applicable.' };
  }
  for (const [list, items] of selectedItemsByList(resolved.root, resolved.range)) {
    const owner = list.parentElement as HTMLElement;
    const outer = owner.parentElement as HTMLElement;
    const reference = owner.nextSibling;
    items.forEach((item) => outer.insertBefore(item, reference));
    if (directListItems(list).length === 0) list.remove();
  }
  return finishPreservingSelection(canonical, resolved.root, selection);
}

function buildListSegments(
  list: HTMLElement,
  selectedItems: Set<HTMLElement>,
): ListSegment[] {
  const ordered = list.tagName === 'OL';
  const segments: ListSegment[] = [];
  directListItems(list).forEach((item, index) => {
    const selected = selectedItems.has(item);
    const current = segments.at(-1);
    if (!current || current.selected !== selected) {
      segments.push({
        selected,
        startIndex: index,
        startValue: ordered ? orderedItemValueAt(list, index) : undefined,
        items: [item],
      });
    } else {
      current.items.push(item);
    }
  });
  return segments;
}

function segmentListBySelection(
  list: HTMLElement,
  selectedItems: Set<HTMLElement>,
  targetType: A4S2ListType,
): boolean {
  const sourceType = listTypeOf(list);
  if (!sourceType || sourceType === targetType) return false;
  const segments = buildListSegments(list, selectedItems);
  if (!segments.length) return false;
  const replacements = segments.map((segment, segmentIndex) => {
    const type = segment.selected ? targetType : sourceType;
    const start = type === 'unordered'
      ? undefined
      : sourceType === 'unordered'
        ? 1
        : segment.startValue;
    const replacement = cloneListShell(list, type, {
      keepIdentity: segmentIndex === 0,
      start,
    });
    segment.items.forEach((item) => {
      if (type === 'unordered') item.removeAttribute('value');
      replacement.appendChild(item);
    });
    return replacement;
  });
  list.replaceWith(...replacements);
  return true;
}

function rootOutsideBlocksForRange(root: HTMLElement, range: Range): HTMLElement[] {
  return editableBlocksForRange(root, range).filter((block) => !block.closest('li'));
}

function adjacentBlockGroups(blocks: HTMLElement[]): HTMLElement[][] {
  const groups: HTMLElement[][] = [];
  let current: HTMLElement[] = [];
  blocks.forEach((block) => {
    const previous = current.at(-1);
    if (
      previous &&
      previous.parentElement === block.parentElement &&
      block.previousElementSibling === previous
    ) {
      current.push(block);
    } else {
      if (current.length) groups.push(current);
      current = [block];
    }
  });
  if (current.length) groups.push(current);
  return groups;
}

function listMatchesType(list: Element | null, type: A4S2ListType): list is HTMLElement {
  return list instanceof HTMLElement && listTypeOf(list) === type;
}

function orderedListsCompatible(left: HTMLElement, right: HTMLElement): boolean {
  if (listTypeOf(left) !== listTypeOf(right)) return false;
  if (left.classList.contains('list-bold-numbers') !== right.classList.contains('list-bold-numbers')) {
    return false;
  }
  const rightStart = right.getAttribute('start');
  return !rightStart || Number.parseInt(rightStart, 10) === orderedNextValue(left);
}

function mergeEligibleLists(left: HTMLElement, right: HTMLElement): boolean {
  const leftType = listTypeOf(left);
  if (!leftType || leftType !== listTypeOf(right)) return false;
  if (leftType !== 'unordered' && !orderedListsCompatible(left, right)) return false;
  Array.from(right.children).forEach((child) => left.appendChild(child));
  right.remove();
  return true;
}

function wrapOutsideBlocksInList(group: HTMLElement[], type: A4S2ListType): void {
  const first = group[0];
  const last = group[group.length - 1];
  const parent = first.parentElement;
  if (!parent) return;
  const previous = first.previousElementSibling;
  const next = last.nextElementSibling;
  const previousList = listMatchesType(previous, type) ? previous : null;
  const nextList = listMatchesType(next, type) ? next : null;
  const items = group.map((block) => {
    const item = document.createElement('li');
    item.appendChild(block);
    return item;
  });

  if (previousList) {
    items.forEach((item) => previousList.appendChild(item));
    if (nextList) mergeEligibleLists(previousList, nextList);
    return;
  }
  if (nextList) {
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.appendChild(item));
    nextList.insertBefore(fragment, nextList.firstChild);
    return;
  }
  const list = document.createElement(listTag(type));
  configureListType(list, null, type, 1);
  items.forEach((item) => list.appendChild(item));
  parent.insertBefore(list, next);
}

/** Explicit list type/range semantics. */
export function setA4S2ListType(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
  type: A4S2ListType,
): A4TransactionResult {
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) return resolved;
  const byList = selectedItemsByList(resolved.root, resolved.range);
  const outside = rootOutsideBlocksForRange(resolved.root, resolved.range);
  let changed = false;
  byList.forEach((items, list) => {
    changed = segmentListBySelection(list, new Set(items), type) || changed;
  });
  adjacentBlockGroups(outside).forEach((group) => {
    wrapOutsideBlocksInList(group, type);
    changed = true;
  });
  if (!changed) return { status: 'unchanged', reason: 'The selected content already has this list type.' };
  return finishPreservingSelection(canonical, resolved.root, selection);
}

function selectedStartItem(root: HTMLElement, range: Range): HTMLElement | null {
  const element = elementForPoint({ node: range.startContainer, offset: range.startOffset });
  return element?.closest<HTMLElement>('li') ?? null;
}

export function restartA4S2OrderedListAtSelection(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
  start: number,
): A4TransactionResult {
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) return resolved;
  const item = selectedStartItem(resolved.root, resolved.range);
  const list = item?.parentElement ?? null;
  if (!item || !list || list.tagName !== 'OL') {
    return { status: 'unchanged', reason: 'Restart numbering requires an ordered-list item.' };
  }
  const items = directListItems(list);
  const index = items.indexOf(item);
  const safeStart = Math.max(1, Math.floor(start) || 1);
  if (index === 0) {
    const before = list.outerHTML;
    item.removeAttribute('value');
    setOrderedListStart(list, safeStart);
    if (before === list.outerHTML) return { status: 'unchanged', reason: 'The list already starts at that value.' };
    return finishPreservingSelection(canonical, resolved.root, selection);
  }

  const type = listTypeOf(list)!;
  const trailing = cloneListShell(list, type, { keepIdentity: false, start: safeStart });
  items.slice(index).forEach((candidate) => trailing.appendChild(candidate));
  directListItems(trailing)[0]?.removeAttribute('value');
  list.after(trailing);
  return finishPreservingSelection(canonical, resolved.root, selection);
}

function compatibleOrderedMarkerStyle(left: HTMLElement, right: HTMLElement): boolean {
  return left.classList.contains('list-alpha') === right.classList.contains('list-alpha') &&
    left.classList.contains('list-bold-numbers') === right.classList.contains('list-bold-numbers');
}

function previousEligibleOrderedList(list: HTMLElement): HTMLElement | null {
  let candidate = list.previousElementSibling;
  while (candidate) {
    if (candidate instanceof HTMLElement && candidate.tagName === 'OL') {
      return compatibleOrderedMarkerStyle(candidate, list) ? candidate : null;
    }
    candidate = candidate.previousElementSibling;
  }
  return null;
}

export function getA4S2ContinueNumberingCapability(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4S2Capability {
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) {
    return {
      applicable: false,
      code: 'invalid-position',
      reason: resolved.status === 'rejected' ? resolved.message : 'Invalid structural selection.',
    };
  }
  const item = selectedStartItem(resolved.root, resolved.range);
  const list = item?.parentElement ?? null;
  if (!item || !list || list.tagName !== 'OL') {
    return { applicable: false, code: 'not-ordered-list', reason: 'Continue numbering requires an ordered list.' };
  }
  const previous = previousEligibleOrderedList(list);
  if (previous) return { applicable: true };
  const anyPreviousOrdered = Array.from(list.parentElement?.children ?? [])
    .slice(0, Array.from(list.parentElement?.children ?? []).indexOf(list))
    .reverse()
    .find((candidate) => candidate instanceof HTMLElement && candidate.tagName === 'OL');
  return anyPreviousOrdered
    ? {
        applicable: false,
        code: 'incompatible-continuation-source',
        reason: 'The nearest preceding ordered list uses an incompatible marker style.',
      }
    : {
        applicable: false,
        code: 'no-continuation-source',
        reason: 'There is no preceding ordered list at this structural level to continue.',
      };
}

export function continueA4S2OrderedList(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4TransactionResult {
  const capability = getA4S2ContinueNumberingCapability(canonical, selection);
  if (!capability.applicable) {
    return { status: 'unchanged', reason: capability.reason ?? 'Continue numbering is not applicable.' };
  }
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) return resolved;
  const item = selectedStartItem(resolved.root, resolved.range)!;
  const list = item.parentElement!;
  const previous = previousEligibleOrderedList(list)!;
  const before = list.outerHTML;
  directListItems(list)[0]?.removeAttribute('value');
  setOrderedListStart(list, orderedNextValue(previous));
  if (before === list.outerHTML) {
    return { status: 'unchanged', reason: 'The ordered list already continues the preceding sequence.' };
  }
  return finishPreservingSelection(canonical, resolved.root, selection);
}

function formatCssNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}

/** Normalize one explicit paragraph indent step without conflating rem and em. */
export function normalizeA4S2IndentValue(
  current: string,
  direction: A4S2IndentDirection,
  metrics: A4S2IndentMetrics,
): A4S2IndentValueResult {
  const emPx = Number.isFinite(metrics.emPx) && metrics.emPx > 0 ? metrics.emPx : NaN;
  const remPx = Number.isFinite(metrics.remPx) && metrics.remPx > 0 ? metrics.remPx : NaN;
  const maxIndentPx = Number.isFinite(metrics.maxIndentPx) && metrics.maxIndentPx >= 0
    ? metrics.maxIndentPx
    : NaN;
  if (![emPx, remPx, maxIndentPx].every(Number.isFinite)) {
    return { changed: false, value: current || null, code: 'unsupported-indent-unit' };
  }

  const raw = current.trim();
  const sign = direction === 'indent' ? 1 : -1;
  let unit: 'em' | 'rem' | 'px';
  let value: number;
  if (!raw) {
    if (direction === 'outdent') return { changed: false, value: null };
    unit = 'em';
    value = 0;
  } else if (/^-?(?:\d+\.?\d*|\.\d+)rem$/i.test(raw)) {
    unit = 'rem';
    value = Number.parseFloat(raw);
  } else if (/^-?(?:\d+\.?\d*|\.\d+)em$/i.test(raw)) {
    unit = 'em';
    value = Number.parseFloat(raw);
  } else if (/^-?(?:\d+\.?\d*|\.\d+)px$/i.test(raw)) {
    unit = 'px';
    value = Number.parseFloat(raw);
  } else {
    return { changed: false, value: current || null, code: 'unsupported-indent-unit' };
  }

  const step = unit === 'em'
    ? 2
    : unit === 'rem'
      ? (2 * emPx) / remPx
      : 2 * emPx;
  const next = Math.max(0, value + sign * step);
  const nextPx = unit === 'em'
    ? next * emPx
    : unit === 'rem'
      ? next * remPx
      : next;
  if (direction === 'indent' && nextPx > maxIndentPx) {
    return { changed: false, value: current || null, code: 'indent-limit-reached' };
  }
  const valueText = next === 0 ? null : `${formatCssNumber(next)}${unit}`;
  return { changed: valueText !== (raw || null), value: valueText };
}

function paragraphTargetsForRange(root: HTMLElement, range: Range): HTMLElement[] {
  return editableBlocksForRange(root, range).filter((block) => !block.closest('li'));
}

/** List selections change semantic level; ordinary paragraphs change margin. */
export function applyA4S2Indent(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
  direction: A4S2IndentDirection,
  metrics: A4S2IndentMetrics,
): A4TransactionResult {
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) return resolved;
  const listItems = selectedItemsForRange(resolved.root, resolved.range);
  const paragraphs = paragraphTargetsForRange(resolved.root, resolved.range);
  if (listItems.length && paragraphs.length) {
    return rejected(
      'mixed-indent-domain',
      'A single indent transaction cannot mix list-level and paragraph-margin semantics.',
    );
  }
  if (listItems.length) {
    return direction === 'indent'
      ? indentA4S2ListItems(canonical, selection)
      : outdentA4S2ListItems(canonical, selection);
  }
  if (!paragraphs.length) return { status: 'unchanged', reason: 'No editable paragraph is selected.' };

  let changed = false;
  let blockedCode: A4S2IndentValueResult['code'];
  paragraphs.forEach((block) => {
    const result = normalizeA4S2IndentValue(block.style.marginLeft, direction, metrics);
    if (result.changed) {
      if (result.value) block.style.setProperty('margin-left', result.value);
      else block.style.removeProperty('margin-left');
      if (block.style.length === 0) block.removeAttribute('style');
      changed = true;
    } else if (result.code) {
      blockedCode = result.code;
    }
  });
  if (!changed) {
    return {
      status: 'unchanged',
      reason: blockedCode === 'indent-limit-reached'
        ? 'The requested indent would move content beyond the measured usable width.'
        : blockedCode === 'unsupported-indent-unit'
          ? 'The existing legacy indent unit is preserved because it cannot be safely normalized.'
          : 'The selected paragraphs are already at the requested indent boundary.',
    };
  }
  return finishPreservingSelection(canonical, resolved.root, selection);
}

function inlineProperty(node: Node, root: HTMLElement, property: string): string | null {
  let element = node.nodeType === Node.ELEMENT_NODE
    ? (node as HTMLElement)
    : node.parentElement;
  while (element && element !== root) {
    const value = element.style.getPropertyValue(property);
    if (value) return value.trim();
    element = element.parentElement;
  }
  return null;
}

function hasAncestorTag(node: Node, root: HTMLElement, tags: readonly string[]): boolean {
  let element = node.nodeType === Node.ELEMENT_NODE
    ? (node as HTMLElement)
    : node.parentElement;
  while (element && element !== root) {
    if (tags.includes(element.tagName)) return true;
    element = element.parentElement;
  }
  return false;
}

function markAt(node: Node, root: HTMLElement, mark: 'bold' | 'italic' | 'underline'): boolean {
  if (mark === 'bold') {
    return hasAncestorTag(node, root, ['B', 'STRONG']) ||
      ['bold', 'bolder', '600', '700', '800', '900'].includes(inlineProperty(node, root, 'font-weight') ?? '');
  }
  if (mark === 'italic') {
    return hasAncestorTag(node, root, ['I', 'EM']) ||
      ['italic', 'oblique'].includes(inlineProperty(node, root, 'font-style') ?? '');
  }
  return hasAncestorTag(node, root, ['U']) ||
    (inlineProperty(node, root, 'text-decoration') ?? '').includes('underline');
}

function textNodesInRange(root: HTMLElement, range: Range): Node[] {
  if (range.collapsed) return [range.startContainer];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Node[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    if (!(current.textContent ?? '').length) continue;
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(current);
    const startsBeforeNodeEnd = range.compareBoundaryPoints(Range.START_TO_END, nodeRange) < 0;
    const endsAfterNodeStart = range.compareBoundaryPoints(Range.END_TO_START, nodeRange) > 0;
    if (startsBeforeNodeEnd && endsAfterNodeStart) nodes.push(current);
  }
  return nodes.length ? nodes : [range.startContainer];
}

function toggleState(values: boolean[]): InlineToggleState {
  const on = values.some(Boolean);
  const off = values.some((value) => !value);
  return on && off ? 'mixed' : on ? 'on' : 'off';
}

function uniformValue<T>(values: T[]): A4S2UniformValue<T> {
  const first = values[0];
  return values.every((value) => value === first)
    ? { state: 'uniform', value: first }
    : { state: 'mixed' };
}

/** Per-property mixed state; one mixed mark does not hide unrelated uniform values. */
export function readA4S2FormattingState(
  canonical: CanonicalEditorDocument,
  selection: A4Selection,
): A4S2FormattingState | null {
  const resolved = resolveSelection(canonical, selection);
  if (isTransactionResult(resolved)) return null;
  const samples = textNodesInRange(resolved.root, resolved.range);
  return {
    bold: toggleState(samples.map((node) => markAt(node, resolved.root, 'bold'))),
    italic: toggleState(samples.map((node) => markAt(node, resolved.root, 'italic'))),
    underline: toggleState(samples.map((node) => markAt(node, resolved.root, 'underline'))),
    fontFamily: uniformValue(samples.map((node) => inlineProperty(node, resolved.root, 'font-family'))),
    fontSize: uniformValue(samples.map((node) => inlineProperty(node, resolved.root, 'font-size'))),
    textColor: uniformValue(samples.map((node) => inlineProperty(node, resolved.root, 'color'))),
    highlightColor: uniformValue(samples.map((node) => inlineProperty(node, resolved.root, 'background-color'))),
  };
}

/** CORE owns typing marks; collapsed Clear must apply this neutral patch there. */
export function getA4S2NeutralTypingFormatPatch(): InlineFormatPatch {
  return {
    fontFamily: null,
    fontSize: null,
    color: null,
    backgroundColor: null,
    fontWeight: null,
    fontStyle: null,
    textDecoration: null,
  };
}
