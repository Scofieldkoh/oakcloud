import { zipSync } from 'fflate';
import { encodeOakDocZipText } from '@/lib/document-editor/oakdoc-zip';
import { OAKTREE_SERVICE_AGREEMENT_MASTER_HTML } from './oaktree-service-agreement-v1';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const W15_NS = 'http://schemas.microsoft.com/office/word/2012/wordml';

export const OAKTREE_SERVICE_AGREEMENT_OAKDOC = {
  name: 'Oaktree Master Services Agreement (OakDoc)',
  fileName: 'Oaktree Master Services Agreement - OakDoc.docx',
  description: 'DOCX-native Oaktree Master Services Agreement master for OakDoc.',
  category: 'CONTRACT' as const,
  compositionType: 'SERVICE_AGREEMENT' as const,
  isActive: false,
} as const;

export const SERVICE_AGREEMENT_OAKDOC_STRUCTURAL_TAGS = {
  serviceSections: 'agreement.serviceSections',
  feeTable: 'agreement.feeTable',
  entityAppendix: 'agreement.entityAppendix',
} as const;

export const SERVICE_AGREEMENT_OAKDOC_FIELD_TAGS = [
  'company.name',
  'company.address.letter',
  'selectedContact.name',
  'agreement.agreementDate',
  'agreement.effectiveDate',
  'agreement.termMonths',
] as const;

export const SERVICE_AGREEMENT_OAKDOC_EXPECTED_STAGE4_TAGS = [
  'repeat.signers',
  'repeat.authorisedRepresentatives',
  'oakdoc.signature.v1.provider',
  'oakdoc.signature.v1.client-acceptance',
  'oakdoc.signature.v1.authorised-representative-specimen',
  'oakdoc.signature.v1.sow-client',
] as const;


function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function plainText(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  ).trim();
}

let controlId = 5000;

function textRun(value: string, options: { bold?: boolean } = {}): string {
  if (!value) return '';
  const lines = value.split('\n');
  return lines.map((line, index) => [
    index > 0 ? '<w:br/>' : '',
    '<w:r>',
    options.bold ? '<w:rPr><w:b/></w:rPr>' : '',
    '<w:t xml:space="preserve">',
    xml(line),
    '</w:t>',
    '</w:r>',
  ].join('')).join('');
}

function sdtRun(tag: string, display: string): string {
  const id = controlId++;
  return [
    '<w:sdt>',
    '<w:sdtPr>',
    `<w:alias w:val="${xml(display)}"/>`,
    `<w:tag w:val="${xml(tag)}"/>`,
    `<w:id w:val="${id}"/>`,
    '</w:sdtPr>',
    '<w:sdtContent>',
    textRun(`{{${tag}}}`),
    '</w:sdtContent>',
    '</w:sdt>',
  ].join('');
}

function canonicalFieldTag(tag: string): string {
  if (tag === 'custom.agreementDate') return 'agreement.agreementDate';
  if (tag === 'custom.effectiveDate') return 'agreement.effectiveDate';
  if (tag === 'custom.termMonths') return 'agreement.termMonths';
  return tag;
}

function inlineRuns(value: string): string {
  const text = plainText(value);
  const pattern = /\{\{([a-zA-Z_][a-zA-Z0-9_.\[\]]*)\}\}|\[\[OAK:([a-zA-Z_][a-zA-Z0-9_.-]*)\]\]/g;
  let cursor = 0;
  let output = '';
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    output += textRun(text.slice(cursor, match.index));
    const tag = canonicalFieldTag(match[1] || match[2]);
    output += sdtRun(tag, tag);
    cursor = match.index + match[0].length;
  }
  output += textRun(text.slice(cursor));
  return output;
}

function paragraph(
  value: string,
  options: {
    style?: string;
    before?: number;
    after?: number;
    keepNext?: boolean;
    pageBreakBefore?: boolean;
    bold?: boolean;
    align?: 'left' | 'center';
  } = {},
): string {
  const props = [
    options.style ? `<w:pStyle w:val="${options.style}"/>` : '',
    options.before !== undefined || options.after !== undefined
      ? `<w:spacing w:before="${options.before ?? 0}" w:after="${options.after ?? 0}"/>`
      : '',
    options.keepNext ? '<w:keepNext/>' : '',
    options.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    options.align ? `<w:jc w:val="${options.align}"/>` : '',
  ].join('');
  const runs = options.bold ? textRun(plainText(value), { bold: true }) : inlineRuns(value);
  return `<w:p><w:pPr>${props}</w:pPr>${runs}</w:p>`;
}

function blockSdt(tag: string, label: string, placeholder: string): string {
  const id = controlId++;
  return [
    '<w:sdt>',
    '<w:sdtPr>',
    `<w:alias w:val="${xml(label)}"/>`,
    `<w:tag w:val="${xml(tag)}"/>`,
    `<w:id w:val="${id}"/>`,
    '</w:sdtPr>',
    '<w:sdtContent>',
    paragraph(placeholder, { after: 120 }),
    '</w:sdtContent>',
    '</w:sdt>',
  ].join('');
}

