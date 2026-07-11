# Task 3 Report

## Outcome

Implemented the complete editable BizFile review section surface with ten named section exports and the active-section dispatcher.

## TDD evidence

- RED: `npm test -- --run __tests__/components/bizfile-review-sections.test.tsx` failed because `bizfile-review-sections` could not be resolved.
- GREEN: the focused suite passes 2 tests covering the all-field fixture, immutable company-name edit, and blank mailing-address/auditor singleton controls.

## Implementation notes

- Every field in `ExtractedBizFileData` has an editable control.
- Repeating records use `RepeatingRecordEditor` with required `duplicateItem` and `getItemKey` props.
- Repeating-row identity is kept in a module-private `WeakMap`; no UI key is written into submitted domain objects.
- Optional mailing-address and auditor groups remain visible when absent from the draft.
- Dates, selects, numeric constraints, and boolean checkboxes use native controls.

## Verification

- Focused Vitest suite: pass (2/2).
- `npx tsc --noEmit`: exit 0.
- Focused ESLint: exit 0.
- `git diff --check`: exit 0.

## Concerns

- The requested npm command emits npm warnings because npm parses the arguments around `--run`; Vitest still runs the intended single file successfully.

## Review fixes (2026-07-12)

- Replaced module-level object-identity keys with editor-owned row lineage keys. Immutable row replacements retain their key; add, duplicate, remove, and undo explicitly carry the aligned key sequence without writing UI metadata into extracted payloads.
- Replaced permissive numeric conversion with finite-only parsing. Blank or invalid optional values remove `parValue`, `percentageHeld`, and `amountSecured`; blank required numeric controls remain blank/invalid rather than becoming a valid zero, and no handler stores `NaN`.
- Expanded entity type, company status, and officer role selects to every value accepted by the service mapper/generated enums, while retaining the currently extracted value surface.
- Wired exact validation issue paths to scalar controls and indexed repeating controls across all ten sections.
- Added regressions proving focus survives immutable typing and middle remove/undo, numeric clearing behavior, complete mapped select values, and scalar/indexed issue accessibility.

### Review-fix TDD and verification

- RED: focused section suite failed 4 new regressions (row focus, optional number clearing, missing select values, and missing scalar/indexed issue descriptions).
- GREEN: focused section and primitive suites pass 12/12.
- `npx tsc --noEmit`: exit 0.
- Focused ESLint: exit 0.
- `git diff --check`: exit 0.
