import { describe, expect, it } from 'vitest';
import {
  analyseFormFields,
  hasEligibleFormTag,
  personFingerprint,
  personRowCount,
  personUploadRefs,
  readPerson,
  type FormFieldLite,
  type FormPerson,
} from '@/lib/contact-form-link';
import { computeSuggestions, currentFieldValue, suggestionValueHash, type ContactSnapshot } from '@/lib/contact-form-mapping';

const f = (key: string, type: string, position: number, inputType: string | null = null, label: string | null = null): FormFieldLite => ({
  key, type, position, inputType, label,
});
const FIELDS: FormFieldLite[] = [
  f('company_documents', 'FILE_UPLOAD', 13, null, 'Company documents'),
  f('people_section', 'PAGE_BREAK', 2, 'repeat_start'),
  f('person_kind', 'SINGLE_CHOICE', 3),
  f('person_name', 'SHORT_TEXT', 4),
  f('person_id', 'SHORT_TEXT', 5),
  f('person_identity_document', 'FILE_UPLOAD', 6, null, 'Identity document'),
  f('people_section_end', 'PAGE_BREAK', 7, 'repeat_end'),
  f('intro', 'PARAGRAPH', 1),
];
const structure = analyseFormFields(FIELDS);
const answers = {
  person_kind: ['individual', 'organisation'],
  person_name: ['Dina  Tan', 'Acme Pte Ltd'],
  person_id: ['s1234567d', '201900001A'],
  person_identity_document: [['u1', 'u2'], 'u3'],
  company_documents: ['c1'],
};

const individual: ContactSnapshot = {
  contactType: 'INDIVIDUAL',
  fullName: 'Dina Tan',
  identificationType: 'NRIC',
  identificationNumber: 'S1234567D',
  nationality: 'Singaporean',
  dateOfBirth: null,
  fullAddress: null,
  corporateName: null,
  corporateUen: null,
};

describe('form structure and people', () => {
  it('finds the repeat section regardless of field order, and the file fields', () => {
    expect([...structure.repeatKeys].sort()).toEqual(['person_id', 'person_identity_document', 'person_kind', 'person_name']);
    expect([...structure.fileKeys].sort()).toEqual(['company_documents', 'person_identity_document']);
    expect(structure.personMode).toBe('row');
    expect(personRowCount(answers, structure)).toBe(2);
    expect(analyseFormFields([f('person_name', 'SHORT_TEXT', 1)]).personMode).toBe('whole');
    expect(analyseFormFields([f('name', 'SHORT_TEXT', 1)]).personMode).toBe('none');
  });

  it('only forms tagged cdd or kyc (any case) are eligible', () => {
    expect(hasEligibleFormTag(['CDD'])).toBe(true);
    expect(hasEligibleFormTag([' Kyc '])).toBe(true);
    expect(hasEligibleFormTag(['survey', 'cdd-lite'])).toBe(false);
    expect(hasEligibleFormTag(null)).toBe(false);
  });

  it('reads one row, defaults a blank kind to individual, and rejects a missing row or unknown kind', () => {
    expect(readPerson(answers, structure, 1)).toMatchObject({ rowIndex: 1, kind: 'organisation', name: 'Acme Pte Ltd' });
    expect(readPerson({ ...answers, person_kind: ['', 'individual'] }, structure, 0)?.kind).toBe('individual');
    expect(readPerson(answers, structure, 2)).toBeNull();
    expect(readPerson(answers, structure, -1)).toBeNull();
    expect(readPerson(answers, structure, null)).toBeNull();
    expect(readPerson({ ...answers, person_kind: ['trust', 'individual'] }, structure, 0)).toBeNull();
    expect(readPerson({ ...answers, person_name: ['', ''], person_id: ['', ''] }, structure, 0)).toBeNull();
  });
});

