import { zipSync } from 'fflate';
import { encodeOakDocZipText } from '@/lib/document-editor/oakdoc-zip';
import { OAKDOC_RESOLUTION_ITEMS_TAG } from '@/lib/document-editor/oakdoc-field-registry';

/**
 * WordprocessingML helpers for the seeded resolution masters and partials:
 * Times New Roman 11 pt runs and paragraphs, field controls, and a minimal
 * DOCX package around a body.
 */

export const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>';

export interface RunFormat {
  bold?: boolean;
  italic?: boolean;
  caps?: boolean;
  underline?: boolean;
}

export function xmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function runProperties(format: RunFormat = {}): string {
  return [
    '<w:rPr>',
    FONT,
    format.bold ? '<w:b/><w:bCs/>' : '',
    format.italic ? '<w:i/><w:iCs/>' : '',
    format.caps ? '<w:caps/>' : '',
    '<w:sz w:val="22"/><w:szCs w:val="22"/>',
    format.underline ? '<w:u w:val="single"/>' : '',
    '</w:rPr>',
  ].join('');
}

export function run(text: string, format: RunFormat = {}): string {
  return `<w:r>${runProperties(format)}<w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`;
}

/** A run holding a tab, for "a)<tab>text" list items. */
export function tabRun(): string {
  return `<w:r>${runProperties()}<w:tab/></w:r>`;
}

export interface ParagraphFormat {
  align?: 'left' | 'center' | 'both';
  after?: number;
  keepNext?: boolean;
  pageBreakBefore?: boolean;
  bottomBorder?: boolean;
  /** Left indent and hanging first line, in twips, for list items. */
  indent?: { left: number; hanging?: number };
  /** w14:paraId, so an editor action (a condition) can find the paragraph. */
  paraId?: string;
}

function paragraphProperties(format: ParagraphFormat = {}): string {
  return [
    '<w:pPr>',
    format.keepNext ? '<w:keepNext/>' : '',
    format.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    format.bottomBorder ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="000000"/></w:pBdr>' : '',
    format.indent?.hanging ? `<w:tabs><w:tab w:val="left" w:pos="${format.indent.left}"/></w:tabs>` : '',
    `<w:spacing w:before="0" w:after="${format.after ?? 200}" w:line="240" w:lineRule="auto"/>`,
    format.indent
      ? `<w:ind w:left="${format.indent.left}"${format.indent.hanging ? ` w:hanging="${format.indent.hanging}"` : ''}/>`
      : '',
    format.align && format.align !== 'left' ? `<w:jc w:val="${format.align}"/>` : '',
    `<w:rPr>${FONT}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`,
    '</w:pPr>',
  ].join('');
}

export function paragraph(content: string, format: ParagraphFormat = {}): string {
  const id = format.paraId ? ` w14:paraId="${format.paraId}"` : '';
  return `<w:p${id}>${paragraphProperties(format)}${content}</w:p>`;
}

export class ControlIds {
  private next: number;

  constructor(start = 9100) {
    this.next = start;
  }

  take(): number {
    const value = this.next;
    this.next += 1;
    return value;
  }
}

export function field(ids: ControlIds, tag: string, alias: string, sample: string, format: RunFormat = {}, dateFormat?: string): string {
  return [
    '<w:sdt><w:sdtPr>',
    `<w:alias w:val="${xmlText(alias)}"/><w:tag w:val="${xmlText(tag)}"/><w:id w:val="${ids.take()}"/>`,
    dateFormat
      ? `<w:date><w:dateFormat w:val="${dateFormat}"/><w:lid w:val="en-SG"/><w:storeMappedDataAs w:val="dateTime"/><w:calendar w:val="gregorian"/></w:date>`
      : '<w:text/>',
    '</w:sdtPr><w:sdtContent>',
    run(sample, format),
    '</w:sdtContent></w:sdt>',
  ].join('');
}

/** A Word repeating section with one item holding `content`. */
export function repeatingSection(ids: ControlIds, tag: string, alias: string, content: string): string {
  return [
    '<w:sdt><w:sdtPr>',
    `<w:alias w:val="${xmlText(alias)}"/><w:tag w:val="${xmlText(tag)}"/><w:id w:val="${ids.take()}"/><w15:repeatingSection/>`,
    '</w:sdtPr><w:sdtContent>',
    '<w:sdt><w:sdtPr>',
    `<w:id w:val="${ids.take()}"/><w15:repeatingSectionItem/>`,
    '</w:sdtPr><w:sdtContent>',
    content,
    '</w:sdtContent></w:sdt>',
    '</w:sdtContent></w:sdt>',
  ].join('');
}

/** The locked block the numbered resolutions replace at generation. */
export function resolutionSlot(ids: ControlIds): string {
  return [
    '<w:sdt><w:sdtPr>',
    `<w:alias w:val="Numbered resolutions"/><w:tag w:val="${OAKDOC_RESOLUTION_ITEMS_TAG}"/><w:id w:val="${ids.take()}"/>`,
    '<w:lock w:val="sdtLocked"/>',
    '</w:sdtPr><w:sdtContent>',
    paragraph(run('[Numbered resolutions: chosen when the document is generated]'), { align: 'both' }),
    '</w:sdtContent></w:sdt>',
  ].join('');
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

function stylesXml(extraStyles: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>${FONT}<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-SG"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${extraStyles}
</w:styles>`;
}

/** An A4 DOCX with 1-inch margins around `body` (joined block XML). */
export function packageOakDoc(body: string, options: { extraStyles?: string } = {}): Uint8Array {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  mc:Ignorable="w14 w15">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  return zipSync({
    '[Content_Types].xml': encodeOakDocZipText(CONTENT_TYPES),
    '_rels/.rels': encodeOakDocZipText(ROOT_RELS),
    'word/document.xml': encodeOakDocZipText(documentXml),
    'word/_rels/document.xml.rels': encodeOakDocZipText(DOCUMENT_RELS),
    'word/styles.xml': encodeOakDocZipText(stylesXml(options.extraStyles ?? '')),
  }, { level: 6 });
}
