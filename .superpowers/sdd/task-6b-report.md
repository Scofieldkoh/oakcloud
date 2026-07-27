# Task 6B report: legacy Workflow UI reset and navigation

## Implementation

- Promoted **Tasks** (`/tasks`) and **Pipelines** (`/pipelines`) to top-level sidebar destinations.
- Removed the Workflow navigation group and its Projects, Tasks, and Templates links.
- Removed the legacy Workflow dashboard and API route trees, Workflow components, project hooks, and project service.
- Added focused cutover contracts for the rendered sidebar and for absence of the retired route/source surface and imports.
- Kept unrelated document-generation and duplicate-detection uses of the plain-English term “workflow” intact.

## TDD evidence

1. Added the two focused contracts before changing the sidebar or deleting legacy files.
2. RED: `npx.cmd vitest run __tests__/components/sidebar-task-destinations.test.tsx __tests__/services/legacy-workflow-surface-removed.test.ts`
   failed as expected: Tasks/Pipelines links were absent, the Workflow group remained, all six retired surface paths existed, and the source audit reported 12 legacy-reference files.
3. GREEN: removed the specified legacy surface and updated the sidebar; the same focused command passed 3/3 tests.

## Verification

- `npx.cmd vitest run __tests__/components/sidebar-task-destinations.test.tsx __tests__/services/legacy-workflow-surface-removed.test.ts` — passed (3 tests).
- `npx.cmd tsc --noEmit` — passed. The first invocation found only stale `.next/types/validator.ts` entries for deleted routes; after removing the verified generated `.next/types` cache, the rerun passed. No Prisma/schema artifact was changed.
- `npx.cmd eslint src/components/ui/sidebar.tsx __tests__/components/sidebar-task-destinations.test.tsx __tests__/services/legacy-workflow-surface-removed.test.ts` — passed with no diagnostics.
- `git diff --check` — passed.
- Focused reference audit — no remaining imports or route targets for `components/workflow`, `use-workflow-project*`, `workflow-project.service`, `/api/workflow`, or `/workflow/` outside the cutover contract itself.

## Self-review

- Sidebar entries are ungrouped, use existing compact navigation styling, and preserve all new Tasks/Pipelines behavior.
- The absence test excludes itself so its explicit legacy patterns do not create a false positive.
- Only Task 6B tracked files and this report are staged; shared SDD scratch artifacts remain untouched.

## Fix round 1: orphaned AI helpbot Workflow Project scope

- Reviewer finding: `aiContextSnapshotSchema.scope` still exposed the legacy `workflowProjectId` field.
- RED: extended the legacy-surface source-reference contract with the case-sensitive word-boundary match `\bworkflowProjectId\b`; `npx.cmd vitest run __tests__/services/legacy-workflow-surface-removed.test.ts` failed only on `src/lib/validations/ai-helpbot.ts`.
- GREEN: removed the field from `aiContextSnapshotSchema.scope`; the directly covering test passed (2 tests).
- A focused repository search found no directly coupled source or test expectation to update.
