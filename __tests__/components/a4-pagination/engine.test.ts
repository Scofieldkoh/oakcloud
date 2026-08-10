import { describe, expect, it } from 'vitest';
import { hydrateFlowHtml, reassemblePageFragments, stripFlowMetadata } from '@/components/documents/a4-pagination/model';
import { paginateFlowHtml, type HtmlMeasurer } from '@/components/documents/a4-pagination/engine';

function visibleText(html: string): string {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element.textContent ?? '';
}

const characterMeasurer: HtmlMeasurer = {
  measure: (html) => visibleText(html).length,
};

describe('A4 deterministic pagination engine', () => {
  it('splits an overflowing paragraph and reassembles it losslessly', () => {
    const canonical = hydrateFlowHtml('<p>123456789012345</p>');
    const pages = paginateFlowHtml(canonical, characterMeasurer, 10);

    expect(pages).toHaveLength(2);
    expect(pages[0].content).toContain('data-flow-continuation="start"');
    expect(pages[1].content).toContain('data-flow-continuation="end"');
    expect(stripFlowMetadata(reassemblePageFragments(pages))).toBe('<p>123456789012345</p>');
  });

  it('splits overflowing paragraphs at word boundaries instead of mid-word', () => {
    const canonical = hydrateFlowHtml('<p>one two three four five</p>');
    const pages = paginateFlowHtml(canonical, characterMeasurer, 10);

    expect(pages.length).toBeGreaterThan(1);
    // Every page except the last ends with the whitespace we kept, and every
    // continuation starts with a complete word rather than a word fragment.
    pages.slice(0, -1).forEach((page) => {
      expect(visibleText(page.content)).toMatch(/\s$/);
    });
    pages.slice(1).forEach((page) => {
      expect(visibleText(page.content)).toMatch(/^\S/);
    });
    expect(stripFlowMetadata(reassemblePageFragments(pages))).toBe(
      '<p>one two three four five</p>',
    );
  });

  it('pulls following content backward when it fits', () => {
    const canonical = hydrateFlowHtml('<p>12345</p><p>6789</p>');
    const pages = paginateFlowHtml(canonical, characterMeasurer, 10);

    expect(pages).toHaveLength(1);
    expect(visibleText(pages[0].content)).toBe('123456789');
  });

  it('keeps hard sections on separate pages even when they fit together', () => {
    const canonical = hydrateFlowHtml('<p>One</p><div class="page-break" data-break-type="hard"></div><p>Two</p>');
    const pages = paginateFlowHtml(canonical, characterMeasurer, 100);

    expect(pages).toHaveLength(2);
    expect(pages[0].hardBreakBefore).toBe(false);
    expect(pages[1].hardBreakBefore).toBe(true);
  });

  it('splits tables only between body rows', () => {
    const rowMeasurer: HtmlMeasurer = {
      measure(html) {
        const element = document.createElement('div');
        element.innerHTML = html;
        return element.querySelectorAll('tbody tr').length * 5;
      },
    };
    const canonical = hydrateFlowHtml('<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></tbody></table>');
    const pages = paginateFlowHtml(canonical, rowMeasurer, 10);

    expect(pages).toHaveLength(2);
    expect(pages[0].content.match(/<tr\b/g)).toHaveLength(2);
    expect(pages[1].content.match(/<tr\b/g)).toHaveLength(1);
    expect(stripFlowMetadata(reassemblePageFragments(pages))).toContain('<td>3</td>');
  });

  it('is idempotent and does not create empty soft pages', () => {
    const canonical = hydrateFlowHtml('<p>123456789012345</p>');
    const first = paginateFlowHtml(canonical, characterMeasurer, 10);
    const second = paginateFlowHtml(reassemblePageFragments(first), characterMeasurer, 10);

    expect(second.map((page) => page.content)).toEqual(first.map((page) => page.content));
    expect(second.every((page) => visibleText(page.content).length > 0)).toBe(true);
  });

  it('reassembles a list item split across pages as one list item', () => {
    const canonical = hydrateFlowHtml(
      '<ul><li>123456789012345</li></ul>',
    );
    const pages = paginateFlowHtml(canonical, characterMeasurer, 10);
    const reassembled = reassemblePageFragments(pages);
    const container = document.createElement('div');
    container.innerHTML = stripFlowMetadata(reassembled);

    expect(pages).toHaveLength(2);
    expect(pages[1].content).toContain(
      'data-flow-continuation-item="true"',
    );
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.textContent).toBe('123456789012345');
  });

  it('continues ordered list numbering across pages', () => {
    const canonical = hydrateFlowHtml(
      '<ol><li><p>One</p></li><li><p>Two</p></li><li><p>Three</p></li></ol>',
    );
    const pages = paginateFlowHtml(canonical, characterMeasurer, 5);

    expect(pages.length).toBeGreaterThan(1);
    const numberedPages = pages.filter((page) => page.content.includes('<ol'));
    expect(numberedPages.length).toBeGreaterThan(1);
    numberedPages.slice(1).forEach((page) => {
      expect(page.content).toContain('--flow-list-start:');
    });
    expect(pages[1].content).toContain('--flow-list-start: 1');
    expect(stripFlowMetadata(reassemblePageFragments(pages))).toBe(
      '<ol><li><p>One</p></li><li><p>Two</p></li><li><p>Three</p></li></ol>',
    );
  });

  it('continues numbering from a custom start value across pages', () => {
    const canonical = hydrateFlowHtml(
      '<ol start="3"><li><p>One</p></li><li><p>Two</p></li></ol>',
    );
    const pages = paginateFlowHtml(canonical, characterMeasurer, 5);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages[1].content).toContain('--flow-list-start: 3');
    expect(stripFlowMetadata(reassemblePageFragments(pages))).toBe(
      '<ol start="3"><li><p>One</p></li><li><p>Two</p></li></ol>',
    );
  });

  it('marks an oversized list item continuation without restarting numbering', () => {
    const canonical = hydrateFlowHtml(
      '<ol><li><p>123456789012345</p></li></ol>',
    );
    const pages = paginateFlowHtml(canonical, characterMeasurer, 10);

    expect(pages).toHaveLength(2);
    expect(pages[1].content).toContain('data-flow-continuation-item="true"');
    expect(pages[1].content).toContain('--flow-list-start: 1');
    const container = document.createElement('div');
    container.innerHTML = stripFlowMetadata(reassemblePageFragments(pages));
    expect(container.querySelectorAll('ol > li')).toHaveLength(1);
    expect(container.textContent).toBe('123456789012345');
  });

  it('suppresses repeated markers when an oversized nested item splits across pages', () => {
    const canonical = hydrateFlowHtml(
      '<ol><li><p>One</p><ol><li><p>123456789012345</p></li></ol></li></ol>',
    );
    const pages = paginateFlowHtml(canonical, characterMeasurer, 10);

    expect(pages).toHaveLength(2);
    const pageTwo = document.createElement('div');
    pageTwo.innerHTML = pages[1].content;
    expect(
      pageTwo.querySelectorAll('li[data-flow-continuation-item="true"]'),
    ).toHaveLength(2);
    const nestedList = pageTwo.querySelector('ol ol') as HTMLElement | null;
    expect(
      nestedList?.style.getPropertyValue('--flow-list-start'),
    ).toBe('1');

    const container = document.createElement('div');
    container.innerHTML = stripFlowMetadata(reassemblePageFragments(pages));
    expect(container.textContent).toBe('One123456789012345');
  });

  it('keeps nested counter state stable when one item spans several pages', () => {
    const longText = Array.from(
      { length: 80 },
      (_, index) => `w${String(index + 1).padStart(3, '0')}`,
    ).join(' ');
    const canonical = hydrateFlowHtml(
      `<ol start="3"><li><p>Confidentiality</p><ol>` +
        `<li><p>${longText}</p></li>` +
        '<li><p>Next sub-item</p></li></ol></li></ol>',
    );
    const pages = paginateFlowHtml(canonical, characterMeasurer, 80);

    expect(pages.length).toBeGreaterThan(2);
    pages.slice(1).forEach((page) => {
      const root = document.createElement('div');
      root.innerHTML = page.content;
      const outer = root.querySelector<HTMLElement>(':scope > ol');
      const nested = outer?.querySelector<HTMLElement>('ol');
      expect(outer?.style.getPropertyValue('--flow-list-start')).toBe('3');
      expect(nested?.style.getPropertyValue('--flow-list-start')).toBe('1');
    });

    const last = document.createElement('div');
    last.innerHTML = pages.at(-1)!.content;
    const next = Array.from(last.querySelectorAll('li')).find(
      (item) => item.textContent === 'Next sub-item',
    );
    expect(next).toBeDefined();
    expect(next?.hasAttribute('data-flow-continuation-item')).toBe(false);
    expect(
      next?.parentElement?.style.getPropertyValue('--flow-list-start'),
    ).toBe('1');

    const reassembled = reassemblePageFragments(pages);
    const reassembledRoot = document.createElement('div');
    reassembledRoot.innerHTML = reassembled;
    expect(reassembledRoot.querySelectorAll(':scope > ol')).toHaveLength(1);
    expect(reassembledRoot.querySelectorAll('ol ol')).toHaveLength(1);
    expect(reassembledRoot.querySelectorAll('ol ol > li')).toHaveLength(2);

    const repaginated = paginateFlowHtml(
      reassembled,
      characterMeasurer,
      80,
    );
    const secondRoot = document.createElement('div');
    secondRoot.innerHTML = reassemblePageFragments(repaginated);
    expect(secondRoot.querySelectorAll('ol ol')).toHaveLength(1);
    expect(secondRoot.querySelectorAll('ol ol > li')).toHaveLength(2);
  });

  it('keeps a heading with the following block when they fit together', () => {
    const blockMeasurer: HtmlMeasurer = {
      measure(html) {
        const element = document.createElement('div');
        element.innerHTML = html;
        return element.children.length * 5;
      },
    };
    const canonical = hydrateFlowHtml(
      '<p>Lead</p><h2>Heading</h2><p>Following</p>',
    );
    const pages = paginateFlowHtml(canonical, blockMeasurer, 10);

    expect(pages).toHaveLength(2);
    expect(pages[0].content).toContain('Lead');
    expect(pages[0].content).not.toContain('Heading');
    expect(pages[1].content).toContain('Heading');
    expect(pages[1].content).toContain('Following');
  });

  it('renders an unsplittable oversized block once', () => {
    const imageMeasurer: HtmlMeasurer = {
      measure: (html) => (html.includes('<img') ? 20 : 0),
    };
    const canonical = hydrateFlowHtml('<img src="example.png" alt="Example">');
    const pages = paginateFlowHtml(canonical, imageMeasurer, 10);

    expect(pages).toHaveLength(1);
    expect(pages[0].oversized).toBe(true);
    expect(pages[0].content.match(/<img/g)).toHaveLength(1);
  });

  it('marks an unsplittable tall one-row table as oversized once', () => {
    const tableMeasurer: HtmlMeasurer = {
      measure: (html) => (html.includes('<table') ? 100 : 0),
    };
    const canonical = hydrateFlowHtml(
      '<table><tbody><tr><td>Tall row</td></tr></tbody></table>',
    );
    const pages = paginateFlowHtml(canonical, tableMeasurer, 10);

    expect(pages).toHaveLength(1);
    expect(pages[0].oversized).toBe(true);
    expect(pages[0].content.match(/<tr\b/g)).toHaveLength(1);
  });
});
