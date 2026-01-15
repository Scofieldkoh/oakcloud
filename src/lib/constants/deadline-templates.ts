/**
 * Deadline Templates Data (Singapore Jurisdiction)
 *
 * Hard-coded service templates and deadline rules for Singapore compliance.
 * These are seeded into the DeadlineTemplate table.
 */

import type {
  DeadlineCategory,
  DeadlineAnchorType,
  DeadlineFrequency,
  EntityType,
} from '@/generated/prisma';

export interface DeadlineTemplateData {
  code: string;
  name: string;
  category: DeadlineCategory;
  jurisdiction: string;
  description: string;
  entityTypes: EntityType[] | null;
  excludeEntityTypes: EntityType[] | null;
  requiresGstRegistered: boolean | null;
  requiresAudit: boolean | null;
  isTaxFiling: boolean;
  requiresCharityStatus: boolean | null;
  requiresIPCStatus: boolean | null;
  anchorType: DeadlineAnchorType;
  offsetMonths: number;
  offsetDays: number;
  offsetBusinessDays: boolean;
  fixedMonth: number | null;
  fixedDay: number | null;
  frequency: DeadlineFrequency;
  generateMonthsAhead: number;
  isOptional: boolean;
  optionalNote: string | null;
  isBillable: boolean;
  defaultAmount: number | null;
  reminderDaysBefore: number[];
}

// =============================================================================
// CORPORATE SECRETARIAL TEMPLATES
// =============================================================================

