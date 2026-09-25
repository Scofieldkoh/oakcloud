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
  | 'signers'
  | 'authorisedRepresentatives'
  | 'agreementEntities';

export interface OakDocRepeaterGenerationData {
  company: OakDocCompanyDetail;
  signers?: readonly OakDocContact[];
  authorisedRepresentatives?: readonly OakDocContact[];
  agreementEntities?: readonly OakDocAgreementEntity[];
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

function contactValues(namespace: string, contact: OakDocContact): Record<string, string> {
  return {
    [namespace + '.name']: contact.name || '',
    [namespace + '.role']:
      contact.role || contact.detail || contact.appointments?.[0] || '',
    [namespace + '.email']: contact.email || '',
    [namespace + '.phone']: contact.phone || '',
    [namespace + '.address']: contactAddress(contact),
  };
}

function directorValues(officer: OakDocOfficer): Record<string, string> {
  return {
    'director.name': officer.name || '',
    'director.role': officer.role || '',
    'director.identificationNumber': officer.identificationNumber || '',
    'director.nationality': officer.nationality || '',
    'director.appointmentDate': formatDate(officer.appointmentDate),
    'director.address': officer.address || '',
  };
}

function shareholderValues(shareholder: OakDocShareholder): Record<string, string> {
  return {
    'shareholder.name': shareholder.name || '',
    'shareholder.shareholderType': shareholder.shareholderType || '',
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
    tag: 'repeat.directors',
    label: 'Directors',
    itemLabel: 'Director',
    itemTagNamespace: 'director',
    fields: [
      { tag: 'director.name', label: 'Director Name', category: 'Repeating Director', example: 'John Tan' },
      { tag: 'director.role', label: 'Director Role', category: 'Repeating Director', example: 'DIRECTOR' },
      { tag: 'director.identificationNumber', label: 'Director Identification Number', category: 'Repeating Director', example: 'S1234567A' },
      { tag: 'director.nationality', label: 'Director Nationality', category: 'Repeating Director', example: 'Singaporean' },
      { tag: 'director.appointmentDate', label: 'Director Appointment Date', category: 'Repeating Director', example: '15 Jan 2023' },
      { tag: 'director.address', label: 'Director Address', category: 'Repeating Director', example: '123 Sample Street' },
    ],
    generationDataAdapter: (data) => (data.company.officers ?? [])
      .filter((officer) => officer.isCurrent !== false
        && String(officer.role || '').toUpperCase().includes('DIRECTOR'))
      .map(directorValues),
  },
  {
    kind: 'shareholders',
    tag: 'repeat.shareholders',
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
      .filter((shareholder) => shareholder.isCurrent !== false)
      .map(shareholderValues),
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
