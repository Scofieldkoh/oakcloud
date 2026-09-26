import { strFromU8, unzipSync, zipSync } from 'fflate';
import { encodeOakDocZipText } from '@/lib/document-editor/oakdoc-zip';
import {
  WORD14_NS,
  WORD_NS,
  findParagraphById,
  getWordVal,
  isWordElement,
  resolveOakDocBlockRange,
  setWordVal,
  wordChild,
  wordChildren,
  type OakDocBlockRangeKind,
} from '@/lib/document-editor/oakdoc-blocks';
import {
  OAKDOC_GENERIC_REPEATER_BY_TAG,
  OAKDOC_GENERIC_REPEATER_TAGS,
  type OakDocGenericRepeaterDefinition,
  type OakDocRepeaterGenerationData,
} from '@/lib/document-editor/oakdoc-repeater-definitions';

const WORD15_NS = 'http://schemas.microsoft.com/office/word/2012/wordml';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const DOCUMENT_PART = 'word/document.xml';

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

function setTextValue(textElement: Element, value: string): void {
  textElement.textContent = value;
  if (/^\s|\s$/.test(value)) {
    textElement.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  } else {
    textElement.removeAttributeNS(XML_NS, 'space');
  }
}

function properties(sdt: Element): Element | undefined {
  return wordChild(sdt, 'sdtPr');
}

function controlTag(sdt: Element): string {
  const pr = properties(sdt);
  return pr ? getWordVal(wordChild(pr, 'tag')) : '';
}

function hasW15(sdt: Element, localName: string): boolean {
  const pr = properties(sdt);
  return Boolean(pr && Array.from(pr.childNodes).some((child) => {
    if (child.nodeType !== Node.ELEMENT_NODE) return false;
    const el = child as Element;
    return el.namespaceURI === WORD15_NS && el.localName === localName;
  }));
}

function isRepeatingSection(sdt: Element): boolean {
  return hasW15(sdt, 'repeatingSection');
}

function isRepeatingItem(sdt: Element): boolean {
  return hasW15(sdt, 'repeatingSectionItem');
}

function ensureNamespaces(xml: XMLDocument): void {
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

function nextControlId(xml: XMLDocument): string {
  const used = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'id'))
    .map((element) => Number(getWordVal(element)))
    .filter((value) => Number.isInteger(value) && value > 0);
  return String((used.length ? Math.max(...used) : 1000) + 1);
}

function createProperties(
  xml: XMLDocument,
  id: string,
  options: {
    tag?: string;
    alias?: string;
    repeatingSection?: boolean;
    repeatingItem?: boolean;
  },
): Element {
  const pr = xml.createElementNS(WORD_NS, 'w:sdtPr');
  if (options.alias) {
    const alias = xml.createElementNS(WORD_NS, 'w:alias');
    setWordVal(alias, options.alias);
    pr.appendChild(alias);
  }
  if (options.tag) {
    const tag = xml.createElementNS(WORD_NS, 'w:tag');
    setWordVal(tag, options.tag);
    pr.appendChild(tag);
  }
  const idEl = xml.createElementNS(WORD_NS, 'w:id');
  setWordVal(idEl, id);
  pr.appendChild(idEl);
  if (options.repeatingSection) {
    pr.appendChild(xml.createElementNS(WORD15_NS, 'w15:repeatingSection'));
  }
  if (options.repeatingItem) {
    pr.appendChild(xml.createElementNS(WORD15_NS, 'w15:repeatingSectionItem'));
  }
  return pr;
}

function closestRepeater(start: Element): Element | undefined {
  let current: Element | null = start.parentElement;
  while (current) {
    if (
      current.namespaceURI === WORD_NS
      && current.localName === 'sdt'
      && isRepeatingSection(current)
    ) return current;
    current = current.parentElement;
  }
  return undefined;
}

