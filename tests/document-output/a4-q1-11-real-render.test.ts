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

const filler = Array.from(
  { length: 90 },
  (_, index) => `<p>Q1 real render filler ${index + 1}: stable pagination evidence.</p>`,
).join('');

const canonicalContent = [
  `<h1>${FIRST}</h1>`,
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
  '<ol start="8" class="q1-continuation">',
  '<li><p>Q1-CONTINUATION-EIGHT</p></li>',
  '</ol>',
  '<ol start="1" class="q1-restart">',
  '<li><p>Q1-RESTART-ONE</p></li>',
  '</ol>',
  filler,
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
  return text.slice(Math.max(0, index - 30), Math.min(text.length, index + label.length + 30));
}

describe('A4 editor Q1-11 real HTML/PDF rendering acceptance', () => {
  it('renders start/continuation/restart/list-style semantics through real Chromium and real PDF', async () => {
    const html = buildPDFHtml(
      {
        title: 'Q1-11 real rendering acceptance',
        status: 'FINALIZED',
        content: canonicalContent,
        contentJson: undefined,
      },
      null,
      margins,
    );

    expect(html).toContain('start="5"');
    expect(html).toContain('start="8"');
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
      const structure = await page.evaluate(() => ({
        startFive: document.querySelector('ol.q1-start-five')?.getAttribute('start'),
        continuation: document.querySelector('ol.q1-continuation')?.getAttribute('start'),
        restart: document.querySelector('ol.q1-restart')?.getAttribute('start'),
        alphaClass: document.querySelector('ol.q1-alpha')?.className,
        boldClass: document.querySelector('ol.q1-bold')?.className,
      }));
      expect(structure.startFive).toBe('5');
      expect(structure.continuation).toBe('8');
      expect(structure.restart).toBe('1');
      expect(structure.alphaClass).toContain('list-alpha');
      expect(structure.boldClass).toContain('list-bold-numbers');
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

    expect(pdfBuffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdfBuffer.length).toBeGreaterThan(5_000);
    expect(extracted.pageCount).toBeGreaterThan(1);
    expect(extracted.text).toContain(FIRST);
    expect(extracted.text).toContain(LAST);
    expect(extracted.text.indexOf(FIRST)).toBeLessThan(extracted.text.indexOf(LAST));

    for (const label of [
      'Q1-NUMBER-FIVE',
      'Q1-NUMBER-SIX',
      'Q1-ALPHA-FIRST',
      'Q1-ALPHA-SECOND',
      'Q1-BOLD-FIRST',
      'Q1-CONTINUATION-EIGHT',
      'Q1-RESTART-ONE',
    ]) {
      expect(extracted.text).toContain(label);
    }

    // These assertions are deliberately against actual PDF text produced by
    // Chromium, after the production paginator has replaced the page sections.
    expect(context(extracted.text, 'Q1-NUMBER-FIVE')).toMatch(/5[.)]\s*Q1-NUMBER-FIVE/);
    expect(context(extracted.text, 'Q1-NUMBER-SIX')).toMatch(/6[.)]\s*Q1-NUMBER-SIX/);
    expect(context(extracted.text, 'Q1-CONTINUATION-EIGHT')).toMatch(/8[.)]\s*Q1-CONTINUATION-EIGHT/);
    expect(context(extracted.text, 'Q1-RESTART-ONE')).toMatch(/1[.)]\s*Q1-RESTART-ONE/);
    expect(context(extracted.text, 'Q1-ALPHA-FIRST')).toMatch(/a[.)]\s*Q1-ALPHA-FIRST/i);
  });
});
