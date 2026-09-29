/**
 * Singapore Company Incorporation form template (version 1).
 *
 * The manifest compiles to ordinary Oakcloud Forms field definitions. Field keys are
 * stable: the intake profile (src/lib/forms/company-incorporation-profile.ts) and the
 * staff review read answers by these keys, so a change to keys, options or conditions
 * needs a new template version rather than an edit to this one.
 */

import type { FieldConditionInput, FormFieldInput } from '@/lib/validations/form-builder';

export const SG_COMPANY_INCORPORATION_TEMPLATE_KEY = 'sg_company_incorporation';
export const SG_COMPANY_INCORPORATION_TEMPLATE_VERSION = 1;
export const SG_COMPANY_INCORPORATION_TITLE = 'Singapore Company Incorporation';
/** Date the ACRA guidance and links below were last checked against the official pages. */
export const SG_COMPANY_INCORPORATION_GUIDANCE_REVIEWED_ON = '2026-09-29';
export const SG_COMPANY_INCORPORATION_PARTY_SECTION_KEY = 'parties_section';

export const INCORPORATION_KEYS = {
  contactName: 'contact_name',
  contactEmail: 'contact_email',
  proposedName: 'proposed_name',
  alternativeName1: 'alternative_name_1',
  alternativeName2: 'alternative_name_2',
  nameStatus: 'name_status',
  approvedName: 'approved_name',
  nameReference: 'name_reference',
  nameReferenceUnavailable: 'name_reference_unavailable',
  primarySsic: 'primary_ssic',
  secondarySsic: 'secondary_ssic',
  businessDescription: 'business_description',
  ssicReviewRequested: 'ssic_review_requested',
  primarySsicException: 'primary_ssic_exception',
  primarySsicExceptionReason: 'primary_ssic_exception_reason',
  companyEmail: 'company_email',
  companyEmailUnavailable: 'company_email_unavailable',
  targetDate: 'target_date',
  partyKind: 'party_kind',
  partyName: 'party_name',
  partyRoles: 'party_roles',
  ownershipPercent: 'ownership_percent',
  ownershipUnsure: 'ownership_unsure',
  partyEmail: 'party_email',
  partyRegistrationReference: 'party_registration_reference',
  capitalUnsure: 'capital_unsure',
  capitalAmount: 'capital_amount',
  capitalCurrency: 'capital_currency',
  capitalPaidStatus: 'capital_paid_status',
  capitalPaidAmount: 'capital_paid_amount',
  ownershipArrangement: 'ownership_arrangement',
  sharesForOthers: 'shares_for_others',
  directorsForOthers: 'directors_for_others',
  otherControl: 'other_control',
  arrangementNotes: 'arrangement_notes',
  existingShareSchedule: 'existing_share_schedule',
  officeChoice: 'office_choice',
  officePostalCode: 'office_postal_code',
  officeBlockStreet: 'office_block_street',
  officeBuilding: 'office_building',
  officeUnit: 'office_unit',
  officeHoursPending: 'office_hours_pending',
  officeOpenTime: 'office_open_time',
  officeCloseTime: 'office_close_time',
  officeHoursNote: 'office_hours_note',
  residentDirectorHelp: 'resident_director_help',
  secretaryChoice: 'secretary_choice',
  secretaryName: 'secretary_name',
  yearEndChoice: 'year_end_choice',
  firstFye: 'first_fye',
  financialYearPeriod: 'financial_year_period',
  rulesPreference: 'rules_preference',
  modelAdoptionMode: 'model_adoption_mode',
  customConstitutionStatus: 'custom_constitution_status',
  customConstitution: 'custom_constitution',
  otherAppointments: 'other_appointments',
  otherNotes: 'other_notes',
} as const;

const K = INCORPORATION_KEYS;

export const ACRA_GUIDANCE_LINKS = {
  businessName: 'https://www.acra.gov.sg/register/business/choosing-reserving-a-business-name/choosing/',
  nameApplication: 'https://www.acra.gov.sg/resources/guides-forms/apply-for-new-business-entity-name/',
  ssic: 'https://www.acra.gov.sg/register/business/choosing-reserving-a-business-name/finding-the-right-ssic-code/',
  referralAuthorities: 'https://www.acra.gov.sg/register/business/choosing-reserving-a-business-name/referral-authorities/',
  directors: 'https://www.acra.gov.sg/register/business/registering-different-business-structures/local-company/appointing-company-directors-other-key-officers/',
  companyType: 'https://www.acra.gov.sg/register/business/registering-different-business-structures/local-company/choosing-a-company-type/',
  shareCapital: 'https://www.acra.gov.sg/register/business/registering-different-business-structures/local-company/deciding-on-share-capital-share-types/',
  nomineeRegisters: 'https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/maintaining-local-companys-information-registers/rond-rons/filing-to-the-central-rond-rons/',
  controllers: 'https://www.acra.gov.sg/manage/companies/legal-requirements-common-offences/maintaining-local-companys-information-registers/rorc/registrable-controllers/',
  bizfileIncorporation: 'https://www.acra.gov.sg/register/business/registering-different-business-structures/local-company/registering-via-bizfile/',
  financialYearEnd: 'https://www.acra.gov.sg/register/business/registering-different-business-structures/local-company/choosing-a-companys-financial-year-end/',
  companiesActS198: 'https://sso.agc.gov.sg/Act/CoA1967?WholeDoc=1',
  constitution: 'https://www.acra.gov.sg/register/business/registering-different-business-structures/local-company/company-constitution/',
} as const;

