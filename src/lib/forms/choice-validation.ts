import { parseChoiceOptions, parseObject } from '@/lib/form-utils';

type MultipleChoiceField = {
  type: string;
  key?: string;
  label?: string | null;
  options?: unknown;
  validation?: unknown;
};

/**
 * Validate a minimum count of DISTINCT, configured checkbox choices.
 * Unknown/forged values never count towards the minimum.
 */
export function getMinSelectedChoicesError(field: MultipleChoiceField, value: unknown): string | null {
  if (field.type !== 'MULTIPLE_CHOICE') return null;
  const rawMinimum = parseObject(field.validation)?.minSelectedOptions;
  if (typeof rawMinimum !== 'number' || !Number.isInteger(rawMinimum) || rawMinimum < 1) return null;

  const allowed = new Set(parseChoiceOptions(field.options).map((option) => option.value));
  const selected = new Set<string>();
  for (const entry of Array.isArray(value) ? value : []) {
    const optionValue = typeof entry === 'string'
      ? entry.trim()
      : (typeof parseObject(entry)?.value === 'string' ? String(parseObject(entry)?.value).trim() : '');
    if (allowed.has(optionValue)) selected.add(optionValue);
  }

  if (selected.size >= rawMinimum) return null;
  return `Select at least ${rawMinimum} condition${rawMinimum === 1 ? '' : 's'} for ${field.label || field.key}.`;
}
