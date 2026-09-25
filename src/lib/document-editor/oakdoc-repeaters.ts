import { strFromU8, unzipSync, zipSync } from 'fflate';
import { encodeOakDocZipText } from '@/lib/document-editor/oakdoc-zip';
import type { OakDocCompanyDetail, OakDocOfficer, OakDocShareholder } from '@/lib/document-editor/oakdoc-context';
import type { OakDocFieldDefinition } from '@/lib/document-editor/oakdoc-fields';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WORD14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';
const WORD15_NS = 'http://schemas.microsoft.com/office/word/2012/wordml';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const DOCUMENT_PART = 'word/document.xml';

export type OakDocRepeaterKind = 'directors' | 'shareholders';

export interface OakDocRepeaterDefinition {
  kind: OakDocRepeaterKind;
  tag: string;
  label: string;
  itemLabel: string;
  fields: ReadonlyArray<OakDocFieldDefinition & { example: string }>;
}

export interface OakDocRepeaterSummary {
  count: number;
  tags: string[];
}

export const OAKDOC_REPEATER_DEFINITIONS: readonly OakDocRepeaterDefinition[] = [
  {
    kind: 'directors',
    tag: 'repeat.directors',
    label: 'Directors',
    itemLabel: 'Director',
    fields: [
      { tag: 'director.name', label: 'Director Name', category: 'Repeating Director', example: 'John Tan Wei Ming' },
      { tag: 'director.role', label: 'Director Role', category: 'Repeating Director', example: 'DIRECTOR' },
      { tag: 'director.identificationNumber', label: 'Director Identification Number', category: 'Repeating Director', example: 'S1234567A' },
      { tag: 'director.nationality', label: 'Director Nationality', category: 'Repeating Director', example: 'Singaporean' },
      { tag: 'director.appointmentDate', label: 'Director Appointment Date', category: 'Repeating Director', example: '15 Jan 2023' },
      { tag: 'director.address', label: 'Director Address', category: 'Repeating Director', example: '123 Sample Street, Singapore 123456' },
    ],
  },
  {
    kind: 'shareholders',
    tag: 'repeat.shareholders',
    label: 'Shareholders',
    itemLabel: 'Shareholder',
    fields: [
      { tag: 'shareholder.name', label: 'Shareholder Name', category: 'Repeating Shareholder', example: 'Mary Lee Mei Ling' },
      { tag: 'shareholder.shareholderType', label: 'Shareholder Type', category: 'Repeating Shareholder', example: 'Individual' },
      { tag: 'shareholder.identificationNumber', label: 'Shareholder Identification Number', category: 'Repeating Shareholder', example: 'S7654321B' },
      { tag: 'shareholder.nationality', label: 'Shareholder Nationality', category: 'Repeating Shareholder', example: 'Singaporean' },
      { tag: 'shareholder.address', label: 'Shareholder Address', category: 'Repeating Shareholder', example: '456 Sample Road, Singapore 456789' },
      { tag: 'shareholder.shareClass', label: 'Share Class', category: 'Repeating Shareholder', example: 'Ordinary' },
      { tag: 'shareholder.numberOfShares', label: 'Number of Shares', category: 'Repeating Shareholder', example: '50,000' },
      { tag: 'shareholder.percentageHeld', label: 'Percentage Held', category: 'Repeating Shareholder', example: '50%' },
      { tag: 'shareholder.isNominee', label: 'Nominee Shareholder', category: 'Repeating Shareholder', example: 'No' },
    ],
  },
] as const;

export const OAKDOC_REPEATER_BY_TAG = new Map(
  OAKDOC_REPEATER_DEFINITIONS.map((definition) => [definition.tag, definition]),
);

export const OAKDOC_REPEATER_OUTER_TAGS = new Set(
  OAKDOC_REPEATER_DEFINITIONS.map((definition) => definition.tag),
);

export const OAKDOC_REPEATER_ITEM_TAGS = new Set(
  OAKDOC_REPEATER_DEFINITIONS.flatMap((definition) => definition.fields.map((field) => field.tag)),
);

function parseXml(bytes: Uint8Array): XMLDocument {
  const parser = new DOMParser();
  const xml = parser.parseFromString(strFromU8(bytes), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length > 0) {
    throw new Error('OakDoc could not parse WordprocessingML.');
  }
  return xml;
}

function serializeXml(xml: XMLDocument): Uint8Array {
  return encodeOakDocZipText(new XMLSerializer().serializeToString(xml));
}

function isWordElement(node: Node | null | undefined, localName: string): boolean {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const element = node as Element;
  return element.namespaceURI === WORD_NS && element.localName === localName;
}

