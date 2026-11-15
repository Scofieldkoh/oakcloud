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
