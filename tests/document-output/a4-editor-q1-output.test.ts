import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import puppeteer from 'puppeteer-core';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { findChromePath } from '@/lib/chrome-executable';
import {
  buildPDFHtml,
  generatePDF,
} from '@/services/document-export.service';

const FIRST_SENTINEL = 'Q1-SENTINEL-START-7F4A';
const LAST_SENTINEL = 'Q1-SENTINEL-END-9C2D';
const SOFT_PAGINATION_MARKERS = [
  'data-a4-flow-id',
  'data-flow-id',
  'data-flow-continuation-item',
  'data-page-index',
  'data-page-number',
  'data-measurement',
  'data-oversized',
];

const filler = Array.from(
  { length: 90 },
  (_, index) => `<p>Q1 deterministic pagination filler ${index + 1}: stable output evidence.</p>`,
).join('');

const canonicalContent = [
  `<h1>${FIRST_SENTINEL}</h1>`,
  '<ol start="5" class="q1-start-five">',
  '<li><p>Q1-NUMBER-FIVE</p></li>',
  '<li><p>Q1-NUMBER-SIX</p></li>',
  '</ol>',
  '<ol class="list-alpha q1-alpha">',
  '<li><p>Q1-ALPHA-FIRST</p></li>',
  '<li><p>Q1-ALPHA-SECOND</p></li>',
  '</ol>',
  '<ol class="list-bold-numbers q1-bold">',
  '<li><p>Q1-BOLD-FIRST</p></li>',
  '<li><p>Q1-BOLD-SECOND</p></li>',
  '</ol>',
  '<ol start="7" class="q1-nested">',
  '<li><p>Q1-NESTED-PARENT</p><ol><li><p>Q1-NESTED-CHILD</p></li></ol></li>',
  '</ol>',
  '<ol start="8" class="q1-continuation"><li><p>Q1-CONTINUATION-EIGHT</p></li></ol>',
  '<ol start="1" class="q1-restart"><li><p>Q1-RESTART-ONE</p></li></ol>',
  filler,
  `<p>${LAST_SENTINEL}</p>`,
].join('');

const margins = { top: 20, right: 20, bottom: 20, left: 20 };

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

async function extractPdfText(buffer: Buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), disableFontFace: true });
  const pdf = await task.promise;
  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pageTexts.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' '),
    );
  }
  await task.destroy();
  return { pageCount: pdf.numPages, text: pageTexts.join('\n') };
}

