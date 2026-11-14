/** Singapore Annual Return Declaration guided form, version 1. */
import type { FieldConditionInput, FormFieldInput } from '@/lib/validations/form-builder';

export const SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_KEY = 'sg_annual_return_declaration';
export const SG_ANNUAL_RETURN_DECLARATION_TEMPLATE_VERSION = 2;
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

function drafts(): Draft[] {
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

    heading('part_records', 'Company records', prefilled),
    text('record_as_at', 'Record snapshot', { isReadOnly: true, isRequired: false, condition: prefilled }),
    text('record_entity_status', 'Entity status', { condition: prefilled }),
    text('record_primary_activity', 'Primary business activity', { condition: prefilled }),
    text('record_secondary_activity', 'Secondary business activity', { isRequired: false, condition: prefilled }),
    { type: 'LONG_TEXT', key: 'record_registered_office', label: 'Registered office address', condition: prefilled, isRequired: true },
    { type: 'PAGE_BREAK', inputType: 'repeat_start', key: 'officers_section', label: 'Position holders',
      condition: prefilled, validation: { repeatMinItems: 1, repeatMaxItems: 50, repeatItemLabel: 'Position holder', repeatAddLabel: 'Add position holder' } },
    { type: 'HIDDEN', key: 'officer_record_id', label: 'Position record ID', condition: prefilled },
    { type: 'DROPDOWN', key: 'officer_role', label: 'Position', condition: prefilled, isRequired: true,
      options: options(['Director', 'Managing Director', 'Alternate Director', 'Nominee Director', 'Secretary', 'CEO', 'CFO', 'Auditor', 'Liquidator', 'Receiver', 'Judicial Manager']) },
    text('officer_name', 'Name', { condition: prefilled }),
    text('officer_id_number', 'Identification number', { condition: prefilled, isRequired: false }),
    text('officer_nationality', 'Nationality', { condition: prefilled, isRequired: false }),
    { type: 'LONG_TEXT', key: 'officer_address', label: 'Address', condition: prefilled },
    date('officer_appointment_date', 'Date of appointment', { condition: prefilled, isRequired: false }),
    { type: 'PAGE_BREAK', inputType: 'repeat_end', key: 'officers_end', label: 'End position holders', condition: prefilled },
    { type: 'PAGE_BREAK', inputType: 'repeat_start', key: 'share_capital_section', label: 'Share capital',
      condition: prefilledShares, validation: { repeatMinItems: 1, repeatMaxItems: 50, repeatItemLabel: 'Share capital', repeatAddLabel: 'Add share capital' } },
    { type: 'HIDDEN', key: 'capital_record_id', label: 'Capital record ID', condition: prefilledShares },
    text('capital_class', 'Share class', { condition: prefilledShares }),
    text('capital_currency', 'Currency', { condition: prefilledShares, layoutWidth: 33 }),
    { type: 'SHORT_TEXT', inputType: 'number', key: 'capital_shares', label: 'Number of shares', condition: prefilledShares, isRequired: true, validation: { min: 0 } },
    { type: 'SHORT_TEXT', inputType: 'number', key: 'capital_amount', label: 'Issued amount', condition: prefilledShares, isRequired: true, validation: { min: 0 } },
    { type: 'SHORT_TEXT', inputType: 'number', key: 'capital_paid_up', label: 'Paid-up amount', condition: prefilledShares, isRequired: true, validation: { min: 0 }, helpText: 'Confirm the actual amount paid up for each share class, especially if the shares are partly paid.' },
    { type: 'PAGE_BREAK', inputType: 'repeat_end', key: 'capital_end', label: 'End share capital', condition: prefilledShares },
    { type: 'PAGE_BREAK', inputType: 'repeat_start', key: 'shareholders_section', label: 'Shareholders',
      condition: prefilledShares, validation: { repeatMinItems: 1, repeatMaxItems: 50, repeatItemLabel: 'Shareholder', repeatAddLabel: 'Add shareholder' } },
    { type: 'HIDDEN', key: 'shareholder_record_id', label: 'Shareholder record ID', condition: prefilledShares },
    text('shareholder_name', 'Name', { condition: prefilledShares }),
    text('shareholder_id_number', 'Identification number', { condition: prefilledShares, isRequired: false }),
    { type: 'LONG_TEXT', key: 'shareholder_address', label: 'Address', condition: prefilledShares },
    text('shareholder_class', 'Share class', { condition: prefilledShares }),
    { type: 'SHORT_TEXT', inputType: 'number', key: 'shareholder_shares', label: 'Number of shares', condition: prefilledShares, isRequired: true, validation: { min: 0 } },
    { type: 'PAGE_BREAK', inputType: 'repeat_end', key: 'shareholders_end', label: 'End shareholders', condition: prefilledShares },

    heading('part_financial_statements', 'Part 2: Financial statements'),
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

    heading('part_agm', 'Part 3: AGM matters'),
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

    heading('part_director_statement', "Part 4: Directors' statement", prepare),
    info('director_statement', "Directors' statement",
      'The directors statement accompanying the financial statements is signed by two directors, or by the sole director where there is only one.', prepare),
    yesNo('director_statement_consent', "Have the shareholders agreed to omit directors' interests from the directors' statement?", { condition: prepare }),
    info('director_statement_consent_msg', 'Directors interests disclosure', 'Please provide the shareholders consent and supporting records for the directors interests disclosure.', all(prepare, eq('director_statement_consent', YES))),
    info('director_statement_consent_block', 'Directors interests disclosure pending', 'Please contact us if the company requires assistance with directors interests disclosure.', all(prepare, eq('director_statement_consent', NO))),

    heading('part_particulars', 'Part 5: CEO and company particulars'),
    yesNo(K.ceoExists, 'Does any individual perform the role of chief executive officer of the company?', {
      helpText: 'ACRA asks this in every annual return from 20 October 2026. It is about the role performed, not the job title.' }),
    info('ceo_prefill_guidance', 'CEO record', 'If yes, make sure the CEO is listed under position holders above.', all(prefilled, eq(K.ceoExists, YES))),
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

export function buildSgAnnualReturnDeclarationFields(): FormFieldInput[] {
  return drafts().map((field, position) => ({
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
