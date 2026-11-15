/**
 * Display-only refinements for the Annual Return Declaration.
 * Keep the selected SSIC description visible inside its dropdown, not twice.
 */
export function shouldShowLongDropdownSelection(fieldKey: string, selectedLabel: string | null): boolean {
  return !!selectedLabel && selectedLabel.length > 48
    && fieldKey !== 'record_primary_activity'
    && fieldKey !== 'record_secondary_activity';
}

/** Soft colour rotation, with a stronger leading edge for visual row separation. */
export const PEOPLE_CARD_VARIANT_CLASSES = [
  'border-teal-200 border-l-4 border-l-teal-500 bg-teal-50/60 dark:border-teal-900 dark:border-l-teal-500 dark:bg-teal-950/20',
  'border-sky-200 border-l-4 border-l-sky-500 bg-sky-50/60 dark:border-sky-900 dark:border-l-sky-500 dark:bg-sky-950/20',
  'border-violet-200 border-l-4 border-l-violet-500 bg-violet-50/55 dark:border-violet-900 dark:border-l-violet-500 dark:bg-violet-950/20',
] as const;

export function getPeopleCardVariantClass(index: number): string {
  const row = Math.max(0, Math.trunc(index));
  return PEOPLE_CARD_VARIANT_CLASSES[row % PEOPLE_CARD_VARIANT_CLASSES.length];
}
