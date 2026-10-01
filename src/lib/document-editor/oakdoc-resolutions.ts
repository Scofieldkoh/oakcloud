import { strFromU8, unzipSync, zipSync } from 'fflate';
import { encodeOakDocZipText } from '@/lib/document-editor/oakdoc-zip';
import {
  WORD_NS,
  getWordVal,
  isWordElement,
  wordChild,
  wordChildren,
} from '@/lib/document-editor/oakdoc-blocks';
import { OAKDOC_RESOLUTION_ITEMS_TAG } from '@/lib/document-editor/oakdoc-field-registry';
import { oakDocPartialTag } from '@/lib/document-editor/oakdoc-partials';
import type { OakDocDiagnostic } from '@/types/oakdoc';
import {
  customResolutionParagraphs,
  resolutionCompositionIssues,
  SAMPLE_RESOLUTION_COMPOSITION,
  type ResolutionComposition,
  type ResolutionSection,
} from '@/lib/resolution-composition';

/**
 * Numbered resolutions for RESOLUTION templates.
 *
 * The master holds one block content control tagged `resolution.items`.
 * At generation it is replaced by an optional bold subject heading and one
 * numbered heading per section chosen on Configure ("1.<tab>HEADING"), each
 * followed by its body: a reference to a Word partial (expanded and pinned
 * by the ordinary partial pipeline afterwards) or the custom text typed for
 * that document. The slot's first paragraph is the formatting prototype, so
 * the template owns the font, spacing and alignment of what is generated.
 * Needs DOMParser/XMLSerializer.
 */

export { OAKDOC_RESOLUTION_ITEMS_TAG };
export {
  customResolutionParagraphs,
  resolutionCompositionIssues,
  SAMPLE_RESOLUTION_COMPOSITION,
  type ResolutionComposition,
  type ResolutionSection,
};

const DOCUMENT_PART = 'word/document.xml';
/** Heading text starts 1 cm in, after "N." and a tab. */
const HEADING_TAB_TWIPS = 567;

/** Word's schema order for the paragraph properties this module adds. */
const PARAGRAPH_PROPERTY_ORDER = [
  'pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl',
  'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens',
  'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE',
  'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind',
  'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection',
  'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr',
  'sectPr', 'pPrChange',
];
const RUN_PROPERTY_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps'];

function parseXml(bytes: Uint8Array): XMLDocument {
  const xml = new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length > 0) {
    throw new Error('OakDoc could not parse word/document.xml.');
  }
  return xml;
}

function serialize(xml: XMLDocument): Uint8Array<ArrayBuffer> {
  return encodeOakDocZipText(new XMLSerializer().serializeToString(xml));
}

function element(xml: XMLDocument, name: string, attributes: Record<string, string> = {}): Element {
  const created = xml.createElementNS(WORD_NS, `w:${name}`);
  for (const [key, value] of Object.entries(attributes)) {
    created.setAttributeNS(WORD_NS, `w:${key}`, value);
  }
  return created;
}

function controlTag(sdt: Element): string {
  const properties = wordChild(sdt, 'sdtPr');
  return properties ? getWordVal(wordChild(properties, 'tag')) : '';
}

export function findResolutionSlots(xml: XMLDocument): Element[] {
  return Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))
    .filter((sdt) => controlTag(sdt) === OAKDOC_RESOLUTION_ITEMS_TAG);
}

/** Insert `child` among `parent`'s children in schema order. */
function insertOrdered(parent: Element, child: Element, order: readonly string[]): void {
  const rank = order.indexOf(child.localName);
  const existing = wordChild(parent, child.localName);
  if (existing) parent.removeChild(existing);
  const before = wordChildren(parent).find((candidate) => order.indexOf(candidate.localName) > rank);
  parent.insertBefore(child, before ?? null);
}

class IdAllocator {
  private next: number;

