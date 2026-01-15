# Deadline Management - Hard-coded Rules (Singapore)

> **Status**: Draft
> **Version**: 2.0
> **Last Updated**: 2026-01-15
> **Jurisdiction**: Singapore

This document defines the hard-coded service templates and deadline rules for Singapore compliance.

---

## Overview

Service Templates serve as pre-configured templates when adding services to contracts. Each template defines:
1. **Service parameters** - Name, type, frequency, rate, scope, renewal settings
2. **Generated deadlines** - Compliance deadlines auto-created when service is added

---

## Critical Design Principles

### No Daisy-Chaining

All statutory deadlines MUST anchor to stable reference points:
- **FYE** - Financial Year End
- **FIXED_CALENDAR** - Fixed date each year (e.g., 30 Nov for Corp Tax)
- **QUARTER_END** / **MONTH_END** - For GST/periodic filings
- **SERVICE_START** - For renewals only

**Never use**: Task dependencies (e.g., AR depends on AGM completion). Each deadline stands independently.

### Dormant Company Handling

**Important**: Dormant status does NOT automatically exempt companies from compliance obligations:
- **AGM**: Dormant companies follow the same AGM waiver process (send FS to members within 5 months)
- **Tax Filing**: Requires IRAS approval to be exempted. Use `dormantTaxExemptionApproved` flag only after IRAS grants exemption.

---

## Service Template Structure

```typescript
interface ServiceTemplate {
  // Identity
  code: string;                    // Unique code (e.g., "CORP_SEC_ANNUAL")
  name: string;                    // Display name
  category: DeadlineCategory;      // CORPORATE_SECRETARY | TAX | ACCOUNTING | AUDIT
  jurisdiction: string;            // "SG" for Singapore

  // Service Parameters (maps to ContractService)
  serviceType: 'RECURRING' | 'ONE_TIME';
  frequency: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY' | 'ONE_TIME';
  defaultRate: number | null;      // Default fee (nullable, user can override)
  currency: string;                // Default: 'SGD'
  scope: string;                   // Default scope description (rich text)
  autoRenewal: boolean;            // Default auto-renewal setting
  renewalPeriodMonths: number;     // Renewal period in months

  // Applicability
  entityTypes: EntityType[] | null;        // Applicable entity types (null = all)
  excludeEntityTypes: EntityType[] | null; // Excluded entity types
  requiresGstRegistered: boolean | null;   // GST requirement (null = N/A)

  // Service-specific parameters (user must fill when adding)
  requiredFields: ServiceField[];

  // Generated Deadlines
  deadlines: DeadlineTemplate[];
}

interface DeadlineTemplate {
  code: string;
  name: string;
  category: DeadlineCategory;
  jurisdiction: string;            // "SG" for Singapore
  isBillable: boolean;
  isOptional: boolean;             // If true, shown as optional checkbox when generating
  optionalNote: string | null;     // Explanation if optional

  // Applicability
  isTaxFiling: boolean;            // If true, skipped when dormantTaxExemptionApproved = true

  // Deadline calculation
  anchorType: 'FYE' | 'SERVICE_START' | 'FIXED_CALENDAR' | 'QUARTER_END' | 'MONTH_END';
  offsetMonths: number;
  offsetDays: number;
  offsetBusinessDays: boolean;     // If true, skip weekends/holidays in calculation
  fixedMonth: number | null;       // For FIXED_CALENDAR
  fixedDay: number | null;

  // Recurrence
  frequency: 'ANNUALLY' | 'QUARTERLY' | 'MONTHLY' | 'ONE_TIME';

  // Reminder intervals (days before due date)
  reminderDaysBefore: number[];

  // Description template (supports placeholders)
  description: string;
}
```

---

## Service Template 1: Corporate Secretarial (Annual)

### Service Definition

| Field | Value |
|-------|-------|
| **Code** | `CORP_SEC_ANNUAL` |
| **Name** | Corporate Secretarial (Annual) |
| **Category** | CORPORATE_SECRETARY |
| **Jurisdiction** | SG |
| **Service Type** | RECURRING |
| **Frequency** | ANNUALLY |
| **Default Rate** | null (user specifies) |
| **Currency** | SGD |
| **Auto Renewal** | true |
| **Renewal Period** | 12 months |

### Applicability

```
entityTypes: [PRIVATE_LIMITED, EXEMPTED_PRIVATE_LIMITED, PUBLIC_LIMITED]
excludeEntityTypes: null
requiresGstRegistered: null
// Note: Service applies to dormant companies - they still need corp sec services
```

### Required Fields When Adding Service

| Field | Type | Description |
|-------|------|-------------|
| `rate` | Decimal | Annual service fee |
| `startDate` | Date | Service start date |

### Default Scope

```
Annual corporate secretarial services including:
• Maintenance of statutory registers and records
• Annual Return filing with ACRA
• XBRL financial statements preparation (if applicable)
• AGM coordination (if required and not dispensed)
• Minutes and resolutions preparation
• Registered office services
```

### Generated Deadlines

#### 1.1 Corporate Secretarial Service Renewal

| Field | Value |
|-------|-------|
| **Code** | `CORP_SEC_RENEWAL` |
| **Name** | Corporate Secretarial Service Renewal |
| **Category** | CORPORATE_SECRETARY |
| **Jurisdiction** | SG |
| **Billable** | Yes |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: SERVICE_START (anniversary)
offsetMonths: 0
offsetDays: -30 (30 days before anniversary)
frequency: ANNUALLY
```

**Description:**
```
Corporate Secretarial service renewal for {COMPANY_NAME}.
Service period ending: {SERVICE_PERIOD_END}

Action required:
• Confirm renewal with client
• Issue invoice for next service period (${AMOUNT})
• Update contract service dates if renewed
```

---

#### 1.2 Annual Return (AR)

| Field | Value |
|-------|-------|
| **Code** | `ANNUAL_RETURN` |
| **Name** | Annual Return Filing |
| **Category** | CORPORATE_SECRETARY |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: FYE
offsetMonths: 7   // Private companies: 7 months from FYE
offsetDays: 0
frequency: ANNUALLY

// Note:
// - Private companies: 7 months from FYE
// - Public companies: 5 months from FYE (handle via entity type)
// - AR deadline is INDEPENDENT of AGM completion
```

