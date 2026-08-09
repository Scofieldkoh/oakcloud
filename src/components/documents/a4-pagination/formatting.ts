import type { A4DocumentLayout } from './layout';
import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
} from './layout';
import {
  domPointForFlowPoint,
  hydrateFlowContainer,
  normalizeEditedFlowIds,
} from './model';
import {
  documentTextOffsetForFlowPoint,
  flowPointAtDocumentTextOffset,
  type FlowSelectionBookmark,
} from './selection';
import {
  applyLogicalDelete,
  collapsedFlowSelection,
  insertReplacementNodes,
  sanitizeReplacementHtml,
  type DocumentTransactionResult,
} from './document-actions';

export interface EditorFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: 'left' | 'center' | 'right' | 'justify';
  list: 'none' | 'ordered' | 'unordered';
  paragraphStyle: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote';
  fontFamily: string;
  fontSize: string;
  textColor: string;
  highlightColor: string;
}

export interface InlineFormatPatch {
  fontFamily?: string | null;
  fontSize?: string | null;
  color?: string | null;
  backgroundColor?: string | null;
  fontWeight?: 'bold' | null;
  fontStyle?: 'italic' | null;
  textDecoration?: 'underline' | null;
}

interface DomPoint {
  node: Node;
  offset: number;
}

const FORMATTING_ELEMENTS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'STRIKE',
]);

function defaultFormatState(
  layout: A4DocumentLayout,
): EditorFormatState {
  return {
    bold: false,
    italic: false,
    underline: false,
    alignment: 'left',
    list: 'none',
    paragraphStyle: 'p',
    fontFamily: layout.fontFamily,
    fontSize: layout.fontSize,
    textColor: '#000000',
    highlightColor: '#ffffff',
  };
}

const FORMAT_PROPERTIES: Array<[keyof InlineFormatPatch, string]> = [
  ['fontFamily', 'font-family'],
  ['fontSize', 'font-size'],
  ['color', 'color'],
  ['backgroundColor', 'background-color'],
  ['fontWeight', 'font-weight'],
  ['fontStyle', 'font-style'],
  ['textDecoration', 'text-decoration'],
];

export function normalizeColorValue(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const shorthand = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(trimmed);
  if (shorthand) {
    return `#${shorthand[1]}${shorthand[1]}${shorthand[2]}${shorthand[2]}${shorthand[3]}${shorthand[3]}`;
  }
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;

  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/.exec(
    trimmed,
  );
  if (rgb) {
    return `#${rgb
      .slice(1, 4)
      .map((component) =>
        Math.max(0, Math.min(255, Number(component)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
  }

  if (
    trimmed === 'transparent' ||
    trimmed === 'inherit' ||
    trimmed === 'currentcolor'
  ) {
    return '#000000';
  }

  try {
    const probe = document.createElement('span');
    probe.style.color = trimmed;
    const computed =
      document.defaultView?.getComputedStyle(probe).color ?? '';
    const computedRgb =
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(computed);
    if (computedRgb) {
      return `#${computedRgb
        .slice(1, 4)
        .map((component) =>
          Math.max(0, Math.min(255, Number(component)))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
    }
  } catch {
    // Fall through to the safe fallback below.
  }

  return '#000000';
}

function positivePatch(patch: InlineFormatPatch): InlineFormatPatch {
  return Object.fromEntries(
    (Object.entries(patch) as Array<[keyof InlineFormatPatch, unknown]>).filter(
      ([, value]) => typeof value === 'string',
    ),
  ) as InlineFormatPatch;
}

function nullPatchProperties(
  patch: InlineFormatPatch,
): Array<[keyof InlineFormatPatch, string]> {
  return (Object.entries(patch) as Array<
    [keyof InlineFormatPatch, unknown]
  >)
    .filter(([, value]) => value === null)
    .map(([key]) => {
      const property = FORMAT_PROPERTIES.find(([candidate]) => candidate === key);
      return [key, property?.[1] ?? ''] as [keyof InlineFormatPatch, string];
    });
}

function hasSubstantiveContent(root: ParentNode): boolean {
  return Boolean(
    root.textContent?.length ||
      root.querySelector(
        'audio,canvas,embed,hr,iframe,img,input,object,svg,table,textarea,video',
      ),
  );
}

function containsFlowId(root: ParentNode, flowId: string): boolean {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-flow-id]'),
  ).some((element) => element.dataset.flowId === flowId);
}

