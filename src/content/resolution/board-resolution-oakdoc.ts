import { zipSync } from 'fflate';
import { encodeOakDocZipText } from '@/lib/document-editor/oakdoc-zip';
import { OAKDOC_RESOLUTION_ITEMS_TAG } from '@/lib/document-editor/oakdoc-field-registry';
import type { PlaceholderDefinition } from '@/lib/validations/document-template';

/**
 * Starter "Board Resolution" and "Members Resolution" masters for the
 * RESOLUTION template type, laid out like the firm's reference directors'
 * resolution (Cosec appointment, 9 Jul 2026): Times New Roman 11 pt, centred
 * company block, a ruled title, the numbered resolutions, then a signature
 * page with every selected director (or, for members, every shareholder).
 * The numbered resolutions are chosen per document on Configure.
 */

export const BOARD_RESOLUTION_TEMPLATE = {
  name: 'Board Resolution (Numbered)',
  description: 'Directors’ resolutions in writing. Pick saved partials or write custom resolutions on Configure; they are numbered in that order.',
  fileName: 'Board_Resolution_Numbered.docx',
  category: 'RESOLUTION' as const,
  compositionType: 'RESOLUTION' as const,
};

/** Starter members' (shareholders') written resolution, same numbered layout. */
export const MEMBERS_RESOLUTION_TEMPLATE = {
  name: 'Members Resolution (Numbered)',
  description: 'Members’ written resolutions under Section 184A of the Companies Act 1967, signed by every shareholder. Pick saved partials or write custom resolutions on Configure; they are numbered in that order.',
  fileName: 'Members_Resolution_Numbered.docx',
  category: 'RESOLUTION' as const,
  compositionType: 'RESOLUTION' as const,
};

export const BOARD_RESOLUTION_PLACEHOLDERS: PlaceholderDefinition[] = [
  {
    key: 'custom.resolution_date',
    path: 'custom.resolution_date',
    type: 'date',
    label: 'Resolution date',
    source: 'custom',
    category: 'custom',
    required: true,
  },
];

const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>';

interface RunFormat {
  bold?: boolean;
  italic?: boolean;
  caps?: boolean;
}

function xmlText(value: string): string {
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
    '</w:rPr>',
  ].join('');
}

function run(text: string, format: RunFormat = {}): string {
  return `<w:r>${runProperties(format)}<w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`;
}

interface ParagraphFormat {
  align?: 'left' | 'center' | 'both';
  after?: number;
  keepNext?: boolean;
  pageBreakBefore?: boolean;
  bottomBorder?: boolean;
}

function paragraphProperties(format: ParagraphFormat = {}): string {
  return [
    '<w:pPr>',
    format.keepNext ? '<w:keepNext/>' : '',
    format.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    format.bottomBorder ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="000000"/></w:pBdr>' : '',
    `<w:spacing w:before="0" w:after="${format.after ?? 200}" w:line="240" w:lineRule="auto"/>`,
    format.align && format.align !== 'left' ? `<w:jc w:val="${format.align}"/>` : '',
    `<w:rPr>${FONT}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`,
    '</w:pPr>',
  ].join('');
}

function paragraph(content: string, format: ParagraphFormat = {}): string {
  return `<w:p>${paragraphProperties(format)}${content}</w:p>`;
}

class ControlIds {
  private next = 9100;

  take(): number {
    const value = this.next;
    this.next += 1;
    return value;
  }
}

