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

export interface OakDocOfficer {
  id: string;
  name: string;
  role?: string | null;
  identificationNumber?: string | null;
  nationality?: string | null;
  address?: string | null;
  appointmentDate?: string | null;
  isCurrent?: boolean;
}

export interface OakDocShareholder {
  id: string;
  name: string;
  shareholderType?: string | null;
  identificationNumber?: string | null;
  nationality?: string | null;
  address?: string | null;
  shareClass?: string | null;
  numberOfShares?: number | null;
  percentageHeld?: number | string | null;
  isCurrent?: boolean;
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
}

function formatDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
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
  return {
    ...company,
    registeredAddress: company.registeredAddress ?? address?.fullAddress ?? '',
    address: {
      block: address?.block ?? '',
      street: address?.streetName ?? '',
      level: address?.level ?? '',
      unit: address?.unit ?? '',
      building: address?.buildingName ?? '',
      postalCode: address?.postalCode ?? '',
    },
    capital: company.paidUpCapitalAmount ?? company.issuedCapitalAmount ?? '',
  };
}

function buildSelectedDirector(officer: OakDocOfficer | undefined) {
  if (!officer) return undefined;
  return {
    name: officer.name,
    detail: officer.role || 'Director',
    nationality: officer.nationality,
    identificationNumber: officer.identificationNumber,
    role: officer.role,
    appointmentDate: officer.appointmentDate,
    address: {
      full: officer.address ?? '',
    },
  };
}

function buildSelectedShareholder(shareholder: OakDocShareholder | undefined) {
  if (!shareholder) return undefined;
  return {
    name: shareholder.name,
    detail: shareholder.shareholderType || shareholder.shareClass || 'Shareholder',
    nationality: shareholder.nationality,
    identificationNumber: shareholder.identificationNumber,
    shareholderType: shareholder.shareholderType,
    shareClass: shareholder.shareClass,
    numberOfShares: shareholder.numberOfShares,
    percentageHeld: shareholder.percentageHeld,
    address: {
      full: shareholder.address ?? '',
    },
  };
}

export function buildOakDocResolutionValues(input: {
  company: OakDocCompanyDetail;
  fieldTags: readonly string[];
  selectedDirectorId?: string;
  selectedShareholderId?: string;
  generatedBy?: string;
}): Record<string, string> {
  const selectedDirector = input.company.officers?.find(
    (officer) => officer.id === input.selectedDirectorId,
  );
  const selectedShareholder = input.company.shareholders?.find(
    (shareholder) => shareholder.id === input.selectedShareholderId,
  );

  const context = {
    company: buildCompanyContext(input.company),
    selectedDirector: buildSelectedDirector(selectedDirector),
    selectedShareholder: buildSelectedShareholder(selectedShareholder),
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
