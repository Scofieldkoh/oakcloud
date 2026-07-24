# Task 4 Report: Authoritative module integrations

## Status

Complete. Implementation commits: `575b83d`, `0e26b0b`.

## Files

- Added `src/services/tasks/integration.service.ts`
- Updated `src/services/tasks/index.ts`
- Updated Company and BizFile creation entry points
- Updated generated-document and generation-session creation entry points
- Updated document finalize and unfinalize lifecycle services
- Updated E-signing envelope create, send, void, expiry, signature completion, and decline entry points
- Updated task-stage outcome reconciliation and authoritative deletion handling
- Added `__tests__/services/task-module-integrations.test.ts`
- Extended `__tests__/api/bizfile-confirm-route.test.ts`
- Extended `__tests__/services/task-stage-registry.test.ts`

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
- RED 4: review tests exposed post-commit callback failures that could mask
  successful business mutations, missing task-company synchronization, missing
  E-sign document import, and unreadable SetNull outcomes.
- GREEN 4: action-aware preflight, safe logged callbacks, atomic company sync,
  finalized-document import, and deletion recovery passed the focused suites.
- RED 5: invalid and soft-deleted authoritative outcomes returned stale state or
  threw during detail/reconciliation.
- GREEN 5: both null-FK and soft-delete paths now return and persist FAILED
  attention state without breaking stage detail.

Final focused verification:

- `npm.cmd run test:run -- __tests__/services/task-stage-registry.test.ts __tests__/services/task-module-integrations.test.ts __tests__/api/bizfile-confirm-route.test.ts __tests__/api/generated-document-generation-sessions-route.test.ts __tests__/api/generated-documents-workspace.test.ts __tests__/services/document-generator.service.test.ts __tests__/services/esigning-email-delivery.test.ts __tests__/api/esigning-document-conversion-route.test.ts`
  - 8 files passed
  - 82 tests passed
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
- Context and expected action are preflighted before an authoritative write.
- Post-commit task link/reconcile failures are logged and isolated from the
  successful Company, Document, or E-signing operation.
- The already-completed BizFile branch can repair a missed task outcome link.

## Self-review

- The task context schema is strict and rejects invalid UUIDs and extra fields.
- Reconciliation finds all linked stages by authoritative record ID and tenant.
- E-signing imports the nearest preceding finalized generated document by
  default; an alternate must be a finalized, non-deleted document in the same
  tenant.
- Linking a Company outcome updates `Task.companyId` in the same transaction.
- Lifecycle callbacks run only after the authoritative mutation succeeds.
- Soft-deleted and SetNull outcomes reconcile to FAILED and remain readable.
- No task forms or business rules were duplicated in the Tasks module.

## Concerns

- Frontend workspaces still need to carry `taskContext` from launch URLs into
  their request payloads; that belongs to the upcoming workspace/UI slice.
