import {
  normalizeA4DocumentLayout,
  type A4DocumentLayout,
} from '@/components/documents/a4-pagination/layout';

/**
 * Shared A4 print stylesheet. Client editor, HTML export, PDF export, and
 * preview all consume this one function so typography, spacing, margins, and
 * line-break semantics cannot drift between the edit and print paths.
 */
export function buildA4PrintCss(layout: A4DocumentLayout): string {
  const normalized = normalizeA4DocumentLayout(layout);
  const { top, right, bottom, left } = normalized.marginsMm;
  const contentHeight = `calc(297mm - ${top}mm - ${bottom}mm)`;

  return `
    @page {
      size: 210mm 297mm;
      margin: ${top}mm ${right}mm ${bottom}mm ${left}mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      font-family: ${normalized.fontFamily};
      font-size: ${normalized.fontSize};
      line-height: ${normalized.lineHeight};
      color: #000;
    }
    .document-content,
    .print-page .content {
      width: 100%;
      white-space: pre-wrap;
      overflow-wrap: break-word;
      word-break: break-word;
      min-height: ${contentHeight};
    }
    p { margin: 0 0 ${normalized.paragraphSpacing} 0; }
    p, div, span, li, blockquote, th, td {
      line-height: inherit;
    }
    h1, h2, h3 {
      font-family: inherit;
      font-weight: 700;
      line-height: inherit;
      margin: 0 0 ${normalized.paragraphSpacing} 0;
    }
    h1 { font-size: 24pt; }
    h2 { font-size: 18pt; }
    h3 { font-size: 14pt; }
    br { margin: 0; }
    ul, ol { margin: 0 0 ${normalized.paragraphSpacing} 0; padding-left: 0; }
    ul { list-style: none; }
    ol {
      list-style: none;
      counter-reset: item var(--list-start, 0);
    }
    ul > li, ol > li {
      position: relative;
      margin: 0 0 0.25em 0;
    }
    ul > li { padding-left: 2ch; }
    ol > li { padding-left: 5ch; }
    ol ol > li { padding-left: 6ch; }
    ol ol ol > li { padding-left: 8ch; }
    ul > li::before {
      content: "•";
      position: absolute;
      left: 0;
      top: 0;
    }
    ol > li { counter-increment: item; }
    ol > li::before {
      content: counter(item) ". ";
      position: absolute;
      left: 0;
      top: 0;
    }
    ol.list-bold-numbers > li::before { font-weight: 700; }
    ol.list-alpha > li::before { content: counter(item, lower-alpha) ") "; }
    ol[style*="--flow-list-start"] {
      counter-reset: item var(--flow-list-start, 0);
    }
    ol > li[data-flow-continuation-item] { counter-increment: none; }
    ol > li[data-flow-continuation-item]::before { content: none; }
    ul > li[data-flow-continuation-item]::before { content: none; }
    ol ol, ol ul, ul ol, ul ul { padding-left: 0; }
    ol ol { counter-reset: item; }
    ol ol > li::before { content: counters(item, ".") " "; }
    li { display: list-item; margin: 0 0 0.25em 0; }
    blockquote { margin: 0 0 ${normalized.paragraphSpacing} 40px; padding: 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 0 0 ${normalized.paragraphSpacing} 0;
    }
    th, td {
      border: 1px solid #9ca3af;
      padding: 6px 8px;
      vertical-align: top;
      min-height: 1.5em;
      word-break: break-word;
    }
    th {
      background: #f3f4f6;
      font-weight: 700;
    }
    a {
      color: #1155cc;
      text-decoration: underline;
    }
    .print-page {
      position: relative;
      min-height: ${contentHeight};
      page-break-after: always;
      break-after: page;
    }
    .print-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .print-page-number {
      position: absolute;
      left: 0;
      right: 0;
      bottom: calc(-1 * ${bottom}mm / 2);
      text-align: center;
      font-family: 'Times New Roman', Times, serif;
      font-size: 10pt;
      color: #555;
    }
    .page-break {
      display: block;
      page-break-before: always !important;
      break-before: page !important;
      page-break-after: auto;
      break-after: auto;
      page-break-inside: avoid;
      break-inside: avoid;
      height: 0;
      margin: 0;
      padding: 0;
      border: none;
      clear: both;
    }
    @media print {
      html, body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  `.trim();
}
