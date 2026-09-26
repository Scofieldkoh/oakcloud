import type { OakDocFieldDefinition } from '@/lib/document-editor/oakdoc-fields';

export interface OakDocCompanyAddress {
  addressType?: string | null;
  fullAddress?: string | null;
  block?: string | null;
  streetName?: string | null;
  level?: string | null;
  unit?: string | null;
  buildingName?: string | null;
  postalCode?: string | null;
  country?: string | null;
  isCurrent?: boolean;
}

export interface OakDocPartyAddress {
  full?: string | null;
  letter?: string | null;
}

export interface OakDocOfficer {
  id: string;
  name: string;
  role?: string | null;
  identificationNumber?: string | null;
  nationality?: string | null;
  address?: string | null;
  letterAddress?: string | null;
  email?: string | null;
  phone?: string | null;
  appointmentDate?: string | null;
  isCurrent?: boolean;
}

export interface OakDocShareholder {
  id: string;
  name: string;
  shareholderType?: string | null;
  isNominee?: boolean | null;
  identificationNumber?: string | null;
  nationality?: string | null;
  address?: string | null;
  letterAddress?: string | null;
  email?: string | null;
  phone?: string | null;
  shareClass?: string | null;
  numberOfShares?: number | null;
  percentageHeld?: number | string | null;
  isCurrent?: boolean;
}

export interface OakDocContact {
  id: string;
  contactId?: string | null;
  name: string;
  detail?: string | null;
  appointments?: string[];
  role?: string | null;
  contactType?: string | null;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  identificationNumber?: string | null;
  address?: OakDocPartyAddress | string | null;
}

export interface OakDocAgreementEntity {
  id: string;
  name: string;
  uen?: string | null;
  entityType?: string | null;
  registeredAddress?: string | null;
}

export interface OakDocAgreementContext {
  agreementDate?: Date | string | null;
  effectiveDate?: Date | string | null;
  termMonths?: number | string | null;
}

export interface OakDocResolutionContext {
  date?: Date | string | null;
}

export interface OakDocCompanyDetail {
  id: string;
  name: string;
  uen: string;
  entityType?: string | null;
  incorporationDate?: string | null;
  paidUpCapitalAmount?: number | string | null;
  issuedCapitalAmount?: number | string | null;
  registeredAddress?: string | null;
  addresses?: OakDocCompanyAddress[];
  officers?: OakDocOfficer[];
  shareholders?: OakDocShareholder[];
  contacts?: OakDocContact[];
}

export const OAKDOC_AGREEMENT_FIELD_DEFINITIONS: ReadonlyArray<
  OakDocFieldDefinition & { example: string }
> = [
  {
    tag: 'agreement.agreementDate',
    label: 'Agreement Date',
    category: 'Agreement Context',
    example: '25 Sep 2026',
  },
  {
    tag: 'agreement.effectiveDate',
    label: 'Effective Date',
    category: 'Agreement Context',
    example: '1 Oct 2026',
  },
  {
    tag: 'agreement.termMonths',
    label: 'Term (Months)',
    category: 'Agreement Context',
    example: '12',
  },
];

export const OAKDOC_AGREEMENT_FIELD_TAGS = new Set(
  OAKDOC_AGREEMENT_FIELD_DEFINITIONS.map((field) => field.tag),
);

export const OAKDOC_SELECTED_CONTACT_FIELD_DEFINITIONS: ReadonlyArray<
  OakDocFieldDefinition & { example: string }
> = [
  { tag: 'selectedContact.name', label: 'Contact Name', category: 'Selected Contact', example: 'Alex Lim' },
  { tag: 'selectedContact.detail', label: 'Contact Detail', category: 'Selected Contact', example: 'Director' },
  { tag: 'selectedContact.role', label: 'Contact Role', category: 'Selected Contact', example: 'Director' },
  { tag: 'selectedContact.email', label: 'Contact Email', category: 'Selected Contact', example: 'alex@example.com' },
  { tag: 'selectedContact.phone', label: 'Contact Phone', category: 'Selected Contact', example: '+65 6123 4567' },
  { tag: 'selectedContact.address.full', label: 'Contact Full Address', category: 'Selected Contact', example: '123 Sample Street, Singapore 123456' },
  { tag: 'selectedContact.address.letter', label: 'Contact Letter Address', category: 'Selected Contact', example: '123 Sample Street, Singapore 123456' },
  { tag: 'selectedContact.nationality', label: 'Contact Nationality', category: 'Selected Contact', example: 'Singaporean' },
  { tag: 'selectedContact.identificationNumber', label: 'Contact Identification Number', category: 'Selected Contact', example: 'S1234567A' },
  { tag: 'selectedContact.contactType', label: 'Contact Type', category: 'Selected Contact', example: 'INDIVIDUAL' },
] as const;

export const OAKDOC_RESOLUTION_FIELD_DEFINITIONS: ReadonlyArray<
  OakDocFieldDefinition & { example: string }
> = [
  {
    tag: 'resolution.date',
    label: 'Resolution Date',
    category: 'Resolution Context',
    example: '25 Sep 2026',
  },
];

