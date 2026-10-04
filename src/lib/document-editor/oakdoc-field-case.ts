/**
 * Text case of an OakDoc field, chosen when the field is added in the
 * editor. It is kept in the field's Word title (`w:alias`), e.g.
 * "Full Address · UPPERCASE", so it travels with that one field (into
 * partials, repeating sections and copies) and shows on hover. Generation
 * prints the value in that case; with no case the value prints as stored.
 */

export type OakDocFieldCase = 'upper' | 'title';

const CASE_SUFFIX: Record<OakDocFieldCase, string> = {
  upper: 'UPPERCASE',
  title: 'Title Case',
};

const SEPARATOR = ' · ';

export const OAKDOC_FIELD_CASE_OPTIONS: ReadonlyArray<{ value: '' | OakDocFieldCase; label: string }> = [
  { value: '', label: 'As stored' },
  { value: 'upper', label: CASE_SUFFIX.upper },
  { value: 'title', label: CASE_SUFFIX.title },
];

export function isOakDocFieldCase(value: unknown): value is OakDocFieldCase {
  return value === 'upper' || value === 'title';
}

/** The Word title for a field: its label, plus the case when one is set. */
export function oakDocFieldTitle(label: string, textCase?: OakDocFieldCase | null): string {
  return textCase ? `${label}${SEPARATOR}${CASE_SUFFIX[textCase]}` : label;
}

/** The case a field's Word title asks for, if any. */
export function oakDocFieldCaseOfTitle(title: string | null | undefined): OakDocFieldCase | null {
  const text = (title ?? '').trim();
  for (const textCase of ['upper', 'title'] as const) {
    if (text.endsWith(`${SEPARATOR}${CASE_SUFFIX[textCase]}`)) return textCase;
  }
  return null;
}

/** "TAN WEI JIE" -> "Tan Wei Jie": each word's first letter up, the rest down. */
function titleCase(value: string): string {
  return value
    .toLocaleLowerCase('en-SG')
    .replace(/(^|[\s(/"-])(\p{L})/gu, (_, before: string, letter: string) => `${before}${letter.toLocaleUpperCase('en-SG')}`);
}

/** A value printed in the field's case. */
export function applyOakDocFieldCase(value: string, textCase: OakDocFieldCase | null): string {
  if (textCase === 'upper') return value.toLocaleUpperCase('en-SG');
  if (textCase === 'title') return titleCase(value);
  return value;
}
