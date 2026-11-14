/** Pure mapping of an Oakcloud company snapshot to Annual Return Declaration answers. */
import type { CompanyWithRelations } from '@/services/company.service';
import { ValidationError } from '@/lib/errors';
import { ARD_COMPANY_TYPES } from '@/lib/form-templates/sg-annual-return-declaration';

export const AR_RECORD_SECTIONS = [
  { section: 'share_capital_section', id: 'capital_record_id', label: 'capital_class',
    fields: ['capital_class', 'capital_currency', 'capital_shares', 'capital_amount', 'capital_paid_up'] },
  { section: 'people_section', id: 'person_record_id', label: 'person_name',
    fields: ['person_kind', 'person_name', 'person_id_number', 'person_nationality',
      'person_address', 'person_role_1', 'person_role_2', 'person_role_3',
      'person_role_date_1', 'person_role_date_2', 'person_role_date_3',
      'person_additional_positions', 'person_shareholding'] },
  // Recognise v2 snapshots on existing submissions and drafts. Do not discard
  // legacy records during a v3 rollout.
  { section: 'officers_section', id: 'officer_record_id', label: 'officer_name',
    fields: ['officer_role', 'officer_name', 'officer_id_number',
      'officer_nationality', 'officer_address', 'officer_appointment_date'] },
  { section: 'shareholders_section', id: 'shareholder_record_id', label: 'shareholder_name',
    fields: ['shareholder_name', 'shareholder_id_number', 'shareholder_address',
      'shareholder_class', 'shareholder_shares'] },
] as const;

type ExtraRecord = CompanyWithRelations & {
  financialPeriods?: Array<{ periodEnd: Date | string }>;
  shareCapital?: Array<{ id: string; shareClass: string; currency: string; numberOfShares: number; totalValue: unknown; isPaidUp: boolean; isTreasury?: boolean }>;
};
export type AnnualReturnCompanyRecord = CompanyWithRelations;

const companyTypes: Record<string, string> = {
  EXEMPTED_PRIVATE_LIMITED: ARD_COMPANY_TYPES.exemptPrivate,
  PRIVATE_LIMITED: ARD_COMPANY_TYPES.private,
  PUBLIC_LIMITED: ARD_COMPANY_TYPES.publicShares,
  PUBLIC_COMPANY_LIMITED_BY_GUARANTEE: ARD_COMPANY_TYPES.publicGuarantee,
};
export const officerRoleLabels: Record<string, string> = {
  DIRECTOR: 'Director',
  MANAGING_DIRECTOR: 'Managing Director',
  ALTERNATE_DIRECTOR: 'Alternate Director',
  NOMINEE_DIRECTOR: 'Nominee Director',
  SECRETARY: 'Secretary',
  CEO: 'CEO',
  CFO: 'CFO',
  AUDITOR: 'Auditor',
  LIQUIDATOR: 'Liquidator',
  RECEIVER: 'Receiver',
  JUDICIAL_MANAGER: 'Judicial Manager',
};
const dateOnly = (value: Date | string | null | undefined) => value ? new Date(value).toISOString().slice(0, 10) : '';
const str = (value: unknown) => value == null ? '' : String(value);
const contactRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const normalizeLabel = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const activity = (code: string | null | undefined, description: string | null | undefined) =>
  [str(code), str(description)].filter(Boolean).join(' - ');

function proposedYearEnd(company: ExtraRecord, now: Date): string {
  const last = company.fyeAsAtLastAr || company.financialPeriods?.at(-1)?.periodEnd;
  if (last) {
    const value = new Date(last);
    if (!Number.isNaN(value.getTime())) {
      const year = value.getUTCFullYear() + 1;
      const month = value.getUTCMonth();
      const day = Math.min(value.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
      const suggested = new Date(Date.UTC(year, month, day));
      return dateOnly(suggested.getTime() <= now.getTime() ? suggested : value);
    }
  }
  const month = company.financialYearEndMonth;
  const day = company.financialYearEndDay;
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return '';
  // Suggest the most recent completed FY, not a speculative future period.
  const year = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCMonth() !== month - 1) return '';
  if (candidate.getTime() > now.getTime()) candidate.setUTCFullYear(year - 1);
  return dateOnly(candidate);
}

