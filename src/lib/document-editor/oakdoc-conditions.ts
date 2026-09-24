import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WORD14_NS = 'http://schemas.microsoft.com/office/word/2010/wordml';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const PACKAGE_RELS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CUSTOM_PROPERTIES_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties';
const VT_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes';

const DOCUMENT_PART = 'word/document.xml';
const CONTENT_TYPES_PART = '[Content_Types].xml';
const ROOT_RELS_PART = '_rels/.rels';
const CUSTOM_PROPERTIES_PART = 'docProps/custom.xml';
const CUSTOM_PROPERTIES_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.custom-properties+xml';
const CUSTOM_PROPERTIES_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties';
const CUSTOM_PROPERTY_FMTID = '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}';
const CONDITION_TAG_PREFIX = 'oakdoc.condition.';
const CONDITION_PROPERTY_PREFIX = 'OakDoc.Condition.';
const CONDITION_SCHEMA_VERSION = 1;

export type OakDocConditionOperator = 'truthy' | 'equals' | 'notEquals';

export interface OakDocConditionDefinition {
  field: string;
  operator: OakDocConditionOperator;
  value?: string;
}

export interface OakDocConditionInstance extends OakDocConditionDefinition {
  id: string;
  tag: string;
}

export interface OakDocConditionSummary {
  count: number;
  fieldTags: string[];
  conditions: OakDocConditionInstance[];
}

function parseXml(bytes: Uint8Array): XMLDocument {
  const parser = new DOMParser();
  const xml = parser.parseFromString(strFromU8(bytes), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length > 0) {
    throw new Error('OakDoc could not parse document package XML.');
  }
  return xml;
}

function parseXmlText(value: string): XMLDocument {
  return parseXml(strToU8(value));
}

function serializeXml(xml: XMLDocument): Uint8Array {
  return strToU8(new XMLSerializer().serializeToString(xml));
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

function contentControlProperties(sdt: Element): Element | undefined {
  return wordChild(sdt, 'sdtPr');
}

function contentControlTag(sdt: Element): string {
  const properties = contentControlProperties(sdt);
  if (!properties) return '';
  return getWordVal(wordChild(properties, 'tag'));
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

function closestOakDocCondition(start: Element): Element | undefined {
  let current: Element | null = start.parentElement;
  while (current) {
    if (
      isWordElement(current, 'sdt')
      && contentControlTag(current).startsWith(CONDITION_TAG_PREFIX)
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return undefined;
}

function conditionTarget(paragraph: Element): {
  node: Element;
  kind: 'table row' | 'paragraph';
} {
  const row = closestWordElement(paragraph, 'tr');
  if (row) return { node: row, kind: 'table row' };
  return { node: paragraph, kind: 'paragraph' };
}

function nextContentControlId(xml: XMLDocument): string {
  const used = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'id'))
    .map((element) => Number(getWordVal(element)))
    .filter((value) => Number.isInteger(value) && value > 0);
  const max = used.length > 0 ? Math.max(...used) : 1000;
  return String(max >= 2_000_000_000 ? 1001 : max + 1);
}

function createConditionId(existingIds: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const random = globalThis.crypto?.randomUUID?.()
      || (Date.now().toString(16) + Math.random().toString(16).slice(2));
    const id = random.replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
    if (id && !existingIds.has(id)) return id;
  }
  throw new Error('OakDoc could not allocate a condition identifier.');
}

function validateCondition(input: OakDocConditionDefinition): OakDocConditionDefinition {
  const field = input.field.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(field)) {
    throw new Error('Condition field is invalid.');
  }
  if (
    input.operator !== 'truthy'
    && input.operator !== 'equals'
    && input.operator !== 'notEquals'
  ) {
    throw new Error('Condition operator is invalid.');
  }

  if (input.operator === 'truthy') {
    return { field, operator: input.operator };
  }

  if (typeof input.value !== 'string') {
    throw new Error('A comparison value is required for this condition.');
  }
  if (input.value.length > 4096) {
    throw new Error('Condition comparison value is too long.');
  }
  return {
    field,
    operator: input.operator,
    value: input.value,
  };
}

function newRelationshipsDocument(): XMLDocument {
  return parseXmlText(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="' + PACKAGE_RELS_NS + '"/>',
  );
}

function newCustomPropertiesDocument(): XMLDocument {
  return parseXmlText(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Properties xmlns="' + CUSTOM_PROPERTIES_NS + '"'
    + ' xmlns:vt="' + VT_NS + '"/>',
  );
}