function firstFlowPoint(root: HTMLElement): FlowSelectionBookmark['anchor'] | null {
  const first = root.querySelector<HTMLElement>('[data-flow-id]');
  if (!first?.dataset.flowId) return null;
  return { flowId: first.dataset.flowId, offset: 0 };
}

function finalizeRoot(
  root: HTMLElement,
  requestedSelection: FlowSelectionBookmark | null,
  selectFallback: boolean,
): Pick<DocumentTransactionResult, 'html' | 'selection'> {
  if (!hasSubstantiveContent(root) && !root.querySelector('.page-break')) {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = '<br>';
    root.replaceChildren(paragraph);
  }
  hydrateFlowContainer(root);
  normalizeEditedFlowIds(root);

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

function fragmentTextLength(fragment: DocumentFragment): number {
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment.cloneNode(true));
  return wrapper.textContent?.length ?? 0;
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

function resolveRange(
  root: HTMLElement,
  selection: FlowSelectionBookmark,
): { start: DomPoint; end: DomPoint } | null {
  const anchor = domPointForFlowPoint(root, selection.anchor);
  const focus = domPointForFlowPoint(root, selection.focus);
  if (!anchor || !focus) return null;

  let start = anchor;
  let end = focus;
  if (compareDomPoints(start, end) > 0) {
    [start, end] = [end, start];
  }
  return { start, end };
}

function applyPatchToSpan(
  span: HTMLElement,
  patch: InlineFormatPatch,
): void {
  if (patch.fontFamily !== undefined) {
    if (patch.fontFamily === null) span.style.removeProperty('font-family');
    else span.style.setProperty('font-family', patch.fontFamily);
  }
  if (patch.fontSize !== undefined) {
    if (patch.fontSize === null) span.style.removeProperty('font-size');
    else span.style.setProperty('font-size', patch.fontSize);
  }
  if (patch.color !== undefined) {
    if (patch.color === null) span.style.removeProperty('color');
    else span.style.setProperty('color', patch.color);
  }
  if (patch.backgroundColor !== undefined) {
    if (patch.backgroundColor === null) {
      span.style.removeProperty('background-color');
    } else {
      span.style.setProperty('background-color', patch.backgroundColor);
    }
  }
  if (patch.fontWeight !== undefined) {
    if (patch.fontWeight === null) span.style.removeProperty('font-weight');
    else span.style.setProperty('font-weight', patch.fontWeight);
  }
  if (patch.fontStyle !== undefined) {
    if (patch.fontStyle === null) span.style.removeProperty('font-style');
    else span.style.setProperty('font-style', patch.fontStyle);
  }
  if (patch.textDecoration !== undefined) {
    if (patch.textDecoration === null) {
      span.style.removeProperty('text-decoration');
    } else {
      span.style.setProperty('text-decoration', patch.textDecoration);
    }
  }

  if (span.style.length === 0) span.removeAttribute('style');
}

function isClearPatch(patch: InlineFormatPatch): boolean {
  return Object.values(patch).every((value) => value === null || value === undefined);
}

function wrapTextSlice(
  textNode: Text,
  startOffset: number,
  endOffset: number,
  patch: InlineFormatPatch,
): void {
  const length = textNode.length;
  const safeStart = Math.max(0, Math.min(length, startOffset));
  const safeEnd = Math.max(safeStart, Math.min(length, endOffset));
  if (safeEnd <= safeStart) return;

  const middle = textNode.splitText(safeStart);
  const tail = safeEnd < length ? middle.splitText(safeEnd - safeStart) : null;
  const span = document.createElement('span');
  applyPatchToSpan(span, patch);
  middle.parentNode?.insertBefore(span, middle);
  span.appendChild(middle);
  if (tail && tail.parentNode === middle.parentNode) {
    middle.parentNode?.insertBefore(tail, span.nextSibling);
  }
}

function unwrapElementsInRange(
  root: HTMLElement,
  selection: FlowSelectionBookmark,
): void {
  for (let pass = 0; pass < 12; pass += 1) {
    const resolved = resolveRange(root, selection);
    if (!resolved) return;
    const range = document.createRange();
    range.setStart(resolved.start.node, resolved.start.offset);
    range.setEnd(resolved.end.node, resolved.end.offset);
    let changed = false;
    const rangeStart: DomPoint = {
      node: range.startContainer,
      offset: range.startOffset,
    };
    const rangeEnd: DomPoint = {
      node: range.endContainer,
      offset: range.endOffset,
    };
    const elements = Array.from(
      root.querySelectorAll<HTMLElement>(
        'span,strong,b,em,i,u,s,strike,[style]',
      ),
    );

    for (const element of elements) {
      if (!range.intersectsNode(element)) continue;

      const elementStart: DomPoint = { node: element, offset: 0 };
      const elementEnd: DomPoint = {
        node: element,
        offset: element.childNodes.length,
      };
      const rangeStartsInside =
        compareDomPoints(elementStart, rangeStart) < 0 &&
        compareDomPoints(rangeStart, elementEnd) < 0;
      const rangeEndsInside =
        compareDomPoints(elementStart, rangeEnd) < 0 &&
        compareDomPoints(rangeEnd, elementEnd) < 0;
      const firstChild = element.firstChild;
      const lastChild = element.lastChild;
      const contentStart: DomPoint | null = firstChild
        ? { node: firstChild, offset: 0 }
        : null;
      const contentEnd: DomPoint | null = lastChild
        ? {
            node: lastChild,
            offset:
              lastChild.nodeType === Node.TEXT_NODE
                ? lastChild.textContent?.length ?? 0
                : lastChild.childNodes.length,
          }
        : null;
      const fullyInside =
        contentStart !== null &&
        contentEnd !== null &&
        compareDomPoints(rangeStart, contentStart) <= 0 &&
        compareDomPoints(contentEnd, rangeEnd) <= 0;

      if (fullyInside) {
        if (
          element.tagName === 'SPAN' ||
          FORMATTING_ELEMENTS.has(element.tagName)
        ) {
          element.replaceWith(...Array.from(element.childNodes));
        } else if (element.getAttribute('style')) {
          element.removeAttribute('style');
        }
        changed = true;
        break;
      }

      if (rangeStartsInside && splitElementAtDomPoint(element, rangeStart)) {
        changed = true;
        break;
      }

      if (rangeEndsInside && splitElementAtDomPoint(element, rangeEnd)) {
        changed = true;
        break;
      }
    }

    if (!changed) break;
  }
}

function splitElementAtDomPoint(
  element: HTMLElement,
  point: DomPoint,
): boolean {
  const beforeRange = document.createRange();
  beforeRange.setStart(element, 0);
  beforeRange.setEnd(point.node, point.offset);
  const afterRange = document.createRange();
  afterRange.setStart(point.node, point.offset);
  afterRange.setEnd(element, element.childNodes.length);
  if (!rangeHasContent(beforeRange) || !rangeHasContent(afterRange)) {
    return false;
  }

  const before = beforeRange.extractContents();
  const clone = element.cloneNode(false) as HTMLElement;
  clone.appendChild(before);
  element.parentNode?.insertBefore(clone, element);
  return true;
}

function rangeHasContent(range: Range): boolean {
  return (
    range.toString().length > 0 ||
    Boolean(
      range
        .cloneContents()
        .querySelector(
          'img,br,hr,svg,canvas,iframe,object,embed,video,audio,input,textarea',
        ),
    )
  );
}

function canonicalStyleText(element: HTMLElement): string {
  const probe = document.createElement('span');
  const style = element.style;
  for (let index = 0; index < style.length; index += 1) {
    const property = style.item(index);
    probe.style.setProperty(property, style.getPropertyValue(property));
  }
  return probe.style.cssText;
}

export function normalizeFormattingSpans(root: HTMLElement): void {
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;

    Array.from(root.querySelectorAll<HTMLElement>('span')).forEach((span) => {
      if (!span.getAttribute('style') && !span.getAttribute('class')) {
        span.replaceWith(...Array.from(span.childNodes));
        changed = true;
        return;
      }

      const child = span.firstElementChild as HTMLElement | null;
      if (child?.tagName === 'SPAN' && span.childNodes.length === 1) {
        const childStyle = child.style;
        for (let index = 0; index < childStyle.length; index += 1) {
          const property = childStyle.item(index);
          span.style.setProperty(
            property,
            childStyle.getPropertyValue(property),
          );
        }
        if (span.style.length === 0) span.removeAttribute('style');
        while (child.firstChild) span.appendChild(child.firstChild);
        child.remove();
        changed = true;
        return;
      }

      const parent = span.parentElement;
      if (
        parent?.tagName === 'SPAN' &&
        canonicalStyleText(parent) === canonicalStyleText(span)
      ) {
        while (span.firstChild) parent.appendChild(span.firstChild);
        span.remove();
        changed = true;
        return;
      }

      let next = span.nextSibling as HTMLElement | null;
      while (
        next?.nodeType === Node.ELEMENT_NODE &&
        next?.tagName === 'SPAN' &&
        canonicalStyleText(next) === canonicalStyleText(span)
      ) {
        while (next.firstChild) span.appendChild(next.firstChild);
        const toRemove = next;
        next = toRemove.nextSibling as HTMLElement | null;
        toRemove.remove();
        changed = true;
      }
    });

    if (!changed) break;
  }
}