type PersonRow = {
  id: string;
  kind: 'Individual' | 'Corporate';
  name: string;
  identification: string;
  nationality: string;
  address: string;
  positions: Array<{ role: string; date: string }>;
  holdings: Array<{ shareClass: string; shares: string }>;
};
type SourcePerson = { id: string; contactId?: string | null; name: string; address?: string | null;
  nationality?: string | null; contact?: unknown; identificationNumber?: string | null };
const tidy = (value: unknown) => str(value).trim();
const canonical = (value: unknown) => tidy(value).replace(/\\s+/g, ' ').toLocaleUpperCase('en');
const officialId = (item: SourcePerson): string =>
  tidy(item.identificationNumber || contactRecord(item.contact).identificationNumber);
const officialAddress = (item: SourcePerson): string =>
  tidy(item.address || contactRecord(item.contact).fullAddress);
const officialNationality = (item: SourcePerson): string =>
  tidy(item.nationality || contactRecord(item.contact).nationality);

function combinedPeople(
  officers: NonNullable<CompanyWithRelations['officers']>,
  shareholders: NonNullable<CompanyWithRelations['shareholders']>,
): PersonRow[] {
  const individuals = new Map<string, PersonRow>();
  const rows: PersonRow[] = [];
  const seenNames = new Map<string, number>();

  // A name-only match is never sufficient: unrelated people can share names.
  // Matching verified contact IDs or identification numbers is preferred.
  // Where both are absent, require both identical full names and addresses.
  const identityKey = (person: SourcePerson) => {
    if (person.contactId) return 'contact:' + person.contactId;
    const id = canonical(officialId(person));
    if (id) return 'identity:' + id;
    const name = canonical(person.name);
    const address = canonical(officialAddress(person));
    return name && address ? 'name_address:' + name + ':' + address : null;
  };
  const add = (person: SourcePerson, kind: PersonRow['kind']): PersonRow => {
    const identity = identityKey(person);
    const existing = identity && individuals.get(identity);
    if (existing) {
      if (kind === 'Corporate') existing.kind = 'Corporate';
      return existing;
    }
    const name = tidy(person.name);
    const identityNumber = officialId(person);
    const address = officialAddress(person);
    const row: PersonRow = {
      id: 'person:' + person.id, kind, name, identification: identityNumber,
      nationality: officialNationality(person), address, positions: [], holdings: [],
    };
    if (identity) individuals.set(identity, row);
    rows.push(row);
    seenNames.set(canonical(name), (seenNames.get(canonical(name)) || 0) + 1);
    return row;
  };

  for (const officer of officers) {
    const row = add(officer as SourcePerson, 'Individual');
    const position = officerRoleLabels[officer.role] || officer.role;
    const date = dateOnly(officer.appointmentDate);
    if (!row.positions.some(item => item.role === position && item.date === date)) {
      row.positions.push({ role: position, date });
    }
  }
  for (const shareholder of shareholders) {
    const corporate = shareholder.shareholderType === 'CORPORATE' ||
      shareholder.shareholderType === 'COMPANY';
    const row = add(shareholder as SourcePerson, corporate ? 'Corporate' : 'Individual');
    const shareClass = tidy(shareholder.shareClass) || 'ORDINARY';
    const shares = str(shareholder.numberOfShares);
    const existing = row.holdings.find(h => h.shareClass === shareClass);
    // Distinct active shareholding records of the same class may be additive.
    // Keep the detail in one person and do not merge across different classes.
    if (existing) {
      const a = Number(existing.shares);
      const b = Number(shares);
      existing.shares = Number.isFinite(a + b) ? String(a + b) : existing.shares;
    } else row.holdings.push({ shareClass, shares });
  }
  if (rows.length > 50) throw new ValidationError('The company has over 50 distinct persons; review capacity before sending');
  return rows;
}

