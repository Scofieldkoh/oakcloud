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