export function applyInlineFormat(
  html: string,
  selection: FlowSelectionBookmark,
  patch: InlineFormatPatch,
): DocumentTransactionResult {
  if (selection.collapsed) {
    return { html, selection, changed: false };
  }

  const root = document.createElement('div');
  root.innerHTML = html;
  const resolved = resolveRange(root, selection);
  if (!resolved) return { html, selection, changed: false };
  const { start, end } = resolved;

  if (isClearPatch(patch)) {
    unwrapElementsInRange(root, selection);
    normalizeFormattingSpans(root);
    hydrateFlowContainer(root);
    return {
      html: root.innerHTML,
      selection,
      changed: true,
    };
  }

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.textContent?.length) textNodes.push(node as Text);
  }

  textNodes.forEach((textNode) => {
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(textNode);
    if (!range.intersectsNode(textNode)) return;

    const nodeStart = nodeRange.startOffset;
    const nodeEnd = nodeRange.endOffset;
    const startOffset =
      range.compareBoundaryPoints(Range.START_TO_START, nodeRange) > 0
        ? range.startOffset - nodeStart
        : 0;
    const endOffset =
      range.compareBoundaryPoints(Range.END_TO_END, nodeRange) < 0
        ? range.endOffset - nodeStart
        : nodeEnd - nodeStart;
    wrapTextSlice(textNode, startOffset, endOffset, patch);
  });

  normalizeFormattingSpans(root);
  hydrateFlowContainer(root);
  return {
    html: root.innerHTML,
    selection,
    changed: true,
  };
}

