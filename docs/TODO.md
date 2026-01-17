# TODO / Roadmap

> **Last Updated**: 2025-01-12

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
| - | - | No completed items yet |

---

## Notes

- Add new issues with the next available ID in their category (DOC-XXX, GEN-XXX, UI-XXX)
- Move items to "Completed" section when finished
- Update status and notes as work progresses


many pages without tenant are still showing records, companies, contacts, document processing etc.