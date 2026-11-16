/** Singapore Annual Return Declaration guided form, version 10: accessible AGM and financial statement guidance. */
import type { FieldConditionInput, FormFieldInput } from '@/lib/validations/form-builder';

export const SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY = 'sg_annual_return_declaration';
export const SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_VERSION = 10;
export const SG_ANNUAL_RETURN_DECLARATION_TITLE = 'Annual Return Declaration';

export const ANNUAL_RETURN_KEYS = {
  prefillSource: 'prefill_source',
  companyName: 'company_name',
  companyUen: 'company_uen',
  companyType: 'company_type',
  financialYearEnd: 'financial_year_end',
  companyStatus: 'company_status',
  companySolvency: 'company_solvency',
  dormantCheck1: 'dormant_co_check1',
  dormantCheck2: 'dormant_co_check2',
  dormantConfirm: 'dormant_confirm',
  fsReady: 'fs_ready',
  fsDate: 'date_of_financial_statement',
  fsCirculation: 'date_fs_circulation',
  fsAuditStatus: 'fs_audit_status',
  fsExemption: 'exemption_check_fs_circulation',
  agmMemberRequest: 'agm_member_request',
  agmOptions: 'agm_options',
  agmDate: 'agm_date',
  agmAgenda: 'agm_agenda',
  resolutionMatters: 'resolution_matters',
  ceoExists: 'ceo_exists',
  ceoRoleListed: 'ceo_role_listed',
  particularsAccurate: 'particulars_accurate',
} as const;

const K = ANNUAL_RETURN_KEYS;
export const ARD_COMPANY_TYPES = {
  exemptPrivate: 'Exempt Private Company Limited by Shares',
  private: 'Private Company Limited by Shares',
  publicShares: 'Public Company Limited by Shares',
  publicGuarantee: 'Public Company Limited by Guarantee',
} as const;
const YES = 'Yes';
const NO = 'No';
const PENDING_CIRCULATION = 'Not yet, but they will be sent within five months';

type Draft = Omit<FormFieldInput, 'position' | 'isRequired' | 'hideLabel' | 'isReadOnly' | 'layoutWidth'> & {
  isRequired?: boolean;
  hideLabel?: boolean;
  isReadOnly?: boolean;
  layoutWidth?: FormFieldInput['layoutWidth'];
};
const eq = (fieldKey: string, value: string): FieldConditionInput => ({ fieldKey, operator: 'equals', value });
const not = (fieldKey: string, value: string): FieldConditionInput => ({ fieldKey, operator: 'not_equals', value });
const includes = (fieldKey: string, value: string): FieldConditionInput => ({ fieldKey, operator: 'contains', value });
const all = (...rules: FieldConditionInput[]): FieldConditionInput => ({ logic: 'and', rules });
const any = (...rules: FieldConditionInput[]): FieldConditionInput => ({ logic: 'or', rules });
const options = (values: string[]) => values.map((label) => ({ label, value: label }));
const yesNo = (key: string, label: string, extra: Partial<Draft> = {}): Draft => ({
  type: 'SINGLE_CHOICE', key, label, isRequired: true, options: options([YES, NO]),
  validation: { choiceInlineRight: true }, ...extra,
});
const text = (key: string, label: string, extra: Partial<Draft> = {}): Draft => ({
  type: 'SHORT_TEXT', inputType: 'text', key, label, isRequired: true,
  validation: { maxLength: 500 }, ...extra,
});
const date = (key: string, label: string, extra: Partial<Draft> = {}): Draft => ({
  type: 'SHORT_TEXT', inputType: 'date', key, label, isRequired: true, ...extra,
});
const pageBreak = (key: string, label: string, condition?: FieldConditionInput): Draft => ({ type: 'PAGE_BREAK', key, label, condition });
const heading = (key: string, label: string, condition?: FieldConditionInput): Draft => ({
  type: 'PARAGRAPH', inputType: 'info_heading_2', key, label, condition,
});
const info = (key: string, label: string, message: string, condition?: FieldConditionInput): Draft => ({
  type: 'PARAGRAPH', inputType: 'info_text', key, label, subtext: '<p>' + message + '</p>',
  condition, validation: { infoInlineCard: true, infoShowInPdf: false },
});
const tick = (key: string, label: string, condition?: FieldConditionInput): Draft => ({
  type: 'MULTIPLE_CHOICE', key, label, isRequired: true, hideLabel: true,
  options: [{ label, value: YES, requiredSelected: true }], condition,
});
const matters = [
  { value: 'Re-election of directors', label: 'Re-election of directors' },
  { value: 'Election or re-election of auditors', label: 'Election or re-election of auditors', allowTextInput: true, textInputLabel: 'Auditor details' },
  { value: 'Directors fees', label: "Directors' fees", allowTextInput: true, textInputLabel: 'Amount and period' },
  { value: 'Dividends', label: 'Dividends', allowTextInput: true, textInputLabel: 'Dividend details' },
  { value: 'Other matters', label: 'Other matters', allowTextInput: true, textInputLabel: 'Describe other matters' },
];