function ensureCustomPropertiesPackage(
  files: Record<string, Uint8Array>,
): XMLDocument {
  const contentTypesBytes = files[CONTENT_TYPES_PART];
  if (!contentTypesBytes) {
    throw new Error('This DOCX package has no [Content_Types].xml part.');
  }

  const contentTypes = parseXml(contentTypesBytes);
  const typesRoot = contentTypes.documentElement;
  const hasOverride = Array.from(typesRoot.children).some((child) => (
    child.namespaceURI === CONTENT_TYPES_NS
    && child.localName === 'Override'
    && child.getAttribute('PartName') === '/docProps/custom.xml'
  ));
  if (!hasOverride) {
    const override = contentTypes.createElementNS(CONTENT_TYPES_NS, 'Override');
    override.setAttribute('PartName', '/docProps/custom.xml');
    override.setAttribute('ContentType', CUSTOM_PROPERTIES_CONTENT_TYPE);
    typesRoot.appendChild(override);
    files[CONTENT_TYPES_PART] = serializeXml(contentTypes);
  }

  const relationships = files[ROOT_RELS_PART]
    ? parseXml(files[ROOT_RELS_PART])
    : newRelationshipsDocument();
  const relRoot = relationships.documentElement;
  const hasRelationship = Array.from(relRoot.children).some((child) => (
    child.namespaceURI === PACKAGE_RELS_NS
    && child.localName === 'Relationship'
    && child.getAttribute('Type') === CUSTOM_PROPERTIES_REL_TYPE
  ));

  if (!hasRelationship) {
    const usedIds = new Set(
      Array.from(relRoot.children)
        .map((child) => child.getAttribute('Id') || '')
        .filter(Boolean),
    );
    let counter = 1;
    while (usedIds.has('rIdOakDoc' + counter)) counter += 1;

    const relationship = relationships.createElementNS(PACKAGE_RELS_NS, 'Relationship');
    relationship.setAttribute('Id', 'rIdOakDoc' + counter);
    relationship.setAttribute('Type', CUSTOM_PROPERTIES_REL_TYPE);
    relationship.setAttribute('Target', 'docProps/custom.xml');
    relRoot.appendChild(relationship);
    files[ROOT_RELS_PART] = serializeXml(relationships);
  }

  return files[CUSTOM_PROPERTIES_PART]
    ? parseXml(files[CUSTOM_PROPERTIES_PART])
    : newCustomPropertiesDocument();
}

function customPropertyElements(xml: XMLDocument): Element[] {
  return Array.from(xml.documentElement.children)
    .filter((child) => (
      child.namespaceURI === CUSTOM_PROPERTIES_NS
      && child.localName === 'property'
    ));
}

function customPropertyValue(property: Element): string {
  const value = Array.from(property.children)[0];
  return value?.textContent || '';
}

function writeConditionProperty(
  files: Record<string, Uint8Array>,
  instance: OakDocConditionInstance,
): void {
  const properties = ensureCustomPropertiesPackage(files);
  const name = CONDITION_PROPERTY_PREFIX + instance.id;
  const existing = customPropertyElements(properties)
    .find((property) => property.getAttribute('name') === name);

  const property = existing
    || properties.createElementNS(CUSTOM_PROPERTIES_NS, 'property');
  if (!existing) {
    const usedPids = customPropertyElements(properties)
      .map((candidate) => Number(candidate.getAttribute('pid')))
      .filter((value) => Number.isInteger(value) && value > 1);
    const pid = usedPids.length > 0 ? Math.max(...usedPids) + 1 : 2;
    property.setAttribute('fmtid', CUSTOM_PROPERTY_FMTID);
    property.setAttribute('pid', String(pid));
    property.setAttribute('name', name);
    properties.documentElement.appendChild(property);
  }

  while (property.firstChild) property.removeChild(property.firstChild);
  const value = properties.createElementNS(VT_NS, 'vt:lpwstr');
  value.textContent = JSON.stringify({
    schemaVersion: CONDITION_SCHEMA_VERSION,
    field: instance.field,
    operator: instance.operator,
    ...(instance.value === undefined ? {} : { value: instance.value }),
  });
  property.appendChild(value);
  files[CUSTOM_PROPERTIES_PART] = serializeXml(properties);
}

function removeConditionProperty(
  files: Record<string, Uint8Array>,
  id: string,
): void {
  const bytes = files[CUSTOM_PROPERTIES_PART];
  if (!bytes) return;

  const properties = parseXml(bytes);
  const name = CONDITION_PROPERTY_PREFIX + id;
  const property = customPropertyElements(properties)
    .find((candidate) => candidate.getAttribute('name') === name);
  if (!property?.parentNode) return;

  property.parentNode.removeChild(property);
  files[CUSTOM_PROPERTIES_PART] = serializeXml(properties);
}