**Period:**
```
periodLabel: "FY{FYE_YEAR}"
periodStart: financialYearStart
periodEnd: financialYearEnd
```

**Description:**
```
Annual Return filing with ACRA for financial year ending {FYE_DATE}.

Filing via BizFile+:
• Update registered office address (if changed)
• Update company officers (if changed)
• File financial statements (full/simplified based on company type)

Statutory Due Date: {STATUTORY_DUE_DATE} (7 months from FYE)

Extension of Time (EOT):
• Can apply to ACRA for 30-60 day extension if needed
• Record EOT approval in system if granted

Late filing penalty: $300 + $50 per month thereafter
```

---

#### 1.3 XBRL Financial Statements

| Field | Value |
|-------|-------|
| **Code** | `XBRL` |
| **Name** | XBRL Financial Statements |
| **Category** | CORPORATE_SECRETARY |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | Yes |
| **Optional Note** | "XBRL exempt if: revenue ≤ $500K, assets ≤ $500K, employees ≤ 5, or dormant company" |
| **Is Tax Filing** | true |

**Calculation:**
```
anchorType: FYE
offsetMonths: 7   // Filed together with Annual Return
offsetDays: 0
frequency: ANNUALLY
```

**Period:**
```
periodLabel: "FY{FYE_YEAR}"
```

**Description:**
```
XBRL financial statements filing for FY ending {FYE_DATE}.

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
• Employees ≤ 5
```

---

#### 1.4 Send Financial Statements to Members (Optional - Waives AGM)

| Field | Value |
|-------|-------|
| **Code** | `FS_TO_MEMBERS` |
| **Name** | Send Financial Statements to Members |
| **Category** | CORPORATE_SECRETARY |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | Yes |
| **Optional Note** | "Enable to waive AGM requirement. FS must be sent within 5 months of FYE." |
| **Is Tax Filing** | true |

**Calculation:**
```
anchorType: FYE
offsetMonths: 5   // Must be within 5 months of FYE
offsetDays: 0
frequency: ANNUALLY
```

**Period:**
```
periodLabel: "FY{FYE_YEAR}"
```

**Description:**
```
Send Financial Statements to all members for FY ending {FYE_DATE}.

If completed before {STATUTORY_DUE_DATE} (5 months from FYE):
• Company is EXEMPT from holding AGM for this financial year
• Members can still request AGM within 14 days before 6-month deadline

Requirements:
• Prepare financial statements (audited if required)
• Send to ALL members (shareholders)
• Keep proof of delivery/acknowledgment

Reference: Companies Act Section 175A (Amendment 2017, effective 31 Aug 2018)
```

---

#### 1.5 Annual General Meeting (AGM)

| Field | Value |
|-------|-------|
| **Code** | `AGM` |
| **Name** | Annual General Meeting |
| **Category** | CORPORATE_SECRETARY |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No (default required) |
| **Optional Note** | "AGM can be waived if 'Send FS to Members' is completed. Skipped if company.agmDispensed = true." |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: FYE
offsetMonths: 6   // Within 6 months from FYE
offsetDays: 0
frequency: ANNUALLY

// Note: For companies incorporated after 31 Aug 2018, the first AGM
// deadline is also 6 months from FYE (no special 18-month rule).
```

**Period:**
```
periodLabel: "FY{FYE_YEAR}"
```

**Company Flag Check:**
```
// Skip generation if company.agmDispensed = true
// This is checked in the Generation State Machine before creating the deadline
```

**Waiver Condition:**
```
Can be marked as WAIVED if:
  - "Send FS to Members" (FS_TO_MEMBERS) for same period is COMPLETED
  - No member has requested AGM
```

**Description:**
```
Annual General Meeting for FY ending {FYE_DATE}.

Statutory Due Date: Within 6 months from FYE ({STATUTORY_DUE_DATE})

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

Reference: Companies Act Section 175 (as amended 31 Aug 2018)
```

---

## Service Template 2: Tax Compliance (Annual)

### Service Definition

| Field | Value |
|-------|-------|
| **Code** | `TAX_ANNUAL` |
| **Name** | Tax Compliance (Annual) |
| **Category** | TAX |
| **Jurisdiction** | SG |
| **Service Type** | RECURRING |
| **Frequency** | ANNUALLY |
| **Default Rate** | null |
| **Currency** | SGD |
| **Auto Renewal** | true |
| **Renewal Period** | 12 months |

### Applicability

```
entityTypes: [PRIVATE_LIMITED, EXEMPTED_PRIVATE_LIMITED, PUBLIC_LIMITED,
              LIMITED_LIABILITY_PARTNERSHIP, FOREIGN_COMPANY, VARIABLE_CAPITAL_COMPANY]
excludeEntityTypes: [SOLE_PROPRIETORSHIP, PARTNERSHIP]  // Use Personal Tax instead
requiresGstRegistered: null
// Note: Dormant companies still need tax filing unless IRAS grants exemption
// Use dormantTaxExemptionApproved flag to skip tax deadline generation
```

### Required Fields When Adding Service

| Field | Type | Description |
|-------|------|-------------|
| `rate` | Decimal | Annual service fee |
| `startDate` | Date | Service start date |

### Default Scope

```
Annual tax compliance services including:
• Estimated Chargeable Income (ECI) preparation and filing
• Corporate Income Tax Return (Form C/C-S) preparation and filing
• Tax computation and supporting schedules
• Liaison with IRAS on tax matters
```

### Generated Deadlines

#### 2.1 Tax Service Renewal

| Field | Value |
|-------|-------|
| **Code** | `TAX_RENEWAL` |
| **Name** | Tax Compliance Service Renewal |
| **Category** | TAX |
| **Jurisdiction** | SG |
| **Billable** | Yes |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: SERVICE_START
offsetMonths: 0
offsetDays: -30
frequency: ANNUALLY
```

---

#### 2.2 Estimated Chargeable Income (ECI)

| Field | Value |
|-------|-------|
| **Code** | `ECI` |
| **Name** | Estimated Chargeable Income |
| **Category** | TAX |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Is Tax Filing** | true |

