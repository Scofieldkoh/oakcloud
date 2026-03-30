# TODO / Roadmap

> **Last Updated**: 2026-03-11

This document tracks known issues, planned features, and completed work for Oakcloud.

## Development Guidelines

This web app is still under active development, all datas are dummy. Backward compatibility are not required.

Key principles:

- Keep code modular, reusable, and consistent
- Update documentation under `docs/` whenever feature behavior changes
- Follow [Design Guidelines](./guides/DESIGN_GUIDELINE.md) for UI work
- Record unrelated issues or follow-up work here

## Priority Legend

| Priority | Description |
|----------|-------------|
| **P0** | Critical / blocking |
| **P1** | High priority |
| **P2** | Standard backlog |
| **P3** | Nice to have |

## Status Legend

| Status | Description |
|--------|-------------|
| Open | Not started |
| In Progress | Currently being worked on |
| Blocked | Waiting on dependency |
| Done | Completed |

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

## Planned Features

### Phase 1 - Near Term

| Feature | Priority | Status | Description |
|---------|----------|--------|-------------|
| Deadline Management | P1 | Planned | Company deadline tracking and alerts |
| KYC/CDD Module | P1 | Planned | Know Your Customer / Customer Due Diligence compliance |
| Workflow Module | P1 | In Progress | Navigation scaffold plus live project and task workspace |

### Phase 2 - Medium Term

| Feature | Priority | Status | Description |
|---------|----------|--------|-------------|
| E-Signature | P1 | Planned | Digital signature integration for documents |
| URL Shortener | P2 | Planned | Short URLs for shared documents |
| Salesrooms | P2 | Planned | Client proposal and presentation rooms |

### Phase 3 - Long Term

| Feature | Priority | Status | Description |
|---------|----------|--------|-------------|
| Bank Reconciliation | P1 | Planned | Bank transaction matching and multi-currency support |
| Client Portal | P1 | Planned | Client access, document requests, communications |
| Accounting Integration | P2 | Planned | Xero, QuickBooks, MYOB connectors |

## Completed

| ID | Completed | Description |
|----|-----------|-------------|
| FORMS-001 | 2026-03-10 | Implemented the Forms module with builder, public links, draft save/resume/email, uploads, response review, response PDF export, and queued AI review |
| WF-001 | 2026-02-21 | Added Workflow navigation group (`Projects`, `Tasks`, `Templates`) and implemented the first iteration of `/workflow/projects` with inline filters and table patterns |
| WF-002 | 2026-02-21 | Implemented `/workflow/projects/[id]` detail workspace with grouped team/client tasks, right-click task actions, inline rename, and task detail side panel |
| WF-003 | 2026-02-21 | Enhanced workflow project detail with editable task groupings, quick-add rows, automation rules, rich-text task descriptions, task document attachments, and company contact panel |
| WF-004 | 2026-02-21 | Refined workflow project detail header and task actions, added `+ tags`, and replaced cycle-based action icons with explicit dropdown actions |
| WF-005 | 2026-02-24 | Wired `/workflow/projects` and `/workflow/projects/[id]` to live API endpoints backed by persisted company, processing document, client request, and assignment data |
| WF-006 | 2026-02-25 | Implemented Workflow Project Billing tab with persisted fixed and tiered pricing plus live document billing data |
| WF-007 | 2026-02-25 | Implemented Workflow Project Files tab with document-processing linking modal, upload shortcut, and linked-documents table |
| WF-008 | 2026-02-25 | Updated workflow project list billing cards and added project-level Save for task workspace, linked files, and billing quantity |
| WF-009 | 2026-02-25 | Added billing status rules and persistence across billing and project list views |
| WF-010 | 2026-02-25 | Updated workflow status behavior to auto-track outstanding task counts while preserving manual override states |
| WF-011 | 2026-02-25 | Improved workflow list ergonomics with bottom-placed `Add grouping` and drag-and-drop reordering |
| WF-012 | 2026-02-25 | Aligned Workflow Project Files filters and columns with Document Processing patterns |
| WF-013 | 2026-02-25 | Implemented Workflow Project Notes tab with persisted rich-text notes |
| WF-014 | 2026-02-25 | Extended Notes tab with collapsed per-task note panels and reset behavior |
| WF-015 | 2026-02-26 | Removed remaining workflow placeholder fallback content so project pages use only live implemented flows |

## Notes

- Add new items with the next available ID in their category.
- Move finished work to the Completed section.
- Keep this file aligned with shipped module status.