  constructor(xml: XMLDocument) {
    let max = 0;
    for (const id of Array.from(xml.getElementsByTagNameNS(WORD_NS, 'id'))) {
      const value = Number(getWordVal(id));
      if (Number.isInteger(value) && value > max) max = value;
    }
    this.next = Math.max(400000, max + 1);
  }

  take(): number {
    const value = this.next;
    this.next += 1;
    return value;
  }
}

interface Prototype {
  paragraphProperties: Element | null;
  runProperties: Element | null;
}

/** Formatting of the slot's first paragraph and its first run. */
function readPrototype(slot: Element): Prototype {
  const paragraph = slot.getElementsByTagNameNS(WORD_NS, 'p')[0]
    ?? (isWordElement(slot.parentNode, 'p') ? slot.parentNode : undefined);
  const run = slot.getElementsByTagNameNS(WORD_NS, 'r')[0];
  const paragraphProperties = paragraph ? wordChild(paragraph, 'pPr') ?? null : null;
  const runProperties = run ? wordChild(run, 'rPr') ?? null : null;
  return {
    paragraphProperties: paragraphProperties
      ? paragraphProperties.cloneNode(true) as Element
      : null,
    runProperties: runProperties ? runProperties.cloneNode(true) as Element : null,
  };
}

function paragraphFrom(
  xml: XMLDocument,
  prototype: Prototype,
  options: { keepNext?: boolean; headingTab?: boolean } = {},
): Element {
  const paragraph = element(xml, 'p');
  const properties = prototype.paragraphProperties
    ? prototype.paragraphProperties.cloneNode(true) as Element
    : element(xml, 'pPr');
  // A paragraph mark's own run properties and section breaks stay with the slot.
  for (const child of wordChildren(properties)) {
    if (['sectPr', 'pPrChange', 'numPr'].includes(child.localName)) properties.removeChild(child);
  }
  if (options.keepNext) insertOrdered(properties, element(xml, 'keepNext'), PARAGRAPH_PROPERTY_ORDER);
  if (options.headingTab) {
    const tabs = element(xml, 'tabs');
    tabs.appendChild(element(xml, 'tab', { val: 'left', pos: String(HEADING_TAB_TWIPS) }));
    insertOrdered(properties, tabs, PARAGRAPH_PROPERTY_ORDER);
    const indent = wordChild(properties, 'ind');
    if (indent) properties.removeChild(indent);
  }
  if (wordChildren(properties).length > 0) paragraph.appendChild(properties);
  return paragraph;
}

function runFrom(xml: XMLDocument, prototype: Prototype, options: { bold?: boolean } = {}): Element {
  const run = element(xml, 'r');
  const properties = prototype.runProperties
    ? prototype.runProperties.cloneNode(true) as Element
    : element(xml, 'rPr');
  if (options.bold) insertOrdered(properties, element(xml, 'b'), RUN_PROPERTY_ORDER);
  if (wordChildren(properties).length > 0) run.appendChild(properties);
  return run;
}

function appendText(xml: XMLDocument, run: Element, value: string): void {
  const text = element(xml, 't');
  text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
  text.textContent = value;
  run.appendChild(text);
}

function textParagraph(
  xml: XMLDocument,
  prototype: Prototype,
  lines: string[],
  options: { bold?: boolean; keepNext?: boolean } = {},
): Element {
  const paragraph = paragraphFrom(xml, prototype, { keepNext: options.keepNext });
  const run = runFrom(xml, prototype, { bold: options.bold });
  lines.forEach((line, index) => {
    if (index > 0) run.appendChild(element(xml, 'br'));
    appendText(xml, run, line);
  });
  paragraph.appendChild(run);
  return paragraph;
}

function headingParagraph(
  xml: XMLDocument,
  prototype: Prototype,
  number: number,
  heading: string,
): Element {
  const paragraph = paragraphFrom(xml, prototype, { keepNext: true, headingTab: true });
  const run = runFrom(xml, prototype);
  appendText(xml, run, `${number}.`);
  run.appendChild(element(xml, 'tab'));
  appendText(xml, run, heading.trim());
  paragraph.appendChild(run);
  return paragraph;
}

