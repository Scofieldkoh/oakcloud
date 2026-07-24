# Task 2 Report

## Status

Complete. Domain services, validation contracts, status derivation, immutable
pipeline version publishing, task snapshots, stage mutations, outcome
reconciliation, and the action registry are implemented.

## Commits

- `262f077` — `feat: add modular task domain services`
- `43e1be7` — `docs: report task domain service implementation`
- `ffdd0a7` — `fix(tasks): harden task lifecycle services`
- `81e8262` — `fix(tasks): make stage reconciliation race safe`

## Files

- `src/services/tasks/types.ts`
- `src/services/tasks/status.ts`
- `src/services/tasks/pipeline.service.ts`
- `src/services/tasks/task.service.ts`
- `src/services/tasks/stage.service.ts`
- `src/services/tasks/action-registry.ts`
- `src/services/tasks/index.ts`
- `src/lib/validations/task-pipeline.ts`
- `src/lib/validations/task.ts`
- `__tests__/services/task-status.test.ts`
- `__tests__/services/task-pipeline.service.test.ts`
- `__tests__/services/task-stage-registry.test.ts`

## Observed Red Failures

1. `npx.cmd vitest run __tests__/services/task-status.test.ts`
   - Failed resolving the missing `@/services/tasks/status` module.
2. `npx.cmd vitest run __tests__/services/task-pipeline.service.test.ts`
   - Failed resolving the missing `@/services/tasks/pipeline.service` module.
3. `npx.cmd vitest run __tests__/services/task-stage-registry.test.ts`
   - Failed resolving the missing `@/services/tasks/action-registry` module.
4. `npx.cmd vitest run __tests__/services/task-pipeline.service.test.ts`
   - The duplicate-pipeline regression failed because checklist definitions
     were replaced by an empty array. The implementation was corrected to
     preserve and normalize the source version's checklist definitions.

## Green Commands and Results

- `npx.cmd vitest run __tests__/services/task-status.test.ts`
  - 5 tests passed.
- `npx.cmd vitest run __tests__/services/task-pipeline.service.test.ts`
  - 5 tests passed.
- `npx.cmd vitest run __tests__/services/task-stage-registry.test.ts`
  - 7 tests passed.
- Final focused verification:
  `npx.cmd vitest run __tests__/services/task-status.test.ts __tests__/services/task-pipeline.service.test.ts __tests__/services/task-stage-registry.test.ts`
  - 3 test files passed; 17 tests passed.
- `npx.cmd tsc --noEmit --pretty false`
  - Exit 0.
- Focused ESLint over the new service, validation, and test files
  - Exit 0 with no warnings.
- `git diff --check`
  - Exit 0.

## Final Reconciliation Hardening

Commit `81e8262` makes detail self-healing race-safe:

- Reconciliation first reads only the tenant-scoped stage `taskId`.
- It locks the parent task row before loading the full stage and outcome.
- It reloads the stage/outcome after the lock and rejects an unexpected parent
  change.
- MANUAL stages are excluded from authoritative outcome reconciliation and
  return their current stage/task status without writes or audit noise.

### Final Red Evidence

`npx.cmd vitest run __tests__/services/task-stage-registry.test.ts -t "reloads the stage|leaves completed MANUAL"`

- 2 tests failed.
- The stale pre-lock generated-document link returned `IN_PROGRESS` instead of
  the post-lock current link's `COMPLETED`.
- A completed MANUAL stage was demoted to `NOT_STARTED` by outcome self-healing.

### Final Green Evidence

- The same two focused regressions passed.
- Full stage/registry file: 16 tests passed.
- Final focused verification:
  `npx.cmd vitest run __tests__/services/task-status.test.ts __tests__/services/task-pipeline.service.test.ts __tests__/services/task-stage-registry.test.ts`
  - 3 files passed; 27 tests passed.
- `npx.cmd tsc --noEmit --pretty false`
  - Exit 0.
- Focused ESLint over task services, task validations, and the three service
  test files
  - Exit 0 with no warnings.
- `git diff --check`
  - Exit 0.

## Self-review

- Confirmed tenant filters on pipeline, task, stage, checklist, and authoritative
  outcome lookups.
