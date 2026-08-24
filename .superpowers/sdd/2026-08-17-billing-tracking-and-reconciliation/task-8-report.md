# Task 8 — billing tracking acceptance

## Outcome

Task 8 closes the deferred generic `ONE_TIME` repeatable-entry contract,
adds live PostgreSQL tenant/manual-deadline/performance acceptance coverage,
and emits bounded allowlisted worker observability. The original
implementation is `5d3f5b59` (`test: verify billing tracking acceptance`).
The review hardening is `1f081801` (`test: verify billing tracking
acceptance`); this report is committed separately.

The `ONE_TIME` contract is explicit: every stable repeatable entry materializes
exactly once, in stable-key order. It does not silently select the lexical-first
entry.

## TDD and review evidence

- The original `ONE_TIME` RED was `1 failed / 15 passed`; GREEN was `16
  passed`. Repeated evaluation is deterministic and bounded-range behavior is
  covered.
- Review RED exposed an absent fail-closed preflight helper and unbounded
  worker event identifiers. The focused worker/preflight GREEN result is `2
  files / 23 tests passed`.
- Worker events are one fixed structured event per request. IDs/text are capped
  at 200 characters, warnings at 50, warning `missingFields` at 20 entries,
  numeric/cardinality values at 1,000,000, and duration at 86,400,000 ms.
  Warning/error/customer free text is discarded; only allowlisted warning codes
  and bounded identifiers/field names remain. Success, retry, exhausted retry,
  and permanent failure paths assert one complete event, fixed keys, metrics,
  bounds, and redaction.
- Tenant acceptance now seeds two companies in each tenant. An actor scoped to
  company one cannot list, read, mutate, or receive coverage rows for the
  same-tenant company two; the allowed company and tenant-two negatives remain
  covered. The service predicates enforce this in SQL.
- Billing acceptance scripts fail closed before Vitest. Without variables,
  `test:billing:postgres` exits `1` with `TEST_DATABASE_URL`, and
  `test:billing:performance` exits `1` with `TEST_DATABASE_URL,
  RUN_PERFORMANCE_TESTS=true`. The enabled PostgreSQL scripts run serially with
  `--maxWorkers=1`.

## Verification matrix

| Gate | Result |
| --- | --- |
| Worker observability + preflight focused suites | PASS; `2 files / 23 tests`, no skips |
| Live tenant/company isolation suite | PASS; `1 file / 2 tests`, no skips |
| `npm.cmd run test:billing:postgres` with isolated `TEST_DATABASE_URL` | PASS; `5 files / 9 tests`, no skips |
| `npm.cmd run test:billing:performance` with `TEST_DATABASE_URL` and `RUN_PERFORMANCE_TESTS=true` | PASS; `1 file / 2 tests`, no skips |
| `npx.cmd prisma migrate status` on disposable database | PASS; `54 migrations found`, database schema up to date |
| `npx.cmd tsc --noEmit` | FAIL only at pre-existing generated route validation: `.next/types/app/api/services/settings/route.ts:38`; no changed-file errors |
| `npm.cmd run lint` (`eslint src`) | PASS; 0 errors, 4 existing warnings |
| `npm.cmd run build` | Compiled successfully; then failed at the same pre-existing generated route type error above |
| `git diff --check` | PASS; no findings |

The earlier repository-wide baseline is preserved as evidence rather than
rerun after these scoped acceptance-harness/observability changes: `343
passed / 8 failed / 19 skipped` files and `2,866 passed / 33 failed / 54
skipped` tests. Its failures were unrelated existing schema expectations and
missing UI test providers/roles; no billing acceptance test was weakened or
removed. The 19 skipped files / 54 skipped tests are environment-gated
optional suites. The dedicated billing PostgreSQL and performance gates above
were enabled and had no skips.

Prior Task 8 evidence also remains valid for the Plan 3 focused matrix (`16
files / 158 tests`), worker/schedule regression matrix (`4 files / 57 tests`),
browser smoke (`1 file / 2 tests`), and the original build/baseline diagnosis;
the review reruns above cover every changed production path and acceptance
gate.

## Disposable PostgreSQL and migration evidence

Docker Desktop was unavailable. A fresh PostgreSQL 17 cluster was created
locally with trust-only authentication at
`127.0.0.1:55433`, under
`C:\Users\Scotfield\AppData\Local\Temp\oakcloud-task8-review-pg-20260825`,
using database `oakcloud_task8_review_20260825`. No credentials are recorded,
and no shared/source database was migrated or modified.

The cluster received the complete Prisma migration chain (`54 migrations
found`; `Database schema is up to date`). The live package matrix and
performance suite ran against this database, cleaned their tenant fixtures,
and the cluster was stopped and its disposable data directory removed after
verification.

The live billing index inspection showed PostgreSQL's 63-character physical
names, including:

- `billing_occurrences_tenant_id_operative_expected_date_status_id`
- `billing_occurrences_tenant_id_client_service_id_operative_expec`
- `billing_occurrences_tenant_id_company_id_operative_expected_dat`
- `billing_coverage_issues_tenant_id_company_id_severity_resolved_`

## Live performance evidence

The performance fixture seeded 1,000 companies, 10,000 client services,
10,000 fee lines, 100,000 billing occurrences, and 1,000 unresolved coverage
issues, then ran `ANALYZE` before reads.

The EXPLAIN harness captures Prisma query events emitted by the actual
`listBillingOccurrences` and `listBillingCoverage` production services,
interpolates their bound parameters, and runs `EXPLAIN (ANALYZE, BUFFERS,
FORMAT JSON)` on those captured query shapes. It does not use handcrafted SQL
or force `enable_seqscan`. With one selective company input, PostgreSQL
naturally chose the tenant/client-service/operative-date occurrence index
family (with status in the production filter) and the
tenant/company/severity/unresolved coverage index.

Measured local PostgreSQL 17 representative acceptance timings were:

- occurrence list: `473.05 ms`
- coverage summary: `83.46 ms`
- target: each `<= 1,500 ms`

These are local representative acceptance results, not staging evidence. No
staging target was available in this environment; a staging-sized rerun with
production-like data remains a release/environment gate and is explicitly not
fabricated here.

The manual historical-deadline acceptance passed in the serial matrix and
confirmed no billing request or billing occurrence side effect. The tenant
suite covered same-tenant company controls and tenant-two negatives with
production SQL predicates.

## Clean-worktree and artifact policy

No credentials, PostgreSQL data directory, browser artifacts, performance
output, or review package was added. The implementation commit contains only
the accepted source/tests/package preflight helper. This report is committed
separately as the documentation/evidence commit.
