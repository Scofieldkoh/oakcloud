import { createHash } from 'node:crypto';
import { strFromU8, unzipSync, zipSync } from 'fflate';

import { encodeOakDocZipText } from '@/lib/document-editor/oakdoc-zip';
import { resolveOakDocFields } from '@/lib/document-editor/oakdoc-fields';
import {
  WORD_NS,
  appendTextRun,
  htmlToWordBlocks,
  wordElement,
} from '@/lib/document-editor/oakdoc-html-import';
import {
  OAKDOC_AGREEMENT_SERVICE_ITEM_TAG_PREFIX,
  OAKDOC_AGREEMENT_SLOT_TAGS,
} from '@/lib/document-editor/oakdoc-field-registry';
import { canonicalJson } from '@/lib/document-generation-fingerprint';
import { resolvePlaceholders } from '@/lib/placeholder-resolver';
import {
  buildServiceAgreementItemPlaceholderContext,
  findMissingServiceAgreementItemPlaceholders,
  formatServiceAgreementCurrency,
  formatServiceAgreementFrequency,
  orderedServiceAgreementEntities,
  orderedServiceAgreementItems,
} from './renderer';
import { canonicalServiceAgreementData } from './canonical';
import type {
  AuthorizedRepresentativeSnapshot,
  ServiceAgreementDraftDto,
  ServiceAgreementFeeLineDto,
  ServiceAgreementItemDto,
} from './types';

const DOCUMENT_PART = 'word/document.xml';

export const OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS = OAKDOC_AGREEMENT_SLOT_TAGS;

const SLOT_TAG_ALIASES: Record<
  keyof typeof OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS,
  readonly string[]
> = {
  serviceSections: [
    OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS.serviceSections,
    '@agreement.serviceSections',
  ],
  feeTable: [
    OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS.feeTable,
    '@agreement.feeTable',
  ],
  entityAppendix: [
    OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS.entityAppendix,
    '@agreement.entityAppendix',
  ],
};

const SERVICE_ITEM_TAG_PREFIX = OAKDOC_AGREEMENT_SERVICE_ITEM_TAG_PREFIX;