function inlineWrapperHasNullPatch(
  element: HTMLElement,
  nullProperties: Array<[keyof InlineFormatPatch, string]>,
): boolean {
  const hasNull = (key: keyof InlineFormatPatch) =>
    nullProperties.some(([candidate]) => candidate === key);
  if (
    (element.tagName === 'B' || element.tagName === 'STRONG') &&
    hasNull('fontWeight')
  ) {
    return true;
  }
  if (
    (element.tagName === 'I' || element.tagName === 'EM') &&
    hasNull('fontStyle')
  ) {
    return true;
  }
  if (
    (element.tagName === 'U' || element.tagName === 'S' ||
      element.tagName === 'STRIKE') &&
    hasNull('textDecoration')
  ) {
    return true;
  }
  if (
    element.tagName !== 'SPAN' &&
    !FORMATTING_ELEMENTS.has(element.tagName)
  ) {
    return false;
  }
  return nullProperties.some(([, property]) =>
    Boolean(element.style.getPropertyValue(property)),
  );
}

/**
 * Moves a collapsed caret outside any inline wrapper that explicitly turns a
 * formatting property off (null patch), so subsequent insertion does not
 * inherit the cancelled format. Returns the DOM point where the caret should
 * be inserted.
 */
function prepareCaretForPatch(
  root: HTMLElement,
  point: DomPoint,
  patch: InlineFormatPatch,
): DomPoint {
  const nullProperties = nullPatchProperties(patch);
  if (nullProperties.length === 0) return point;

  const candidates: HTMLElement[] = [];
  let element: HTMLElement | null =
    point.node.nodeType === Node.ELEMENT_NODE
      ? (point.node as HTMLElement)
      : point.node.parentElement;
  while (element && element !== root) {
    if (inlineWrapperHasNullPatch(element, nullProperties)) {
      candidates.push(element);
    }
    element = element.parentElement;
  }
  const wrapper = candidates[candidates.length - 1];
  if (!wrapper || !root.contains(wrapper) || !wrapper.parentNode) return point;

  const beforeRange = document.createRange();
  beforeRange.setStart(wrapper, 0);
  beforeRange.setEnd(point.node, point.offset);
  const afterRange = document.createRange();
  afterRange.setStart(point.node, point.offset);
  afterRange.setEnd(wrapper, wrapper.childNodes.length);

  const parent = wrapper.parentNode;
  const index = Array.prototype.indexOf.call(parent.childNodes, wrapper);
  const beforeHasContent = rangeHasContent(beforeRange);
  const afterHasContent = rangeHasContent(afterRange);
  if (!beforeHasContent) return { node: parent, offset: index };
  if (!afterHasContent) return { node: parent, offset: index + 1 };

  const before = beforeRange.extractContents();
  const clone = wrapper.cloneNode(false) as HTMLElement;
  clone.appendChild(before);
  wrapper.parentNode?.insertBefore(clone, wrapper);
  return { node: parent, offset: index };
}