**Calculation:**
```
anchorType: FYE
offsetMonths: 3   // Within 3 months from FYE
offsetDays: 0
frequency: ANNUALLY
```

**Period:**
```
yearOfAssessment: FYE_YEAR + 1
periodLabel: "YA{YA}"
periodStart: financialYearStart
periodEnd: financialYearEnd
```

**Description:**
```
Estimated Chargeable Income (ECI) for Year of Assessment {YA}.
Financial year: {FYE_START} to {FYE_END}

Filing via myTax Portal (e-File) or Form ECI.

Waiver of ECI filing (company need not file if BOTH):
• Annual revenue ≤ $5 million for the financial year, AND
• ECI is NIL for the Year of Assessment

Note: Even if exempt from filing, company may choose to file to enjoy
instalment payment plan for taxes.

Statutory Due Date: {STATUTORY_DUE_DATE} (3 months from FYE)
```

---

#### 2.3 Corporate Income Tax Return

| Field | Value |
|-------|-------|
| **Code** | `CORP_TAX` |
| **Name** | Corporate Income Tax Return |
| **Category** | TAX |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Is Tax Filing** | true |

**Calculation:**
```
anchorType: FIXED_CALENDAR
fixedMonth: 11   // November
fixedDay: 30     // 30 November
// Year = FYE_YEAR + 1 (Year of Assessment)
frequency: ANNUALLY

// Extended e-filing deadline: 15 December
eFilingDeadline: {YA}-12-15
```

**Period:**
```
yearOfAssessment: FYE_YEAR + 1
periodLabel: "YA{YA}"
periodStart: financialYearStart
periodEnd: financialYearEnd
```

**Description:**
```
Corporate Income Tax Return for Year of Assessment {YA}.
Financial year: {FYE_START} to {FYE_END}

Form Selection:
• Form C-S (Simplified): If revenue ≤ $5M, only 17% rate income,
  not claiming group relief/foreign tax credit
• Form C (Full): All other cases

Deadlines:
• Paper filing: 30 November {YA}
• e-Filing: 15 December {YA}

Required documents:
• Tax computation
• Financial statements (audited/unaudited)
• Supporting schedules (capital allowances, donations, etc.)

Extension of Time (EOT):
• Can apply to IRAS for extension if needed
• Record EOT approval in system if granted
```

---

## Service Template 3: GST Filing

### Service Definition

| Field | Value |
|-------|-------|
| **Code** | `GST_FILING` |
| **Name** | GST Filing |
| **Category** | TAX |
| **Jurisdiction** | SG |
| **Service Type** | RECURRING |
| **Frequency** | QUARTERLY or MONTHLY (user selects) |
| **Default Rate** | null |
| **Currency** | SGD |
| **Auto Renewal** | true |
| **Renewal Period** | 12 months |

### Applicability

```
entityTypes: null  // All entity types
requiresGstRegistered: true  // MUST be GST registered
// Note: GST-registered dormant companies may apply for voluntary de-registration
```

### Required Fields When Adding Service

| Field | Type | Description |
|-------|------|-------------|
| `rate` | Decimal | Service fee (per filing or annual) |
| `startDate` | Date | Service start date |
| `gstFilingFrequency` | Enum | QUARTERLY or MONTHLY (required) |

### Default Scope

```
GST return preparation and filing services including:
• GST return (Form GST F5) preparation
• Input tax and output tax reconciliation
• GST return filing via myTax Portal
• GST compliance advisory
```

### Generated Deadlines

#### 3.1 GST Service Renewal

| Field | Value |
|-------|-------|
| **Code** | `GST_RENEWAL` |
| **Name** | GST Filing Service Renewal |
| **Category** | TAX |
| **Jurisdiction** | SG |
| **Billable** | Yes |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: SERVICE_START
offsetMonths: 0
offsetDays: -30
frequency: ANNUALLY
```

---

#### 3.2 GST Return (Quarterly)

| Field | Value |
|-------|-------|
| **Code** | `GST_RETURN_Q` |
| **Name** | GST Return (Quarterly) |
| **Category** | TAX |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Condition** | Only generated if `gstFilingFrequency = QUARTERLY` |
| **Is Tax Filing** | true |

**Calculation:**
```
anchorType: QUARTER_END
offsetMonths: 1   // 1 month after quarter end
offsetDays: 0
frequency: QUARTERLY

// Standard quarters:
// Q1: Jan-Mar → Due: 30 Apr
// Q2: Apr-Jun → Due: 31 Jul
// Q3: Jul-Sep → Due: 31 Oct
// Q4: Oct-Dec → Due: 31 Jan (next year)
```

**Period:**
```
periodLabel: "Q{QUARTER} {YEAR}"  // e.g., "Q1 2025"
periodStart: quarterStart
periodEnd: quarterEnd
```

**Description:**
```
GST Return (Form GST F5) for {PERIOD_LABEL}.
Period: {PERIOD_START} to {PERIOD_END}

Filing via myTax Portal:
• Report output tax (GST collected on sales)
• Report input tax (GST paid on purchases)
• Calculate net GST payable or refundable

Statutory Due Date: {STATUTORY_DUE_DATE} (1 month after quarter end)
Late filing penalty: $200 per return

Important: Ensure all tax invoices are recorded before filing.
```

---

#### 3.3 GST Return (Monthly)

| Field | Value |
|-------|-------|
| **Code** | `GST_RETURN_M` |
| **Name** | GST Return (Monthly) |
| **Category** | TAX |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Condition** | Only generated if `gstFilingFrequency = MONTHLY` |
| **Is Tax Filing** | true |

**Calculation:**
```
anchorType: MONTH_END
offsetMonths: 1   // 1 month after month end
offsetDays: 0
frequency: MONTHLY
```

**Period:**
```
periodLabel: "{MONTH_NAME} {YEAR}"  // e.g., "January 2025"
periodStart: monthStart
periodEnd: monthEnd
```

**Description:**
```
GST Return (Form GST F5) for {PERIOD_LABEL}.
Period: {PERIOD_START} to {PERIOD_END}

Filing via myTax Portal:
• Report output tax (GST collected)
• Report input tax (GST paid)
• Calculate net GST payable/refundable

