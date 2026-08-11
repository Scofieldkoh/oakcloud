# TODO / Roadmap

> **Last Updated**: 2026-08-11

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

### Document Vault

| ID | Priority | Status | Description | Notes |
|----|----------|--------|-------------|-------|
| DOC-001 | P2 | Open | Async auto-extraction error handling | Errors only logged to console, not stored in database |
| DOC-002 | P2 | Open | N+1 query in duplicate detection | Could load thousands of documents; add filters to reduce candidate set |
| DOC-003 | P1 | Open | Merge and split document not working | Core functionality incomplete |

### Document Generation

| ID | Priority | Status | Description | Notes |
|----|----------|--------|-------------|-------|
| GEN-001 | P2 | Implemented | Save draft to pause functionality | Explicit Save Draft persists multiple server-backed generation sessions; users can resume or discard a selected draft, while Generate Document always starts clean |
| GEN-002 | P2 | Open | Remove page number from templates/partials | User request |
| GEN-003 | P2 | Open | Letterhead rendering issues | Various formatting problems |
| GEN-004 | P2 | Open | Share button issues | Format, comment, and notification problems |
| GEN-005 | P3 | Open | Export details without line items | Option to exclude AI extraction data |
| GEN-006 | P2 | Open | A4 editor blank-page browser test is flaky | `adds and removes a persistent blank page with one action` intermittently fails at the add or remove step under real Chromium layout; unrelated to list editing, likely tied to in-progress pagination reflow changes |

### UI/UX

| ID | Priority | Status | Description | Notes |
|----|----------|--------|-------------|-------|
| UI-001 | P2 | Open | Mobile responsiveness improvements | General responsive issues across modules |

### Developer Tooling

| ID | Priority | Status | Description | Notes |
|----|----------|--------|-------------|-------|
| DEV-001 | P2 | Open | Repository typecheck is blocked by stale renderer verification types | `npx.cmd tsc --noEmit --pretty false` reports pre-existing DTO and date/type mismatches in `tmp/verify-renderer.ts` |

### Forms

| ID | Priority | Status | Description | Notes |
|----|----------|--------|-------------|-------|
| FORMS-002 | P1 | Open | Published form render snapshot | Store optimized published schema separately from editable builder draft so live public forms only change on publish |
| FORMS-003 | P2 | Open | Async cached response PDFs | Generate response PDFs in a background job and reuse cached artifacts for repeated downloads |
| FORMS-004 | P2 | Open | Progressive rendering for long public forms | Reduce full-form recalculation/render work on every answer change, especially with conditions and repeat sections |

## Planned Features

### Phase 1 - Near Term

| Feature | Priority | Status | Description |
|---------|----------|--------|-------------|
| Deadline Management | P1 | Planned | Company deadline tracking and alerts |
| KYC/CDD Module | P1 | Planned | Know Your Customer / Customer Due Diligence compliance |
| Tasks And Pipelines | P1 | Complete | Tenant-scoped versioned pipelines, immutable task snapshots, stage adapters, and responsive workspaces |

### Phase 2 - Medium Term

| Feature | Priority | Status | Description |
|---------|----------|--------|-------------|
| E-Signature | P1 | Planned | Digital signature integration for documents |
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
| TASKS-001 | 2026-07-27 | Replaced the retired Workflow/Projects module with Tasks and Pipelines, including a complete legacy data reset and tenant-aware Client Onboarding seed |
| FORMS-001 | 2026-03-10 | Implemented the Forms module with builder, public links, draft save/resume/email, uploads, response review, response PDF export, and queued AI review |

## Notes

- Add new items with the next available ID in their category.
- Move finished work to the Completed section.
- Keep this file aligned with shipped module status.
