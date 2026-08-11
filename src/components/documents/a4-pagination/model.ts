import {
  HARD_PAGE_BREAK_HTML,
  HARD_PAGE_BREAK_REGEX,
  normalizeLegacySoftPageBreaks,
  splitHardPageSections,
} from '@/lib/document-page-breaks';
import type { FlowPoint, FlowSelectionBookmark } from './selection';

export { HARD_PAGE_BREAK_HTML } from '@/lib/document-page-breaks';
const FLOW_ATTRIBUTE_NAMES = [
  'data-flow-id',
  'data-flow-continuation',
  'data-flow-continuation-item',
  'data-flow-oversized',
] as const;

let fallbackFlowId = 0;

export interface PageFragment {
  content: string;
  hardBreakBefore: boolean;
  oversized?: boolean;
}

export interface DomPoint {
  node: Node;
  offset: number;
}

export const EMPTY_EDITABLE_PARAGRAPH_HTML = '<p><br></p>';

/**
 * DOM-free hard-section count derived from derived page fragments.
 * Every explicit hard boundary starts a new section, and an empty page list
 * still represents one editable section once materialized.
 */
export function hardSectionCountFromPages(
  pages: ReadonlyArray<{ hardBreakBefore: boolean }>,
): number {
  if (pages.length === 0) return 0;
  return 1 + pages.reduce(
    (count, page) => count + (page.hardBreakBefore ? 1 : 0),
    0,
  );
}

function nextFlowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  fallbackFlowId += 1;
  return `a4-flow-${fallbackFlowId}`;
}

export function ensureFlowId(element: HTMLElement): string {
  if (!element.dataset.flowId) {
    element.dataset.flowId = nextFlowId();
  }
  return element.dataset.flowId;
}

export function normalizeCanonicalHtml(input: string): string {
  return normalizeLegacySoftPageBreaks(input).replace(
    HARD_PAGE_BREAK_REGEX,
    HARD_PAGE_BREAK_HTML,
  );
}

export function ensureEditableCanonicalHtml(input: string): string {
  const normalized = normalizeCanonicalHtml(input);
  const root = document.createElement('div');
  root.innerHTML = normalized;
  const hasContent = Boolean(
    root.textContent?.length ||
      root.querySelector(
        'audio,canvas,embed,hr,iframe,img,input,object,svg,table,textarea,video,.page-break',
      ),
  );
  return hasContent ? root.innerHTML : EMPTY_EDITABLE_PARAGRAPH_HTML;
}

export function splitHardSections(input: string): string[] {
  return splitHardPageSections(normalizeCanonicalHtml(input));
}

export function hydrateFlowContainer(container: HTMLElement): void {
  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (element.classList.contains('page-break')) return;
      ensureFlowId(element);
      element.querySelectorAll<HTMLElement>('li, tr').forEach((nestedBlock) => {
        ensureFlowId(nestedBlock);
      });
      return;
    }

    if (node.nodeType === Node.TEXT_NODE && node.textContent?.length) {
      const paragraph = document.createElement('p');
      paragraph.dataset.flowId = nextFlowId();
      paragraph.textContent = node.textContent;
      container.replaceChild(paragraph, node);
    }
  });
}

function hydrateSection(section: string): string {
  const container = document.createElement('div');
  container.innerHTML = section;
  hydrateFlowContainer(container);

  return container.innerHTML;
}

export function hydrateFlowHtml(input: string): string {
  return splitHardSections(input)
    .map(hydrateSection)
    .join(HARD_PAGE_BREAK_HTML);
}

export function normalizeEditedFlowIds(root: HTMLElement): void {
  const seen = new Set<string>();

  root.querySelectorAll<HTMLElement>('[data-flow-id]').forEach((element) => {
    const flowId = element.dataset.flowId;
    if (!flowId) return;

    if (seen.has(flowId)) {
      element.dataset.flowId = nextFlowId();
    }
    seen.add(element.dataset.flowId!);
  });
}

