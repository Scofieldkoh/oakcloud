# Final fixes 3 report

## Scope completed

- Replaced the effect-driven dirty-history guard with an explicit `idle -> armed -> collapsed/disarmed` lifecycle.
- Captures and restores the original history state, owns at most one same-URL history slot, reuses it across repeated dirty cycles, and removes the sentinel marker on clean, save, reset, cancel, or unmount.
- Declined Back navigation restores the sentinel with one `pushState`; accepted Back disarms before leaving. No `history.go()` or `history.forward()` loop is used, and ordinary unmount never invokes navigation.
- Canonicalized officer/shareholder identification aliases (`NATIONAL REGISTRATION IDENTITY CARD`, `FOREIGN IDENTIFICATION NUMBER`, `UNIQUE ENTITY NUMBER`) for initial drafts, visible selects, edits, and confirmation payloads.
- Consolidated canonical option tuples and typed alias maps in `src/services/bizfile/canonical-values.ts`; validation re-exports the shared tuples for compatibility.
- Added parity coverage against generated Prisma enums and the BizFile mappers.

## Regression-first evidence

Before implementation, the new component regressions failed in seven assertions: the three identification aliases rendered as blank select values, and history tests exposed overwritten original state, accumulated pushes, retained sentinels after save, and `forward()`-based decline restoration. After implementation, the focused component run passed 37/37.

## Verification

- Focused unit/service/API/component/integration: `npx vitest run ...` — 7 files, 116 tests passed.
- Browser: `npx vitest run --config vitest.browser.config.ts __tests__/browser/bizfile-review.browser.test.tsx` — Chromium, 2 tests passed.
- TypeScript: `npx tsc --noEmit` — exit 0.
- Lint: `npm run lint` — exit 0.
- Patch hygiene: `git diff --check` — exit 0.