export interface ServiceAgreementOakDocParty {
  contactId: string;
  name: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface ServiceAgreementOakDocFieldContext {
  values: Readonly<Record<string, string>>;
  signers?: readonly ServiceAgreementOakDocParty[];
  authorizedRepresentatives?: readonly ServiceAgreementOakDocParty[];
}

export interface ServiceAgreementOakDocFieldResolutionInput {
  docxBytes: Uint8Array;
  agreement: ServiceAgreementDraftDto;
  values: Readonly<Record<string, string>>;
  signers: readonly ServiceAgreementOakDocParty[];
  authorizedRepresentatives: readonly ServiceAgreementOakDocParty[];
}

export interface ServiceAgreementOakDocFieldResolutionResult {
  bytes: Uint8Array;
  updated: number;
  unresolvedTags: string[];
  repeatersResolved?: number;
  signaturesResolved?: number;
  diagnostics?: string[];
}

export interface ServiceAgreementOakDocFieldResolutionAdapter {
  resolve(
    input: ServiceAgreementOakDocFieldResolutionInput,
  ): ServiceAgreementOakDocFieldResolutionResult;
}

export interface ServiceAgreementOakDocResolvedService {
  itemId: string;
  serviceVariantId: string;
  variantVersion: number;
  familyName: string;
  variantName: string;
  sowPartialId: string;
  partialVersion: number;
  partialDependencies: ServiceAgreementItemDto['partialDependencySnapshot'];
  entityIds: string[];
  missingRequiredPlaceholders: string[];
  staleVariantVersion: boolean;
  stalePartialVersion: boolean;
}

export interface ServiceAgreementOakDocDiagnostic {
  code:
    | 'INVALID_DOCX'
    | 'MISSING_STRUCTURAL_SLOT'
    | 'DUPLICATE_STRUCTURAL_SLOT'
    | 'INVALID_STRUCTURAL_SLOT_LOCATION'
    | 'MISSING_REQUIRED_SERVICE_FIELD'
    | 'STALE_SERVICE_VARIANT'
    | 'STALE_SERVICE_WORDING'
    | 'GENERATED_DOCUMENT_MISMATCH'
    | 'CANONICAL_HASH_MISMATCH'
    | 'FIELD_RESOLUTION';
  severity: 'error' | 'warning' | 'info';
  message: string;
  itemId?: string;
  slot?: keyof typeof OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS;
}

export interface ServiceAgreementOakDocSignatureMarker {
  part: string;
  tag: string;
  index: number;
}

export interface ServiceAgreementOakDocRenderResult {
  bytes: Uint8Array;
  diagnostics: ServiceAgreementOakDocDiagnostic[];
  resolvedServices: ServiceAgreementOakDocResolvedService[];
  unresolved: {
    structuralSlots: Array<keyof typeof OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS>;
    fieldTags: string[];
    serviceItems: Array<{
      itemId: string;
      placeholders: string[];
    }>;
  };
  agreementMetadata: {
    agreementId: string;
    generatedDocumentId: string;
    canonicalHash: string;
    status: ServiceAgreementDraftDto['status'];
    feeLineCount: number;
    entityCount: number;
  };
  fieldResolution: {
    updated: number;
    repeatersResolved: number;
    signaturesResolved: number;
  };
  signatureMarkers: {
    markers: ServiceAgreementOakDocSignatureMarker[];
    signerContactIds: string[];
    providedSignerCount: number;
  };
}

function isWordElement(
  node: Node | null | undefined,
  localName: string,
): node is Element {
  return Boolean(
    node
      && node.nodeType === Node.ELEMENT_NODE
      && (node as Element).namespaceURI === WORD_NS
      && (node as Element).localName === localName,
  );
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

function serializeXml(xml: XMLDocument): Uint8Array {
  return encodeOakDocZipText(new XMLSerializer().serializeToString(xml));
}

function parseWordXml(bytes: Uint8Array): XMLDocument {
  const xml = new DOMParser().parseFromString(
    strFromU8(bytes),
    'application/xml',
  );
  if (xml.getElementsByTagName('parsererror').length > 0) {
    throw new Error('OakDoc could not parse word/document.xml.');
  }
  return xml;
}

function contentControlTag(sdt: Element): string {
  const properties = wordChild(sdt, 'sdtPr');
  return properties ? getWordVal(wordChild(properties, 'tag')) : '';
}

function isRendererOwnedTag(tag: string): boolean {
  return Object.values(SLOT_TAG_ALIASES).some((aliases) => aliases.includes(tag))
    || tag.startsWith(SERVICE_ITEM_TAG_PREFIX);
}

function defaultFieldResolver(
  input: ServiceAgreementOakDocFieldResolutionInput,
): ServiceAgreementOakDocFieldResolutionResult {
  const resolved = resolveOakDocFields(input.docxBytes, input.values);
  return {
    bytes: resolved.bytes,
    updated: resolved.updated,
    unresolvedTags: resolved.unresolvedTags.filter(
      (tag) => !isRendererOwnedTag(tag),
    ),
    repeatersResolved: 0,
    signaturesResolved: 0,
  };
}

export const DEFAULT_SERVICE_AGREEMENT_OAKDOC_FIELD_ADAPTER: ServiceAgreementOakDocFieldResolutionAdapter = {
  resolve: defaultFieldResolver,
};

function canonicalAgreementHash(agreement: ServiceAgreementDraftDto): string {
  return createHash('sha256')
    .update(canonicalJson(canonicalServiceAgreementData(agreement)))
    .digest('hex');
}


function escapeHtmlValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlSafeServiceContext(
  context: ReturnType<typeof buildServiceAgreementItemPlaceholderContext>,
): ReturnType<typeof buildServiceAgreementItemPlaceholderContext> {
  return {
    service: {
      ...context.service,
      familyName: escapeHtmlValue(context.service.familyName),
      variantName: escapeHtmlValue(context.service.variantName),
      entities: context.service.entities.map((entity) => ({
        ...entity,
        name: escapeHtmlValue(entity.name),
        uen: escapeHtmlValue(entity.uen),
      })),
      fields: Object.fromEntries(
        Object.entries(context.service.fields).map(([key, value]) => [
          key,
          escapeHtmlValue(value),
        ]),
      ),
    },
  };
}

function representativeParties(
  snapshots: readonly AuthorizedRepresentativeSnapshot[],
): ServiceAgreementOakDocParty[] {
  return snapshots.map((representative) => ({
    contactId: representative.id,
    name: representative.name,
    role: representative.role,
    email: representative.email,
    phone: representative.phone,
  }));
}

function serviceMetadata(
  agreement: ServiceAgreementDraftDto,
): ServiceAgreementOakDocResolvedService[] {
  return orderedServiceAgreementItems(agreement).map((item) => {
    const context = buildServiceAgreementItemPlaceholderContext({
      agreement,
      item,
    });
    return {
      itemId: item.id,
      serviceVariantId: item.serviceVariantId,
      variantVersion: item.variantVersion,
      familyName: item.familyNameSnapshot,
      variantName: item.variantNameSnapshot,
      sowPartialId: item.sowPartialId,
      partialVersion: item.partialVersion,
      partialDependencies: item.partialDependencySnapshot,
      entityIds: [...item.entityIds],
      missingRequiredPlaceholders: findMissingServiceAgreementItemPlaceholders({
        item,
        context,
      }),
      staleVariantVersion: item.staleVariantVersion,
      stalePartialVersion: item.stalePartialVersion,
    };
  });
}

function diagnosticForServices(
  services: readonly ServiceAgreementOakDocResolvedService[],
): ServiceAgreementOakDocDiagnostic[] {
  return services.flatMap((service) => {
    const diagnostics: ServiceAgreementOakDocDiagnostic[] = [];
    for (const placeholder of service.missingRequiredPlaceholders) {
      diagnostics.push({
        code: 'MISSING_REQUIRED_SERVICE_FIELD',
        severity: 'error',
        itemId: service.itemId,
        message: `Service item ${service.itemId} is missing required field ${placeholder}.`,
      });
    }
    if (service.staleVariantVersion) {
      diagnostics.push({
        code: 'STALE_SERVICE_VARIANT',
        severity: 'warning',
        itemId: service.itemId,
        message: `Service item ${service.itemId} was snapshotted from an older service variant version.`,
      });
    }
    if (service.stalePartialVersion) {
      diagnostics.push({
        code: 'STALE_SERVICE_WORDING',
        severity: 'warning',
        itemId: service.itemId,
        message: `Service item ${service.itemId} uses snapshotted SOW wording that is older than the current partial.`,
      });
    }
    return diagnostics;
  });
}

class WordIdAllocator {
  private nextId: number;

  constructor(document: XMLDocument) {
    const existing = Array.from(document.getElementsByTagNameNS(WORD_NS, 'id'))
      .map((element) => Number(getWordVal(element)))
      .filter((value) => Number.isInteger(value) && value >= 0);
    this.nextId = Math.max(100000, ...existing, 99999) + 1;
  }

  take(): number {
    const value = this.nextId;
    this.nextId += 1;
    return value;
  }
}

function createServiceItemControl(input: {
  document: XMLDocument;
  allocator: WordIdAllocator;
  agreement: ServiceAgreementDraftDto;
  item: ServiceAgreementItemDto;
  pageBreakBefore: boolean;
}): Element {
  const context = buildServiceAgreementItemPlaceholderContext({
    agreement: input.agreement,
    item: input.item,
  });
  const rendered = resolvePlaceholders(
    input.item.partialContentSnapshot,
    htmlSafeServiceContext(context),
    { missingPlaceholder: 'keep', dateFormat: 'dd MMMM yyyy' },
  );

  const wrapper = wordElement(input.document, 'sdt');
  const properties = wordElement(input.document, 'sdtPr');
  properties.appendChild(
    wordElement(input.document, 'alias', {
      val: `${input.item.variantNameSnapshot} | variant v${input.item.variantVersion} | SOW v${input.item.partialVersion}`,
    }),
  );
  properties.appendChild(
    wordElement(input.document, 'tag', {
      val: `${SERVICE_ITEM_TAG_PREFIX}${input.item.id}`,
    }),
  );
  properties.appendChild(
    wordElement(input.document, 'id', { val: String(input.allocator.take()) }),
  );
  wrapper.appendChild(properties);

  const content = wordElement(input.document, 'sdtContent');
  if (input.pageBreakBefore) {
    const pageBreak = wordElement(input.document, 'p');
    const paragraphProperties = wordElement(input.document, 'pPr');
    paragraphProperties.appendChild(wordElement(input.document, 'pageBreakBefore'));
    pageBreak.appendChild(paragraphProperties);
    content.appendChild(pageBreak);
  }
  for (const block of htmlToWordBlocks(input.document, rendered.resolved)) {
    content.appendChild(block);
  }
  wrapper.appendChild(content);
  return wrapper;
}

function rowProperties(
  document: XMLDocument,
  options: { header?: boolean; cantSplit?: boolean } = {},
): Element | null {
  if (!options.header && !options.cantSplit) return null;
  const properties = wordElement(document, 'trPr');
  if (options.header) properties.appendChild(wordElement(document, 'tblHeader'));
  if (options.cantSplit) properties.appendChild(wordElement(document, 'cantSplit'));
  return properties;
}

function createTableCell(input: {
  document: XMLDocument;
  width: number;
  text?: string;
  bold?: boolean;
  underline?: boolean;
  colspan?: number;
}): Element {
  const cell = wordElement(input.document, 'tc');
  const properties = wordElement(input.document, 'tcPr');
  properties.appendChild(
    wordElement(input.document, 'tcW', {
      w: String(input.width),
      type: 'dxa',
    }),
  );
  if (input.colspan && input.colspan > 1) {
    properties.appendChild(
      wordElement(input.document, 'gridSpan', { val: String(input.colspan) }),
    );
  }
  cell.appendChild(properties);
  const paragraph = wordElement(input.document, 'p');
  if (input.text !== undefined) {
    appendTextRun(input.document, paragraph, input.text, {
      bold: input.bold,
      underline: input.underline,
    });
  }
  cell.appendChild(paragraph);
  return cell;
}

function feeDisplay(fee: ServiceAgreementFeeLineDto): string {
  const frequency = formatServiceAgreementFrequency(fee);
  return [
    formatServiceAgreementCurrency(fee.amount, fee.currency),
    frequency,
  ].filter(Boolean).join(' ');
}

function createFeeTable(
  document: XMLDocument,
  agreement: ServiceAgreementDraftDto,
): Element {
  const table = wordElement(document, 'tbl');
  const width = 9000;
  const descriptionWidth = 6300;
  const feeWidth = 2700;

  const properties = wordElement(document, 'tblPr');
  properties.appendChild(wordElement(document, 'tblW', { w: String(width), type: 'dxa' }));
  properties.appendChild(wordElement(document, 'tblLayout', { type: 'fixed' }));
  properties.appendChild(
    wordElement(document, 'tblLook', {
      val: '04A0',
      firstRow: '1',
      lastRow: '0',
      firstColumn: '0',
      lastColumn: '0',
      noHBand: '0',
      noVBand: '1',
    }),
  );
  table.appendChild(properties);

  const grid = wordElement(document, 'tblGrid');
  grid.appendChild(wordElement(document, 'gridCol', { w: String(descriptionWidth) }));
  grid.appendChild(wordElement(document, 'gridCol', { w: String(feeWidth) }));
  table.appendChild(grid);

  const header = wordElement(document, 'tr');
  const headerProperties = rowProperties(document, { header: true, cantSplit: true });
  if (headerProperties) header.appendChild(headerProperties);
  header.appendChild(
    createTableCell({
      document,
      width: descriptionWidth,
      text: 'Description',
      bold: true,
    }),
  );
  header.appendChild(
    createTableCell({
      document,
      width: feeWidth,
      text: 'Fee',
      bold: true,
    }),
  );
  table.appendChild(header);

  const entities = orderedServiceAgreementEntities(agreement);
  const items = orderedServiceAgreementItems(agreement);
  let hasPreviousGroup = false;

  const appendFee = (fee: ServiceAgreementFeeLineDto) => {
    const row = wordElement(document, 'tr');
    const properties = rowProperties(document, { cantSplit: true });
    if (properties) row.appendChild(properties);
    row.appendChild(
      createTableCell({
        document,
        width: descriptionWidth,
        text: fee.description,
      }),
    );
    row.appendChild(
      createTableCell({
        document,
        width: feeWidth,
        text: feeDisplay(fee),
      }),
    );
    table.appendChild(row);
  };

  for (const entity of entities) {
    const fees = items.flatMap((item) =>
      [...item.feeLines]
        .sort((left, right) => left.displayOrder - right.displayOrder)
        .filter((fee) => fee.agreementEntityId === entity.id),
    );
    if (fees.length === 0) continue;

    if (hasPreviousGroup) {
      const spacer = wordElement(document, 'tr');
      const properties = rowProperties(document, { cantSplit: true });
      if (properties) spacer.appendChild(properties);
      spacer.appendChild(
        createTableCell({
          document,
          width,
          text: '',
          colspan: 2,
        }),
      );
      table.appendChild(spacer);
    }
    hasPreviousGroup = true;

    const group = wordElement(document, 'tr');
    const groupProperties = rowProperties(document, { cantSplit: true });
    if (groupProperties) group.appendChild(groupProperties);
    group.appendChild(
      createTableCell({
        document,
        width,
        text: entity.nameSnapshot,
        underline: true,
        colspan: 2,
      }),
    );
    table.appendChild(group);
    fees.forEach(appendFee);
  }

  const knownEntityIds = new Set(entities.map((entity) => entity.id));
  const orphanFees = items.flatMap((item) =>
    [...item.feeLines]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .filter((fee) => !knownEntityIds.has(fee.agreementEntityId)),
  );
  if (orphanFees.length > 0 && hasPreviousGroup) {
    const spacer = wordElement(document, 'tr');
    const properties = rowProperties(document, { cantSplit: true });
    if (properties) spacer.appendChild(properties);
    spacer.appendChild(
      createTableCell({
        document,
        width,
        text: '',
        colspan: 2,
      }),
    );
    table.appendChild(spacer);
  }
  orphanFees.forEach(appendFee);

  return table;
}

function createEntityAppendix(
  document: XMLDocument,
  agreement: ServiceAgreementDraftDto,
): Element[] {
  return orderedServiceAgreementEntities(agreement).map((entity, index) => {
    const paragraph = wordElement(document, 'p');
    const properties = wordElement(document, 'pPr');
    properties.appendChild(
      wordElement(document, 'ind', { left: '720', hanging: '360' }),
    );
    paragraph.appendChild(properties);
    appendTextRun(
      document,
      paragraph,
      `${index + 1}. ${entity.nameSnapshot} (UEN: ${entity.uenSnapshot})`,
    );
    return paragraph;
  });
}

function findSlotControls(
  document: XMLDocument,
  slot: keyof typeof OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS,
): Element[] {
  const aliases = SLOT_TAG_ALIASES[slot];
  return Array.from(document.getElementsByTagNameNS(WORD_NS, 'sdt'))
    .filter((sdt) => aliases.includes(contentControlTag(sdt)));
}

function replaceStructuralControl(
  control: Element,
  replacements: Element[],
): boolean {
  const parent = control.parentNode;
  if (!parent) return false;

  if (isWordElement(parent, 'p')) {
    const siblings = wordChildren(parent).filter(
      (child) => !isWordElement(child, 'pPr') && child !== control,
    );
    if (siblings.length > 0 || !parent.parentNode) return false;
    const paragraphParent = parent.parentNode;
    for (const replacement of replacements) {
      paragraphParent.insertBefore(replacement, parent);
    }
    paragraphParent.removeChild(parent);
    return true;
  }

  for (const replacement of replacements) {
    parent.insertBefore(replacement, control);
  }
  parent.removeChild(control);
  return true;
}

function wordXmlPartNames(files: Record<string, Uint8Array>): string[] {
  return Object.keys(files).filter(
    (name) => name === DOCUMENT_PART || /^word\/(header|footer)\d+\.xml$/i.test(name),
  );
}

function inspectSignatureMarkers(
  docxBytes: Uint8Array,
): ServiceAgreementOakDocSignatureMarker[] {
  const files = unzipSync(docxBytes);
  const markers: ServiceAgreementOakDocSignatureMarker[] = [];
  for (const part of wordXmlPartNames(files)) {
    const xml = parseWordXml(files[part]);
    let index = 0;
    for (const sdt of Array.from(xml.getElementsByTagNameNS(WORD_NS, 'sdt'))) {
      const tag = contentControlTag(sdt);
      if (!/signature/i.test(tag)) continue;
      markers.push({ part, tag, index });
      index += 1;
    }
  }
  return markers;
}

function slotDiagnostics(
  document: XMLDocument,
): {
  diagnostics: ServiceAgreementOakDocDiagnostic[];
  unresolved: Array<keyof typeof OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS>;
} {
  const diagnostics: ServiceAgreementOakDocDiagnostic[] = [];
  const unresolved: Array<keyof typeof OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS> = [];
  for (const slot of Object.keys(
    OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS,
  ) as Array<keyof typeof OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS>) {
    const controls = findSlotControls(document, slot);
    if (controls.length === 0) {
      unresolved.push(slot);
      diagnostics.push({
        code: 'MISSING_STRUCTURAL_SLOT',
        severity: 'error',
        slot,
        message: `OakDoc Service Agreement master is missing the ${OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS[slot]} structural control.`,
      });
    } else if (controls.length > 1) {
      unresolved.push(slot);
      diagnostics.push({
        code: 'DUPLICATE_STRUCTURAL_SLOT',
        severity: 'error',
        slot,
        message: `OakDoc Service Agreement master contains ${controls.length} ${OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS[slot]} structural controls; exactly one is required.`,
      });
    }
  }
  return { diagnostics, unresolved };
}

export function renderServiceAgreementOakDoc(input: {
  masterDocxBytes: Uint8Array;
  agreement: ServiceAgreementDraftDto;
  fieldContext: ServiceAgreementOakDocFieldContext;
  fieldResolver?: ServiceAgreementOakDocFieldResolutionAdapter;
  expectedGeneratedDocumentId?: string;
  expectedCanonicalHash?: string;
}): ServiceAgreementOakDocRenderResult {
  const agreementHash = canonicalAgreementHash(input.agreement);
  const services = serviceMetadata(input.agreement);
  const diagnostics = diagnosticForServices(services);
  const unresolvedServiceItems = services
    .filter((service) => service.missingRequiredPlaceholders.length > 0)
    .map((service) => ({
      itemId: service.itemId,
      placeholders: [...service.missingRequiredPlaceholders],
    }));
  const representatives = input.fieldContext.authorizedRepresentatives
    ? [...input.fieldContext.authorizedRepresentatives]
    : representativeParties(input.agreement.authorizedRepresentativeSnapshots);
  const signers = input.fieldContext.signers
    ? [...input.fieldContext.signers]
    : representatives.filter((representative) =>
        input.agreement.signerContactIds.includes(representative.contactId),
      );

  const baseMetadata = {
    agreementId: input.agreement.id,
    generatedDocumentId: input.agreement.generatedDocumentId,
    canonicalHash: agreementHash,
    status: input.agreement.status,
    feeLineCount: input.agreement.items.reduce(
      (total, item) => total + item.feeLines.length,
      0,
    ),
    entityCount: input.agreement.entities.length,
  };

  if (
    input.expectedGeneratedDocumentId
    && input.expectedGeneratedDocumentId !== input.agreement.generatedDocumentId
  ) {
    diagnostics.push({
      code: 'GENERATED_DOCUMENT_MISMATCH',
      severity: 'error',
      message: 'Service Agreement does not match the expected generated document.',
    });
  }
  if (
    input.expectedCanonicalHash
    && input.expectedCanonicalHash.toLowerCase() !== agreementHash
  ) {
    diagnostics.push({
      code: 'CANONICAL_HASH_MISMATCH',
      severity: 'error',
      message: 'Service Agreement structured hash no longer matches the expected canonical version.',
    });
  }

  if (
    diagnostics.some((diagnostic) =>
      diagnostic.code === 'GENERATED_DOCUMENT_MISMATCH'
      || diagnostic.code === 'CANONICAL_HASH_MISMATCH')
  ) {
    return {
      bytes: input.masterDocxBytes,
      diagnostics,
      resolvedServices: services,
      unresolved: {
        structuralSlots: [],
        fieldTags: [],
        serviceItems: unresolvedServiceItems,
      },
      agreementMetadata: baseMetadata,
      fieldResolution: {
        updated: 0,
        repeatersResolved: 0,
        signaturesResolved: 0,
      },
      signatureMarkers: {
        markers: inspectSignatureMarkers(input.masterDocxBytes),
        signerContactIds: [...input.agreement.signerContactIds],
        providedSignerCount: signers.length,
      },
    };
  }

  let files: Record<string, Uint8Array>;
  let xml: XMLDocument;
  try {
    files = unzipSync(input.masterDocxBytes);
    const documentBytes = files[DOCUMENT_PART];
    if (!documentBytes) throw new Error('This DOCX has no word/document.xml part.');
    xml = parseWordXml(documentBytes);
  } catch (error) {
    diagnostics.push({
      code: 'INVALID_DOCX',
      severity: 'error',
      message: error instanceof Error ? error.message : 'OakDoc master DOCX is invalid.',
    });
    return {
      bytes: input.masterDocxBytes,
      diagnostics,
      resolvedServices: services,
      unresolved: {
        structuralSlots: [],
        fieldTags: [],
        serviceItems: unresolvedServiceItems,
      },
      agreementMetadata: baseMetadata,
      fieldResolution: {
        updated: 0,
        repeatersResolved: 0,
        signaturesResolved: 0,
      },
      signatureMarkers: {
        markers: [],
        signerContactIds: [...input.agreement.signerContactIds],
        providedSignerCount: signers.length,
      },
    };
  }

  const slots = slotDiagnostics(xml);
  diagnostics.push(...slots.diagnostics);
  if (slots.unresolved.length > 0) {
    return {
      bytes: input.masterDocxBytes,
      diagnostics,
      resolvedServices: services,
      unresolved: {
        structuralSlots: slots.unresolved,
        fieldTags: [],
        serviceItems: unresolvedServiceItems,
      },
      agreementMetadata: baseMetadata,
      fieldResolution: {
        updated: 0,
        repeatersResolved: 0,
        signaturesResolved: 0,
      },
      signatureMarkers: {
        markers: inspectSignatureMarkers(input.masterDocxBytes),
        signerContactIds: [...input.agreement.signerContactIds],
        providedSignerCount: signers.length,
      },
    };
  }

  const allocator = new WordIdAllocator(xml);
  const serviceControls = orderedServiceAgreementItems(input.agreement).map(
    (item, index) =>
      createServiceItemControl({
        document: xml,
        allocator,
        agreement: input.agreement,
        item,
        pageBreakBefore: index > 0,
      }),
  );

  const replacements: Array<{
    slot: keyof typeof OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS;
    nodes: Element[];
  }> = [
    { slot: 'serviceSections', nodes: serviceControls },
    { slot: 'feeTable', nodes: [createFeeTable(xml, input.agreement)] },
    { slot: 'entityAppendix', nodes: createEntityAppendix(xml, input.agreement) },
  ];

  const structuralFailures: Array<keyof typeof OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS> = [];
  for (const replacement of replacements) {
    const [control] = findSlotControls(xml, replacement.slot);
    if (!control || !replaceStructuralControl(control, replacement.nodes)) {
      structuralFailures.push(replacement.slot);
      diagnostics.push({
        code: 'INVALID_STRUCTURAL_SLOT_LOCATION',
        severity: 'error',
        slot: replacement.slot,
        message: `The ${OAKDOC_SERVICE_AGREEMENT_SLOT_TAGS[replacement.slot]} structural control must be a block control or occupy its own paragraph.`,
      });
    }
  }

  if (structuralFailures.length > 0) {
    return {
      bytes: input.masterDocxBytes,
      diagnostics,
      resolvedServices: services,
      unresolved: {
        structuralSlots: structuralFailures,
        fieldTags: [],
        serviceItems: unresolvedServiceItems,
      },
      agreementMetadata: baseMetadata,
      fieldResolution: {
        updated: 0,
        repeatersResolved: 0,
        signaturesResolved: 0,
      },
      signatureMarkers: {
        markers: inspectSignatureMarkers(input.masterDocxBytes),
        signerContactIds: [...input.agreement.signerContactIds],
        providedSignerCount: signers.length,
      },
    };
  }

  files[DOCUMENT_PART] = serializeXml(xml);
  const structurallyResolvedBytes = zipSync(files, { level: 6 });
  const fieldAdapter =
    input.fieldResolver ?? DEFAULT_SERVICE_AGREEMENT_OAKDOC_FIELD_ADAPTER;
  const fieldResolution = fieldAdapter.resolve({
    docxBytes: structurallyResolvedBytes,
    agreement: input.agreement,
    values: input.fieldContext.values,
    signers,
    authorizedRepresentatives: representatives,
  });
  for (const message of fieldResolution.diagnostics ?? []) {
    diagnostics.push({
      code: 'FIELD_RESOLUTION',
      severity: 'warning',
      message,
    });
  }

  return {
    bytes: fieldResolution.bytes,
    diagnostics,
    resolvedServices: services,
    unresolved: {
      structuralSlots: [],
      fieldTags: [...fieldResolution.unresolvedTags],
      serviceItems: unresolvedServiceItems,
    },
    agreementMetadata: baseMetadata,
    fieldResolution: {
      updated: fieldResolution.updated,
      repeatersResolved: fieldResolution.repeatersResolved ?? 0,
      signaturesResolved: fieldResolution.signaturesResolved ?? 0,
    },
    signatureMarkers: {
      markers: inspectSignatureMarkers(fieldResolution.bytes),
      signerContactIds: [...input.agreement.signerContactIds],
      providedSignerCount: signers.length,
    },
  };
}
