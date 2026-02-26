# TODO / Roadmap

> **Last Updated**: 2026-02-24

This document tracks known issues, planned features, and development roadmap for Oakcloud.

---

## Development Guidelines

This web app is in development and testing stage. All data are dummy, and it's acceptable to refactor and redesign without backward compatibility.

**Key Principles:**
- Keep code clean, efficient, modular, reusable, and consistent
- Update documentation under `docs/` instead of creating new files
- Follow [Design Guidelines](./guides/DESIGN_GUIDELINE.md) for UI work
- Log unrelated errors or improvements here

---

## Priority Legend

| Priority | Description |
|----------|-------------|
| **P0** | Critical / Blocking - Must fix immediately |
| **P1** | High priority - Should be addressed soon |
| **P2** | Medium priority - Standard backlog item |
| **P3** | Low priority / Nice to have |

## Status Legend

| Status | Description |
|--------|-------------|
| Open | Not started |
| In Progress | Currently being worked on |
| Blocked | Waiting on dependency |
| Done | Completed |

---

## Known Issues

### Document Processing

| ID | Priority | Status | Description | Notes |
|----|----------|--------|-------------|-------|
| DOC-001 | P2 | Open | Async auto-extraction error handling | Errors only logged to console, not stored in database |
| DOC-002 | P2 | Open | N+1 query in duplicate detection | Could load thousands of documents; add filters to reduce candidate set |
| DOC-003 | P1 | Open | Merge and split document not working | Core functionality incomplete |

### Document Generation

| ID | Priority | Status | Description | Notes |
|----|----------|--------|-------------|-------|
| GEN-001 | P2 | Open | Save draft to pause functionality | Document generation wizard interruption |
| GEN-002 | P2 | Open | Remove page number from templates/partials | User request |
| GEN-003 | P2 | Open | Letterhead rendering issues | Various formatting problems |
| GEN-004 | P2 | Open | Share button issues | Format, comment, and notification problems |
| GEN-005 | P3 | Open | Export details without line items | Option to exclude AI extraction data |

### UI/UX

| ID | Priority | Status | Description | Notes |
|----|----------|--------|-------------|-------|
| UI-001 | P2 | Open | Mobile responsiveness improvements | General responsive issues across modules |

---

## Planned Features

### Phase 1 - Near Term

| Feature | Priority | Status | Description |
|---------|----------|--------|-------------|
| Deadline Management | P1 | Planned | Company deadline tracking and alerts |
| KYC/CDD Module | P1 | Planned | Know Your Customer / Customer Due Diligence compliance |
| Workflow Module | P1 | In Progress | Navigation scaffold + Projects list + Project detail task workspace with API-backed live data |

### Phase 2 - Medium Term

| Feature | Priority | Status | Description |
|---------|----------|--------|-------------|
| E-Signature | P1 | Planned | Digital signature integration for documents |
| URL Shortener | P2 | Planned | Short URLs for shared documents |
| Salesrooms | P2 | Planned | Client proposal and presentation rooms |

### Phase 3 - Long Term

| Feature | Priority | Status | Description |
|---------|----------|--------|-------------|
| Bank Reconciliation | P1 | Planned | Bank transaction matching, multi-currency support |
| Client Portal | P1 | Planned | Client access, document requests, communications |
| Accounting Integration | P2 | Planned | Xero, QuickBooks, MYOB connectors |

---

## Completed

| ID | Completed | Description |
|----|-----------|-------------|
| WF-001 | 2026-02-21 | Added Workflow navigation group (`Projects`, `Tasks`, `Templates`) and implemented first iteration of `/workflow/projects` with inline filters and table patterns |
| WF-002 | 2026-02-21 | Implemented `/workflow/projects/[id]` detail workspace with grouped team/client tasks, right-click task actions, inline rename, and task detail side panel (time tracking/chat intentionally excluded) |
| WF-003 | 2026-02-21 | Enhanced workflow project detail with editable task groupings, quick-add row per grouping, automation rules for follow-up task creation, rich-text task descriptions, task-level document attachments, company contact panel, skip checkbox status, and icon-based quick task actions |
| WF-004 | 2026-02-21 | Refined workflow project detail header and task actions: removed top-right quick buttons and metadata row, moved tags beside project title with `+ tags`, added `+ Grouping` below tabs, aligned done/skip checkbox sizing, and replaced cycle-based action icons with explicit status/priority/assignee dropdown actions |
| WF-005 | 2026-02-24 | Wired `/workflow/projects` and `/workflow/projects/[id]` to live API endpoints (`/api/workflow/projects`, `/api/workflow/projects/[id]`) backed by persisted company, processing document, client request, and assignment data |
| WF-006 | 2026-02-25 | Implemented Workflow Project Billing tab with persisted fixed/tiered pricing configuration, automatic tiered calculation from entered quantity, and live document billing table sourced from processing API |
| WF-007 | 2026-02-25 | Implemented Workflow Project Files tab with document-processing linking modal, upload shortcut (`/processing/upload` in new tab), and linked-documents table with inline filters across project/task attachments |
| WF-008 | 2026-02-25 | Updated Workflow Project List billing card fields (removed budget/pricing-config, added tier rate), and added project-level Save action that persists task workspace, linked files, and billing quantity |
| WF-009 | 2026-02-25 | Added billing status (Pending / To be billed / Billed) with auto rules based on amount and project completion, exposed status controls in Billing tab, and displayed status in List-tab billing card with persistence |
| WF-010 | 2026-02-25 | Updated workflow status behavior: `In Progress`/`Completed` auto-track task outstanding counts (`Completed` when no outstanding tasks), while still supporting manual override to `At Risk`/`On Hold` |
| WF-011 | 2026-02-25 | Improved List workspace ergonomics: moved `Add grouping` to bottom after all groups and added drag-and-drop reordering for both group sequence and task sequence (including cross-group moves) |
| WF-012 | 2026-02-25 | Aligned Workflow Project Files table to Document Processing columns, switched inline filters to reusable controls (`SearchableSelect`, `DatePicker`, `AmountFilter`), and made first column `Linked at` filterable by `Project` plus all task names |
| WF-013 | 2026-02-25 | Implemented Workflow Project Notes tab with persisted rich-text project notes, reset/save controls, and workspace-state/API wiring (`projectNotes`) |
| WF-014 | 2026-02-25 | Extended Notes tab with collapsed per-task note panels (shown only for tasks with actual note content), inline rich-text editing, and note-reset behavior that treats fully deleted content as no task notes |

---

## Notes

- Add new issues with the next available ID in their category (DOC-XXX, GEN-XXX, UI-XXX)
- Move items to "Completed" section when finished
- Update status and notes as work progresses


many pages without tenant are still showing records, companies, contacts, document processing etc.
