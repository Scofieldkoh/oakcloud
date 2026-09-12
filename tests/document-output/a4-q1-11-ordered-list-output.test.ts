import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import puppeteer from 'puppeteer-core';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { findChromePath } from '@/lib/chrome-executable';
import { buildPDFHtml, generatePDF } from '@/services/document-export.service';

const FIRST = 'Q1-REAL-START-7F4A';
const LAST = 'Q1-REAL-END-9C2D';
const margins = { top: 20, right: 20, bottom: 20, left: 20 };

const paginatedList = [
  '<ol start="20" class="q1-paginated">',
  ...Array.from({ length: 24 }, (_, index) => {
    const number = 20 + index;
    return `<li><p>Q1-PAGED-${number} ${'pagination continuation evidence '.repeat(14)}</p></li>`;
  }),
  '</ol>',
].join('');

const canonicalContent = [
  `<h1>${FIRST}</h1>`,
  '<ol class="q1-default-one">',
  '<li><p>Q1-DEFAULT-ONE</p></li>',
  '</ol>',
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
  '</ol>',
  '<ol start="3" class="q1-nested">',
  '<li><p>Q1-NESTED-PARENT-THREE</p><ol start="4"><li><p>Q1-NESTED-CHILD-FOUR</p></li></ol></li>',
  '</ol>',
  '<ol start="8" class="q1-continuation">',
  '<li><p>Q1-CONTINUATION-EIGHT</p></li>',
  '</ol>',
  '<ol start="1" class="q1-restart">',
  '<li><p>Q1-RESTART-ONE</p></li>',
  '</ol>',
  paginatedList,
  `<p>${LAST}</p>`,
].join('');

async function extractPdfText(buffer: Buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), disableFontFace: true });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' '),
    );
  }
  await task.destroy();
  return { pageCount: pdf.numPages, text: pages.join('\n') };
}

function context(text: string, label: string) {
  const index = text.indexOf(label);
  if (index < 0) return `MISSING:${label}`;
  return text.slice(Math.max(0, index - 40), Math.min(text.length, index + label.length + 40));
}

function countOccurrences(text: string, label: string) {
  return text.split(label).length - 1;
}

