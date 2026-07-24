# Task 4 Report: Authoritative module integrations

## Status

Complete. Implementation commit: `575b83d`.

## Files

- Added `src/services/tasks/integration.service.ts`
- Updated `src/services/tasks/index.ts`
- Updated Company and BizFile creation entry points
- Updated generated-document and generation-session creation entry points
- Updated document finalize and unfinalize lifecycle services
- Updated E-signing envelope create, send, void, expiry, signature completion, and decline entry points
- Added `__tests__/services/task-module-integrations.test.ts`
- Extended `__tests__/api/bizfile-confirm-route.test.ts`

## Red / green evidence

- RED 1: focused integration test failed because
  `@/services/tasks/integration.service` did not exist.
- GREEN 1: 7 service contract tests passed after the minimal integration service
  was added.
- RED 2: 3 callback-contract tests failed because Company/BizFile, document, and
  E-signing entry points did not yet link or reconcile task outcomes.
- GREEN 2: all 10 integration contract tests passed after callbacks were added.
- RED 3: invalid optional BizFile task context returned 500 instead of 400.
- GREEN 3: the focused BizFile route suite passed after mapping Zod validation
  failures to a 400 response.

Final focused verification:

- `npm.cmd run test:run -- __tests__/services/task-module-integrations.test.ts __tests__/api/bizfile-confirm-route.test.ts __tests__/api/generated-document-generation-sessions-route.test.ts __tests__/api/generated-documents-workspace.test.ts __tests__/services/document-generator.service.test.ts __tests__/services/esigning-email-delivery.test.ts __tests__/api/esigning-document-conversion-route.test.ts`
  - 7 files passed
  - 60 tests passed
- `npx.cmd tsc --noEmit` passed.
- Focused ESLint over all changed production and test files passed.
- `git diff --check` passed.
- The full suite was intentionally not run, per user instruction.

## Compatibility verification

- `parseTaskLaunchContext(undefined)` returns `undefined`.
- Existing payload schemas and service arguments are unchanged when context is
  absent.
- Existing generated-document, generation-session, BizFile, and Company route
  tests passed without task context.
- The authoritative Company, GeneratedDocument, and EsigningEnvelope remain the
  only business records; Tasks stores relational outcome links only.
- Tenant/task/stage ownership is checked before linking an outcome.

## Self-review

- The task context schema is strict and rejects invalid UUIDs and extra fields.
- Reconciliation finds all linked stages by authoritative record ID and tenant.
- E-signing can obtain the nearest preceding finalized generated-document
  outcome as its default while explicit eligible document selection remains
  available to the E-signing workspace.
- Lifecycle callbacks run only after the authoritative mutation succeeds.
- No task forms or business rules were duplicated in the Tasks module.

## Concerns

- The existing stage reconciliation path still needs explicit handling for a
  `TaskStageOutcome` whose foreign key becomes null through `onDelete: SetNull`;
  that deletion-attention behavior is part of the broader plan but was not
  introduced in this module-callback slice.
- Frontend workspaces still need to carry `taskContext` from launch URLs into
  their request payloads; that belongs to the upcoming workspace/UI slice.
