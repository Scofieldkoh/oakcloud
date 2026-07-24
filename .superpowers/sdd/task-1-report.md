# Task 1 Report

Status: DONE

## Commits

- `9a3c293 feat(tasks): replace legacy workflow schema`
- `4fd7304 fix(tasks): enforce immutable task snapshots`
- `74b3bc1 fix(tasks): lock published pipeline structures`

## TDD evidence

- RED: `npx.cmd vitest run __tests__/services/task-schema-reset.test.ts`
- Observed: 3 of 17 tests failed for the expected missing immutable migration guards and `BLOCKED`/`WAITING` status mismatch before production edits.
- RED (lifecycle follow-up): `npx.cmd vitest run __tests__/services/task-schema-reset.test.ts`
- Observed: 3 of 17 tests failed for the expected missing `publishedAt`/`snapshotLockedAt` fields and publication/snapshot INSERT/DELETE guard coverage before lifecycle-lock edits.
- GREEN: `npx.cmd vitest run __tests__/services/task-schema-reset.test.ts __tests__/services/contact-duplicate.service.test.ts __tests__/services/contact-merge.service.test.ts`
- Result: 3 files passed, 53 tests passed.

## Prisma evidence

- `npx.cmd prisma validate` with a schema-only dummy local PostgreSQL URL: passed.
- `npm.cmd run db:generate`: passed; Prisma Client 7.2.0 generated successfully.

## Delivered

- Removed every legacy `workflow_*` schema model, enum, relation, and generated model.
- Added the seven approved Task/Pipeline models and four enums.
- Added destructive reset migration dropping the legacy module and creating the new relational task schema.
- Removed obsolete workflow-specific contact duplicate/merge counts, moves, and test expectations.
- Regenerated Prisma client sources.
- Added and passed the schema reset contract tests.
- Replaced `TaskStageStatus.BLOCKED` with `WAITING` in the schema, migration, and regenerated Prisma client.
- Added PostgreSQL lifecycle guards: unpublished pipeline versions remain editable until one-way publication, then pipeline version/stage INSERT/UPDATE/DELETE mutations are rejected; unlocked tasks may assemble stages/checklists until one-way snapshot locking, then structural INSERT/UPDATE/DELETE mutations and pipeline-version reassignment are rejected while operational updates remain editable.

## Follow-up files changed

- `__tests__/services/task-schema-reset.test.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260724090000_modular_tasks_reset/migration.sql`
- `src/generated/prisma/enums.ts`
- `src/generated/prisma/internal/class.ts`
- `src/generated/prisma/internal/prismaNamespace.ts`
- `src/generated/prisma/internal/prismaNamespaceBrowser.ts`
- `src/generated/prisma/models/Task.ts`
- `src/generated/prisma/models/TaskPipelineVersion.ts`
- `.superpowers/sdd/task-1-report.md`

## Self-review and concerns

- Reviewed the focused diff and `git diff --check`; no whitespace errors were reported.
- The database-level lifecycle guards are intentionally included in the destructive reset migration so this new task module is protected from its first deployment.
- No concerns remain for the scoped schema/contact task.