function applyPositivePatchToFragment(
  fragment: DocumentFragment,
  patch: InlineFormatPatch,
): void {
  const positive = positivePatch(patch);
  if (Object.keys(positive).length === 0) return;

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.textContent?.length) textNodes.push(node as Text);
  }

  textNodes.forEach((textNode) => {
    const span = document.createElement('span');
    applyPatchToSpan(span, positive);
    textNode.parentNode?.replaceChild(span, textNode);
    span.appendChild(textNode);
  });
}

function ensureEditableRoot(root: HTMLElement): void {
  if (!hasSubstantiveContent(root) && !root.querySelector('.page-break')) {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = '<br>';
    root.replaceChildren(paragraph);
  }
}

/**
 * Inserts typed text at a collapsed logical caret while applying the pending
 * typing format. Null patch values split the caret out of any wrapper that
 * currently carries that property; positive values wrap the inserted text.
 */
export function insertTextWithFormat(
  html: string,
  selection: FlowSelectionBookmark,
  text: string,
  patch: InlineFormatPatch,
): DocumentTransactionResult {
  if (!text) return { html, selection, changed: false };
  if (!selection.collapsed) {
    const deleted = applyLogicalDelete(html, selection, 'forward');
    if (!deleted.changed || !deleted.selection?.collapsed) {
      return { html, selection, changed: false };
    }
    return insertTextWithFormat(deleted.html, deleted.selection, text, patch);
  }

  const root = document.createElement('div');
  root.innerHTML = html;
  const point = domPointForFlowPoint(root, selection.anchor);
  if (!point) return { html, selection, changed: false };
  const startDocumentOffset = documentTextOffsetForFlowPoint(
    html,
    selection.anchor,
  );

  const insertionPoint = prepareCaretForPatch(root, point, patch);
  const positive = positivePatch(patch);
  const textNode = document.createTextNode(text);
  const fragment = document.createDocumentFragment();
  if (Object.keys(positive).length > 0) {
    const span = document.createElement('span');
    applyPatchToSpan(span, positive);
    span.appendChild(textNode);
    fragment.appendChild(span);
  } else {
    fragment.appendChild(textNode);
  }

  const range = document.createRange();
  range.setStart(insertionPoint.node, insertionPoint.offset);
  range.collapse(true);
  range.insertNode(fragment);

  normalizeFormattingSpans(root);
  ensureEditableRoot(root);
  hydrateFlowContainer(root);
  normalizeEditedFlowIds(root);

  const caret =
    startDocumentOffset === null
      ? selection.anchor
      : flowPointAtDocumentTextOffset(
          root.innerHTML,
          startDocumentOffset + text.length,
        ) ?? selection.anchor;
  return {
    html: root.innerHTML,
    selection: collapsedFlowSelection(caret),
    changed: true,
  };
}

/**
 * Replaces the logical selection with formatted content, applying the pending
 * typing format the same way as typed text.
 */