export function stripFlowMetadata(input: string): string {
  const normalized = normalizeCanonicalHtml(input);
  const container = document.createElement('div');
  container.innerHTML = normalized;

  FLOW_ATTRIBUTE_NAMES.forEach((attribute) => {
    container.querySelectorAll(`[${attribute}]`).forEach((element) => {
      element.removeAttribute(attribute);
    });
  });
  container.querySelectorAll('[style*="--flow-list-start"]').forEach((element) => {
    removeFlowListStart(element as HTMLElement);
  });

  container.querySelectorAll('.page-break').forEach((element) => {
    element.setAttribute('class', 'page-break');
    element.setAttribute('data-break-type', 'hard');
    element.innerHTML = '';
  });

  return container.innerHTML;
}

function appendTableContinuation(
  target: HTMLTableElement,
  source: HTMLTableElement,
): void {
  const sourceBodies = Array.from(source.tBodies);

  sourceBodies.forEach((sourceBody, index) => {
    const targetBody = target.tBodies[index] ?? target.createTBody();
    Array.from(sourceBody.rows).forEach((row) => targetBody.appendChild(row));
  });

  if (source.tFoot) {
    if (!target.tFoot) {
      target.appendChild(source.tFoot);
    } else {
      Array.from(source.tFoot.rows).forEach((row) => target.tFoot?.appendChild(row));
    }
  }
}

function isListElement(element: Element | null): element is HTMLElement {
  return element?.tagName === 'OL' || element?.tagName === 'UL';
}

function mergeBoundaryListContinuation(
  targetItem: HTMLElement,
  sourceItem: HTMLElement,
): void {
  const targetList = targetItem.lastElementChild;
  const sourceList = sourceItem.firstElementChild;
  if (
    !isListElement(targetList) ||
    !isListElement(sourceList) ||
    targetList.tagName !== sourceList.tagName
  ) {
    return;
  }

  const listFlowId = targetList.dataset.flowId;
  if (listFlowId && sourceList.dataset.flowId === listFlowId) {
    appendContinuation(targetList, sourceList);
    sourceList.remove();
    return;
  }

  const targetBoundary = targetList.lastElementChild as HTMLElement | null;
  const sourceBoundary = sourceList.firstElementChild as HTMLElement | null;
  if (!targetBoundary || !sourceBoundary) return;

  const boundaryFlowId = targetBoundary.dataset.flowId;
  if (
    !boundaryFlowId ||
    sourceBoundary.dataset.flowId !== boundaryFlowId ||
    targetBoundary.tagName !== sourceBoundary.tagName
  ) {
    return;
  }

  appendContinuation(targetList, sourceList);
  sourceList.remove();
}

function mergeBoundaryFlowContinuation(
  target: HTMLElement,
  source: HTMLElement,
): void {
  const targetBoundary = target.lastElementChild as HTMLElement | null;
  const sourceBoundary = source.firstElementChild as HTMLElement | null;
  if (!targetBoundary || !sourceBoundary) return;

  const boundaryFlowId = targetBoundary.dataset.flowId;
  if (
    !boundaryFlowId ||
    sourceBoundary.dataset.flowId !== boundaryFlowId ||
    targetBoundary.tagName !== sourceBoundary.tagName
  ) {
    return;
  }

  appendContinuation(targetBoundary, sourceBoundary);
  sourceBoundary.remove();
}

