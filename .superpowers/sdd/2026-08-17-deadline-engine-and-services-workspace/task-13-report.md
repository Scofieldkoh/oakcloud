# Task 13 report — manual historical-cycle preview and apply

Status: implementation-complete / pending review

## Scope delivered

- Added strict preview/apply schemas for a route-scoped client service, a
  published rule version, bounded historical period dates/key, JSON-safe
  parameter overrides and source values, repeatable schedule entries, apply
  fingerprint/notes, and exactly one selection per evaluated milestone and
  schedule-entry identity.
- Added tenant- and accessible-company-scoped service/version/calendar loads.
  Preview reuses the pure deadline evaluator, returns every evaluated
  milestone with calculated/operative dates and explanations, and performs no
  cycle, occurrence, audit, billing, or reconciliation writes.
- Added serializable apply that reloads and recomputes the preview fingerprint,
  rejects stale input, creates a deterministic `MANUAL_TRIGGER` generation,
  inserts only selected unique occurrences, records adjusted-date override and
  completion metadata, persists notes, audits included/excluded/completed
  choices atomically, and handles duplicate/race idempotency. No billing
  occurrence or schedule reconciliation side effect is called.
- Added tenant-safe `POST` preview/apply routes with the Services workspace
  gate and `company:update` authorization.
- Added an accessible responsive manual-cycle dialog with 44px controls,
  period/rule inputs, repeatable parameter and schedule editors, source values,
  preview state, selectable milestone rows, explanations, status/date/
  completion controls, notes, and Apply invalidation until the current preview
  remains unchanged.
- Added gated trigger actions to the cross-company roster and company detail
  service list while preserving the existing status/family filter placement.

## TDD evidence

The required RED run was collected before production modules existed:

```text
npm.cmd run test:run -- __tests__/services/manual-deadline-cycle.test.ts __tests__/api/manual-deadline-cycle-routes.test.ts __tests__/components/manual-cycle-dialog.test.tsx
FAIL — all three suites failed to resolve the new service/route/dialog modules
```

Focused Task 13 GREEN evidence:

```text
npm.cmd run test:run -- __tests__/services/manual-deadline-cycle.test.ts __tests__/api/manual-deadline-cycle-routes.test.ts __tests__/components/manual-cycle-dialog.test.tsx
3 files passed; 8 tests passed

npm.cmd run test:run -- __tests__/services/manual-deadline-cycle.test.ts __tests__/api/manual-deadline-cycle-routes.test.ts __tests__/components/manual-cycle-dialog.test.tsx __tests__/components/company-services-tab.test.tsx __tests__/components/service-roster.test.tsx
5 files passed; 43 tests passed
```

The Task 13 service tests cover no-write preview, no-billing apply, adjusted
dates/completion, stale fingerprints, and idempotent existing generations.

## Compatibility evidence

- Pure evaluator plus Task 11 deadline service/routes/hooks: 4 files passed,
  81 tests passed.
- Relevant Task 8 client-service service/manual-create/catalog/validation/
  impact/hook subset: 6 files passed, 70 tests passed.
- Task 12 deadline workspace/calendar and roster compatibility: 7 files
  passed, 66 tests passed.
- Company-services component compatibility: 1 file passed, 24 tests passed.

One separate compatibility command also included the existing
`__tests__/services/client-service-schema.test.ts`. Its exact-format assertion
for a Prisma schema line failed against the current schema text; the six-file
Task 8 subset above is green. This unrelated assertion was not modified.

## Verification and boundaries

- `npx.cmd tsc --noEmit --pretty false` — pass.
- Scoped ESLint with `--max-warnings 0` over changed Task 13 source/routes/
  components/tests — pass with zero warnings/errors.
- `git diff --check` — pass.
- No repository-wide baseline, full build/lint, Prisma generation/migration,
  live database, or broader Plan 2 gate was run. Task 14 was not started.

## Changed files

- `src/services/deadline/manual-cycle.ts`
- `src/services/deadline/index.ts`
- `src/app/api/client-services/[id]/deadline-cycles/preview/route.ts`
- `src/app/api/client-services/[id]/deadline-cycles/route.ts`
- `src/components/services/deadlines/manual-cycle-dialog.tsx`
- `src/components/services/roster/service-roster-table.tsx`
- `src/components/services/roster/service-roster.tsx`
- `src/components/companies/company-detail/company-services-tab.tsx`
- `__tests__/services/manual-deadline-cycle.test.ts`
- `__tests__/api/manual-deadline-cycle-routes.test.ts`
- `__tests__/components/manual-cycle-dialog.test.tsx`
