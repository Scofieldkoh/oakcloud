/**
 * Display-only refinements for the Annual Return Declaration.
 * Keep the selected SSIC description visible inside its dropdown, not twice.
 */
export function shouldShowLongDropdownSelection(fieldKey: string, selectedLabel: string | null): boolean {
  return !!selectedLabel && selectedLabel.length > 48
    && fieldKey !== 'record_primary_activity'
    && fieldKey !== 'record_secondary_activity';
}

/** Slightly deeper, subtle tints distinguish people without any accent bar. */
export const PEOPLE_CARD_VARIANT_CLASSES = [
  'bg-teal-100/75 dark:bg-teal-950/45',
  'bg-sky-100/75 dark:bg-sky-950/45',
  'bg-violet-100/75 dark:bg-violet-950/45',
] as const;

export function getPeopleCardVariantClass(index: number): string {
  const row = Math.max(0, Math.trunc(index));
  return PEOPLE_CARD_VARIANT_CLASSES[row % PEOPLE_CARD_VARIANT_CLASSES.length];
}

/** The badge reflects the exact selection, not whether defaults were ever offered. */
export function getAnnualReturnAgendaLabel(value: unknown): string {
  const selected = Array.isArray(value) ? value.map((entry) => {
    if (typeof entry === 'string') return entry.trim();
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry) {
      return typeof entry.value === 'string' ? entry.value.trim() : '';
    }
    return '';
  }).filter(Boolean) : [];
  const defaults = ['Receive and adopt the Financial Statement', 'Re-election of directors'];
  const isDefault = selected.length === defaults.length
    && new Set(selected).size === defaults.length
    && defaults.every((option) => selected.includes(option));
  return `Matters to be included in AGM agenda (Current: ${isDefault ? 'Default' : 'Custom'})`;
}

/** Pair each appointment with its date, even for older published form templates. */
export function orderRecordedPositionFields<T extends { key: string }>(fields: T[]): T[] {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const isPositionField = (key: string) => /^person_role_(?:date_)?[123]$/.test(key);
  const ordered: T[] = [];
  let inserted = false;
  for (const field of fields) {
    if (isPositionField(field.key)) {
      if (!inserted) {
        for (const number of [1, 2, 3]) {
          const position = byKey.get(`person_role_${number}`);
          const date = byKey.get(`person_role_date_${number}`);
          if (position) ordered.push(position);
          if (date) ordered.push(date);
        }
        inserted = true;
      }
      continue;
    }
    ordered.push(field);
  }
  return ordered;
}

/** Display only: never round large share quantities or alter stored values. */
export function formatRecordedShareQuantity(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim()
    : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  if (!/^\d+$/.test(raw)) return raw;
  return BigInt(raw).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Neutral grey distinguishes ACRA-sourced, verification-only fields. */
export const ANNUAL_RETURN_READ_ONLY_FIELD_CLASSES =
  'border-[#B6C1BF] bg-[#D9DFDE] dark:border-[#4F625C] dark:bg-[#34433F]';
