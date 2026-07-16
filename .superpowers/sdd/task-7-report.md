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

## Fix Review

### Findings addressed

- **P1 — async draft eligibility:** Restored drafts that require singular parties are now held at the People step until the saved company-party IDs are checked against freshly loaded options. A fully eligible draft resumes its saved step only after that check. A missing or ineligible required ID clears all singular selections plus preview, edited, validation, missing-placeholder, missing-partial, and blocking-error state; the draft remains on People. Generation also has a direct eligibility guard.
- **P2 — company transition race:** Selecting a company now synchronously empties party options, enters loading state, marks eligibility unresolved, clears singular IDs and stale rendered content, and leaves legacy `selectedContacts` intact. Every successful party response reconciles the current singular IDs against its returned options, while the existing abort check prevents obsolete responses from updating state.

### Added regression coverage

- A valid Edit-step draft is visibly gated on People and exposes no Generate action until its saved director becomes eligible, then safely resumes Edit.
- A stale Edit-step draft remains on People, exposes no Generate action, and persists null preview/edited content with step 2.
- A two-company race proves old party options disappear during the transition, an old ID cannot pass People, the new response leaves selection empty, and the legacy contact remains selected.

### Fix verification

- Initial review-test run: expected RED, with the valid and stale Edit-draft tests failing because the wizard restored Edit immediately.
- `npx.cmd vitest run __tests__/components/document-generation-wizard.test.tsx -t "gates a valid|keeps a stale|company race" --reporter=dot`
  - PASS: 3 review regressions.
- `npx.cmd vitest run __tests__/components/document-generation-wizard.test.tsx __tests__/lib/template-analysis.test.ts --reporter=dot`
  - PASS: 2 files, 16 tests.
- `npx.cmd tsc --noEmit`
  - PASS.
- Focused ESLint and `git diff --check`
  - PASS.

## Re-review Fixes

### Remaining findings addressed

- **Unavailable saved company:** A singular-party draft whose saved company is absent from the current company options is now treated as failed eligibility. The wizard restores at Company, clears the company and all singular IDs, invalidates resolved preview/editor and validation diagnostics, and never exposes Generate.
- **Legacy-only isolation:** Company selection and draft restoration for `contact`, `contact.*`, and `contacts`-loop templates no longer start, await, or depend on `/document-parties`. Legacy contacts can proceed even when that endpoint would fail. Singular fetch failures finish loading in a visible error state with a working Retry action while People remains invalid.
- **Same-company re-selection:** Selecting the already-current company is a no-op while options are current or loading, preserving singular and legacy selections. If the current load is in an error state, the same action triggers the explicit retry path instead of entering permanent loading.

### Re-review regression coverage

- Deleted/cross-workspace saved company draft restores safely at Company and persists cleared IDs/content.
- Legacy-only company/contact flow makes zero party requests and advances through People.
- Singular party failure renders a retry action, retries the request, and remains invalid on repeated failure.
- Same-company selection preserves the loaded director and legacy contact without returning to loading.

### Re-review verification

- Initial four-test run: expected RED; all four new regressions failed against the reviewed implementation.
- `npx.cmd vitest run __tests__/components/document-generation-wizard.test.tsx __tests__/lib/template-analysis.test.ts --reporter=dot`
  - PASS: 2 files, 20 tests.
- `npx.cmd tsc --noEmit`
  - PASS.
- Focused ESLint and `git diff --check`
  - PASS.