function wordChildren(node: Node): Element[] {
  return Array.from(node.childNodes).filter(
    (child): child is Element => child.nodeType === Node.ELEMENT_NODE,
  );
}

function wordChild(node: Node, localName: string): Element | undefined {
  return wordChildren(node).find((child) => isWordElement(child, localName));
}

function getWordVal(element: Element | undefined): string {
  return element
    ? (element.getAttributeNS(WORD_NS, 'val') || element.getAttribute('w:val') || '')
    : '';
}

function setWordVal(element: Element, value: string): void {
  element.setAttributeNS(WORD_NS, 'w:val', value);
}

function setTextValue(textElement: Element, value: string): void {
  textElement.textContent = value;
  if (/^\s|\s$/.test(value)) {
    textElement.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  } else {
    textElement.removeAttributeNS(XML_NS, 'space');
  }
}

function contentControlProperties(sdt: Element): Element | undefined {
  return wordChild(sdt, 'sdtPr');
}

function contentControlTag(sdt: Element): string {
  const properties = contentControlProperties(sdt);
  if (!properties) return '';
  return getWordVal(wordChild(properties, 'tag'));
}

function hasW15Property(sdt: Element, localName: string): boolean {
  const properties = contentControlProperties(sdt);
  return Boolean(
    properties
    && Array.from(properties.childNodes).some(
      (child) => {
        if (child.nodeType !== Node.ELEMENT_NODE) return false;
        const element = child as Element;
        return element.namespaceURI === WORD15_NS && element.localName === localName;
      },
    ),
  );
}

function isRepeatingSection(sdt: Element): boolean {
  return hasW15Property(sdt, 'repeatingSection');
}

function isRepeatingSectionItem(sdt: Element): boolean {
  return hasW15Property(sdt, 'repeatingSectionItem');
}

function nextContentControlId(xml: XMLDocument): string {
  const used = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'id'))
    .map((element) => Number(getWordVal(element)))
    .filter((value) => Number.isInteger(value) && value > 0);
  const max = used.length > 0 ? Math.max(...used) : 1000;
  return String(max >= 2_000_000_000 ? 1001 : max + 1);
}

function createSdtProperties(
  xml: XMLDocument,
  input: {
    id: string;
    tag?: string;
    alias?: string;
    repeatingSection?: boolean;
    repeatingSectionItem?: boolean;
  },
): Element {
  const properties = xml.createElementNS(WORD_NS, 'w:sdtPr');

  if (input.alias) {
    const alias = xml.createElementNS(WORD_NS, 'w:alias');
    setWordVal(alias, input.alias);
    properties.appendChild(alias);
  }

  if (input.tag) {
    const tag = xml.createElementNS(WORD_NS, 'w:tag');
    setWordVal(tag, input.tag);
    properties.appendChild(tag);
  }

  const id = xml.createElementNS(WORD_NS, 'w:id');
  setWordVal(id, input.id);
  properties.appendChild(id);

  if (input.repeatingSection) {
    properties.appendChild(xml.createElementNS(WORD15_NS, 'w15:repeatingSection'));
  }
  if (input.repeatingSectionItem) {
    properties.appendChild(xml.createElementNS(WORD15_NS, 'w15:repeatingSectionItem'));
  }

  return properties;
}

function ensureW15Namespace(xml: XMLDocument): void {
  const root = xml.documentElement;
  if (!root.getAttributeNS(XMLNS_NS, 'w15')) {
    root.setAttributeNS(XMLNS_NS, 'xmlns:w15', WORD15_NS);
  }
  if (!root.getAttributeNS(XMLNS_NS, 'mc')) {
    root.setAttributeNS(XMLNS_NS, 'xmlns:mc', MC_NS);
  }

  const ignorable = (
    root.getAttributeNS(MC_NS, 'Ignorable')
    || root.getAttribute('mc:Ignorable')
    || ''
  ).split(/\s+/).filter(Boolean);
  if (!ignorable.includes('w15')) {
    ignorable.push('w15');
    root.setAttributeNS(MC_NS, 'mc:Ignorable', ignorable.join(' '));
  }
}

function paragraphId(paragraph: Element): string {
  return (
    paragraph.getAttributeNS(WORD14_NS, 'paraId')
    || paragraph.getAttribute('w14:paraId')
    || ''
  ).toUpperCase();
}

function findParagraph(xml: XMLDocument, paraId: string): Element | undefined {
  const expected = paraId.trim().toUpperCase();
  return Array.from(xml.getElementsByTagNameNS(WORD_NS, 'p'))
    .find((paragraph) => paragraphId(paragraph) === expected);
}