Statutory Due Date: {STATUTORY_DUE_DATE} (1 month after month end)
Late filing penalty: $200 per return
```

---

## Service Template 4: Personal Tax (Sole Proprietor/Partnership)

### Service Definition

| Field | Value |
|-------|-------|
| **Code** | `PERSONAL_TAX_SP` |
| **Name** | Personal Tax (Sole Proprietor) |
| **Category** | TAX |
| **Jurisdiction** | SG |
| **Service Type** | RECURRING |
| **Frequency** | ANNUALLY |
| **Default Rate** | null |
| **Currency** | SGD |
| **Auto Renewal** | true |
| **Renewal Period** | 12 months |

### Applicability

```
entityTypes: [SOLE_PROPRIETORSHIP, PARTNERSHIP]
requiresGstRegistered: null
// Note: Personal tax filing still required for dormant sole props/partnerships
```

### Required Fields When Adding Service

| Field | Type | Description |
|-------|------|-------------|
| `rate` | Decimal | Annual service fee |
| `startDate` | Date | Service start date |

### Default Scope

```
Personal income tax services for sole proprietor/partner including:
• Form B/B1 preparation
• Business income computation (4-line statement or detailed P&L)
• Capital allowances and deductions
• Tax filing via myTax Portal
```

### Generated Deadlines

#### 4.1 Personal Tax Service Renewal

| Field | Value |
|-------|-------|
| **Code** | `PERSONAL_TAX_RENEWAL` |
| **Name** | Personal Tax Service Renewal |
| **Category** | TAX |
| **Jurisdiction** | SG |
| **Billable** | Yes |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: SERVICE_START
offsetMonths: 0
offsetDays: -30
frequency: ANNUALLY
```

---

#### 4.2 Personal Income Tax Filing (Form B/B1)

| Field | Value |
|-------|-------|
| **Code** | `PERSONAL_TAX` |
| **Name** | Personal Income Tax (Form B/B1) |
| **Category** | TAX |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Is Tax Filing** | true |

**Calculation:**
```
// Personal tax follows calendar year (Jan-Dec)
// YA = Previous calendar year + 1
// e.g., YA 2025 = income from 1 Jan 2024 to 31 Dec 2024

anchorType: FIXED_CALENDAR
fixedMonth: 4    // April
fixedDay: 18     // 18 April (e-filing deadline)
frequency: ANNUALLY

// Paper filing deadline: 15 April
paperFilingDeadline: {YA}-04-15
```

**Period:**
```
basisYear: YA - 1
periodLabel: "YA{YA}"
periodStart: {basisYear}-01-01
periodEnd: {basisYear}-12-31
```

**Description:**
```
Personal Income Tax Return for Year of Assessment {YA}.
Basis period: 1 January {BASIS_YEAR} to 31 December {BASIS_YEAR}

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
• Paper filing: 15 April {YA}
• e-Filing: 18 April {YA}

Note: Late filing may result in estimated assessment and penalties from IRAS.
```

---

## Service Template 5: Accounting (Monthly)

### Service Definition

| Field | Value |
|-------|-------|
| **Code** | `ACCOUNTING_MONTHLY` |
| **Name** | Accounting Services (Monthly) |
| **Category** | ACCOUNTING |
| **Jurisdiction** | SG |
| **Service Type** | RECURRING |
| **Frequency** | MONTHLY |
| **Default Rate** | null |
| **Currency** | SGD |
| **Auto Renewal** | true |
| **Renewal Period** | 12 months |

### Applicability

```
entityTypes: null  // All entity types
requiresGstRegistered: null
// Note: Dormant companies may still need minimal bookkeeping
```

### Required Fields When Adding Service

| Field | Type | Description |
|-------|------|-------------|
| `rate` | Decimal | Monthly service fee |
| `startDate` | Date | Service start date |

### Default Scope

```
Monthly accounting services including:
• Transaction recording and bookkeeping
• Bank reconciliation
• Accounts receivable/payable management
• Monthly financial reports
• Management accounts (if required)
```

### Generated Deadlines

#### 5.1 Accounting Service Renewal

| Field | Value |
|-------|-------|
| **Code** | `ACCOUNTING_RENEWAL` |
| **Name** | Accounting Service Renewal |
| **Category** | ACCOUNTING |
| **Jurisdiction** | SG |
| **Billable** | Yes |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: SERVICE_START
offsetMonths: 0
offsetDays: -30
frequency: ANNUALLY
```

---

#### 5.2 Monthly Bookkeeping

| Field | Value |
|-------|-------|
| **Code** | `BOOKKEEPING_MONTHLY` |
| **Name** | Monthly Bookkeeping |
| **Category** | ACCOUNTING |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: MONTH_END
offsetMonths: 0
offsetDays: 15   // 15 days after month end (internal deadline)
frequency: MONTHLY
```

**Period:**
```
periodLabel: "{MONTH_NAME} {YEAR}"
periodStart: monthStart
periodEnd: monthEnd
```

**Description:**
```
Monthly bookkeeping for {PERIOD_LABEL}.

Tasks:
• Record all transactions from source documents
• Reconcile bank statements
• Process sales invoices and purchase bills
• Update accounts receivable/payable ledgers
• Prepare month-end journal entries
• Generate trial balance

Internal deadline: {INTERNAL_DUE_DATE}
```

---

## Service Template 6: Statutory Audit (Annual)

### Service Definition

| Field | Value |
|-------|-------|
| **Code** | `AUDIT_ANNUAL` |
| **Name** | Statutory Audit |
| **Category** | AUDIT |
| **Jurisdiction** | SG |
| **Service Type** | RECURRING |
| **Frequency** | ANNUALLY |
| **Default Rate** | null |
| **Currency** | SGD |
| **Auto Renewal** | true |
| **Renewal Period** | 12 months |

### Applicability

```
// NOT auto-suggested. User manually adds if company requires audit.
entityTypes: [PRIVATE_LIMITED, PUBLIC_LIMITED]
requiresGstRegistered: null
// Note: Dormant companies are typically exempt from audit requirements

// Note: Small company exemption criteria (must meet 2 of 3 for 2 consecutive FYs):
// - Total revenue ≤ $10 million
// - Total assets ≤ $10 million
// - Employees ≤ 50
// System does NOT auto-assess. User determines if audit is required.
```