export function replaceFormattedSelection(
  html: string,
  selection: FlowSelectionBookmark,
  replacementHtml: string,
  patch: InlineFormatPatch,
): DocumentTransactionResult {
  if (!selection.collapsed) {
    const deleted = applyLogicalDelete(html, selection, 'forward');
    if (!deleted.changed || !deleted.selection?.collapsed) {
      return { html, selection, changed: false };
    }
    return replaceFormattedSelection(
      deleted.html,
      deleted.selection,
      replacementHtml,
      patch,
    );
  }

  const root = document.createElement('div');
  root.innerHTML = html;
  const point = domPointForFlowPoint(root, selection.anchor);
  if (!point) return { html, selection, changed: false };
  const startDocumentOffset = documentTextOffsetForFlowPoint(
    html,
    selection.anchor,
  );

  const insertionPoint = prepareCaretForPatch(root, point, patch);
  const template = document.createElement('template');
  template.innerHTML = sanitizeReplacementHtml(replacementHtml);
  const fragment = template.content;
  if (fragment.childNodes.length === 0) {
    return { html, selection, changed: false };
  }
  const replacementLength = fragmentTextLength(fragment);
  applyPositivePatchToFragment(fragment, patch);
  insertReplacementNodes(root, insertionPoint, fragment);

  normalizeFormattingSpans(root);
  ensureEditableRoot(root);
  hydrateFlowContainer(root);
  normalizeEditedFlowIds(root);

  const caret =
    startDocumentOffset === null
      ? selection.anchor
      : flowPointAtDocumentTextOffset(
          root.innerHTML,
          startDocumentOffset + replacementLength,
        ) ?? selection.anchor;
  return {
    html: root.innerHTML,
    selection: collapsedFlowSelection(caret),
    changed: true,
  };
}

const BLOCK_FORMAT_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
]);

function copyBlockAttributes(
  source: HTMLElement,
  target: HTMLElement,
): void {
  for (const attribute of Array.from(source.attributes)) {
    if (
      attribute.name.startsWith('data-flow-') ||
      attribute.name === 'style' ||
      attribute.name === 'class'
    ) {
      target.setAttribute(attribute.name, attribute.value);
    }
  }
}

function intersectedBlocks(
  root: HTMLElement,
  range: Range,
): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,blockquote'),
  ).filter((block) => range.intersectsNode(block));
}

export function applyBlockFormatToSelection(
  html: string,
  selection: FlowSelectionBookmark,
  tagName: string,
): DocumentTransactionResult {
  const normalizedTag = tagName.toUpperCase();
  if (!BLOCK_FORMAT_TAGS.has(normalizedTag)) {
    return { html, selection, changed: false };
  }

  const root = document.createElement('div');
  root.innerHTML = html;
  const resolved = resolveRange(root, selection);
  if (!resolved) return { html, selection, changed: false };
  const range = document.createRange();
  range.setStart(resolved.start.node, resolved.start.offset);
  range.setEnd(resolved.end.node, resolved.end.offset);

  const blocks = intersectedBlocks(root, range);
  if (blocks.length === 0) return { html, selection, changed: false };

  blocks.forEach((block) => {
    const replacement = document.createElement(normalizedTag);
    copyBlockAttributes(block, replacement);
    while (block.firstChild) replacement.appendChild(block.firstChild);
    block.replaceWith(replacement);
  });

  normalizeFormattingSpans(root);
  const finalized = finalizeRoot(root, selection, true);
  return { ...finalized, changed: true };
}

export function applyBlockAlignmentToSelection(
  html: string,
  selection: FlowSelectionBookmark,
  alignment: EditorFormatState['alignment'],
): DocumentTransactionResult {
  if (!['left', 'center', 'right', 'justify'].includes(alignment)) {
    return { html, selection, changed: false };
  }

  const root = document.createElement('div');
  root.innerHTML = html;
  const resolved = resolveRange(root, selection);
  if (!resolved) return { html, selection, changed: false };
  const range = document.createRange();
  range.setStart(resolved.start.node, resolved.start.offset);
  range.setEnd(resolved.end.node, resolved.end.offset);
  const blocks = intersectedBlocks(root, range);
  if (blocks.length === 0) return { html, selection, changed: false };

  const before = root.innerHTML;
  blocks.forEach((block) => {
    if (alignment === 'left') {
      if (block.style.textAlign === 'left') {
        block.style.removeProperty('text-align');
      }
    } else {
      block.style.setProperty('text-align', alignment);
    }
  });
  if (root.innerHTML === before) return { html, selection, changed: false };

  const finalized = finalizeRoot(root, selection, true);
  return { ...finalized, changed: true };
}