const POSITION_OPTIONS = [
  'Director', 'Managing Director', 'Alternate Director', 'Nominee Director', 'Secretary',
  'CEO', 'CFO', 'Auditor', 'Liquidator', 'Receiver', 'Judicial Manager',
];

export interface AnnualReturnBuildOptions { ssicPresetId?: string; nationalityPresetId?: string; currencyPresetId?: string; }

function drafts(input: AnnualReturnBuildOptions): Draft[] {
  const privateType = any(eq(K.companyType, ARD_COMPANY_TYPES.exemptPrivate), eq(K.companyType, ARD_COMPANY_TYPES.private));
  const exemptPrivate = eq(K.companyType, ARD_COMPANY_TYPES.exemptPrivate);
  const dormant = eq(K.companyStatus, 'Dormant');
  const exemptDormant = all(dormant, eq(K.dormantCheck1, YES), eq(K.dormantCheck2, YES));
  const prepare = any(eq(K.companyStatus, 'Active'), all(dormant, any(eq(K.dormantCheck1, NO), eq(K.dormantCheck2, NO))));
  // The explicit company-status answer is required; absent status never creates a false exemption.
  const noFiling = all(exemptPrivate, eq(K.companySolvency, 'Solvent'), prepare);
  const filing = all(prepare, any(not(K.companyType, ARD_COMPANY_TYPES.exemptPrivate), eq(K.companySolvency, 'Insolvent')));
  const ready = all(prepare, eq(K.fsReady, YES));
  const circulationYes = eq(K.fsExemption, YES);
  const circulationPending = eq(K.fsExemption, PENDING_CIRCULATION);
  const circulationRoute = all(privateType, prepare, any(circulationYes, circulationPending));
  const route = any(all(privateType, exemptDormant), circulationRoute);
  const requiredAgm = any(
    eq(K.companyType, ARD_COMPANY_TYPES.publicShares),
    eq(K.companyType, ARD_COMPANY_TYPES.publicGuarantee),
    all(privateType, any(
      all(prepare, eq(K.fsExemption, NO)),
      all(route, eq(K.agmMemberRequest, YES)),
    )),
  );
  const optionalAgm = all(route, eq(K.agmMemberRequest, NO), eq(K.agmOptions, YES));
  const agmHeld = any(requiredAgm, optionalAgm);
  const noAgm = all(route, eq(K.agmMemberRequest, NO), eq(K.agmOptions, NO));
  const prefilled = eq(K.prefillSource, 'company_record');
  const prefilledShares = all(prefilled, not(K.companyType, ARD_COMPANY_TYPES.publicGuarantee));
  const notPrefilled = { fieldKey: K.prefillSource, operator: 'is_empty' as const };
  const needsCeoDetails = any(notPrefilled, all(prefilled, eq(K.ceoRoleListed, NO)));
  const reelectionSelected = any(
    all(agmHeld, includes(K.agmAgenda, 'Re-election of directors')),
    all(noAgm, includes(K.resolutionMatters, 'Re-election of directors')),
  );

  return [
    { type: 'HIDDEN', key: K.prefillSource, label: 'Prefill source' },
    {
      type: 'PARAGRAPH', inputType: 'info_faq', key: 'commonly_asked_questions',
      label: 'Commonly asked questions', options: [
        { label: 'Is my company required to hold an AGM?', bodyHtml: '<p>A company must hold an AGM unless it is exempt. A company that is not listed must hold it within 6 months after its financial year-end. Only private companies can be exempt.</p>' },
        { label: 'When is a company exempt from holding an AGM?', bodyHtml: '<p>A private company need not hold an AGM for a financial year if it sent its financial statements to all members within five months after the financial year-end, or if it qualifies as a dormant relevant company. A meeting can still be required by a timely member or auditor request. Matters normally dealt with at an AGM can be approved by written resolution.</p>' },
        { label: 'Can a sole director / sole shareholder company hold an AGM?', bodyHtml: '<p>Yes. We prepare the AGM documents, or written resolutions where the company is exempt from holding an AGM, for signing.</p>' },
      ],
      validation: { faqDefaultState: 'collapsed', faqSearchEnabled: false },
    },
    heading('part_company', 'Part 1: Company information'),
    info('acra_prefill_notice', 'Verify prefilled company records',
      'Company particulars, officers, share capital and shareholder information have been prefilled from the ACRA data records held in our system. Please verify that all details are accurate and complete. Any edit, addition or removal will require supporting documentation, such as board resolutions, before we can update the relevant records or proceed with filing.', prefilled),
    text(K.companyName, 'Company Name', { layoutWidth: 66 }),
    text(K.companyUen, 'UEN', { layoutWidth: 33, validation: { maxLength: 30 } }),
    { type: 'DROPDOWN', key: K.companyType, label: 'Company Type', isRequired: true,
      layoutWidth: 66, options: options(Object.values(ARD_COMPANY_TYPES)),
      helpText: 'A company limited by guarantee is a public company. Choose the company type registered with ACRA.' },
    date(K.financialYearEnd, 'Financial year-end', { layoutWidth: 33, validation: { maxDate: 'today' } }),
    { type: 'DROPDOWN', key: K.companyStatus, label: 'Company Status', isRequired: true,
      layoutWidth: 50, options: options(['Active', 'Dormant']),
      helpText: 'A company is dormant when no accounting transactions occur, disregarding the initial subscribers shares, appointment of a secretary or auditor, maintaining the office or registers, and statutory fees and penalties.' },
    { type: 'DROPDOWN', key: K.companySolvency, label: 'Company Solvency', isRequired: true,
      layoutWidth: 50, options: options(['Solvent', 'Insolvent']), condition: exemptPrivate,
      helpText: 'Solvent means the company can pay its debts as they fall due.' },
    yesNo(K.dormantCheck1, 'Has the company been dormant since formation or the end of the previous financial year?', { condition: dormant }),
    yesNo(K.dormantCheck2, 'Is the company neither listed nor a subsidiary of a listed company, and were its total assets (consolidated if applicable) not more than S$500,000 at any time in the financial year?', { condition: dormant }),
    tick('dormant_confirm', 'The company has been dormant since its formation or the end of the previous financial year, has received no notice requiring financial statements or an audit, and has kept its accounting records.', exemptDormant),

    yesNo(K.particularsAccurate, "Are ACRA's records of directors, CEO, secretary, auditor, shareholders and registered office accurate?", {
      condition: notPrefilled,
      helpText: 'Check against the latest business profile.' }),
    { type: 'LONG_TEXT', key: 'particulars_changes', label: 'What needs updating?', isRequired: true,
      condition: all(notPrefilled, eq(K.particularsAccurate, NO)), layoutWidth: 100, validation: { maxLength: 4000 } },
    { type: 'SHORT_TEXT', inputType: 'number', key: 'guarantee_member_count', label: 'Number of guarantee members',
      isRequired: true, layoutWidth: 33,
      condition: eq(K.companyType, ARD_COMPANY_TYPES.publicGuarantee), validation: { min: 0 } },

    // The last fields on page 1 form the company particulars section.
    heading('part_records_identity', 'Registered particulars', prefilled),
    { type: 'HIDDEN', key: K.ceoRoleListed, label: 'CEO included in listed positions', condition: prefilled },
    { type: 'DROPDOWN', key: 'record_entity_status', label: 'ACRA entity status',
      condition: prefilled, isRequired: true, layoutWidth: 33, options: options([
        'Live', 'Struck Off', 'Winding Up', 'Dissolved', 'In Liquidation',
        'In Receivership', 'Amalgamated', 'Converted', 'Other',
      ]) },
    text('record_auditor', 'Auditor / audit firm', { condition: prefilled, isRequired: false, layoutWidth: 66 }),
    { type: 'DROPDOWN', key: 'record_primary_activity', label: 'Primary SSIC 2025 activity',
      isRequired: true, condition: prefilled, optionPresetId: input.ssicPresetId,
      placeholder: 'Search SSIC activity or 5-digit code', layoutWidth: 100 },
    { type: 'DROPDOWN', key: 'record_secondary_activity', label: 'Secondary SSIC 2025 activity',
      condition: prefilled, optionPresetId: input.ssicPresetId, isRequired: false,
      placeholder: 'Optional: search SSIC activity or code', layoutWidth: 100 },
    { type: 'LONG_TEXT', key: 'record_registered_office', label: 'Registered office address',
      condition: prefilled, isRequired: true },

    // Page 2 — always-expanded share capital and one row per person or corporate shareholder.
    pageBreak('page_company_records', 'Share capital and people', prefilled),
    heading('part_records', 'Share capital and people', prefilled),
    text('record_as_at', 'Record snapshot', { isReadOnly: true, isRequired: false, condition: prefilled }),
    { type: 'HIDDEN', key: 'position_record_policy', label: 'Position record policy', condition: prefilled },
    heading('part_capital', 'Share capital', prefilledShares),
    { type: 'PAGE_BREAK', inputType: 'repeat_start', key: 'share_capital_section', label: 'Share capital',
      condition: prefilledShares,
      validation: { repeatMinItems: 1, repeatMaxItems: 50, repeatItemLabel: 'Share class' } },
    { type: 'HIDDEN', key: 'capital_record_id', label: 'Capital record ID', condition: prefilledShares },
    { type: 'DROPDOWN', key: 'capital_class', label: 'Share class',
      condition: prefilledShares, isRequired: true, isReadOnly: true, layoutWidth: 50,
      options: options(['ORDINARY', 'PREFERENCE', 'REDEEMABLE PREFERENCE', 'NON-VOTING']),
      validation: { allowCustomOption: true },
      helpText: 'Verify the recorded share class against the company register.' },
    { type: 'SHORT_TEXT', inputType: 'number', key: 'capital_shares', label: 'Number of shares',
      condition: prefilledShares, isRequired: true, isReadOnly: true, layoutWidth: 50, validation: { min: 0 } },
    { type: 'DROPDOWN', key: 'capital_currency', label: 'Currency',
      condition: prefilledShares, isRequired: true, isReadOnly: true, optionPresetId: input.currencyPresetId,
      layoutWidth: 33, placeholder: 'Select ISO currency' },
    { type: 'SHORT_TEXT', inputType: 'number', key: 'capital_amount', label: 'Issued amount',
      condition: prefilledShares, isRequired: true, isReadOnly: true, layoutWidth: 33, validation: { min: 0 } },
    { type: 'SHORT_TEXT', inputType: 'number', key: 'capital_paid_up', label: 'Paid-up amount',
      condition: prefilledShares, isRequired: true, isReadOnly: true, layoutWidth: 33, validation: { min: 0 },
      helpText: 'Verify the recorded paid-up amount, especially for partly-paid shares.' },
    { type: 'PAGE_BREAK', inputType: 'repeat_end', key: 'capital_end', label: 'End share capital', condition: prefilledShares },

    heading('part_people', 'People and shareholders', prefilled),
    { type: 'PAGE_BREAK', inputType: 'repeat_start', key: 'people_section', label: 'People and shareholders',
      condition: prefilled, validation: { repeatMinItems: 1, repeatMaxItems: 50, repeatItemLabel: 'Person',
        repeatAddLabel: 'Add person / shareholder' } },
    { type: 'HIDDEN', key: 'person_record_id', label: 'Person source ID', condition: prefilled },
    { type: 'DROPDOWN', key: 'person_kind', label: 'Person / organisation',
      condition: prefilled, isRequired: true, layoutWidth: 33, options: options(['Individual', 'Corporate']) },
    text('person_name', 'Name', { condition: prefilled, layoutWidth: 66 }),
    text('person_id_number', 'Identification / registration no.', { condition: prefilled, isRequired: false, layoutWidth: 50 }),
    { type: 'DROPDOWN', key: 'person_nationality', label: 'Nationality',
      condition: all(prefilled, eq('person_kind', 'Individual')), isRequired: false,
      layoutWidth: 50, optionPresetId: input.nationalityPresetId,
      placeholder: 'Select nationality', validation: { allowCustomOption: true } },
    { type: 'LONG_TEXT', key: 'person_address', label: 'Residential / registered address',
      condition: prefilled, isRequired: false, layoutWidth: 100 },
    { type: 'DROPDOWN', key: 'person_role_1', label: 'Position 1', condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, isReadOnly: true, layoutWidth: 50, options: options(POSITION_OPTIONS) },
    date('person_role_date_1', 'Appointment date 1', { condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, isReadOnly: true, layoutWidth: 50 }),
    { type: 'DROPDOWN', key: 'person_role_2', label: 'Position 2', condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, isReadOnly: true, layoutWidth: 50, options: options(POSITION_OPTIONS) },
    date('person_role_date_2', 'Appointment date 2', { condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, isReadOnly: true, layoutWidth: 50 }),
    { type: 'DROPDOWN', key: 'person_role_3', label: 'Position 3', condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, isReadOnly: true, layoutWidth: 50, options: options(POSITION_OPTIONS) },
    date('person_role_date_3', 'Appointment date 3', { condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, isReadOnly: true, layoutWidth: 50 }),
    { type: 'SHORT_TEXT', inputType: 'position_list', key: 'person_additional_positions',
      label: 'Additional positions', condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, isReadOnly: true, layoutWidth: 100, options: options(POSITION_OPTIONS) },
    { type: 'SHORT_TEXT', inputType: 'shareholding_list', key: 'person_shareholding',
      label: 'Shareholdings by class', condition: prefilledShares, layoutWidth: 100,
      isRequired: false, isReadOnly: true, options: options(['ORDINARY', 'PREFERENCE', 'REDEEMABLE PREFERENCE', 'NON-VOTING']),
      validation: { allowCustomOption: true },
      helpText: 'Review these shareholdings against the company records. Contact us if any details are incorrect.' },
    { type: 'PAGE_BREAK', inputType: 'repeat_end', key: 'people_end', label: 'End people', condition: prefilled },

    heading('part_ceo', 'Chief executive officer', needsCeoDetails),
    yesNo(K.ceoExists, 'Does someone act as CEO, even if that is not their job title?', {
      condition: any(notPrefilled, all(prefilled, eq(K.ceoRoleListed, NO))),
      helpText: 'If someone is acting as CEO, select an existing officer or complete the separate individual KYC/CDD form for a new person.' }),
    info('ceo_manual_kyccdd', 'New CEO information',
      'If the CEO is not already an officer in the company record, complete the <a target="_blank" rel="noopener noreferrer" href="https://service.oakcloud.app/forms/f/kyccdd-individual">individual KYC/CDD form</a>. Do not re-enter those particulars here.',
      all(notPrefilled, eq(K.ceoExists, YES))),

    { type: 'DROPDOWN', key: 'ceo_source', label: 'Who performs the CEO role?', isRequired: true, layoutWidth: 50,
      condition: all(prefilled, eq(K.ceoRoleListed, NO), eq(K.ceoExists, YES)),
      options: options(['Existing listed officer', 'New individual']) },
    { type: 'DROPDOWN', key: 'ceo_existing_person', label: 'Select existing officer', isRequired: true, layoutWidth: 50,
      condition: all(prefilled, eq(K.ceoRoleListed, NO), eq(K.ceoExists, YES), eq('ceo_source', 'Existing listed officer')),
      placeholder: 'Choose from existing officers',
      validation: { optionsFromRepeatFieldKey: 'person_name', optionsFromRepeatFieldIdKey: 'person_record_id',
        optionsFromRepeatKindKey: 'person_kind', optionsFromRepeatRoleKeys: ['person_role_1', 'person_role_2', 'person_role_3'] } },
    info('ceo_new_kyccdd', 'New CEO – complete individual KYC/CDD',
      'For a new CEO, complete the <a target="_blank" rel="noopener noreferrer" href="https://service.oakcloud.app/forms/f/kyccdd-individual">individual KYC/CDD form</a>. There is no need to enter their identity, address or appointment particulars again in this declaration. We will follow up to update ACRA.',
      all(prefilled, eq(K.ceoRoleListed, NO), eq(K.ceoExists, YES), eq('ceo_source', 'New individual'))),
    tick('ceo_kyccdd_ack', 'I will provide the separate individual KYC/CDD form for the new CEO before the filing is completed.',
      all(prefilled, eq(K.ceoRoleListed, NO), eq(K.ceoExists, YES), eq('ceo_source', 'New individual'))),



    pageBreak('page_financial_statements', 'Financial statements'),
    heading('part_financial_statements', 'Part 3: Financial statements'),
    {
      type: 'PARAGRAPH', inputType: 'info_faq', key: 'financial_statements_faq',
      label: 'Financial statements and audit: common questions',
      layoutWidth: 100,
      options: [
        {
          label: 'Does my company need financial statements even if it has very little business?',
          bodyHtml: '<p>Usually, yes. A Singapore company normally prepares annual financial statements under the applicable accounting standards even when it makes a loss, has no sales or is exempt from audit. Only a company meeting the specific <strong>dormant relevant company</strong> exemption may be exempt from preparing them. ACRA filing and an external audit are separate requirements.</p>',
        },
        {
          label: 'Do financial statements have to be audited?',
          bodyHtml: '<p>Not always. An <strong>audit</strong> means an independent auditor checks the financial statements and issues an audit report. Private companies that qualify as small companies and dormant companies that meet the statutory conditions can be exempt. An audit exemption does <strong>not</strong> by itself remove the duty to prepare financial statements or decide whether they must be filed with ACRA.</p>',
        },
        {
          label: 'What is a small company for audit exemption?',
          bodyHtml: '<p>The company must be private and meet at least <strong>two of three</strong> tests: annual revenue of S$10 million or less; total assets of S$10 million or less; and 50 or fewer full-time employees. Normally it must qualify for the <strong>two immediately preceding financial years</strong>. A newly incorporated company can assess its current financial year. If the company belongs to a group, the <strong>entire group must also qualify as a small group</strong> on a consolidated basis. Ask us to check if you are unsure.</p>',
        },
        {
          label: 'What does dormant mean? Can a dormant company skip both preparation and audit?',
          bodyHtml: '<p>A dormant company has no significant accounting transactions during the relevant period; simply having no income is not enough. A dormant company may be exempt from an audit under the dormant-company rules. To skip <strong>preparing financial statements</strong>, it must also satisfy the stricter dormant relevant company rules, including dormancy from incorporation or the end of the previous financial year, not being listed or a subsidiary of a listed company, and assets not exceeding S$500,000 at any time during the year (consolidated where applicable). Other statutory conditions and declarations also apply. Keep accounting records even when exempt.</p>',
        },
        {
          label: 'If my company does not need an audit, does it still need to file accounts with ACRA?',
          bodyHtml: '<p>Possibly. Audit, preparation and filing are three different obligations. A <strong>solvent exempt private company</strong> usually prepares financial statements but need not file them with ACRA. A qualifying dormant relevant company need not prepare or file them. Other companies generally file the required financial statements. Contact us if you are uncertain which category applies.</p>',
        },
      ],
      validation: { faqDefaultState: 'collapsed', faqSearchEnabled: false },
    },
    info('fs_not_required_msg', 'Financial statements exemption', 'The company is exempt from preparing financial statements.', exemptDormant),
    info('fs_prepare_only_msg', 'Preparation without filing', 'The company must prepare financial statements and send them to its members. As a solvent exempt private company it need not file them with ACRA.', noFiling),
    info('label_fs_ds', 'Financial statements filing', 'The company must prepare financial statements, send them to its members and file them with ACRA.', filing),
    yesNo(K.fsReady, "Are the signed financial statements and directors' statement ready?", { condition: prepare }),
    { type: 'FILE_UPLOAD', key: 'attachment_fs_ds', label: "Financial statements and directors' statement",
      isRequired: true, condition: ready,
      validation: { maxFileSizeMb: 50, allowMultipleFiles: true, allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] } },
    date(K.fsDate, "Date of the directors' statement", { condition: ready, layoutWidth: 100,
      subtext: 'The date the directors signed the statement that accompanies the financial statements.',
      validation: { minDateFieldKey: K.financialYearEnd, minDateOffsetDays: 0, maxDate: 'today' } }),
    date('date_fs_ds', 'Estimated date of completion', {
      condition: all(prepare, eq(K.fsReady, NO)), layoutWidth: 33, validation: { minDate: 'today' },
    }),
    { type: 'DROPDOWN', key: K.fsAuditStatus, label: 'Are the financial statements audited?',
      isRequired: true, condition: prepare, layoutWidth: 100, options: [
        { label: 'Audited', value: 'Audited' },
        { label: 'Not audited (small company exemption)', value: 'Not audited (small company exemption)', condition: privateType },
        { label: 'Not audited (dormant company exemption)', value: 'Not audited (dormant company exemption)', condition: dormant },
      ] },

    pageBreak('page_agm', 'AGM matters'),
    heading('part_agm', 'Part 4: AGM matters'),
    {
      type: 'PARAGRAPH', inputType: 'info_faq', key: 'agm_faq',
      label: 'AGM: common questions',
      layoutWidth: 100,
      options: [
        {
          label: 'What is an AGM, and why is it held?',
          bodyHtml: '<p>An <strong>Annual General Meeting (AGM)</strong> is a meeting of members (shareholders) to receive the company’s annual financial information, ask questions and decide matters that require their approval. If an AGM is required, an unlisted company generally holds it within six months after its financial year-end; a listed company generally has four months.</p>',
        },
        {
          label: 'Can my private company skip an AGM?',
          bodyHtml: '<p>Often, yes. A private company may qualify for an AGM exemption by sending its financial statements to members within five months after financial year-end, or by qualifying as a dormant relevant company. A private company may also pass a members’ resolution not to hold AGMs, subject to the statutory rules. Members and auditors have statutory rights to request meetings in certain circumstances, even if an exemption applies. An annual return still needs to be filed.</p>',
        },
        {
          label: 'What is normally dealt with at an AGM?',
          bodyHtml: '<p>Usual matters include <strong>receiving the annual financial statements</strong>; re-election or retirement of directors <strong>when required by the constitution</strong>; appointment or reappointment of auditors (if applicable); approval of directors’ fees where required; and declaration of a final dividend if proposed. Some items are not needed every year. We will check what your company actually needs before preparing resolutions.</p>',
        },
        {
          label: 'Who attends and how can we hold the AGM?',
          bodyHtml: '<p>Members entitled to attend and vote receive notice, and directors or the company secretary commonly assist. The meeting may be held physically or using suitable electronic arrangements if the applicable law and company constitution allow it. For an online meeting, tell us the platform so we can confirm access, participation, voting and record-keeping arrangements.</p>',
        },
        {
          label: 'What is shorter notice?',
          bodyHtml: '<p>Normally, a minimum notice period applies before an AGM. <strong>Shorter notice</strong> means holding it sooner because the members entitled to attend and vote have actually agreed to waive the usual period. Selecting Yes is a declaration of that agreement, not a request for consent or proof that it has been obtained. Special resolutions and company-specific rules may require additional formalities. Contact us if anyone has not agreed.</p>',
        },
      ],
      validation: { faqDefaultState: 'collapsed', faqSearchEnabled: false },
    },
    { type: 'DROPDOWN', key: K.fsExemption,
      label: 'Have the financial statements been sent to all members within five months after the financial year-end?',
      isRequired: true, layoutWidth: 100, condition: all(privateType, prepare),
      options: options([YES, PENDING_CIRCULATION, NO]) },
    date(K.fsCirculation, 'Date the financial statements were sent',
      { condition: all(privateType, prepare, circulationYes), layoutWidth: 33,
        validation: { minDateFieldKey: K.fsDate, minDateOffsetDays: 0,
          maxDateFieldKey: K.financialYearEnd, maxDateOffsetMonths: 5, maxDate: 'today' } }),
    yesNo(K.agmMemberRequest, 'Has any member or the auditor asked for an AGM?', { condition: route }),
    info('agm_exemption_msg', 'AGM exemption',
      'The company is exempt from holding an AGM for this financial year.',
      all(route, eq(K.agmMemberRequest, NO), any(exemptDormant, circulationYes))),
    info('agm_exemption_pending_msg', 'AGM exemption pending circulation',
      'The company is exempt from holding an AGM provided the financial statements are sent within five months after the financial year-end.',
      all(route, eq(K.agmMemberRequest, NO), circulationPending)),
    yesNo(K.agmOptions, 'Will the company hold an AGM anyway?', {
      condition: all(route, eq(K.agmMemberRequest, NO)),
      helpText: 'An AGM is due within six months after the financial year-end for a company that is not listed.' }),
    info('label_agm_msg', 'AGM required', 'The company is required to hold an AGM.', requiredAgm),
    yesNo('short_notice_consent', 'Have all members entitled to attend and vote agreed to shorter notice?', {
      condition: agmHeld,
      options: [
        { label: YES, value: YES, defaultSelected: true },
        { label: NO, value: NO },
      ],
      helpText: 'Shorter notice means holding the AGM with fewer than the normal days of advance notice. Select Yes only if every member entitled to attend and vote has actually agreed. This answer does not collect consent or override any requirements for special resolutions. If unsure, select No and contact us.',
      validation: { choiceInlineRight: true, tooltipEnabled: true, tooltipMode: 'hover' },
    }),
    date('agm_notice_date', 'Date of AGM notice', {
      condition: agmHeld, layoutWidth: 33, validation: {
        maxDateFieldKey: K.agmDate, maxDateOffsetDays: -14,
        maxDateOffsetDaysWhen: { fieldKey: 'short_notice_consent', equals: YES, offsetDays: 0 },
      } }),
    date(K.agmDate, 'Proposed AGM date', {
      condition: agmHeld, layoutWidth: 33, validation: {
        minDate: 'today', minDateFieldKey: 'agm_notice_date', minDateOffsetDays: 14,
        minDateOffsetDaysWhen: { fieldKey: 'short_notice_consent', equals: YES, offsetDays: 0 },
      },
      helpText: 'For companies that are not listed, the AGM is normally due within six months after financial year-end. Contact us if it is late.' }),
    { type: 'SHORT_TEXT', inputType: 'time_timezone', key: 'agm_time', label: 'Proposed AGM time', condition: agmHeld, isRequired: true, layoutWidth: 50, validation: { timezoneDefault: 'Asia/Singapore' } },
    {
      type: 'DROPDOWN', key: 'proposed_agm_venue', label: 'Proposed AGM venue',
      condition: agmHeld, isRequired: true, layoutWidth: 50,
      options: options(['Company registered address', 'Zoom', 'Teams', 'Google Meet', 'Slack', 'Others']),
      helpText: 'Select a physical meeting place or the online meeting platform. We will confirm suitability and meeting arrangements.',
    },
    {
      type: 'PARAGRAPH', inputType: 'info_text', key: 'agm_venue_registered_address',
      label: 'Company registered address', layoutWidth: 100,
      condition: all(agmHeld, eq('proposed_agm_venue', 'Company registered address')),
      validation: { infoBareStyle: true, infoInlineCard: true },
    },
    text('proposed_agm_venue_other', 'Please specify the AGM venue or platform', {
      condition: all(agmHeld, eq('proposed_agm_venue', 'Others')),
      isRequired: true, layoutWidth: 100,
      placeholder: 'Enter the meeting location or platform name',
    }),
    {
      type: 'MULTIPLE_CHOICE', key: K.agmAgenda, label: 'Matters to be included in AGM agenda',
      condition: agmHeld,
      helpText: 'The two items ticked initially are suggestions, not mandatory items. Re-election depends on your company constitution. Select or untick matters according to what the company needs; we will verify the agenda before documents are prepared.',
      options: [
        {
          value: 'Receive and adopt the Financial Statement',
          label: 'Receive and adopt the Financial Statement', defaultSelected: true,
        },
        ...matters.map((item) => ({ ...item, ...(item.value === 'Re-election of directors' ? { defaultSelected: true } : {}) })),
      ],
    },
    { type: 'MULTIPLE_CHOICE', key: K.resolutionMatters, label: 'Matters to be approved by written resolution',
      condition: noAgm, options: matters },
    { type: 'MULTIPLE_CHOICE', key: 'reelection_directors',
      label: 'Directors proposed for re-election', condition: all(prefilled, reelectionSelected),
      isRequired: true, options: [], layoutWidth: 100,
      helpText: 'All current directors are selected by default. Untick anyone not proposed for re-election.' },

    pageBreak('page_director_statement', "Directors' statement", prepare),
    heading('part_director_statement', "Part 5: Directors' statement", prepare),
    info('director_statement', "Directors' statement",
      'The directors statement accompanying the financial statements is signed by two directors, or by the sole director where there is only one.', prepare),
    yesNo('director_interests_included', "Does the directors' statement include the directors' interests in shares or debentures?", { condition: prepare }),
    yesNo('director_statement_consent', "Have the shareholders agreed to omit directors' interests from the directors' statement?", {
      condition: all(prepare, eq('director_interests_included', NO)) }),
    info('director_statement_consent_msg', 'Directors interests disclosure',
      'Please provide the shareholders consent and supporting records for omitting directors interests.',
      all(prepare, eq('director_interests_included', NO), eq('director_statement_consent', YES))),
    info('director_statement_consent_block', 'Directors interests disclosure pending',
      'Please contact us if the company requires assistance with directors interests disclosure.',
      all(prepare, eq('director_interests_included', NO), eq('director_statement_consent', NO))),

    pageBreak('page_declaration', 'Declaration'),
    heading('part_declaration', 'Declaration'),
    info('declaration_text', 'Declaration',
      'I confirm that the information supplied is accurate to the best of my knowledge and authorise the firm to prepare the annual return and related resolutions based on it.'),
    tick('record_confirm', 'The company records above, with my changes, are accurate and complete.', prefilled),
    { type: 'SIGNATURE', key: 'sign', label: 'Signature', isRequired: true },
    text('sign_full_name', 'Full name of person signing', { layoutWidth: 66 }),
    date('sign_date', 'Date of declaration', { layoutWidth: 33, validation: { maxDate: 'today', defaultToday: true } }),
    // Phase 2 can extend this template with a new version. The phase-1 hidden
    // prefill field is reserved so existing keys remain stable.
  ];
}

export function buildSgAnnualReturnDeclarationFields(input: AnnualReturnBuildOptions = {}): FormFieldInput[] {
  return drafts(input).map((field, position) => ({
    ...field, position, isRequired: field.isRequired ?? false,
    hideLabel: field.hideLabel ?? false, isReadOnly: field.isReadOnly ?? false,
    layoutWidth: field.layoutWidth ?? 100,
  }));
}

export function buildSgAnnualReturnDeclarationSettings(): Record<string, unknown> {
  return {
    drafts: { enabled: true, autoDeleteDays: 30 },
    notifications: { completionRecipientEmails: [], attachmentMode: 'attachments' },
    responseTable: { summaryFields: ['company_name', 'company_type', 'financial_year_end'] },
    completion: { reviewStep: true, reviewTitle: 'Review and submit', submitLabel: 'Submit declaration',
      successTitle: 'Declaration received', successMessage: 'Reference: {reference}. We will review your declaration.' },
  };
}
