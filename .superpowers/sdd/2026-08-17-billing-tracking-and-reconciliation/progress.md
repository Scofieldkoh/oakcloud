# SDD ledger — plan: docs/superpowers/plans/2026-08-17-billing-tracking-and-reconciliation.md

## Execution context

- Worktree: `C:\Users\Scotfield\OneDrive\Documents\Python Project\oakcloud_development\oakcloud\.worktrees\services-administration`
- Branch: `codex/services-administration`
- Task scope: Task 1 only — additive billing disposition, fee-line archive fields, billing occurrences, and coverage issues.
- Implementation model: `gpt-5.6-luna`, reasoning `max`.
- Review model: `gpt-5.6-sol`, reasoning `medium`.
- Final branch review: `gpt-5.6-sol`, reasoning `xhigh`.
- Repository baseline/full build/full lint/live migration/performance gates remain deferred until all Plan 3 tasks, per the accepted Plan 2 handoff. Focused RED/GREEN tests, TypeScript, scoped lint, Prisma generation/validation/format, and diff checks remain required.

## Authority and dependency audit

- Approved specification: `docs/superpowers/specs/2026-08-17-services-administration-deadlines-billing-design.md` (read in full).
- Plan 3: `docs/superpowers/plans/2026-08-17-billing-tracking-and-reconciliation.md` (Global Constraints, public interfaces, and Task 1 read in full).
- Plan 2 handoff: `docs/superpowers/plans/2026-08-17-deadline-engine-and-services-workspace.md` (schema/migration conventions and accepted shared schedule/reconciliation contracts read).
- Repository guidance read: `AGENTS.md`, `docs/guides/SERVICE_PATTERNS.md`, `docs/guides/RBAC_GUIDELINE.md`; `docs/guides/DESIGN_GUIDELINE.md` was reviewed for scope and is UI-only for this persistence task.

## Preflight contract scan

| Plan item | Produces / consumes | Finding and ruling |
|---|---|---|
| Task 1 self-consistency | `prisma/schema.prisma`, billing migration, schema contract test | Consistent: migration adds only new billing enums/tables and nullable/defaulted existing fields; the contract test observes mapped fields, relations, identity/partial indexes, and migration constraints. Ruling: use migration-managed partial uniqueness and checks rather than Prisma declarations where the plan requires it. |
| Task 1 → Task 2 | Billing disposition and active/archive fee-line fields | Task 2 consumes `UNREVIEWED`, `scheduleConfig`, `isActive`, `deletedAt`, and `deletedReason`; no conflicting ownership. Ruling: preserve legacy frequency/start/amount/currency columns. |
| Task 1 → Task 3 | Occurrence identity and lifecycle metadata | Task 3 consumes the five-part generation identity and Restrict source relations. Ruling: no invoice/payment semantics or extra generation path. |
| Task 1 → Task 4 | Coverage issue lineage and open uniqueness | Task 4 consumes nullable fee-line lineage and unresolved issue uniqueness. Ruling: retain rows and resolve by timestamp; do not hard-delete issue history. |
| Task 1 → Task 5 | Status/override/amount metadata | Task 5 consumes Open/Billed/Waived/Cancelled fields and optional billed date. Ruling: follow the explicit consistency checks in Task 1; billed date remains outside Billed equivalence. |
| Task 1 → Tasks 6–15 | Prisma relations and existing service/client forms/workspace | Later tasks consume generated client relations and fields; no Task 1 UI/API implementation is allowed. Ruling: keep this task persistence-only. |

## Shared invariants recorded for Task 1

- Billing remains manual tracking only; no invoice, payment, or ledger model is introduced.
- Every new billing row is tenant-scoped and carries company/client-service lineage; source references are restrictive to preserve history.
- Existing client services default to `UNREVIEWED`; existing fee lines remain compatible while becoming soft-archivable.
- Billing occurrence identity is tenant + fee line + period + schedule entry + generation key; the open coverage issue index is tenant + issue key where unresolved.
- `billedDate` is optional and is intentionally absent from the Billed consistency equivalence.

## Task status

| Task | Status | Commit | Review |
|---|---|---|---|
| 1 | PASS / final-review-complete | `66197f3c`, `960d0778`, `e530c522` | `final review PASS (0 Critical / 0 Important / 0 Minor)` |

## RED evidence

- `npm.cmd run test:run -- __tests__/services/billing-tracking-schema.test.ts` — FAIL, 1 file / 8 tests failed because billing enums/models/migration/indexes are absent. This is the expected missing-feature RED state.

## Review correction RED evidence

- Independent review `task-1-review.md` reported 5 Important and 2 Minor findings against `66197f3c`.
- After adding regression assertions for composite lineage, explicit disposition NULL rejection, actor retention, lifecycle metadata, override equivalence, and archive invariants, `npm.cmd run test:run -- __tests__/services/billing-tracking-schema.test.ts --reporter=dot` failed for the intended missing composite/check clauses (2 failed / 6 passed).

## Review correction decisions

