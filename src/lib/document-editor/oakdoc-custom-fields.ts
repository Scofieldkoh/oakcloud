import { formatOakDocDate, oakDocIsoDate } from '@/lib/document-editor/oakdoc-context';
import type { PlaceholderValueType } from '@/types/placeholders';

/**
 * Custom fields on Word (OakDoc) templates and partials.
 *
 * A custom field is defined on the template or partial (label, type,
 * required, dropdown choices) and stored in its `placeholders` as a
 * `custom.<key>` definition, the same shape Configure already prompts for.
 * The document carries a `custom.<key>` content control; generation fills
 * it with the value entered on Configure (or Shared setup when several
 * documents in a batch use the same field).
 */

export const OAKDOC_CUSTOM_FIELD_PREFIX = 'custom.';

const CUSTOM_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;

export function isOakDocCustomFieldTag(tag: string): boolean {
  return tag.startsWith(OAKDOC_CUSTOM_FIELD_PREFIX)
    && CUSTOM_KEY.test(tag.slice(OAKDOC_CUSTOM_FIELD_PREFIX.length));
}

export function oakDocCustomFieldTag(key: string): string {
  return `${OAKDOC_CUSTOM_FIELD_PREFIX}${key}`;
}

/** Types offered when defining a custom field. A dropdown is stored as text with choices. */
export type OakDocCustomFieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'number'
  | 'currency'
  | 'dropdown';

export const OAKDOC_CUSTOM_FIELD_TYPES: ReadonlyArray<{ value: OakDocCustomFieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Multi-line text' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Amount' },
  { value: 'dropdown', label: 'Dropdown' },
];

export interface OakDocCustomField {
  key: string;
  label: string;
  type: OakDocCustomFieldType;
  required: boolean;
  /** Dropdown choices, in display order. */
  options?: string[];
}

/** Marks a definition copied from an inserted partial; recomputed on every template save. */
export const OAKDOC_PARTIAL_FIELD_MARKER = 'oakDocPartialId';

type StoredDefinition = Record<string, unknown>;

function isRecord(value: unknown): value is StoredDefinition {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function storedKey(definition: StoredDefinition): string | null {
  const key = typeof definition.key === 'string' ? definition.key.trim() : '';
  const bare = key.startsWith(OAKDOC_CUSTOM_FIELD_PREFIX)
    ? key.slice(OAKDOC_CUSTOM_FIELD_PREFIX.length)
    : definition.source === 'custom' || definition.category === 'custom'
      ? key
      : '';
  return CUSTOM_KEY.test(bare) ? bare : null;
}

/** Dropdown choices stored on a definition, trimmed and without duplicates. */
export function readPlaceholderOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const option of options) {
    const text = typeof option === 'string'
      ? option.trim()
      : isRecord(option) && typeof option.value === 'string'
        ? option.value.trim()
        : '';
    if (text && !seen.has(text)) {
      seen.add(text);
      result.push(text);
    }
  }
  return result;
}

function fieldType(definition: StoredDefinition): OakDocCustomFieldType {
  const options = readPlaceholderOptions(definition.options);
  const type = definition.type;
  if (options.length > 0 && (type === 'text' || type === 'dropdown' || type === 'select')) return 'dropdown';
  if (type === 'textarea' || type === 'date' || type === 'number' || type === 'currency') return type;
  return 'text';
}

function isPartialCopy(definition: StoredDefinition): boolean {
  return typeof definition[OAKDOC_PARTIAL_FIELD_MARKER] === 'string';
}

/** Custom fields a template or partial defines itself (not copies from its partials). */
export function readOakDocCustomFields(placeholders: unknown): OakDocCustomField[] {
  if (!Array.isArray(placeholders)) return [];
  const seen = new Set<string>();
  const fields: OakDocCustomField[] = [];
  for (const definition of placeholders) {
    if (!isRecord(definition) || isPartialCopy(definition)) continue;
    const key = storedKey(definition);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const type = fieldType(definition);
    fields.push({
      key,
      label: typeof definition.label === 'string' && definition.label.trim() ? definition.label.trim() : key,
      type,
      required: definition.required === true,
      ...(type === 'dropdown' ? { options: readPlaceholderOptions(definition.options) } : {}),
    });
  }
  return fields;
}

