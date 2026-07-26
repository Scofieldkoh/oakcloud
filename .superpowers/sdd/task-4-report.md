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
- RED 6: 3 focused review contracts exposed non-durable post-creation
  callbacks, missing document-read authorization before E-sign import, and
  missing Company lifecycle/E-sign failure compensation.
- GREEN 6: creation records now persist recovery context, stage reads repair
  missed links and reconcile authoritative status, Company delete/restore/hard
  delete reconcile linked tasks, and failed E-sign imports delete their draft.
- RED 7: focused BizFile tests showed that neither the Company upsert create
  branch nor its existing-company update branch stored the validated task
  context needed by stage-read recovery.
- GREEN 7: `processBizFileExtraction` now writes the optional context into both
  Company upsert branches atomically, while no-context confirmations retain
  their existing service call and completed confirmations retain idempotency.
- RED 8: concurrent task A/task B BizFile confirmations for the same existing
  Company had no durable per-stage association, and duplicate requests had no
  unique recovery key.
- GREEN 8: a dedicated `TaskCompanyRecoveryContext` relation now uses a
  transactional upsert and a unique tenant/stage/Company key. Each task
  recovers independently, duplicate requests converge, and legacy single-object
  Company context remains a stage-read fallback.
- RED 9: the recovery key still allowed one task stage to retain multiple
  Companies, making a same-stage retry ambiguous, and recovery did not
  explicitly verify Task ownership.
- GREEN 9: recovery is now uniquely keyed by tenant and task stage. Retrying
  with another Company deterministically replaces the authoritative association;
  Task, tenant, stage, action, and Company ownership are checked during recovery,
  while distinct stages and duplicate requests remain independent/idempotent.
- RED 10: a delayed Company A callback could still overwrite Company B after
  B became the stage-authoritative recovery association.
- GREEN 10: Company outcome linking now locks the durable recovery row inside
  the outcome transaction and treats a mismatched callback as stale before any
  outcome, Task company, stage status, or audit write. Manual links without a
  recovery row and matching/idempotent callbacks retain existing behavior.
- RED 11: when a newer Company recovery association existed but its callback
  failed, stage reads kept reconciling the older stored Company outcome.
- GREEN 11: Company stage reads now lock Task then recovery, replace a stale
  stored outcome, synchronize `Task.companyId`, derive and persist stage/task
  status, and then perform normal reconciliation. Matching/no-recovery manual
  outcomes remain unchanged; soft-deleted recovered Companies persist FAILED.
- RED 12: hard-deleting the current recovery Company cascaded away the recovery
  association, allowing an older/no outcome to lose authoritative deletion
  evidence.
- GREEN 12: Company deletion now leaves a nullable recovery tombstone through
  `onDelete: SetNull`. Recovery-only stages are captured before hard delete;
  detail/reconciliation clears stale outcomes and Task company, persists FAILED
  attention across reads, and a later Company recovery replaces the tombstone.
- RED 13: hard-delete reconciliation dropped the deleter user ID before
  tombstone synchronization and follow-up reconciliation audit events.
- GREEN 13: stage detail accepts an optional actor and propagates it through
  synchronization and reconciliation. Hard-delete callbacks pass the deleter;
  ordinary detail reads remain backward-compatible with system/undefined actor.

Final focused verification:

- `npm.cmd run test:run -- __tests__/services/task-stage-registry.test.ts __tests__/services/task-module-integrations.test.ts __tests__/api/bizfile-confirm-route.test.ts __tests__/api/generated-document-generation-sessions-route.test.ts __tests__/api/generated-documents-workspace.test.ts __tests__/services/document-generator.service.test.ts __tests__/services/esigning-email-delivery.test.ts __tests__/api/esigning-document-conversion-route.test.ts`
  - 8 files passed
- 85 tests passed
- `npx.cmd tsc --noEmit` passed.
- Focused ESLint over all changed production and test files passed.
- `git diff --check` passed.
- The full suite was intentionally not run, per user instruction.

Final BizFile review verification:

- 3 covering files passed with 41 tests.
- `npx.cmd tsc --noEmit` passed.
- Focused ESLint and `git diff --check` passed.

Final multi-context review verification:

- 4 covering files passed with 62 tests.
- Prisma Client generation and `npx.cmd tsc --noEmit` passed.
- Focused ESLint and `git diff --check` passed.

Final singular-stage ownership verification:

- 4 covering files passed with 64 tests.
- Prisma Client generation and `npx.cmd tsc --noEmit` passed.
- Focused ESLint and `git diff --check` passed.

Final stale-callback race verification:

- 4 covering files passed with 67 tests.
- `npx.cmd tsc --noEmit` passed.
- Focused ESLint and `git diff --check` passed.

Final existing-outcome self-heal verification:

- 4 covering files passed with 70 tests.
- `npx.cmd tsc --noEmit` passed.
- Focused ESLint and `git diff --check` passed.

Final hard-delete tombstone verification:

- 4 covering files passed with 73 tests.
- Prisma Client generation and `npx.cmd tsc --noEmit` passed.
- Focused ESLint and `git diff --check` passed.

Final deletion-actor audit verification:

- 4 covering files passed with 75 tests.
- `npx.cmd tsc --noEmit` passed.
- Focused ESLint and `git diff --check` passed.

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
- BizFile create and existing-company update flows persist recovery context in
  the same transaction as the authoritative Company mutation.

## Self-review

- The task context schema is strict and rejects invalid UUIDs and extra fields.
- Reconciliation finds all linked stages by authoritative record ID and tenant.
- E-signing imports the nearest preceding finalized generated document by
  default; an alternate must be a finalized, non-deleted document in the same
  tenant.
- Linking a Company outcome updates `Task.companyId` in the same transaction.
- Lifecycle callbacks run only after the authoritative mutation succeeds.
- Soft-deleted and SetNull outcomes reconcile to FAILED and remain readable.
- Missed best-effort creation callbacks self-heal from durable context stored on
  the authoritative Company, GeneratedDocument, or EsigningEnvelope.
- E-sign document imports require authoritative document-read permission and
  compensate failed uploads by deleting the newly-created draft envelope.
- No task forms or business rules were duplicated in the Tasks module.

## Concerns

- Frontend workspaces still need to carry `taskContext` from launch URLs into
  their request payloads; that belongs to the upcoming workspace/UI slice.
