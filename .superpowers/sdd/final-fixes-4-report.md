# Final fixes 4 report

## Scope completed

- Removed the persistent history sentinel design. Dirty, clean, save, reset, cancel, and unmount transitions never call `pushState`, `replaceState`, `back`, or `go`.
- Dirty Back navigation now prompts after the browser has moved. Acceptance disarms the guard and permits that completed navigation without a second Back call.
- Accepted Back navigation suppresses the dirty `beforeunload` handler, preventing a second browser prompt for the same exit.
- Rejected Back navigation calls `history.forward()` exactly once and suppresses exactly the resulting restoration `popstate`, preventing prompt loops without adding entries.
- Preserved footer and keyboard confirmation behavior and all canonicalization fixes from the preceding changes.

## Regression-first evidence

The focused component regression initially failed seven tests. The failures showed `pushState` on dirty transitions, `replaceState` during cleanup, a second `back()` on accepted navigation, and no `forward()` restoration on decline. After the listener/ref-only rewrite, the component suite passed 25/25.

## Verification

- Focused unit/service/API/component/integration: 7 files, 116 tests passed.
- Browser: Chromium, 2 tests passed.
- TypeScript: `npx tsc --noEmit` — exit 0.
- Lint: `npm run lint` — exit 0.
- Patch hygiene: `git diff --check` — exit 0.