### Required Fields When Adding Service

| Field | Type | Description |
|-------|------|-------------|
| `rate` | Decimal | Annual audit fee |
| `startDate` | Date | Service start date |

### Default Scope

```
Annual statutory audit services including:
• Audit planning and risk assessment
• Substantive testing and verification
• Financial statement review and audit adjustments
• Audit report preparation (unqualified/qualified/adverse/disclaimer)
• Management letter (if findings)
• Liaison with management on audit matters
```

### Generated Deadlines

#### 6.1 Audit Service Renewal

| Field | Value |
|-------|-------|
| **Code** | `AUDIT_RENEWAL` |
| **Name** | Statutory Audit Service Renewal |
| **Category** | AUDIT |
| **Jurisdiction** | SG |
| **Billable** | Yes |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: SERVICE_START
offsetMonths: 0
offsetDays: -30
frequency: ANNUALLY
```

---

#### 6.2 Statutory Audit Completion

| Field | Value |
|-------|-------|
| **Code** | `AUDIT_COMPLETION` |
| **Name** | Statutory Audit |
| **Category** | AUDIT |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Is Tax Filing** | true |

**Calculation:**
```
// Audit must be completed before AR filing deadline
// Internal deadline: 30 days before AR deadline
anchorType: FYE
offsetMonths: 6   // AR is 7 months, so audit by 6 months
offsetDays: 0
frequency: ANNUALLY
```

**Period:**
```
periodLabel: "FY{FYE_YEAR}"
periodStart: financialYearStart
periodEnd: financialYearEnd
```

**Description:**
```
Statutory Audit for financial year ending {FYE_DATE}.

Internal deadline: {INTERNAL_DUE_DATE} (to allow time before AR filing)
AR filing deadline: {FYE_DATE + 7 months}

Deliverables:
• Audited financial statements
• Independent auditor's report
• Management letter (if audit findings)

Audit completion required before Annual Return can be filed.
```

---

## Service Template 7: CLG Corporate Secretarial

> For Company Limited by Guarantee (public company) - typically used by non-profits, charities, professional bodies

### Service Definition

| Field | Value |
|-------|-------|
| **Code** | `CLG_CORP_SEC` |
| **Name** | CLG Corporate Secretarial (Annual) |
| **Category** | CORPORATE_SECRETARY |
| **Jurisdiction** | SG |
| **Service Type** | RECURRING |
| **Frequency** | ANNUALLY |
| **Default Rate** | null |
| **Currency** | SGD |
| **Auto Renewal** | true |
| **Renewal Period** | 12 months |

### Applicability

```
entityTypes: [PUBLIC_COMPANY_LIMITED_BY_GUARANTEE]
excludeEntityTypes: null
requiresGstRegistered: null
// Note: CLGs are public companies - different AGM/AR timelines from private companies
```

### Required Fields When Adding Service

| Field | Type | Description |
|-------|------|-------------|
| `rate` | Decimal | Annual service fee |
| `startDate` | Date | Service start date |

### Default Scope

```
Annual corporate secretarial services for Company Limited by Guarantee including:
• Maintenance of statutory registers and records
• Annual Return filing with ACRA
• Financial statements preparation (XBRL key data + PDF)
• AGM coordination and documentation
• Minutes and resolutions preparation
• Registered office services
• Member register maintenance
```

### Generated Deadlines

#### 7.1 CLG Service Renewal

| Field | Value |
|-------|-------|
| **Code** | `CLG_SEC_RENEWAL` |
| **Name** | CLG Corporate Secretarial Service Renewal |
| **Category** | CORPORATE_SECRETARY |
| **Jurisdiction** | SG |
| **Billable** | Yes |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: SERVICE_START
offsetMonths: 0
offsetDays: -30
frequency: ANNUALLY
```

---

#### 7.2 CLG Annual Return

| Field | Value |
|-------|-------|
| **Code** | `CLG_ANNUAL_RETURN` |
| **Name** | CLG Annual Return Filing |
| **Category** | CORPORATE_SECRETARY |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: FYE
offsetMonths: 7   // Public companies: 7 months from FYE (same as private)
offsetDays: 0
frequency: ANNUALLY

// Note: CLGs file key financial data in XBRL + PDF of full financial statements
```

**Period:**
```
periodLabel: "FY{FYE_YEAR}"
periodStart: financialYearStart
periodEnd: financialYearEnd
```

**Description:**
```
Annual Return filing with ACRA for financial year ending {FYE_DATE}.

CLGs file:
• Key financial data in XBRL format
• Full signed PDF copy of financial statements

Filing via BizFile+:
• Update registered office address (if changed)
• Update company officers (if changed)
• Update member information

Statutory Due Date: {STATUTORY_DUE_DATE} (7 months from FYE)
Late filing penalty: $300 + $50 per month thereafter
```

---

#### 7.3 CLG Annual General Meeting

| Field | Value |
|-------|-------|
| **Code** | `CLG_AGM` |
| **Name** | CLG Annual General Meeting |
| **Category** | CORPORATE_SECRETARY |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: FYE
offsetMonths: 6   // Public companies: Within 6 months from FYE
offsetDays: 0
frequency: ANNUALLY

// Note: CLGs are public companies - AGM exemption does NOT apply
// AGM must be held every year (no waiver option like private companies)
```

**Period:**
```
periodLabel: "FY{FYE_YEAR}"
```

**Description:**
```
Annual General Meeting for CLG for FY ending {FYE_DATE}.

Statutory Due Date: Within 6 months from FYE ({STATUTORY_DUE_DATE})

IMPORTANT: Unlike private companies, CLGs (as public companies) cannot
dispense with AGMs. AGM must be held every year.

AGM Requirements:
• Send notice to members (21 days for public company)
• Prepare directors' statement and financial statements
• Table financial statements for adoption
• Appoint/re-appoint auditors
• Elect/re-elect governing board members
• Any other business

Reference: Companies Act Section 175
```

---

## Service Template 8: Charity Compliance (COC)

> For registered charities - annual submission to Commissioner of Charities

### Service Definition

