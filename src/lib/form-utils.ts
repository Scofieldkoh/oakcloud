export interface PublicFormField {
  id: string;
  type: string;
  label: string | null;
  key: string;
  placeholder: string | null;
  subtext: string | null;
  helpText: string | null;
  inputType: string | null;
  options: unknown;
  validation: unknown;
  condition: unknown;
  isRequired: boolean;
  hideLabel: boolean;
  isReadOnly: boolean;
  layoutWidth: number;
  position: number;
}

export interface PublicFormDefinition {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  settings?: unknown;
  fields: PublicFormField[];
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export const WIDTH_CLASS: Record<number, string> = {
  25: 'col-span-12 md:col-span-3',
  33: 'col-span-12 md:col-span-4',
  50: 'col-span-12 md:col-span-6',
  66: 'col-span-12 md:col-span-8',
  75: 'col-span-12 md:col-span-9',
  100: 'col-span-12',
};

export function normalizeKey(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!cleaned) return 'field';
  if (/^[a-z]/.test(cleaned)) return cleaned;
  return `field_${cleaned}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export const RESPONSE_COLUMN_SUBMITTED_ID = '__submitted';
export const RESPONSE_COLUMN_STATUS_ID = '__status';
const RESPONSE_COLUMN_MIN_WIDTH = 120;
const RESPONSE_COLUMN_MAX_WIDTH = 900;

export interface FormResponseTableSettings {
  summaryFieldKeys: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
}

export function isSummaryEligibleFieldType(fieldType: string): boolean {
  return !['PAGE_BREAK', 'PARAGRAPH', 'HTML', 'HIDDEN'].includes(fieldType);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
  }

  return Array.from(unique);
}

export function clampResponseColumnWidth(width: number): number {
  if (!Number.isFinite(width)) return RESPONSE_COLUMN_MIN_WIDTH;
  return Math.min(RESPONSE_COLUMN_MAX_WIDTH, Math.max(RESPONSE_COLUMN_MIN_WIDTH, Math.round(width)));
}

export function normalizeResponseColumnOrder(baseColumnIds: string[], preferredOrder?: string[]): string[] {
  const allowed = new Set(baseColumnIds);
  const ordered: string[] = [];

  for (const id of preferredOrder || []) {
    if (!allowed.has(id)) continue;
    if (ordered.includes(id)) continue;
    ordered.push(id);
  }

  for (const id of baseColumnIds) {
    if (!ordered.includes(id)) {
      ordered.push(id);
    }
  }

  return ordered;
}

export function sanitizeResponseColumnWidths(
  columnWidths: Record<string, number>,
  allowedColumnIds: string[]
): Record<string, number> {
  const allowed = new Set(allowedColumnIds);
  const sanitized: Record<string, number> = {};

  for (const [key, value] of Object.entries(columnWidths)) {
    if (!allowed.has(key)) continue;
    if (!Number.isFinite(value)) continue;
    sanitized[key] = clampResponseColumnWidth(value);
  }

  return sanitized;
}

export function parseFormResponseTableSettings(settings: unknown): FormResponseTableSettings {
  const root = parseObject(settings);
  const responseTable = parseObject(root?.responseTable);

  const summaryFieldKeys = normalizeStringArray(responseTable?.summaryFieldKeys);
  const columnOrder = normalizeStringArray(responseTable?.columnOrder);
  const rawWidths = parseObject(responseTable?.columnWidths);
  const columnWidths: Record<string, number> = {};

  if (rawWidths) {
    for (const [key, value] of Object.entries(rawWidths)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      columnWidths[key] = clampResponseColumnWidth(value);
    }
  }

  return {
    summaryFieldKeys,
    columnOrder,
    columnWidths,
  };
}

export function writeFormResponseTableSettings(
  settings: unknown,
  responseTable: FormResponseTableSettings
): Record<string, unknown> {
  const root = parseObject(settings) ? { ...(settings as Record<string, unknown>) } : {};
  root.responseTable = {
    summaryFieldKeys: [...responseTable.summaryFieldKeys],
    columnOrder: [...responseTable.columnOrder],
    columnWidths: { ...responseTable.columnWidths },
  };
  return root;
}

export function parseOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function evaluateCondition(
  condition: unknown,
  answers: Record<string, unknown>
): boolean {
  if (!condition) return true;
  const cond = isRecord(condition) ? condition : null;
  if (!cond) return true;

  const fieldKey = typeof cond.fieldKey === 'string' ? cond.fieldKey : null;
  const operator = typeof cond.operator === 'string' ? cond.operator : null;

  if (!fieldKey || !operator) return true;

  const actual = answers[fieldKey];
  const expected = cond.value;

  switch (operator) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(expected);
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      return false;
    case 'is_empty':
      return isEmptyValue(actual);
    case 'not_empty':
      return !isEmptyValue(actual);
    default:
      return true;
  }
}
