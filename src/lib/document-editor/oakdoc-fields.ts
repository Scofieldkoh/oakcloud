import { strFromU8, unzipSync, zipSync } from 'fflate';
import { encodeOakDocZipText } from '@/lib/document-editor/oakdoc-zip';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

export interface OakDocFieldDefinition {
  tag: string;
  label: string;
  category: string;
}

export interface OakDocFieldSummary {
  count: number;
  tags: string[];
}

export interface OakDocFieldResolutionResult {
  bytes: Uint8Array;
  updated: number;
  unresolvedTags: string[];
}

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

function getWordVal(element: Element | undefined): string {
  return element
    ? (element.getAttributeNS(WORD_NS, 'val') || element.getAttribute('w:val') || '')
    : '';
}

function setTextValue(textElement: Element, value: string): void {
  textElement.textContent = value;
  if (/^\s|\s$/.test(value)) {
    textElement.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  } else {
    textElement.removeAttributeNS(XML_NS, 'space');
  }
}

function wordXmlPartNames(files: Record<string, Uint8Array>): string[] {
  return Object.keys(files).filter(
    (name) => name === 'word/document.xml' || /^word\/(header|footer)\d+\.xml$/i.test(name),
  );
}

function contentControlProperties(sdt: Element): Element | undefined {
  return wordChildren(sdt).find((child) => isWordElement(child, 'sdtPr'));
}

function contentControlTag(sdt: Element): string {
  const properties = contentControlProperties(sdt);
  if (!properties) return '';
  const tag = wordChildren(properties).find((child) => isWordElement(child, 'tag'));
  return getWordVal(tag);
}

function contentControlId(sdt: Element): string {
  const properties = contentControlProperties(sdt);
  if (!properties) return '';
  const id = wordChildren(properties).find((child) => isWordElement(child, 'id'));
  return getWordVal(id);
}

function contentControlPlaceholderState(sdt: Element) {
  const properties = contentControlProperties(sdt);
  const showingPlaceholder = properties
    ? wordChildren(properties).find((child) => isWordElement(child, 'showingPlcHdr'))
    : undefined;
  const content = wordChildren(sdt).find((child) => isWordElement(child, 'sdtContent'));
  const text = content
    ? Array.from(content.getElementsByTagNameNS(WORD_NS, 't'))
      .map((node) => node.textContent || '')
      .join('')
    : '';
  const promptOnly = /^(?:Click here to enter text\.?\s*)+$/i.test(text.trim());
  return { properties, showingPlaceholder, content, promptOnly };
}

function unwrapDeletedOakDocField(
  sdt: Element,
  state: ReturnType<typeof contentControlPlaceholderState>,
): void {
  const parent = sdt.parentNode;
  if (!parent) return;

  const content = state.content;
  if (content) {
    for (const textNode of Array.from(content.getElementsByTagNameNS(WORD_NS, 't'))) {
      setTextValue(textNode, '');
    }

    while (content.firstChild) {
      parent.insertBefore(content.firstChild, sdt);
    }
  }

  parent.removeChild(sdt);

  // Word table cells must retain paragraph structure. A deleted block-level
  // content control can otherwise leave an empty <w:tc>, which editors may
  // reflow into collapsed columns on the next DOCX reload.
  if (isWordElement(parent, 'tc')) {
    const hasParagraph = wordChildren(parent).some((child) => isWordElement(child, 'p'));
    if (!hasParagraph) {
      parent.appendChild(sdt.ownerDocument.createElementNS(WORD_NS, 'w:p'));
    }
  }
}

function oakDocControlIds(
  docxBytes: Uint8Array,
  knownTags: ReadonlySet<string>,
): Set<string> {
  const files = unzipSync(docxBytes);
  const ids = new Set<string>();

  for (const name of wordXmlPartNames(files)) {
    const xml = parseXml(files[name]);
    for (const sdt of Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))) {
      const tag = contentControlTag(sdt);
      if (!knownTags.has(tag)) continue;
      const id = contentControlId(sdt);
      if (id) ids.add(`${name}::${id}`);
    }
  }

  return ids;
}

