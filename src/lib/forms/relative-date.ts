/** Calendar-month offsets for form date rules. Days are clamped to the end of the target month. */
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
