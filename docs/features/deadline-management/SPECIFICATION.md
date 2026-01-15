# Deadline Management - Feature Specification

> **Status**: Draft
> **Version**: 2.0
> **Last Updated**: 2026-01-15

## Overview

Deadline Management is a compliance task engine that auto-generates recurring deadlines based on services and company attributes, tracks completion status, and monitors billing/invoicing status for revenue recognition.

### Core Concept

```
Service Template (e.g., "Corporate Secretarial Annual")
    └── When added to contract, generates:
        ├── Service Renewal Reminder (billable - next year's fee)
        ├── Annual Return (not billable - covered by annual fee)
        ├── XBRL Filing (not billable - covered by annual fee)
        ├── Send FS to Members (optional - waives AGM if completed)
        └── AGM (not billable - covered by annual fee, can be waived/dispensed)
```

**Key Principle**: Service templates define both the **contract service parameters** AND the **deadlines** that are auto-generated. Compliance deadlines (AR, AGM, Tax filings) are NOT separately billable - they are covered by the annual service fee. Only the **Service Renewal** deadline is billable (for the next period's fee).

### Key Distinctions

- **Compliance deadlines** (AGM, AR, Tax) → auto-generated, statutory dates, NOT billable (covered by service fee)
- **Service renewals** → annual reminder to renew service, BILLABLE (next year's fee)
- **Operational tasks** (Onboarding, KYC/CDD, RORC, ROND) → out of scope for MVP (future workflow/checklist feature)

---

## Critical Design Principles

### 1. No Daisy-Chaining for Statutory Deadlines

**Problem**: Using `anchorType: PREVIOUS_TASK` (e.g., AR depends on AGM completion) creates fragile dependencies. If the AGM task is delayed, deleted, or not marked complete, the AR task may never generate or calculate an invalid date.

**Solution**: All statutory deadlines MUST anchor to stable reference points:
- **FYE (Financial Year End)** - For AGM, AR, XBRL, ECI, Audit
- **INCORPORATION** - For first-year special rules
- **FIXED_CALENDAR** - For tax returns (Form C by 30 Nov)
- **SERVICE_START** - For renewals

**Example (Singapore Private Company)**:
```
AGM Due:  FYE + 6 Months    (anchored to FYE)
AR Due:   FYE + 7 Months    (anchored to FYE, NOT to AGM)
```

Both tasks appear on the calendar independently. If the AGM is late, the AR remains visible as a hard deadline.

### 2. Statutory vs. Extended Due Dates

Companies often apply for Extension of Time (EOT) from ACRA/IRAS. The system must track both dates:

```
┌─────────────────────────────────────────────────────┐
│ Annual Return - FY2024                              │
│ Statutory Due: 30 Jun 2025                          │
│ Extended Due:  30 Aug 2025 (EOT Granted)            │
│ Status: In Progress                                 │
└─────────────────────────────────────────────────────┘
```

- **statutoryDueDate**: The original calculated deadline (immutable reference)
- **extendedDueDate**: If populated, overrides visual "Due Date" and overdue logic
- **Display**: "Due: 30 Aug (EOT Granted)" or "Due: 30 Jun (Statutory)"

### 3. Billing Override Layer

The `isBillable` and `amount` on deadlines can be overridden at multiple levels:

```
DeadlineTemplate (Default)
    └── ServiceTemplate (Bundle Override)
        └── ContractService (Client-Specific Override)
            └── Deadline Instance (One-Time Override)
```

**Resolution Order** (highest priority first):
1. `Deadline.overrideAmount` / `Deadline.overrideBillable` - One-off adjustments
2. `ContractService.overrideBillable` / `ContractService.customRate` - Client-level defaults
3. `DeadlineTemplate.isBillable` / `DeadlineTemplate.defaultAmount` - System defaults

---

## User Personas

| Persona | Role | Primary Goals |
|---------|------|---------------|
| **Admin (Tenant Admin)** | Firm owner/manager | Overview of all deadlines, identify bottlenecks, ensure nothing falls through |
| **Staff (Company User)** | Accountant/Secretary | See assigned work, complete tasks, track personal workload |
| **Manager (Company Admin)** | Team lead | Monitor team workload, reassign work, handle escalations |

---

## User Stories

### Epic 1: Viewing Deadlines

#### US-1.1: View company deadlines
> As a **Staff**, I want to see all deadlines for a specific company so that I can understand the compliance obligations for that client.

**Acceptance Criteria:**
- Navigate to Company → Deadlines tab
- See deadlines grouped by time period (Overdue, This Month, Next 3 Months, Later)
- Filter by: Status, Category, Scope (In-Scope / All)
- Sort by: Due Date (default), Category, Status
- Clearly distinguish backlog items with visual indicator
- Show "Not in Scope" items separately (greyed out)
- Display period label clearly (e.g., "AGM (FY2023)" not just "AGM")

---

#### US-1.2: View all deadlines across companies
> As a **Staff**, I want to see all my assigned deadlines across all companies so that I can prioritize my work.

**Acceptance Criteria:**
- Sidebar navigation → "Deadlines" page
- Default filter: "Assigned to me" + "In-Scope only"
- View toggle: List view (default), Calendar view
- Filter by: Assignee, Company, Category, Status, Billing Status, Date Range
- Quick filters: "Overdue", "Due This Week", "Due This Month"
- Show company name on each deadline card

---

#### US-1.3: Calendar view of deadlines
> As a **Manager**, I want to see deadlines on a calendar so that I can visualize the workload distribution across the month.

**Acceptance Criteria:**
- Monthly calendar grid view
- Show deadline count badges on each day
- Click day → show list of deadlines for that day
- Click deadline → open detail modal
- Color coding by status (red=overdue, yellow=due soon, green=upcoming)
- Navigate between months

---

#### US-1.4: Dashboard overview
> As an **Admin**, I want a dashboard showing deadline metrics so that I can monitor firm-wide compliance health.

**Acceptance Criteria:**
- Summary cards: Overdue count, Due This Week, Due This Month, Pending Invoice
- Overdue breakdown by company (with backlog indicator)
- Workload by assignee (bar chart)
- Distribution by category (pie/bar chart)
- Click any metric → navigate to filtered list

---

### Epic 2: Managing Deadlines

#### US-2.1: Complete a deadline
> As a **Staff**, I want to mark a deadline as completed so that it's recorded and the next occurrence can be generated.

**Acceptance Criteria:**
- Click "Complete" button on deadline
- Modal prompts for:
  - Completion date (default: today)
  - Completion note (optional, e.g., "Filed via BizFile+")
  - Filing date (optional, distinct from completion date - when it was actually filed)
  - Filing reference (optional, e.g., Transaction No "T241234567")
- If billable + not yet invoiced → prompt "Mark as invoiced?" with optional invoice reference
- System auto-generates next occurrence for recurring deadlines
- Audit log entry created

---

#### US-2.2: Update deadline status
> As a **Staff**, I want to change a deadline's status to "In Progress" so that my team knows I'm working on it.

**Acceptance Criteria:**
- Status dropdown or quick action button
- Available transitions: Upcoming → In Progress, In Progress → Completed/Cancelled
- Status change updates `updatedAt` timestamp
- Audit log entry created

---

#### US-2.3: Assign deadline to staff
> As a **Manager**, I want to assign a deadline to a team member so that there's clear ownership.

**Acceptance Criteria:**
- Assignee dropdown showing all active users in tenant
- Can assign from: deadline detail modal, inline on list view
- Bulk assign: select multiple → assign to user
- Notification sent to assignee (in-app)
- Unassigned deadlines highlighted in views

---

#### US-2.4: Add manual deadline
> As a **Staff**, I want to add a deadline manually so that I can track ad-hoc compliance tasks not covered by templates.

**Acceptance Criteria:**
- "Add Deadline" button on company page and all-deadlines page
- Form fields:
  - Company (required, dropdown)
  - Template (optional, dropdown - if selected, prefills fields)
  - Title (required)
  - Category (required, dropdown)
  - Statutory Due Date (required)
  - Extended Due Date (optional, for EOT)
  - Period Label (required, e.g., "FY2024", "YA2025", "Q1 2025")
  - Description (optional, rich text)
  - Is Billable (checkbox)
  - Amount (if billable)
  - Is In Scope (checkbox, default: true)
  - Is Backlog (checkbox, default: false)
  - Backlog Note (if backlog)
  - Assignee (optional)
- Validation: Due date can be in the past (for backlog)

---

#### US-2.5: Add backlog deadline
> As a **Staff**, I want to add a past-due deadline marked as backlog so that we can track inherited overdue items without affecting our metrics unfairly.

**Acceptance Criteria:**
- When adding deadline with past due date, prompt: "This deadline is already overdue. Mark as backlog?"
- If marked as backlog:
  - `isBacklog` = true
  - Backlog note field becomes required
  - Visual indicator shows "Backlog" badge
- Backlog deadlines:
  - Still show as overdue (for tracking)
  - Excluded from "our fault" overdue metrics
  - Separate section in reports

---

#### US-2.6: Edit deadline details
> As a **Staff**, I want to edit a deadline so that I can correct errors or update information.

**Acceptance Criteria:**
- Edit button on deadline detail modal
- Editable fields: Title, Description, Extended Due Date, Internal Due Date, Category, Assignee, Is Billable, Override Amount, Is In Scope, Scope Note
- Non-editable: Company, Template (if generated from template), Statutory Due Date (immutable)
- Changing extended due date logs audit entry
- Cannot edit completed/cancelled deadlines (must reopen first)

---

#### US-2.7: Grant Extension of Time (EOT)
> As a **Staff**, I want to record an extension of time for a deadline so that the system reflects the approved extended deadline.

**Acceptance Criteria:**
- "Grant EOT" action on deadline
- Modal prompts for:
  - Extended Due Date (required)
  - EOT Reference (optional, e.g., ACRA approval ref)
  - EOT Note (optional)
- Original statutory due date preserved
- Display changes to show "(EOT Granted)"
- Overdue logic now uses extended due date
- Audit log entry created

---

#### US-2.8: Cancel a deadline
> As a **Manager**, I want to cancel a deadline so that it no longer appears in active lists when it's no longer applicable.

**Acceptance Criteria:**
- Cancel action requires confirmation
- Prompt for cancellation reason (required)
- Cancelled deadlines:
  - Hidden from default views
  - Visible with "Show cancelled" filter
  - Cannot be edited
  - Can be "reopened" by manager

---

#### US-2.9: Mark deadline as not in scope
> As a **Staff**, I want to mark a deadline as "not in scope" so that we track it for client visibility but it doesn't count as our responsibility.

**Acceptance Criteria:**
- Toggle "In Scope" on deadline
- If turning off, prompt for scope note (e.g., "Client handles internally")
- Not-in-scope deadlines:
  - Greyed out in list views
  - Separate section in company deadlines tab
  - Excluded from overdue counts
  - Still visible on calendar (different color/style)

---

#### US-2.10: Update billing status
> As a **Staff**, I want to update the billing status of a completed deadline so that we can track revenue.

**Acceptance Criteria:**
- Billing status field on billable deadlines
- Statuses: Not Applicable, Pending, Invoiced, Paid
- When marking as Invoiced:
  - Invoice reference field (optional but recommended)
  - Invoiced date (default: today)
- Bulk action: Select completed unbilled → "Mark as Invoiced"

---

### Epic 3: Auto-Generation

#### US-3.1: Generate deadlines when service is added
> As a **Staff**, when I add a service to a contract, I want deadlines to be auto-generated so that I don't have to create them manually.

**Acceptance Criteria:**
- After adding service (e.g., "Corporate Secretarial"):
  - System identifies linked template bundle
  - Modal: "Generate compliance deadlines for this service?"
    - Shows list of applicable templates based on company attributes
    - Checkboxes to include/exclude each template
    - Date range: "Generate from" (default: current FYE) "to" (default: +18 months)
    - Option: "Include backlog periods" with backlog note field
  - On confirm: Create deadline instances
- Skip if user declines (can generate later manually)

---

#### US-3.2: Manually trigger deadline generation
> As a **Staff**, I want to manually regenerate or extend deadlines for a company so that I can ensure future deadlines exist.

**Acceptance Criteria:**
- "Regenerate Deadlines" button on company deadlines tab
- Modal shows:
  - Active services with linked templates
  - Current deadline horizon (last generated date)
  - Option to extend by X months
  - Preview of deadlines to be created
- Does not duplicate existing deadlines (checks by template + period)

---

#### US-3.3: Auto-generate next occurrence on completion
> As a **system**, when a recurring deadline is completed, I want to auto-generate the next occurrence so that continuity is maintained.

**Acceptance Criteria:**
- On completing a recurring deadline:
  - Check if next occurrence already exists
  - If not, create next occurrence based on template rules
  - New deadline linked to same service
  - Notification: "Next [Deadline Type] for [Period] has been created"

---

#### US-3.4: Scheduled rolling generation
> As a **system**, I want to run periodic checks to ensure deadlines are generated for the next 18 months so that nothing is missed.

**Acceptance Criteria:**
- Background job runs daily/weekly
- For each active company with services:
  - Check deadline horizon
  - Generate missing deadlines up to 18-month horizon
  - Log generation activity
- Admin can view generation log

---

### Epic 4: Notifications

#### US-4.1: Receive reminder before deadline
> As a **Staff**, I want to receive reminders before a deadline is due so that I can take action in time.

**Acceptance Criteria:**
- In-app notification at configured intervals (60, 30, 14, 7 days before)
- Notification shows: Deadline title, Company name, Due date, Days remaining
- Click notification → opens deadline detail
- Bell icon shows unread count
- Notification center lists all notifications

---

#### US-4.2: Receive alert for overdue deadline
> As a **Staff**, I want to be alerted when a deadline becomes overdue so that I can prioritize it immediately.

**Acceptance Criteria:**
- In-app notification when deadline passes due date
- Notification marked as high priority (different styling)
- Daily digest of overdue items (if multiple)

---

#### US-4.3: Receive notification when assigned
> As a **Staff**, I want to be notified when a deadline is assigned to me so that I'm aware of new responsibilities.

**Acceptance Criteria:**
- In-app notification on assignment
- Shows: Deadline title, Company, Due date, Assigned by
- Click → opens deadline detail

---

### Epic 5: Bulk Operations

#### US-5.1: Bulk assign deadlines
> As a **Manager**, I want to assign multiple deadlines to a staff member at once so that I can efficiently distribute work.

**Acceptance Criteria:**
- Checkbox selection on list view
- "Bulk Actions" dropdown appears when items selected
- "Assign to..." → user dropdown
- Confirmation: "Assign X deadlines to [User]?"
- All selected deadlines updated
- Single notification to assignee summarizing assignment

---

#### US-5.2: Bulk update billing status
> As a **Staff**, I want to mark multiple completed deadlines as invoiced at once so that I can efficiently update billing records.

**Acceptance Criteria:**
- Select multiple completed, unbilled deadlines
- "Mark as Invoiced" bulk action
- Prompt for invoice reference (applied to all)
- Validation: Only completed + billable + pending status allowed

---

#### US-5.3: Bulk change status
> As a **Manager**, I want to update status for multiple deadlines so that I can efficiently manage workflow.

**Acceptance Criteria:**
- Select multiple deadlines
- "Change Status" → status dropdown
- Validation: Status transitions must be valid for all selected items
- If invalid for some, show warning with option to proceed with valid ones

---

## Data Model

### Deadline Entity

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | Auto | Primary key |
| `tenantId` | UUID | Yes | From session | Multi-tenant scope |
| `companyId` | UUID | Yes | - | Related company |
| `contractServiceId` | UUID | No | null | Service that generated this |
| `deadlineTemplateId` | UUID | No | null | Template used (null if manual) |
| `title` | String | Yes | - | Display title, max 200 chars |
| `description` | Text | No | null | Rich text instructions |
| `category` | Enum | Yes | - | CORPORATE_SECRETARY, TAX, ACCOUNTING, AUDIT, OTHER |
| `referenceCode` | String | No | null | For grouping (e.g., "AGM-2024") |
| `periodLabel` | String | Yes | - | Human-readable period (e.g., "FY2024", "YA2025", "Q1 2025") |
| `periodStart` | Date | No | null | Period start date |
| `periodEnd` | Date | No | null | Period end date |
| **Deadline Dates** |
| `statutoryDueDate` | Date | Yes | - | Original calculated deadline (immutable) |
| `extendedDueDate` | Date | No | null | EOT date (if granted, overrides due logic) |
| `internalDueDate` | Date | No | null | Internal buffer date (firm's internal deadline) |
| **EOT Tracking** |
| `eotReference` | String | No | null | EOT approval reference |
| `eotNote` | String | No | null | EOT notes |
| `eotGrantedAt` | DateTime | No | null | When EOT was granted |
| **Scope & Status** |
| `isInScope` | Boolean | Yes | true | Are we responsible? |
| `scopeNote` | String | No | null | Reason if not in scope |
| `isBacklog` | Boolean | Yes | false | Inherited overdue? |
| `backlogNote` | String | No | null | Required if isBacklog=true |
| `status` | Enum | Yes | UPCOMING | UPCOMING, DUE_SOON, IN_PROGRESS, COMPLETED, CANCELLED, WAIVED |
| **Completion** |
| `completedAt` | DateTime | No | null | When marked complete internally |
| `completedBy` | UUID | No | null | Who marked complete |
| `completionNote` | Text | No | null | Completion details |
| `filingDate` | Date | No | null | Actual filing date with authority (distinct from completedAt) |
| `filingReference` | String | No | null | Filing reference (e.g., BizFile Transaction No "T241234567") |
| **Billing** |
| `isBillable` | Boolean | Yes | false | Is this chargeable? |
| `overrideBillable` | Boolean | No | null | Override template billable setting |
| `billingStatus` | Enum | No | null | NOT_APPLICABLE, PENDING, INVOICED, PAID |
| `amount` | Decimal | No | null | Default billing amount (from template) |
| `overrideAmount` | Decimal | No | null | Override amount for this specific deadline |
| `currency` | String | No | SGD | Currency code |
| `invoiceReference` | String | No | null | Invoice number |
| `invoicedAt` | DateTime | No | null | When invoiced |
| **Assignment** |
| `assigneeId` | UUID | No | null | Assigned staff |
| `assignedAt` | DateTime | No | null | When assigned |
| **Meta** |
| `generationType` | Enum | Yes | MANUAL | AUTO, MANUAL |
| `remindersSent` | JSON | No | [] | Array of reminder dates sent |
| `createdAt` | DateTime | Yes | Now | Created timestamp |
| `updatedAt` | DateTime | Yes | Now | Updated timestamp |
| `deletedAt` | DateTime | No | null | Soft delete |

**Computed Properties:**
- `effectiveDueDate`: Returns `extendedDueDate ?? statutoryDueDate` (used for display and overdue logic)
- `effectiveAmount`: Returns `overrideAmount ?? amount` (used for billing)
- `effectiveBillable`: Returns `overrideBillable ?? isBillable`
- `isOverdue`: `status not in [COMPLETED, CANCELLED, WAIVED] && effectiveDueDate < today && isInScope`

### DeadlineTemplate Entity

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | Auto | Primary key |
| `code` | String | Yes | - | Unique code (e.g., "AGM", "ECI") |
| `name` | String | Yes | - | Display name |
| `category` | Enum | Yes | - | Category enum |
| `description` | Text | No | null | Default description |
| `jurisdiction` | String | Yes | "SG" | Jurisdiction code (SG, HK, MY, etc.) |
| **Applicability** |
| `entityTypes` | JSON | No | null | Applicable entity types (null = all) |
| `excludeEntityTypes` | JSON | No | null | Excluded entity types |
| `requiresGstRegistered` | Boolean | No | null | GST requirement |
| `requiresAudit` | Boolean | No | null | Audit requirement |
| `requiresActiveStatus` | Boolean | No | true | Skipped if company is dormant |
| **Deadline Calculation** |
| `anchorType` | Enum | Yes | - | FYE, INCORPORATION, FIXED_CALENDAR, QUARTER_END, MONTH_END, SERVICE_START |
| `offsetMonths` | Int | No | 0 | Months from anchor |
| `offsetDays` | Int | No | 0 | Days from anchor |
| `offsetBusinessDays` | Boolean | No | false | Skip weekends/holidays when calculating |
| `fixedMonth` | Int | No | null | For FIXED_CALENDAR |
| `fixedDay` | Int | No | null | For FIXED_CALENDAR |
| **First Year Special Rules** |
| `isFirstYearSpecialRule` | Boolean | No | false | Different calculation for first year |
| `firstYearAnchorType` | Enum | No | null | Anchor for first year (e.g., INCORPORATION) |
| `firstYearOffsetMonths` | Int | No | null | Months from anchor for first year |
| `firstYearOffsetDays` | Int | No | null | Days from anchor for first year |
| **Recurrence** |
| `frequency` | Enum | Yes | - | ANNUALLY, QUARTERLY, MONTHLY, ONE_TIME |
| `generateMonthsAhead` | Int | Yes | 18 | Generation horizon |
| **Billing** |
| `isBillable` | Boolean | Yes | false | Default billable status |
| `defaultAmount` | Decimal | No | null | Default amount |
| `reminderDaysBefore` | JSON | Yes | [60,30,14,7] | Reminder intervals |
| `isActive` | Boolean | Yes | true | Is template active |

### ServiceTemplateBundle Entity

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | Auto | Primary key |
| `name` | String | Yes | - | Bundle name (e.g., "Corporate Secretarial") |
| `description` | Text | No | null | Description |
| `templateIds` | JSON | Yes | [] | Array of template IDs |
| `isActive` | Boolean | Yes | true | Is bundle active |

### Company Entity (New Fields)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `agmDispensed` | Boolean | No | false | Company has dispensed with AGMs |
| `isDormant` | Boolean | No | false | Company is dormant |
| `gstFilingFrequency` | Enum | No | null | QUARTERLY or MONTHLY (if GST registered) |

### TenantSettings Entity (New Fields)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `defaultInternalBufferDays` | Int | No | 14 | Default: Internal Deadline = Statutory Date - N Days |

---

## Deadline Generation State Machine

When `triggerDeadlineGeneration(companyId)` is called:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEADLINE GENERATION FLOW                      │
└─────────────────────────────────────────────────────────────────┘

1. FETCH CONTEXT
   ├── Company: FYE, Incorp Date, Entity Type, GST Status
   ├── Company Flags: isDormant, agmDispensed
   └── Active ContractServices with linked ServiceTemplates

2. FETCH TEMPLATES
   └── Get all DeadlineTemplates linked to Active ContractServices

3. FILTER APPLICABILITY (for each template)
   ├── Entity Type Check
   │   └── Is company.entityType in template.entityTypes?
   │   └── Is company.entityType NOT in template.excludeEntityTypes?
   │
   ├── GST Registration Check
   │   └── If template.requiresGstRegistered = true
   │       └── Is company.gstRegistered = true?
   │
   ├── Dormant Check
   │   └── If template.requiresActiveStatus = true
   │       └── Is company.isDormant = false?
   │
   ├── AGM Dispensed Check
   │   └── If template.code = 'AGM'
   │       └── Is company.agmDispensed = false?
   │
   └── Audit Check
       └── If template.requiresAudit = true
           └── Does company require audit?

4. CALCULATE HORIZON
   └── Today to (Today + generateMonthsAhead) typically 18 months

5. FOR EACH APPLICABLE TEMPLATE
   │
   ├── Calculate Target Date
   │   ├── First Year Check
   │   │   └── If template.isFirstYearSpecialRule = true
   │   │       AND (Today - Company.incorporationDate) < firstYearThreshold
   │   │       └── Use firstYearAnchorType + firstYearOffsetMonths
   │   │
   │   └── Standard Calculation
   │       └── Use anchorType + offsetMonths + offsetDays
   │       └── If offsetBusinessDays = true, skip weekends/holidays
   │
   ├── Check Existence
   │   └── Does deadline already exist for this:
   │       - templateId + companyId + periodLabel?
   │       └── If YES: Skip (don't create duplicate)
   │       └── If NO: Proceed to create
   │
   └── Create Deadline Instance
       ├── Set periodLabel (e.g., "FY2024", "YA2025")
       ├── Set statutoryDueDate (calculated date)
       ├── Set internalDueDate (statutoryDueDate - buffer)
       └── Resolve billing (template → service → instance)

6. LOG GENERATION
   └── Record what was created, skipped, and why
```

### First Year vs. Subsequent Years Example (AGM)

```typescript
// First AGM: 18 months from Incorporation
// Subsequent AGMs: 6 months from FYE

const agmTemplate = {
  code: 'AGM',
  anchorType: 'FYE',
  offsetMonths: 6,
  isFirstYearSpecialRule: true,
  firstYearAnchorType: 'INCORPORATION',
  firstYearOffsetMonths: 18,
};

function calculateDueDate(company, template) {
  const monthsSinceIncorp = monthsBetween(company.incorporationDate, today);

  if (template.isFirstYearSpecialRule && monthsSinceIncorp < 18) {
    // First year: 18 months from incorporation
    return addMonths(company.incorporationDate, template.firstYearOffsetMonths);
  } else {
    // Subsequent years: 6 months from FYE
    return addMonths(company.financialYearEnd, template.offsetMonths);
  }
}
```

---

## Edge Cases & Handling

### Company Data Changes

| Scenario | Handling |
|----------|----------|
| **Company FYE changes** | 1. Detect change in Company.financialYearEnd<br>2. Find all UPCOMING deadlines anchored to FYE<br>3. Prompt: "FYE changed. Recalculate upcoming deadlines?"<br>4. **Delete** future UPCOMING/DUE_SOON tasks<br>5. **Regenerate** based on new FYE<br>6. **Preserve** OVERDUE, IN_PROGRESS, COMPLETED tasks |
| **Company becomes GST registered** | Prompt: "Company is now GST registered. Add GST return deadlines?" |
| **Company entity type changes** | Prompt: "Entity type changed. Some deadlines may no longer apply. Review?" |
| **Company becomes inactive** | Prompt: "Company status changed. Cancel all pending deadlines?" |
| **Company deleted** | Soft delete all related deadlines (cascade) |
| **Company marked dormant** | 1. Set company.isDormant = true<br>2. Prompt: "Company is dormant. Cancel pending tax filings?"<br>3. Skip future generation of templates requiring active status<br>4. Generate dormant-specific templates if applicable |
| **Company AGM dispensed** | 1. Set company.agmDispensed = true<br>2. Cancel pending AGM deadlines<br>3. Skip future AGM generation<br>4. AR deadlines continue unchanged |

### Service Changes

| Scenario | Handling |
|----------|----------|
| **Service cancelled** | Prompt: "Cancel related pending deadlines?" |
| **Service end date set** | Stop generating deadlines beyond end date |
| **Service reactivated** | Prompt: "Regenerate deadlines from reactivation date?" |
| **Contract deleted** | Cascade to services → cascade to deadlines (soft delete) |

### Deadline Conflicts

| Scenario | Handling |
|----------|----------|
| **Duplicate deadline exists** | Skip if same template + periodLabel + company exists |
| **Manual deadline overlaps** | Allow both, flag with warning |
| **Multiple services generate same type** | Generate only once, link to first service |

### Status Transitions

| Scenario | Handling |
|----------|----------|
| **Complete overdue deadline** | Allow, status goes to COMPLETED |
| **Reopen completed deadline** | Manager only, reverts to IN_PROGRESS |
| **Cancel then reopen** | Manager only, reverts to previous status |
| **Complete with past date** | Allow backdating |
| **Waive AGM (FS sent to members)** | If FS_TO_MEMBERS completed for same period → can mark AGM as WAIVED |

### Billing Edge Cases

| Scenario | Handling |
|----------|----------|
| **Non-billable marked as invoiced** | Prevent with validation error |
| **Billable → non-billable after invoiced** | Prevent, must clear billing status first |
| **Cancelled after invoiced** | Allow, preserve billing status |
| **Override amount for difficult year** | Use `overrideAmount` field |

### Backlog Scenarios

| Scenario | Handling |
|----------|----------|
| **Multiple years backlog** | Bulk mark as backlog with single note |
| **Backlog completed** | Normal flow, badge preserved in history |
| **Backlog flag removed** | Manager permission required |

### Scope Scenarios

| Scenario | Handling |
|----------|----------|
| **Out of scope mid-progress** | Allow, status preserved |
| **Out-of-scope becomes overdue** | No alert, excluded from metrics |

### Extension of Time (EOT)

| Scenario | Handling |
|----------|----------|
| **EOT granted** | Set `extendedDueDate`, preserve `statutoryDueDate` |
| **EOT expired still not done** | Show as overdue based on `extendedDueDate` |
| **EOT revoked** | Clear `extendedDueDate`, revert to statutory |
| **Multiple EOT requests** | Update `extendedDueDate` to latest, log history |

---

## UI Specifications

### Status Color Coding

| Status | Color | Condition |
|--------|-------|-----------|
| Overdue | Red | Past effective due date |
| Due Soon | Yellow | Within 14 days |
| Upcoming | Green | 15-60 days |
| Later | Grey | 60+ days |
| In Progress | Blue | Actively working |
| Completed | Green ✓ | Done |
| Cancelled | Grey ⊘ | Cancelled |
| Waived | Purple | Waived (e.g., AGM waived) |

### Deadline Card (List View)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [●] AGM - FY2024                                    🔴 OVERDUE  [Backlog]   │
│     ABC Pte Ltd • Corporate Secretary                                       │
│     Due: 30 Jun 2025 (15 days overdue)              @Alice Chen    [$500]   │
│     Statutory: 30 Jun 2025                                                  │
│     ─────────────────────────────────────────────────────────────────────── │
│     [Mark Complete]  [Grant EOT]  [Assign]  [•••]         Pending Invoice   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ [●] Annual Return - FY2024                          🟡 DUE SOON [EOT]       │
│     XYZ Pte Ltd • Corporate Secretary                                       │
│     Due: 30 Aug 2025 (EOT Granted)                  @Bob Tan                │
│     Statutory: 31 Jul 2025                                                  │
│     ─────────────────────────────────────────────────────────────────────── │
│     [Mark Complete]  [Assign]  [•••]                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Period Labels Best Practice

Always display period labels prominently to avoid confusion:

| Deadline | Good Label | Bad Label |
|----------|------------|-----------|
| AGM | AGM (FY2024) | AGM |
| Annual Return | AR - FY2024 | Annual Return |
| ECI | ECI - YA2025 | ECI |
| Corp Tax | Form C - YA2025 | Tax Return |
| GST | GST - Q1 2025 | GST Return |

### Internal vs. Statutory Dates

- **Staff Dashboard**: Show `internalDueDate` (e.g., "Due: 15 Jun" when statutory is 30 Jun)
- **Client Portal** (future): Show `statutoryDueDate`
- **Tooltip/Detail**: Show both dates clearly

### Company Deadlines Tab

- Grouped by: Overdue, This Month, Next 3 Months, Later, Not in Scope
- Summary bar showing counts
- Filters: Status, Category, Assignee, Billing
- Checkboxes for bulk actions
- Actions: Add Deadline, Regenerate

### All Deadlines Page (Sidebar)

- View toggle: List, Calendar
- Quick filters: Overdue, Due This Week, Due This Month, Pending Invoice, Unassigned
- Full filter panel: Assignee, Company, Category, Status, Billing, Date Range
- Bulk action bar when items selected

### Dashboard

- Summary cards: Overdue, Due This Week, Due This Month, Pending Invoice
- Overdue by Company table
- Workload by Assignee chart
- Distribution by Category chart
- Upcoming This Week mini-calendar

---

## Validation Rules

| Rule | Condition | Error Message |
|------|-----------|---------------|
| Title required | `title.length === 0` | "Title is required" |
| Title max length | `title.length > 200` | "Title must be 200 characters or less" |
| Company required | `!companyId` | "Company is required" |
| Statutory due date required | `!statutoryDueDate` | "Statutory due date is required" |
| Period label required | `!periodLabel` | "Period label is required (e.g., FY2024, YA2025)" |
| Category required | `!category` | "Category is required" |
| Backlog note required | `isBacklog && !backlogNote` | "Please provide a reason for marking as backlog" |
| Amount required if billable | `isBillable && !amount && !overrideAmount` | "Amount is required for billable deadlines" |
| Period end after start | `periodEnd < periodStart` | "Period end must be after period start" |
| Internal due before statutory | `internalDueDate > statutoryDueDate` | "Internal due date should be before the statutory deadline" |
| Extended due after statutory | `extendedDueDate && extendedDueDate < statutoryDueDate` | "Extended due date must be after statutory due date" |
| Filing date in past | `filingDate > today` | "Filing date cannot be in the future" |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/deadlines` | List all deadlines (tenant-scoped) |
| `POST` | `/api/deadlines` | Create manual deadline |
| `GET` | `/api/deadlines/:id` | Get deadline detail |
| `PATCH` | `/api/deadlines/:id` | Update deadline |
| `DELETE` | `/api/deadlines/:id` | Soft delete deadline |
| `POST` | `/api/deadlines/:id/complete` | Mark as complete |
| `POST` | `/api/deadlines/:id/cancel` | Cancel deadline |
| `POST` | `/api/deadlines/:id/reopen` | Reopen completed/cancelled |
| `POST` | `/api/deadlines/:id/waive` | Waive deadline (e.g., AGM) |
| `POST` | `/api/deadlines/:id/eot` | Grant extension of time |
| `PATCH` | `/api/deadlines/:id/assign` | Assign to user |
| `PATCH` | `/api/deadlines/:id/billing` | Update billing status |
| `POST` | `/api/deadlines/bulk/assign` | Bulk assign |
| `POST` | `/api/deadlines/bulk/status` | Bulk status change |
| `POST` | `/api/deadlines/bulk/invoice` | Bulk mark invoiced |
| `GET` | `/api/companies/:id/deadlines` | Company deadlines |
| `POST` | `/api/companies/:id/deadlines/generate` | Generate deadlines |
| `GET` | `/api/deadline-templates` | List templates |
| `GET` | `/api/dashboard/deadlines` | Dashboard metrics |

---

## MVP Scope

| Feature | MVP | Phase 2 |
|---------|-----|---------|
| Deadline model (with EOT support) | ✓ | |
| Template bundles (SG) | ✓ | |
| Auto-generation on service add | ✓ | |
| Manual trigger | ✓ | |
| Backlog support | ✓ | |
| Scope indicator | ✓ | |
| EOT (Extension of Time) | ✓ | |
| Company deadlines tab | ✓ | |
| All-deadlines page (List + Calendar) | ✓ | |
| Assignee | ✓ | |
| Simple billing status | ✓ | |
| In-app alerts | ✓ | |
| Dashboard | ✓ | |
| Bulk operations | ✓ | |
| First-year special rules | ✓ | |
| Dormant company handling | ✓ | |
| AGM dispensed flag | ✓ | |
| Business days calculation | | ✓ |
| Kanban board | | ✓ |
| Email reminders | | ✓ |
| Configurable rule editor | | ✓ |
| Multi-jurisdiction (HK, MY) | | ✓ |
| Client portal (external view) | | ✓ |

---

## Related Documents

- [Hard-coded Rules](./RULES.md) - Singapore compliance deadline rules
- [Implementation Plan](./IMPLEMENTATION.md) - Development phases (TBD)
