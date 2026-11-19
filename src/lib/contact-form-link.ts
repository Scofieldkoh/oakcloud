/**
 * Pure helpers for linking a KYC/CDD form response person to a Contact: reading a person (a repeat
 * row) out of the answers, fingerprinting that person, and listing the uploads that belong to it.
 *
 * Repeat answers are parallel arrays per field key (`answers.person_name[i]`); a row has no id of its
 * own, so a link binds the row by index AND by a fingerprint of the person's kind, name and ID, and is
 * never re-bound to another row.
 */
import { createHash } from 'node:crypto';

export const CONTACT_FORM_ELIGIBLE_TAGS = ['cdd', 'kyc'] as const;

/** A form is linkable when it is tagged `cdd` or `kyc` (any case). */
export function hasEligibleFormTag(tags: readonly string[] | null | undefined): boolean {
  return (tags ?? []).some((tag) => (CONTACT_FORM_ELIGIBLE_TAGS as readonly string[]).includes(tag.trim().toLowerCase()));
}

export interface FormFieldLite {
  key: string;
  type: string;
  inputType: string | null;
  label: string | null;
  position: number;
}

export interface FormStructure {
  /** Keys of the answer fields inside the repeat section that holds the people (their answers are arrays by person row). */
  repeatKeys: ReadonlySet<string>;
  /** Keys inside any other repeat section: arrays by some other kind of row, never read as this person's. */
  foreignRepeatKeys: ReadonlySet<string>;
  /** All FILE_UPLOAD field keys, and the label of every field by key. */
  fileKeys: readonly string[];
  labels: ReadonlyMap<string, string>;
  /** `row`: a repeat section holds the person fields; `whole`: they are single answers; `none`: no person fields. */
  personMode: 'row' | 'whole' | 'none';
  /** Explicit answer-key mapping for the supported schema; no label or respondent-name inference. */
  personFieldKeys: Readonly<Record<string, string>>;
}

const CDD_PERSON_FIELDS = Object.fromEntries([
  'person_kind', 'person_name', 'person_id', 'person_roles', 'person_nationality',
  'person_birth_date', 'person_address', 'person_pep', 'person_pep_details',
].map((key) => [key, key]));

// Verified Individual Declaration schema. PEP repeat details describe other people/roles, not
// additional candidates. The declaration signatory is deliberately not an identity fallback.
const INDIVIDUAL_DECLARATION_FIELDS = [
  ['person_name', 'full_name', 'SHORT_TEXT'],
  ['person_id', 'nric_fin_passport_number', 'SHORT_TEXT'],
  ['person_nationality', 'nationality', 'DROPDOWN'],
  ['person_birth_date', 'date_of_birth', 'SHORT_TEXT'],
  ['person_address', 'residential_address', 'LONG_TEXT'],
  ['person_pep', 'politically_exposed_person_pep_status', 'DROPDOWN'],
] as const;

const NON_ANSWER_TYPES = new Set(['PAGE_BREAK', 'PARAGRAPH', 'HTML']);

export function analyseFormFields(fields: readonly FormFieldLite[]): FormStructure {
  const ordered = [...fields].sort((a, b) => a.position - b.position);
  const fileKeys: string[] = [];
  const labels = new Map<string, string>();
  const allKeys = new Set<string>();
  // Each repeat section has its own rows: its keys are kept apart, and only the section that holds
  // `person_name` is the people section.
  const sections: Array<Set<string>> = [];
  let current: Set<string> | null = null;
  for (const field of ordered) {
    if (field.type === 'PAGE_BREAK' && field.inputType === 'repeat_start') {
      current = new Set<string>();
      sections.push(current);
      continue;
    }
    if (field.type === 'PAGE_BREAK' && field.inputType === 'repeat_end') {
      current = null;
      continue;
    }
    if (NON_ANSWER_TYPES.has(field.type)) continue;
    allKeys.add(field.key);
    labels.set(field.key, field.label ?? field.key);
    current?.add(field.key);
    if (field.type === 'FILE_UPLOAD') fileKeys.push(field.key);
  }
  const peopleSection = sections.find((section) => section.has('person_name'));
  const repeatKeys = new Set<string>(peopleSection ?? []);
  const foreignRepeatKeys = new Set<string>();
  for (const section of sections) {
    if (section === peopleSection) continue;
    for (const key of section) foreignRepeatKeys.add(key);
  }
  let personMode: FormStructure['personMode'] = peopleSection ? 'row' : allKeys.has('person_name') ? 'whole' : 'none';
  let personFieldKeys: Readonly<Record<string, string>> = CDD_PERSON_FIELDS;
  if (personMode === 'none') {
    const singleFields = new Map(ordered.filter((field) => !foreignRepeatKeys.has(field.key)).map((field) => [field.key, field]));
    const declarationFields = Object.fromEntries(INDIVIDUAL_DECLARATION_FIELDS
      .filter(([, key, type]) => singleFields.get(key)?.type === type)
      .map(([canonical, key]) => [canonical, key]));
    // Require both exact identity field definitions outside any repeat section. Optional answers are
    // mapped only when their definitions also match; arbitrary generic "name" fields are unsupported.
    if (declarationFields.person_name && declarationFields.person_id) {
      personMode = 'whole';
      personFieldKeys = declarationFields;
    }
  }
  return { repeatKeys, foreignRepeatKeys, fileKeys, labels, personMode, personFieldKeys };
}