describe('A4 editor Q1-11 ordered-list production output', () => {
  it('renders durable list numbering through real Chromium, pagination, and real PDF', async () => {
    expect(canonicalContent).not.toContain('--flow-list-start');
    expect(canonicalContent).not.toContain('data-flow-continuation-item');
    expect(canonicalContent).not.toContain('data-flow-id');

    const html = buildPDFHtml(
      {
        title: 'Q1-11 ordered-list production output',
        status: 'FINALIZED',
        content: canonicalContent,
        contentJson: undefined,
      },
      null,
      margins,
    );

    expect(html).toContain('start="5"');
    expect(html).toContain('start="8"');
    expect(html).toContain('start="1"');
    expect(html).toContain('list-alpha');
    expect(html).toContain('list-bold-numbers');

    const outputDir = process.env.Q1_OUTPUT_DIR;
    if (outputDir) mkdirSync(outputDir, { recursive: true });

    const executablePath = await findChromePath();
    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      if (outputDir) {
        await page.screenshot({
          path: join(outputDir, 'a4-q1-11-real-html.png'),
          fullPage: true,
        });
      }
      const structure = await page.evaluate(() => {
        const nestedChild = Array.from(document.querySelectorAll('li')).find((item) =>
          (item.textContent ?? '').trim() === 'Q1-NESTED-CHILD-FOUR',
        );
        let nestedDepth = 0;
        let cursor: Element | null = nestedChild ?? null;
        while (cursor) {
          if (cursor.tagName === 'OL') nestedDepth += 1;
          cursor = cursor.parentElement;
        }
        const boldItem = Array.from(document.querySelectorAll('li')).find((item) =>
          (item.textContent ?? '').trim() === 'Q1-BOLD-FIRST',
        );
        return {
          startFive: document.querySelector('ol.q1-start-five')?.getAttribute('start'),
          continuation: document.querySelector('ol.q1-continuation')?.getAttribute('start'),
          restart: document.querySelector('ol.q1-restart')?.getAttribute('start'),
          nestedOuter: document.querySelector('ol.q1-nested')?.getAttribute('start'),
          nestedInner: document.querySelector('ol.q1-nested ol')?.getAttribute('start'),
          alphaClass: document.querySelector('ol.q1-alpha')?.className,
          boldClass: document.querySelector('ol.q1-bold')?.className,
          boldWeight: boldItem ? getComputedStyle(boldItem, '::before').fontWeight : '',
          nestedDepth,
          projectionNodeCount: document.querySelectorAll(
            '[data-flow-continuation-item], [data-flow-id], [data-a4-flow-id]',
          ).length,
          projectionStyleCount: Array.from(document.querySelectorAll<HTMLElement>('ol')).filter(
            (list) => list.style.getPropertyValue('--flow-list-start') !== '',
          ).length,
        };
      });
      expect(structure.startFive).toBe('5');
      expect(structure.continuation).toBe('8');
      expect(structure.restart).toBe('1');
      expect(structure.nestedOuter).toBe('3');
      expect(structure.nestedInner).toBe('4');
      expect(structure.alphaClass).toContain('list-alpha');
      expect(structure.boldClass).toContain('list-bold-numbers');
      expect(structure.boldWeight).toMatch(/^(700|bold)$/i);
      expect(structure.nestedDepth).toBe(2);
      expect(structure.projectionNodeCount).toBe(0);
      expect(structure.projectionStyleCount).toBe(0);
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

    const extracted = await extractPdfText(pdfBuffer);
    if (outputDir) {
      writeFileSync(join(outputDir, 'a4-q1-11-real-output.pdf'), pdfBuffer);
      writeFileSync(join(outputDir, 'a4-q1-11-real-output.txt'), `${extracted.text}\n`);
    }

    console.info(`Q1_11_REAL_PDF pages=${extracted.pageCount} bytes=${pdfBuffer.length}`);
    console.info(`Q1_11_CONTEXT_START ${context(extracted.text, 'Q1-NUMBER-FIVE')}`);
    console.info(`Q1_11_CONTEXT_CONT ${context(extracted.text, 'Q1-CONTINUATION-EIGHT')}`);
    console.info(`Q1_11_CONTEXT_RESTART ${context(extracted.text, 'Q1-RESTART-ONE')}`);
    console.info(`Q1_11_CONTEXT_ALPHA ${context(extracted.text, 'Q1-ALPHA-FIRST')}`);
    console.info(`Q1_11_CONTEXT_PAGED ${context(extracted.text, 'Q1-PAGED-35')}`);

    expect(pdfBuffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdfBuffer.length).toBeGreaterThan(5_000);
    expect(extracted.pageCount).toBeGreaterThan(1);
    expect(countOccurrences(extracted.text, FIRST)).toBe(1);
    expect(countOccurrences(extracted.text, LAST)).toBe(1);
    expect(extracted.text.indexOf(FIRST)).toBeLessThan(extracted.text.indexOf(LAST));

    for (const label of [
      'Q1-DEFAULT-ONE',
      'Q1-NUMBER-FIVE',
      'Q1-NUMBER-SIX',
      'Q1-ALPHA-FIRST',
      'Q1-ALPHA-SECOND',
      'Q1-BOLD-FIRST',
      'Q1-NESTED-PARENT-THREE',
      'Q1-NESTED-CHILD-FOUR',
      'Q1-CONTINUATION-EIGHT',
      'Q1-RESTART-ONE',
      'Q1-PAGED-20',
      'Q1-PAGED-35',
      'Q1-PAGED-43',
    ]) {
      expect(countOccurrences(extracted.text, label)).toBe(1);
    }

    expect(context(extracted.text, 'Q1-DEFAULT-ONE')).toMatch(/1[.)]\s*Q1-DEFAULT-ONE/);
    expect(context(extracted.text, 'Q1-NUMBER-FIVE')).toMatch(/5[.)]\s*Q1-NUMBER-FIVE/);
    expect(context(extracted.text, 'Q1-NUMBER-SIX')).toMatch(/6[.)]\s*Q1-NUMBER-SIX/);
    expect(context(extracted.text, 'Q1-CONTINUATION-EIGHT')).toMatch(/8[.)]\s*Q1-CONTINUATION-EIGHT/);
    expect(context(extracted.text, 'Q1-RESTART-ONE')).toMatch(/1[.)]\s*Q1-RESTART-ONE/);
    expect(context(extracted.text, 'Q1-ALPHA-FIRST')).toMatch(/a[.)]\s*Q1-ALPHA-FIRST/i);
    expect(context(extracted.text, 'Q1-NESTED-PARENT-THREE')).toMatch(/3[.)]\s*Q1-NESTED-PARENT-THREE/);
    expect(context(extracted.text, 'Q1-NESTED-CHILD-FOUR')).toMatch(/3\.4\s*Q1-NESTED-CHILD-FOUR/);
    expect(context(extracted.text, 'Q1-PAGED-20')).toMatch(/20[.)]\s*Q1-PAGED-20/);
    expect(context(extracted.text, 'Q1-PAGED-35')).toMatch(/35[.)]\s*Q1-PAGED-35/);
    expect(context(extracted.text, 'Q1-PAGED-43')).toMatch(/43[.)]\s*Q1-PAGED-43/);
  }, 45_000);
});
