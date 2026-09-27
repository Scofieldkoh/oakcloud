/**
 * Governed catalog of company statutory obligations.
 *
 * `obligationCode` is canonical metadata, separate from a tenant's editable
 * rule name. Coverage profiles select obligation families from this catalog;
 * service names are never parsed to decide what Oakcloud monitors.
 */

export type MonitoringProfile = 'CORPORATE_TAX' | 'NOMINEE_DIRECTOR';

export const MONITORING_PROFILES: readonly MonitoringProfile[] = ['CORPORATE_TAX', 'NOMINEE_DIRECTOR'];

export type ObligationFamily =
  | 'CORPORATE_TAX'
  | 'ANNUAL_RETURN_AGM'
  | 'GST'
  | 'EMPLOYER'
  | 'REGISTERS_AND_EVENTS'
  | 'OTHER_COMPANY_SPECIFIC';

/**
 * PRESET_RULE obligations are calculated from a reviewed published rule.
 * The others stay visible as review items until a reviewed template or an
 * explicit-date entry exists; they are never silently omitted.
 */
export type ObligationAutomation = 'PRESET_RULE' | 'REVIEW_UNTIL_TEMPLATE';

export type ObligationApplicability = 'ALWAYS' | 'GST_REGISTERED';

export type ObligationDefinition = {
  code: string;
  family: ObligationFamily;
  displayName: string;
  authority: 'IRAS' | 'ACRA' | 'CPF' | 'OTHER';
  automation: ObligationAutomation;
  /** Tenant rule code carrying the published rule for PRESET_RULE entries. */
  ruleCode: string | null;
  applicability: ObligationApplicability;
  plainRule: string;
  /** Shown on the review item while the family is not automated. */
  reviewAction: string | null;
};

export const OBLIGATION_CATALOG: readonly ObligationDefinition[] = [
  {
    code: 'SG_ECI',
    family: 'CORPORATE_TAX',
    displayName: 'Estimated Chargeable Income (ECI)',
    authority: 'IRAS',
    automation: 'PRESET_RULE',
    ruleCode: 'SG_ECI',
    applicability: 'ALWAYS',
    plainRule: 'Within three months after the financial year ends',
    reviewAction: null,
  },
  {
    code: 'SG_FORM_C',
    family: 'CORPORATE_TAX',
    displayName: 'Corporate income tax return',
    authority: 'IRAS',
    automation: 'PRESET_RULE',
    ruleCode: 'SG_FORM_C',
    applicability: 'ALWAYS',
    plainRule: '30 November of the Year of Assessment',
    reviewAction: null,
  },
  {
    code: 'SG_ANNUAL_RETURN_AGM',
    family: 'ANNUAL_RETURN_AGM',
    displayName: 'Annual return, AGM and financial statements',
    authority: 'ACRA',
    automation: 'REVIEW_UNTIL_TEMPLATE',
    ruleCode: null,
    applicability: 'ALWAYS',
    plainRule: 'Depends on entity type, financial period and any AGM exemption',
    reviewAction: 'Confirm the annual return and AGM dates for the current financial period, including any exemption or extension.',
  },
  {
    code: 'SG_GST_RETURN',
    family: 'GST',
    displayName: 'GST returns',
    authority: 'IRAS',
    automation: 'REVIEW_UNTIL_TEMPLATE',
    ruleCode: null,
    applicability: 'GST_REGISTERED',
    plainRule: 'One month after each prescribed accounting period',
    reviewAction: 'Record the prescribed GST accounting periods so each return can be tracked.',
  },
  {
    code: 'SG_EMPLOYER_OBLIGATIONS',
    family: 'EMPLOYER',
    displayName: 'Employer and payroll filings',
    authority: 'IRAS',
    automation: 'REVIEW_UNTIL_TEMPLATE',
    ruleCode: null,
    applicability: 'ALWAYS',
    plainRule: 'Depends on employer status (for example employment income and CPF filings)',
    reviewAction: 'Confirm whether the company is an employer and which payroll filings apply.',
  },
  {
    code: 'SG_REGISTERS_AND_EVENTS',
    family: 'REGISTERS_AND_EVENTS',
    displayName: 'Registers and event-driven filings',
    authority: 'ACRA',
    automation: 'REVIEW_UNTIL_TEMPLATE',
    ruleCode: null,
    applicability: 'ALWAYS',
    plainRule: 'Triggered by company changes such as officer, controller or nominee changes',
    reviewAction: 'Confirm with the client whether any company changes, register updates or nominee disclosures are pending.',
  },
  {
    code: 'SG_OTHER_COMPANY_OBLIGATIONS',
    family: 'OTHER_COMPANY_SPECIFIC',
    displayName: 'Licences and other company-specific obligations',
    authority: 'OTHER',
    automation: 'REVIEW_UNTIL_TEMPLATE',
    ruleCode: null,
    applicability: 'ALWAYS',
    plainRule: 'Identified at onboarding (licence renewals, sector notices)',
    reviewAction: 'Record any licence renewals or regulatory obligations identified at onboarding.',
  },
];

/** Families each coverage profile makes Oakcloud responsible for monitoring. */
export const PROFILE_FAMILIES: Record<MonitoringProfile, readonly ObligationFamily[]> = {
  CORPORATE_TAX: ['CORPORATE_TAX'],
  NOMINEE_DIRECTOR: [
    'CORPORATE_TAX',
    'ANNUAL_RETURN_AGM',
    'GST',
    'EMPLOYER',
    'REGISTERS_AND_EVENTS',
    'OTHER_COMPANY_SPECIFIC',
  ],
};

export const MONITORING_PROFILE_LABELS: Record<MonitoringProfile, string> = {
  CORPORATE_TAX: 'Tax engagement',
  NOMINEE_DIRECTOR: 'Nominee director',
};

export function obligationDefinition(code: string): ObligationDefinition | null {
  return OBLIGATION_CATALOG.find((definition) => definition.code === code) ?? null;
}

export function obligationDefinitionForRuleCode(ruleCode: string): ObligationDefinition | null {
  return OBLIGATION_CATALOG.find((definition) => definition.ruleCode === ruleCode) ?? null;
}

export function profileCoversObligation(profile: MonitoringProfile, obligation: ObligationDefinition): boolean {
  return PROFILE_FAMILIES[profile].includes(obligation.family);
}

/** The catalog entries monitored under any of the given profiles, in catalog order. */
export function obligationsForProfiles(profiles: Iterable<MonitoringProfile>): ObligationDefinition[] {
  const families = new Set<ObligationFamily>();
  for (const profile of profiles) {
    for (const family of PROFILE_FAMILIES[profile]) families.add(family);
  }
  return OBLIGATION_CATALOG.filter((definition) => families.has(definition.family));
}

export function isMonitoringProfile(value: unknown): value is MonitoringProfile {
  return typeof value === 'string' && (MONITORING_PROFILES as readonly string[]).includes(value);
}
