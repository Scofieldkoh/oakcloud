/**
 * The one place that says which form answers can update which Contact fields, and how a proposed
 * value is compared. Suggestions are computed on read from the current contact and the current
 * answers; nothing is written without an explicit accept. The politically-exposed-person answers
 * are shown only: no contact field holds them.
 */
import { canonicalizeContactName } from '@/lib/contact-identity-normalization';
import { plausibleDateOfBirth, toDateOnlyString } from '@/lib/date-only';
import { answerText, sha256Hex, type FormPerson } from '@/lib/contact-form-link';

export const SUGGESTION_FIELDS = [
  'fullName',
  'identificationNumber',
  'nationality',
  'dateOfBirth',
  'fullAddress',
  'corporateName',
  'corporateUen',
] as const;
export type SuggestionField = (typeof SUGGESTION_FIELDS)[number];

export const SUGGESTION_FIELD_LABELS: Record<SuggestionField, string> = {
  fullName: 'Name',
  identificationNumber: 'ID number',
  nationality: 'Nationality',
  dateOfBirth: 'Date of birth',
  fullAddress: 'Address',
  corporateName: 'Company name',
  corporateUen: 'UEN',
};

export interface ContactSnapshot {
  contactType: 'INDIVIDUAL' | 'CORPORATE';
  fullName: string;
  identificationType: string | null;
  identificationNumber: string | null;
  nationality: string | null;
  dateOfBirth: Date | null;
  fullAddress: string | null;
  corporateName: string | null;
  corporateUen: string | null;
}

export interface Suggestion {
  field: SuggestionField;
  label: string;
  current: string | null;
  proposed: string;
  canApply: boolean;
  /** Why it cannot be applied. Never set when `canApply` is true. */
  reason: string | null;
}

const collapse = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
const identifier = (value: string | null | undefined) => (value ?? '').normalize('NFKC').toUpperCase().replace(/\s+/g, '');
const lower = (value: string | null | undefined) => collapse(value).normalize('NFKC').toLowerCase();

/** The contact's value for a field, as the string it is compared in (the date as YYYY-MM-DD). */
export function currentFieldValue(contact: ContactSnapshot, field: SuggestionField): string | null {
  const text = (value: string | null | undefined) => (collapse(value) === '' ? null : collapse(value));
  switch (field) {
    case 'fullName':
      return text(contact.fullName);
    case 'identificationNumber':
      return identifier(contact.identificationNumber) || null;
    case 'nationality':
      return text(contact.nationality);
    case 'dateOfBirth':
      return toDateOnlyString(contact.dateOfBirth);
    case 'fullAddress':
      return text(contact.fullAddress);
    case 'corporateName':
      return text(contact.corporateName);
    case 'corporateUen':
      return identifier(contact.corporateUen) || null;
  }
}

/** The value the form proposes for a field, normalised, or null when the answer is blank. */
function proposedFor(field: SuggestionField, person: FormPerson): string | null {
  switch (field) {
    case 'fullName':
    case 'corporateName':
      return person.name || null;
    case 'identificationNumber':
    case 'corporateUen':
      return identifier(person.idNumber) || null;
    case 'nationality':
      return person.nationality || null;
    case 'dateOfBirth':
      return person.birthDate ? (plausibleDateOfBirth(person.birthDate) ?? person.birthDate) : null;
    case 'fullAddress':
      return person.address || null;
  }
}

function sameValue(field: SuggestionField, current: string | null, proposed: string): boolean {
  if (current === null) return false;
  switch (field) {
    case 'fullName':
    case 'corporateName':
      return canonicalizeContactName(current) === canonicalizeContactName(proposed);
    case 'nationality':
    case 'fullAddress':
      return lower(current) === lower(proposed);
    default:
      return current === proposed;
  }
}

export function suggestionFieldsFor(contactType: 'INDIVIDUAL' | 'CORPORATE'): readonly SuggestionField[] {
  return contactType === 'CORPORATE'
    ? ['corporateName', 'corporateUen']
    : ['fullName', 'identificationNumber', 'nationality', 'dateOfBirth', 'fullAddress'];
}

/**
 * The differences between the contact and the person's answers, one per field. A blank answer or an
 * equal value gives none. `blocked` marks a field that cannot be applied for a reason only the
 * database knows (an ID that another contact already holds).
 */
export function computeSuggestions(
  contact: ContactSnapshot,
  person: FormPerson,
  blocked: Partial<Record<SuggestionField, string>> = {},
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  for (const field of suggestionFieldsFor(contact.contactType)) {
    const proposed = proposedFor(field, person);
    if (proposed === null) continue;
    const current = currentFieldValue(contact, field);
    if (sameValue(field, current, proposed)) continue;

    let reason: string | null = blocked[field] ?? null;
    if (!reason && field === 'dateOfBirth' && plausibleDateOfBirth(proposed) === null) {
      reason = "Can't apply: not a real date of birth from 1 Jan 1900 to today";
    }
    if (!reason && field === 'identificationNumber' && !contact.identificationType) {
      reason = "Can't apply: set the contact's ID type first";
    }
    suggestions.push({
      field,
      label: SUGGESTION_FIELD_LABELS[field],
      current,
      proposed,
      canApply: reason === null,
      reason,
    });
  }
  return suggestions;
}

/** The hash a dismissal is stored under: it changes whenever the proposed value does. */
export function suggestionValueHash(field: SuggestionField, proposed: string): string {
  return sha256Hex(`${field}\n${proposed}`);
}

/** Answers that are shown but never written to a contact. */
export function readOnlyAnswers(person: FormPerson): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (person.pep) rows.push({ label: 'Politically exposed person (as answered)', value: answerText(person.pep) });
  if (person.pepDetails) rows.push({ label: 'Position and country (as answered)', value: person.pepDetails });
  return rows;
}
