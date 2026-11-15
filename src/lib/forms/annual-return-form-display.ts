/**
 * Display-only refinements for the Annual Return Declaration.
 * Keep the selected SSIC description visible inside its dropdown, not twice.
 */
export function shouldShowLongDropdownSelection(fieldKey: string, selectedLabel: string | null): boolean {
  return !!selectedLabel && selectedLabel.length > 48
    && fieldKey !== 'record_primary_activity'
    && fieldKey !== 'record_secondary_activity';
}

/** Gentle background rotation to separate people without an accent bar. */
export const PEOPLE_CARD_VARIANT_CLASSES = [
  'bg-teal-50/60 dark:bg-teal-950/20',
  'bg-sky-50/60 dark:bg-sky-950/20',
  'bg-violet-50/55 dark:bg-violet-950/20',
] as const;

export function getPeopleCardVariantClass(index: number): string {
  const row = Math.max(0, Math.trunc(index));
  return PEOPLE_CARD_VARIANT_CLASSES[row % PEOPLE_CARD_VARIANT_CLASSES.length];
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
