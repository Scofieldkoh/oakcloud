# Task 5 report: Pipelines workspace

## Status

Completed the shared Pipelines workspace with list, create, and edit routes, reusable pipeline list/builder components, immutable-version save payloads, optional document-template defaults, and archive/duplicate actions.

## Files

- `src/app/(dashboard)/pipelines/page.tsx`
- `src/app/(dashboard)/pipelines/new/page.tsx`
- `src/app/(dashboard)/pipelines/[id]/page.tsx`
- `src/components/tasks/pipelines/pipeline-list.tsx`
- `src/components/tasks/pipelines/pipeline-builder.tsx`
- `src/components/tasks/pipelines/pipeline-workspace.tsx`
- `src/components/tasks/__tests__/pipeline-workspace.test.tsx`
- `src/components/tasks/__tests__/pipeline-routes.test.ts`
- `src/app/(dashboard)/pipelines/__tests__/pipeline-routes.test.tsx`

## TDD evidence

- RED: `npx.cmd vitest run src/components/tasks/__tests__/pipeline-workspace.test.tsx` ran three assertion-level tests against compileable skeletons; all failed for absent Create pipeline, Optional/required stage, and Save pipeline controls.
- GREEN: the same focused command passed `3/3` tests after implementation.
- Route correction RED: the edit-route contract failed because it used synchronous params instead of the Next.js 15 `Promise<{ id: string }>` contract.
- Final GREEN: three focused files passed `6/6` tests, including rendered list/new/edit routes.

## Verification

- `npx.cmd tsc --noEmit` passed.
- Focused ESLint for the pipeline components, tests, and routes passed.
- `git diff --check` passed.

## Accessibility and responsive notes

- Uses semantic list/article/form structures, visible focus treatment, labelled form fields, accessible icon buttons, status/error messaging, and keyboard-operable DnD through `@dnd-kit` plus explicit move controls.
- Cards and form fields use mobile-first single-column layouts and OakCloud minimum touch target button variants. Styling uses theme-aware OakCloud tokens.

## Self-review and concerns

- Reviewed create/edit/list loading, empty, and error states; archive requires a reason; saves use the existing create/update hooks so the reviewed service retains version/snapshot semantics.
- Document templates are loaded from the existing API as an optional enhancement; a failed template lookup leaves the stage usable without a default template.
- No `/tasks` workspace or stage-detail modal was added.