export const OAKDOC_RESOLUTION_FIELD_TAGS = new Set(
  OAKDOC_RESOLUTION_FIELD_DEFINITIONS.map((field) => field.tag),
);

function formatDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ] as const;
  return `${parsed.getDate()} ${months[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

function formatValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'number') return value.toLocaleString('en-SG');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
      return formatDate(value);
    }
    return value;
  }

  return String(value);
}

function getValueByPath(source: unknown, path: string): unknown {
  if (!source || typeof source !== 'object') return undefined;
  let current: unknown = source;

  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function registeredAddress(company: OakDocCompanyDetail): OakDocCompanyAddress | undefined {
  return company.addresses?.find(
    (address) => address.isCurrent !== false && address.addressType === 'REGISTERED_OFFICE',
  ) ?? company.addresses?.find((address) => address.isCurrent !== false);
}

function buildCompanyContext(company: OakDocCompanyDetail) {
  const address = registeredAddress(company);
  const fullAddress = company.registeredAddress ?? address?.fullAddress ?? '';
  return {
    ...company,
    registeredAddress: fullAddress,
    address: {
      block: address?.block ?? '',
      street: address?.streetName ?? '',
      level: address?.level ?? '',
      unit: address?.unit ?? '',
      building: address?.buildingName ?? '',
      postalCode: address?.postalCode ?? '',
      letter: fullAddress,
    },
    capital: company.paidUpCapitalAmount ?? company.issuedCapitalAmount ?? '',
  };
}

function buildSelectedDirector(officer: OakDocOfficer | undefined) {
  if (!officer) return undefined;
  return {
    name: officer.name,
    detail: officer.role || 'Director',
    email: officer.email,
    phone: officer.phone,
    nationality: officer.nationality,
    identificationNumber: officer.identificationNumber,
    role: officer.role,
    appointmentDate: officer.appointmentDate,
    address: {
      full: officer.address ?? '',
      letter: officer.letterAddress ?? officer.address ?? '',
    },
  };
}

function buildSelectedShareholder(shareholder: OakDocShareholder | undefined) {
  if (!shareholder) return undefined;
  return {
    name: shareholder.name,
    detail: shareholder.shareholderType || shareholder.shareClass || 'Shareholder',
    email: shareholder.email,
    phone: shareholder.phone,
    nationality: shareholder.nationality,
    identificationNumber: shareholder.identificationNumber,
    shareholderType: shareholder.shareholderType,
    shareClass: shareholder.shareClass,
    numberOfShares: shareholder.numberOfShares,
    percentageHeld: shareholder.percentageHeld,
    address: {
      full: shareholder.address ?? '',
      letter: shareholder.letterAddress ?? shareholder.address ?? '',
    },
  };
}

function contactAddress(contact: OakDocContact): OakDocPartyAddress {
  if (typeof contact.address === 'string') {
    return { full: contact.address, letter: contact.address };
  }
  return {
    full: contact.address?.full ?? '',
    letter: contact.address?.letter ?? contact.address?.full ?? '',
  };
}

function buildSelectedContact(contact: OakDocContact | undefined) {
  if (!contact) return undefined;
  return {
    name: contact.name,
    detail:
      contact.detail
      || contact.role
      || contact.appointments?.[0]
      || contact.contactType
      || 'Contact',
    role: contact.role ?? contact.appointments?.[0] ?? contact.detail,
    email: contact.email,
    phone: contact.phone,
    nationality: contact.nationality,
    identificationNumber: contact.identificationNumber,
    contactType: contact.contactType,
    address: contactAddress(contact),
  };
}

export function buildOakDocResolutionValues(input: {
  company: OakDocCompanyDetail;
  fieldTags: readonly string[];
  selectedDirectorId?: string;
  selectedShareholderId?: string;
  selectedContactId?: string;
  selectedContact?: OakDocContact;
  agreement?: OakDocAgreementContext;
  resolution?: OakDocResolutionContext;
  generatedBy?: string;
}): Record<string, string> {
  const selectedDirector = input.company.officers?.find(
    (officer) => officer.id === input.selectedDirectorId,
  );
  const selectedShareholder = input.company.shareholders?.find(
    (shareholder) => shareholder.id === input.selectedShareholderId,
  );
  const selectedContact = input.selectedContact ?? input.company.contacts?.find(
    (contact) => contact.id === input.selectedContactId,
  );

  const context = {
    company: buildCompanyContext(input.company),
    selectedDirector: buildSelectedDirector(selectedDirector),
    selectedShareholder: buildSelectedShareholder(selectedShareholder),
    selectedContact: buildSelectedContact(selectedContact),
    agreement: {
      agreementDate: input.agreement?.agreementDate,
      effectiveDate: input.agreement?.effectiveDate,
      termMonths: input.agreement?.termMonths,
    },
    resolution: {
      date: input.resolution?.date,
    },
    system: {
      currentDate: new Date(),
      generatedBy: input.generatedBy,
      preparerName: input.generatedBy,
    },
  };

  const values: Record<string, string> = {};
  for (const tag of input.fieldTags) {
    const value = formatValue(getValueByPath(context, tag));
    if (value !== undefined) values[tag] = value;
  }
  return values;
}
