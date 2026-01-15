# Deadline Management - Hard-coded Rules (Singapore)

> **Status**: Draft
> **Version**: 1.0
> **Last Updated**: 2025-01-15
> **Jurisdiction**: Singapore

This document defines the hard-coded service templates and deadline rules for Singapore compliance.

---

## Overview

Service Templates serve as pre-configured templates when adding services to contracts. Each template defines:
1. **Service parameters** - Name, type, frequency, rate, scope, renewal settings
2. **Generated deadlines** - Compliance deadlines auto-created when service is added

---

## Service Template Structure

```typescript
interface ServiceTemplate {
  // Identity
  code: string;                    // Unique code (e.g., "CORP_SEC_ANNUAL")
  name: string;                    // Display name
  category: DeadlineCategory;      // CORPORATE_SECRETARY | TAX | ACCOUNTING | AUDIT

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
  isBillable: boolean;
  isOptional: boolean;             // If true, shown as optional checkbox when generating
  optionalNote: string | null;     // Explanation if optional

  // Deadline calculation
  anchorType: 'FYE' | 'SERVICE_START' | 'FIXED_CALENDAR' | 'QUARTER_END' | 'MONTH_END';
  offsetMonths: number;
  offsetDays: number;
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
• AGM coordination (if required)
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
| **Billable** | Yes |
| **Is Optional** | No |

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
| **Billable** | No |
| **Is Optional** | No |

**Calculation:**
```
anchorType: FYE
offsetMonths: 7   // Private companies: 7 months from FYE
offsetDays: 0
frequency: ANNUALLY

// Note: Public companies have 5 months, but most clients are private
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

Deadline: {DUE_DATE} (7 months from FYE)
Late filing penalty: $300 + $50 per month thereafter
```

---

#### 1.3 XBRL Financial Statements

| Field | Value |
|-------|-------|
| **Code** | `XBRL` |
| **Name** | XBRL Financial Statements |
| **Category** | CORPORATE_SECRETARY |
| **Billable** | No |
| **Is Optional** | Yes |
| **Optional Note** | "XBRL exempt if: revenue ≤ $500K, assets ≤ $500K, employees ≤ 5, or dormant company" |

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
| **Billable** | No |
| **Is Optional** | Yes |
| **Optional Note** | "Enable to waive AGM requirement. FS must be sent within 5 months of FYE." |

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

If completed before {DUE_DATE} (5 months from FYE):
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
| **Billable** | No |
| **Is Optional** | No (default required) |
| **Optional Note** | "AGM can be waived if 'Send FS to Members' is completed and no member requests AGM" |

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

Due: Within 6 months from FYE ({DUE_DATE})

AGM can be waived if:
• Financial Statements sent to all members within 5 months of FYE, AND
• No member requests AGM (14 days before 6-month deadline)

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
| **Billable** | Yes |
| **Is Optional** | No |

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
| **Billable** | No |
| **Is Optional** | No |

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

Deadline: {DUE_DATE} (3 months from FYE)
```

---

#### 2.3 Corporate Income Tax Return

| Field | Value |
|-------|-------|
| **Code** | `CORP_TAX` |
| **Name** | Corporate Income Tax Return |
| **Category** | TAX |
| **Billable** | No |
| **Is Optional** | No |

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
```

---

## Service Template 3: GST Filing

### Service Definition

| Field | Value |
|-------|-------|
| **Code** | `GST_FILING` |
| **Name** | GST Filing |
| **Category** | TAX |
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
| **Billable** | Yes |
| **Is Optional** | No |

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
| **Billable** | No |
| **Is Optional** | No |
| **Condition** | Only generated if `gstFilingFrequency = QUARTERLY` |

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

Deadline: {DUE_DATE} (1 month after quarter end)
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
| **Billable** | No |
| **Is Optional** | No |
| **Condition** | Only generated if `gstFilingFrequency = MONTHLY` |

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

Deadline: {DUE_DATE} (1 month after month end)
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
| **Billable** | Yes |
| **Is Optional** | No |

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
| **Billable** | No |
| **Is Optional** | No |

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
| **Billable** | Yes |
| **Is Optional** | No |

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
| **Billable** | No |
| **Is Optional** | No |

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

Internal deadline: {DUE_DATE}
```

