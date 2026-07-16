# Task 7 Report: Conditional People Step and Single-Selection Wizard

## Status

Complete. The generation wizard now independently derives and renders singular Director, Shareholder, and Company Contact selectors while preserving the legacy multi-contact flow for `contact`, `contact.*`, and `contacts` templates.

## Implementation

- Renamed the visible wizard step from **Contacts** to **People**.
- Added a tested `getRequiredLegacyContactSelection` helper that detects legacy contact roots in template content and nested partials without conflating `selectedContact`.
- Derived singular party requirements with `getRequiredPartySelections` across template content and loaded partials.
- Added accessible searchable native single-select controls with existing Oak focus, spacing, loading, empty, and error tokens.
- Fetches `/api/companies/{companyId}/document-parties` with `AbortController`; obsolete responses cannot update state.
- Company changes clear only singular company-scoped selections and stale preview/editor content. Legacy `selectedContacts` remains intact.
- Added exact missing-selection messages and focuses the first missing selector.
- Persisted singular IDs in the wizard draft and restores them only after a matching option loads for the restored company.
- Propagated `selectedDirectorId`, `selectedShareholderId`, and `selectedContactId` through validation, preview, and generation payloads.
- Preserved workspace contact loading, search plumbing, `contacts`, `onSearchContacts`, `selectedContacts`, `contactIds`, and legacy request payloads.
- Added `aria-pressed` to legacy contact rows to expose selection state to assistive technology.

## TDD Evidence

- Initial focused red run: 6 expected failures because the legacy-analysis helper and singular selector behavior did not exist.
- Implemented the analysis helper and observed its unit tests pass.
- Implemented wizard behavior incrementally and observed the focused wizard tests pass.
- Added a draft-restore regression test; it failed because the initial no-company effect discarded pending IDs. Removed that premature clearing and observed the test pass.

## Verification

- `npx.cmd vitest run __tests__/components/document-generation-wizard.test.tsx __tests__/api/generated-documents-preview-route.test.ts __tests__/api/generated-documents-workspace.test.ts __tests__/lib/template-analysis.test.ts`
  - PASS: 4 files, 19 tests.
- `npx.cmd vitest run`
  - PASS: 126 files, 975 tests.
- `npx.cmd tsc --noEmit`
  - PASS.
- Focused ESLint for all modified TypeScript/TSX files
  - PASS.
- `git diff --check`
  - PASS.

## Self-review

- Confirmed templates with both singular and legacy roots render both selector modes.
- Confirmed a company change aborts stale option loading, clears only singular IDs, resets stale preview/editor content, and preserves legacy contacts.
- Confirmed search retains the currently selected option in the native select.
- Confirmed template changes clear stale party validation messages.
- Confirmed the page still performs the workspace-wide contacts fetch and supplies legacy contact search callbacks.

## Concerns

None known. The full suite emits an expected diagnostic stack trace from the existing negative-path revision-route test, but all 975 tests pass.