describe('A4 editor Q1 real HTML/PDF output acceptance', () => {
  it('Q1-11 renders numbering semantics in real Chromium and preserves ordered sentinels in actual PDF bytes', async () => {
    const html = buildPDFHtml(
      {
        title: 'Q1 real output acceptance',
        status: 'FINALIZED',
        content: canonicalContent,
        contentJson: undefined,
      },
      null,
      margins,
    );

    expect(html).toContain('start="5"');
    expect(html).toContain('list-alpha');
    expect(html).toContain('list-bold-numbers');
    expect(html.indexOf(FIRST_SENTINEL)).toBeLessThan(html.indexOf(LAST_SENTINEL));
    for (const marker of SOFT_PAGINATION_MARKERS) expect(html).not.toContain(marker);

    const executablePath = await findChromePath();
    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const rendered = await page.evaluate(() => {
        const findList = (needle: string) => {
          const item = Array.from(document.querySelectorAll('li')).find((candidate) =>
            (candidate.textContent ?? '').includes(needle),
          );
          if (!item) throw new Error(`Missing rendered list item: ${needle}`);
          const list = item.closest('ol');
          if (!list) throw new Error(`Missing rendered list for: ${needle}`);
          const before = getComputedStyle(item, '::before');
          return {
            start: list.getAttribute('start'),
            classes: list.className,
            beforeContent: before.content,
            beforeWeight: before.fontWeight,
          };
        };
        return {
          startFive: findList('Q1-NUMBER-FIVE'),
          alpha: findList('Q1-ALPHA-FIRST'),
          bold: findList('Q1-BOLD-FIRST'),
          continuation: findList('Q1-CONTINUATION-EIGHT'),
          restart: findList('Q1-RESTART-ONE'),
          nestedDepth: (() => {
            const child = Array.from(document.querySelectorAll('li')).find((candidate) =>
              (candidate.textContent ?? '').trim() === 'Q1-NESTED-CHILD',
            );
            let depth = 0;
            let cursor: Element | null = child ?? null;
            while (cursor) {
              if (cursor.tagName === 'OL') depth += 1;
              cursor = cursor.parentElement;
            }
            return depth;
          })(),
        };
      });
      expect(rendered.startFive.start).toBe('5');
      expect(rendered.continuation.start).toBe('8');
      expect(rendered.restart.start).toBe('1');
      expect(rendered.alpha.classes).toContain('list-alpha');
      expect(rendered.alpha.beforeContent.toLowerCase()).toContain('lower-alpha');
      expect(rendered.bold.classes).toContain('list-bold-numbers');
      expect(Number.parseInt(rendered.bold.beforeWeight, 10) || 700).toBeGreaterThanOrEqual(600);
      expect(rendered.nestedDepth).toBeGreaterThanOrEqual(2);
      await page.close();
    } finally {
      await browser.close();
    }

    const pdfBuffer = await generatePDF(html, {
      format: 'A4',
      orientation: 'portrait',
      margins,
      headerHtml: '',
      footerHtml: '',
      pagination: {
        canonicalHtml: canonicalContent,
        layout: {
          contentWidthPx: 640,
          contentHeightPx: 900,
          fontFamily: 'Arial',
          fontSize: '12pt',
          lineHeight: '1.4',
          paragraphSpacing: '0.5em',
        },
      },
    });

    expect(pdfBuffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdfBuffer.length).toBeGreaterThan(5_000);

    const extracted = await extractPdfText(pdfBuffer);
    const outputDir = process.env.Q1_OUTPUT_DIR;
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'a4-q1-real-output.pdf'), pdfBuffer);
      writeFileSync(join(outputDir, 'a4-q1-real-output.txt'), `${extracted.text}\n`);
    }

    console.info(
      `Q1_REAL_PDF pages=${extracted.pageCount} bytes=${pdfBuffer.length} chrome=${executablePath}`,
    );
    console.info(`Q1_REAL_PDF_TEXT ${extracted.text.replace(/\s+/g, ' ').slice(0, 2000)}`);

    expect(extracted.pageCount).toBeGreaterThan(1);
    expect(countOccurrences(extracted.text, FIRST_SENTINEL)).toBe(1);
    expect(countOccurrences(extracted.text, LAST_SENTINEL)).toBe(1);
    expect(extracted.text.indexOf(FIRST_SENTINEL)).toBeLessThan(extracted.text.indexOf(LAST_SENTINEL));

    const orderedLabels = [
      'Q1-NUMBER-FIVE',
      'Q1-NUMBER-SIX',
      'Q1-ALPHA-FIRST',
      'Q1-ALPHA-SECOND',
      'Q1-BOLD-FIRST',
      'Q1-BOLD-SECOND',
      'Q1-NESTED-PARENT',
      'Q1-NESTED-CHILD',
      'Q1-CONTINUATION-EIGHT',
      'Q1-RESTART-ONE',
    ];
    let previousIndex = -1;
    for (const label of orderedLabels) {
      expect(countOccurrences(extracted.text, label)).toBe(1);
      const currentIndex = extracted.text.indexOf(label);
      expect(currentIndex).toBeGreaterThan(previousIndex);
      previousIndex = currentIndex;
    }

    // The production print CSS renders numbering through li::before counters.
    // Chrome exposes those rendered counters in the generated PDF text stream.
    expect(extracted.text).toMatch(/(^|\s)5[.)](\s|$)/);
    expect(extracted.text).toMatch(/(^|\s)6[.)](\s|$)/);
    expect(extracted.text).toMatch(/(^|\s)8[.)](\s|$)/);
    expect(extracted.text).toMatch(/(^|\s)1[.)](\s|$)/);
    expect(extracted.text).toMatch(/(^|\s)[aA][.)](\s|$)/);
  });
});
