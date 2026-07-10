import {
  hydrateFlowHtml,
  splitHardSections,
  type PageFragment,
} from './model';

export interface HtmlMeasurer {
  measure: (html: string) => number;
}

const SPLITTABLE_TEXT_TAGS = new Set([
  'P',
  'DIV',
  'BLOCKQUOTE',
  'LI',
  'UL',
  'OL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);
const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

interface ElementSplit {
  fit: HTMLElement;
  overflow: HTMLElement;
}

function htmlFor(element: Element): string {
  return element.outerHTML;
}

function hasRenderableContent(html: string): boolean {
  const container = document.createElement('div');
  container.innerHTML = html;
  return Boolean(
    (container.textContent ?? '').trim() ||
      container.querySelector('br,hr,img,table,ul,ol'),
  );
}

function collectTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.textContent?.length) nodes.push(node as Text);
  }
  return nodes;
}

function textPosition(
  nodes: Text[],
  requestedOffset: number,
): { node: Text; offset: number } | null {
  let offset = requestedOffset;
  for (const node of nodes) {
    const length = node.textContent?.length ?? 0;
    if (offset <= length) return { node, offset };
    offset -= length;
  }

  const last = nodes[nodes.length - 1];
  return last
    ? { node: last, offset: last.textContent?.length ?? 0 }
    : null;
}

function rangeHtml(
  root: HTMLElement,
  start: { node: Node; offset: number },
  end: { node: Node; offset: number },
): string {
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const container = document.createElement('div');
  container.appendChild(range.cloneContents());
  return container.innerHTML;
}

function splitTextElement(
  element: HTMLElement,
  prefixHtml: string,
  measurer: HtmlMeasurer,
  maxHeight: number,
): ElementSplit | null {
  if (!SPLITTABLE_TEXT_TAGS.has(element.tagName)) return null;

  const host = document.createElement('div');
  host.appendChild(element.cloneNode(true));
  const textNodes = collectTextNodes(host);
  const totalLength = textNodes.reduce(
    (sum, node) => sum + (node.textContent?.length ?? 0),
    0,
  );
  if (totalLength < 2) return null;

  let low = 1;
  let high = totalLength - 1;
  let best = 0;
  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const position = textPosition(textNodes, midpoint);
    if (!position) break;
    const fitHtml = rangeHtml(
      host,
      { node: host, offset: 0 },
      position,
    );

    if (measurer.measure(prefixHtml + fitHtml) <= maxHeight) {
      best = midpoint;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  if (best <= 0 || best >= totalLength) return null;

  const position = textPosition(textNodes, best);
  if (!position) return null;
  const fitWrapper = document.createElement('div');
  fitWrapper.innerHTML = rangeHtml(
    host,
    { node: host, offset: 0 },
    position,
  );
  const overflowWrapper = document.createElement('div');
  overflowWrapper.innerHTML = rangeHtml(
    host,
    position,
    { node: host, offset: host.childNodes.length },
  );
  const fit = fitWrapper.firstElementChild as HTMLElement | null;
  const overflow = overflowWrapper.firstElementChild as HTMLElement | null;
  if (!fit || !overflow) return null;

  fit.dataset.flowContinuation = 'start';
  overflow.dataset.flowContinuation = 'end';
  return { fit, overflow };
}

function cloneTableWithBodyRows(
  table: HTMLTableElement,
  start: number,
  end: number,
): HTMLTableElement {
  const clone = table.cloneNode(true) as HTMLTableElement;
  const sourceRows = Array.from(table.tBodies).flatMap((body) =>
    Array.from(body.rows),
  );
  Array.from(clone.tBodies).forEach((body) => body.replaceChildren());
  const targetBody = clone.tBodies[0] ?? clone.createTBody();
  sourceRows
    .slice(start, end)
    .forEach((row) => targetBody.appendChild(row.cloneNode(true)));
  return clone;
}

function splitTable(
  table: HTMLTableElement,
  prefixHtml: string,
  measurer: HtmlMeasurer,
  maxHeight: number,
): ElementSplit | null {
  const rows = Array.from(table.tBodies).flatMap((body) =>
    Array.from(body.rows),
  );
  if (rows.length < 2) return null;

  let best = 0;
  for (let count = 1; count < rows.length; count += 1) {
    const candidate = cloneTableWithBodyRows(table, 0, count);
    if (measurer.measure(prefixHtml + htmlFor(candidate)) > maxHeight) break;
    best = count;
  }
  if (best === 0) return null;

  const fit = cloneTableWithBodyRows(table, 0, best);
  const overflow = cloneTableWithBodyRows(table, best, rows.length);
  fit.dataset.flowContinuation = 'start';
  overflow.dataset.flowContinuation = 'end';
  return { fit, overflow };
}

function splitElement(
  element: HTMLElement,
  prefixHtml: string,
  measurer: HtmlMeasurer,
  maxHeight: number,
): ElementSplit | null {
  if (element.tagName === 'TABLE') {
    return splitTable(
      element as HTMLTableElement,
      prefixHtml,
      measurer,
      maxHeight,
    );
  }
  return splitTextElement(element, prefixHtml, measurer, maxHeight);
}

function paginateSection(
  section: string,
  measurer: HtmlMeasurer,
  maxHeight: number,
  hardBreakBefore: boolean,
): PageFragment[] {
  const container = document.createElement('div');
  container.innerHTML = section;
  const remaining = Array.from(container.children).map(
    (element) => element.cloneNode(true) as HTMLElement,
  );
  const pages: PageFragment[] = [];
  let currentHtml = '';
  let currentOversized = false;

  const commitPage = () => {
    if (!hasRenderableContent(currentHtml) && pages.length > 0) return;
    pages.push({
      content: currentHtml || '<p><br></p>',
      hardBreakBefore: pages.length === 0 && hardBreakBefore,
      oversized: currentOversized || undefined,
    });
    currentHtml = '';
    currentOversized = false;
  };

  while (remaining.length > 0) {
    const element = remaining.shift()!;
    const elementHtml = htmlFor(element);
    const nextElement = remaining[0];

    if (
      currentHtml &&
      HEADING_TAGS.has(element.tagName) &&
      nextElement &&
      measurer.measure(currentHtml + elementHtml + htmlFor(nextElement)) >
        maxHeight &&
      measurer.measure(elementHtml + htmlFor(nextElement)) <= maxHeight
    ) {
      remaining.unshift(element);
      commitPage();
      continue;
    }

    if (measurer.measure(currentHtml + elementHtml) <= maxHeight) {
      currentHtml += elementHtml;
      continue;
    }

    const split = splitElement(
      element,
      currentHtml,
      measurer,
      maxHeight,
    );
    if (split) {
      currentHtml += htmlFor(split.fit);
      commitPage();
      remaining.unshift(split.overflow);
      continue;
    }

    if (currentHtml) {
      remaining.unshift(element);
      commitPage();
      continue;
    }

    element.dataset.flowOversized = 'true';
    currentHtml = htmlFor(element);
    currentOversized = true;
    commitPage();
  }

  if (currentHtml || pages.length === 0) commitPage();
  return pages;
}

export function paginateFlowHtml(
  input: string,
  measurer: HtmlMeasurer,
  maxHeight: number,
): PageFragment[] {
  const hydrated = hydrateFlowHtml(input);
  const sections = splitHardSections(hydrated);
  return sections.flatMap((section, index) =>
    paginateSection(section, measurer, maxHeight, index > 0),
  );
}
