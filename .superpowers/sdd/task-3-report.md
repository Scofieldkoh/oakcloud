# Task 3 Report

## Status

Complete. Tenant-scoped Task Pipeline and Task HTTP APIs, validated list
queries and transitions, public client types, stage detail resolution, and
TanStack Query hooks are implemented.

## Commits

- `f9316dc` — `feat(tasks): add task APIs and query hooks`

## Files

- `src/app/api/task-pipelines/route.ts`
- `src/app/api/task-pipelines/[id]/route.ts`
- `src/app/api/task-pipelines/[id]/duplicate/route.ts`
- `src/app/api/tasks/route.ts`
- `src/app/api/tasks/[id]/route.ts`
- `src/app/api/tasks/[id]/status/route.ts`
- `src/app/api/tasks/[taskId]/stages/[stageId]/route.ts`
- `src/app/api/tasks/[taskId]/stages/[stageId]/transition/route.ts`
- `src/hooks/use-task-pipelines.ts`
- `src/hooks/use-tasks.ts`
- `src/lib/validations/task-api.ts`
- `src/services/tasks/task.service.ts`
- `src/services/tasks/stage.service.ts`
- `src/services/tasks/types.ts`
- `__tests__/api/tasks-api.test.ts`
- `__tests__/hooks/task-hooks.test.tsx`

## Observed Red Failures

1. `npx.cmd vitest run __tests__/api/tasks-api.test.ts`
   - Failed resolving the missing `@/app/api/task-pipelines/route` module.
2. `npx.cmd vitest run __tests__/hooks/task-hooks.test.tsx`
   - Failed resolving the missing `@/hooks/use-task-pipelines` module.
3. `npx.cmd vitest run __tests__/api/tasks-api.test.ts -t "rejects checklist updates outside"`
   - Returned 200 instead of 404 when a valid checklist item UUID belonged to
     a different stage. The transition route now verifies membership in the
     tenant-scoped route stage before mutation.

## Green Commands and Results

- `npx.cmd vitest run __tests__/api/tasks-api.test.ts __tests__/hooks/task-hooks.test.tsx`
  - 2 test files passed; 15 tests passed.
- Focused ESLint over the new API routes, hooks, validation, service changes,
  public types, and focused tests
  - Exit 0 with no warnings.
- `npx.cmd tsc --noEmit --pretty false`
  - Exit 0.
- `git diff --check`
  - Exit 0.

## Self-review

- Every route requires authentication and derives tenant scope exclusively
  from the authenticated session. Caller-supplied tenant IDs are ignored.
- No new Tasks/Pipelines RBAC resource was introduced. Company, Document, and
  E-signing permissions remain owned by their adapters and workspaces.
- Task search supports query, pipeline, company, owner, status, due bucket,
  pagination, and sorting. Due-bucket SQL predicates contain explicit date
  bounds, so `NULL` due dates cannot match.
- Route bodies and query strings are parsed through Zod before service calls.
- Nested task/stage routes verify the stage belongs to the task in the URL;
  checklist transitions additionally verify checklist ownership.
- Stage detail returns adapter blockers, launch context, and an authoritative
  outcome summary without inventing duplicate module records.
- Query hooks use scoped key factories. Mutations invalidate only affected
  lists, details, and stage keys.
- No compatibility route was added under `/api/workflow`.

## Concerns

- Due buckets use the server workspace runtime's local day boundary, matching
  the existing application convention. A future per-workspace timezone
  setting would require passing an explicit timezone into task search.
- The focused route tests mock domain services. Task 2's existing service
  suites remain the authoritative coverage for mutations; a live PostgreSQL
  list-filter integration test was outside this task's focused test scope.

## Review Contract Hardening

Review fixes are included in `fix(tasks): align task API contracts`.

### Review Red Evidence

- Expanded focused run:
  `npx.cmd vitest run __tests__/api/tasks-api.test.ts __tests__/hooks/task-hooks.test.tsx __tests__/services/task-search.service.test.ts __tests__/services/task-public-types.test.ts`
  - API tests failed for raw archive responses, permissive
    `includeArchived`, exposed method aliases, raw stage PATCH response, and
    missing path UUID validation.
  - Hook tests failed because task metadata updates did not invalidate the
    task's stage-detail prefix.
- `npx.cmd tsc --noEmit --pretty false`
  - Failed because `ArchiveResult`, `TaskLaunchContext`, and the task stage
    prefix key were not yet exported.
- Focused cross-stage checklist regression:
  - Previously observed 200 instead of 404 and retained as a green contract
    alongside the expanded validation cases.

### Review Green Evidence

- `npx.cmd vitest run __tests__/api/tasks-api.test.ts __tests__/hooks/task-hooks.test.tsx __tests__/services/task-search.service.test.ts __tests__/services/task-public-types.test.ts`
  - 4 test files passed; 34 tests passed.
- `npx.cmd tsc --noEmit --pretty false`
  - Exit 0.
- Focused ESLint over the reviewed API routes, hooks, validation, public
  types, and four focused test files
  - Exit 0 with no warnings.
- `git diff --check`
  - Exit 0.

### Review Self-review

- Stage PATCH now performs the mutation and then re-queries the canonical
  `TaskStageDetail`; the hook caches that refreshed detail.
- Archive endpoints and hooks share the truthful minimal
  `{ id, archived: true }` DTO and only invalidate existing cache entries.
- Task metadata updates invalidate all stage detail queries for the task so a
  changed company refreshes action blockers and launch links.
- `includeArchived`, every path UUID, and nested checklist IDs are validated
  before service calls.
- Unapproved pipeline `PUT` and task-status `PATCH` aliases were removed.
- Launch context is the exact `TaskLaunchContext` public interface.
- Direct `searchTasks` tests cover all due buckets, null-excluding bounded
  date predicates, relation/text filters, relation sorting, and pagination.