- Confirmed pipeline versions are created with `publishedAt: null`, stage rows
  are inserted, and `publishedAt` is set once afterward.
- Confirmed tasks are created with `snapshotLockedAt: null`, live stages and
  checklist rows are inserted, and `snapshotLockedAt` is set once afterward.
- Confirmed generated Prisma enum/model names are used and task stage logic uses
  `WAITING`, never `BLOCKED`.
- Confirmed mutations use the existing `createAuditLog` helper, including the
  active transaction client.
- Confirmed outcome links enforce adapter/type matching, exactly one entity,
  tenant ownership, and authoritative record existence before reconciliation.
- Confirmed the registry behavior for linked companies, finalized generated
  documents, required signatures, and declined/expired/voided E-signing
  outcomes.

## Concerns

- The Task 1 schema has no dedicated table for pipeline checklist definitions.
  Definitions are therefore stored as typed `actionConfig.checklistItems` and
  copied into `TaskStageChecklistItem` rows during task creation.
- Trigger ordering is covered by focused transaction call-order tests. A live
  PostgreSQL integration test was intentionally not added or run within this
  focused task scope.

## Review Hardening

The review fixes in `ffdd0a7` add:

- Manual completion/reopening guards that reject integrated stage actions.
- A shared tenant-scoped task row lock using the safe tagged
  `tx.$queryRaw(Prisma.sql\`...\`)` API and `SELECT ... FOR UPDATE`.
- Serialized status derivation for every stage mutation/reconciliation and
  task pause/resume/cancel mutation.
- Pause/resume/cancel transition guards, including no resume from `CANCELLED`.
- Required-stage skip rejection, optional-stage skip reasons, manual reopening,
  optional company/owner/due date/assignee validation, metadata/deletion/
  checklist coverage, and authoritative outcome reconciliation coverage.
- Tenant-scoped pipeline row locking before reading the current version number.
- Registry-specific action configuration validation before mutation.
- One persisted, re-queried pipeline detail return contract for create, update,
  and duplicate, including generated stage IDs.

### Review Red Evidence

1. Expanded lifecycle run:
   `npx.cmd vitest run __tests__/services/task-stage-registry.test.ts`
   - 14 tests ran; 7 failed for the expected missing lifecycle hardening.
   - Integrated manual completion resolved instead of rejecting.
   - Skip, reopen, assignee, checklist, and reconciliation paths did not lock
     the parent task.
   - Pause/cancel from `COMPLETED` and resume from `CANCELLED` resolved instead
     of rejecting.
   - Reconciliation returned `COMPLETED` instead of preserving a concurrently
     locked `PAUSED` override.
2. Safe lock API regression:
   `npx.cmd vitest run __tests__/services/task-stage-registry.test.ts`
   - 10 tests failed because the implementation still called
     `$queryRawUnsafe`; switching to safe tagged `$queryRaw` made the suite
     green.
3. Pipeline hardening run:
   `npx.cmd vitest run __tests__/services/task-pipeline.service.test.ts`
   - 6 tests ran; 4 failed.
   - Create/update/duplicate returned synthetic shapes rather than the
     re-queried persisted detail.
   - Update did not issue a tenant-scoped pipeline row lock before reading the
     latest version.
   - Invalid document-generation configuration reached pipeline creation.
4. Focused adapter configuration run:
   `npx.cmd vitest run __tests__/services/task-pipeline.service.test.ts -t "validates stage action configuration"`
   - 1 test failed because an invalid `templateId` reached `taskPipeline.create`.

### Review Green Evidence

- `npx.cmd vitest run __tests__/services/task-stage-registry.test.ts`
  - 14 tests passed.
- `npx.cmd vitest run __tests__/services/task-pipeline.service.test.ts`
  - 6 tests passed.
- Final focused verification:
  `npx.cmd vitest run __tests__/services/task-status.test.ts __tests__/services/task-pipeline.service.test.ts __tests__/services/task-stage-registry.test.ts`
  - 3 test files passed; 25 tests passed.
- `npx.cmd tsc --noEmit --pretty false`
  - Exit 0.
- Focused ESLint over the task services, task validation files, and three
  focused service test files
  - Exit 0 with no warnings.
- `git diff --check`
  - Exit 0.
