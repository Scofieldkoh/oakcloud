import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePlaceholders } from '@/lib/placeholder-resolver';
import { getA4SanitizerPolicy } from '@/lib/a4-content-policy';

const pdfMocks = vi.hoisted(() => ({
  launch: vi.fn(),
  newPage: vi.fn(),
  setContent: vi.fn(),
  addStyleTag: vi.fn(),
  addScriptTag: vi.fn(),
  evaluate: vi.fn(),
  pdf: vi.fn(),
  pageClose: vi.fn(),
  browserClose: vi.fn(),
}));

vi.mock('@/lib/chrome-executable', () => ({
  findChromePath: vi.fn(async () => '/synthetic/chrome'),
}));

vi.mock('puppeteer-core', () => ({
  default: { launch: pdfMocks.launch },
}));

import {
  ExportPaginationError,
  buildPDFHtml,
  buildPaginatedSectionsHtml,
  generatePDF,
} from '@/services/document-export.service';

const readRepoFile = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const exportServiceSource = readRepoFile('src/services/document-export.service.ts');

const CANONICAL_BREAK = '<span data-a4-break="page"></span>';
const LEGACY_BREAK = '<div class="page-break" data-break-type="hard"></div>';
const FIRST_SENTINEL = 'W0-PDF-FIRST-SENTINEL';
const LAST_SENTINEL = 'W0-PDF-LAST-SENTINEL';
const paginationFiller = Array.from(
  { length: 120 },
  (_, index) => `<p>W0 pagination filler ${index + 1}: deterministic synthetic content for multi-page output validation.</p>`,
).join('');

const representativeRichContent = [
  `<h1>${FIRST_SENTINEL}</h1>`,
  '<blockquote><p>Quoted governance text</p></blockquote>',
  '<table><caption>Approval matrix</caption><thead><tr><th>Role</th><th>Decision</th></tr></thead><tbody><tr><td>Board</td><td>Approve</td></tr></tbody><tfoot><tr><td colspan="2">End of matrix</td></tr></tfoot></table>',
  '<ol start="5"><li>Fifth resolution<ol><li>Nested resolution 5.1</li><li>Nested resolution 5.2</li></ol></li><li>Sixth resolution</li></ol>',
  '<p><span data-field-reference="field-canonical-001">Synthetic field/reference: REF-W0-001</span></p>',
  `<p>Before inline hard break${CANONICAL_BREAK}After inline hard break</p>`,
  LEGACY_BREAK,
  paginationFiller,
  `<p>${LAST_SENTINEL}</p>`,
].join('');

const buildRepresentativePdfHtml = (content: string) => buildPDFHtml(
  {
    title: 'WORKFLOW W1 output fixture',
    status: 'FINALIZED',
    content,
    contentJson: undefined,
  },
  null,
  { top: 20, right: 20, bottom: 20, left: 20 },
);

beforeEach(() => {
  vi.clearAllMocks();
  const page = {
    setDefaultTimeout: vi.fn(),
    setDefaultNavigationTimeout: vi.fn(),
    setContent: pdfMocks.setContent,
    addStyleTag: pdfMocks.addStyleTag,
    addScriptTag: pdfMocks.addScriptTag,
    evaluate: pdfMocks.evaluate,
    pdf: pdfMocks.pdf,
    close: pdfMocks.pageClose,
  };
  const browser = { newPage: pdfMocks.newPage, close: pdfMocks.browserClose };
  pdfMocks.newPage.mockResolvedValue(page);
  pdfMocks.launch.mockResolvedValue(browser);
  pdfMocks.setContent.mockResolvedValue(undefined);
  pdfMocks.addStyleTag.mockResolvedValue(undefined);
  pdfMocks.addScriptTag.mockResolvedValue(undefined);
  pdfMocks.pdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  pdfMocks.pageClose.mockResolvedValue(undefined);
  pdfMocks.browserClose.mockResolvedValue(undefined);
  pdfMocks.evaluate.mockImplementation(async (_fn: unknown, arg?: unknown) => {
    if (arg === undefined) return undefined;
    if (typeof arg === 'string') return true;
    return [
      { content: '<p>FIRST-W1-SENTINEL</p>', hardBreakBefore: false },
      { content: '<p>LAST-W1-SENTINEL</p>', hardBreakBefore: false },
    ];
  });
});