export function applyListToSelection(
  html: string,
  selection: FlowSelectionBookmark,
  listType: 'ordered' | 'unordered',
): DocumentTransactionResult {
  const tag = listType === 'ordered' ? 'OL' : 'UL';
  const root = document.createElement('div');
  root.innerHTML = html;
  const resolved = resolveRange(root, selection);
  if (!resolved) return { html, selection, changed: false };
  const range = document.createRange();
  range.setStart(resolved.start.node, resolved.start.offset);
  range.setEnd(resolved.end.node, resolved.end.offset);
  const blocks = intersectedBlocks(root, range);
  if (blocks.length === 0) return { html, selection, changed: false };

  const allInMatchingList = blocks.every((block) => {
    const list = block.parentElement?.closest('ol,ul');
    return list?.tagName === tag;
  });

  if (allInMatchingList) {
    const byList = new Map<HTMLElement, HTMLElement[]>();
    blocks.forEach((block) => {
      const listItem = block.parentElement;
      const list = listItem?.closest('ol,ul') as HTMLElement | null;
      if (!listItem || !list || listItem.parentElement !== list) return;
      const paragraph = document.createElement('p');
      copyBlockAttributes(block, paragraph);
      while (block.firstChild) paragraph.appendChild(block.firstChild);
      const paragraphs = byList.get(list);
      if (paragraphs) paragraphs.push(paragraph);
      else byList.set(list, [paragraph]);
      listItem.remove();
    });

    for (const [list, paragraphs] of byList) {
      const parent = list.parentNode;
      if (!parent) continue;
      let reference: Node = list;
      paragraphs.forEach((paragraph) => {
        parent.insertBefore(paragraph, reference);
        reference = paragraph;
      });
      if (list.children.length === 0) list.remove();
    }
  } else {
    blocks.forEach((block) => {
      if (block.parentElement?.closest('ol,ul')) return;
      const listItem = document.createElement('li');
      copyBlockAttributes(block, listItem);
      while (block.firstChild) listItem.appendChild(block.firstChild);
      const list = document.createElement(tag);
      list.appendChild(listItem);
      block.replaceWith(list);
    });
  }

  const finalized = finalizeRoot(root, selection, true);
  return { ...finalized, changed: true };
}

export function applyIndentToSelection(
  html: string,
  selection: FlowSelectionBookmark,
): DocumentTransactionResult {
  const root = document.createElement('div');
  root.innerHTML = html;
  const resolved = resolveRange(root, selection);
  if (!resolved) return { html, selection, changed: false };
  const range = document.createRange();
  range.setStart(resolved.start.node, resolved.start.offset);
  range.setEnd(resolved.end.node, resolved.end.offset);
  const blocks = intersectedBlocks(root, range);
  if (blocks.length === 0) return { html, selection, changed: false };

  blocks.forEach((block) => {
    const current = block.style.marginLeft;
    if (!current) block.style.setProperty('margin-left', '2em');
  });

  const finalized = finalizeRoot(root, selection, true);
  return { ...finalized, changed: true };
}

export function applyOutdentToSelection(
  html: string,
  selection: FlowSelectionBookmark,
): DocumentTransactionResult {
  const root = document.createElement('div');
  root.innerHTML = html;
  const resolved = resolveRange(root, selection);
  if (!resolved) return { html, selection, changed: false };
  const range = document.createRange();
  range.setStart(resolved.start.node, resolved.start.offset);
  range.setEnd(resolved.end.node, resolved.end.offset);
  const blocks = intersectedBlocks(root, range);
  if (blocks.length === 0) return { html, selection, changed: false };

  blocks.forEach((block) => {
    if (block.style.marginLeft) block.style.removeProperty('margin-left');
  });

  const finalized = finalizeRoot(root, selection, true);
  return { ...finalized, changed: true };
}

function inlinePropertyInAncestors(
  start: Node,
  root: HTMLElement,
  property: string,
): string | null {
  let element: HTMLElement | null =
    start.nodeType === Node.ELEMENT_NODE
      ? (start as HTMLElement)
      : start.parentElement;
  while (element && element !== root) {
    const value = element.style.getPropertyValue(property);
    if (value) return value;
    element = element.parentElement;
  }
  return null;
}

function hasFormattingTag(
  start: Node,
  root: HTMLElement,
  tagNames: string[],
): boolean {
  let element: HTMLElement | null =
    start.nodeType === Node.ELEMENT_NODE
      ? (start as HTMLElement)
      : start.parentElement;
  while (element && element !== root) {
    if (tagNames.includes(element.tagName)) return true;
    element = element.parentElement;
  }
  return false;
}

