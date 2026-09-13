import {
  createScopedFieldIdentity,
  type FieldGrammarNode,
  type FieldInputDescriptor,
  type FieldOwnerScope,
  type FieldParserDiagnostic,
  type FieldSourceSpan,
  type LosslessStoredFieldDefinition,
  type ParsedTemplateFieldSyntax,
  type TypedFieldValue,
} from '@/lib/template-field-contract';
import { parseTemplateFields } from '@/lib/template-field-parser';
import {
  createFieldInputDescriptor,
  validateTypedFieldValue,
} from '@/lib/template-field-registry';
import type { CustomPlaceholderDefinition, PlaceholderValueType } from '@/types/placeholders';

/** F3 UX projections over the frozen F1/F2 parser, identity and value contracts. */

export type FieldAuthoringInputKind =
  | 'text'
  | 'multiline'
  | 'date'
  | 'number'
  | 'currency'
  | 'yes-no'
  | 'read-only';

export interface FieldAuthoringInputDescriptor {
  identity: string;
  scope: FieldOwnerScope;
  label: string;
  description?: string;
  sourceLabel?: string;
  storedType: string;
  inputKind: FieldAuthoringInputKind;
  required: boolean;
  defaultValue: TypedFieldValue;
  choices?: readonly { label: 'Yes' | 'No'; value: boolean }[];
  disabledReason?: string;
  validation: {
    kind: 'text' | 'iso-date' | 'exact-decimal' | 'boolean' | 'preserve-only';
    message?: string;
  };
}

export type FieldAuthoringValueResult =
  | { ok: true; value: TypedFieldValue }
  | { ok: false; code: 'required' | 'invalid-value' | 'read-only'; message: string };

const INPUT_KIND_BY_CONTROL: Readonly<Record<FieldInputDescriptor['control'], FieldAuthoringInputKind>> = {
  text: 'text',
  textarea: 'multiline',
  date: 'date',
  decimal: 'number',
  currency: 'currency',
  boolean: 'yes-no',
  'read-only': 'read-only',
};

const VALIDATION_BY_KIND: Readonly<Record<FieldAuthoringInputKind, FieldAuthoringInputDescriptor['validation']>> = {
  text: { kind: 'text' },
  multiline: { kind: 'text' },
  date: { kind: 'iso-date', message: 'Use a calendar date in YYYY-MM-DD form.' },
  number: { kind: 'exact-decimal', message: 'Enter a decimal value without changing its written precision.' },
  currency: { kind: 'exact-decimal', message: 'Enter the currency amount without changing its written precision.' },
  'yes-no': { kind: 'boolean', message: 'Choose Yes or No.' },
  'read-only': { kind: 'preserve-only', message: 'This legacy field is preserved but cannot be authored here.' },
};

export function createFieldAuthoringInputDescriptor(
  definition: LosslessStoredFieldDefinition,
  input: { description?: string; sourceLabel?: string } = {},
): FieldAuthoringInputDescriptor {
  const base = createFieldInputDescriptor(definition, input);
  const inputKind = INPUT_KIND_BY_CONTROL[base.control];
  return {
    identity: base.identity,
    scope: base.scope,
    label: base.label,
    ...(base.description ? { description: base.description } : {}),
    ...(base.sourceLabel ? { sourceLabel: base.sourceLabel } : {}),
    storedType: base.storedType,
    inputKind,
    required: base.required,
    defaultValue: base.defaultValue,
    ...(inputKind === 'yes-no'
      ? { choices: [{ label: 'Yes', value: true }, { label: 'No', value: false }] as const }
      : {}),
    ...(base.disabledReason ? { disabledReason: base.disabledReason } : {}),
    validation: VALIDATION_BY_KIND[inputKind],
  };
}

function invalidValue(descriptor: FieldAuthoringInputDescriptor): FieldAuthoringValueResult {
  return {
    ok: false,
    code: 'invalid-value',
    message: descriptor.validation.message ?? `Enter a valid value for ${descriptor.label}.`,
  };
}