export interface IncorporationGuidanceItem {
  id: string;
  /** Field key the guidance sits on, or the section heading key. */
  fieldKey: string;
  links: Array<{ label: string; url: string }>;
  reviewedOn: string;
  textVersion: number;
}

function link(url: string, label: string): string {
  return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

/** G01–G12 from the handover plan, with the field each one is published on. */
export const SG_COMPANY_INCORPORATION_GUIDANCE: IncorporationGuidanceItem[] = [
  { id: 'G01', fieldKey: K.proposedName, links: [{ label: 'ACRA: Choosing a business name', url: ACRA_GUIDANCE_LINKS.businessName }] },
  { id: 'G02', fieldKey: K.approvedName, links: [{ label: 'ACRA: Name application', url: ACRA_GUIDANCE_LINKS.nameApplication }] },
  { id: 'G03', fieldKey: K.primarySsic, links: [{ label: 'ACRA: Finding the right SSIC code', url: ACRA_GUIDANCE_LINKS.ssic }] },
  { id: 'G04', fieldKey: K.businessDescription, links: [{ label: 'ACRA: Referral authorities', url: ACRA_GUIDANCE_LINKS.referralAuthorities }] },
  { id: 'G05', fieldKey: 'parties_guidance', links: [{ label: 'ACRA: Directors and key officers', url: ACRA_GUIDANCE_LINKS.directors }] },
  { id: 'G06', fieldKey: K.capitalAmount, links: [{ label: 'ACRA: Share capital', url: ACRA_GUIDANCE_LINKS.shareCapital }] },
  { id: 'G07', fieldKey: K.ownershipArrangement, links: [{ label: 'ACRA: Share types', url: ACRA_GUIDANCE_LINKS.shareCapital }] },
  {
    id: 'G08',
    fieldKey: 'arrangements_guidance',
    links: [
      { label: 'ACRA: Nominee registers', url: ACRA_GUIDANCE_LINKS.nomineeRegisters },
      { label: 'ACRA: Identifying registrable controllers', url: ACRA_GUIDANCE_LINKS.controllers },
    ],
  },
  { id: 'G09', fieldKey: K.officeChoice, links: [{ label: 'ACRA: Incorporation particulars', url: ACRA_GUIDANCE_LINKS.bizfileIncorporation }] },
  { id: 'G10', fieldKey: K.secretaryChoice, links: [{ label: 'ACRA: Company secretary', url: ACRA_GUIDANCE_LINKS.directors }] },
  {
    id: 'G11',
    fieldKey: K.yearEndChoice,
    links: [
      { label: 'ACRA: Choosing a financial year end', url: ACRA_GUIDANCE_LINKS.financialYearEnd },
      { label: 'Companies Act 1967, section 198', url: ACRA_GUIDANCE_LINKS.companiesActS198 },
    ],
  },
  { id: 'G12', fieldKey: K.rulesPreference, links: [{ label: 'ACRA: Company constitution', url: ACRA_GUIDANCE_LINKS.constitution }] },
].map((item) => ({ ...item, reviewedOn: SG_COMPANY_INCORPORATION_GUIDANCE_REVIEWED_ON, textVersion: 1 }));

function guidanceLinks(id: string): string {
  const item = SG_COMPANY_INCORPORATION_GUIDANCE.find((entry) => entry.id === id);
  if (!item) return '';
  return item.links.map((entry) => link(entry.url, entry.label)).join(' · ');
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export const NAME_STATUS = {
  notReserved: 'not_reserved',
  reserved: 'reserved',
  pending: 'application_pending',
  toBeConfirmed: 'to_be_confirmed',
} as const;

export const SSIC_EXCEPTION = {
  noSuitableCode: 'no_suitable_code',
  catalogueUnavailable: 'catalogue_unavailable',
} as const;

export const PARTY_KIND = { individual: 'individual', organisation: 'organisation' } as const;
export const PARTY_ROLE = { shareholder: 'shareholder', director: 'director' } as const;

export const PAID_STATUS = {
  fully: 'fully_paid',
  partially: 'partially_paid',
  unpaid: 'unpaid',
  notFinalised: 'not_finalised',
} as const;

export const SHARE_STRUCTURE = { ordinary: 'ordinary_equal', other: 'other_structure', advice: 'advice_required' } as const;
export const YES_NO_CLARIFY = { yes: 'yes', no: 'no', clarify: 'clarification_required' } as const;

export const OFFICE_CHOICE = { own: 'own_address', firmService: 'firm_service', pending: 'arrangement_pending' } as const;
export const RESIDENT_DIRECTOR = { identified: 'identified', assistance: 'assistance_required', pending: 'pending_confirmation' } as const;
export const SECRETARY_CHOICE = {
  firm: 'firm_to_arrange',
  identified: 'identified',
  afterIncorporation: 'after_incorporation',
  advice: 'advice_required',
} as const;
export const YEAR_END_CHOICE = { selectDate: 'select_date', advice: 'advice_required' } as const;
export const FY_PERIOD = { twelveMonths: '12_months', fiftyTwoWeeks: '52_weeks', advice: 'advice_required' } as const;
export const CONSTITUTION = { model: 'acra_model', custom: 'custom', advice: 'advice_required' } as const;
export const MODEL_ADOPTION = { atIncorporation: 'at_incorporation', asAmended: 'as_amended', advice: 'advice_required' } as const;
export const CUSTOM_CONSTITUTION_STATUS = { upload: 'upload', beingPrepared: 'being_prepared' } as const;
export const TICK = 'yes';

export const CAPITAL_CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'AUD', 'CNY', 'HKD', 'JPY', 'MYR', 'IDR', 'INR', 'THB'];

// ---------------------------------------------------------------------------
// Field builders
// ---------------------------------------------------------------------------

type FieldDraft = Omit<FormFieldInput, 'position' | 'isRequired' | 'hideLabel' | 'isReadOnly' | 'layoutWidth'> & {
  isRequired?: boolean;
  hideLabel?: boolean;
  isReadOnly?: boolean;
  layoutWidth?: FormFieldInput['layoutWidth'];
};

const eq = (fieldKey: string, value: string): FieldConditionInput => ({ fieldKey, operator: 'equals', value });
const contains = (fieldKey: string, value: string): FieldConditionInput => ({ fieldKey, operator: 'contains', value });
const empty = (fieldKey: string): FieldConditionInput => ({ fieldKey, operator: 'is_empty' });
const notEmpty = (fieldKey: string): FieldConditionInput => ({ fieldKey, operator: 'not_empty' });
const all = (...rules: FieldConditionInput[]): FieldConditionInput => ({ logic: 'and', rules });
const any = (...rules: FieldConditionInput[]): FieldConditionInput => ({ logic: 'or', rules });

function choices(entries: Array<[string, string]>) {
  return entries.map(([value, label]) => ({ value, label }));
}

function pageBreak(key: string, label: string): FieldDraft {
  return { type: 'PAGE_BREAK', key, label };
}

function heading(key: string, label: string, subtext?: string): FieldDraft {
  return { type: 'PARAGRAPH', inputType: 'info_heading_2', key, label, subtext: subtext ?? null };
}

function info(key: string, html: string, extra: Partial<FieldDraft> = {}): FieldDraft {
  return {
    type: 'PARAGRAPH',
    inputType: 'info_text',
    key,
    subtext: html,
    validation: { infoInlineCard: true, infoShowInPdf: false },
    ...extra,
  };
}

/** Longer "Requirements and examples" text, opened from the field's info button. */
function requirements(html: string): Pick<FieldDraft, 'helpText'> & { validation: Record<string, unknown> } {
  return { helpText: html, validation: { tooltipEnabled: true, tooltipMode: 'inline' } };
}

function withValidation<T extends { validation: Record<string, unknown> }>(draft: T, validation: Record<string, unknown>): T {
  return { ...draft, validation: { ...draft.validation, ...validation } };
}

function tickBox(key: string, label: string, optionLabel: string, extra: Partial<FieldDraft> = {}): FieldDraft {
  return {
    type: 'MULTIPLE_CHOICE',
    key,
    label,
    hideLabel: true,
    options: choices([[TICK, optionLabel]]),
    ...extra,
  };
}

export interface SgCompanyIncorporationBuildOptions {
  firmName: string;
  /** Tenant's built-in SSIC 2025 option preset. */
  ssicPresetId: string;
  offersRegisteredOffice?: boolean;
  offersSecretary?: boolean;
}

function buildFieldDrafts(options: SgCompanyIncorporationBuildOptions): FieldDraft[] {
  const firm = options.firmName.trim() || 'our firm';
  const offersRegisteredOffice = options.offersRegisteredOffice !== false;
  const offersSecretary = options.offersSecretary !== false;

  const officeChoices: Array<[string, string]> = [[OFFICE_CHOICE.own, 'Own Singapore address']];
  if (offersRegisteredOffice) officeChoices.push([OFFICE_CHOICE.firmService, `${firm}'s registered office service`]);
  officeChoices.push([OFFICE_CHOICE.pending, 'Arrangement pending']);

  const secretaryChoices: Array<[string, string]> = [];
  if (offersSecretary) secretaryChoices.push([SECRETARY_CHOICE.firm, `${firm} to arrange`]);
  secretaryChoices.push(
    [SECRETARY_CHOICE.identified, 'Already appointed or identified'],
    [SECRETARY_CHOICE.afterIncorporation, 'Appointment after incorporation'],
    [SECRETARY_CHOICE.advice, 'Advice required'],
  );

  const reservedOrPending = any(eq(K.nameStatus, NAME_STATUS.reserved), eq(K.nameStatus, NAME_STATUS.pending));
  const ownOffice = eq(K.officeChoice, OFFICE_CHOICE.own);
  const specialArrangement = any(
    eq(K.ownershipArrangement, SHARE_STRUCTURE.other),
    eq(K.sharesForOthers, YES_NO_CLARIFY.yes),
    eq(K.sharesForOthers, YES_NO_CLARIFY.clarify),
    eq(K.directorsForOthers, YES_NO_CLARIFY.yes),
    eq(K.directorsForOthers, YES_NO_CLARIFY.clarify),
    eq(K.otherControl, YES_NO_CLARIFY.yes),
    eq(K.otherControl, YES_NO_CLARIFY.clarify),
  );
  const yesNoClarify = choices([
    [YES_NO_CLARIFY.no, 'No'],
    [YES_NO_CLARIFY.yes, 'Yes'],
    [YES_NO_CLARIFY.clarify, 'Clarification required'],
  ]);

  return [
    // -----------------------------------------------------------------------
    // Step 1 — Company details
    // -----------------------------------------------------------------------
    heading('step_company_details', 'Company details'),
    info(
      'intro_notice',
      `<p>Complete the company details below for incorporation in Singapore. Select the most appropriate options and provide the information available to you. Guidance and ACRA references are provided throughout the form.</p>`
        + `<p>Personal information and declarations are collected separately through KYC/CDD. You may save your progress and return later.</p>`
        + `<p><strong>Submission is for review by ${firm}. It does not reserve a name or register a company.</strong></p>`,
    ),
    { type: 'SHORT_TEXT', inputType: 'text', key: K.contactName, label: 'Contact person', subtext: 'The person we should contact about this application.', isRequired: true, layoutWidth: 50, validation: { maxLength: 200 } },
    { type: 'SHORT_TEXT', inputType: 'email', key: K.contactEmail, label: 'Contact email', isRequired: true, layoutWidth: 50, validation: { maxLength: 320 } },

    heading('section_company_name', 'Company name'),
    {
      type: 'COMPANY_NAME_CHECK',
      key: K.proposedName,
      label: 'Company name',
      placeholder: 'e.g. Harbourline Trading Pte. Ltd.',
      subtext: `Enter the proposed name and select Check name. This preliminary check does not reserve or approve the name. ${guidanceLinks('G01')}`,
      isRequired: true,
      ...withValidation(requirements(
        '<p>Avoid names identical to a registered or reserved name, and undesirable or legally protected names.</p>'
          + '<p>Adding “Pte Ltd” or “Singapore” alone does not make a name distinct. Words such as “Singapore”, “Holdings” or “Group” are disregarded when names are compared.</p>',
      ), { nameCheckMode: 'advisory' }),
    },
    { type: 'SHORT_TEXT', inputType: 'text', key: K.alternativeName1, label: 'Alternative company name 1', subtext: 'Optional fallback if the first name cannot be used. Alternatives are instructions to us, not reserved names.', layoutWidth: 50, validation: { maxLength: 300 } },
    { type: 'SHORT_TEXT', inputType: 'text', key: K.alternativeName2, label: 'Alternative company name 2', layoutWidth: 50, validation: { maxLength: 300 } },
    {
      type: 'SINGLE_CHOICE',
      key: K.nameStatus,
      label: 'Name reservation status',
      subtext: 'Whether this name has already been applied for with ACRA. The name check above does not change this.',
      isRequired: true,
      options: choices([
        [NAME_STATUS.notReserved, 'Not reserved'],
        [NAME_STATUS.reserved, 'Reserved with ACRA'],
        [NAME_STATUS.pending, 'Application pending'],
        [NAME_STATUS.toBeConfirmed, 'Status to be confirmed'],
      ]),
    },
    {
      type: 'SHORT_TEXT',
      inputType: 'text',
      key: K.approvedName,
      label: 'Reserved company name',
      subtext: `Enter the exact name as applied for or approved. A reservation is normally held for 120 days; our team will verify its expiry and the company type selected. ${guidanceLinks('G02')}`,
      isRequired: true,
      layoutWidth: 66,
      condition: reservedOrPending,
      validation: { maxLength: 300 },
    },
    {
      type: 'SHORT_TEXT',
      inputType: 'text',
      key: K.nameReference,
      label: 'ACRA application reference',
      isRequired: true,
      layoutWidth: 33,
      condition: all(reservedOrPending, empty(K.nameReferenceUnavailable)),
      validation: { maxLength: 60 },
    },
    tickBox(K.nameReferenceUnavailable, 'Reference unavailable', 'I do not have the application reference', { condition: reservedOrPending }),

    heading('section_business_activity', 'Business activities', 'SSIC is Singapore’s business activity classification. Every company records a primary activity and may add one secondary activity.'),
    {
      type: 'DROPDOWN',
      key: K.primarySsic,
      label: 'Primary business activity (SSIC)',
      placeholder: 'Search by activity or 5-digit code',
      subtext: `Search by keyword or code and select the activity that most closely describes the business. Our team will review your selection against the description. ${guidanceLinks('G03')}`,
      isRequired: true,
      optionPresetId: options.ssicPresetId,
      condition: empty(K.primarySsicException),
    },
    {
      type: 'DROPDOWN',
      key: K.secondarySsic,
      label: 'Secondary business activity (SSIC)',
      placeholder: 'Optional: search by activity or 5-digit code',
      subtext: 'Add one secondary activity only if it applies. It must differ from the primary activity.',
      optionPresetId: options.ssicPresetId,
    },
    {
      type: 'LONG_TEXT',
      key: K.businessDescription,
      label: 'Brief business description',
      placeholder: 'Describe your main products or services and how the business will operate in 1–3 sentences.',
      subtext: `For example, “Retail sale of home furniture through an online store”. Some names or activities need another agency’s review, and incorporation does not replace any required operating licence. ${guidanceLinks('G04')}`,
      isRequired: true,
      validation: { maxLength: 1000 },
    },
    tickBox(K.ssicReviewRequested, 'SSIC selection review', 'Please review my selected activity code'),
    {
      type: 'DROPDOWN',
      key: K.primarySsicException,
      label: 'Activity selection issue',
      placeholder: 'No issue: I selected an activity',
      subtext: 'Use this only if no listed activity fits after searching, or the list did not load. Clear it to return to activity selection.',
      options: choices([
        [SSIC_EXCEPTION.noSuitableCode, 'No suitable activity found'],
        [SSIC_EXCEPTION.catalogueUnavailable, 'Activity list did not load'],
      ]),
      layoutWidth: 50,
    },
    {
      type: 'LONG_TEXT',
      key: K.primarySsicExceptionReason,
      label: 'Details',
      placeholder: 'Which activities did you consider, and why did none fit?',
      isRequired: true,
      condition: notEmpty(K.primarySsicException),
      validation: { maxLength: 1000 },
    },

    heading('section_company_contact', 'Company contact and timing'),
    {
      type: 'SHORT_TEXT',
      inputType: 'email',
      key: K.companyEmail,
      label: 'Company email',
      subtext: 'The company’s own correspondence email, recorded with ACRA.',
      isRequired: true,
      layoutWidth: 50,
      condition: empty(K.companyEmailUnavailable),
      validation: { maxLength: 320 },
    },
    {
      type: 'SHORT_TEXT',
      inputType: 'date',
      key: K.targetDate,
      label: 'Preferred incorporation date',
      subtext: 'Optional. This is a preference, not a guaranteed registration date.',
      layoutWidth: 50,
      validation: { minDate: 'today' },
    },
    tickBox(K.companyEmailUnavailable, 'Company email not yet established', 'The company email is not yet set up'),

    // -----------------------------------------------------------------------
    // Step 2 — Shareholders and directors
    // -----------------------------------------------------------------------
    pageBreak('page_parties', 'Shareholders and directors'),
    heading('step_parties', 'Shareholders and directors'),
    info(
      'parties_guidance',
      '<p>Add each shareholder and director once. Select both roles where applicable. Personal particulars will be obtained from the separate KYC/CDD record.</p>'
        + '<p>A <strong>shareholder</strong> is a person or organisation that owns shares; a <strong>director</strong> manages the company. At least one director must meet Singapore residency and eligibility requirements, and directors must be at least 18. We will check eligibility using KYC and any applicable pass conditions.</p>'
        + `<p>${guidanceLinks('G05')}</p>`,
    ),
    {
      type: 'PARAGRAPH',
      inputType: 'info_faq',
      key: 'parties_faq',
      label: 'Requirements and examples',
      options: [
        {
          label: 'How many shareholders can a private company have?',
          bodyHtml: `<p>A private company is generally limited to 50 shareholders. An exempt private company usually has no more than 20 members and restrictions on corporate owners. You do not need to decide the company classification; our team confirms it from your answers. ${link(ACRA_GUIDANCE_LINKS.companyType, 'ACRA: Choosing a company type')}</p>`,
        },
        {
          label: 'Can an organisation be a director?',
          bodyHtml: '<p>No. An organisation can be a shareholder, but only individuals can be directors.</p>',
        },
        {
          label: 'What if ownership is not decided yet?',
          bodyHtml: '<p>Tick “Allocation not finalised” for that shareholder. You can still submit, and we will follow up. Percentages are your ownership instruction; our team prepares the exact share allotment for your confirmation.</p>',
        },
      ],
      validation: { faqDefaultState: 'collapsed' },
    },
    {
      type: 'PAGE_BREAK',
      inputType: 'repeat_start',
      key: SG_COMPANY_INCORPORATION_PARTY_SECTION_KEY,
      label: 'Shareholders and directors',
      validation: {
        repeatMinItems: 1,
        repeatMaxItems: 50,
        repeatAddLabel: 'Add shareholder or director',
        repeatItemLabel: 'Shareholder or director',
        repeatTotalFieldKey: K.ownershipPercent,
        repeatTotalLabel: 'Ownership allocated',
        repeatTotalSuffix: '%',
        repeatTotalTarget: 100,
      },
    },
    {
      type: 'SINGLE_CHOICE',
      key: K.partyKind,
      label: 'Party type',
      isRequired: true,
      layoutWidth: 50,
      options: choices([
        [PARTY_KIND.individual, 'Individual'],
        [PARTY_KIND.organisation, 'Company or other organisation'],
      ]),
    },
    {
      type: 'MULTIPLE_CHOICE',
      key: K.partyRoles,
      label: 'Role',
      subtext: 'Select both when applicable.',
      isRequired: true,
      layoutWidth: 50,
      options: choices([
        [PARTY_ROLE.shareholder, 'Shareholder'],
        [PARTY_ROLE.director, 'Director'],
      ]),
    },
    {
      type: 'SHORT_TEXT',
      inputType: 'text',
      key: K.partyName,
      label: 'Full legal name / Registered entity name',
      subtext: 'As shown on the passport, NRIC or registration record used for KYC.',
      isRequired: true,
      layoutWidth: 66,
      validation: { maxLength: 300 },
    },
    {
      type: 'SHORT_TEXT',
      inputType: 'number',
      key: K.ownershipPercent,
      label: 'Shareholding percentage (%)',
      placeholder: 'e.g. 60',
      isRequired: true,
      layoutWidth: 33,
      condition: all(contains(K.partyRoles, PARTY_ROLE.shareholder), empty(K.ownershipUnsure)),
      validation: { min: 0, max: 100 },
    },
    {
      type: 'PARAGRAPH',
      inputType: 'info_text',
      key: 'party_director_organisation_notice',
      subtext: 'An organisation can be a shareholder but not a director. Untick Director for this party.',
      condition: all(eq(K.partyKind, PARTY_KIND.organisation), contains(K.partyRoles, PARTY_ROLE.director)),
      validation: { infoStopsProgress: true, infoShowInPdf: false },
    },
    tickBox(K.ownershipUnsure, 'Allocation not finalised', 'Allocation not finalised', {
      condition: contains(K.partyRoles, PARTY_ROLE.shareholder),
    }),
    {
      type: 'SHORT_TEXT',
      inputType: 'email',
      key: K.partyEmail,
      label: 'KYC contact email',
      subtext: 'Optional. For coordinating the separate KYC/CDD submission. For an organisation, this may be its representative’s email.',
      layoutWidth: 50,
      validation: { maxLength: 320 },
    },
    {
      type: 'SHORT_TEXT',
      inputType: 'text',
      key: K.partyRegistrationReference,
      label: 'UEN / foreign registration number',
      subtext: 'Enter if known.',
      layoutWidth: 50,
      condition: eq(K.partyKind, PARTY_KIND.organisation),
      validation: { maxLength: 60 },
    },
    { type: 'PAGE_BREAK', inputType: 'repeat_end', key: 'parties_section_end' },

    // -----------------------------------------------------------------------
    // Step 3 — Share capital and ownership
    // -----------------------------------------------------------------------
    pageBreak('page_capital', 'Share capital and ownership'),
    heading('step_capital', 'Share capital and ownership'),
    {
      type: 'SHORT_TEXT',
      inputType: 'number',
      key: K.capitalAmount,
      label: 'Share capital',
      placeholder: 'e.g. 1000',
      subtext: `Share capital is the amount committed for shares. ACRA states a minimum of $1 share capital. ${guidanceLinks('G06')}`,
      isRequired: true,
      layoutWidth: 66,
      condition: empty(K.capitalUnsure),
      validation: { min: 0 },
    },
    {
      type: 'DROPDOWN',
      key: K.capitalCurrency,
      label: 'Currency',
      isRequired: true,
      layoutWidth: 33,
      condition: empty(K.capitalUnsure),
      options: choices(CAPITAL_CURRENCIES.map((code) => [code, code])),
      validation: { defaultValue: 'SGD' },
    },
    tickBox(K.capitalUnsure, 'Capital not finalised', 'Capital not finalised'),
    {
      type: 'SINGLE_CHOICE',
      key: K.capitalPaidStatus,
      label: 'Payment status',
      subtext: 'Paid-up capital is the amount actually paid for the shares. It may be less than the share capital, but cannot exceed it.',
      isRequired: true,
      options: choices([
        [PAID_STATUS.fully, 'Fully paid'],
        [PAID_STATUS.partially, 'Partially paid'],
        [PAID_STATUS.unpaid, 'Unpaid'],
        [PAID_STATUS.notFinalised, 'Not finalised'],
      ]),
    },
    {
      type: 'SHORT_TEXT',
      inputType: 'number',
      key: K.capitalPaidAmount,
      label: 'Paid-up capital',
      placeholder: 'Amount actually paid',
      isRequired: true,
      layoutWidth: 50,
      condition: eq(K.capitalPaidStatus, PAID_STATUS.partially),
      validation: { min: 0 },
    },
    {
      type: 'SINGLE_CHOICE',
      key: K.ownershipArrangement,
      label: 'Share structure',
      subtext: `Ordinary shares with equal rights are the usual starting point. Different voting, dividend or other rights need to be reflected in the share structure and constitution. ${guidanceLinks('G07')}`,
      isRequired: true,
      options: choices([
        [SHARE_STRUCTURE.ordinary, 'Ordinary shares with equal rights'],
        [SHARE_STRUCTURE.other, 'Other share structure'],
        [SHARE_STRUCTURE.advice, 'Advice required'],
      ]),
    },
    heading('section_arrangements', 'Ownership and control arrangements'),
    info(
      'arrangements_guidance',
      '<p>Disclose arrangements where shares or directorships are held for another party. Ownership and control can also arise through special rights. We will confirm the required register information using these answers and KYC/CDD.</p>'
        + `<p>${guidanceLinks('G08')}</p>`,
    ),
    {
      type: 'SINGLE_CHOICE',
      key: K.sharesForOthers,
      label: 'Shares held on behalf of another party',
      subtext: 'For example, a shareholder holding shares as a nominee or trustee for someone else.',
      isRequired: true,
      options: yesNoClarify,
      validation: { choiceInlineRight: true },
    },
    {
      type: 'SINGLE_CHOICE',
      key: K.directorsForOthers,
      label: 'Director acting on another party’s instructions',
      subtext: 'A director who is accustomed or obliged to act on someone else’s directions (a nominee director). Ordinary board decisions do not count.',
      isRequired: true,
      options: yesNoClarify,
      validation: { choiceInlineRight: true },
    },
    {
      type: 'SINGLE_CHOICE',
      key: K.otherControl,
      label: 'Other control arrangements',
      subtext: 'For example, special voting rights or a right to appoint or remove most directors.',
      isRequired: true,
      options: yesNoClarify,
      validation: { choiceInlineRight: true },
    },
    {
      type: 'LONG_TEXT',
      key: K.arrangementNotes,
      label: 'Arrangement details',
      placeholder: 'Describe the arrangement, including who is involved.',
      subtext: 'Give a short explanation. Our team will follow up on the details.',
      condition: specialArrangement,
      validation: { maxLength: 3000 },
    },
    {
      type: 'FILE_UPLOAD',
      key: K.existingShareSchedule,
      label: 'Existing share schedule',
      subtext: 'Optional. Upload an agreed schedule if you have one (PDF, JPEG or PNG, up to 10 MB).',
      condition: specialArrangement,
      validation: { maxFileSizeMb: 10, allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] },
    },

    // -----------------------------------------------------------------------
    // Step 4 — Registered office and company settings
    // -----------------------------------------------------------------------
    pageBreak('page_settings', 'Registered office and company settings'),
    heading('step_office', 'Registered office'),
    {
      type: 'SINGLE_CHOICE',
      key: K.officeChoice,
      label: 'Registered office arrangement',
      subtext: `Provide a Singapore registered office address, not merely a mailing or PO box address. It must be accessible for at least three hours on each business day, and need not be where business operations take place. ${guidanceLinks('G09')}`,
      isRequired: true,
      options: choices(officeChoices),
    },
    { type: 'SHORT_TEXT', inputType: 'text', key: K.officePostalCode, label: 'Postal code', placeholder: '6 digits', isRequired: true, layoutWidth: 33, condition: ownOffice, validation: { minLength: 6, maxLength: 6 } },
    { type: 'SHORT_TEXT', inputType: 'text', key: K.officeBlockStreet, label: 'Block/house number and street', isRequired: true, layoutWidth: 66, condition: ownOffice, validation: { maxLength: 200 } },
    { type: 'SHORT_TEXT', inputType: 'text', key: K.officeBuilding, label: 'Building', subtext: 'If applicable.', layoutWidth: 66, condition: ownOffice, validation: { maxLength: 200 } },
    { type: 'SHORT_TEXT', inputType: 'text', key: K.officeUnit, label: 'Unit', placeholder: 'e.g. #05-12', subtext: 'If applicable.', layoutWidth: 33, condition: ownOffice, validation: { maxLength: 30 } },
    {
      type: 'SHORT_TEXT',
      inputType: 'time_timezone',
      key: K.officeOpenTime,
      label: 'Registered office opens',
      subtext: 'Singapore time. The office must be accessible for at least three hours on each business day.',
      isRequired: true,
      layoutWidth: 50,
      condition: all(ownOffice, empty(K.officeHoursPending)),
      validation: { timezoneDefault: 'Asia/Singapore' },
    },
    {
      type: 'SHORT_TEXT',
      inputType: 'time_timezone',
      key: K.officeCloseTime,
      label: 'Registered office closes',
      isRequired: true,
      layoutWidth: 50,
      condition: all(ownOffice, empty(K.officeHoursPending)),
      validation: { timezoneDefault: 'Asia/Singapore' },
    },
    tickBox(K.officeHoursPending, 'Registered office hours pending', 'Hours are not yet confirmed or differ by day', { condition: ownOffice }),
    {
      type: 'LONG_TEXT',
      key: K.officeHoursNote,
      label: 'Office hours details',
      placeholder: 'Explain the expected hours or what is still to be confirmed.',
      isRequired: true,
      condition: all(ownOffice, notEmpty(K.officeHoursPending)),
      validation: { maxLength: 1000 },
    },

    heading('section_officers', 'Directors and company secretary'),
    {
      type: 'SINGLE_CHOICE',
      key: K.residentDirectorHelp,
      label: 'Singapore-resident director arrangement',
      subtext: 'At least one director must be ordinarily resident in Singapore. We verify eligibility separately through KYC.',
      isRequired: true,
      options: choices([
        [RESIDENT_DIRECTOR.identified, 'Director identified'],
        [RESIDENT_DIRECTOR.assistance, 'Assistance required'],
        [RESIDENT_DIRECTOR.pending, 'Pending confirmation'],
      ]),
    },
    {
      type: 'SINGLE_CHOICE',
      key: K.secretaryChoice,
      label: 'Company secretary arrangement',
      subtext: `A company secretary must be appointed within six months of incorporation. The secretary must be an eligible individual and cannot also be the company’s sole director. ${guidanceLinks('G10')}`,
      isRequired: true,
      options: choices(secretaryChoices),
    },
    {
      type: 'SHORT_TEXT',
      inputType: 'text',
      key: K.secretaryName,
      label: 'Secretary name',
      subtext: 'Name only. Their particulars are collected through KYC.',
      isRequired: true,
      layoutWidth: 66,
      condition: eq(K.secretaryChoice, SECRETARY_CHOICE.identified),
      validation: { maxLength: 200 },
    },

    heading('section_financial_year', 'Financial year end'),
    {
      type: 'SINGLE_CHOICE',
      key: K.yearEndChoice,
      label: 'First financial year end (FYE)',
      subtext: `The FYE is the date the company’s first accounting period ends. The first financial year cannot exceed 18 months without Registrar approval; our team will check it against the incorporation date. ${guidanceLinks('G11')}`,
      isRequired: true,
      options: choices([
        [YEAR_END_CHOICE.selectDate, 'Select a date'],
        [YEAR_END_CHOICE.advice, 'Advice required'],
      ]),
    },
    {
      type: 'SHORT_TEXT',
      inputType: 'date',
      key: K.firstFye,
      label: 'First FYE date',
      subtext: 'Enter a full date, including the year.',
      isRequired: true,
      layoutWidth: 50,
      condition: eq(K.yearEndChoice, YEAR_END_CHOICE.selectDate),
      validation: { minDate: 'today' },
    },
    {
      type: 'SINGLE_CHOICE',
      key: K.financialYearPeriod,
      label: 'Accounting period',
      subtext: 'Financial years normally run for 12 months or 52 weeks.',
      isRequired: true,
      options: choices([
        [FY_PERIOD.twelveMonths, '12 months'],
        [FY_PERIOD.fiftyTwoWeeks, '52 weeks'],
        [FY_PERIOD.advice, 'Advice required'],
      ]),
    },

    heading('section_constitution', 'Company constitution'),
    {
      type: 'SINGLE_CHOICE',
      key: K.rulesPreference,
      label: 'Company constitution',
      subtext: `The constitution sets the company’s rules. ACRA provides a model constitution, or a custom version may be used. Our team will confirm execution requirements. ${guidanceLinks('G12')}`,
      isRequired: true,
      options: choices([
        [CONSTITUTION.model, 'ACRA model constitution'],
        [CONSTITUTION.custom, 'Custom constitution'],
        [CONSTITUTION.advice, 'Advice required'],
      ]),
    },
    {
      type: 'SINGLE_CHOICE',
      key: K.modelAdoptionMode,
      label: 'Model constitution adoption',
      subtext: '“At incorporation” keeps the model version in force when the company is registered; “as amended from time to time” adopts future amendments to the model.',
      isRequired: true,
      condition: eq(K.rulesPreference, CONSTITUTION.model),
      options: choices([
        [MODEL_ADOPTION.atIncorporation, 'At incorporation'],
        [MODEL_ADOPTION.asAmended, 'As amended from time to time'],
        [MODEL_ADOPTION.advice, 'Advice required'],
      ]),
    },
    {
      type: 'SINGLE_CHOICE',
      key: K.customConstitutionStatus,
      label: 'Custom constitution',
      isRequired: true,
      condition: eq(K.rulesPreference, CONSTITUTION.custom),
      options: choices([
        [CUSTOM_CONSTITUTION_STATUS.upload, 'Upload existing file'],
        [CUSTOM_CONSTITUTION_STATUS.beingPrepared, 'Being prepared'],
      ]),
    },
    {
      type: 'FILE_UPLOAD',
      key: K.customConstitution,
      label: 'Custom constitution file',
      subtext: 'PDF, JPEG or PNG, up to 10 MB.',
      isRequired: true,
      condition: all(eq(K.rulesPreference, CONSTITUTION.custom), eq(K.customConstitutionStatus, CUSTOM_CONSTITUTION_STATUS.upload)),
      validation: { maxFileSizeMb: 10, allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] },
    },

    heading('section_other', 'Other instructions'),
    {
      type: 'LONG_TEXT',
      key: K.otherAppointments,
      label: 'Other appointments',
      placeholder: 'e.g. a CEO or auditor already identified',
      subtext: 'Optional. Our team confirms whether each appointment applies.',
      validation: { maxLength: 2000 },
    },
    {
      type: 'LONG_TEXT',
      key: K.otherNotes,
      label: 'Additional instructions',
      subtext: 'Optional.',
      validation: { maxLength: 3000 },
    },
  ];
}