function signatureMarker(tag: string, label: string): string {
  return blockSdt(tag, label, '[Signature]');
}

function repeatingSection(
  tag: string,
  label: string,
  itemBody: string,
): string {
  const outerId = controlId++;
  const itemId = controlId++;
  return [
    '<w:sdt>',
    '<w:sdtPr>',
    `<w:alias w:val="${xml(label)}"/>`,
    `<w:tag w:val="${xml(tag)}"/>`,
    `<w:id w:val="${outerId}"/>`,
    '<w15:repeatingSection/>',
    '</w:sdtPr>',
    '<w:sdtContent>',
    '<w:sdt>',
    '<w:sdtPr>',
    `<w:id w:val="${itemId}"/>`,
    '<w15:repeatingSectionItem/>',
    '</w:sdtPr>',
    '<w:sdtContent>',
    itemBody,
    '</w:sdtContent>',
    '</w:sdt>',
    '</w:sdtContent>',
    '</w:sdt>',
  ].join('');
}

function tableCell(content: string, width: number, bold = false): string {
  return [
    '<w:tc>',
    `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>`,
    paragraph(content, { after: 0, bold }),
    '</w:tc>',
  ].join('');
}

function authorizedRepresentativeTable(): string {
  const header = [
    '<w:tr><w:trPr><w:tblHeader/></w:trPr>',
    tableCell('Name', 1800, true),
    tableCell('Position', 1600, true),
    tableCell('Email address / Mobile', 3200, true),
    tableCell('Signature(s)', 1800, true),
    '</w:tr>',
  ].join('');
  const row = [
    '<w:tr>',
    tableCell('{{authorisedRepresentative.name}}', 1800),
    tableCell('{{authorisedRepresentative.role}}', 1600),
    tableCell('{{authorisedRepresentative.email}} / {{authorisedRepresentative.phone}}', 3200),
    '<w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr>',
    signatureMarker('oakdoc.signature.v1.authorised-representative-specimen', 'Authorised representative specimen signature'),
    '</w:tc>',
    '</w:tr>',
  ].join('');
  return [
    '<w:tbl>',
    '<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/>',
    '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7C9C1"/><w:left w:val="single" w:sz="4" w:color="B7C9C1"/><w:bottom w:val="single" w:sz="4" w:color="B7C9C1"/><w:right w:val="single" w:sz="4" w:color="B7C9C1"/><w:insideH w:val="single" w:sz="4" w:color="D9E3DE"/><w:insideV w:val="single" w:sz="4" w:color="D9E3DE"/></w:tblBorders></w:tblPr>',
    '<w:tblGrid><w:gridCol w:w="1800"/><w:gridCol w:w="1600"/><w:gridCol w:w="3200"/><w:gridCol w:w="1800"/></w:tblGrid>',
    header,
    repeatingSection('repeat.authorisedRepresentatives', 'Authorised representatives', row),
    '</w:tbl>',
  ].join('');
}

function signerBlock(signatureTag: string): string {
  return repeatingSection(
    'repeat.signers',
    'Client signers',
    [
      signatureMarker(signatureTag, signatureTag === 'oakdoc.signature.v1.client-acceptance' ? 'Client acceptance signature' : 'Client SOW signature'),
      paragraph('{{signer.name}}', { after: 0 }),
      paragraph('{{signer.role}}', { after: 0 }),
      signatureTag === 'oakdoc.signature.v1.client-acceptance'
        ? paragraph('{{agreement.agreementDate}}', { after: 120 })
        : '',
    ].join(''),
  );
}

function normalizeSource(source: string): string {
  return source
    .replace(
      /<div data-flow-keep-together="true" data-template-each="signers"><p><span data-signature-placeholder="client-acceptance">\[Signature\]<\/span><br>\{\{this\.name\}\}<br>\{\{this\.role\}\}<br>\{\{custom\.agreementDate\}\}<\/p><\/div>/g,
      '<oak-signer-acceptance/>',
    )
    .replace(
      /<div data-flow-keep-together="true" data-template-each="signers"><p><span data-signature-placeholder="client-sow">\[Signature\]<\/span><br>\{\{this\.name\}\}<br>\{\{this\.role\}\}<\/p><\/div>/g,
      '<oak-signer-sow/>',
    )
    .replace(
      /<table data-authorised-representative="true">[\s\S]*?<\/table>/g,
      '<oak-authorized-representatives/>',
    )
    .replace(
      /<span data-signature-placeholder="oaktree-cover">\[Signature\]<\/span>/g,
      '[[OAK:oakdoc.signature.v1.provider]]',
    )
    .replace(
      /<span data-signature-placeholder="oaktree-sow">\[Signature\]<\/span>/g,
      '[[OAK:oakdoc.signature.v1.provider]]',
    );
}