export function normalizeOakDocFields(input: {
  beforeBytes: Uint8Array | null;
  afterBytes: Uint8Array;
  insertedField?: Pick<OakDocFieldDefinition, 'tag'> | null;
  knownTags: ReadonlySet<string>;
}): { bytes: Uint8Array; seeded: number; removed: number } {
  const files = unzipSync(input.afterBytes);
  const beforeIds = input.beforeBytes
    ? oakDocControlIds(input.beforeBytes, input.knownTags)
    : new Set<string>();
  let removed = 0;
  let seeded = 0;
  let fallbackSeeded = false;

  for (const name of wordXmlPartNames(files)) {
    const xml = parseXml(files[name]);
    let changed = false;

    for (const sdt of Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))) {
      const tag = contentControlTag(sdt);
      if (!input.knownTags.has(tag)) continue;

      const state = contentControlPlaceholderState(sdt);
      if (!state.showingPlaceholder && !state.promptOnly) continue;

      const id = contentControlId(sdt);
      const isNew = Boolean(
        input.insertedField
        && tag === input.insertedField.tag
        && (
          (id && !beforeIds.has(`${name}::${id}`))
          || (!id && !fallbackSeeded)
        ),
      );

      if (isNew && state.content && state.properties) {
        const textNodes = Array.from(state.content.getElementsByTagNameNS(WORD_NS, 't'));
        if (textNodes.length > 0) {
          const token = `{{${tag}}}`;
          setTextValue(textNodes[0], token);
          for (let index = 1; index < textNodes.length; index += 1) {
            setTextValue(textNodes[index], '');
          }
          if (state.showingPlaceholder?.parentNode === state.properties) {
            state.properties.removeChild(state.showingPlaceholder);
          }
          seeded += 1;
          fallbackSeeded = true;
          changed = true;
          continue;
        }
      }

      unwrapDeletedOakDocField(sdt, state);
      removed += 1;
      changed = true;
    }

    if (changed) files[name] = serializeXml(xml);
  }

  return {
    bytes: seeded || removed ? zipSync(files, { level: 6 }) : input.afterBytes,
    seeded,
    removed,
  };
}

export function pruneDeletedOakDocFields(
  docxBytes: Uint8Array,
  knownTags: ReadonlySet<string>,
): { bytes: Uint8Array; removed: number } {
  const result = normalizeOakDocFields({
    beforeBytes: null,
    afterBytes: docxBytes,
    knownTags,
  });
  return { bytes: result.bytes, removed: result.removed };
}

export function inspectOakDocFields(
  docxBytes: Uint8Array,
  knownTags?: ReadonlySet<string>,
): OakDocFieldSummary {
  const files = unzipSync(docxBytes);
  const tags: string[] = [];

  for (const name of wordXmlPartNames(files)) {
    const xml = parseXml(files[name]);
    for (const sdt of Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))) {
      const tag = contentControlTag(sdt);
      if (!tag || (knownTags && !knownTags.has(tag))) continue;
      tags.push(tag);
    }
  }

  return {
    count: tags.length,
    tags: Array.from(new Set(tags)).sort(),
  };
}

export function resolveOakDocFields(
  docxBytes: Uint8Array,
  values: Readonly<Record<string, string>>,
): OakDocFieldResolutionResult {
  const files = unzipSync(docxBytes);
  let updated = 0;
  const seenTags = new Set<string>();

  for (const name of wordXmlPartNames(files)) {
    const xml = parseXml(files[name]);
    let changed = false;

    for (const sdt of Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))) {
      const tag = contentControlTag(sdt);
      if (!tag) continue;
      seenTags.add(tag);
      if (!Object.prototype.hasOwnProperty.call(values, tag)) continue;

      const content = wordChildren(sdt).find((child) => isWordElement(child, 'sdtContent'));
      if (!content) continue;

      const textNodes = Array.from(content.getElementsByTagNameNS(WORD_NS, 't'));
      if (textNodes.length === 0) continue;

      setTextValue(textNodes[0], values[tag]);
      for (let index = 1; index < textNodes.length; index += 1) {
        setTextValue(textNodes[index], '');
      }
      updated += 1;
      changed = true;
    }

    if (changed) files[name] = serializeXml(xml);
  }

  const unresolvedTags = Array.from(seenTags)
    .filter((tag) => !Object.prototype.hasOwnProperty.call(values, tag))
    .sort();

  return {
    bytes: updated ? zipSync(files, { level: 6 }) : docxBytes,
    updated,
    unresolvedTags,
  };
}