| Field | Value |
|-------|-------|
| **Code** | `CHARITY_COMPLIANCE` |
| **Name** | Charity Compliance (Annual) |
| **Category** | COMPLIANCE |
| **Jurisdiction** | SG |
| **Service Type** | RECURRING |
| **Frequency** | ANNUALLY |
| **Default Rate** | null |
| **Currency** | SGD |
| **Auto Renewal** | true |
| **Renewal Period** | 12 months |

### Applicability

```
// Only for entities registered as charities with Commissioner of Charities
requiresCharityStatus: true
requiresGstRegistered: null
// Note: This is in ADDITION to ACRA filings for CLGs
// CLGs that are charities need BOTH CLG_CORP_SEC and CHARITY_COMPLIANCE
```

### Required Fields When Adding Service

| Field | Type | Description |
|-------|------|-------------|
| `rate` | Decimal | Annual service fee |
| `startDate` | Date | Service start date |
| `charityRegistrationDate` | Date | Date charity status was granted |

### Default Scope

```
Annual charity compliance services including:
• Annual Report preparation (per Charities Regulations)
• Financial statements preparation (Charities Accounting Standard)
• Governance Evaluation Checklist completion
• Charity Portal submissions
• Liaison with Commissioner of Charities
```

### Generated Deadlines

#### 8.1 Charity Compliance Service Renewal

| Field | Value |
|-------|-------|
| **Code** | `CHARITY_RENEWAL` |
| **Name** | Charity Compliance Service Renewal |
| **Category** | COMPLIANCE |
| **Jurisdiction** | SG |
| **Billable** | Yes |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: SERVICE_START
offsetMonths: 0
offsetDays: -30
frequency: ANNUALLY
```

---

#### 8.2 Charity Annual Report (COC)

| Field | Value |
|-------|-------|
| **Code** | `CHARITY_ANNUAL_REPORT` |
| **Name** | Charity Annual Report to COC |
| **Category** | COMPLIANCE |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: FYE
offsetMonths: 6   // Within 6 months from FYE
offsetDays: 0
frequency: ANNUALLY
```

**Period:**
```
periodLabel: "FY{FYE_YEAR}"
periodStart: financialYearStart
periodEnd: financialYearEnd
```

**Description:**
```
Annual Report submission to Commissioner of Charities for FY ending {FYE_DATE}.

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

Statutory Due Date: {STATUTORY_DUE_DATE}
Reference: Charities (Accounts and Annual Report) Regulations 2011
```

---

#### 8.3 Governance Evaluation Checklist

| Field | Value |
|-------|-------|
| **Code** | `CHARITY_GEC` |
| **Name** | Governance Evaluation Checklist |
| **Category** | COMPLIANCE |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: FYE
offsetMonths: 6   // Submitted together with Annual Report
offsetDays: 0
frequency: ANNUALLY
```

**Period:**
```
periodLabel: "FY{FYE_YEAR}"
```

**Description:**
```
Governance Evaluation Checklist submission for FY ending {FYE_DATE}.

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
• Published results contribute to charity's transparency score

Statutory Due Date: {STATUTORY_DUE_DATE}
```

---

## Service Template 9: IPC Compliance

> For Institutions of Public Character - additional requirements beyond charity compliance

### Service Definition

| Field | Value |
|-------|-------|
| **Code** | `IPC_COMPLIANCE` |
| **Name** | IPC Compliance (Annual) |
| **Category** | COMPLIANCE |
| **Jurisdiction** | SG |
| **Service Type** | RECURRING |
| **Frequency** | ANNUALLY |
| **Default Rate** | null |
| **Currency** | SGD |
| **Auto Renewal** | true |
| **Renewal Period** | 12 months |

### Applicability

```
// Only for charities with IPC status
requiresIPCStatus: true
requiresCharityStatus: true  // IPC must be charity first
// Note: IPC compliance is IN ADDITION to Charity Compliance
// IPCs need: CLG_CORP_SEC (if CLG) + CHARITY_COMPLIANCE + IPC_COMPLIANCE
```

### Required Fields When Adding Service

| Field | Type | Description |
|-------|------|-------------|
| `rate` | Decimal | Annual service fee |
| `startDate` | Date | Service start date |
| `ipcEffectiveDate` | Date | Date IPC status was granted |
| `ipcExpiryDate` | Date | IPC status expiry date |

### Default Scope

```
Annual IPC compliance services including:
• Tax-deductible donation record management
• Annual TDD return submission to IRAS
• Donation receipt issuance and tracking
• IPC renewal preparation (if applicable)
• Compliance with Sector Administrator requirements
```

### Generated Deadlines

#### 9.1 IPC Compliance Service Renewal

| Field | Value |
|-------|-------|
| **Code** | `IPC_RENEWAL` |
| **Name** | IPC Compliance Service Renewal |
| **Category** | COMPLIANCE |
| **Jurisdiction** | SG |
| **Billable** | Yes |
| **Is Optional** | No |
| **Is Tax Filing** | false |

**Calculation:**
```
anchorType: SERVICE_START
offsetMonths: 0
offsetDays: -30
frequency: ANNUALLY
```

---

#### 9.2 Annual TDD Return to IRAS

| Field | Value |
|-------|-------|
| **Code** | `IPC_TDD_RETURN` |
| **Name** | Annual Tax-Deductible Donation Return |
| **Category** | COMPLIANCE |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | No |
| **Is Tax Filing** | true |

**Calculation:**
```
anchorType: FIXED_CALENDAR
fixedMonth: 1    // January
fixedDay: 31     // 31 January
// Reports donations for PREVIOUS calendar year
frequency: ANNUALLY
```

**Period:**
```
// Calendar year basis (not FYE)
periodLabel: "CY{PREVIOUS_YEAR}"  // e.g., "CY2024" for return due 31 Jan 2025
periodStart: {PREVIOUS_YEAR}-01-01
periodEnd: {PREVIOUS_YEAR}-12-31
```

**Description:**
```
Annual Return for Tax-Deductible Donations to IRAS.

Report all tax-deductible donations received in calendar year {PREVIOUS_YEAR}.

Submission deadline: 31 January {CURRENT_YEAR}

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

