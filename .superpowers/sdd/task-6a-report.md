# Task 6A report — core Tasks workspace UI

## Status

Complete. Task 6A adds the `/tasks` workspace, reusable responsive task components, focused component/route/service coverage, and the minimal stage timestamp DTO extension. Task 6B remains intentionally untouched: no Sidebar change and no legacy Workflow deletion.

## Files

### Production

- `src/app/(dashboard)/tasks/page.tsx`
- `src/components/tasks/task-workspace.tsx`
- `src/components/tasks/task-filters.tsx`
- `src/components/tasks/task-list.tsx`
- `src/components/tasks/task-form-modal.tsx`
- `src/components/tasks/task-stage-pipeline.tsx`
- `src/components/tasks/task-stage-modal.tsx`
- `src/services/tasks/types.ts`
- `src/services/tasks/stage.service.ts`

### Tasks API route consistency

- `src/app/api/tasks/[id]/route.ts` → `src/app/api/tasks/[taskId]/route.ts`
- `src/app/api/tasks/[id]/status/route.ts` → `src/app/api/tasks/[taskId]/status/route.ts`

The rename keeps all nested Tasks API routes under one Next.js dynamic segment name and removes the route-collection conflict with `[taskId]/stages`.

### Tests

- `src/components/tasks/__tests__/task-workspace-contract.test.ts`
- `src/components/tasks/__tests__/task-components.test.tsx`
- `src/components/tasks/__tests__/task-workspace.test.tsx`
- `src/app/(dashboard)/tasks/__tests__/page.test.tsx`
- `src/services/tasks/__tests__/stage-detail-timestamps.test.ts`
- `src/app/api/tasks/__tests__/route-segments.test.ts`
- `__tests__/api/tasks-api.test.ts` (updated imports/params for `[taskId]`)

## TDD evidence

### RED

- Scaffold/timestamp batch: 3/3 assertions failed for the five missing component surfaces, missing `/tasks` route, and `Date` rather than ISO stage timestamps.
- Component batch: 9/9 tests failed against minimal scaffolds for missing table/card/action roles, stage controls, filters, form validation, and stage modal behavior.
- Workspace batch: 5/5 tests failed against the workspace scaffold for missing navigation, filters, mutations, confirmation dialogs, and stage detail wiring.
- API route-shape regression: expected only `[taskId]`, received `[id]` and `[taskId]`.

### GREEN

- Focused Task 6A suite: 6 files, 19/19 tests passed.
- Directly affected Tasks API route suite: 18/18 tests passed.

## Implemented behavior

- Exact desktop column order: Company → Task → Stages → Owner → Due → Actions.
- One horizontally scrollable desktop table container; stage cells render the full pipeline without nested stage scrolling.
- Mobile cards preserve company, owner, due date, status, actions, and the full stage pipeline below the summary.
- Filters cover search, pipeline, company, owner, task status, and due bucket; due buckets are passed directly to the reviewed backend query contract, where undated tasks are excluded.
- Create requires only Title and a published Pipeline version. Company, Owner, Due, and Description are optional.
- Edit updates task metadata without changing the immutable live pipeline version.
- Pause/resume, confirmed cancellation, and reason-required soft deletion use the reviewed mutations and cache invalidation hooks.
- Stage details remain inspectable in any order and show status, description, assignee, checklist, notes, authoritative outcome summary, start/completion timestamps, and blockers.
- Each modal state has exactly one primary action. Blockers disable only that action.
- Existing company/document/e-signing workspaces launch through the returned `href`, with returned `taskId`/`taskStageId` context and `returnTo=/tasks`; no downstream forms are duplicated.
- Optional stages require a skip reason; required stages expose no skip action.

## Accessibility and responsive notes

- Curated Lucide outline icons use pastel status surfaces for not-started, in-progress, waiting, complete, skipped, and failed.
- Every stage control has an accessible name, native tooltip, keyboard focus ring, visible non-colour status glyph, and a minimum 44×44px mobile target.
- The centered modal uses the existing focus-trapped OakCloud modal primitive and responsive viewport sizing.
- Icon-only row actions have explicit accessible labels and titles.
- Mobile controls and cards follow the existing OakCloud responsive table pattern.

## Verification

- `npx.cmd vitest run src/components/tasks/__tests__/task-workspace-contract.test.ts src/components/tasks/__tests__/task-components.test.tsx src/components/tasks/__tests__/task-workspace.test.tsx src/services/tasks/__tests__/stage-detail-timestamps.test.ts src/app/api/tasks/__tests__/route-segments.test.ts 'src/app/(dashboard)/tasks/__tests__/page.test.tsx'`
  - Passed: 6 files, 19 tests.
- `npx.cmd vitest run __tests__/api/tasks-api.test.ts`
  - Passed: 1 file, 18 tests.
- `npx.cmd tsc --noEmit`
  - Passed with exit code 0.
- Focused ESLint over all changed production/test files
  - Passed with exit code 0 and no warnings.
- `git diff --check`
  - Passed with no whitespace errors.
- Full suite was not run, per task scope.

## Legacy removal inventory

None in Task 6A. Legacy Workflow routes, components, hooks, services, tests, and Sidebar entries are deliberately deferred to Task 6B.

## Self-review

- Confirmed exact column ordering and no nested desktop stage scroll.
- Confirmed every configured stage remains rendered on desktop and mobile.
- Confirmed task creation does not send untouched optional metadata.
- Confirmed mutation failures remain recoverable and dialogs do not close before success.
- Confirmed task and stage mutations use reviewed hooks with synchronized query caches.
- Confirmed route rename updates production, route-shape coverage, and the existing Tasks API suite.
- Confirmed no CRM, document-generation, or e-signing form/business-rule duplication.
- Confirmed temporary visual-QA files were removed.

## Concerns / deferred acceptance

- Rendered browser acceptance is deferred by the parent to the integrated app after Task 6B/navigation. No visual-QA harness is committed.
- A direct Next.js dev boot after the route rename progressed past route collection but required a configured `DATABASE_URL`; the repository’s authenticated integrated runtime is outside this bounded component task.

## Commit

This report is included in the Task 6A commit; the final commit hash is returned in the handoff.