function closestWordElement(start: Element, localName: string): Element | undefined {
  let current: Element | null = start;
  while (current) {
    if (isWordElement(current, localName)) return current;
    current = current.parentElement;
  }
  return undefined;
}

function closestRepeatingSection(start: Element): Element | undefined {
  let current: Element | null = start.parentElement;
  while (current) {
    if (isWordElement(current, 'sdt') && isRepeatingSection(current)) return current;
    current = current.parentElement;
  }
  return undefined;
}

function repeatTarget(paragraph: Element): { node: Element; kind: 'table row' | 'paragraph' } {
  const row = closestWordElement(paragraph, 'tr');
  if (row) return { node: row, kind: 'table row' };
  return { node: paragraph, kind: 'paragraph' };
}

export function createOakDocRepeater(input: {
  docxBytes: Uint8Array;
  fromParaId: string;
  toParaId?: string;
  definition: OakDocRepeaterDefinition;
}): { bytes: Uint8Array; targetKind: 'table row' | 'paragraph' } {
  const files = unzipSync(input.docxBytes);
  const documentPart = files[DOCUMENT_PART];
  if (!documentPart) throw new Error('This DOCX has no word/document.xml part.');

  const xml = parseXml(documentPart);
  ensureW15Namespace(xml);

  const fromParagraph = findParagraph(xml, input.fromParaId);
  const toParagraph = findParagraph(xml, input.toParaId || input.fromParaId);
  if (!fromParagraph || !toParagraph) {
    throw new Error('OakDoc could not map the current selection back to a Word paragraph.');
  }

  if (closestRepeatingSection(fromParagraph) || closestRepeatingSection(toParagraph)) {
    throw new Error('The current row or paragraph is already inside a repeating section.');
  }

  const fromTarget = repeatTarget(fromParagraph);
  const toTarget = repeatTarget(toParagraph);
  if (fromTarget.node !== toTarget.node) {
    throw new Error(
      'Repeating sections currently support one table row or one paragraph at a time. '
      + 'Place the caret inside the row or paragraph you want to repeat.',
    );
  }

  const target = fromTarget.node;
  const parent = target.parentNode;
  if (!parent) throw new Error('OakDoc could not locate the selected Word structure.');

  let allocatedId = Number(nextContentControlId(xml));
  const allocateId = () => String(allocatedId++);

  const outer = xml.createElementNS(WORD_NS, 'w:sdt');
  outer.appendChild(createSdtProperties(xml, {
    id: allocateId(),
    tag: input.definition.tag,
    alias: input.definition.label + ' repeater',
    repeatingSection: true,
  }));
  const outerContent = xml.createElementNS(WORD_NS, 'w:sdtContent');
  outer.appendChild(outerContent);

  const item = xml.createElementNS(WORD_NS, 'w:sdt');
  item.appendChild(createSdtProperties(xml, {
    id: allocateId(),
    repeatingSectionItem: true,
  }));
  const itemContent = xml.createElementNS(WORD_NS, 'w:sdtContent');
  item.appendChild(itemContent);
  outerContent.appendChild(item);

  parent.insertBefore(outer, target);
  itemContent.appendChild(target);

  files[DOCUMENT_PART] = serializeXml(xml);
  return {
    bytes: zipSync(files, { level: 6 }),
    targetKind: fromTarget.kind,
  };
}

export function removeOakDocRepeater(input: {
  docxBytes: Uint8Array;
  paraId: string;
}): { bytes: Uint8Array; tag: string } {
  const files = unzipSync(input.docxBytes);
  const documentPart = files[DOCUMENT_PART];
  if (!documentPart) throw new Error('This DOCX has no word/document.xml part.');

  const xml = parseXml(documentPart);
  const paragraph = findParagraph(xml, input.paraId);
  if (!paragraph) {
    throw new Error('OakDoc could not map the current caret back to a Word paragraph.');
  }

  const repeater = closestRepeatingSection(paragraph);
  if (!repeater) {
    throw new Error('The caret is not inside an OakDoc repeating section.');
  }

  const tag = contentControlTag(repeater);
  if (!OAKDOC_REPEATER_OUTER_TAGS.has(tag)) {
    throw new Error('The current repeating section is not managed by OakDoc.');
  }

  const outerContent = wordChild(repeater, 'sdtContent');
  const item = outerContent
    ? wordChildren(outerContent)
      .find((child) => isWordElement(child, 'sdt') && isRepeatingSectionItem(child))
    : undefined;
  const itemContent = item ? wordChild(item, 'sdtContent') : undefined;
  const parent = repeater.parentNode;

  if (!itemContent || !parent) {
    throw new Error('The repeating section structure is incomplete and cannot be removed safely.');
  }

  while (itemContent.firstChild) {
    parent.insertBefore(itemContent.firstChild, repeater);
  }
  parent.removeChild(repeater);

  files[DOCUMENT_PART] = serializeXml(xml);
  return {
    bytes: zipSync(files, { level: 6 }),
    tag,
  };
}