export function buildSgCompanyIncorporationFields(options: SgCompanyIncorporationBuildOptions): FormFieldInput[] {
  return buildFieldDrafts(options).map((draft, position) => ({
    ...draft,
    isRequired: draft.isRequired ?? false,
    hideLabel: draft.hideLabel ?? false,
    isReadOnly: draft.isReadOnly ?? false,
    layoutWidth: draft.layoutWidth ?? 100,
    position,
  }));
}

export function buildSgCompanyIncorporationSettings(input: {
  firmName: string;
  notificationEmails?: string[];
}): Record<string, unknown> {
  const firm = input.firmName.trim() || 'our firm';
  return {
    drafts: { enabled: true, autoDeleteDays: 30 },
    notifications: {
      completionRecipientEmails: input.notificationEmails ?? [],
      attachmentMode: 'link_only',
    },
    completion: {
      reviewStep: true,
      reviewTitle: 'Review and submit',
      reviewIntro: `${firm} will review the company details together with the separate KYC/CDD information and confirm any outstanding requirements.`,
      submitLabel: 'Submit company details',
      successTitle: 'Company details submitted',
      successMessage: `Reference: {reference}. ${firm} will review the information and confirm the next steps. This submission does not constitute company registration.`,
      showPdfActions: true,
    },
  };
}

export function buildSgCompanyIncorporationDescription(firmName: string): string {
  const firm = firmName.trim() || 'our firm';
  return `Complete the company details for incorporation in Singapore. Submission is for review by ${firm}. It does not reserve a name or register a company.`;
}
