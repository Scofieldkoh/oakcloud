import type { OakDocFieldDefinition } from '@/lib/document-editor/oakdoc-fields';
import type {
  OakDocAgreementEntity,
  OakDocCompanyDetail,
  OakDocContact,
  OakDocOfficer,
  OakDocShareholder,
} from '@/lib/document-editor/oakdoc-context';

export type OakDocGenericRepeaterKind =
  | 'directors'
  | 'shareholders'
  | 'contacts'
  | 'officers'
  | 'signers'
  | 'authorisedRepresentatives'
  | 'agreementEntities';

export const OAKDOC_DIRECTORS_REPEATER_TAG = 'repeat.directors';
export const OAKDOC_SHAREHOLDERS_REPEATER_TAG = 'repeat.shareholders';
export const OAKDOC_CONTACTS_REPEATER_TAG = 'repeat.contacts';
export const OAKDOC_OFFICERS_REPEATER_TAG = 'repeat.officers';

export interface OakDocRepeaterGenerationData {
  company: OakDocCompanyDetail;
  /** Contacts chosen on Configure, in the order they were picked. */
  contacts?: readonly OakDocContact[];
  signers?: readonly OakDocContact[];
  authorisedRepresentatives?: readonly OakDocContact[];
  agreementEntities?: readonly OakDocAgreementEntity[];
  /** Directors to repeat, by officer id; absent means every current director. */
  selectedDirectorIds?: readonly string[];
  /** Shareholders to repeat, by shareholder id; absent means every current shareholder. */
  selectedShareholderIds?: readonly string[];
  /** Officers (any role) to repeat, by officer id, in that order; absent means none. */
  selectedOfficerIds?: readonly string[];
}

function isSelected(ids: readonly string[] | undefined, id: string): boolean {
  return ids === undefined || ids.includes(id);
}

export interface OakDocGenericRepeaterDefinition {
  kind: OakDocGenericRepeaterKind;
  tag: string;
  label: string;
  itemLabel: string;
  itemTagNamespace: string;
  fields: ReadonlyArray<OakDocFieldDefinition & { example: string }>;
  generationDataAdapter: (
    data: OakDocRepeaterGenerationData,
  ) => Array<Record<string, string>>;
}

function formatDate(value: unknown): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('en-SG') : String(value);
}

function formatPercentage(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value).trim();
  return text.endsWith('%') ? text : text + '%';
}

function contactAddress(contact: OakDocContact): string {
  if (typeof contact.address === 'string') return contact.address;
  return contact.address?.full ?? '';
}

/** The phone as it follows the email in "email / mobile", without a dangling slash. */
function phoneAfterEmail(contact: OakDocContact): string {
  const email = contact.email?.trim() ?? '';
  const phone = contact.phone?.trim() ?? '';
  if (!phone) return '';
  return email ? ` / ${phone}` : phone;
}

function contactValues(namespace: string, contact: OakDocContact): Record<string, string> {
  return {
    [namespace + '.name']: contact.name || '',
    [namespace + '.role']:
      formatOakDocRole(contact.role || contact.detail || contact.appointments?.[0]),
    [namespace + '.email']: contact.email || '',
    [namespace + '.phone']: contact.phone || '',
    [namespace + '.phoneAfterEmail']: phoneAfterEmail(contact),
    [namespace + '.address']: contactAddress(contact),
    [namespace + '.identificationNumber']: contact.identificationNumber || '',
    [namespace + '.nationality']: contact.nationality || '',
  };
}

// Titles that stay in capitals when a role is put into proper case.
const ROLE_ACRONYMS = new Set(['CEO', 'CFO', 'COO', 'CTO', 'CIO', 'CMO', 'MD', 'GM', 'VP', 'SVP', 'EVP']);
const ROLE_SMALL_WORDS = new Set(['and', 'of', 'the', 'for', 'to', 'in', 'on', 'or']);

/**
 * Registry roles arrive in capitals ("MANAGING DIRECTOR"); documents want
 * "Managing Director". Titles such as CEO or CFO stay as they are, and a
 * role already typed in mixed case is left untouched.
 */