function readConditionProperties(
  files: Record<string, Uint8Array>,
): Map<string, OakDocConditionDefinition> {
  const result = new Map<string, OakDocConditionDefinition>();
  const bytes = files[CUSTOM_PROPERTIES_PART];
  if (!bytes) return result;

  const properties = parseXml(bytes);
  for (const property of customPropertyElements(properties)) {
    const name = property.getAttribute('name') || '';
    if (!name.startsWith(CONDITION_PROPERTY_PREFIX)) continue;

    const id = name.slice(CONDITION_PROPERTY_PREFIX.length);
    if (!id) continue;

    try {
      const parsed = JSON.parse(customPropertyValue(property)) as Record<string, unknown>;
      if (parsed.schemaVersion !== CONDITION_SCHEMA_VERSION) continue;
      const definition = validateCondition({
        field: typeof parsed.field === 'string' ? parsed.field : '',
        operator: parsed.operator as OakDocConditionOperator,
        value: typeof parsed.value === 'string' ? parsed.value : undefined,
      });
      result.set(id, definition);
    } catch {
      // Malformed OakDoc condition metadata is ignored rather than guessed.
    }
  }
  return result;
}

function conditionIdFromTag(tag: string): string | null {
  if (!tag.startsWith(CONDITION_TAG_PREFIX)) return null;
  const id = tag.slice(CONDITION_TAG_PREFIX.length);
  return id || null;
}

function createConditionSdtProperties(
  xml: XMLDocument,
  instance: OakDocConditionInstance,
): Element {
  const properties = xml.createElementNS(WORD_NS, 'w:sdtPr');

  const alias = xml.createElementNS(WORD_NS, 'w:alias');
  setWordVal(alias, 'OakDoc conditional block');
  properties.appendChild(alias);

  const tag = xml.createElementNS(WORD_NS, 'w:tag');
  setWordVal(tag, instance.tag);
  properties.appendChild(tag);

  const id = xml.createElementNS(WORD_NS, 'w:id');
  setWordVal(id, nextContentControlId(xml));
  properties.appendChild(id);

  return properties;
}

export function createOakDocCondition(input: {
  docxBytes: Uint8Array;
  fromParaId: string;
  toParaId?: string;
  condition: OakDocConditionDefinition;
  allowedFields: ReadonlySet<string>;
}): {
  bytes: Uint8Array;
  condition: OakDocConditionInstance;
  targetKind: 'table row' | 'paragraph';
} {
  const definition = validateCondition(input.condition);
  if (!input.allowedFields.has(definition.field)) {
    throw new Error('This field is not available for OakDoc conditions.');
  }

  const files = unzipSync(input.docxBytes);
  const documentPart = files[DOCUMENT_PART];
  if (!documentPart) throw new Error('This DOCX has no word/document.xml part.');

  const xml = parseXml(documentPart);
  const fromParagraph = findParagraph(xml, input.fromParaId);
  const toParagraph = findParagraph(xml, input.toParaId || input.fromParaId);
  if (!fromParagraph || !toParagraph) {
    throw new Error('OakDoc could not map the current selection back to a Word paragraph.');
  }

  if (closestOakDocCondition(fromParagraph) || closestOakDocCondition(toParagraph)) {
    throw new Error('Nested OakDoc conditions are not supported yet.');
  }

  const fromTarget = conditionTarget(fromParagraph);
  const toTarget = conditionTarget(toParagraph);
  if (fromTarget.node !== toTarget.node) {
    throw new Error(
      'Conditional blocks currently support one table row or one paragraph at a time. '
      + 'Place the caret inside the row or paragraph you want to condition.',
    );
  }

  const propertyMap = readConditionProperties(files);
  const id = createConditionId(new Set(propertyMap.keys()));
  const instance: OakDocConditionInstance = {
    id,
    tag: CONDITION_TAG_PREFIX + id,
    ...definition,
  };

  const target = fromTarget.node;
  const parent = target.parentNode;
  if (!parent) throw new Error('OakDoc could not locate the selected Word structure.');

  const wrapper = xml.createElementNS(WORD_NS, 'w:sdt');
  wrapper.appendChild(createConditionSdtProperties(xml, instance));
  const content = xml.createElementNS(WORD_NS, 'w:sdtContent');
  wrapper.appendChild(content);

  parent.insertBefore(wrapper, target);
  content.appendChild(target);

  files[DOCUMENT_PART] = serializeXml(xml);
  writeConditionProperty(files, instance);

  return {
    bytes: zipSync(files, { level: 6 }),
    condition: instance,
    targetKind: fromTarget.kind,
  };
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

function hasConditionTag(xml: XMLDocument, tag: string): boolean {
  return Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))
    .some((sdt) => contentControlTag(sdt) === tag);
}