export function parseFieldAuthoringInput(
  descriptor: FieldAuthoringInputDescriptor,
  raw: string | boolean | null | undefined,
): FieldAuthoringValueResult {
  if (descriptor.inputKind === 'read-only') {
    return { ok: false, code: 'read-only', message: descriptor.disabledReason ?? 'This field is read-only.' };
  }
  if (raw === null || raw === undefined || raw === '') {
    if (descriptor.required) return { ok: false, code: 'required', message: `${descriptor.label} is required.` };
    return { ok: true, value: raw === '' ? { kind: 'empty' } : { kind: 'missing' } };
  }

  let value: TypedFieldValue;
  switch (descriptor.inputKind) {
    case 'text':
      if (typeof raw !== 'string') return invalidValue(descriptor);
      value = { kind: 'text', value: raw };
      break;
    case 'multiline':
      if (typeof raw !== 'string') return invalidValue(descriptor);
      value = { kind: 'multiline', value: raw };
      break;
    case 'date':
      if (typeof raw !== 'string') return invalidValue(descriptor);
      value = { kind: 'date', value: raw };
      break;
    case 'number':
      if (typeof raw !== 'string') return invalidValue(descriptor);
      value = { kind: 'number', value: raw };
      break;
    case 'currency':
      if (typeof raw !== 'string') return invalidValue(descriptor);
      value = { kind: 'currency', value: raw };
      break;
    case 'yes-no':
      if (typeof raw !== 'boolean') return invalidValue(descriptor);
      value = { kind: 'boolean', value: raw };
      break;
    case 'read-only':
      return { ok: false, code: 'read-only', message: 'This field is read-only.' };
  }
  return validateTypedFieldValue(value) ? { ok: true, value } : invalidValue(descriptor);
}

export interface FieldKeyDraft {
  label: string;
  key: string;
  keyMode: 'generated' | 'manual';
}

export function normalizeAuthoringFieldKey(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

export function createFieldKeyDraft(input: { label?: string; key?: string } = {}): FieldKeyDraft {
  const label = input.label ?? '';
  const manual = typeof input.key === 'string';
  return { label, key: manual ? input.key ?? '' : normalizeAuthoringFieldKey(label), keyMode: manual ? 'manual' : 'generated' };
}

export function updateFieldKeyDraftLabel(draft: FieldKeyDraft, label: string): FieldKeyDraft {
  return { ...draft, label, key: draft.keyMode === 'generated' ? normalizeAuthoringFieldKey(label) : draft.key };
}

export function updateFieldKeyDraftKey(draft: FieldKeyDraft, key: string): FieldKeyDraft {
  return { ...draft, key, keyMode: 'manual' };
}

export function commitFieldKeyDraft(draft: FieldKeyDraft): FieldKeyDraft {
  return { ...draft, label: draft.label.trim(), key: normalizeAuthoringFieldKey(draft.key) };
}

export type FieldAvailability = { status: 'available' } | { status: 'unavailable'; reason: string };

export interface FieldDiscoveryDescriptor {
  identity: string;
  key: string;
  expression: string;
  label: string;
  description: string;
  sourceLabel: string;
  typeLabel: string;
  groupKey: string;
  groupLabel: string;
  valueSummary?: string;
  defaultSummary?: string;
  availability: FieldAvailability;
}

export interface CatalogFieldDiscoveryInput {
  key: string;
  label: string;
  category: string;
  example?: string;
  description?: string;
  sourceLabel?: string;
  valueType?: PlaceholderValueType;
  availabilityReason?: string;
}

const TYPE_LABELS: Readonly<Record<PlaceholderValueType, string>> = {
  text: 'Text', textarea: 'Long text', date: 'Date', number: 'Number', currency: 'Currency', boolean: 'Yes / No',
};
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  company: 'Company record', contact: 'Contact record', officer: 'Officer record', shareholder: 'Shareholder record', service: 'Service', custom: 'Custom', system: 'System',
};