export const CORP_SEC_RENEWAL: DeadlineTemplateData = {
  code: 'CORP_SEC_RENEWAL',
  name: 'Corporate Secretarial Service Renewal',
  category: 'CORPORATE_SECRETARY',
  jurisdiction: 'SG',
  description: `Corporate Secretarial service renewal reminder.
Service period ending: Review and confirm renewal with client.

Action required:
• Confirm renewal with client
• Issue invoice for next service period
• Update contract service dates if renewed`,
  entityTypes: ['PRIVATE_LIMITED', 'EXEMPTED_PRIVATE_LIMITED', 'PUBLIC_LIMITED'],
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'SERVICE_START',
  offsetMonths: 0,
  offsetDays: -30,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: true,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const ANNUAL_RETURN: DeadlineTemplateData = {
  code: 'ANNUAL_RETURN',
  name: 'Annual Return Filing',
  category: 'CORPORATE_SECRETARY',
  jurisdiction: 'SG',
  description: `Annual Return filing with ACRA.

Filing via BizFile+:
• Update registered office address (if changed)
• Update company officers (if changed)
• File financial statements (full/simplified based on company type)

Extension of Time (EOT):
• Can apply to ACRA for 30-60 day extension if needed
• Record EOT approval in system if granted

Late filing penalty: $300 + $50 per month thereafter`,
  entityTypes: ['PRIVATE_LIMITED', 'EXEMPTED_PRIVATE_LIMITED', 'PUBLIC_LIMITED'],
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'FYE',
  offsetMonths: 7,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const XBRL: DeadlineTemplateData = {
  code: 'XBRL',
  name: 'XBRL Financial Statements',
  category: 'CORPORATE_SECRETARY',
  jurisdiction: 'SG',
  description: `XBRL financial statements filing.

Preparation:
• Prepare financial statements in XBRL format using BizFinx
• Full XBRL or Simplified XBRL based on eligibility
• File together with Annual Return

Simplified XBRL eligible if company meets 2 of 3:
• Total revenue ≤ $10 million
• Total assets ≤ $10 million
• Employees ≤ 50

Exempt from XBRL if ALL:
• Total revenue ≤ $500,000
• Total assets ≤ $500,000
• Employees ≤ 5`,
  entityTypes: ['PRIVATE_LIMITED', 'EXEMPTED_PRIVATE_LIMITED', 'PUBLIC_LIMITED'],
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: true,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'FYE',
  offsetMonths: 7,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: true,
  optionalNote: 'XBRL exempt if: revenue ≤ $500K, assets ≤ $500K, employees ≤ 5, or dormant company',
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const FS_TO_MEMBERS: DeadlineTemplateData = {
  code: 'FS_TO_MEMBERS',
  name: 'Send Financial Statements to Members',
  category: 'CORPORATE_SECRETARY',
  jurisdiction: 'SG',
  description: `Send Financial Statements to all members.

If completed within 5 months from FYE:
• Company is EXEMPT from holding AGM for this financial year
• Members can still request AGM within 14 days before 6-month deadline

Requirements:
• Prepare financial statements (audited if required)
• Send to ALL members (shareholders)
• Keep proof of delivery/acknowledgment

Reference: Companies Act Section 175A (Amendment 2017, effective 31 Aug 2018)`,
  entityTypes: ['PRIVATE_LIMITED', 'EXEMPTED_PRIVATE_LIMITED'],
  excludeEntityTypes: ['PUBLIC_LIMITED', 'PUBLIC_COMPANY_LIMITED_BY_GUARANTEE'],
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'FYE',
  offsetMonths: 5,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: true,
  optionalNote: 'Enable to waive AGM requirement. FS must be sent within 5 months of FYE.',
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const AGM: DeadlineTemplateData = {
  code: 'AGM',
  name: 'Annual General Meeting',
  category: 'CORPORATE_SECRETARY',
  jurisdiction: 'SG',
  description: `Annual General Meeting.

Statutory Due Date: Within 6 months from FYE

AGM can be waived if:
• Financial Statements sent to all members within 5 months of FYE, AND
• No member requests AGM (14 days before 6-month deadline)

AGM can be dispensed if:
• Company has elected to dispense with AGMs under Companies Act
• Set company.agmDispensed = true to suppress future AGM deadlines

Note: Dormant companies must still follow the AGM waiver process (send FS to members).
Dormant status does NOT automatically exempt from AGM requirements.

If holding AGM:
• Send notice to shareholders (14 days for private company, 21 days for public)
• Prepare directors' statement and financial statements
• Table financial statements for adoption
• Appoint/re-appoint auditors (if applicable)
• Declare dividends (if any)

Reference: Companies Act Section 175 (as amended 31 Aug 2018)`,
  entityTypes: ['PRIVATE_LIMITED', 'EXEMPTED_PRIVATE_LIMITED', 'PUBLIC_LIMITED'],
  excludeEntityTypes: ['PUBLIC_COMPANY_LIMITED_BY_GUARANTEE'], // CLGs use CLG_AGM
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'FYE',
  offsetMonths: 6,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: 'AGM can be waived if "Send FS to Members" is completed. Skipped if company.agmDispensed = true.',
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

// =============================================================================
// TAX COMPLIANCE TEMPLATES
// =============================================================================

export const TAX_RENEWAL: DeadlineTemplateData = {
  code: 'TAX_RENEWAL',
  name: 'Tax Compliance Service Renewal',
  category: 'TAX',
  jurisdiction: 'SG',
  description: `Tax Compliance service renewal reminder.

Action required:
• Confirm renewal with client
• Issue invoice for next service period
• Update contract service dates if renewed`,
  entityTypes: ['PRIVATE_LIMITED', 'EXEMPTED_PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'PUBLIC_COMPANY_LIMITED_BY_GUARANTEE', 'LIMITED_LIABILITY_PARTNERSHIP', 'FOREIGN_COMPANY', 'VARIABLE_CAPITAL_COMPANY'],
  excludeEntityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP'],
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'SERVICE_START',
  offsetMonths: 0,
  offsetDays: -30,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: true,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const ECI: DeadlineTemplateData = {
  code: 'ECI',
  name: 'Estimated Chargeable Income',
  category: 'TAX',
  jurisdiction: 'SG',
  description: `Estimated Chargeable Income (ECI) filing.

Filing via myTax Portal (e-File) or Form ECI.

Waiver of ECI filing (company need not file if BOTH):
• Annual revenue ≤ $5 million for the financial year, AND
• ECI is NIL for the Year of Assessment

Note: Even if exempt from filing, company may choose to file to enjoy
instalment payment plan for taxes.

Statutory Due Date: 3 months from FYE`,
  entityTypes: ['PRIVATE_LIMITED', 'EXEMPTED_PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'PUBLIC_COMPANY_LIMITED_BY_GUARANTEE', 'LIMITED_LIABILITY_PARTNERSHIP', 'FOREIGN_COMPANY', 'VARIABLE_CAPITAL_COMPANY'],
  excludeEntityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP'],
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: true,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'FYE',
  offsetMonths: 3,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const CORP_TAX: DeadlineTemplateData = {
  code: 'CORP_TAX',
  name: 'Corporate Income Tax Return',
  category: 'TAX',
  jurisdiction: 'SG',
  description: `Corporate Income Tax Return (Form C/C-S).

Form Selection:
• Form C-S (Simplified): If revenue ≤ $5M, only 17% rate income,
  not claiming group relief/foreign tax credit
• Form C (Full): All other cases

Deadlines:
• Paper filing: 30 November
• e-Filing: 15 December

Required documents:
• Tax computation
• Financial statements (audited/unaudited)
• Supporting schedules (capital allowances, donations, etc.)

Extension of Time (EOT):
• Can apply to IRAS for extension if needed
• Record EOT approval in system if granted`,
  entityTypes: ['PRIVATE_LIMITED', 'EXEMPTED_PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'PUBLIC_COMPANY_LIMITED_BY_GUARANTEE', 'LIMITED_LIABILITY_PARTNERSHIP', 'FOREIGN_COMPANY', 'VARIABLE_CAPITAL_COMPANY'],
  excludeEntityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP'],
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: true,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'FIXED_CALENDAR',
  offsetMonths: 0,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: 11, // November
  fixedDay: 30,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

// =============================================================================
// GST FILING TEMPLATES
// =============================================================================

export const GST_RENEWAL: DeadlineTemplateData = {
  code: 'GST_RENEWAL',
  name: 'GST Filing Service Renewal',
  category: 'TAX',
  jurisdiction: 'SG',
  description: `GST Filing service renewal reminder.

Action required:
• Confirm renewal with client
• Issue invoice for next service period
• Update contract service dates if renewed`,
  entityTypes: null, // All entity types
  excludeEntityTypes: null,
  requiresGstRegistered: true,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'SERVICE_START',
  offsetMonths: 0,
  offsetDays: -30,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: true,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const GST_RETURN_Q: DeadlineTemplateData = {
  code: 'GST_RETURN_Q',
  name: 'GST Return (Quarterly)',
  category: 'TAX',
  jurisdiction: 'SG',
  description: `GST Return (Form GST F5) - Quarterly filing.

Filing via myTax Portal:
• Report output tax (GST collected on sales)
• Report input tax (GST paid on purchases)
• Calculate net GST payable or refundable

Standard quarters:
• Q1: Jan-Mar → Due: 30 Apr
• Q2: Apr-Jun → Due: 31 Jul
• Q3: Jul-Sep → Due: 31 Oct
• Q4: Oct-Dec → Due: 31 Jan (next year)

Late filing penalty: $200 per return

Important: Ensure all tax invoices are recorded before filing.`,
  entityTypes: null, // All entity types
  excludeEntityTypes: null,
  requiresGstRegistered: true,
  requiresAudit: null,
  isTaxFiling: true,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'QUARTER_END',
  offsetMonths: 1,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'QUARTERLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: 'Only generated if gstFilingFrequency = QUARTERLY',
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [30, 14, 7],
};

export const GST_RETURN_M: DeadlineTemplateData = {
  code: 'GST_RETURN_M',
  name: 'GST Return (Monthly)',
  category: 'TAX',
  jurisdiction: 'SG',
  description: `GST Return (Form GST F5) - Monthly filing.

Filing via myTax Portal:
• Report output tax (GST collected)
• Report input tax (GST paid)
• Calculate net GST payable/refundable

Statutory Due Date: 1 month after month end
Late filing penalty: $200 per return`,
  entityTypes: null, // All entity types
  excludeEntityTypes: null,
  requiresGstRegistered: true,
  requiresAudit: null,
  isTaxFiling: true,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'MONTH_END',
  offsetMonths: 1,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'MONTHLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: 'Only generated if gstFilingFrequency = MONTHLY',
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [14, 7],
};

// =============================================================================
// PERSONAL TAX TEMPLATES
// =============================================================================

export const PERSONAL_TAX_RENEWAL: DeadlineTemplateData = {
  code: 'PERSONAL_TAX_RENEWAL',
  name: 'Personal Tax Service Renewal',
  category: 'TAX',
  jurisdiction: 'SG',
  description: `Personal Tax service renewal reminder.

Action required:
• Confirm renewal with client
• Issue invoice for next service period
• Update contract service dates if renewed`,
  entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP'],
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'SERVICE_START',
  offsetMonths: 0,
  offsetDays: -30,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: true,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const PERSONAL_TAX: DeadlineTemplateData = {
  code: 'PERSONAL_TAX',
  name: 'Personal Income Tax (Form B/B1)',
  category: 'TAX',
  jurisdiction: 'SG',
  description: `Personal Income Tax Return (Form B/B1).

Form Selection:
• Form B: Self-employed income only (no employment income)
• Form B1: Self-employed + employment income

Filing via myTax Portal:
• Business income (trade/profession)
• 4-line statement (if revenue < $200K) or detailed P&L
• Capital allowances
• Rental income (if any)
• Other income sources

Deadlines:
• Paper filing: 15 April
• e-Filing: 18 April

Note: Late filing may result in estimated assessment and penalties from IRAS.`,
  entityTypes: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP'],
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: true,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'FIXED_CALENDAR',
  offsetMonths: 0,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: 4, // April
  fixedDay: 18, // e-Filing deadline
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

// =============================================================================
// ACCOUNTING TEMPLATES
// =============================================================================

export const ACCOUNTING_RENEWAL: DeadlineTemplateData = {
  code: 'ACCOUNTING_RENEWAL',
  name: 'Accounting Service Renewal',
  category: 'ACCOUNTING',
  jurisdiction: 'SG',
  description: `Accounting service renewal reminder.

Action required:
• Confirm renewal with client
• Issue invoice for next service period
• Update contract service dates if renewed`,
  entityTypes: null, // All entity types
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'SERVICE_START',
  offsetMonths: 0,
  offsetDays: -30,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: true,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const BOOKKEEPING_MONTHLY: DeadlineTemplateData = {
  code: 'BOOKKEEPING_MONTHLY',
  name: 'Monthly Bookkeeping',
  category: 'ACCOUNTING',
  jurisdiction: 'SG',
  description: `Monthly bookkeeping.

Tasks:
• Record all transactions from source documents
• Reconcile bank statements
• Process sales invoices and purchase bills
• Update accounts receivable/payable ledgers
• Prepare month-end journal entries
• Generate trial balance`,
  entityTypes: null, // All entity types
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'MONTH_END',
  offsetMonths: 0,
  offsetDays: 15, // 15 days after month end
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'MONTHLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [7],
};

// =============================================================================
// AUDIT TEMPLATES
// =============================================================================

export const AUDIT_RENEWAL: DeadlineTemplateData = {
  code: 'AUDIT_RENEWAL',
  name: 'Statutory Audit Service Renewal',
  category: 'AUDIT',
  jurisdiction: 'SG',
  description: `Statutory Audit service renewal reminder.

Action required:
• Confirm renewal with client
• Issue invoice for next service period
• Update contract service dates if renewed`,
  entityTypes: ['PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'PUBLIC_COMPANY_LIMITED_BY_GUARANTEE'],
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'SERVICE_START',
  offsetMonths: 0,
  offsetDays: -30,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: true,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const AUDIT_COMPLETION: DeadlineTemplateData = {
  code: 'AUDIT_COMPLETION',
  name: 'Statutory Audit',
  category: 'AUDIT',
  jurisdiction: 'SG',
  description: `Statutory Audit completion.

Internal deadline: 6 months from FYE (to allow time before AR filing)
AR filing deadline: FYE + 7 months

Deliverables:
• Audited financial statements
• Independent auditor's report
• Management letter (if audit findings)

Audit completion required before Annual Return can be filed.`,
  entityTypes: ['PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'PUBLIC_COMPANY_LIMITED_BY_GUARANTEE'],
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: true,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'FYE',
  offsetMonths: 6,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

// =============================================================================
// CLG TEMPLATES
// =============================================================================

export const CLG_SEC_RENEWAL: DeadlineTemplateData = {
  code: 'CLG_SEC_RENEWAL',
  name: 'CLG Corporate Secretarial Service Renewal',
  category: 'CORPORATE_SECRETARY',
  jurisdiction: 'SG',
  description: `CLG Corporate Secretarial service renewal reminder.

Action required:
• Confirm renewal with client
• Issue invoice for next service period
• Update contract service dates if renewed`,
  entityTypes: ['PUBLIC_COMPANY_LIMITED_BY_GUARANTEE'],
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'SERVICE_START',
  offsetMonths: 0,
  offsetDays: -30,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: true,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const CLG_ANNUAL_RETURN: DeadlineTemplateData = {
  code: 'CLG_ANNUAL_RETURN',
  name: 'CLG Annual Return Filing',
  category: 'CORPORATE_SECRETARY',
  jurisdiction: 'SG',
  description: `Annual Return filing with ACRA for Company Limited by Guarantee.

CLGs file:
• Key financial data in XBRL format
• Full signed PDF copy of financial statements

Filing via BizFile+:
• Update registered office address (if changed)
• Update company officers (if changed)
• Update member information

Statutory Due Date: 7 months from FYE
Late filing penalty: $300 + $50 per month thereafter`,
  entityTypes: ['PUBLIC_COMPANY_LIMITED_BY_GUARANTEE'],
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'FYE',
  offsetMonths: 7,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const CLG_AGM: DeadlineTemplateData = {
  code: 'CLG_AGM',
  name: 'CLG Annual General Meeting',
  category: 'CORPORATE_SECRETARY',
  jurisdiction: 'SG',
  description: `Annual General Meeting for Company Limited by Guarantee.

Statutory Due Date: Within 6 months from FYE

IMPORTANT: Unlike private companies, CLGs (as public companies) cannot
dispense with AGMs. AGM must be held every year.

AGM Requirements:
• Send notice to members (21 days for public company)
• Prepare directors' statement and financial statements
• Table financial statements for adoption
• Appoint/re-appoint auditors
• Elect/re-elect governing board members
• Any other business

Reference: Companies Act Section 175`,
  entityTypes: ['PUBLIC_COMPANY_LIMITED_BY_GUARANTEE'],
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: null,
  requiresIPCStatus: null,
  anchorType: 'FYE',
  offsetMonths: 6,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

// =============================================================================
// CHARITY COMPLIANCE TEMPLATES
// =============================================================================

export const CHARITY_RENEWAL: DeadlineTemplateData = {
  code: 'CHARITY_RENEWAL',
  name: 'Charity Compliance Service Renewal',
  category: 'COMPLIANCE',
  jurisdiction: 'SG',
  description: `Charity Compliance service renewal reminder.

Action required:
• Confirm renewal with client
• Issue invoice for next service period
• Update contract service dates if renewed`,
  entityTypes: null, // Any entity type can be a charity
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: true,
  requiresIPCStatus: null,
  anchorType: 'SERVICE_START',
  offsetMonths: 0,
  offsetDays: -30,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: true,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const CHARITY_ANNUAL_REPORT: DeadlineTemplateData = {
  code: 'CHARITY_ANNUAL_REPORT',
  name: 'Charity Annual Report to COC',
  category: 'COMPLIANCE',
  jurisdiction: 'SG',
  description: `Annual Report submission to Commissioner of Charities.

Submit via Charity Portal within 6 months from FYE.

Required submissions:
1. Annual Report (including Financial Statements)
2. Governance Evaluation Checklist

Financial Statements Requirements:
• Prepare per Charities Accounting Standard (CAS) or FRS
• Audit requirements based on gross income/expenditure:

  ≤ $250,000: Independent examiner (any capable person)
  $250,001 - $500,000: Independent examiner (ISCA member)
  > $500,000: Public accountant audit required

  CLGs and IPCs: Always require public accountant audit

Note: Annual Report is published on Charity Portal for public viewing.

Reference: Charities (Accounts and Annual Report) Regulations 2011`,
  entityTypes: null,
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: true,
  requiresIPCStatus: null,
  anchorType: 'FYE',
  offsetMonths: 6,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const CHARITY_GEC: DeadlineTemplateData = {
  code: 'CHARITY_GEC',
  name: 'Governance Evaluation Checklist',
  category: 'COMPLIANCE',
  jurisdiction: 'SG',
  description: `Governance Evaluation Checklist submission.

Submit via Charity Portal together with Annual Report.

The checklist evaluates:
• Board governance and oversight
• Conflict of interest policies
• Strategic planning
• Programme management
• Human resource and volunteer management
• Financial management and controls
• Fundraising practices
• Disclosure and transparency

Use the appropriate checklist version:
• For FY starting on/after 1 Jan 2024: Use updated checklist
• Published results contribute to charity's transparency score`,
  entityTypes: null,
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: true,
  requiresIPCStatus: null,
  anchorType: 'FYE',
  offsetMonths: 6,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

// =============================================================================
// IPC COMPLIANCE TEMPLATES
// =============================================================================

export const IPC_RENEWAL: DeadlineTemplateData = {
  code: 'IPC_RENEWAL',
  name: 'IPC Compliance Service Renewal',
  category: 'COMPLIANCE',
  jurisdiction: 'SG',
  description: `IPC Compliance service renewal reminder.

Action required:
• Confirm renewal with client
• Issue invoice for next service period
• Update contract service dates if renewed`,
  entityTypes: null,
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: true,
  requiresIPCStatus: true,
  anchorType: 'SERVICE_START',
  offsetMonths: 0,
  offsetDays: -30,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: true,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const IPC_TDD_RETURN: DeadlineTemplateData = {
  code: 'IPC_TDD_RETURN',
  name: 'Annual Tax-Deductible Donation Return',
  category: 'COMPLIANCE',
  jurisdiction: 'SG',
  description: `Annual Return for Tax-Deductible Donations to IRAS.

Report all tax-deductible donations received in previous calendar year.

Submission deadline: 31 January

Required information for each donation:
• Donor identification (NRIC/FIN for individuals, UEN for companies)
• Donation amount
• Date of donation
• Type of donation (cash, shares, artefacts, etc.)

Submit via IRAS Donation Management System (DMS).

IMPORTANT:
• Donor tax deductions (250%) are auto-included in assessments based on this return
• Late/incorrect submissions affect donors' tax deductions
• Encourage early submission before deadline

Reference: IRAS Tax-Deductible Donations guidelines`,
  entityTypes: null,
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: true,
  requiresCharityStatus: true,
  requiresIPCStatus: true,
  anchorType: 'FIXED_CALENDAR',
  offsetMonths: 0,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: 1, // January
  fixedDay: 31,
  frequency: 'ANNUALLY',
  generateMonthsAhead: 18,
  isOptional: false,
  optionalNote: null,
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [60, 30, 14, 7],
};

export const IPC_STATUS_RENEWAL: DeadlineTemplateData = {
  code: 'IPC_STATUS_RENEWAL',
  name: 'IPC Status Renewal Application',
  category: 'COMPLIANCE',
  jurisdiction: 'SG',
  description: `IPC Status Renewal Application.

Recommended submission: At least 3 months before expiry

Renewal requirements:
• Continue to meet IPC criteria
• Good compliance track record
• No adverse findings from COC
• Sector Administrator approval

Application via Charity Portal.
Processing time: Approximately 2 months.

Note: If IPC status lapses, donors will no longer receive tax deductions
for donations made after expiry date.`,
  entityTypes: null,
  excludeEntityTypes: null,
  requiresGstRegistered: null,
  requiresAudit: null,
  isTaxFiling: false,
  requiresCharityStatus: true,
  requiresIPCStatus: true,
  anchorType: 'IPC_EXPIRY',
  offsetMonths: -3,
  offsetDays: 0,
  offsetBusinessDays: false,
  fixedMonth: null,
  fixedDay: null,
  frequency: 'ONE_TIME',
  generateMonthsAhead: 18,
  isOptional: true,
  optionalNote: 'Only if IPC status is expiring. Check ipcExpiryDate.',
  isBillable: false,
  defaultAmount: null,
  reminderDaysBefore: [90, 60, 30],
};

// =============================================================================
// ALL TEMPLATES COLLECTION
// =============================================================================

export const ALL_DEADLINE_TEMPLATES: DeadlineTemplateData[] = [
  // Corporate Secretarial
  CORP_SEC_RENEWAL,
  ANNUAL_RETURN,
  XBRL,
  FS_TO_MEMBERS,
  AGM,

  // Tax Compliance
  TAX_RENEWAL,
  ECI,
  CORP_TAX,

  // GST Filing
  GST_RENEWAL,
  GST_RETURN_Q,
  GST_RETURN_M,

  // Personal Tax
  PERSONAL_TAX_RENEWAL,
  PERSONAL_TAX,

  // Accounting
  ACCOUNTING_RENEWAL,
  BOOKKEEPING_MONTHLY,

  // Audit
  AUDIT_RENEWAL,
  AUDIT_COMPLETION,

  // CLG
  CLG_SEC_RENEWAL,
  CLG_ANNUAL_RETURN,
  CLG_AGM,

  // Charity Compliance
  CHARITY_RENEWAL,
  CHARITY_ANNUAL_REPORT,
  CHARITY_GEC,

  // IPC Compliance
  IPC_RENEWAL,
  IPC_TDD_RETURN,
  IPC_STATUS_RENEWAL,
];

// =============================================================================
// SERVICE TEMPLATE BUNDLES
// =============================================================================

export interface ServiceTemplateBundle {
  code: string;
  name: string;
  category: DeadlineCategory;
  description: string;
  deadlineTemplateCodes: string[];
}

export const CORP_SEC_ANNUAL_BUNDLE: ServiceTemplateBundle = {
  code: 'CORP_SEC_ANNUAL',
  name: 'Corporate Secretarial (Annual)',
  category: 'CORPORATE_SECRETARY',
  description: `Annual corporate secretarial services including:
• Maintenance of statutory registers and records
• Annual Return filing with ACRA
• XBRL financial statements preparation (if applicable)
• AGM coordination (if required and not dispensed)
• Minutes and resolutions preparation
• Registered office services`,
  deadlineTemplateCodes: ['CORP_SEC_RENEWAL', 'ANNUAL_RETURN', 'XBRL', 'FS_TO_MEMBERS', 'AGM'],
};

export const TAX_ANNUAL_BUNDLE: ServiceTemplateBundle = {
  code: 'TAX_ANNUAL',
  name: 'Tax Compliance (Annual)',
  category: 'TAX',
  description: `Annual tax compliance services including:
• Estimated Chargeable Income (ECI) preparation and filing
• Corporate Income Tax Return (Form C/C-S) preparation and filing
• Tax computation and supporting schedules
• Liaison with IRAS on tax matters`,
  deadlineTemplateCodes: ['TAX_RENEWAL', 'ECI', 'CORP_TAX'],
};

export const GST_FILING_BUNDLE: ServiceTemplateBundle = {
  code: 'GST_FILING',
  name: 'GST Filing',
  category: 'TAX',
  description: `GST return preparation and filing services including:
• GST return (Form GST F5) preparation
• Input tax and output tax reconciliation
• GST return filing via myTax Portal
• GST compliance advisory`,
  deadlineTemplateCodes: ['GST_RENEWAL', 'GST_RETURN_Q', 'GST_RETURN_M'],
};

export const PERSONAL_TAX_BUNDLE: ServiceTemplateBundle = {
  code: 'PERSONAL_TAX_SP',
  name: 'Personal Tax (Sole Proprietor)',
  category: 'TAX',
  description: `Personal income tax services for sole proprietor/partner including:
• Form B/B1 preparation
• Business income computation (4-line statement or detailed P&L)
• Capital allowances and deductions
• Tax filing via myTax Portal`,
  deadlineTemplateCodes: ['PERSONAL_TAX_RENEWAL', 'PERSONAL_TAX'],
};

export const ACCOUNTING_MONTHLY_BUNDLE: ServiceTemplateBundle = {
  code: 'ACCOUNTING_MONTHLY',
  name: 'Accounting Services (Monthly)',
  category: 'ACCOUNTING',
  description: `Monthly accounting services including:
• Transaction recording and bookkeeping
• Bank reconciliation
• Accounts receivable/payable management
• Monthly financial reports
• Management accounts (if required)`,
  deadlineTemplateCodes: ['ACCOUNTING_RENEWAL', 'BOOKKEEPING_MONTHLY'],
};

export const AUDIT_ANNUAL_BUNDLE: ServiceTemplateBundle = {
  code: 'AUDIT_ANNUAL',
  name: 'Statutory Audit',
  category: 'AUDIT',
  description: `Annual statutory audit services including:
• Audit planning and risk assessment
• Substantive testing and verification
• Financial statement review and audit adjustments
• Audit report preparation (unqualified/qualified/adverse/disclaimer)
• Management letter (if findings)
• Liaison with management on audit matters`,
  deadlineTemplateCodes: ['AUDIT_RENEWAL', 'AUDIT_COMPLETION'],
};

export const CLG_CORP_SEC_BUNDLE: ServiceTemplateBundle = {
  code: 'CLG_CORP_SEC',
  name: 'CLG Corporate Secretarial (Annual)',
  category: 'CORPORATE_SECRETARY',
  description: `Annual corporate secretarial services for Company Limited by Guarantee including:
• Maintenance of statutory registers and records
• Annual Return filing with ACRA
• Financial statements preparation (XBRL key data + PDF)
• AGM coordination and documentation
• Minutes and resolutions preparation
• Registered office services
• Member register maintenance`,
  deadlineTemplateCodes: ['CLG_SEC_RENEWAL', 'CLG_ANNUAL_RETURN', 'CLG_AGM'],
};

export const CHARITY_COMPLIANCE_BUNDLE: ServiceTemplateBundle = {
  code: 'CHARITY_COMPLIANCE',
  name: 'Charity Compliance (Annual)',
  category: 'COMPLIANCE',
  description: `Annual charity compliance services including:
• Annual Report preparation (per Charities Regulations)
• Financial statements preparation (Charities Accounting Standard)
• Governance Evaluation Checklist completion
• Charity Portal submissions
• Liaison with Commissioner of Charities`,
  deadlineTemplateCodes: ['CHARITY_RENEWAL', 'CHARITY_ANNUAL_REPORT', 'CHARITY_GEC'],
};

export const IPC_COMPLIANCE_BUNDLE: ServiceTemplateBundle = {
  code: 'IPC_COMPLIANCE',
  name: 'IPC Compliance (Annual)',
  category: 'COMPLIANCE',
  description: `Annual IPC compliance services including:
• Tax-deductible donation record management
• Annual TDD return submission to IRAS
• Donation receipt issuance and tracking
• IPC renewal preparation (if applicable)
• Compliance with Sector Administrator requirements`,
  deadlineTemplateCodes: ['IPC_RENEWAL', 'IPC_TDD_RETURN', 'IPC_STATUS_RENEWAL'],
};

export const ALL_SERVICE_BUNDLES: ServiceTemplateBundle[] = [
  CORP_SEC_ANNUAL_BUNDLE,
  TAX_ANNUAL_BUNDLE,
  GST_FILING_BUNDLE,
  PERSONAL_TAX_BUNDLE,
  ACCOUNTING_MONTHLY_BUNDLE,
  AUDIT_ANNUAL_BUNDLE,
  CLG_CORP_SEC_BUNDLE,
  CHARITY_COMPLIANCE_BUNDLE,
  IPC_COMPLIANCE_BUNDLE,
];