---

## Service Template 6: Statutory Audit (Annual)

### Service Definition

| Field | Value |
|-------|-------|
| **Code** | `AUDIT_ANNUAL` |
| **Name** | Statutory Audit |
| **Category** | AUDIT |
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
| **Billable** | Yes |
| **Is Optional** | No |

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
| **Billable** | No |
| **Is Optional** | No |

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

Internal deadline: {DUE_DATE} (to allow time before AR filing)
AR filing deadline: {FYE_DATE + 7 months}

Deliverables:
• Audited financial statements
• Independent auditor's report
• Management letter (if audit findings)

Audit completion required before Annual Return can be filed.
```

---

## Summary: Service Templates

| Code | Service Name | Type | Frequency | Entity Types | Deadlines Generated |
|------|--------------|------|-----------|--------------|---------------------|
| `CORP_SEC_ANNUAL` | Corporate Secretarial (Annual) | RECURRING | ANNUALLY | Pte Ltd, Exempt Pte, Public | Renewal, AR, XBRL*, FS to Members*, AGM |
| `TAX_ANNUAL` | Tax Compliance (Annual) | RECURRING | ANNUALLY | Companies, LLP, Foreign | Renewal, ECI, Corp Tax Return |
| `GST_FILING` | GST Filing | RECURRING | QUARTERLY/MONTHLY | All (GST registered) | Renewal, GST Returns |
| `PERSONAL_TAX_SP` | Personal Tax (Sole Prop) | RECURRING | ANNUALLY | Sole Prop, Partnership | Renewal, Personal Tax (Form B/B1) |
| `ACCOUNTING_MONTHLY` | Accounting (Monthly) | RECURRING | MONTHLY | All | Renewal, Monthly Bookkeeping |
| `AUDIT_ANNUAL` | Statutory Audit | RECURRING | ANNUALLY | Pte Ltd, Public (if required) | Renewal, Audit Completion |

*Optional deadlines

---

## Entity Type Applicability Matrix

| Service Template | Private Ltd | Exempt Private | Public Ltd | Sole Prop | Partnership | LLP | Foreign Co |
|-----------------|-------------|----------------|------------|-----------|-------------|-----|------------|
| Corp Sec Annual | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Tax Annual | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| GST Filing | If GST reg | If GST reg | If GST reg | If GST reg | If GST reg | If GST reg | If GST reg |
| Personal Tax SP | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Accounting Monthly | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Audit Annual | If required | If required | ✓ | ✗ | ✗ | ✗ | ✗ |

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

---

## New Fields Required

### Company Model

| Field | Type | Description |
|-------|------|-------------|
| `gstFilingFrequency` | Enum | QUARTERLY \| MONTHLY (if GST registered) |

### ContractService Model

| Field | Type | Description |
|-------|------|-------------|
| `serviceTemplateCode` | String | Reference to which template was used (optional) |
| `gstFilingFrequency` | Enum | For GST services: QUARTERLY \| MONTHLY |

---

## References

- [ACRA - AGM Exemptions](https://www.acra.gov.sg/how-to-guides/annual-general-meetings/exemptions-from-holding-an-agm)
- [ACRA - Companies Amendment Act 2017](https://www.acra.gov.sg/legislation/legislative-reform/companies-act-reform/companies-amendment-act-2017)
- [IRAS - Corporate Tax](https://www.iras.gov.sg/taxes/corporate-income-tax)
- [IRAS - GST](https://www.iras.gov.sg/taxes/goods-services-tax-(gst))
- [IRAS - Self-Employed Tax](https://www.iras.gov.sg/taxes/individual-income-tax/self-employed-and-partnerships)
