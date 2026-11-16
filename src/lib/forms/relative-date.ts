/** Calendar-month offsets for form date rules. Days are clamped to the end of the target month. */

/**
 * A date offset may be relaxed by a specific answer (e.g. unanimous short-notice
 * consent). An absent or unrecognised answer retains the default restriction.
 * Shared by the public date picker and server-side submission validation.
 */
export function getRelativeDateOffsetDays(
  validation: Record<string, unknown> | null,
  offsetName: 'minDateOffsetDays' | 'maxDateOffsetDays',
  answers: Record<string, unknown>,
): number {
  const rawOffset = validation?.[offsetName];
  const defaultOffset = typeof rawOffset === 'number' && Number.isFinite(rawOffset)
    ? Math.trunc(rawOffset) : 0;
  const conditional = validation?.[`${offsetName}When`];
  if (!conditional || typeof conditional !== 'object' || Array.isArray(conditional)) return defaultOffset;
  const rule = conditional as Record<string, unknown>;
  if (typeof rule.fieldKey !== 'string' || typeof rule.equals !== 'string'
    || typeof rule.offsetDays !== 'number' || !Number.isFinite(rule.offsetDays)) {
    return defaultOffset;
  }
  return answers[rule.fieldKey] === rule.equals ? Math.trunc(rule.offsetDays) : defaultOffset;
}
export function addIsoDateMonths(value: string, offsetMonths: number): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || !Number.isInteger(offsetMonths)) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return undefined;

  const targetTotalMonths = year * 12 + (month - 1) + offsetMonths;
  const targetYear = Math.floor(targetTotalMonths / 12);
  const targetMonth = targetTotalMonths - targetYear * 12 + 1;
  if (targetYear < 100 || targetYear > 9999) return undefined;
  const targetDay = Math.min(day, new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate());
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}
