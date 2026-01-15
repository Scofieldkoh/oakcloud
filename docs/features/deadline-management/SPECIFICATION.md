# Deadline Management - Feature Specification

> **Status**: Draft
> **Version**: 1.0
> **Last Updated**: 2025-01-15

## Overview

Deadline Management is a compliance task engine that auto-generates recurring deadlines based on services and company attributes, tracks completion status, and monitors billing/invoicing status for revenue recognition.

### Core Concept

```
Service (e.g., "Corporate Secretarial")
    └── triggers → Deadline Template Bundle
                      ├── AGM (billable)
                      ├── Annual Return (billable)
                      ├── XBRL (billable)
                      └── Business Profile Renewal (not billable, just a reminder)
```

### Key Distinctions

- **Compliance deadlines** (AGM, AR, Tax) → auto-generated, statutory dates
- **Operational tasks** (Onboarding, KYC/CDD, RORC, ROND) → out of scope for MVP (future workflow/checklist feature)

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
  - Filing reference (optional)
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
  - Due Date (required)
  - Period Label (optional, e.g., "FY2024")
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
- Editable fields: Title, Description, Due Date, Internal Due Date, Category, Assignee, Is Billable, Amount, Is In Scope, Scope Note
- Non-editable: Company, Template (if generated from template)
- Changing due date logs audit entry
- Cannot edit completed/cancelled deadlines (must reopen first)

---

#### US-2.7: Cancel a deadline
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

#### US-2.8: Mark deadline as not in scope
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

#### US-2.9: Update billing status
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
| `periodLabel` | String | No | null | Human-readable period (e.g., "FY2024") |
| `periodStart` | Date | No | null | Period start date |
| `periodEnd` | Date | No | null | Period end date |
| `dueDate` | Date | Yes | - | Statutory/target deadline |
| `internalDueDate` | Date | No | null | Internal buffer date |
| `isInScope` | Boolean | Yes | true | Are we responsible? |
| `scopeNote` | String | No | null | Reason if not in scope |
| `isBacklog` | Boolean | Yes | false | Inherited overdue? |
| `backlogNote` | String | No | null | Required if isBacklog=true |
| `status` | Enum | Yes | UPCOMING | UPCOMING, DUE_SOON, IN_PROGRESS, COMPLETED, CANCELLED, WAIVED |
| `completedAt` | DateTime | No | null | When completed |
| `completedBy` | UUID | No | null | Who completed |
| `completionNote` | Text | No | null | Completion details |
| `filingReference` | String | No | null | External reference (e.g., BizFile) |
| `isBillable` | Boolean | Yes | false | Is this chargeable? |
| `billingStatus` | Enum | No | null | NOT_APPLICABLE, PENDING, INVOICED, PAID |
| `amount` | Decimal | No | null | Billing amount |
| `currency` | String | No | SGD | Currency code |
| `invoiceReference` | String | No | null | Invoice number |
| `invoicedAt` | DateTime | No | null | When invoiced |
| `assigneeId` | UUID | No | null | Assigned staff |
| `assignedAt` | DateTime | No | null | When assigned |
| `generationType` | Enum | Yes | MANUAL | AUTO, MANUAL |
| `remindersSent` | JSON | No | [] | Array of reminder dates sent |
| `createdAt` | DateTime | Yes | Now | Created timestamp |
| `updatedAt` | DateTime | Yes | Now | Updated timestamp |
| `deletedAt` | DateTime | No | null | Soft delete |

### DeadlineTemplate Entity

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | UUID | Yes | Auto | Primary key |
| `code` | String | Yes | - | Unique code (e.g., "AGM", "ECI") |
| `name` | String | Yes | - | Display name |
| `category` | Enum | Yes | - | Category enum |
| `description` | Text | No | null | Default description |
| `entityTypes` | JSON | No | null | Applicable entity types (null = all) |
| `excludeEntityTypes` | JSON | No | null | Excluded entity types |
| `requiresGstRegistered` | Boolean | No | null | GST requirement |
| `requiresAudit` | Boolean | No | null | Audit requirement |
| `anchorType` | Enum | Yes | - | FYE, INCORPORATION, PREVIOUS_TASK, FIXED_CALENDAR |
| `anchorTaskCode` | String | No | null | If anchor is PREVIOUS_TASK |
| `offsetMonths` | Int | No | 0 | Months from anchor |
| `offsetDays` | Int | No | 0 | Days from anchor |
| `fixedMonth` | Int | No | null | For FIXED_CALENDAR |
| `fixedDay` | Int | No | null | For FIXED_CALENDAR |
| `frequency` | Enum | Yes | - | ANNUALLY, QUARTERLY, MONTHLY, ONE_TIME |
| `generateMonthsAhead` | Int | Yes | 18 | Generation horizon |
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

