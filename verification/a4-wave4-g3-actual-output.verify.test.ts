import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generatePDF } from '@/services/document-export.service';
import { renderPaginatedA4Html } from '@/services/a4-output-browser.service';

const artifactDir = resolve(process.env.G3_ARTIFACT_DIR ?? 'artifacts/a4-wave4-g3');

const layout = {
  contentWidthPx: 640,
  contentHeightPx: 820,
  fontFamily: 'Arial, sans-serif',
  fontSize: '16px',
  lineHeight: '1.5',
  paragraphSpacing: '8px',
};

function canonicalFixture(): string {
  const beforeBreak = Array.from({ length: 18 }, (_, index) =>
    `<p>G3-BEFORE-${index + 1}: independent browser pagination evidence with enough text to occupy measurable space.</p>`,
  ).join('');
  const afterBreak = Array.from({ length: 38 }, (_, index) =>
    `<p>G3-AFTER-${index + 1}: continued multi-page content after the semantic page break.</p>`,
  ).join('');

  return [
    '<h1>Wave 4 G3 actual output</h1>',
    '<p>BOOLEAN_FALSE:false</p>',
    '<p>NUMERIC_ZERO:0</p>',
    '<p>DATE_VALUE:2026-09-14</p>',
    '<p>MULTILINE_VALUE:first line<br>second line</p>',
    '<p><span data-flow-id="verify-flow-1">SANITIZER_VALUE:retained-text</span></p>',
    beforeBreak,
    '<span data-a4-break="page"></span>',
    afterBreak,
  ].join('');
}

function outputShell(canonicalHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif}.print-page{box-sizing:border-box}</style></head><body><main id="a4-paginated-sections">${canonicalHtml}</main></body></html>`;
}

describe('Wave 4 independent G3 actual HTML/PDF output', () => {
  it('renders canonical field values, semantic breaks and sanitized multi-page output through real Chromium', async () => {
    await mkdir(artifactDir, { recursive: true });
    const canonicalHtml = canonicalFixture();
    const htmlShell = outputShell(canonicalHtml);

    const rendered = await renderPaginatedA4Html({
      html: htmlShell,
      canonicalHtml,
      layout,
      pageChrome: {
        headerHtml: '<div>G3-HEADER</div>',
        footerHtml: '<div>G3-FOOTER</div>',
      },
      timeoutMs: 30_000,
    });

    expect(rendered.assembly.pageCount).toBeGreaterThanOrEqual(2);
    expect(rendered.assembly.pages.some((page) => page.hardBreakBefore)).toBe(true);
    expect(rendered.html).toContain('BOOLEAN_FALSE:false');
    expect(rendered.html).toContain('NUMERIC_ZERO:0');
    expect(rendered.html).toContain('DATE_VALUE:2026-09-14');
    expect(rendered.html).toContain('MULTILINE_VALUE:first line');
    expect(rendered.html).toContain('second line');
    expect(rendered.html).toContain('SANITIZER_VALUE:retained-text');
    expect(rendered.html).not.toContain('data-flow-id=');
    expect(rendered.html).toContain('G3-HEADER');
    expect(rendered.html).toContain('G3-FOOTER');

    const pdf = await generatePDF(htmlShell, {
      format: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      headerHtml: '<div>G3-HEADER</div>',
      footerHtml: '<div>G3-FOOTER</div>',
      pagination: { canonicalHtml, layout },
    });

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(10_000);

    await Promise.all([
      writeFile(resolve(artifactDir, 'wave4-g3-actual-output.html'), rendered.html, 'utf8'),
      writeFile(resolve(artifactDir, 'wave4-g3-actual-output.pdf'), pdf),
      writeFile(
        resolve(artifactDir, 'wave4-g3-output-manifest.json'),
        JSON.stringify(
          {
            frozenCandidate: 'b522cf50f61f18b75f2cae62b42cd142bef4cf2d',
            htmlPageCount: rendered.assembly.pageCount,
            hardBreakPages: rendered.assembly.pages.filter((page) => page.hardBreakBefore).length,
            pdfBytes: pdf.byteLength,
            assertions: {
              falseValue: true,
              zeroValue: true,
              dateValue: true,
              multilineValue: true,
              semanticPageBreak: true,
              projectionDecorationRemoved: true,
              serverPageChrome: true,
            },
          },
          null,
          2,
        ),
        'utf8',
      ),
    ]);
  }, 90_000);
});
