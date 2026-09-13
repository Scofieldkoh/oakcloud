import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createA4PageLayout } from '@/components/documents/a4-pagination/a4-page-layout';
import { DEFAULT_A4_DOCUMENT_LAYOUT } from '@/components/documents/a4-pagination/layout';
import { buildPDFHtml, generatePDF } from '@/services/document-export.service';
import { renderPaginatedA4Html } from '@/services/a4-output-browser.service';
import { resolvePlaceholders } from '@/lib/placeholder-resolver';

const START = 'Q2-OUTPUT-START-98A1';
const END = 'Q2-OUTPUT-END-45C7';
const MANUAL_BREAK_AFTER = 'Q2-MANUAL-BREAK-AFTER';
const margins = { top: 20, right: 20, bottom: 20, left: 20 };

async function extractPdfText(buffer: Buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), disableFontFace: true });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).filter(Boolean).join(' '));
  }
  await task.destroy();
  return { pageCount: pdf.numPages, text: pages.join('\n') };
}

function count(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

describe('A4 editor Q2 real HTML/PDF output acceptance', () => {
  it('resolves representative typed fields and preserves one canonical pagination path into inspectable HTML/PDF', async () => {
    const filler = Array.from(
      { length: 105 },
      (_, index) => `<p>Q2 realistic multi-page filler ${index + 1}: output parity evidence.</p>`,
    ).join('');
    const template = [
      `<h1>${START}</h1>`,
      '<p>Normal text before typed values.</p>',
      '<p>Approved: {{custom.approved}}</p>',
      '<p>Count: {{custom.count}}</p>',
      '<p>Date: {{custom.date}}</p>',
      '<p>Amount: {{custom.amount}}</p>',
      '<p>Multiline: {{custom.notes}}</p>',
      '<p>Empty: [{{custom.empty}}]</p>',
      '<p>Absent: {{custom.absent}}</p>',
      '<div class="page-break" data-break-type="hard"></div>',
      `<p>${MANUAL_BREAK_AFTER}</p>`,
      filler,
      `<p>${END}</p>`,
      '<p data-flow-id="editor-only" data-field-reference="field-only" aria-label="projection-only" onclick="alert(1)">Sanitize me</p>',
    ].join('');

    const resolved = resolvePlaceholders(
      template,
      {
        custom: {
          approved: false,
          count: 0,
          date: '2026-09-13',
          amount: '1234.5000',
          notes: 'line one\nline two',
          empty: '',
        },
        system: { currentDate: new Date('2026-09-13T00:00:00.000Z') },
      },
      { missingPlaceholder: 'highlight' },
    );

    expect(resolved.missing).toContain('custom.absent');
    expect(resolved.resolved).toContain('Approved: No');
    expect(resolved.resolved).toContain('Count: 0');
    expect(resolved.resolved).toContain('Date: 13 September 2026');
    expect(resolved.resolved).toContain('Amount: 1234.5000');
    expect(resolved.resolved).toContain('line one\nline two');
    expect(resolved.resolved).toContain('Empty: []');
    expect(resolved.resolved).toContain('[custom.absent]');

    const baseHtml = buildPDFHtml(
      {
        title: 'Q2 independent output acceptance',
        status: 'FINALIZED',
        content: resolved.resolved,
        contentJson: undefined,
      },
      null,
      margins,
    );
    const pageLayout = createA4PageLayout(margins);
    const pagination = {
      canonicalHtml: resolved.resolved,
      layout: {
        contentWidthPx: pageLayout.contentWidthPx,
        contentHeightPx: pageLayout.contentHeightPx,
        fontFamily: DEFAULT_A4_DOCUMENT_LAYOUT.fontFamily,
        fontSize: DEFAULT_A4_DOCUMENT_LAYOUT.fontSize,
        lineHeight: String(DEFAULT_A4_DOCUMENT_LAYOUT.lineHeight),
        paragraphSpacing: DEFAULT_A4_DOCUMENT_LAYOUT.paragraphSpacing,
      },
    };

    const renderedHtml = await renderPaginatedA4Html({
      html: baseHtml,
      canonicalHtml: pagination.canonicalHtml,
      layout: pagination.layout,
      timeoutMs: 30_000,
    });
    const pdfBuffer = await generatePDF(baseHtml, {
      format: 'A4',
      orientation: 'portrait',
      margins,
      headerHtml: '',
      footerHtml: '',
      pagination,
    });
    const extracted = await extractPdfText(pdfBuffer);

    expect(renderedHtml.html).toContain(START);
    expect(renderedHtml.html).toContain(END);
    expect(renderedHtml.html).toContain(MANUAL_BREAK_AFTER);
    expect(renderedHtml.html).toContain('Approved: No');
    expect(renderedHtml.html).toContain('Count: 0');
    expect(renderedHtml.html).toContain('Date: 13 September 2026');
    expect(renderedHtml.html).toContain('Amount: 1234.5000');
    expect(renderedHtml.html).not.toContain('data-flow-id="editor-only"');
    expect(renderedHtml.html).not.toContain('data-field-reference="field-only"');
    expect(renderedHtml.html).not.toContain('aria-label="projection-only"');
    expect(renderedHtml.html).not.toContain('onclick=');
    expect((renderedHtml.html.match(/class="print-page"/g) ?? []).length).toBeGreaterThan(1);

    expect(pdfBuffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(pdfBuffer.length).toBeGreaterThan(5_000);
    expect(extracted.pageCount).toBeGreaterThan(1);
    for (const sentinel of [START, END, MANUAL_BREAK_AFTER, 'Approved: No', 'Count: 0']) {
      expect(count(extracted.text, sentinel)).toBe(1);
    }
    expect(extracted.text.indexOf(START)).toBeLessThan(extracted.text.indexOf(MANUAL_BREAK_AFTER));
    expect(extracted.text.indexOf(MANUAL_BREAK_AFTER)).toBeLessThan(extracted.text.indexOf(END));

    const outputDir = process.env.Q2_OUTPUT_DIR;
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'a4-q2-real-output.html'), renderedHtml.html);
      writeFileSync(join(outputDir, 'a4-q2-real-output.pdf'), pdfBuffer);
      writeFileSync(join(outputDir, 'a4-q2-real-output.txt'), `${extracted.text}\n`);
      writeFileSync(
        join(outputDir, 'a4-q2-output-manifest.json'),
        `${JSON.stringify({
          pageCount: extracted.pageCount,
          pdfBytes: pdfBuffer.length,
          missingFields: resolved.missing,
          checks: {
            false: 'No',
            zero: '0',
            date: '13 September 2026',
            amount: '1234.5000',
            multiline: true,
            empty: true,
            absentHighlighted: true,
            manualBreak: true,
            projectionAttributesRemoved: true,
          },
        }, null, 2)}\n`,
      );
    }

    console.info(`Q2_REAL_OUTPUT pages=${extracted.pageCount} pdfBytes=${pdfBuffer.length}`);
  }, 60_000);
});