export type Answers = Record<string, unknown>;

function asAnswers(value: unknown): Answers {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Answers) : {};
}

/** The number of people in a repeat form: the longest answer array among the repeat fields. */
export function personRowCount(answersValue: unknown, structure: FormStructure): number {
  if (structure.personMode !== 'row') return structure.personMode === 'whole' ? 1 : 0;
  const answers = asAnswers(answersValue);
  let count = 0;
  for (const key of structure.repeatKeys) {
    const value = answers[key];
    if (Array.isArray(value)) count = Math.max(count, value.length);
  }
  return count;
}

function rawValue(answers: Answers, structure: FormStructure, key: string, rowIndex: number | null): unknown {
  const value = answers[key];
  if (structure.foreignRepeatKeys.has(key)) return undefined;
  if (!structure.repeatKeys.has(key)) return value;
  if (rowIndex === null || !Array.isArray(value)) return undefined;
  return value[rowIndex];
}

/** A single-line text answer; anything that is not text or a number reads as blank. */
export function answerText(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

export type PersonKind = 'individual' | 'organisation';

export interface FormPerson {
  rowIndex: number | null;
  kind: PersonKind;
  name: string;
  idNumber: string;
  roles: string[];
  nationality: string;
  birthDate: string;
  address: string;
  pep: string;
  pepDetails: string;
}

/**
 * The person at a row (or the whole response), or null when the row does not exist, has neither name
 * nor ID, or has a kind that is neither `individual` (or blank) nor `organisation`.
 */
export function readPerson(answersValue: unknown, structure: FormStructure, rowIndex: number | null): FormPerson | null {
  if (structure.personMode === 'none') return null;
  if (structure.personMode === 'row') {
    if (rowIndex === null || !Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= personRowCount(answersValue, structure)) return null;
  } else if (rowIndex !== null) {
    return null;
  }
  const answers = asAnswers(answersValue);
  const get = (key: string) => {
    const sourceKey = structure.personFieldKeys[key];
    if (!sourceKey) return undefined;
    const value = rawValue(answers, structure, sourceKey, rowIndex);
    // Declaration identity fields are text: coercing a numeric answer loses leading zeros and can
    // invent a selectable identity. Keep the existing corporate CDD extraction unchanged.
    if ((sourceKey === 'full_name' || sourceKey === 'nric_fin_passport_number') && typeof value !== 'string') return undefined;
    return value;
  };
  const kindText = answerText(get('person_kind')).toLowerCase();
  if (kindText !== '' && kindText !== 'individual' && kindText !== 'organisation') return null;
  const name = answerText(get('person_name'));
  const idNumber = answerText(get('person_id'));
  if (!name && !idNumber) return null;
  const roles = get('person_roles');
  return {
    rowIndex,
    kind: kindText === 'organisation' ? 'organisation' : 'individual',
    name,
    idNumber,
    roles: Array.isArray(roles) ? roles.filter((role): role is string => typeof role === 'string') : [],
    nationality: answerText(get('person_nationality')),
    birthDate: answerText(get('person_birth_date')),
    address: answerText(get('person_address')),
    pep: answerText(get('person_pep')),
    pepDetails: answerText(get('person_pep_details')),
  };
}

export function normalisePersonName(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalisePersonId(id: string): string {
  return id.normalize('NFKC').toUpperCase().replace(/[\s-]+/g, '');
}

/** sha256 of the person's kind, name and ID as normalised at the time. */
export function personFingerprint(person: Pick<FormPerson, 'kind' | 'name' | 'idNumber'>): string {
  return createHash('sha256')
    .update([person.kind, normalisePersonName(person.name), normalisePersonId(person.idNumber)].join('|'))
    .digest('hex');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Every upload id inside an answer value (a string, or nested arrays of strings). */
export function collectUploadIds(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => collectUploadIds(item));
}

export interface PersonUploadRef {
  uploadId: string;
  fieldKey: string;
  fieldLabel: string;
  /** `person`: this row's own upload field; `response`: a response-level upload field (for example company documents). */
  scope: 'person' | 'response';
}

/**
 * The upload ids that belong to a person: the row's own FILE_UPLOAD answers (fields of the people repeat
 * section) plus the response-level FILE_UPLOAD answers (those outside every repeat section). Another row's uploads are
 * never included. Ids appear once.
 */
export function personUploadRefs(answersValue: unknown, structure: FormStructure, rowIndex: number | null): PersonUploadRef[] {
  const answers = asAnswers(answersValue);
  const refs: PersonUploadRef[] = [];
  const seen = new Set<string>();
  for (const key of structure.fileKeys) {
    // An upload field in another repeat section belongs to that section's rows, never to this person.
    if (structure.foreignRepeatKeys.has(key)) continue;
    const isRepeat = structure.repeatKeys.has(key);
    if (isRepeat && rowIndex === null) continue;
    const value = isRepeat ? rawValue(answers, structure, key, rowIndex) : answers[key];
    for (const uploadId of collectUploadIds(value)) {
      if (seen.has(uploadId)) continue;
      seen.add(uploadId);
      refs.push({ uploadId, fieldKey: key, fieldLabel: structure.labels.get(key) ?? key, scope: isRepeat ? 'person' : 'response' });
    }
  }
  return refs;
}
