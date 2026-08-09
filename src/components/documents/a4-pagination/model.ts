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
      if (!element.dataset.flowId) {
        element.dataset.flowId = nextFlowId();
      }
      element.querySelectorAll<HTMLElement>('li, tr').forEach((nestedBlock) => {
        if (!nestedBlock.dataset.flowId) {
          nestedBlock.dataset.flowId = nextFlowId();
        }
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
    while (source.firstElementChild) {
      const sourceItem = source.firstElementChild as HTMLElement;
      const targetItem = target.lastElementChild as HTMLElement | null;
      if (
        sourceItem.dataset.flowId &&
        targetItem?.dataset.flowId === sourceItem.dataset.flowId &&
        targetItem.tagName === sourceItem.tagName
      ) {
        appendContinuation(targetItem, sourceItem);
        sourceItem.remove();
      } else {
        target.appendChild(sourceItem);
      }
    }
    return;
  }

  while (source.firstChild) {
    target.appendChild(source.firstChild);
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
