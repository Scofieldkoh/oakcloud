import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPDFHtml,
  buildPaginatedSectionsHtml,
} from '@/services/document-export.service';

const readRepoFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8');

const exportServiceSource = readRepoFile(
  'src/services/document-export.service.ts',
);

const representativeRichContent = `
  <blockquote><p>Quoted governance text</p></blockquote>
  <table>
    <caption>Approval matrix</caption>
    <thead><tr><th>Role</th><th>Decision</th></tr></thead>
    <tbody><tr><td>Board</td><td>Approve</td></tr></tbody>
    <tfoot><tr><td colspan="2">End of matrix</td></tr></tfoot>
  </table>
  <ol start="4"><li>Fourth resolution</li><li>Fifth resolution</li></ol>
`.trim();

const buildRepresentativePdfHtml = (content: string) =>
  buildPDFHtml(
    {
      title: 'WORKFLOW W0 output fixture',
      status: 'FINALIZED',
      content,
      contentJson: undefined,
    },
    null,
    { top: 20, right: 20, bottom: 20, left: 20 },
  );

describe('A4 editor WORKFLOW W0 preview / HTML / PDF compatibility proofs', () => {
  it.fails(
    'W-OUTPUT-01 preserves representative rich structure through the actual PDF HTML builder',
    () => {
      const html = buildRepresentativePdfHtml(representativeRichContent);

      expect(html).toContain('<blockquote>');
      expect(html).toContain('<caption>');
      expect(html).toContain('<tfoot>');
      expect(html).toContain('start="4"');
    },
  );

  it.fails(
    'W-OUTPUT-02 keeps the HTML-export sanitizer contract aligned with the PDF/editor rich-structure contract',
    () => {
      const htmlExportStart = exportServiceSource.indexOf(
        'export async function exportToHTML',
      );
      if (htmlExportStart < 0) {
        throw new Error('Unable to locate exportToHTML');
      }
      const htmlExportSource = exportServiceSource.slice(htmlExportStart);

      expect(htmlExportSource).toContain("'blockquote'");
      expect(htmlExportSource).toContain("'caption'");
      expect(htmlExportSource).toContain("'tfoot'");
      expect(htmlExportSource).toContain("'start'");
    },
  );

  it.fails(
    'W-OUTPUT-03 does not leave fixed-height hidden overflow active when PDF pagination falls back',
    () => {
      const longContent = Array.from(
        { length: 240 },
        (_, index) => `<p>Long fallback paragraph ${index + 1}</p>`,
      ).join('');
      const html = buildRepresentativePdfHtml(
        `${longContent}<p>END-OF-DOCUMENT-SENTINEL</p>`,
      );

      expect(html).toContain('END-OF-DOCUMENT-SENTINEL');
      expect(html).not.toContain('overflow: hidden;');
    },
  );

  it.fails(
    'W-OUTPUT-04 makes pagination failure explicit instead of logging and continuing as a successful PDF',
    () => {
      expect(exportServiceSource).not.toContain(
        "console.warn('A4 pagination in export failed; falling back to natural page flow'",
      );
    },
  );

  it(
    'W-OUTPUT-SURVIVE-01 keeps continuation and oversized-page markers in the shared paginated output path',
    () => {
      const html = buildPaginatedSectionsHtml([
        { content: '<p>First page</p>', hardBreakBefore: false },
        {
          content:
            '<ol><li data-flow-continuation-item="true"><p>Continued item</p></li></ol>',
          hardBreakBefore: false,
          oversized: true,
        },
      ]);

      expect(html).toContain('data-flow-continuation-item="true"');
      expect(html).toContain('data-oversized="true"');
      expect(html.match(/<section class="print-page"/g)).toHaveLength(2);
    },
  );
});