- I1: Companies, client services, and fee lines now expose composite tenant/identity uniques in Prisma and SQL. Billing occurrence/coverage rows use composite FKs for tenant→company, tenant/company→client service, and tenant/client service→fee line; the existing company `tenantId` column mapping is preserved.
- I2: `NOT_REQUIRED` requires non-NULL `btrim` length ≥ 3; all other dispositions require a NULL reason.
- I3: Actor foreign keys use `ON DELETE RESTRICT` in Prisma and SQL, retaining immutable actor IDs required by active override/lifecycle checks.
- I4: Billed, waived, and cancelled checks require complete timestamp/actor/reason metadata and prohibit stray metadata in other statuses. `billed_date` is NULL unless status is BILLED, where it remains optional.
- I5: Unoverridden dates and values require calculated/operative equality; override metadata remains complete when flags are true.
- M1: Fee lines use one canonical state: active rows have no archive metadata; inactive rows require archive timestamp and a trimmed reason of at least three characters.
- M2: `__tests__/integration/billing-tracking-integrity.postgres.test.ts` applies the billing migration only inside a random isolated schema when `TEST_DATABASE_URL` is supplied; it intentionally skips locally without that variable and has a CI configuration guard.

## GREEN evidence and scope notes

- `npm.cmd run db:generate` — PASS; Prisma Client 7.2.0 generated and normalized (15 generated files changed, including `BillingOccurrence` and `BillingCoverageIssue` model outputs).
- `npm.cmd run test:run -- __tests__/services/billing-tracking-schema.test.ts --reporter=dot` — PASS, 1 file / 8 tests.
- `npm.cmd run test:run -- __tests__/services/deadline-engine-schema.test.ts --reporter=dot` — PASS, 1 file / 25 tests; `services-admin-foundation-schema.test.ts` — PASS, 1 file / 2 tests.
- `npx.cmd tsc --noEmit` — PASS, exit 0.
- `npx.cmd eslint __tests__/services/billing-tracking-schema.test.ts` — PASS, exit 0 with zero warnings/errors.
- `$env:DATABASE_URL='postgresql://test:test@localhost:5432/test'; npx.cmd prisma validate` — PASS; schema valid. `npx.cmd prisma format` was run during implementation and exited 0; untouched legacy field spacing was restored afterward to preserve existing exact-string schema tests.
- `git diff --check` — PASS.
- Final post-commit focused run `npm.cmd run test:run -- __tests__/services/billing-tracking-schema.test.ts __tests__/services/deadline-engine-schema.test.ts __tests__/services/services-admin-foundation-schema.test.ts --reporter=dot` — PASS, 3 files / 35 tests.
- Final post-commit `npx.cmd tsc --noEmit`, scoped ESLint, and Prisma validation — PASS (all exit 0).
- Review-correction focused run including billing/deadline/admin schema suites and PostgreSQL integrity suite — PASS, 3 files / 35 tests; PostgreSQL suite intentionally skipped 4 tests locally without `TEST_DATABASE_URL`.
- Review-correction `npm.cmd run db:generate` — PASS; Prisma Client 7.2.0 regenerated for composite relations and Restrict actor actions.
- Review-correction `npx.cmd tsc --noEmit`, scoped zero-warning ESLint, Prisma validate, and `git diff --check` — PASS.
- Final correction verification: `npm.cmd run test:run -- __tests__/services/billing-tracking-schema.test.ts __tests__/integration/billing-tracking-integrity.postgres.test.ts __tests__/services/deadline-engine-schema.test.ts __tests__/services/services-admin-foundation-schema.test.ts --reporter=dot` — PASS, 3 files / 35 tests; PostgreSQL suite 1 file / 4 tests intentionally skipped locally.
- Final correction `npx.cmd tsc --noEmit` — PASS, exit 0; scoped ESLint with `--max-warnings=0` — PASS; Prisma validate — PASS; `git diff --check` — PASS.
- Task 1 closeout added an explicit successful PostgreSQL assertion for a valid `BillingCoverageIssue` with `fee_line_id = NULL`; required tenant/company/client-service lineage remains populated. The closeout is committed as `e530c522` (`test: cover nullable billing issue lineage`). Local gated verification passed the billing schema (8/8) and intentionally skipped the PostgreSQL suite's 4 tests without `TEST_DATABASE_URL`.
- Task 1 final review `task-1-final-review.md` — PASS, 0 Critical / 0 Important / 0 Minor. The earlier correction commit is `960d0778` (`fix: enforce billing tracking integrity`).
- Known unrelated baseline exact-format failures remain isolated in `client-service-schema.test.ts`, `service-catalog-schema.test.ts`, and `service-agreement-schema.test.ts`; their expectations are absent at both base and corrected heads and are outside Task 1.
- The primary session staged and committed the closeout test after the implementation subagent's worktree index-lock attempt failed; no lock or ACL was deleted or changed.
- No migration apply, live Postgres, repository-wide build/lint, or performance gate was run; those remain deferred until all Plan 3 tasks.

## Resume checkpoint

- Pause point: Plan 3 Task 1 is complete and independently accepted at `e530c522`.
- Next work: begin Plan 3 Task 2, `Define fee schedules and migrate existing billing frequencies`.
- Task 2 and all later Plan 3 tasks have not started.
- Continue using `gpt-5.6-luna` at `max` for implementation, `gpt-5.6-sol` at `medium` for each task review, and `gpt-5.6-sol` at `xhigh` for the final whole-branch review.
- Keep the repository-wide baseline, full build/full lint, live migrations/PostgreSQL, and wall-clock performance gates deferred until all Plan 3 tasks are implemented.