describe('fingerprint', () => {
  it('ignores case, spacing and ID punctuation, but not a different person or kind', () => {
    const a = readPerson(answers, structure, 0)!;
    const same = readPerson({ ...answers, person_name: ['dina tan', 'x'], person_id: [' S-1234567 D', 'y'] }, structure, 0)!;
    expect(personFingerprint(same)).toBe(personFingerprint(a));
    expect(personFingerprint(readPerson({ ...answers, person_name: ['Dina Tann', 'x'] }, structure, 0)!)).not.toBe(personFingerprint(a));
    expect(personFingerprint(readPerson({ ...answers, person_id: ['S1234567E', 'y'] }, structure, 0)!)).not.toBe(personFingerprint(a));
    expect(personFingerprint({ ...a, kind: 'organisation' })).not.toBe(personFingerprint(a));
  });
});

describe('attachments', () => {
  it('lists the row\'s own uploads plus the response-level ones, never another row\'s', () => {
    // In form order: the row's own field comes before the response-level one.
    expect(personUploadRefs(answers, structure, 0).map((r) => [r.uploadId, r.scope])).toEqual([
      ['u1', 'person'],
      ['u2', 'person'],
      ['c1', 'response'],
    ]);
    expect(personUploadRefs(answers, structure, 1).map((r) => r.uploadId).sort()).toEqual(['c1', 'u3']);
    // A repeat field has nothing to offer without a row.
    expect(personUploadRefs(answers, structure, null).map((r) => r.uploadId)).toEqual(['c1']);
  });
});

describe('suggestions', () => {
  const person = (overrides: Partial<FormPerson> = {}): FormPerson => ({
    rowIndex: 0, kind: 'individual', name: 'Dina Tan', idNumber: 'S1234567D', roles: [], nationality: '', birthDate: '', address: '', pep: '', pepDetails: '', ...overrides,
  });

  it('suggests only differences, normalised: case, spacing and ID formatting do not count', () => {
    expect(computeSuggestions(individual, person({ name: ' dina  TAN ', idNumber: 's1234567d', nationality: 'singaporean' }))).toEqual([]);
    const result = computeSuggestions(individual, person({ nationality: 'Malaysian', birthDate: '1980-01-01', address: '1 Test Road' }));
    expect(result.map((s) => [s.field, s.current, s.proposed, s.canApply])).toEqual([
      ['nationality', 'Singaporean', 'Malaysian', true],
      ['dateOfBirth', null, '1980-01-01', true],
      ['fullAddress', null, '1 Test Road', true],
    ]);
  });

  it('marks an impossible, future or too old date of birth as can\'t apply, and a blank answer as no suggestion', () => {
    for (const birthDate of ['2999-01-01', '1980-02-30', '1850-01-01', 'next week']) {
      const [dob] = computeSuggestions(individual, person({ birthDate }));
      expect(dob, birthDate).toMatchObject({ field: 'dateOfBirth', canApply: false });
      expect(dob.reason).toContain("Can't apply");
    }
    expect(computeSuggestions(individual, person({ birthDate: '' }))).toEqual([]);
  });

  it('never suggests an ID number for a contact with no ID type, and maps a company row to company fields only', () => {
    const noType = { ...individual, identificationType: null, identificationNumber: null };
    expect(computeSuggestions(noType, person())[0]).toMatchObject({ field: 'identificationNumber', canApply: false });
    const company: ContactSnapshot = { ...individual, contactType: 'CORPORATE', fullName: 'Acme', corporateName: 'Acme', corporateUen: null, identificationType: null, identificationNumber: null };
    const result = computeSuggestions(company, person({ kind: 'organisation', name: 'Acme', idNumber: '201900001a', birthDate: '1980-01-01', nationality: 'x' }));
    expect(result.map((s) => [s.field, s.proposed])).toEqual([['corporateUen', '201900001A']]);
  });

  it('reads the date of birth as a UTC calendar date and hashes proposals per field and value', () => {
    expect(currentFieldValue({ ...individual, dateOfBirth: new Date('1980-01-01T00:00:00Z') }, 'dateOfBirth')).toBe('1980-01-01');
    expect(suggestionValueHash('fullAddress', 'a')).not.toBe(suggestionValueHash('fullAddress', 'b'));
    expect(suggestionValueHash('fullAddress', 'a')).not.toBe(suggestionValueHash('nationality', 'a'));
  });
});