export function buildAnnualReturnPrefill(company: AnnualReturnCompanyRecord, now = new Date()): {
  answers: Record<string, unknown>;
  repeatSectionCounts: Record<string, number>;
} {
  const record = company as ExtraRecord;
  const companyType = companyTypes[record.entityType];
  if (!companyType) throw new ValidationError('Only Singapore companies limited by shares or guarantee can use this declaration');
  const officers = (record.officers || []).filter(item => item.isCurrent && !item.cessationDate);
  const hasShareCapital = companyType !== ARD_COMPANY_TYPES.publicGuarantee;
  const shareholders = hasShareCapital ? (record.shareholders || []).filter(item => item.isCurrent) : [];
  const capitalClasses = new Set<string>();
  const capitals = (hasShareCapital ? record.shareCapital || [] : []).filter(item => {
    if (item.isTreasury) return false;
    const key = item.shareClass + ':' + item.currency;
    if (capitalClasses.has(key)) return false;
    capitalClasses.add(key);
    return true;
  });
  if (capitals.length > 50) throw new ValidationError('The company has more than 50 share capital classes');

  const people = combinedPeople(officers, shareholders);
  const answers: Record<string, unknown> = {
    prefill_source: 'company_record',
    company_name: record.name,
    company_uen: record.uen,
    company_type: companyType,
    financial_year_end: proposedYearEnd(record, now),
    record_as_at: `From our records as at ${dateOnly(now)}. Please correct outdated information; changes are highlighted.`,
    record_entity_status: normalizeLabel(str(record.status)),
    // The SSIC 2025 preset stores five-digit codes as values; descriptions are labels.
    record_primary_activity: tidy(record.primarySsicCode),
    record_secondary_activity: tidy(record.secondarySsicCode),
    record_registered_office: (record.addresses || []).find(
      row => row.isCurrent && row.addressType === 'REGISTERED_OFFICE',
    )?.fullAddress || '',
    record_auditor: tidy(record.auditor?.name),
    ceo_role_listed: people.some(row => row.positions.some(p => p.role === 'CEO')) ? 'Yes' : 'No',
  };

  answers.capital_record_id = capitals.map(c => c.id);
  answers.capital_class = capitals.map(c => str(c.shareClass));
  answers.capital_currency = capitals.map(c => str(c.currency));
  answers.capital_shares = capitals.map(c => str(c.numberOfShares));
  answers.capital_amount = capitals.map(c => str(c.totalValue));
  answers.capital_paid_up = capitals.map(c => {
    if (capitals.length === 1 && record.paidUpCapitalAmount != null) return str(record.paidUpCapitalAmount);
    return c.isPaidUp ? str(c.totalValue) : '';
  });

  answers.person_record_id = people.map(p => p.id);
  answers.person_kind = people.map(p => p.kind);
  answers.person_name = people.map(p => p.name);
  answers.person_id_number = people.map(p => p.identification);
  answers.person_nationality = people.map(p => p.nationality);
  answers.person_address = people.map(p => p.address);
  for (const n of [1, 2, 3]) {
    answers[`person_role_${n}`] = people.map(p => p.positions[n - 1]?.role || '');
    answers[`person_role_date_${n}`] = people.map(p => p.positions[n - 1]?.date || '');
  }
  answers.person_additional_positions = people.map(p =>
    p.positions.slice(3).map(position => position.role + (position.date ? ' (' + position.date + ')' : '')).join('\\n'),
  );
  answers.person_shareholding = people.map(p =>
    p.holdings.map(holding => holding.shareClass + ': ' + holding.shares + ' shares').join('\\n'),
  );
  if (people.some(row => row.positions.some(position => position.role === 'CEO'))) answers.ceo_exists = 'Yes';

  return {
    answers,
    repeatSectionCounts: {
      share_capital_section: Math.max(1, capitals.length),
      people_section: Math.max(1, people.length),
    },
  };
}
