# Task 2 Report

## Status

Complete. Domain services, validation contracts, status derivation, immutable
pipeline version publishing, task snapshots, stage mutations, outcome
reconciliation, and the action registry are implemented.

## Commits

- `262f077` — `feat: add modular task domain services`
- Report — follow-up report-only commit

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