function readFormatStateAtPoint(
  root: HTMLElement,
  point: DomPoint,
  fallbackLayout: A4DocumentLayout = DEFAULT_A4_DOCUMENT_LAYOUT,
): EditorFormatState {
  const state = defaultFormatState(fallbackLayout);
  const element =
    point.node.nodeType === Node.ELEMENT_NODE
      ? (point.node as HTMLElement)
      : point.node.parentElement;
  if (!element) return state;

  const block = element.closest<HTMLElement>(
    'p,h1,h2,h3,h4,h5,h6,li,blockquote',
  );
  if (block) {
    state.paragraphStyle =
      (block.tagName.toLowerCase() as EditorFormatState['paragraphStyle']) ?? 'p';
    state.alignment =
      (block.style.textAlign as EditorFormatState['alignment']) || 'left';
  }

  const listItem = element.closest<HTMLElement>('li');
  if (listItem) {
    const list = listItem.closest('ol,ul');
    state.list = list?.tagName === 'OL' ? 'ordered' : 'unordered';
  }

  state.fontFamily = inlinePropertyInAncestors(
    point.node,
    root,
    'font-family',
  ) ?? fallbackLayout.fontFamily;
  state.fontSize = inlinePropertyInAncestors(
    point.node,
    root,
    'font-size',
  ) ?? fallbackLayout.fontSize;
  state.textColor = normalizeColorValue(
    inlinePropertyInAncestors(point.node, root, 'color') ?? '#000000',
  );
  state.highlightColor = normalizeColorValue(
    inlinePropertyInAncestors(point.node, root, 'background-color') ??
      '#ffffff',
  );
  state.bold =
    hasFormattingTag(point.node, root, ['B', 'STRONG']) ||
    ['bold', 'bolder', '600', '700', '800', '900'].includes(
      inlinePropertyInAncestors(point.node, root, 'font-weight') ?? '',
    );
  state.italic =
    hasFormattingTag(point.node, root, ['I', 'EM']) ||
    ['italic', 'oblique'].includes(
      inlinePropertyInAncestors(point.node, root, 'font-style') ?? '',
    );
  state.underline =
    hasFormattingTag(point.node, root, ['U']) ||
    (inlinePropertyInAncestors(point.node, root, 'text-decoration') ?? '').includes(
      'underline',
    );

  return state;
}

export function readLogicalFormatState(
  root: HTMLElement,
  bookmark: FlowSelectionBookmark,
  fallbackLayout: A4DocumentLayout = DEFAULT_A4_DOCUMENT_LAYOUT,
): EditorFormatState {
  const point = domPointForFlowPoint(root, bookmark.anchor);
  if (!point) return defaultFormatState(fallbackLayout);
  return readFormatStateAtPoint(root, point, fallbackLayout);
}

function formatStateKey(state: EditorFormatState): string {
  return [
    state.bold,
    state.italic,
    state.underline,
    state.alignment,
    state.list,
    state.paragraphStyle,
    state.fontFamily,
    state.fontSize,
    state.textColor,
    state.highlightColor,
  ].join('\u0001');
}

/**
 * Returns the format state when every sampled point in the selection agrees,
 * otherwise null. Used to derive toggle semantics for formatting commands.
 */
export function readUniformFormatState(
  root: HTMLElement,
  bookmark: FlowSelectionBookmark,
  fallbackLayout: A4DocumentLayout = DEFAULT_A4_DOCUMENT_LAYOUT,
): EditorFormatState | null {
  if (bookmark.collapsed) {
    return readLogicalFormatState(root, bookmark, fallbackLayout);
  }

  const resolved = resolveRange(root, bookmark);
  if (!resolved) return null;
  const range = document.createRange();
  range.setStart(resolved.start.node, resolved.start.offset);
  range.setEnd(resolved.end.node, resolved.end.offset);

  const samples: DomPoint[] = [
    { node: range.startContainer, offset: range.startOffset },
    { node: range.endContainer, offset: range.endOffset },
  ];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent?.length) continue;
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);
    if (range.intersectsNode(node)) {
      samples.push({ node, offset: 0 });
      samples.push({ node, offset: node.textContent.length });
    }
  }

  const first = readFormatStateAtPoint(root, samples[0], fallbackLayout);
  const firstKey = formatStateKey(first);
  const uniform = samples.every(
    (sample) =>
      formatStateKey(readFormatStateAtPoint(root, sample, fallbackLayout)) ===
      firstKey,
  );
  return uniform ? first : null;
}
