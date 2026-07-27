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

## Review-fix follow-up

Status: complete. The original Task 5 implementation is commit `8fd250f`; the
follow-up fixes are in the commit containing this report update.

### Files changed

- `src/components/tasks/pipelines/pipeline-builder.tsx`
- `src/components/tasks/pipelines/pipeline-list.tsx`
- `src/components/tasks/pipelines/pipeline-workspace.tsx`
- `src/components/tasks/__tests__/pipeline-workspace.test.tsx`
- `.superpowers/sdd/task-5-report.md`

### Changes

- Preserved action-specific configuration when switching adapters and added the
  Company Profile and E-signing configuration controls.
- Routed saves through the full pipeline schema, added adapter-type validation,
  and mapped name, description, icon, checklist, template, and E-signing
  failures to stage-specific messages.
- Disabled native constraint short-circuiting with `noValidate`, so the
  accessible application error summary always receives the full definition.
- Wired the dnd-kit activator ref and verified the real KeyboardSensor flow,
  including its asynchronous listener setup and the component's `onDragEnd`.
- Added recoverable, dismissible create/update/duplicate/archive error alerts;
  archive failures keep the confirmation dialog open for retry, and duplicate
  pending state disables the triggering control.
- Contained rejected async save callbacks so hook-owned mutation error state is
  rendered without unhandled promise rejections.

### RED / GREEN evidence

- Initial focused run: `6` builder/list tests, `2` failed. Keyboard reorder did
  not occur when arrow input was sent before dnd-kit's deferred keyboard
  listener attached; the max-length test never submitted because native
  `min=1` validation blocked React `onSubmit`.
- Expanded workspace run: `17` tests, `3` failed with `2` unhandled rejections.
  Missing behavior was duplicate/archive error UI plus rejected create/update
  callback containment.
- Validation self-review RED: the focused schema-sized failure test failed on
  generic icon/checklist messages and missing malformed adapter-config messages.
- GREEN: the focused component file passed `18/18`; directly affected component
  and route coverage passed `3` files and `21/21` tests without warnings.

### Final verification

- `npm.cmd run test:run -- src/components/tasks/__tests__/pipeline-workspace.test.tsx src/components/tasks/__tests__/pipeline-routes.test.ts "src/app/(dashboard)/pipelines/__tests__/pipeline-routes.test.tsx"` passed: `3` files, `21` tests.
- `npx.cmd tsc --noEmit` passed.
- Focused ESLint for the changed pipeline components and component test passed.
- `git diff --check` passed.
- The full suite was intentionally not run, per the Task 5 instruction.

### Accessibility, responsive behavior, and self-review

- Errors use `role="alert"` and can be dismissed and retried; loading surfaces
  use `role="status"`; all mutation and drag controls retain accessible names.
- Keyboard reorder uses Space, arrow keys, and Space through the actual sensor,
  while existing touch-friendly move controls remain available.
- Existing mobile-first single-column cards/forms, `sm` two-column fields,
  theme tokens, and minimum mobile touch targets were preserved.
- Self-review confirmed payload positions follow the reordered stage array,
  inactive adapter configs are not submitted, archive dialogs close only after
  success, and successful create/update navigation occurs only after mutation
  resolution.
- No Task 6 files, routes, or behavior were changed. Rendered browser QA was not
  added because this follow-up was scoped to focused component/static checks.
