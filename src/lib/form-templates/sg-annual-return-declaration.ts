/** Singapore Annual Return Declaration guided form, version 3: compact person-centred declaration. */
import type { FieldConditionInput, FormFieldInput } from '@/lib/validations/form-builder';

export const SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY = 'sg_annual_return_declaration';
export const SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_VERSION = 3;
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
  { value: 'Re-election of directors', label: 'Re-election of directors', allowTextInput: true, textInputLabel: 'Director(s) to be re-elected' },
  { value: 'Election or re-election of auditors', label: 'Election or re-election of auditors', allowTextInput: true, textInputLabel: 'Auditor details' },
  { value: 'Directors fees', label: "Directors' fees", allowTextInput: true, textInputLabel: 'Amount and period' },
  { value: 'Dividends', label: 'Dividends', allowTextInput: true, textInputLabel: 'Dividend details' },
  { value: 'Other matters', label: 'Other matters', allowTextInput: true, textInputLabel: 'Describe other matters' },
];

const POSITION_OPTIONS = [
  'Director', 'Managing Director', 'Alternate Director', 'Nominee Director', 'Secretary',
  'CEO', 'CFO', 'Auditor', 'Liquidator', 'Receiver', 'Judicial Manager',
];

export interface AnnualReturnBuildOptions { ssicPresetId?: string; }

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
    text(K.companyName, 'Company Name'),
    text(K.companyUen, 'UEN', { layoutWidth: 33, validation: { maxLength: 30 } }),
    { type: 'DROPDOWN', key: K.companyType, label: 'Company Type', isRequired: true,
      options: options(Object.values(ARD_COMPANY_TYPES)),
      helpText: 'A company limited by guarantee is a public company. Choose the company type registered with ACRA.' },
    date(K.financialYearEnd, 'Financial year-end', { validation: { maxDate: 'today' } }),
    { type: 'SINGLE_CHOICE', key: K.companyStatus, label: 'Company Status', isRequired: true,
      options: options(['Active', 'Dormant']),
      helpText: 'A company is dormant when no accounting transactions occur, disregarding the initial subscribers shares, appointment of a secretary or auditor, maintaining the office or registers, and statutory fees and penalties.' },
    { type: 'SINGLE_CHOICE', key: K.companySolvency, label: 'Company Solvency', isRequired: true,
      options: options(['Solvent', 'Insolvent']), condition: exemptPrivate,
      helpText: 'Solvent means the company can pay its debts as they fall due.' },
    yesNo(K.dormantCheck1, 'Has the company been dormant since formation or the end of the previous financial year?', { condition: dormant }),
    yesNo(K.dormantCheck2, 'Is the company neither listed nor a subsidiary of a listed company, and were its total assets (consolidated if applicable) not more than S$500,000 at any time in the financial year?', { condition: dormant }),
    tick('dormant_confirm', 'The company has been dormant since its formation or the end of the previous financial year, has received no notice requiring financial statements or an audit, and has kept its accounting records.', exemptDormant),

    // The last fields on page 1 form the company particulars section.
    heading('part_records_identity', 'Registered particulars', prefilled),
    { type: 'HIDDEN', key: K.ceoRoleListed, label: 'CEO included in listed positions', condition: prefilled },
    text('record_entity_status', 'Entity status', { condition: prefilled, layoutWidth: 33 }),
    { type: 'DROPDOWN', key: 'record_primary_activity', label: 'Primary SSIC 2025 activity',
      isRequired: true, condition: prefilled, optionPresetId: input.ssicPresetId,
      placeholder: 'Search SSIC activity or 5-digit code', layoutWidth: 100 },
    { type: 'DROPDOWN', key: 'record_secondary_activity', label: 'Secondary SSIC 2025 activity',
      condition: prefilled, optionPresetId: input.ssicPresetId, isRequired: false,
      placeholder: 'Optional: search SSIC activity or code', layoutWidth: 100 },
    text('record_auditor', 'Auditor / audit firm', { condition: prefilled, isRequired: false, layoutWidth: 100 }),
    { type: 'LONG_TEXT', key: 'record_registered_office', label: 'Registered office address',
      condition: prefilled, isRequired: true },

    // Page 2 — an at-a-glance share capital grid, followed by one row per person
    // or corporate shareholder. Each row can be expanded for full particulars.
    pageBreak('page_company_records', 'Share capital and people', prefilled),
    heading('part_records', 'Share capital and people', prefilled),
    text('record_as_at', 'Record snapshot', { isReadOnly: true, isRequired: false, condition: prefilled }),
    heading('part_capital', 'Share capital', prefilledShares),
    { type: 'PAGE_BREAK', inputType: 'repeat_start', key: 'share_capital_section', label: 'Share capital',
      condition: prefilledShares,
      validation: { repeatMinItems: 1, repeatMaxItems: 50, repeatItemLabel: 'Share class',
        repeatAddLabel: 'Add share class', repeatCompactCards: true,
        repeatSummaryFieldKeys: ['capital_class', 'capital_shares', 'capital_currency', 'capital_amount', 'capital_paid_up'] } },
    { type: 'HIDDEN', key: 'capital_record_id', label: 'Capital record ID', condition: prefilledShares },
    text('capital_class', 'Share class', { condition: prefilledShares, layoutWidth: 50 }),
    { type: 'SHORT_TEXT', inputType: 'number', key: 'capital_shares', label: 'Number of shares',
      condition: prefilledShares, isRequired: true, layoutWidth: 50, validation: { min: 0 } },
    text('capital_currency', 'Currency', { condition: prefilledShares, layoutWidth: 33 }),
    { type: 'SHORT_TEXT', inputType: 'number', key: 'capital_amount', label: 'Issued amount',
      condition: prefilledShares, isRequired: true, layoutWidth: 33, validation: { min: 0 } },
    { type: 'SHORT_TEXT', inputType: 'number', key: 'capital_paid_up', label: 'Paid-up amount',
      condition: prefilledShares, isRequired: true, layoutWidth: 33, validation: { min: 0 },
      helpText: 'Confirm the actual paid-up amount, especially for partly-paid shares.' },
    { type: 'PAGE_BREAK', inputType: 'repeat_end', key: 'capital_end', label: 'End share capital', condition: prefilledShares },

    heading('part_people', 'People and shareholders', prefilled),
    info('people_help', 'Edit people',
      'Each person appears once, even if they have several positions or share classes. Expand a row to edit identifying information, up to three positions and their dates, or shareholdings. Add missing persons separately.', prefilled),
    { type: 'PAGE_BREAK', inputType: 'repeat_start', key: 'people_section', label: 'People and shareholders',
      condition: prefilled, validation: { repeatMinItems: 1, repeatMaxItems: 50, repeatItemLabel: 'Person',
        repeatAddLabel: 'Add person / shareholder', repeatCompactCards: true,
        repeatSummaryFieldKeys: ['person_role_1', 'person_role_2', 'person_role_3', 'person_shareholding'] } },
    { type: 'HIDDEN', key: 'person_record_id', label: 'Person source ID', condition: prefilled },
    { type: 'DROPDOWN', key: 'person_kind', label: 'Person / organisation',
      condition: prefilled, isRequired: true, layoutWidth: 33, options: options(['Individual', 'Corporate']) },
    text('person_name', 'Name', { condition: prefilled, layoutWidth: 66 }),
    text('person_id_number', 'Identification / registration no.', { condition: prefilled, isRequired: false, layoutWidth: 50 }),
    text('person_nationality', 'Nationality', { condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, layoutWidth: 50 }),
    { type: 'LONG_TEXT', key: 'person_address', label: 'Residential / registered address',
      condition: prefilled, isRequired: false, layoutWidth: 100 },
    { type: 'PARAGRAPH', inputType: 'info_heading_3', key: 'person_positions_heading',
      label: 'Positions (up to 3)', condition: all(prefilled, eq('person_kind', 'Individual')) },
    { type: 'DROPDOWN', key: 'person_role_1', label: 'Position 1', condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, layoutWidth: 33, options: options(POSITION_OPTIONS) },
    { type: 'DROPDOWN', key: 'person_role_2', label: 'Position 2', condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, layoutWidth: 33, options: options(POSITION_OPTIONS) },
    { type: 'DROPDOWN', key: 'person_role_3', label: 'Position 3', condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, layoutWidth: 33, options: options(POSITION_OPTIONS) },
    date('person_role_date_1', 'Appointment date 1', { condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, layoutWidth: 33 }),
    date('person_role_date_2', 'Appointment date 2', { condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, layoutWidth: 33 }),
    date('person_role_date_3', 'Appointment date 3', { condition: all(prefilled, eq('person_kind', 'Individual')),
      isRequired: false, layoutWidth: 33 }),
    { type: 'LONG_TEXT', key: 'person_additional_positions', label: 'Additional positions (beyond first 3)',
      condition: all(prefilled, eq('person_kind', 'Individual')), isRequired: false, layoutWidth: 100,
      helpText: 'If the individual holds more than three positions, list remaining appointments and dates here.' },
    { type: 'LONG_TEXT', key: 'person_shareholding', label: 'Shareholding by class',
      condition: prefilledShares, layoutWidth: 100, isRequired: false,
      placeholder: 'ORDINARY: 100 shares\\nPREFERENCE: 20 shares',
      helpText: 'Enter one share class and number of shares per line. Leave blank for a non-shareholder.' },
    { type: 'PAGE_BREAK', inputType: 'repeat_end', key: 'people_end', label: 'End people', condition: prefilled },

    pageBreak('page_financial_statements', 'Financial statements'),
    heading('part_financial_statements', 'Part 3: Financial statements'),
    info('fs_not_required_msg', 'Financial statements exemption', 'The company is exempt from preparing financial statements.', exemptDormant),
    info('fs_prepare_only_msg', 'Preparation without filing', 'The company must prepare financial statements and send them to its members. As a solvent exempt private company it need not file them with ACRA.', noFiling),
    info('label_fs_ds', 'Financial statements filing', 'The company must prepare financial statements, send them to its members and file them with ACRA.', filing),
    yesNo(K.fsReady, "Are the signed financial statements and directors' statement ready?", { condition: prepare }),
    { type: 'FILE_UPLOAD', key: 'attachment_fs_ds', label: "Financial statements and directors' statement",
      isRequired: true, condition: ready,
      validation: { maxFileSizeMb: 50, allowMultipleFiles: true, allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] } },
    date(K.fsDate, "Date of the directors' statement", { condition: ready,
      subtext: 'The date the directors signed the statement that accompanies the financial statements.',
      validation: { minDateFieldKey: K.financialYearEnd, minDateOffsetDays: 0, maxDate: 'today' } }),
    date('date_fs_ds', 'Estimated date of completion', {
      condition: all(prepare, eq(K.fsReady, NO)), validation: { minDate: 'today' },
    }),
    { type: 'SINGLE_CHOICE', key: K.fsAuditStatus, label: 'Are the financial statements audited?',
      isRequired: true, condition: prepare, options: [
        { label: 'Audited', value: 'Audited' },
        { label: 'Not audited (small company exemption)', value: 'Not audited (small company exemption)', condition: privateType },
        { label: 'Not audited (dormant company exemption)', value: 'Not audited (dormant company exemption)', condition: dormant },
      ] },

    pageBreak('page_agm', 'AGM matters'),
    heading('part_agm', 'Part 4: AGM matters'),
    { type: 'SINGLE_CHOICE', key: K.fsExemption,
      label: 'Have the financial statements been sent to all members within five months after the financial year-end?',
      isRequired: true, condition: all(privateType, prepare),
      options: options([YES, PENDING_CIRCULATION, NO]) },
    date(K.fsCirculation, 'Date the financial statements were sent',
      { condition: all(privateType, prepare, circulationYes),
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
    yesNo('short_notice_consent', 'Have all members entitled to attend and vote agreed to shorter notice?', { condition: agmHeld }),
    date('agm_notice_date', 'Date of AGM notice', {
      condition: agmHeld, validation: { maxDateFieldKey: K.agmDate, maxDateOffsetDays: -14 } }),
    date(K.agmDate, 'Proposed AGM date', {
      condition: agmHeld, validation: { minDate: 'today' },
      helpText: 'For companies that are not listed, the AGM is normally due within six months after financial year-end. Contact us if it is late.' }),
    text('agm_time', 'Proposed AGM time', { condition: agmHeld, layoutWidth: 50 }),
    text('proposed_agm_venue', 'Proposed AGM venue', { condition: agmHeld }),
    { type: 'MULTIPLE_CHOICE', key: K.agmAgenda, label: 'Matters to be included in AGM agenda',
      condition: agmHeld, options: [{ value: 'Receive and adopt the Financial Statement', label: 'Receive and adopt the Financial Statement' }, ...matters] },
    { type: 'MULTIPLE_CHOICE', key: K.resolutionMatters, label: 'Matters to be approved by written resolution',
      condition: noAgm, options: matters },

    pageBreak('page_director_statement', "Directors' statement"),
    heading('part_director_statement', "Part 5: Directors' statement", prepare),
    info('director_statement', "Directors' statement",
      'The directors statement accompanying the financial statements is signed by two directors, or by the sole director where there is only one.', prepare),
    yesNo('director_statement_consent', "Have the shareholders agreed to omit directors' interests from the directors' statement?", { condition: prepare }),
    info('director_statement_consent_msg', 'Directors interests disclosure', 'Please provide the shareholders consent and supporting records for the directors interests disclosure.', all(prepare, eq('director_statement_consent', YES))),
    info('director_statement_consent_block', 'Directors interests disclosure pending', 'Please contact us if the company requires assistance with directors interests disclosure.', all(prepare, eq('director_statement_consent', NO))),

    pageBreak('page_particulars', 'CEO and company particulars'),
    heading('part_particulars', 'Part 6: CEO and company particulars'),
    info('ceo_already_recorded', 'CEO already listed',
      'A CEO position is recorded in the people section. Check the person and appointment date on the previous page.',
      all(prefilled, eq(K.ceoRoleListed, YES))),
    yesNo(K.ceoExists, 'Does anyone perform the role of chief executive officer, even without that job title?', {
      condition: any(notPrefilled, all(prefilled, eq(K.ceoRoleListed, NO))),
      helpText: 'ACRA requires disclosure of a person performing the CEO role, whether or not formally titled CEO.' }),
    { type: 'SINGLE_CHOICE', key: 'ceo_source', label: 'Who performs the CEO role?', isRequired: true,
      condition: all(prefilled, eq(K.ceoRoleListed, NO), eq(K.ceoExists, YES)),
      options: options(['Existing listed person', 'New individual']) },
    { type: 'DROPDOWN', key: 'ceo_existing_person', label: 'Choose an existing person', isRequired: true,
      condition: all(prefilled, eq(K.ceoExists, YES), eq('ceo_source', 'Existing listed person')),
      placeholder: 'Select a person from the records above',
      validation: { optionsFromRepeatFieldKey: 'person_name', optionsFromRepeatFieldIdKey: 'person_record_id', optionsFromRepeatKindKey: 'person_kind', optionsFromRepeatRoleKeys: ['person_role_1', 'person_role_2', 'person_role_3'] } },
    text('ceo_new_name', 'New CEO full name', {
      condition: all(prefilled, eq(K.ceoExists, YES), eq('ceo_source', 'New individual')) }),
    date('ceo_new_appointment_date', 'CEO appointment date', {
      condition: all(prefilled, eq(K.ceoExists, YES), eq('ceo_source', 'New individual')),
      validation: { maxDate: 'today' } }),
    info('ceo_new_kyccdd', 'Individual KYC / CDD',
      'For a new individual, also complete the <a target="_blank" rel="noopener noreferrer" href="https://service.oakcloud.app/forms/f/kyccdd-individual">individual KYC/CDD form</a>. The completed questionnaire does not automatically create a company officer record.',
      all(prefilled, eq(K.ceoExists, YES), eq('ceo_source', 'New individual'))),
    { type: 'LONG_TEXT', key: 'ceo_details', label: 'Name of the CEO and date of appointment',
      isRequired: true, condition: all(eq(K.ceoExists, YES), notPrefilled),
      validation: { maxLength: 2000 } },
    yesNo(K.particularsAccurate, "Are ACRA's records of the company's directors, CEO, secretary, auditor, shareholders and registered office accurate?", {
      condition: notPrefilled,
      helpText: 'ACRA requires this confirmation in every annual return from 20 October 2026. Check against the company business profile.' }),
    { type: 'LONG_TEXT', key: 'particulars_changes', label: 'What needs to be updated?', isRequired: true,
      condition: all(notPrefilled, eq(K.particularsAccurate, NO)),
      validation: { maxLength: 4000 } },
    { type: 'SHORT_TEXT', inputType: 'number', key: 'guarantee_member_count', label: 'Total number of members',
      isRequired: true, condition: eq(K.companyType, ARD_COMPANY_TYPES.publicGuarantee),
      validation: { min: 0 } },

    pageBreak('page_declaration', 'Declaration'),
    heading('part_declaration', 'Declaration'),
    info('declaration_text', 'Declaration',
      'I confirm that the information supplied is accurate to the best of my knowledge and authorise the firm to prepare the annual return and related resolutions based on it.'),
    tick('record_confirm', 'The company records above, with my changes, are accurate and complete.', prefilled),
    { type: 'SIGNATURE', key: 'sign', label: 'Signature', isRequired: true },
    text('sign_full_name', 'Full name of person signing'),
    date('sign_date', 'Date of declaration', { validation: { maxDate: 'today', defaultToday: true } }),
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
