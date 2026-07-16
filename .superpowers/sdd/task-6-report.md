# Task 6 Report: Pre-Generation Validation for Singular Selections

## Status

Implemented and verified.

## Changes

- Added the three singular selection IDs to the validation input and API schema.
- Detects singular selection requirements from resolved template content, including partials and legacy contact roots through `getRequiredPartySelections`.
- Emits precise missing director, shareholder, and company-contact selection errors before existing field-value errors.
- Reuses `resolveDocumentPartySelections` exactly once when selections and a company are supplied; converts its secure membership failures into field-specific validation errors.
- Rejects supplied party selections without a company using the generator's existing error message.
- Preserves company, officer, shareholder, contact, and custom validation behavior while classifying selected-party roots correctly.
- Adds selected-party scalar leaves, `system.preparerName`, and `company.address.letter` to available placeholders.
- Returns selected parties from validation and exposes selection-presence booleans from the route.

## TDD Evidence

### RED 1

Command:

`npx.cmd vitest run __tests__/services/document-validation.test.ts __tests__/api/generated-documents-validation-route.test.ts`

Result: exit 1; 2 test files failed, 6 tests failed, 9 passed. Failures showed that singular requirements were not emitted, the secure resolver was never invoked, selected leaves were absent, and the route did not forward the three UUIDs.

### GREEN 1

Same focused command after the minimal implementation:

Result: exit 0; 2 test files passed, 15 tests passed.

### RED 2 (self-review edge case)

Command:

`npx.cmd vitest run __tests__/services/document-validation.test.ts`

Result: exit 1; 1 test failed, 14 passed. A supplied party ID without a company produced no validation error.

### GREEN 2

Command:

`npx.cmd vitest run __tests__/services/document-validation.test.ts __tests__/api/generated-documents-validation-route.test.ts`

Result: exit 0; 2 test files passed, 16 tests passed.

## Verification

- `npx.cmd tsc --noEmit` — exit 0.
- `npx.cmd vitest run` — exit 0; 126 test files passed, 965 tests passed.
- `git diff --check` — exit 0.

The full-suite stderr includes the existing expected logging from `document-revision-route.test.ts`; the suite still completed with zero failures.

## Self-Review

- Membership eligibility remains centralized in `document-party.service`; no officer/shareholder/contact membership query logic was duplicated.
- Selection and membership errors precede existing company/officer/shareholder/custom errors.
- Resolved partial content is used for requirement detection.
- Unknown resolver failures are converted to a generic validation error instead of exposing internal details.
- No unrelated files or behavior were changed.

## Concerns

None.