---

## Edge Cases & Handling

### Company Data Changes

| Scenario | Handling |
|----------|----------|
| **Company FYE changes** | Prompt: "FYE changed. Recalculate upcoming deadlines?" Options: Recalculate all / Keep existing / Choose which |
| **Company becomes GST registered** | Prompt: "Company is now GST registered. Add GST return deadlines?" |
| **Company entity type changes** | Prompt: "Entity type changed. Some deadlines may no longer apply. Review?" |
| **Company becomes inactive** | Prompt: "Company status changed. Cancel all pending deadlines?" |
| **Company deleted** | Soft delete all related deadlines (cascade) |

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
| **Duplicate deadline exists** | Skip if same template + period + company exists |
| **Manual deadline overlaps** | Allow both, flag with warning |
| **Multiple services generate same type** | Generate only once, link to first service |

### Status Transitions

| Scenario | Handling |
|----------|----------|
| **Complete overdue deadline** | Allow, status goes to COMPLETED |
| **Reopen completed deadline** | Manager only, reverts to IN_PROGRESS |
| **Cancel then reopen** | Manager only, reverts to previous status |
| **Complete with past date** | Allow backdating |

### Billing Edge Cases

| Scenario | Handling |
|----------|----------|
| **Non-billable marked as invoiced** | Prevent with validation error |
| **Billable → non-billable after invoiced** | Prevent, must clear billing status first |
| **Cancelled after invoiced** | Allow, preserve billing status |

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

---

## UI Specifications

### Status Color Coding

| Status | Color | Condition |
|--------|-------|-----------|
| Overdue | Red 🔴 | Past due date |
| Due Soon | Yellow 🟡 | Within 14 days |
| Upcoming | Green 🟢 | 15-60 days |
| Later | Grey ⚪ | 60+ days |
| In Progress | Blue 🔵 | Actively working |
| Completed | Green ✓ | Done |
| Cancelled | Grey ⊘ | Cancelled |

### Deadline Card (List View)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [●] AGM - FY2024                                    🔴 OVERDUE  [Backlog]   │
│     ABC Pte Ltd • Corporate Secretary                                       │
│     Due: 30 Jun 2025 (15 days overdue)              @Alice Chen    [$500]   │
│     ─────────────────────────────────────────────────────────────────────── │
│     [Mark Complete]  [Assign]  [•••]                        Pending Invoice │
└─────────────────────────────────────────────────────────────────────────────┘
```

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
| Due date required | `!dueDate` | "Due date is required" |
| Category required | `!category` | "Category is required" |
| Backlog note required | `isBacklog && !backlogNote` | "Please provide a reason for marking as backlog" |
| Amount required if billable | `isBillable && !amount` | "Amount is required for billable deadlines" |
| Period end after start | `periodEnd < periodStart` | "Period end must be after period start" |
| Internal due before due | `internalDueDate > dueDate` | "Internal due date should be before the deadline" |

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
| Deadline model | ✓ | |
| Template bundles (SG) | ✓ | |
| Auto-generation on service add | ✓ | |
| Manual trigger | ✓ | |
| Backlog support | ✓ | |
| Scope indicator | ✓ | |
| Company deadlines tab | ✓ | |
| All-deadlines page (List + Calendar) | ✓ | |
| Assignee | ✓ | |
| Simple billing status | ✓ | |
| In-app alerts | ✓ | |
| Dashboard | ✓ | |
| Bulk operations | ✓ | |
| Kanban board | | ✓ |
| Email reminders | | ✓ |
| Configurable rule editor | | ✓ |

---

## Related Documents

- [Hard-coded Rules](./RULES.md) - Singapore compliance deadline rules
- [Implementation Plan](./IMPLEMENTATION.md) - Development phases (TBD)