const LEGACY_TEXT_BOUNDARY_TAGS = new Set([
  'P',
  'DIV',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

function isWordCharacter(character: string | undefined): boolean {
  return Boolean(character && /[\p{L}\p{N}_]/u.test(character));
}

function boundaryTextOverlap(targetText: string, sourceText: string): number {
  const maximum = Math.min(targetText.length, sourceText.length);

  for (let length = maximum; length >= 2; length -= 1) {
    const overlap = sourceText.slice(0, length);
    if (!/[\p{L}\p{N}]/u.test(overlap) || !targetText.endsWith(overlap)) {
      continue;
    }

    const targetStart = targetText.length - length;
    if (
      !isWordCharacter(targetText[targetStart - 1]) &&
      !isWordCharacter(sourceText[length])
    ) {
      return length;
    }
  }

  return 0;
}

function removeTextPrefix(element: HTMLElement, length: number): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = length;
  let node: Node | null;

  while (remaining > 0 && (node = walker.nextNode())) {
    const text = node.textContent ?? '';
    if (remaining >= text.length) {
      remaining -= text.length;
      node.textContent = '';
      continue;
    }

    node.textContent = text.slice(remaining);
    remaining = 0;
  }
}

/**
 * Older pagination builds could leave the same tail word in both halves of a
 * continued list item. Only repair an exact word-boundary overlap when the
 * list item is explicitly marked as a continuation and its boundary blocks
 * either share a flow id or predate nested-block flow ids entirely.
 */
function repairLegacyBoundaryTextOverlap(
  target: HTMLElement,
  source: HTMLElement,
): void {
  if (!source.hasAttribute('data-flow-continuation-item')) return;

  const targetBoundary = target.lastElementChild as HTMLElement | null;
  const sourceBoundary = source.firstElementChild as HTMLElement | null;
  if (
    !targetBoundary ||
    !sourceBoundary ||
    targetBoundary.tagName !== sourceBoundary.tagName ||
    !LEGACY_TEXT_BOUNDARY_TAGS.has(targetBoundary.tagName)
  ) {
    return;
  }

  const targetFlowId = targetBoundary.dataset.flowId;
  const sourceFlowId = sourceBoundary.dataset.flowId;
  const provenCurrentContinuation =
    Boolean(targetFlowId) && targetFlowId === sourceFlowId;
  const legacyContinuation = !targetFlowId && !sourceFlowId;
  if (!provenCurrentContinuation && !legacyContinuation) return;

  const overlap = boundaryTextOverlap(
    targetBoundary.textContent ?? '',
    sourceBoundary.textContent ?? '',
  );
  if (overlap === 0) return;

  removeTextPrefix(sourceBoundary, overlap);
  if (
    !(sourceBoundary.textContent ?? '').length &&
    !sourceBoundary.querySelector('br,hr,img,table,ul,ol')
  ) {
    sourceBoundary.remove();
  }
}

function appendContinuation(target: HTMLElement, source: HTMLElement): void {
  if (target.tagName === 'TABLE' && source.tagName === 'TABLE') {
    appendTableContinuation(
      target as HTMLTableElement,
      source as HTMLTableElement,
    );
    return;
  }

  if (
    (target.tagName === 'UL' || target.tagName === 'OL') &&
    target.tagName === source.tagName
  ) {
    removeFlowListStart(target);
    while (source.firstElementChild) {
      const sourceItem = source.firstElementChild as HTMLElement;
      const targetItem = target.lastElementChild as HTMLElement | null;
      if (
        sourceItem.dataset.flowId &&
        targetItem?.dataset.flowId === sourceItem.dataset.flowId &&
        targetItem.tagName === sourceItem.tagName
      ) {
        mergeBoundaryListContinuation(targetItem, sourceItem);
        appendContinuation(targetItem, sourceItem);
        sourceItem.remove();
      } else {
        target.appendChild(sourceItem);
      }
    }
    return;
  }

  repairLegacyBoundaryTextOverlap(target, source);
  mergeBoundaryFlowContinuation(target, source);

  while (source.firstChild) {
    target.appendChild(source.firstChild);
  }
}

function removeFlowListStart(element: HTMLElement): void {
  element.style.removeProperty('--flow-list-start');
  if (element.getAttribute('style') === '') {
    element.removeAttribute('style');
  }
}

export function reassemblePageFragments(pages: PageFragment[]): string {
  const canonical = document.createElement('div');

  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0 && page.hardBreakBefore) {
      const breakTemplate = document.createElement('template');
      breakTemplate.innerHTML = HARD_PAGE_BREAK_HTML;
      canonical.appendChild(breakTemplate.content.firstElementChild!);
    }

    const pageContainer = document.createElement('div');
    pageContainer.innerHTML = page.content;

    Array.from(pageContainer.childNodes).forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        canonical.appendChild(node);
        return;
      }

      const source = node as HTMLElement;
      const sourceFlowId = source.dataset.flowId;
      const previous = canonical.lastElementChild as HTMLElement | null;
      const canMerge =
        sourceFlowId &&
        previous?.dataset.flowId === sourceFlowId &&
        previous.tagName === source.tagName;

      if (canMerge) {
        appendContinuation(previous, source);
        previous.removeAttribute('data-flow-continuation');
      } else {
        source.removeAttribute('data-flow-continuation');
        if (!source.dataset.flowId && !source.classList.contains('page-break')) {
          source.dataset.flowId = nextFlowId();
        }
        canonical.appendChild(source);
      }
    });
  });

  return canonical.innerHTML;
}