Reference: IRAS Tax-Deductible Donations guidelines
```

---

#### 9.3 IPC Status Renewal

| Field | Value |
|-------|-------|
| **Code** | `IPC_STATUS_RENEWAL` |
| **Name** | IPC Status Renewal Application |
| **Category** | COMPLIANCE |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | Yes |
| **Optional Note** | "Only if IPC status is expiring. Check ipcExpiryDate." |
| **Is Tax Filing** | false |

**Calculation:**
```
// IPC status validity varies - calculate from expiry date
anchorType: IPC_EXPIRY  // Special anchor: uses ipcExpiryDate
offsetMonths: -3        // 3 months before expiry
offsetDays: 0
frequency: ONE_TIME     // Regenerates based on new expiry date if renewed
```

**Description:**
```
IPC Status Renewal Application.

IPC status expiry date: {IPC_EXPIRY_DATE}
Recommended submission: At least 3 months before expiry

Renewal requirements:
• Continue to meet IPC criteria
• Good compliance track record
• No adverse findings from COC
• Sector Administrator approval

Application via Charity Portal.
Processing time: Approximately 2 months.

Note: If IPC status lapses, donors will no longer receive tax deductions
for donations made after expiry date.
```

---

## Charity Status Transition Compliance

> Special deadlines when a CLG first obtains charity status

### Charity Registration Deadline

| Field | Value |
|-------|-------|
| **Code** | `CHARITY_REGISTRATION` |
| **Name** | Charity Status Application |
| **Category** | COMPLIANCE |
| **Jurisdiction** | SG |
| **Billable** | No |
| **Is Optional** | Yes |
| **Optional Note** | "Required if CLG is established for exclusively charitable purposes" |
| **Is Tax Filing** | false |

**Calculation:**
```
// For new CLGs with charitable purposes
anchorType: INCORPORATION
offsetMonths: 3   // Must apply within 3 months of incorporation
offsetDays: 0
frequency: ONE_TIME
```

**Description:**
```
Charity Status Application to Commissioner of Charities.

Deadline: Within 3 months of CLG incorporation ({INCORPORATION_DATE})

A CLG established for exclusively charitable purposes in Singapore MUST
apply to register as a charity within 3 months of incorporation.

Application requirements:
• Signed governing instrument (Memorandum & Articles of Association)
• At least 3 governing board members
• At least 2 must be Singapore Citizens or Permanent Residents
• Objects must be exclusively charitable
• Objects must benefit Singapore community

Submit via Charity Portal.
Processing time: 3-6 months.