/** Custom fields copied onto a template from the partials it inserts. */
export function readOakDocPartialCustomFields(placeholders: unknown): Array<OakDocCustomField & { partialId: string }> {
  if (!Array.isArray(placeholders)) return [];
  return placeholders.flatMap((definition) => {
    if (!isRecord(definition) || !isPartialCopy(definition)) return [];
    const [field] = readOakDocCustomFields([{ ...definition, [OAKDOC_PARTIAL_FIELD_MARKER]: undefined }]);
    return field ? [{ ...field, partialId: String(definition[OAKDOC_PARTIAL_FIELD_MARKER]) }] : [];
  });
}

function storedType(type: OakDocCustomFieldType): PlaceholderValueType {
  return type === 'dropdown' ? 'text' : type;
}

function toStoredDefinition(
  field: OakDocCustomField,
  previous: StoredDefinition | undefined,
): StoredDefinition {
  const tag = oakDocCustomFieldTag(field.key);
  const next: StoredDefinition = {
    ...(previous ?? {}),
    key: tag,
    path: tag,
    label: field.label.trim() || field.key,
    type: storedType(field.type),
    source: 'custom',
    category: 'custom',
    required: field.required,
  };
  const options = field.type === 'dropdown' ? readPlaceholderOptions(field.options) : [];
  if (options.length > 0) next.options = options;
  else delete next.options;
  return next;
}

/**
 * Replace the own custom fields in a stored placeholder list. Other stored
 * definitions (and copies from partials) are kept as they are, and an
 * edited field keeps its stored identity and any extra metadata.
 */
export function writeOakDocCustomFields(
  placeholders: unknown,
  fields: readonly OakDocCustomField[],
): StoredDefinition[] {
  const existing = Array.isArray(placeholders) ? placeholders.filter(isRecord) : [];
  const ownByKey = new Map<string, StoredDefinition>();
  const kept: StoredDefinition[] = [];
  for (const definition of existing) {
    const key = storedKey(definition);
    if (key && !isPartialCopy(definition)) {
      if (!ownByKey.has(key)) ownByKey.set(key, definition);
    } else {
      kept.push(definition);
    }
  }
  return [
    ...fields.map((field) => toStoredDefinition(field, ownByKey.get(field.key))),
    ...kept,
  ];
}

function partialFieldCopies(
  partials: ReadonlyArray<{ id: string; placeholders: unknown }>,
  taken: Set<string>,
): StoredDefinition[] {
  const copies: StoredDefinition[] = [];
  for (const partial of partials) {
    const fields = [
      ...readOakDocCustomFields(partial.placeholders),
      ...readOakDocPartialCustomFields(partial.placeholders),
    ];
    for (const field of fields) {
      if (taken.has(field.key)) continue;
      taken.add(field.key);
      copies.push({
        ...toStoredDefinition(field, undefined),
        [OAKDOC_PARTIAL_FIELD_MARKER]: partial.id,
      });
    }
  }
  return copies;
}

/**
 * Copy the custom fields of inserted partials onto a template's placeholders,
 * so Configure prompts for them. Fields the template defines itself win;
 * copies from partials no longer inserted are dropped.
 */
export function mergeOakDocPartialCustomFields(
  placeholders: unknown,
  partials: ReadonlyArray<{ id: string; placeholders: unknown }>,
): StoredDefinition[] {
  const existing = Array.isArray(placeholders) ? placeholders.filter(isRecord) : [];
  const own = existing.filter((definition) => !isPartialCopy(definition));
  const taken = new Set(readOakDocCustomFields(own).map((field) => field.key));
  return [...own, ...partialFieldCopies(partials, taken)];
}