function partialReference(xml: XMLDocument, ids: IdAllocator, partialId: string, label: string): Element {
  const sdt = element(xml, 'sdt');
  const properties = element(xml, 'sdtPr');
  properties.appendChild(element(xml, 'alias', { val: `Partial: ${label}` }));
  properties.appendChild(element(xml, 'tag', { val: oakDocPartialTag(partialId) }));
  properties.appendChild(element(xml, 'id', { val: String(ids.take()) }));
  sdt.appendChild(properties);
  const content = element(xml, 'sdtContent');
  content.appendChild(element(xml, 'p'));
  sdt.appendChild(content);
  return sdt;
}

/** Replace a block slot, or the paragraph an inline slot occupies alone. */
function replaceSlot(slot: Element, replacements: Element[]): boolean {
  const parent = slot.parentNode;
  if (!parent) return false;
  let anchor: Node = slot;
  if (isWordElement(parent, 'p')) {
    const others = wordChildren(parent).filter((child) => !isWordElement(child, 'pPr') && child !== slot);
    if (others.length > 0 || !parent.parentNode) return false;
    anchor = parent;
  }
  const container = anchor.parentNode!;
  for (const replacement of replacements) container.insertBefore(replacement, anchor);
  container.removeChild(anchor);
  return true;
}

export interface ResolutionCompositionResult {
  bytes: Uint8Array;
  /** Partials the composed document now references, in order. */
  partialIds: string[];
  diagnostics: OakDocDiagnostic[];
}

function slotError(code: string, message: string): OakDocDiagnostic {
  return { code, severity: 'error', stage: 'render', message, controlTag: OAKDOC_RESOLUTION_ITEMS_TAG };
}

export function composeOakDocResolutions(
  docxBytes: Uint8Array,
  composition: ResolutionComposition,
): ResolutionCompositionResult {
  const files = unzipSync(docxBytes);
  const documentBytes = files[DOCUMENT_PART];
  if (!documentBytes) throw new Error('This DOCX has no word/document.xml part.');
  const xml = parseXml(documentBytes);
  const slots = findResolutionSlots(xml);
  const diagnostics: OakDocDiagnostic[] = [];
  if (slots.length !== 1) {
    diagnostics.push(slotError(
      slots.length === 0 ? 'OAKDOC_RESOLUTION_SLOT_MISSING' : 'OAKDOC_RESOLUTION_SLOT_DUPLICATE',
      slots.length === 0
        ? 'This resolution template has no place for the numbered resolutions. Insert it in the template editor.'
        : 'This resolution template must have exactly one place for the numbered resolutions.',
    ));
    return { bytes: docxBytes, partialIds: [], diagnostics };
  }
  for (const issue of resolutionCompositionIssues(composition)) {
    diagnostics.push(slotError('OAKDOC_RESOLUTION_INCOMPLETE', issue));
  }

  const [slot] = slots;
  const prototype = readPrototype(slot);
  const ids = new IdAllocator(xml);
  const blocks: Element[] = [];
  const partialIds: string[] = [];
  if (composition.subject.trim()) {
    blocks.push(textParagraph(xml, prototype, [composition.subject.trim()], { bold: true, keepNext: true }));
  }
  composition.sections.forEach((section, index) => {
    blocks.push(headingParagraph(xml, prototype, index + 1, section.heading));
    if (section.kind === 'PARTIAL') {
      partialIds.push(section.partialId);
      blocks.push(partialReference(xml, ids, section.partialId, section.heading.trim() || 'Resolution'));
      return;
    }
    for (const lines of customResolutionParagraphs(section.body)) {
      blocks.push(textParagraph(xml, prototype, lines));
    }
  });

  if (!replaceSlot(slot, blocks)) {
    diagnostics.push(slotError(
      'OAKDOC_RESOLUTION_SLOT_LOCATION',
      'The numbered resolutions must sit in their own paragraph in the template.',
    ));
    return { bytes: docxBytes, partialIds: [], diagnostics };
  }
  files[DOCUMENT_PART] = serialize(xml);
  return { bytes: zipSync(files, { level: 6 }), partialIds, diagnostics };
}

