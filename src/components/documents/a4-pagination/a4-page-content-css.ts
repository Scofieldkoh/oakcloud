/**
 * Shared stylesheet for `.a4-page-content` — used by the editor's page
 * chrome and by the standalone pagination measurer so both measure with
 * identical typography, list, and table metrics.
 */
export function buildA4PageContentStyles(paragraphSpacing: string): string {
  return `
    .a4-page-content p {
      margin: 0 0 ${paragraphSpacing} 0;
    }
    .a4-page-content p,
    .a4-page-content div,
    .a4-page-content span,
    .a4-page-content li,
    .a4-page-content blockquote,
    .a4-page-content th,
    .a4-page-content td {
      line-height: inherit;
    }
    .a4-page-content h1,
    .a4-page-content h2,
    .a4-page-content h3 {
      font-family: inherit;
      font-weight: 700;
      line-height: inherit;
      margin: 0 0 ${paragraphSpacing} 0;
    }
    .a4-page-content h1 {
      font-size: 24pt;
    }
    .a4-page-content h2 {
      font-size: 18pt;
    }
    .a4-page-content h3 {
      font-size: 14pt;
    }
    .a4-page-content ul {
      list-style: none;
      margin: 0 0 ${paragraphSpacing} 0;
      padding-left: 0;
    }
    .a4-page-content ol {
      list-style: none;
      margin: 0 0 ${paragraphSpacing} 0;
      padding-left: 0;
      counter-reset: item var(--list-start, 0);
    }
    .a4-page-content ul > li,
    .a4-page-content ol > li {
      position: relative;
      margin: 0 0 0.25em 0;
    }
    .a4-page-content ul > li {
      padding-left: 2ch;
    }
    .a4-page-content ol > li {
      padding-left: 5ch;
    }
    .a4-page-content ol ol > li {
      padding-left: 6ch;
    }
    .a4-page-content ol ol ol > li {
      padding-left: 8ch;
    }
    .a4-page-content ul > li::before {
      content: "•";
      position: absolute;
      left: 0;
      top: 0;
    }
    .a4-page-content ol > li {
      counter-increment: item;
    }
    .a4-page-content ol > li::before {
      content: counter(item) ". ";
      position: absolute;
      left: 0;
      top: 0;
    }
    .a4-page-content ol.list-bold-numbers > li::before {
      font-weight: 700;
    }
    .a4-page-content ol.list-alpha > li::before {
      content: counter(item, lower-alpha) ") ";
    }
    .a4-page-content ol[style*="--flow-list-start"] {
      counter-reset: item var(--flow-list-start, 0);
    }
    .a4-page-content ol > li[data-flow-continuation-item] {
      counter-increment: none;
    }
    .a4-page-content ol > li[data-flow-continuation-item]::before {
      content: none;
    }
    .a4-page-content ul > li[data-flow-continuation-item]::before {
      content: none;
    }
    .a4-page-content ol ol,
    .a4-page-content ol ul,
    .a4-page-content ul ol,
    .a4-page-content ul ul {
      padding-left: 0;
    }
    .a4-page-content ol ol {
      counter-reset: item;
    }
    .a4-page-content ol ol > li::before {
      content: counters(item, ".") " ";
    }
    .a4-page-content li {
      display: list-item;
      margin: 0 0 0.25em 0;
    }
    .a4-page-content blockquote {
      margin: 0 0 ${paragraphSpacing} 40px;
      padding: 0;
    }
    .a4-page-content table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 0 0 ${paragraphSpacing} 0;
    }
    .a4-page-content th,
    .a4-page-content td {
      border: 1px solid #9ca3af;
      padding: 6px 8px;
      vertical-align: top;
      min-height: 1.5em;
      word-break: break-word;
    }
    .a4-page-content th {
      background: #f3f4f6;
      font-weight: 700;
    }
    .a4-page-content a {
      color: #1155cc;
      text-decoration: underline;
    }
  `;
}
