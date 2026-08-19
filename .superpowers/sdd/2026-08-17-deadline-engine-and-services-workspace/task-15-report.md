# Task 15 report — rollout, observability, isolation, performance, and documentation

Status: PASS / pending review

## Scope delivered

- Added gated PostgreSQL tenant-isolation and concurrent idempotency coverage.
  The tests use isolated random tenants and verify that cross-tenant deadline
  list/detail/mutation access returns no data (404 for detail/mutation) and
  three concurrent reconciliation retries produce one deterministic occurrence
  identity.
- Added a representative PostgreSQL fixture using batched `createMany` calls
  for 1,000 Companies, 10,000 ClientServices, and 100,000 DeadlineOccurrences.
  The fixture always runs JSON `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` index
  assertions when `TEST_DATABASE_URL` is available. Roster/deadline wall-clock
  thresholds are asserted only when `RUN_PERFORMANCE_TESTS=true`; calendar
  results remain bounded at 5,000 rows.
- Added `Server-Timing`/`X-Response-Time-Ms` through `jsonWithServerTiming`
  to the roster and deadline list routes without changing DTOs, status codes,
  cache behavior, or authorization predicates.
- Added one redacted `reconciliation_request` structured event in the worker's
  `finally` path. It includes tenant/request/correlation IDs, duration, counts,
  warnings, attempt, preserved counts, and write mode. Warning messages are
  discarded before logging; lease-loss and retry paths do not emit duplicate
  request-level logs.
- Documented feature flags, observation/apply behavior, scheduler identity and
  cadence, retry schedule, rolling horizon, operational lease recovery, timing
  headers, and logging redaction in `SERVICE_PATTERNS.md`. Added the exact
  PostgreSQL/performance package scripts and static contract tests, including
  the shared-engine no-payroll branch assertion.

## TDD and focused verification evidence

The initial Task 15 RED run was collected before the implementation existed:

```text
npm.cmd run test:run -- __tests__/services/schedule-reconciliation-observability.test.ts __tests__/api/task-15-server-timing.test.ts __tests__/task-15-contract.test.ts
FAIL — 3 files, 6 tests failed (missing event builder, timing headers, scripts, and operations documentation)
```

The Task 15 GREEN selection is:

```text
npm.cmd run test:run -- __tests__/services/schedule-reconciliation-observability.test.ts __tests__/api/task-15-server-timing.test.ts __tests__/task-15-contract.test.ts __tests__/integration/deadline-tenant-isolation.postgres.test.ts __tests__/integration/deadline-performance.postgres.test.ts
3 files passed; 2 PostgreSQL files skipped; 7 tests passed; 4 tests skipped
```

The directly relevant Plan 2 invariant selection is:

```text
npm.cmd run test:run -- __tests__/lib/service-schedule-validation.test.ts __tests__/services/service-schedule-date-engine.test.ts __tests__/services/deadline-rule-evaluator.test.ts __tests__/services/business-calendar.service.test.ts __tests__/services/deadline-rule-impact.test.ts __tests__/services/schedule-reconciliation.test.ts __tests__/services/service-roster.service.test.ts __tests__/services/deadline.service.test.ts __tests__/api/service-calendar-routes.test.ts __tests__/api/deadline-routes.test.ts __tests__/api/service-roster-route.test.ts __tests__/services/manual-deadline-cycle.test.ts __tests__/api/manual-deadline-cycle-routes.test.ts __tests__/components/schedule-entry-editor.test.tsx __tests__/components/service-roster-preferences.test.ts __tests__/components/services-admin-page.test.tsx __tests__/components/deadline-rules-admin.test.tsx __tests__/components/business-calendar-admin.test.tsx
18 files passed; 235 tests passed
```

This selection covers four-plus schedule entries, second-last working-day and
business-day offsets, stored-company source precedence, XBRL-style
not-applicable applicability, impact fingerprints, preserved history and
idempotency, accessible-company/workspace filters, calendar preferences,
manual-cycle no-billing behavior, and rule/calendar/service administration
contracts. The existing roster/deadline route mocks were extended to retain the
real timing helper.

Static checks passed:

- `npx.cmd tsc --noEmit --pretty false` — exit 0.
- Scoped ESLint with `--max-warnings 0` over changed Task 15 routes, worker,
  tests, and PostgreSQL fixtures — exit 0 with zero warnings/errors.
- `git diff --check` — exit 0 after the implementation, report, and ledger
  changes were staged for handoff.

The exact package script `npm.cmd run test:deadlines:postgres` was attempted,
but this worktree's direct Vitest executable hit the existing Windows worktree
config-resolution error (`Cannot read directory "../../../../../../..": Access
is denied`). The equivalent focused command through `test:run` passed with both
PostgreSQL suites skipped, so no database was contacted:

```text
npm.cmd run test:run -- __tests__/integration/deadline-reconciliation.postgres.test.ts __tests__/integration/deadline-tenant-isolation.postgres.test.ts
2 files skipped; 4 tests skipped
```

## PostgreSQL/performance boundary

`TEST_DATABASE_URL` was not available. Therefore the tenant-isolation,
concurrent idempotency, fixture/index-plan, and live PostgreSQL checks are
gated/skipped and remain pending the isolated database gate. `RUN_PERFORMANCE_TESTS=true`
was not set; no wall-clock performance assertion was run.

## Deferred final gates

Per the repository rollout ruling, all of the following remain deferred until
the complete three-plan implementation is assembled:

- repository-wide baseline suite;
- Plan 2 Task 15 Step 5 complete verification matrix, including the full
  deadline/browser matrix;
- `npm.cmd run db:generate`;
- `npm.cmd run lint` (repository-wide/full lint);
- `npm.cmd run build` (full build);
- `npm.cmd run db:migrate` against an isolated/live database;
- `npm.cmd run test:deadlines:postgres` with `TEST_DATABASE_URL` and all other
  live PostgreSQL integration gates;
- `npm.cmd run test:deadlines:performance` with `TEST_DATABASE_URL` and
  `RUN_PERFORMANCE_TESTS=true` wall-clock assertions;
- the final Plan 2 completion gate and any Plan 3 work.

## Changed files

- `src/app/api/client-services/route.ts`
- `src/app/api/deadlines/route.ts`
- `src/services/schedule-reconciliation/worker.ts`
- `__tests__/api/deadline-routes.test.ts`
- `__tests__/api/service-roster-route.test.ts`
- `__tests__/api/task-15-server-timing.test.ts`
- `__tests__/integration/deadline-tenant-isolation.postgres.test.ts`
- `__tests__/integration/deadline-performance.postgres.test.ts`
- `__tests__/services/schedule-reconciliation-observability.test.ts`
- `__tests__/task-15-contract.test.ts`
- `docs/guides/SERVICE_PATTERNS.md`
- `package.json`