export function inferCatalogFieldValueType(field: Pick<CatalogFieldDiscoveryInput, 'key' | 'category'>): PlaceholderValueType {
  if (/date$/i.test(field.key)) return 'date';
  if (/numberOfShares$/i.test(field.key)) return 'number';
  if (/capital$/i.test(field.key)) return 'currency';
  return 'text';
}

export function createCatalogFieldDiscoveryDescriptor(field: CatalogFieldDiscoveryInput): FieldDiscoveryDescriptor {
  const valueType = field.valueType ?? inferCatalogFieldValueType(field);
  const unavailableReason = field.availabilityReason ?? (field.category === 'Modifiers'
    ? 'Select an existing valid field first. Modifier application is owned by the editor field controls.'
    : undefined);
  return {
    identity: `catalog-field:v1:${encodeURIComponent(field.key)}`,
    key: field.key,
    expression: field.category === 'Modifiers' || field.key.startsWith('{{') ? field.key : `{{${field.key}}}`,
    label: field.label,
    description: field.description ?? (field.category === 'System'
      ? `${field.label} supplied by the existing document generation system.`
      : field.category === 'Modifiers'
        ? `${field.label} transforms an existing field value without changing field identity.`
        : `${field.label} supplied from the ${field.category.toLowerCase()} document context.`),
    sourceLabel: field.sourceLabel ?? field.category,
    typeLabel: field.category === 'Modifiers' ? 'Modifier' : TYPE_LABELS[valueType],
    groupKey: field.category.toLowerCase().replace(/\s+/g, '-'),
    groupLabel: field.category,
    ...(field.example ? { valueSummary: field.example } : {}),
    availability: unavailableReason ? { status: 'unavailable', reason: unavailableReason } : { status: 'available' },
  };
}

function customFieldPath(field: CustomPlaceholderDefinition): string {
  if (field.storageSource === 'service') return field.storagePath ?? field.key;
  return field.key.startsWith('custom.') ? field.key : `custom.${field.key}`;
}

export function stableCustomFieldIdentity(
  field: CustomPlaceholderDefinition,
  fallbackScope: FieldOwnerScope = { kind: 'template', id: 'field-library' },
): string {
  if (field.fieldIdentity) return field.fieldIdentity;
  return createScopedFieldIdentity({
    scope: field.ownerScope ?? fallbackScope,
    key: customFieldPath(field),
    persistedId: field.storagePersistedId ?? field.id,
  });
}

export function createCustomFieldDiscoveryDescriptor(
  field: CustomPlaceholderDefinition,
  fallbackScope?: FieldOwnerScope,
): FieldDiscoveryDescriptor {
  const key = customFieldPath(field);
  const storedType = field.storedType ?? field.type;
  const source = field.storageSource ?? 'custom';
  const unavailableReason = field.preserveOnly ? `Legacy field type "${storedType}" is preserve-only.` : undefined;
  const defaultSummary = field.defaultValue === undefined
    ? 'No default'
    : field.type === 'boolean'
      ? field.defaultValue === 'true' ? 'Yes' : field.defaultValue === 'false' ? 'No' : field.defaultValue
      : field.defaultValue;
  return {
    identity: stableCustomFieldIdentity(field, fallbackScope),
    key,
    expression: `{{${key}}}`,
    label: field.label,
    description: field.description?.trim() || (source === 'service' ? 'Provided by the existing service field source.' : 'Requested during document generation.'),
    sourceLabel: SOURCE_LABELS[source] ?? field.storageRawSource ?? source,
    typeLabel: field.preserveOnly ? storedType : TYPE_LABELS[field.type],
    groupKey: source === 'service' ? 'service-fields' : 'custom',
    groupLabel: source === 'service' ? 'Service fields' : 'Custom',
    defaultSummary,
    availability: unavailableReason ? { status: 'unavailable', reason: unavailableReason } : { status: 'available' },
  };
}

export function formatTypedFieldValueSummary(value: TypedFieldValue): string {
  switch (value.kind) {
    case 'missing': return 'No default';
    case 'empty': return 'Empty';
    case 'boolean': return value.value ? 'Yes' : 'No';
    case 'legacy': return `Legacy ${value.declaredType} value`;
    default: return value.value;
  }
}