function formatDate(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('en-SG') : String(value);
}

function formatPercentage(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value).trim();
  return text.endsWith('%') ? text : text + '%';
}

function directorValues(officer: OakDocOfficer): Record<string, string> {
  return {
    'director.name': officer.name || '',
    'director.role': officer.role || '',
    'director.identificationNumber': officer.identificationNumber || '',
    'director.nationality': officer.nationality || '',
    'director.appointmentDate': formatDate(officer.appointmentDate),
    'director.address': officer.address || '',
  };
}

function shareholderValues(shareholder: OakDocShareholder): Record<string, string> {
  return {
    'shareholder.name': shareholder.name || '',
    'shareholder.shareholderType': shareholder.shareholderType || '',
    'shareholder.identificationNumber': shareholder.identificationNumber || '',
    'shareholder.nationality': shareholder.nationality || '',
    'shareholder.address': shareholder.address || '',
    'shareholder.shareClass': shareholder.shareClass || '',
    'shareholder.numberOfShares': formatNumber(shareholder.numberOfShares),
    'shareholder.percentageHeld': formatPercentage(shareholder.percentageHeld),
    'shareholder.isNominee': shareholder.isNominee ? 'Yes' : 'No',
  };
}

function repeaterItems(
  definition: OakDocRepeaterDefinition,
  company: OakDocCompanyDetail,
): Array<Record<string, string>> {
  if (definition.kind === 'directors') {
    return (company.officers ?? [])
      .filter((officer) => (
        officer.isCurrent !== false
        && String(officer.role || '').toUpperCase().includes('DIRECTOR')
      ))
      .map(directorValues);
  }

  return (company.shareholders ?? [])
    .filter((shareholder) => shareholder.isCurrent !== false)
    .map(shareholderValues);
}

function unwrapContentControl(sdt: Element): void {
  const content = wordChild(sdt, 'sdtContent');
  const parent = sdt.parentNode;
  if (!content || !parent) return;

  while (content.firstChild) {
    parent.insertBefore(content.firstChild, sdt);
  }
  parent.removeChild(sdt);
}

function createHexIdAllocator(xml: XMLDocument, attributeLocalName: 'paraId' | 'textId') {
  const used = new Set(
    Array.from(xml.getElementsByTagNameNS(WORD_NS, 'p'))
      .map((paragraph) => (
        paragraph.getAttributeNS(WORD14_NS, attributeLocalName)
        || paragraph.getAttribute(`w14:${attributeLocalName}`)
        || ''
      ).toUpperCase())
      .filter((value) => /^[0-9A-F]{8}$/.test(value)),
  );
  let candidate = 0xA0000000;

  return () => {
    while (candidate <= 0xFFFFFFFF) {
      const value = candidate.toString(16).toUpperCase().padStart(8, '0');
      candidate += 1;
      if (!used.has(value)) {
        used.add(value);
        return value;
      }
    }
    throw new Error(`OakDoc could not allocate a unique Word ${attributeLocalName}.`);
  };
}

function reseedParagraphIds(
  root: Node,
  allocateParaId: () => string,
  allocateTextId: () => string,
): void {
  const paragraphs: Element[] = [];
  if (root.nodeType === Node.ELEMENT_NODE && isWordElement(root as Element, 'p')) {
    paragraphs.push(root as Element);
  }
  if ('getElementsByTagNameNS' in root) {
    paragraphs.push(
      ...Array.from((root as Element).getElementsByTagNameNS(WORD_NS, 'p')),
    );
  }

  for (const paragraph of paragraphs) {
    paragraph.setAttributeNS(WORD14_NS, 'w14:paraId', allocateParaId());
    if (
      paragraph.hasAttributeNS(WORD14_NS, 'textId')
      || paragraph.hasAttribute('w14:textId')
    ) {
      paragraph.setAttributeNS(WORD14_NS, 'w14:textId', allocateTextId());
    }
  }
}