export function createOakDocGenericRepeater(input: {
  docxBytes: Uint8Array;
  fromParaId: string;
  toParaId?: string;
  definition: OakDocGenericRepeaterDefinition;
}): { bytes: Uint8Array; targetKind: OakDocBlockRangeKind } {
  const managed = OAKDOC_GENERIC_REPEATER_BY_TAG.get(input.definition.tag);
  if (!managed || managed.kind !== input.definition.kind) {
    throw new Error('This repeating section definition is not managed by OakDoc.');
  }

  const files = unzipSync(input.docxBytes);
  const part = files[DOCUMENT_PART];
  if (!part) throw new Error('This DOCX has no word/document.xml part.');

  const xml = parseXml(part);
  ensureNamespaces(xml);
  const from = findParagraphById(xml, input.fromParaId);
  const to = findParagraphById(xml, input.toParaId || input.fromParaId);
  if (!from || !to) {
    throw new Error('OakDoc could not map the current selection back to a Word paragraph.');
  }
  if (closestRepeater(from) || closestRepeater(to)) {
    throw new Error('The current selection is already inside a repeating section.');
  }

  const range = resolveOakDocBlockRange(from, to);
  let id = Number(nextControlId(xml));
  const outer = xml.createElementNS(WORD_NS, 'w:sdt');
  outer.appendChild(createProperties(xml, String(id++), {
    tag: managed.tag,
    alias: managed.label + ' repeater',
    repeatingSection: true,
  }));
  const outerContent = xml.createElementNS(WORD_NS, 'w:sdtContent');
  outer.appendChild(outerContent);

  const item = xml.createElementNS(WORD_NS, 'w:sdt');
  item.appendChild(createProperties(xml, String(id++), { repeatingItem: true }));
  const itemContent = xml.createElementNS(WORD_NS, 'w:sdtContent');
  item.appendChild(itemContent);
  outerContent.appendChild(item);

  range.parent.insertBefore(outer, range.nodes[0]);
  for (const node of range.nodes) itemContent.appendChild(node);

  files[DOCUMENT_PART] = serializeXml(xml);
  return { bytes: zipSync(files, { level: 6 }), targetKind: range.kind };
}

function unwrap(sdt: Element): void {
  const content = wordChild(sdt, 'sdtContent');
  const parent = sdt.parentNode;
  if (!content || !parent) return;
  while (content.firstChild) parent.insertBefore(content.firstChild, sdt);
  parent.removeChild(sdt);
}

function createHexAllocator(xml: XMLDocument, attr: 'paraId' | 'textId') {
  const used = new Set(
    Array.from(xml.getElementsByTagNameNS(WORD_NS, 'p'))
      .map((p) => p.getAttributeNS(WORD14_NS, attr) || p.getAttribute('w14:' + attr) || '')
      .filter(Boolean),
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
    throw new Error('OakDoc could not allocate a unique Word identifier.');
  };
}

function reseedParagraphIds(root: Node, para: () => string, text: () => string): void {
  if (!('getElementsByTagNameNS' in root)) return;
  const paragraphs = Array.from((root as Element).getElementsByTagNameNS(WORD_NS, 'p'));
  if (root.nodeType === Node.ELEMENT_NODE && isWordElement(root as Element, 'p')) {
    paragraphs.unshift(root as Element);
  }
  for (const p of paragraphs) {
    p.setAttributeNS(WORD14_NS, 'w14:paraId', para());
    if (p.hasAttributeNS(WORD14_NS, 'textId') || p.hasAttribute('w14:textId')) {
      p.setAttributeNS(WORD14_NS, 'w14:textId', text());
    }
  }
}

function reseedControls(root: Node, allocate: () => string): void {
  if (!('getElementsByTagNameNS' in root)) return;
  for (const sdt of Array.from((root as Element).getElementsByTagNameNS(WORD_NS, 'sdt'))) {
    const id = properties(sdt) ? wordChild(properties(sdt)!, 'id') : undefined;
    if (id) setWordVal(id, allocate());
  }
}

function resolveItemFields(root: Node, values: Readonly<Record<string, string>>): number {
  if (!('getElementsByTagNameNS' in root)) return 0;
  const controls = Array.from((root as Element).getElementsByTagNameNS(WORD_NS, 'sdt')).reverse();
  let updated = 0;
  for (const sdt of controls) {
    const tag = controlTag(sdt);
    if (!Object.prototype.hasOwnProperty.call(values, tag)) continue;
    const content = wordChild(sdt, 'sdtContent');
    if (!content) continue;
    const textNodes = Array.from(content.getElementsByTagNameNS(WORD_NS, 't'));
    if (textNodes.length > 0) {
      setTextValue(textNodes[0], values[tag]);
      for (let i = 1; i < textNodes.length; i += 1) setTextValue(textNodes[i], '');
    }
    unwrap(sdt);
    updated += 1;
  }
  return updated;
}