function sourceToBody(source: string): string {
  const normalized = normalizeSource(source);
  const tokenPattern = /<div class="page-break"><\/div>|<oak-signer-acceptance\/>|<oak-signer-sow\/>|<oak-authorized-representatives\/>|\{\{@agreement\.(serviceSections|feeTable|entityAppendix)\}\}|<h1>[\s\S]*?<\/h1>|<h2>[\s\S]*?<\/h2>|<p>[\s\S]*?<\/p>|<ol[^>]*>[\s\S]*?<\/ol>/gi;
  const tokens = normalized.match(tokenPattern) ?? [];
  const body: string[] = [];

  for (const token of tokens) {
    if (token.startsWith('<div class="page-break"')) {
      body.push(paragraph('', { pageBreakBefore: true, after: 0 }));
      continue;
    }
    if (token === '<oak-signer-acceptance/>') {
      body.push(signerBlock('oakdoc.signature.v1.client-acceptance'));
      continue;
    }
    if (token === '<oak-signer-sow/>') {
      body.push(signerBlock('oakdoc.signature.v1.sow-client'));
      continue;
    }
    if (token === '<oak-authorized-representatives/>') {
      body.push(authorizedRepresentativeTable());
      continue;
    }
    if (token.includes('{{@agreement.serviceSections}}')) {
      body.push(blockSdt(SERVICE_AGREEMENT_OAKDOC_STRUCTURAL_TAGS.serviceSections, 'Service Agreement service sections', '[Service sections inserted during generation]'));
      continue;
    }
    if (token.includes('{{@agreement.feeTable}}')) {
      body.push(blockSdt(SERVICE_AGREEMENT_OAKDOC_STRUCTURAL_TAGS.feeTable, 'Service Agreement fee table', '[Fee table inserted during generation]'));
      continue;
    }
    if (token.includes('{{@agreement.entityAppendix}}')) {
      body.push(blockSdt(SERVICE_AGREEMENT_OAKDOC_STRUCTURAL_TAGS.entityAppendix, 'Service Agreement entity appendix', '[Entity appendix inserted during generation]'));
      continue;
    }
    if (/^<h1>/i.test(token)) {
      body.push(paragraph(token, { style: 'Heading1', keepNext: true, before: 280, after: 140 }));
      continue;
    }
    if (/^<h2>/i.test(token)) {
      body.push(paragraph(token, { style: 'Heading2', keepNext: true, before: 220, after: 100 }));
      continue;
    }
    if (/^<ol/i.test(token)) {
      const items = Array.from(token.matchAll(/<li>([\s\S]*?)<\/li>/gi));
      for (const [index, item] of items.entries()) {
        body.push([
          '<w:p><w:pPr><w:ind w:left="540" w:hanging="360"/><w:spacing w:after="80"/></w:pPr>',
          textRun(`${String.fromCharCode(97 + index)}) `),
          inlineRuns(item[1]),
          '</w:p>',
        ].join(''));
      }
      continue;
    }
    if (/^<p>/i.test(token)) {
      body.push(paragraph(token, { after: 120 }));
    }
  }

  return body.join('');
}

function documentXml(): string {
  controlId = 5000;
  const body = sourceToBody(OAKTREE_SERVICE_AGREEMENT_MASTER_HTML);
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}" xmlns:w15="${W15_NS}">`,
    '<w:body>',
    body,
    '<w:sectPr>',
    '<w:pgSz w:w="11906" w:h="16838"/>',
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="568" w:footer="568" w:gutter="0"/>',
    '<w:footerReference w:type="default" r:id="rIdFooter1"/>',
    '</w:sectPr>',
    '</w:body>',
    '</w:document>',
  ].join('');
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${WORD_NS}">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Aptos"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="27352F"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="120"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="280" w:after="140"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:color w:val="1F5C49"/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="355E50"/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`;

const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${WORD_NS}">
  <w:p><w:pPr><w:jc w:val="center"/></w:pPr>
    <w:r><w:rPr><w:color w:val="7A857F"/><w:sz w:val="16"/></w:rPr><w:t>Oaktree Accounting and Corporate Solutions Pte Ltd  |  Page </w:t></w:r>
    <w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:color w:val="7A857F"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>
  </w:p>
</w:ftr>`;

const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Oaktree Master Services Agreement</dc:title>
  <dc:creator>Oaktree Accounting and Corporate Solutions Pte Ltd</dc:creator>
  <dc:subject>OakDoc native Service Agreement master</dc:subject>
</cp:coreProperties>`;

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Oakcloud OakDoc</Application>
</Properties>`;

export function buildOaktreeServiceAgreementOakDoc(): Uint8Array {
  return zipSync({
    '[Content_Types].xml': encodeOakDocZipText(contentTypes),
    '_rels/.rels': encodeOakDocZipText(packageRels),
    'docProps/core.xml': encodeOakDocZipText(coreXml),
    'docProps/app.xml': encodeOakDocZipText(appXml),
    'word/document.xml': encodeOakDocZipText(documentXml()),
    'word/styles.xml': encodeOakDocZipText(stylesXml),
    'word/footer1.xml': encodeOakDocZipText(footerXml),
    'word/_rels/document.xml.rels': encodeOakDocZipText(documentRels),
  }, { level: 6 });
}
