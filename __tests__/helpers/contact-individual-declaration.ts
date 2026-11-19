import type { FormFieldLite } from '@/lib/contact-form-link';

// Schema keys/types verified read-only on staging, not labels or respondent metadata.
const field = (key: string, type: string, position: number, inputType: string | null = null): FormFieldLite => ({
  key, type, position, inputType, label: key,
});
export const INDIVIDUAL_DECLARATION_FIELDS: FormFieldLite[] = [
  field('full_name', 'SHORT_TEXT', 4, 'text'),
  field('date_of_birth', 'SHORT_TEXT', 6, 'date'),
  field('nationality', 'DROPDOWN', 7),
  field('nric_fin_passport_number', 'SHORT_TEXT', 8, 'text'),
  field('residential_address', 'LONG_TEXT', 11),
  field('politically_exposed_person_pep_status', 'DROPDOWN', 40),
  field('dynamic_section_1_start', 'PAGE_BREAK', 41, 'repeat_start'),
  field('position', 'SHORT_TEXT', 42, 'text'),
  field('pep_country', 'DROPDOWN', 43),
  field('dynamic_section_1_end', 'PAGE_BREAK', 44, 'repeat_end'),
  field('dynamic_section_2_start', 'PAGE_BREAK', 45, 'repeat_start'),
  field('name_of_pep', 'SHORT_TEXT', 46, 'text'),
  field('pep_relationship', 'SHORT_TEXT', 47, 'text'),
  field('dynamic_section_2_end', 'PAGE_BREAK', 48, 'repeat_end'),
  field('dynamic_section_3_start', 'PAGE_BREAK', 52, 'repeat_start'),
  field('capacity', 'DROPDOWN', 53),
  field('name_of_nominator_beneficial_owner', 'SHORT_TEXT', 54, 'text'),
  field('nominator_s_id_passport_no', 'SHORT_TEXT', 55, 'text'),
  field('dynamic_section_3_end', 'PAGE_BREAK', 56, 'repeat_end'),
  field('nric', 'FILE_UPLOAD', 60),
  field('passport', 'FILE_UPLOAD', 62),
  field('proof_of_address', 'FILE_UPLOAD', 63),
  field('full_name_declaration', 'SHORT_TEXT', 67, 'text'),
];

export const INDIVIDUAL_DECLARATION_ANSWERS = {
  full_name: 'Dina Tan',
  nric_fin_passport_number: 'S1234567D',
  nationality: 'Malaysian',
  date_of_birth: '1980-01-01',
  residential_address: '1 Test Road',
  politically_exposed_person_pep_status: 'No',
  full_name_declaration: 'A different signatory',
  position: ['Minister'],
  pep_country: ['Singapore'],
  name_of_pep: ['Someone else'],
  pep_relationship: ['Sibling'],
  capacity: ['Nominee'],
  name_of_nominator_beneficial_owner: ['Another person'],
  nominator_s_id_passport_no: ['S7654321Z'],
  nric: ['nric-upload'],
  passport: ['passport-upload'],
  proof_of_address: ['address-upload'],
};