/**
 * Add the custom fields of partials chosen for one document (numbered
 * resolutions) to its template's placeholders. Everything the template
 * already carries is kept and wins on a shared key.
 */
export function appendOakDocPartialCustomFields(
  placeholders: unknown,
  partials: ReadonlyArray<{ id: string; placeholders: unknown }>,
): StoredDefinition[] {
  const existing = Array.isArray(placeholders) ? placeholders.filter(isRecord) : [];
  const taken = new Set([
    ...readOakDocCustomFields(existing).map((field) => field.key),
    ...readOakDocPartialCustomFields(existing).map((field) => field.key),
  ]);
  return [...existing, ...partialFieldCopies(partials, taken)];
}

/** A key for a new field from its label: "Fee amount" -> fee_amount. */
export function oakDocCustomFieldKeyFromLabel(label: string, taken: ReadonlySet<string>): string {
  const base = label
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const stem = (!base ? 'field' : CUSTOM_KEY.test(base) ? base : `field_${base}`).slice(0, 60);
  let key = stem;
  for (let counter = 2; taken.has(key); counter += 1) key = `${stem}_${counter}`;
  return key;
}

const EXACT_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function groupDigits(value: string, minimumDecimals: number): string {
  const text = value.trim().replace(/,/g, '');
  if (!EXACT_DECIMAL.test(text)) return value.trim();
  const negative = text.startsWith('-');
  const unsigned = text.replace(/^[+-]/, '');
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const grouped = (whole.replace(/^0+(?=\d)/, '') || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = fraction.length >= minimumDecimals ? fraction : fraction.padEnd(minimumDecimals, '0');
  return `${negative ? '-' : ''}${grouped}${decimals ? `.${decimals}` : ''}`;
}

/** The text a custom field prints, from the value entered on Configure. */
export function formatOakDocCustomFieldValue(value: unknown, type: PlaceholderValueType | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) return formatOakDocDate(value) ?? '';
  const text = String(value);
  if (!text.trim()) return '';
  switch (type) {
    case 'date':
      return formatOakDocDate(text.trim()) ?? text;
    case 'number':
      return groupDigits(text, 0);
    case 'currency':
      return groupDigits(text, 2);
    case 'boolean':
      return text === 'true' || text === '1' ? 'Yes' : text === 'false' || text === '0' ? 'No' : text;
    default:
      return text;
  }
}

/** Values and calendar dates for the custom field controls in a document. */
export function buildOakDocCustomFieldValues(input: {
  tags: readonly string[];
  data: Readonly<Record<string, unknown>>;
  types: Readonly<Record<string, PlaceholderValueType>>;
}): { values: Record<string, string>; dates: Record<string, string> } {
  const values: Record<string, string> = {};
  const dates: Record<string, string> = {};
  for (const tag of new Set(input.tags)) {
    if (!isOakDocCustomFieldTag(tag)) continue;
    const key = tag.slice(OAKDOC_CUSTOM_FIELD_PREFIX.length);
    const raw = input.data[key];
    const type = input.types[key];
    values[tag] = formatOakDocCustomFieldValue(raw, type);
    if (type === 'date') {
      const iso = oakDocIsoDate(raw);
      if (iso) dates[tag] = iso;
    }
  }
  return { values, dates };
}

/** Stored value type of every custom field a template defines or copies from its partials. */
export function oakDocCustomFieldTypes(placeholders: unknown): Record<string, PlaceholderValueType> {
  const types: Record<string, PlaceholderValueType> = {};
  if (!Array.isArray(placeholders)) return types;
  for (const definition of placeholders) {
    if (!isRecord(definition)) continue;
    const key = storedKey(definition);
    if (key && !(key in types)) types[key] = storedType(fieldType(definition));
  }
  return types;
}