export function deleteCharacterBeforeTextOffset(
  input: string,
  textOffset: number,
): string {
  if (textOffset <= 0) return input;

  const container = document.createElement('div');
  container.innerHTML = input;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const targetIndex = textOffset - 1;
  let consumed = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const text = node.textContent ?? '';
    if (targetIndex < consumed + text.length) {
      const localIndex = targetIndex - consumed;
      node.textContent = `${text.slice(0, localIndex)}${text.slice(localIndex + 1)}`;
      break;
    }
    consumed += text.length;
  }

  return container.innerHTML;
}

function textPointForOffset(
  element: HTMLElement,
  requestedOffset: number,
): DomPoint {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = requestedOffset;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }

  return { node: element, offset: element.childNodes.length };
}

export function domPointForFlowPoint(
  root: HTMLElement,
  point: FlowPoint,
): DomPoint | null {
  const fragments = Array.from(
    root.querySelectorAll<HTMLElement>('[data-flow-id]'),
  ).filter((candidate) => candidate.dataset.flowId === point.flowId);
  if (fragments.length === 0) return null;

  let consumed = 0;
  for (const fragment of fragments) {
    const length = fragment.textContent?.length ?? 0;
    if (point.offset <= consumed + length) {
      return textPointForOffset(
        fragment,
        Math.max(0, point.offset - consumed),
      );
    }
    consumed += length;
  }

  const lastFragment = fragments[fragments.length - 1];
  return textPointForOffset(
    lastFragment,
    lastFragment.textContent?.length ?? 0,
  );
}

export function deleteFlowSelection(
  input: string,
  bookmark: FlowSelectionBookmark,
): string {
  const container = document.createElement('div');
  container.innerHTML = input;
  let start = domPointForFlowPoint(container, bookmark.anchor);
  let end = domPointForFlowPoint(container, bookmark.focus);
  if (!start || !end) return input;

  const startProbe = document.createRange();
  startProbe.setStart(start.node, start.offset);
  startProbe.collapse(true);
  const endProbe = document.createRange();
  endProbe.setStart(end.node, end.offset);
  endProbe.collapse(true);
  if (
    startProbe.compareBoundaryPoints(Range.START_TO_START, endProbe) > 0
  ) {
    [start, end] = [end, start];
  }

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  range.deleteContents();
  return container.innerHTML;
}

export function replaceFlowSelection(
  input: string,
  bookmark: FlowSelectionBookmark,
  replacementHtml: string,
): string {
  const container = document.createElement('div');
  container.innerHTML = input;
  let start = domPointForFlowPoint(container, bookmark.anchor);
  let end = domPointForFlowPoint(container, bookmark.focus);
  if (!start || !end) return input;

  const startProbe = document.createRange();
  startProbe.setStart(start.node, start.offset);
  startProbe.collapse(true);
  const endProbe = document.createRange();
  endProbe.setStart(end.node, end.offset);
  endProbe.collapse(true);
  if (startProbe.compareBoundaryPoints(Range.START_TO_START, endProbe) > 0) {
    [start, end] = [end, start];
  }

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  range.deleteContents();

  const template = document.createElement('template');
  template.innerHTML = replacementHtml;
  const singleParagraph =
    template.content.childElementCount === 1 &&
    template.content.firstElementChild?.tagName === 'P'
      ? template.content.firstElementChild
      : null;
  const replacement = document.createDocumentFragment();
  if (singleParagraph) {
    while (singleParagraph.firstChild) {
      replacement.appendChild(singleParagraph.firstChild);
    }
  } else {
    replacement.appendChild(template.content);
  }
  range.insertNode(replacement);
  return container.innerHTML;
}
