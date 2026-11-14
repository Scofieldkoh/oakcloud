import {
  formatChoiceAnswer,
  formatTimeTimezoneAnswer,
  isEmptyValue,
} from '@/lib/form-utils';

type ResponseFieldLike = {
  type: string;
  inputType?: string | null;
  validation?: unknown;
};

export function isResponseAnswerField(field: ResponseFieldLike): boolean {
  return !['PAGE_BREAK', 'PARAGRAPH', 'HTML', 'HIDDEN'].includes(field.type);
}

/** Resolve a repeat-section dropdown's stable record ID to the respondent-visible
 * name, using the submitted snapshot. Never turn an arbitrary ID into a name
 * unless it matches one of the recorded rows.
 */
export function resolveRepeatDropdownLabel(
  field: ResponseFieldLike,
  value: unknown,
  answers?: Record<string, unknown>,
): string | null {
  if (!answers || field.type !== 'DROPDOWN' || typeof value !== 'string') return null;
  const config = field.validation && typeof field.validation === 'object' && !Array.isArray(field.validation)
    ? field.validation as Record<string, unknown>
    : null;
  const labelKey = config?.optionsFromRepeatFieldKey;
  const idKey = config?.optionsFromRepeatFieldIdKey;
  if (typeof labelKey !== 'string' || typeof idKey !== 'string') return null;
  const labels = answers[labelKey];
  const ids = answers[idKey];
  if (!Array.isArray(labels) || !Array.isArray(ids)) return null;
  let index = ids.indexOf(value);
  const newPerson = /^new-person:(\d+)$/.exec(value);
  if (index < 0 && newPerson && ids[Number(newPerson[1])] === '') {
    index = Number(newPerson[1]);
  }
  if (index < 0 || index >= labels.length) return null;
  const label = labels[index];
  return typeof label === 'string' && label.trim() ? label.trim() : null;
}

export function formatResponseFieldValue(
  field: ResponseFieldLike,
  value: unknown,
  answers?: Record<string, unknown>,
): string | null {
  if (isEmptyValue(value)) return null;

  if (field.type === 'SHORT_TEXT' && field.inputType === 'time_timezone') {
    return formatTimeTimezoneAnswer(value);
  }

  if (field.type === 'SINGLE_CHOICE' || field.type === 'MULTIPLE_CHOICE') {
    return formatChoiceAnswer(value);
  }

  const resolved = resolveRepeatDropdownLabel(field, value, answers);
  if (resolved) return resolved;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    const text = value
      .map((item) => {
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
          return String(item);
        }
        return '';
      })
      .filter(Boolean)
      .join('; ');
    return text || null;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
