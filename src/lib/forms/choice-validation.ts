import { evaluateCondition, parseChoiceOptions, parseObject } from '@/lib/form-utils';

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

type ConditionalOption = { value: string; condition?: unknown };
type ChoiceField = MultipleChoiceField & { key: string };
const CONDITIONAL_OPTION_FIELD_TYPES = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN']);

function selectedChoiceValues(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.flatMap((entry) => {
    const raw = typeof entry === 'string' ? entry : parseObject(entry)?.value;
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return trimmed ? [trimmed] : [];
  });
}

/** An option is offered only while its own condition holds against the answers. */
export function isChoiceOptionAvailable(option: { condition?: unknown }, answers: Record<string, unknown>): boolean {
  return !option.condition || evaluateCondition(option.condition, answers);
}

/**
 * The options to offer. A selected option whose condition no longer holds stays
 * listed, so the respondent sees it and the validation error, and can change it.
 */
export function filterAvailableChoiceOptions<T extends ConditionalOption>(
  options: T[],
  answers: Record<string, unknown>,
  selectedValue: unknown,
): T[] {
  const selected = new Set(selectedChoiceValues(selectedValue));
  return options.filter((option) => selected.has(option.value) || isChoiceOptionAvailable(option, answers));
}

/** Error for a selected option that is not available for the other answers; `answers` is the row context in a repeat section. */
export function getUnavailableChoiceOptionError(field: ChoiceField, value: unknown, answers: Record<string, unknown>): string | null {
  if (!CONDITIONAL_OPTION_FIELD_TYPES.has(field.type)) return null;
  const options = parseChoiceOptions(field.options).filter((option) => option.condition);
  if (options.length === 0) return null;
  for (const selected of selectedChoiceValues(value)) {
    const option = options.find((candidate) => candidate.value === selected);
    if (option && !isChoiceOptionAvailable(option, answers)) {
      return `"${option.label}" is not available for your other answers. Choose another option for ${field.label || field.key}.`;
    }
  }
  return null;
}
