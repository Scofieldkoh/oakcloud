/** Pure mapping of an Oakcloud company snapshot to Annual Return Declaration answers. */
import type { CompanyWithRelations } from '@/services/company.service';
import { ValidationError } from '@/lib/errors';
import { ARD_COMPANY_TYPES } from '@/lib/form-templates/sg-annual-return-declaration';

export const AR_RECORD_SECTIONS = [
  { section: 'officers_section', id: 'officer_record_id', label: 'officer_name', fields: ['officer_role', 'officer_name', 'officer_id_number', 'officer_nationality', 'officer_address', 'officer_appointment_date'] },
  { section: 'share_capital_section', id: 'capital_record_id', label: 'capital_class', fields: ['capital_class', 'capital_currency', 'capital_shares', 'capital_amount', 'capital_paid_up'] },
  { section: 'shareholders_section', id: 'shareholder_record_id', label: 'shareholder_name', fields: ['shareholder_name', 'shareholder_id_number', 'shareholder_address', 'shareholder_class', 'shareholder_shares'] },
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

export function buildAnnualReturnPrefill(company: AnnualReturnCompanyRecord, now = new Date()): {
  answers: Record<string, unknown>;
  repeatSectionCounts: Record<string, number>;
} {
  const record = company as ExtraRecord;
  const companyType = companyTypes[record.entityType];
  if (!companyType) throw new ValidationError('Only Singapore companies limited by shares or guarantee can use this declaration');
  const officers = (record.officers || []).filter(item => item.isCurrent && !item.cessationDate);
  // A company limited by guarantee has members rather than shareholders
  // and no share capital; those sections are not shown in the declaration.
  const hasShareCapital = companyType !== ARD_COMPANY_TYPES.publicGuarantee;
  const shareholders = hasShareCapital ? (record.shareholders || []).filter(item => item.isCurrent) : [];
  // The source is ordered newest first. Keep the latest record per class/currency:
  // historical capital movements must not be counted again as current capital.
  const capitalClasses = new Set<string>();
  const capitals = (hasShareCapital ? record.shareCapital || [] : []).filter((item) => {
    if (item.isTreasury) return false;
    const key = `${item.shareClass}:${item.currency}`;
    if (capitalClasses.has(key)) return false;
    capitalClasses.add(key);
    return true;
  });
  const rows = (count: number, label: string) => {
    if (count > 50) throw new ValidationError(`The company has more than 50 ${label}; review the form capacity first`);
  };
  rows(officers.length + (record.auditor ? 1 : 0), 'position holders');
  rows(shareholders.length, 'shareholders');
  rows(capitals.length, 'share capital rows');

  const answers: Record<string, unknown> = {
    prefill_source: 'company_record',
    company_name: record.name,
    company_uen: record.uen,
    company_type: companyType,
    financial_year_end: proposedYearEnd(record, now),
    record_as_at: `From our records as at ${dateOnly(now)}. Please correct anything that is wrong or out of date; your changes are highlighted.`,
    record_entity_status: normalizeLabel(str(record.status)),
    record_primary_activity: activity(record.primarySsicCode, record.primarySsicDescription),
    record_secondary_activity: activity(record.secondarySsicCode, record.secondarySsicDescription),
    record_registered_office: (record.addresses || []).find(row => row.isCurrent && row.addressType === 'REGISTERED_OFFICE')?.fullAddress || '',
  };

  const allOfficers = [...officers.map(o => ({
    id: o.id, role: o.role, name: o.name,
    identification: contactRecord(o).identificationNumber || contactRecord(o.contact).identificationNumber,
    nationality: o.nationality || contactRecord(o.contact).nationality,
    address: o.address || contactRecord(o.contact).fullAddress,
    appointmentDate: o.appointmentDate,
  }))];
  if (record.auditor) {
    allOfficers.push({ id: 'auditor:' + record.id, role: 'AUDITOR', name: record.auditor.name,
      identification: null, nationality: null, address: record.auditor.address, appointmentDate: record.auditor.appointmentDate });
  }
  answers.officer_record_id = allOfficers.map(x => x.id);
  answers.officer_role = allOfficers.map(x => officerRoleLabels[x.role] || x.role);
  answers.officer_name = allOfficers.map(x => str(x.name));
  answers.officer_id_number = allOfficers.map(x => str(x.identification));
  answers.officer_nationality = allOfficers.map(x => str(x.nationality));
  answers.officer_address = allOfficers.map(x => str(x.address));
  answers.officer_appointment_date = allOfficers.map(x => dateOnly(x.appointmentDate));

  answers.capital_record_id = capitals.map(x => x.id);
  answers.capital_class = capitals.map(x => str(x.shareClass));
  answers.capital_currency = capitals.map(x => str(x.currency));
  answers.capital_shares = capitals.map(x => str(x.numberOfShares));
  answers.capital_amount = capitals.map(x => str(x.totalValue));
  answers.capital_paid_up = capitals.map((x) => {
    if (capitals.length === 1 && record.paidUpCapitalAmount != null) return str(record.paidUpCapitalAmount);
    return x.isPaidUp ? str(x.totalValue) : ''; // Unpaid/partly paid: require explicit confirmation.
  });

  answers.shareholder_record_id = shareholders.map(x => x.id);
  answers.shareholder_name = shareholders.map(x => str(x.name));
  answers.shareholder_id_number = shareholders.map(x => str(contactRecord(x).identificationNumber || contactRecord(x.contact).identificationNumber));
  answers.shareholder_address = shareholders.map(x => str(x.address || contactRecord(x.contact).fullAddress));
  answers.shareholder_class = shareholders.map(x => str(x.shareClass));
  answers.shareholder_shares = shareholders.map(x => str(x.numberOfShares));
  if (officers.some(item => item.role === 'CEO')) answers.ceo_exists = 'Yes';

  return {
    answers,
    repeatSectionCounts: Object.fromEntries(AR_RECORD_SECTIONS.map(section => [section.section, Math.max(1, (answers[section.id] as string[]).length)])),
  };
}