function reseedContentControlIds(root: Node, allocateId: () => string): void {
  if (!('getElementsByTagNameNS' in root)) return;
  const controls = Array.from(
    (root as Element).getElementsByTagNameNS(WORD_NS, 'sdt'),
  );
  for (const sdt of controls) {
    const properties = contentControlProperties(sdt);
    const id = properties ? wordChild(properties, 'id') : undefined;
    if (id) setWordVal(id, allocateId());
  }
}

function resolveItemFields(root: Node, values: Readonly<Record<string, string>>): number {
  const controls: Element[] = [];
  if (root.nodeType === Node.ELEMENT_NODE && isWordElement(root as Element, 'sdt')) {
    controls.push(root as Element);
  }
  if ('getElementsByTagNameNS' in root) {
    controls.push(
      ...Array.from((root as Element).getElementsByTagNameNS(WORD_NS, 'sdt')),
    );
  }

  let updated = 0;
  for (const sdt of controls.reverse()) {
    const tag = contentControlTag(sdt);
    if (!Object.prototype.hasOwnProperty.call(values, tag)) continue;

    const content = wordChild(sdt, 'sdtContent');
    if (!content) continue;
    const textNodes = Array.from(content.getElementsByTagNameNS(WORD_NS, 't'));
    if (textNodes.length > 0) {
      setTextValue(textNodes[0], values[tag]);
      for (let index = 1; index < textNodes.length; index += 1) {
        setTextValue(textNodes[index], '');
      }
    }
    unwrapContentControl(sdt);
    updated += 1;
  }
  return updated;
}

export function inspectOakDocRepeaters(docxBytes: Uint8Array): OakDocRepeaterSummary {
  const files = unzipSync(docxBytes);
  const documentPart = files[DOCUMENT_PART];
  if (!documentPart) return { count: 0, tags: [] };

  const xml = parseXml(documentPart);
  const tags: string[] = [];

  for (const sdt of Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))) {
    const tag = contentControlTag(sdt);
    if (OAKDOC_REPEATER_OUTER_TAGS.has(tag) && isRepeatingSection(sdt)) {
      tags.push(tag);
    }
  }

  return {
    count: tags.length,
    tags: Array.from(new Set(tags)).sort(),
  };
}

export function resolveOakDocRepeaters(input: {
  docxBytes: Uint8Array;
  company: OakDocCompanyDetail;
}): { bytes: Uint8Array; repeatersResolved: number; itemsCreated: number; fieldsResolved: number } {
  const files = unzipSync(input.docxBytes);
  const documentPart = files[DOCUMENT_PART];
  if (!documentPart) {
    return {
      bytes: input.docxBytes,
      repeatersResolved: 0,
      itemsCreated: 0,
      fieldsResolved: 0,
    };
  }

  const xml = parseXml(documentPart);
  let repeatersResolved = 0;
  let itemsCreated = 0;
  let fieldsResolved = 0;
  let changed = false;

  let allocatedId = Number(nextContentControlId(xml));
  const allocateId = () => String(allocatedId++);
  const allocateParaId = createHexIdAllocator(xml, 'paraId');
  const allocateTextId = createHexIdAllocator(xml, 'textId');

  const repeaters = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))
    .filter((sdt) => (
      OAKDOC_REPEATER_OUTER_TAGS.has(contentControlTag(sdt))
      && isRepeatingSection(sdt)
    ));

  for (const repeater of repeaters) {
    const definition = OAKDOC_REPEATER_BY_TAG.get(contentControlTag(repeater));
    const outerContent = wordChild(repeater, 'sdtContent');
    const parent = repeater.parentNode;
    if (!definition || !outerContent || !parent) continue;

    const item = wordChildren(outerContent)
      .find((child) => isWordElement(child, 'sdt') && isRepeatingSectionItem(child));
    const itemContent = item ? wordChild(item, 'sdtContent') : undefined;
    if (!itemContent) continue;

    const items = repeaterItems(definition, input.company);
    for (const values of items) {
      for (const templateNode of Array.from(itemContent.childNodes)) {
        const clone = templateNode.cloneNode(true);
        reseedParagraphIds(clone, allocateParaId, allocateTextId);
        reseedContentControlIds(clone, allocateId);
        fieldsResolved += resolveItemFields(clone, values);
        parent.insertBefore(clone, repeater);
      }
      itemsCreated += 1;
    }

    parent.removeChild(repeater);
    repeatersResolved += 1;
    changed = true;
  }

  if (changed) files[DOCUMENT_PART] = serializeXml(xml);
  return {
    bytes: changed ? zipSync(files, { level: 6 }) : input.docxBytes,
    repeatersResolved,
    itemsCreated,
    fieldsResolved,
  };
}