export function filterFieldDiscovery(fields: readonly FieldDiscoveryDescriptor[], query: string): readonly FieldDiscoveryDescriptor[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return fields;
  return fields.filter((field) => [field.label, field.description, field.sourceLabel, field.typeLabel, field.groupLabel]
    .some((value) => value.toLocaleLowerCase().includes(normalized)));
}

export function reconcileRecentFieldIdentities(
  recents: readonly string[],
  availableFields: readonly Pick<FieldDiscoveryDescriptor, 'identity'>[],
): readonly string[] {
  const available = new Set(availableFields.map((field) => field.identity));
  return recents.filter((identity, index) => available.has(identity) && recents.indexOf(identity) === index);
}

export function pushRecentFieldIdentity(
  recents: readonly string[], identity: string, availableFields: readonly Pick<FieldDiscoveryDescriptor, 'identity'>[], limit = 5,
): readonly string[] {
  return reconcileRecentFieldIdentities([identity, ...recents.filter((candidate) => candidate !== identity)], availableFields).slice(0, limit);
}

export interface AtomicFieldReference {
  identity: string;
  occurrenceId: string;
  path: string;
  span: FieldSourceSpan;
  sourceText: string;
}

function definitionPaths(definition: LosslessStoredFieldDefinition): readonly string[] {
  return [...new Set([definition.key, definition.resolverPath, definition.path].filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function definitionForPath(registry: readonly LosslessStoredFieldDefinition[] | undefined, path: string): LosslessStoredFieldDefinition | undefined {
  return registry?.find((definition) => definitionPaths(definition).includes(path));
}

export function collectAtomicFieldReferences(input: {
  content: string;
  scope: FieldOwnerScope;
  registry?: readonly LosslessStoredFieldDefinition[];
}): readonly AtomicFieldReference[] {
  const parsed = parseTemplateFields({
    content: input.content,
    scope: input.scope,
    registry: input.registry,
    knownPaths: input.registry?.flatMap((definition) => definitionPaths(definition)),
  });
  return parsed.nodes.flatMap((node) => {
    if (node.kind !== 'reference' || !node.path) return [];
    const definition = definitionForPath(input.registry, node.path);
    return [{
      identity: definition?.identity ?? createScopedFieldIdentity({ scope: input.scope, key: node.path }),
      occurrenceId: node.occurrenceId,
      path: node.path,
      span: node.span,
      sourceText: node.span.raw,
    } satisfies AtomicFieldReference];
  });
}

export interface AtomicFieldClipboardPayload { text: string }

export function createAtomicFieldClipboardPayload(reference: AtomicFieldReference): AtomicFieldClipboardPayload {
  return { text: reference.sourceText };
}

export function parseAtomicFieldPaste(input: {
  text: string;
  /** Presentation HTML is deliberately ignored so attributes cannot mint identity. */
  html?: string;
  scope: FieldOwnerScope;
  registry?: readonly LosslessStoredFieldDefinition[];
}): AtomicFieldReference | null {
  const references = collectAtomicFieldReferences({ content: input.text, scope: input.scope, registry: input.registry });
  if (references.length !== 1) return null;
  const [reference] = references;
  return reference.span.start === 0 && reference.span.end === input.text.length ? reference : null;
}

export function serializeAtomicFieldReference(reference: AtomicFieldReference): string {
  return reference.sourceText;
}

export function expandAtomicFieldEditRange(
  references: readonly AtomicFieldReference[], requested: { start: number; end: number },
): { start: number; end: number } {
  let start = Math.min(requested.start, requested.end);
  let end = Math.max(requested.start, requested.end);
  let changed = true;
  while (changed) {
    changed = false;
    for (const reference of references) {
      const intersects = start === end
        ? start > reference.span.start && start < reference.span.end
        : start < reference.span.end && end > reference.span.start;
      if (!intersects) continue;
      const nextStart = Math.min(start, reference.span.start);
      const nextEnd = Math.max(end, reference.span.end);
      if (nextStart !== start || nextEnd !== end) {
        start = nextStart;
        end = nextEnd;
        changed = true;
      }
    }
  }
  return { start, end };
}

export function createModifierExpression(reference: AtomicFieldReference, modifier: string): string {
  if (!/^[A-Z_]+$/.test(modifier)) throw new TypeError('Unsupported field modifier.');
  return `${modifier}({{${reference.path}}})`;
}

export interface FieldOccurrenceLocation {
  occurrenceId: string;
  span: FieldSourceSpan;
  line: number;
  column: number;
  label: string;
}

export interface FieldUsageSummary {
  identity: string;
  count: number;
  locations: readonly FieldOccurrenceLocation[];
}

function sourceLineColumn(source: string, offset: number): { line: number; column: number } {
  const lines = source.slice(0, Math.max(0, offset)).split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function locationForNode(source: string, node: Pick<FieldGrammarNode, 'occurrenceId' | 'span'>): FieldOccurrenceLocation {
  const position = sourceLineColumn(source, node.span.start);
  return { occurrenceId: node.occurrenceId, span: node.span, ...position, label: `Line ${position.line}, column ${position.column}` };
}

export function collectFieldUsage(input: {
  content: string;
  scope: FieldOwnerScope;
  path: string;
  identity?: string;
  registry?: readonly LosslessStoredFieldDefinition[];
}): FieldUsageSummary {
  const parsed = parseTemplateFields({ content: input.content, scope: input.scope, registry: input.registry, knownPaths: [input.path] });
  const nodes = parsed.nodes.filter((node) => node.kind === 'reference' && node.path === input.path);
  return {
    identity: input.identity ?? createScopedFieldIdentity({ scope: input.scope, key: input.path }),
    count: nodes.length,
    locations: nodes.map((node) => locationForNode(input.content, node)),
  };
}

export interface FieldDeletionPreview {
  identity: string;
  usageCount: number | null;
  locations: readonly FieldOccurrenceLocation[];
  requiresReferenceDecision: boolean;
}

export function createFieldDeletionPreview(input: { identity: string; usage?: FieldUsageSummary }): FieldDeletionPreview {
  return {
    identity: input.identity,
    usageCount: input.usage?.count ?? null,
    locations: input.usage?.locations ?? [],
    requiresReferenceDecision: input.usage ? input.usage.count > 0 : true,
  };
}

export interface FieldDiagnosticNavigationTarget {
  diagnostic: FieldParserDiagnostic;
  occurrenceId?: string;
  line: number;
  column: number;
  label: string;
}

function containingOccurrence(nodes: readonly FieldGrammarNode[], diagnostic: FieldParserDiagnostic): FieldGrammarNode | undefined {
  return nodes.find((node) => node.span.start <= diagnostic.span.start && node.span.end >= diagnostic.span.end)
    ?? nodes.find((node) => node.span.start < diagnostic.span.end && node.span.end > diagnostic.span.start);
}

export function createFieldDiagnosticNavigationTargets(parsed: ParsedTemplateFieldSyntax): readonly FieldDiagnosticNavigationTarget[] {
  return parsed.diagnostics.map((diagnostic) => {
    const occurrence = containingOccurrence(parsed.nodes, diagnostic);
    const position = sourceLineColumn(parsed.source, diagnostic.span.start);
    return {
      diagnostic,
      ...(occurrence ? { occurrenceId: occurrence.occurrenceId } : {}),
      ...position,
      label: `Line ${position.line}, column ${position.column}: ${diagnostic.message}`,
    };
  });
}

export function parseFieldDiagnosticsForNavigation(input: {
  content: string;
  scope: FieldOwnerScope;
  registry?: readonly LosslessStoredFieldDefinition[];
  knownPaths?: readonly string[];
}): readonly FieldDiagnosticNavigationTarget[] {
  return createFieldDiagnosticNavigationTargets(parseTemplateFields(input));
}