function field(ids: ControlIds, tag: string, alias: string, sample: string, format: RunFormat = {}, dateFormat?: string): string {
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

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>${FONT}<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-SG"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
</w:styles>`;

interface ResolutionVariant {
  title: string;
  intro: string;
  repeaterTag: string;
  repeaterAlias: string;
  signatory: (ids: ControlIds) => string[];
}

const DIRECTORS: ResolutionVariant = {
  title: 'DIRECTORS’ RESOLUTIONS IN WRITING PURSUANT TO ARTICLE 90 OF THE COMPANY’S ARTICLES OF ASSOCIATION',
  intro: 'We, the undersigned, being all the directors of the Company (“Directors”) for the time being entitled to make any decision that may be made in a meeting of the board of Directors, hereby unanimously consent to the adoption and approval of the following resolutions:',
  repeaterTag: 'repeat.directors',
  repeaterAlias: 'Directors',
  signatory: (ids) => [
    paragraph(field(ids, 'director.name', 'Director Name', 'DIRECTOR NAME', { caps: true }), { keepNext: true, after: 0 }),
    paragraph(field(ids, 'director.role', 'Director Role', 'Director'), { after: 240 }),
  ],
};

const MEMBERS: ResolutionVariant = {
  title: 'MEMBERS’ RESOLUTIONS IN WRITING PURSUANT TO SECTION 184A OF THE COMPANIES ACT 1967',
  intro: 'We, the undersigned, being all the members of the Company (“Members”) for the time being entitled to attend and vote at general meetings of the Company, hereby agree to the following resolutions being passed as written resolutions of the Company:',
  repeaterTag: 'repeat.shareholders',
  repeaterAlias: 'Shareholders',
  signatory: (ids) => [
    paragraph(field(ids, 'shareholder.name', 'Shareholder Name', 'SHAREHOLDER NAME', { caps: true }), { keepNext: true, after: 0 }),
    paragraph(run('Member'), { after: 240 }),
  ],
};

export function buildBoardResolutionOakDocMaster(): Uint8Array {
  return buildResolutionMaster(DIRECTORS);
}

export function buildMembersResolutionOakDocMaster(): Uint8Array {
  return buildResolutionMaster(MEMBERS);
}

function buildResolutionMaster(variant: ResolutionVariant): Uint8Array {
  const ids = new ControlIds();
  const center = { align: 'center' as const, after: 0 };
  const body = [
    paragraph(field(ids, 'company.name', 'Company Name', 'SAMPLE COMPANY PTE. LTD.', { bold: true, caps: true }), center),
    paragraph(`${run('(Registration Number ')}${field(ids, 'company.uen', 'Company UEN', '202600001A')}${run(')')}`, center),
    paragraph(run('(Incorporated in the Republic of Singapore)'), center),
    paragraph(run('(“Company”)', { bold: true }), { align: 'center', after: 360 }),
    paragraph(
      run(variant.title, { bold: true }),
      { bottomBorder: true, after: 240, keepNext: true },
    ),
    paragraph(
      run(variant.intro),
      { align: 'both' },
    ),
    [
      '<w:sdt><w:sdtPr>',
      `<w:alias w:val="Numbered resolutions"/><w:tag w:val="${OAKDOC_RESOLUTION_ITEMS_TAG}"/><w:id w:val="${ids.take()}"/>`,
      '<w:lock w:val="sdtLocked"/>',
      '</w:sdtPr><w:sdtContent>',
      paragraph(run('[Numbered resolutions: chosen when the document is generated]'), { align: 'both' }),
      '</w:sdtContent></w:sdt>',
    ].join(''),
    paragraph(''),
    paragraph(run('[Signature Page Follow]', { italic: true }), { align: 'center' }),
    paragraph(
      [
        run('Dated this '),
        field(ids, 'resolution.date', 'Resolution Day', '9', {}, 'd'),
        run(' day of '),
        field(ids, 'resolution.date', 'Resolution Month', 'July', {}, 'MMMM'),
        run(', '),
        field(ids, 'resolution.date', 'Resolution Year', '2026', {}, 'yyyy'),
      ].join(''),
      { align: 'center', pageBreakBefore: true, after: 480 },
    ),
    [
      '<w:sdt><w:sdtPr>',
      `<w:alias w:val="${variant.repeaterAlias}"/><w:tag w:val="${variant.repeaterTag}"/><w:id w:val="${ids.take()}"/><w15:repeatingSection/>`,
      '</w:sdtPr><w:sdtContent>',
      '<w:sdt><w:sdtPr>',
      `<w:id w:val="${ids.take()}"/><w15:repeatingSectionItem/>`,
      '</w:sdtPr><w:sdtContent>',
      paragraph('', { keepNext: true, after: 600 }),
      paragraph(run('___________________________'), { keepNext: true, after: 0 }),
      ...variant.signatory(ids),
      '</w:sdtContent></w:sdt>',
      '</w:sdtContent></w:sdt>',
    ].join(''),
  ].join('\n    ');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  mc:Ignorable="w15">
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
    'word/styles.xml': encodeOakDocZipText(STYLES),
  }, { level: 6 });
}
