import type { A4DocumentLayout } from './layout';
import {
  DEFAULT_A4_DOCUMENT_LAYOUT,
} from './layout';
import { domPointForFlowPoint, hydrateFlowContainer } from './model';
import type { FlowSelectionBookmark } from './selection';
import type { DocumentTransactionResult } from './document-actions';

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
  start: DomPoint,
  end: DomPoint,
): void {
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);

  const elements = Array.from(
    root.querySelectorAll<HTMLElement>(
      'span,strong,b,em,i,u,s,strike,[style]',
    ),
  );
  elements.forEach((element) => {
    if (!range.intersectsNode(element)) return;
    const inside =
      range.comparePoint(element, 0) === 0 &&
      range.comparePoint(element, element.childNodes.length) === 0;
    if (!inside) return;

    if (
      element.tagName === 'SPAN' ||
      FORMATTING_ELEMENTS.has(element.tagName)
    ) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    if (element.getAttribute('style')) {
      element.removeAttribute('style');
    }
  });
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

      let next = span.nextElementSibling as HTMLElement | null;
      while (
        next?.tagName === 'SPAN' &&
        canonicalStyleText(next) === canonicalStyleText(span)
      ) {
        while (next.firstChild) span.appendChild(next.firstChild);
        const toRemove = next;
        next = toRemove.nextElementSibling as HTMLElement | null;
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
    unwrapElementsInRange(root, start, end);
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

export function readLogicalFormatState(
  root: HTMLElement,
  bookmark: FlowSelectionBookmark,
  fallbackLayout: A4DocumentLayout = DEFAULT_A4_DOCUMENT_LAYOUT,
): EditorFormatState {
  const point = domPointForFlowPoint(root, bookmark.anchor);
  if (!point) return defaultFormatState(fallbackLayout);

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
  state.textColor =
    inlinePropertyInAncestors(point.node, root, 'color') ?? '#000000';
  state.highlightColor =
    inlinePropertyInAncestors(point.node, root, 'background-color') ??
    '#ffffff';
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