export function removeOakDocCondition(input: {
  docxBytes: Uint8Array;
  paraId: string;
}): {
  bytes: Uint8Array;
  condition: OakDocConditionInstance;
} {
  const files = unzipSync(input.docxBytes);
  const documentPart = files[DOCUMENT_PART];
  if (!documentPart) throw new Error('This DOCX has no word/document.xml part.');

  const xml = parseXml(documentPart);
  const paragraph = findParagraph(xml, input.paraId);
  if (!paragraph) {
    throw new Error('OakDoc could not map the current caret back to a Word paragraph.');
  }

  const wrapper = closestOakDocCondition(paragraph);
  if (!wrapper) {
    throw new Error('The caret is not inside an OakDoc conditional block.');
  }

  const tag = contentControlTag(wrapper);
  const id = conditionIdFromTag(tag);
  if (!id) throw new Error('The conditional block identifier is invalid.');

  const metadata = readConditionProperties(files).get(id);
  if (!metadata) {
    throw new Error('The conditional block metadata is missing.');
  }

  unwrapContentControl(wrapper);
  files[DOCUMENT_PART] = serializeXml(xml);

  if (!hasConditionTag(xml, tag)) {
    removeConditionProperty(files, id);
  }

  return {
    bytes: zipSync(files, { level: 6 }),
    condition: { id, tag, ...metadata },
  };
}

export function inspectOakDocConditions(
  docxBytes: Uint8Array,
): OakDocConditionSummary {
  const files = unzipSync(docxBytes);
  const documentPart = files[DOCUMENT_PART];
  if (!documentPart) return { count: 0, fieldTags: [], conditions: [] };

  const xml = parseXml(documentPart);
  const metadata = readConditionProperties(files);
  const conditions: OakDocConditionInstance[] = [];

  for (const sdt of Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))) {
    const tag = contentControlTag(sdt);
    const id = conditionIdFromTag(tag);
    if (!id) continue;
    const definition = metadata.get(id);
    if (!definition) continue;
    conditions.push({ id, tag, ...definition });
  }

  return {
    count: conditions.length,
    fieldTags: Array.from(new Set(conditions.map((condition) => condition.field))).sort(),
    conditions,
  };
}

function evaluateCondition(
  condition: OakDocConditionDefinition,
  values: Readonly<Record<string, string>>,
): boolean {
  const actual = values[condition.field] ?? '';
  if (condition.operator === 'truthy') {
    const normalized = actual.trim().toLowerCase();
    return !['', '0', 'false', 'no', 'null', 'undefined'].includes(normalized);
  }
  if (condition.operator === 'equals') {
    return actual === (condition.value ?? '');
  }
  return actual !== (condition.value ?? '');
}

export function resolveOakDocConditions(input: {
  docxBytes: Uint8Array;
  values: Readonly<Record<string, string>>;
  allowedFields: ReadonlySet<string>;
}): {
  bytes: Uint8Array;
  resolved: number;
  kept: number;
  removed: number;
  unresolvedFields: string[];
} {
  const files = unzipSync(input.docxBytes);
  const documentPart = files[DOCUMENT_PART];
  if (!documentPart) {
    return {
      bytes: input.docxBytes,
      resolved: 0,
      kept: 0,
      removed: 0,
      unresolvedFields: [],
    };
  }

  const xml = parseXml(documentPart);
  const metadata = readConditionProperties(files);
  const unresolvedFields = new Set<string>();
  const wrappers = Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))
    .filter((sdt) => conditionIdFromTag(contentControlTag(sdt)) !== null);

  let resolved = 0;
  let kept = 0;
  let removed = 0;
  let changed = false;
  const resolvedIds = new Set<string>();

  for (const wrapper of wrappers) {
    if (!wrapper.parentNode) continue;

    const tag = contentControlTag(wrapper);
    const id = conditionIdFromTag(tag);
    if (!id) continue;
    const condition = metadata.get(id);
    if (!condition || !input.allowedFields.has(condition.field)) {
      if (condition?.field) unresolvedFields.add(condition.field);
      continue;
    }

    const keep = evaluateCondition(condition, input.values);
    if (keep) {
      unwrapContentControl(wrapper);
      kept += 1;
    } else {
      wrapper.parentNode?.removeChild(wrapper);
      removed += 1;
    }
    resolved += 1;
    resolvedIds.add(id);
    changed = true;
  }

  if (changed) files[DOCUMENT_PART] = serializeXml(xml);
  for (const id of resolvedIds) {
    const tag = CONDITION_TAG_PREFIX + id;
    if (!hasConditionTag(xml, tag)) removeConditionProperty(files, id);
  }

  return {
    bytes: changed ? zipSync(files, { level: 6 }) : input.docxBytes,
    resolved,
    kept,
    removed,
    unresolvedFields: Array.from(unresolvedFields).sort(),
  };
}