export function formatOakDocRole(value: string | null | undefined): string {
  const role = (value ?? '').trim();
  if (!role || role !== role.toUpperCase()) return role;
  let first = true;
  return role.replace(/[A-Za-z]+/g, (word) => {
    const isFirst = first;
    first = false;
    if (ROLE_ACRONYMS.has(word)) return word;
    const lower = word.toLowerCase();
    if (!isFirst && ROLE_SMALL_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

function directorValues(officer: OakDocOfficer): Record<string, string> {
  return {
    'director.name': officer.name || '',
    'director.role': formatOakDocRole(officer.role),
    'director.identificationNumber': officer.identificationNumber || '',
    'director.nationality': officer.nationality || '',
    'director.appointmentDate': formatDate(officer.appointmentDate),
    'director.address': officer.address || '',
  };
}

function officerValues(officer: OakDocOfficer): Record<string, string> {
  return {
    'officer.name': officer.name || '',
    'officer.role': formatOakDocRole(officer.role),
    'officer.identificationNumber': officer.identificationNumber || '',
    'officer.nationality': officer.nationality || '',
    'officer.appointmentDate': formatDate(officer.appointmentDate),
    'officer.address': officer.address || '',
  };
}

function shareholderValues(shareholder: OakDocShareholder): Record<string, string> {
  return {
    'shareholder.name': shareholder.name || '',
    'shareholder.shareholderType': formatOakDocRole(shareholder.shareholderType),
    'shareholder.identificationNumber': shareholder.identificationNumber || '',
    'shareholder.nationality': shareholder.nationality || '',
    'shareholder.address': shareholder.address || '',
    'shareholder.shareClass': shareholder.shareClass || '',
    'shareholder.numberOfShares': formatNumber(shareholder.numberOfShares),
    'shareholder.percentageHeld': formatPercentage(shareholder.percentageHeld),
    'shareholder.isNominee': shareholder.isNominee ? 'Yes' : 'No',
  };
}

function agreementEntityValues(entity: OakDocAgreementEntity): Record<string, string> {
  return {
    'agreementEntity.name': entity.name || '',
    'agreementEntity.uen': entity.uen || '',
    'agreementEntity.entityType': entity.entityType || '',
    'agreementEntity.registeredAddress': entity.registeredAddress || '',
  };
}

export const OAKDOC_GENERIC_REPEATER_DEFINITIONS:
readonly OakDocGenericRepeaterDefinition[] = [
  {
    kind: 'directors',
    tag: OAKDOC_DIRECTORS_REPEATER_TAG,
    label: 'Directors',
    itemLabel: 'Director',
    itemTagNamespace: 'director',
    fields: [
      { tag: 'director.name', label: 'Director Name', category: 'Repeating Director', example: 'John Tan' },
      { tag: 'director.role', label: 'Director Role', category: 'Repeating Director', example: 'Director' },
      { tag: 'director.identificationNumber', label: 'Director Identification Number', category: 'Repeating Director', example: 'S1234567A' },
      { tag: 'director.nationality', label: 'Director Nationality', category: 'Repeating Director', example: 'Singaporean' },
      { tag: 'director.appointmentDate', label: 'Director Appointment Date', category: 'Repeating Director', example: '15 Jan 2023' },
      { tag: 'director.address', label: 'Director Address', category: 'Repeating Director', example: '123 Sample Street' },
    ],
    generationDataAdapter: (data) => (data.company.officers ?? [])
      .filter((officer) => officer.isCurrent !== false
        && String(officer.role || '').toUpperCase().includes('DIRECTOR')
        && isSelected(data.selectedDirectorIds, officer.id))
      .map(directorValues),
  },
  {
    kind: 'shareholders',
    tag: OAKDOC_SHAREHOLDERS_REPEATER_TAG,
    label: 'Shareholders',
    itemLabel: 'Shareholder',
    itemTagNamespace: 'shareholder',
    fields: [
      { tag: 'shareholder.name', label: 'Shareholder Name', category: 'Repeating Shareholder', example: 'Mary Lee' },
      { tag: 'shareholder.shareholderType', label: 'Shareholder Type', category: 'Repeating Shareholder', example: 'Individual' },
      { tag: 'shareholder.identificationNumber', label: 'Shareholder Identification Number', category: 'Repeating Shareholder', example: 'S7654321B' },
      { tag: 'shareholder.nationality', label: 'Shareholder Nationality', category: 'Repeating Shareholder', example: 'Singaporean' },
      { tag: 'shareholder.address', label: 'Shareholder Address', category: 'Repeating Shareholder', example: '456 Sample Road' },
      { tag: 'shareholder.shareClass', label: 'Share Class', category: 'Repeating Shareholder', example: 'Ordinary' },
      { tag: 'shareholder.numberOfShares', label: 'Number of Shares', category: 'Repeating Shareholder', example: '50,000' },
      { tag: 'shareholder.percentageHeld', label: 'Percentage Held', category: 'Repeating Shareholder', example: '50%' },
      { tag: 'shareholder.isNominee', label: 'Nominee Shareholder', category: 'Repeating Shareholder', example: 'No' },
    ],
    generationDataAdapter: (data) => (data.company.shareholders ?? [])
      .filter((shareholder) => shareholder.isCurrent !== false
        && isSelected(data.selectedShareholderIds, shareholder.id))
      .map(shareholderValues),
  },
  {
    kind: 'contacts',
    tag: OAKDOC_CONTACTS_REPEATER_TAG,
    label: 'Contacts',
    itemLabel: 'Contact',
    itemTagNamespace: 'contact',
    fields: [
      { tag: 'contact.name', label: 'Contact Name', category: 'Repeating Contact', example: 'Alex Lim' },
      { tag: 'contact.role', label: 'Contact Role', category: 'Repeating Contact', example: 'Director' },
      { tag: 'contact.email', label: 'Contact Email', category: 'Repeating Contact', example: 'alex@example.com' },
      { tag: 'contact.phone', label: 'Contact Phone', category: 'Repeating Contact', example: '+65 6123 4567' },
      { tag: 'contact.phoneAfterEmail', label: 'Contact Phone (after email)', category: 'Repeating Contact', example: ' / +65 6123 4567' },
      { tag: 'contact.address', label: 'Contact Address', category: 'Repeating Contact', example: '123 Sample Street' },
      { tag: 'contact.identificationNumber', label: 'Contact Identification Number', category: 'Repeating Contact', example: 'S1234567A' },
      { tag: 'contact.nationality', label: 'Contact Nationality', category: 'Repeating Contact', example: 'Singaporean' },
    ],
    generationDataAdapter: (data) => (data.contacts ?? [])
      .map((contact) => contactValues('contact', contact)),
  },
  {
    kind: 'officers',
    tag: OAKDOC_OFFICERS_REPEATER_TAG,
    label: 'Officers',
    itemLabel: 'Officer',
    itemTagNamespace: 'officer',
    fields: [
      { tag: 'officer.name', label: 'Officer Name', category: 'Repeating Officer', example: 'Jane Ng' },
      { tag: 'officer.role', label: 'Officer Role', category: 'Repeating Officer', example: 'Secretary' },
      { tag: 'officer.identificationNumber', label: 'Officer Identification Number', category: 'Repeating Officer', example: 'S2345678C' },
      { tag: 'officer.nationality', label: 'Officer Nationality', category: 'Repeating Officer', example: 'Singaporean' },
      { tag: 'officer.appointmentDate', label: 'Officer Appointment Date', category: 'Repeating Officer', example: '1 Mar 2024' },
      { tag: 'officer.address', label: 'Officer Address', category: 'Repeating Officer', example: '789 Sample Avenue' },
    ],
    // Any role (secretary, CEO, auditor, director...), only those ticked on Configure.
    generationDataAdapter: (data) => {
      const officers = new Map((data.company.officers ?? [])
        .filter((officer) => officer.isCurrent !== false)
        .map((officer) => [officer.id, officer]));
      return (data.selectedOfficerIds ?? []).flatMap((id) => {
        const officer = officers.get(id);
        return officer ? [officerValues(officer)] : [];
      });
    },
  },
  {
    kind: 'signers',
    tag: 'repeat.signers',
    label: 'Signers',
    itemLabel: 'Signer',
    itemTagNamespace: 'signer',
    fields: [
      { tag: 'signer.name', label: 'Signer Name', category: 'Repeating Signer', example: 'Alex Lim' },
      { tag: 'signer.role', label: 'Signer Role', category: 'Repeating Signer', example: 'Director' },
      { tag: 'signer.email', label: 'Signer Email', category: 'Repeating Signer', example: 'alex@example.com' },
      { tag: 'signer.phone', label: 'Signer Phone', category: 'Repeating Signer', example: '+65 6123 4567' },
      { tag: 'signer.phoneAfterEmail', label: 'Signer Phone (after email)', category: 'Repeating Signer', example: ' / +65 6123 4567' },
      { tag: 'signer.address', label: 'Signer Address', category: 'Repeating Signer', example: '123 Sample Street' },
    ],
    generationDataAdapter: (data) => (data.signers ?? [])
      .map((contact) => contactValues('signer', contact)),
  },
  {
    kind: 'authorisedRepresentatives',
    tag: 'repeat.authorisedRepresentatives',
    label: 'Authorised Representatives',
    itemLabel: 'Authorised Representative',
    itemTagNamespace: 'authorisedRepresentative',
    fields: [
      { tag: 'authorisedRepresentative.name', label: 'Representative Name', category: 'Repeating Authorised Representative', example: 'Alex Lim' },
      { tag: 'authorisedRepresentative.role', label: 'Representative Role', category: 'Repeating Authorised Representative', example: 'Director' },
      { tag: 'authorisedRepresentative.email', label: 'Representative Email', category: 'Repeating Authorised Representative', example: 'alex@example.com' },
      { tag: 'authorisedRepresentative.phone', label: 'Representative Phone', category: 'Repeating Authorised Representative', example: '+65 6123 4567' },
      { tag: 'authorisedRepresentative.phoneAfterEmail', label: 'Representative Phone (after email)', category: 'Repeating Authorised Representative', example: ' / +65 6123 4567' },
      { tag: 'authorisedRepresentative.address', label: 'Representative Address', category: 'Repeating Authorised Representative', example: '123 Sample Street' },
    ],
    generationDataAdapter: (data) => (data.authorisedRepresentatives ?? [])
      .map((contact) => contactValues('authorisedRepresentative', contact)),
  },
  {
    kind: 'agreementEntities',
    tag: 'repeat.agreementEntities',
    label: 'Agreement Entities',
    itemLabel: 'Agreement Entity',
    itemTagNamespace: 'agreementEntity',
    fields: [
      { tag: 'agreementEntity.name', label: 'Entity Name', category: 'Repeating Agreement Entity', example: 'Example Pte. Ltd.' },
      { tag: 'agreementEntity.uen', label: 'Entity UEN', category: 'Repeating Agreement Entity', example: '202600001A' },
      { tag: 'agreementEntity.entityType', label: 'Entity Type', category: 'Repeating Agreement Entity', example: 'Private Limited Company' },
      { tag: 'agreementEntity.registeredAddress', label: 'Registered Address', category: 'Repeating Agreement Entity', example: '123 Sample Street' },
    ],
    generationDataAdapter: (data) => (data.agreementEntities ?? [])
      .map(agreementEntityValues),
  },
] as const;

export const OAKDOC_GENERIC_REPEATER_BY_TAG = new Map(
  OAKDOC_GENERIC_REPEATER_DEFINITIONS.map((definition) => [definition.tag, definition]),
);

export const OAKDOC_GENERIC_REPEATER_TAGS = new Set(
  OAKDOC_GENERIC_REPEATER_DEFINITIONS.map((definition) => definition.tag),
);

export const OAKDOC_GENERIC_REPEATER_ITEM_TAGS = new Set(
  OAKDOC_GENERIC_REPEATER_DEFINITIONS.flatMap(
    (definition) => definition.fields.map((field) => field.tag),
  ),
);