export function resolveOakDocGenericRepeaters(input: {
  docxBytes: Uint8Array;
  data: OakDocRepeaterGenerationData;
}): { bytes: Uint8Array; repeatersResolved: number; itemsCreated: number; fieldsResolved: number } {
  const files = unzipSync(input.docxBytes);
  const part = files[DOCUMENT_PART];
  if (!part) return {
    bytes: input.docxBytes,
    repeatersResolved: 0,
    itemsCreated: 0,
    fieldsResolved: 0,
  };

  const xml = parseXml(part);
  let nextId = Number(nextControlId(xml));
  const allocateId = () => String(nextId++);
  const para = createHexAllocator(xml, 'paraId');
  const text = createHexAllocator(xml, 'textId');
  let repeatersResolved = 0;
  let itemsCreated = 0;
  let fieldsResolved = 0;

  const repeaters = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))
    .filter((sdt) => OAKDOC_GENERIC_REPEATER_TAGS.has(controlTag(sdt)) && isRepeatingSection(sdt));

  for (const repeater of repeaters) {
    const definition = OAKDOC_GENERIC_REPEATER_BY_TAG.get(controlTag(repeater));
    const outerContent = wordChild(repeater, 'sdtContent');
    const parent = repeater.parentNode;
    if (!definition || !outerContent || !parent) continue;
    const item = wordChildren(outerContent)
      .find((child) => isWordElement(child, 'sdt') && isRepeatingItem(child));
    const itemContent = item ? wordChild(item, 'sdtContent') : undefined;
    if (!itemContent) continue;

    for (const values of definition.generationDataAdapter(input.data)) {
      for (const templateNode of Array.from(itemContent.childNodes)) {
        const clone = templateNode.cloneNode(true);
        reseedParagraphIds(clone, para, text);
        reseedControls(clone, allocateId);
        fieldsResolved += resolveItemFields(clone, values);
        parent.insertBefore(clone, repeater);
      }
      itemsCreated += 1;
    }

    parent.removeChild(repeater);
    repeatersResolved += 1;
  }

  if (repeatersResolved === 0) return {
    bytes: input.docxBytes,
    repeatersResolved,
    itemsCreated,
    fieldsResolved,
  };
  files[DOCUMENT_PART] = serializeXml(xml);
  return {
    bytes: zipSync(files, { level: 6 }),
    repeatersResolved,
    itemsCreated,
    fieldsResolved,
  };
}

export function removeOakDocGenericRepeater(input: {
  docxBytes: Uint8Array;
  paraId: string;
}): { bytes: Uint8Array; tag: string } {
  const files = unzipSync(input.docxBytes);
  const part = files[DOCUMENT_PART];
  if (!part) throw new Error('This DOCX has no word/document.xml part.');
  const xml = parseXml(part);
  const paragraph = findParagraphById(xml, input.paraId);
  if (!paragraph) throw new Error('OakDoc could not map the current caret back to a Word paragraph.');
  const repeater = closestRepeater(paragraph);
  if (!repeater) throw new Error('The caret is not inside an OakDoc repeating section.');
  const tag = controlTag(repeater);
  if (!OAKDOC_GENERIC_REPEATER_TAGS.has(tag)) {
    throw new Error('The current repeating section is not managed by OakDoc.');
  }
  const outerContent = wordChild(repeater, 'sdtContent');
  const item = outerContent
    ? wordChildren(outerContent).find((child) => isWordElement(child, 'sdt') && isRepeatingItem(child))
    : undefined;
  const itemContent = item ? wordChild(item, 'sdtContent') : undefined;
  const parent = repeater.parentNode;
  if (!itemContent || !parent) {
    throw new Error('The repeating section structure is incomplete and cannot be removed safely.');
  }
  while (itemContent.firstChild) parent.insertBefore(itemContent.firstChild, repeater);
  parent.removeChild(repeater);
  files[DOCUMENT_PART] = serializeXml(xml);
  return { bytes: zipSync(files, { level: 6 }), tag };
}


export function inspectOakDocGenericRepeaters(
  docxBytes: Uint8Array,
): { count: number; tags: string[] } {
  const files = unzipSync(docxBytes);
  const part = files[DOCUMENT_PART];
  if (!part) return { count: 0, tags: [] };

  const xml = parseXml(part);
  const tags = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))
    .filter((sdt) => OAKDOC_GENERIC_REPEATER_TAGS.has(controlTag(sdt)) && isRepeatingSection(sdt))
    .map(controlTag);

  return {
    count: tags.length,
    tags: Array.from(new Set(tags)).sort(),
  };
}