/** Whether a master already holds the numbered resolutions slot. */
export function hasOakDocResolutionSlot(docxBytes: Uint8Array): boolean {
  const files = unzipSync(docxBytes);
  const documentBytes = files[DOCUMENT_PART];
  return documentBytes ? findResolutionSlots(parseXml(documentBytes)).length > 0 : false;
}

/**
 * Editor action: add the numbered resolutions slot after the paragraph
 * holding the caret. The slot keeps that paragraph's formatting, which the
 * generated resolutions then follow.
 */
export function insertOakDocResolutionSlot(input: {
  docxBytes: Uint8Array;
  paraId: string;
}): Uint8Array {
  const files = unzipSync(input.docxBytes);
  if (!files[DOCUMENT_PART]) throw new Error('OakDoc could not find word/document.xml.');
  const xml = parseXml(files[DOCUMENT_PART]);
  if (findResolutionSlots(xml).length > 0) {
    throw new Error('This template already has the numbered resolutions.');
  }
  const expected = input.paraId.trim().toUpperCase();
  const paragraph = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'p')).find((candidate) => (
    (candidate.getAttributeNS('http://schemas.microsoft.com/office/word/2010/wordml', 'paraId')
      || candidate.getAttribute('w14:paraId')
      || '').toUpperCase() === expected
  ));
  if (!paragraph) throw new Error('Place the caret in a paragraph first.');
  let anchor: Element = paragraph;
  while (anchor.parentNode && isWordElement(anchor.parentNode, 'sdtContent')) {
    const sdt = anchor.parentNode.parentNode as Element | null;
    if (!sdt) break;
    anchor = sdt;
  }
  const parent = anchor.parentNode as Element | null;
  if (!parent || parent.localName !== 'body') {
    throw new Error('Put the caret in a body paragraph, outside tables and other sections.');
  }

  const sdt = element(xml, 'sdt');
  const properties = element(xml, 'sdtPr');
  properties.appendChild(element(xml, 'alias', { val: 'Numbered resolutions' }));
  properties.appendChild(element(xml, 'tag', { val: OAKDOC_RESOLUTION_ITEMS_TAG }));
  properties.appendChild(element(xml, 'id', { val: String(new IdAllocator(xml).take()) }));
  properties.appendChild(element(xml, 'lock', { val: 'sdtContentLocked' }));
  sdt.appendChild(properties);
  const content = element(xml, 'sdtContent');
  const body = element(xml, 'p');
  const sourceProperties = wordChild(paragraph, 'pPr');
  if (sourceProperties) {
    const copied = sourceProperties.cloneNode(true) as Element;
    for (const child of wordChildren(copied)) {
      if (['sectPr', 'pPrChange', 'numPr'].includes(child.localName)) copied.removeChild(child);
    }
    body.appendChild(copied);
  }
  const run = element(xml, 'r');
  const sourceRun = paragraph.getElementsByTagNameNS(WORD_NS, 'r')[0];
  const sourceRunProperties = sourceRun ? wordChild(sourceRun, 'rPr') : undefined;
  if (sourceRunProperties) run.appendChild(sourceRunProperties.cloneNode(true));
  appendText(xml, run, '[Numbered resolutions: chosen when the document is generated]');
  body.appendChild(run);
  content.appendChild(body);
  sdt.appendChild(content);
  parent.insertBefore(sdt, anchor.nextSibling);

  files[DOCUMENT_PART] = serialize(xml);
  return zipSync(files, { level: 6 });
}