Note: Tax exemption only applies from date of charity registration.
```

---

## Summary: Service Templates

| Code | Service Name | Type | Frequency | Entity Types | Deadlines Generated |
|------|--------------|------|-----------|--------------|---------------------|
| `CORP_SEC_ANNUAL` | Corporate Secretarial (Annual) | RECURRING | ANNUALLY | Pte Ltd, Exempt Pte, Public | Renewal, AR, XBRL*, FS to Members*, AGM† |
| `TAX_ANNUAL` | Tax Compliance (Annual) | RECURRING | ANNUALLY | Companies, LLP, Foreign | Renewal, ECI, Corp Tax Return |
| `GST_FILING` | GST Filing | RECURRING | QUARTERLY/MONTHLY | All (GST registered) | Renewal, GST Returns |
| `PERSONAL_TAX_SP` | Personal Tax (Sole Prop) | RECURRING | ANNUALLY | Sole Prop, Partnership | Renewal, Personal Tax (Form B/B1) |
| `ACCOUNTING_MONTHLY` | Accounting (Monthly) | RECURRING | MONTHLY | All | Renewal, Monthly Bookkeeping |
| `AUDIT_ANNUAL` | Statutory Audit | RECURRING | ANNUALLY | Pte Ltd, Public (if required) | Renewal, Audit Completion |
| `CLG_CORP_SEC` | CLG Corporate Secretarial | RECURRING | ANNUALLY | CLG | Renewal, AR, AGM |
| `CHARITY_COMPLIANCE` | Charity Compliance | RECURRING | ANNUALLY | Registered Charities | Renewal, Annual Report, GEC |
| `IPC_COMPLIANCE` | IPC Compliance | RECURRING | ANNUALLY | IPCs | Renewal, TDD Return, Status Renewal* |

*Optional deadlines
†Skipped if company.agmDispensed = true

---

## Entity Type Applicability Matrix

| Service Template | Private Ltd | Exempt Private | Public Ltd | CLG | Sole Prop | Partnership | LLP | Foreign Co |
|-----------------|-------------|----------------|------------|-----|-----------|-------------|-----|------------|
| Corp Sec Annual | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| CLG Corp Sec | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Tax Annual | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| GST Filing | If GST reg | If GST reg | If GST reg | If GST reg | If GST reg | If GST reg | If GST reg | If GST reg |
| Personal Tax SP | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Accounting Monthly | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Audit Annual | If required | If required | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Charity Compliance | If charity | If charity | If charity | If charity | ✗ | ✗ | ✗ | ✗ |
| IPC Compliance | If IPC | If IPC | If IPC | If IPC | ✗ | ✗ | ✗ | ✗ |

**Notes:**
- CLGs always require audit (public company requirement)
- Charity Compliance applies to any entity type registered with Commissioner of Charities
- IPC Compliance applies to charities granted IPC status

---

## Deadline Summary by Template

### Corporate Secretarial (Annual)

| Code | Deadline Name | Anchor | Offset | Billable |
|------|---------------|--------|--------|----------|
| `CORP_SEC_RENEWAL` | Service Renewal | Service Start | -30 days | Yes |
| `ANNUAL_RETURN` | Annual Return | FYE | +7 months | No |
| `XBRL` | XBRL Filing | FYE | +7 months | No |
| `FS_TO_MEMBERS` | Send FS to Members | FYE | +5 months | No |
| `AGM` | Annual General Meeting | FYE | +6 months | No |

### CLG Corporate Secretarial

| Code | Deadline Name | Anchor | Offset | Billable |
|------|---------------|--------|--------|----------|
| `CLG_SEC_RENEWAL` | Service Renewal | Service Start | -30 days | Yes |
| `CLG_ANNUAL_RETURN` | Annual Return | FYE | +7 months | No |
| `CLG_AGM` | Annual General Meeting | FYE | +6 months | No |

### Tax Compliance (Annual)

| Code | Deadline Name | Anchor | Offset | Billable |
|------|---------------|--------|--------|----------|
| `TAX_RENEWAL` | Service Renewal | Service Start | -30 days | Yes |
| `ECI` | Estimated Chargeable Income | FYE | +3 months | No |
| `CORP_TAX` | Corporate Tax Return | Fixed 30 Nov | YA | No |

### GST Filing

| Code | Deadline Name | Anchor | Offset | Billable |
|------|---------------|--------|--------|----------|
| `GST_RENEWAL` | Service Renewal | Service Start | -30 days | Yes |
| `GST_RETURN_Q` | GST Return (Quarterly) | Quarter End | +1 month | No |
| `GST_RETURN_M` | GST Return (Monthly) | Month End | +1 month | No |

### Personal Tax (Sole Proprietor)

| Code | Deadline Name | Anchor | Offset | Billable |
|------|---------------|--------|--------|----------|
| `PERSONAL_TAX_RENEWAL` | Service Renewal | Service Start | -30 days | Yes |
| `PERSONAL_TAX` | Personal Tax (Form B/B1) | Fixed 18 Apr | YA | No |

### Accounting (Monthly)

| Code | Deadline Name | Anchor | Offset | Billable |
|------|---------------|--------|--------|----------|
| `ACCOUNTING_RENEWAL` | Service Renewal | Service Start | -30 days | Yes |
| `BOOKKEEPING_MONTHLY` | Monthly Bookkeeping | Month End | +15 days | No |

### Statutory Audit

| Code | Deadline Name | Anchor | Offset | Billable |
|------|---------------|--------|--------|----------|
| `AUDIT_RENEWAL` | Service Renewal | Service Start | -30 days | Yes |
| `AUDIT_COMPLETION` | Statutory Audit | FYE | +6 months | No |

### Charity Compliance (COC)

| Code | Deadline Name | Anchor | Offset | Billable |
|------|---------------|--------|--------|----------|
| `CHARITY_RENEWAL` | Service Renewal | Service Start | -30 days | Yes |
| `CHARITY_ANNUAL_REPORT` | Annual Report to COC | FYE | +6 months | No |
| `CHARITY_GEC` | Governance Evaluation Checklist | FYE | +6 months | No |

### IPC Compliance

| Code | Deadline Name | Anchor | Offset | Billable |
|------|---------------|--------|--------|----------|
| `IPC_RENEWAL` | Service Renewal | Service Start | -30 days | Yes |
| `IPC_TDD_RETURN` | TDD Return to IRAS | Fixed 31 Jan | CY | No |
| `IPC_STATUS_RENEWAL` | IPC Status Renewal | IPC Expiry | -3 months | No |

### Charity Transition

| Code | Deadline Name | Anchor | Offset | Billable |
|------|---------------|--------|--------|----------|
| `CHARITY_REGISTRATION` | Charity Status Application | Incorporation | +3 months | No |

---

## New Fields Required

### Company Model

| Field | Type | Description |
|-------|------|-------------|
| `gstFilingFrequency` | Enum | QUARTERLY \| MONTHLY (if GST registered) |
| `agmDispensed` | Boolean | Company has dispensed with AGMs (resolution passed) |
| `isDormant` | Boolean | Company is dormant (informational flag only) |
| `dormantTaxExemptionApproved` | Boolean | IRAS approved exemption from tax filing |
| `isRegisteredCharity` | Boolean | Registered with Commissioner of Charities |
| `charityRegistrationDate` | Date | Date charity status was granted |
| `isIPC` | Boolean | Has Institution of Public Character status |
| `ipcEffectiveDate` | Date | Date IPC status was granted |
| `ipcExpiryDate` | Date | IPC status expiry date |

**Note on Dormant Companies:**
- `isDormant` is informational only - does NOT automatically skip any deadlines
- For AGM exemption: Use standard waiver process (send FS to members within 5 months)
- For tax filing exemption: Apply to IRAS, then set `dormantTaxExemptionApproved = true`

**Note on Charities and IPCs:**
- `isRegisteredCharity` enables CHARITY_COMPLIANCE service
- `isIPC` enables IPC_COMPLIANCE service (requires `isRegisteredCharity = true`)
- CLGs that are charities need BOTH CLG_CORP_SEC and CHARITY_COMPLIANCE services
- IPCs need all three: CLG_CORP_SEC (if CLG) + CHARITY_COMPLIANCE + IPC_COMPLIANCE

### ContractService Model

| Field | Type | Description |
|-------|------|-------------|
| `serviceTemplateCode` | String | Reference to which template was used (optional) |
| `gstFilingFrequency` | Enum | For GST services: QUARTERLY \| MONTHLY |
| `overrideBillable` | Boolean | Override template billable setting for this client |
| `customRate` | Decimal | Custom rate for this client (overrides template default) |

### TenantSettings Model

| Field | Type | Description |
|-------|------|-------------|
| `defaultInternalBufferDays` | Int | Default: Internal Deadline = Statutory Date - N Days |

---

## Extension of Time (EOT) Notes

EOT can be granted by ACRA/IRAS for various deadlines. When EOT is granted:

1. **Preserve statutory due date** - The original calculated deadline remains unchanged
2. **Record extended due date** - The new deadline granted by the authority
3. **Update overdue logic** - Use extended due date for determining if deadline is overdue
4. **Display both dates** - Show statutory date for reference, extended date as current deadline

Common EOT scenarios:
- **Annual Return**: ACRA may grant 30-60 day extension
- **Corporate Tax**: IRAS may grant extension beyond 15 Dec
- **AGM**: Court may grant extension in exceptional circumstances

---

## References

- [ACRA - AGM Exemptions](https://www.acra.gov.sg/how-to-guides/annual-general-meetings/exemptions-from-holding-an-agm)
- [ACRA - Companies Amendment Act 2017](https://www.acra.gov.sg/legislation/legislative-reform/companies-act-reform/companies-amendment-act-2017)
- [IRAS - Corporate Tax](https://www.iras.gov.sg/taxes/corporate-income-tax)
- [IRAS - GST](https://www.iras.gov.sg/taxes/goods-services-tax-(gst))
- [IRAS - Self-Employed Tax](https://www.iras.gov.sg/taxes/individual-income-tax/self-employed-and-partnerships)
