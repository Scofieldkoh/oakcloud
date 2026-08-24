# Task 8 — billing tracking acceptance

## Outcome

Task 8 closes the deferred generic `ONE_TIME` schedule contract, adds live
PostgreSQL tenant/manual-trigger/performance acceptance coverage, emits bounded
allowlisted worker metrics, and documents the billing recovery/migration
runbook. The implementation is committed as `5d3f5b59` (`test: verify billing
tracking acceptance`).

## TDD evidence

- `ONE_TIME` RED: the focused schedule suite was `1 failed / 15 passed` because
  the evaluator selected only the lexical-first entry. GREEN is `16 passed`;
  multiple stable entries now each materialize once, in stable-key order, with
  deterministic repeated evaluation and bounded-range behavior.
- Worker metrics RED: the focused worker suite was `2 failed / 15 passed`.
  GREEN is `17 passed`. The single event now contains the exact allowlisted
  metrics object, bounded counts, and no warning/error/customer free text on
  success and retry paths. Worker/schedule compatibility is `4 files / 57
  tests passed`.
- The first combined PostgreSQL acceptance attempt exposed concurrent fixture
  setup locks (`3 failed / 2 passed` files). The release script now runs these
  five isolated files with `--maxWorkers=1`; the package-level rerun is `5
  files / 9 tests passed` with no skips.
- The performance harness initially exposed stale planner statistics and a
  raw-array type mismatch. Refreshing statistics after bulk fixture creation
  and using the typed PostgreSQL array predicate produced the final green
  run; no production query was replaced with a test-only substitute.

## Final verification matrix

| Gate | Result |
| --- | --- |
| `npm.cmd run db:generate` (disposable `DATABASE_URL`) | PASS; Prisma Client 7.2.0 generated |
| Plan 3 focused billing matrix | PASS; `16 files / 158 tests` |
| Worker/schedule regression matrix | PASS; `4 files / 57 tests` |
| `npm.cmd run test:browser -- __tests__/browser/services-billing.browser.test.tsx` | PASS; Chromium `1 file / 2 tests` |
| `npm.cmd run test:billing:postgres` (isolated `TEST_DATABASE_URL`) | PASS; `5 files / 9 tests`, no skips |
| `npm.cmd run test:billing:performance` with `RUN_PERFORMANCE_TESTS=true` | PASS; `1 file / 2 tests`, no skips |
| `npx.cmd tsc --noEmit` | PASS; exit 0 |
| `npm.cmd run lint` | PASS; 0 errors, 4 existing warnings |
| `git diff --check` | PASS; no findings |
| Guarded repository baseline, `npm.cmd run test:run -- --reporter=dot` | Exit 1: `343 passed / 8 failed / 19 skipped` files; `2,866 passed / 33 failed / 54 skipped` tests; duration `333.64s` |
| `npm.cmd run build` with disposable `DATABASE_URL` | Reached successful app compilation and type checking, then failed in generated route validation at `.next/types/app/api/services/settings/route.ts:38` because the existing GET handler exposes an optional `Request` parameter. |

The baseline failures are outside this change: one company-create test, eleven
BizFile contact-resolution tests, one client-service schema test, one form
option-preset schema test, one service-agreement schema test, one service
catalog schema test, three task-list tests, and fourteen task-workspace tests.
Their observed causes are existing schema expectations and missing UI test
providers/roles; no billing acceptance test failed and no test was weakened or
removed. The build route error is likewise outside the changed files.

The baseline's 19 skipped files / 54 skipped tests are the repository's
environment-gated optional suites under the intentionally unset database and
performance variables. The dedicated billing PostgreSQL, performance, and
browser gates above have no skips.

An earlier repository-wide attempt with database variables enabled was not
counted: unrelated PostgreSQL suites ran concurrently against one database and
produced cross-suite cleanup/foreign-key conflicts (including deadline-rule
version and document-batch user references). It was stopped, the disposable
database sessions were terminated, and the billing suites were rerun serially
against their isolated target.

## Disposable PostgreSQL and migration evidence

Docker Desktop was unavailable. A disposable PostgreSQL 17 cluster was started
locally at `127.0.0.1:55432` under
`C:\Users\Scotfield\AppData\Local\Temp\oakcloud-task8-pg-20260825` with
trust-only local authentication. No credentials are recorded here. Acceptance
used distinct databases `oakcloud_task8_20260825` and
`oakcloud_task8_perf3_20260825`; no shared/source database was migrated or
modified.

- A clean disposable database received the complete Prisma chain: `54
  migrations found` and `Database schema is up to date`.
- The live backfill suite verified legacy amount/currency preservation,
  deterministic schedules, explicit invalid-CUSTOM and missing-start issues,
  tenant isolation, and one deduplicated `BILLING_BACKFILL` request per active
  tenant on rerun.
- The billing indexes inspected after the live run were
  `billing_occurrences_tenant_id_operative_expected_date_status_id` (Postgres
  display truncates the physical name) and
  `billing_coverage_issues_tenant_id_company_id_severity_resolved_`, alongside
  the identity/open-issue indexes. The performance fixture cleaned up to zero
  rows after the test.

## Live performance evidence

The isolated performance run seeded 1,000 companies, 10,000 client services,
10,000 fee lines, 100,000 billing occurrences, and 1,000 unresolved coverage
issues. It exercised the production paginated occurrence list and coverage
summary services after `ANALYZE` refreshed planner statistics.

- `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` selected the tenant/date/status
  occurrence index and the tenant/company/severity/unresolved coverage index.
- Measured production-service durations: occurrence list `348.0085 ms`,
  coverage summary `125.6226 ms`; both satisfy the `<= 1,500 ms` acceptance
  target.
- Tenant-isolation acceptance covered same-tenant controls plus cross-tenant
  and cross-company list/detail/mutation/coverage negatives using production
  SQL predicates. Manual historical deadline acceptance confirmed no billing
  request or billing occurrence side effect after the worker ran.

## Clean-worktree and artifact policy

No credentials, PostgreSQL data directory, browser artifacts, performance
output, or review package was added. The disposable cluster is stopped and
removed after final handoff. The implementation commit contains only the
accepted source/tests/scripts/guide files; this report is committed separately
as the documentation/evidence commit.