describe('A4 editor WORKFLOW W1 preview / HTML / PDF compatibility proofs', () => {
  it('W-OUTPUT-FIXTURE-00 defines the complete synthetic multi-page candidate and retains ordered sentinels in PDF HTML', () => {
    expect(representativeRichContent).toContain('<h1>');
    expect(representativeRichContent).toContain('<ol start="5">');
    expect(representativeRichContent).toContain('<ol><li>Nested resolution 5.1</li>');
    expect(representativeRichContent).toContain('<blockquote>');
    expect(representativeRichContent).toContain('<caption>Approval matrix</caption>');
    expect(representativeRichContent).toContain('<tfoot>');
    expect(representativeRichContent).toContain('data-field-reference="field-canonical-001"');
    expect(representativeRichContent).toContain(CANONICAL_BREAK);
    expect(representativeRichContent).toContain(LEGACY_BREAK);
    expect(representativeRichContent.match(/W0 pagination filler/g)).toHaveLength(120);

    const html = buildRepresentativePdfHtml(representativeRichContent);
    const firstIndex = html.indexOf(FIRST_SENTINEL);
    const lastIndex = html.indexOf(LAST_SENTINEL);
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(lastIndex).toBeGreaterThan(firstIndex);
  });

  it('W-OUTPUT-01 preserves representative canonical rich structure through the PDF HTML builder', () => {
    const html = buildRepresentativePdfHtml(representativeRichContent);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<caption>');
    expect(html).toContain('<tfoot>');
    expect(html).toContain('start="5"');
    expect(html).toContain('Synthetic field/reference: REF-W0-001');
  });

  it('W-OUTPUT-02 consumes the single F1 C06 sanitizer policy instead of a W-owned allowlist', () => {
    const policy = getA4SanitizerPolicy();
    for (const token of ['blockquote', 'caption', 'tfoot']) expect(policy.allowedTags).toContain(token);
    expect(policy.allowedAttributes).toContain('start');
    expect(policy.allowedAttributes).toContain('data-a4-break');
    expect(exportServiceSource).toContain('getA4SanitizerPolicy');
    expect(exportServiceSource).toContain('A4_EDITOR_DECORATION_ATTRIBUTES');
    expect(exportServiceSource).toContain('ALLOW_DATA_ATTR: false');
    expect(exportServiceSource).toContain('ALLOW_ARIA_ATTR: false');
    expect(exportServiceSource).toContain('serializeA4CanonicalBreakDocument');
    expect(exportServiceSource).toContain('readA4StoredDocument');
  });

  it('W-OUTPUT-03 retains the tall canonical source and fails closed before PDF creation when pagination fails', async () => {
    const longContent = Array.from(
      { length: 240 },
      (_, index) => `<p>Long pagination paragraph ${index + 1}</p>`,
    ).join('');
    const canonicalSource = `${longContent}<p>END-OF-DOCUMENT-SENTINEL</p>`;
    const prePaginationHtml = buildRepresentativePdfHtml(canonicalSource);
    let observedPaginationInput: string | null = null;

    expect(prePaginationHtml).toContain('Long pagination paragraph 1');
    expect(prePaginationHtml).toContain('Long pagination paragraph 240');
    expect(prePaginationHtml).toContain('END-OF-DOCUMENT-SENTINEL');

    pdfMocks.evaluate.mockImplementation(async (_fn: unknown, arg?: unknown) => {
      if (arg === undefined) return undefined;
      if (typeof arg === 'string') return true;
      if (arg && typeof arg === 'object' && 'canonicalHtml' in arg) {
        observedPaginationInput = (arg as { canonicalHtml: string }).canonicalHtml;
      }
      throw new Error('synthetic pagination failure');
    });

    await expect(generatePDF(prePaginationHtml, {
      format: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      headerHtml: '',
      footerHtml: '',
      pagination: {
        canonicalHtml: canonicalSource,
        layout: {
          contentWidthPx: 640,
          contentHeightPx: 900,
          fontFamily: 'Arial',
          fontSize: '12pt',
          lineHeight: '1.4',
          paragraphSpacing: '0.5em',
        },
      },
    })).rejects.toBeInstanceOf(ExportPaginationError);

    expect(observedPaginationInput).toBe(canonicalSource);
    expect(observedPaginationInput).toContain('END-OF-DOCUMENT-SENTINEL');
    expect(pdfMocks.pdf).not.toHaveBeenCalled();
    expect(pdfMocks.pageClose).toHaveBeenCalledOnce();
    expect(pdfMocks.browserClose).toHaveBeenCalledOnce();
    expect(canonicalSource).toContain('END-OF-DOCUMENT-SENTINEL');
  });

  it('W-OUTPUT-04 makes pagination failure explicit rather than warning and producing a clipped PDF', () => {
    expect(exportServiceSource).toContain('throw new ExportPaginationError');
    expect(exportServiceSource).toContain('Pagination returned no printable fragments');
    expect(exportServiceSource).not.toContain('falling back to natural page flow');
  });

  it('W-OUTPUT-05 makes the F1 canonical attribute policy authoritative', () => {
    const content = [
      '<blockquote><p>Quoted governance text</p></blockquote>',
      '<table><caption>Approval matrix</caption><tbody><tr><td>Body</td></tr></tbody><tfoot><tr><td>Footer</td></tr></tfoot></table>',
      '<ol start="5"><li>Fifth resolution</li></ol>',
      '<p><span data-field-reference="field-canonical-001">Synthetic field/reference: REF-W0-001</span></p>',
      '<p class="outer" style="text-align:right">',
      'Before',
      '<span class="manual-marker" style="break-before:page" data-source="fixture" data-whatever="nope" data-trusted="false" aria-label="client-authority" onclick="alert(1)" data-flow-id="canonical-must-strip" data-a4-break="page"></span>',
      'After</p>',
      LEGACY_BREAK,
    ].join('');
    const html = buildRepresentativePdfHtml(content);

    expect(html).toContain('<blockquote>');
    expect(html).toContain('<caption>Approval matrix</caption>');
    expect(html).toContain('<tfoot>');
    expect(html).toContain('start="5"');
    expect(html).toContain('data-a4-break="page"');
    expect(html).toContain('data-break-type="hard"');
    expect(html).toContain('class="manual-marker"');
    expect(html).toContain('class="outer"');
    expect(html).toContain('Synthetic field/reference: REF-W0-001');
    expect(html).not.toContain('data-source="fixture"');
    expect(html).not.toContain('data-whatever="nope"');
    expect(html).not.toContain('data-trusted="false"');
    expect(html).not.toContain('aria-label="client-authority"');
    expect(html).not.toContain('onclick=');
    expect(html).not.toContain('data-flow-id="canonical-must-strip"');
    expect(html).not.toContain('data-field-reference="field-canonical-001"');
  });

  it('W-OUTPUT-05P retains approved projection flow metadata only in projection output', () => {
    const projected = buildPaginatedSectionsHtml([
      {
        content: `<ol start="5"><li data-flow-continuation-item="true" data-flow-id="flow-1" data-source="fixture" data-whatever="nope" aria-label="client-authority" onclick="alert(1)"><p>Before${CANONICAL_BREAK}After</p></li></ol>${LEGACY_BREAK}`,
        hardBreakBefore: false,
      },
    ]);
    expect(projected).toContain('data-flow-continuation-item="true"');
    expect(projected).toContain('data-flow-id="flow-1"');
    expect(projected).toContain('data-a4-break="page"');
    expect(projected).toContain('data-break-type="hard"');
    expect(projected).toContain('start="5"');
    expect(projected).not.toContain('data-source="fixture"');
    expect(projected).not.toContain('data-whatever="nope"');
    expect(projected).not.toContain('aria-label="client-authority"');
    expect(projected).not.toContain('onclick=');

    const canonical = buildRepresentativePdfHtml(
      '<p data-flow-continuation-item="true" data-flow-id="flow-1">Canonical source</p>',
    );
    expect(canonical).not.toContain('data-flow-continuation-item="true"');
    expect(canonical).not.toContain('data-flow-id="flow-1"');
  });

  it('W-OUTPUT-FIXTURE-01 resolves a canonical nested partial path without flattening the C03 break', () => {
    const result = resolvePlaceholders(
      '<section>{{> outer}}</section>',
      { custom: {}, system: { currentDate: new Date('2026-09-11T00:00:00Z') } },
      {
        missingPlaceholder: 'keep',
        partialsMap: new Map([
          ['outer', `<div class="outer">Outer {{> inner}}</div>`],
          ['inner', `<ol start="5"><li><p>Before${CANONICAL_BREAK}After</p></li></ol>`],
        ]),
      },
    );
    expect(result.missingPartials).toEqual([]);
    expect(result.resolved).toContain(`<p>Before${CANONICAL_BREAK}After</p>`);
    expect(result.resolved).toContain('<ol start="5"><li>');
    expect(result.resolved).toContain('class="outer"');
  });

  it('W-OUTPUT-FIXTURE-02 makes missing partial observability explicit on the canonical resolver path', () => {
    const result = resolvePlaceholders('{{> missing-partial}}', { custom: {} }, { missingPlaceholder: 'highlight' });
    expect(result.missingPartials).toEqual(['missing-partial']);
    expect(result.resolved).toContain('placeholder-missing');
  });

  it('W-OUTPUT-SURVIVE-01 keeps continuation and oversized-page markers in the shared paginated output path', () => {
    const html = buildPaginatedSectionsHtml([
      { content: '<p>First page</p>', hardBreakBefore: false },
      {
        content: '<ol><li data-flow-continuation-item="true"><p>Continued item</p></li></ol>',
        hardBreakBefore: false,
        oversized: true,
      },
    ]);
    expect(html).toContain('data-flow-continuation-item="true"');
    expect(html).toContain('data-oversized="true"');
    expect(html.match(/<section class="print-page"/g)).toHaveLength(2);
  });
});