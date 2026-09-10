# Business Assistant — Review and Implementation Handover

> **Updated:** 2026-09-10  
> **Status:** P12 scalar correction preparation/transaction/recovery hardening has been extended through PR #20; full real-storage end-to-end correction execution and the separate independent-review quality gates remain open. The broader Business Assistant is not deployment-ready.  
> **Current integration PR:** [#20 — harden Business Assistant correction runtime and recovery](https://github.com/Scofieldkoh/oakcloud/pull/20)  
> **Current branch:** `chatgpt/business-assistant-p12-correction-runtime-20260910`  
> **Branch base:** `cde965ae0caad40c6553c67a164421be956167f0`  
> **Predecessors:** [#17 — retained-source correction hardening](https://github.com/Scofieldkoh/oakcloud/pull/17), [#16 — deterministic BizFile correction UI](https://github.com/Scofieldkoh/oakcloud/pull/16)  
> **Design:** [Business Assistant specification v1.4-review](../features/business-assistant/SPECIFICATION.md)  
> **Correction workflow:** [Business Assistant BizFile Correction Workflow](../features/business-assistant/CORRECTION_WORKFLOW.md)

This is the current implementation handover. Business Assistant is the **general Oakcloud assistant product**. BizFile remains a registered reference capability behind its capability/application boundary; documents, companies, imports, or source review must not become generic-core requirements.

The earlier long-form review narrative remains available in Git history at the pre-consolidation plan blob `5ceeff0cd020daf736688224e3fac0e629905502`. PR #20 is a parallel P12 workstream only. It does not merge to `main`, enable provider/mutation dispatch, deploy, run production migrations, or mutate production storage.

## Start here next session

Read, in this order:

1. `AGENTS.md`
2. `docs/features/business-assistant/SPECIFICATION.md`
3. this handover
4. `docs/features/business-assistant/CORRECTION_WORKFLOW.md`
5. applicable RBAC, service, design, staging, API, database, storage, and environment references before changing those surfaces

Do not weaken exact approval, operation identity, immutable evidence, fresh authorization, recovery fencing, or module-neutrality merely because CI passes.

## Current P12 correction checkpoint

### Deterministic scalar correction UI — completed in PR #16

`POST /api/business-assistant/runs/:id/corrections` remains the generic correction-preparation endpoint. The run-review UI exposes correction only for the latest review on a committed BizFile item in a backend-correctable lifecycle. The UI submits immutable independent-review `expected` values for allowlisted factual findings; it does not accept arbitrary replacements.

A correction creates a **new linked run/item/proposal**. It never edits the historical operation, receipt, approval, review, or evidence. Normal confirmation is required before the new correction item receives an operation ID. Collection-row corrections for officers, shareholders, charges, and other arrays remain intentionally unsupported until stable row identity semantics are designed; do not extend scalar paths by array index.

### Retained-source prefetch boundary — completed in PR #17

PR #17 removed retained-source storage reads from the serializable correction write transaction. The module-neutral prefetch adapter is `src/services/business-assistant/correction-prefetch.ts`.

The generic correction service now performs an advisory preflight, invokes capability-owned prefetch outside the write transaction when required, and binds the prefetched evidence to capability ID/version/contract. Inside the transaction it reacquires the business-operation barrier, fresh actor/workspace authority, restore/pause policy, source run, latest review/item, capability contract, and replay/conflict state.

`src/services/bizfile/application/prepare-correction.ts` keeps BizFile-specific behavior behind the BizFile application boundary. Its prefetch stage validates receipt/source/review bindings, performs fresh source/target authorization, validates the legitimate source pointer, downloads retained source objects, and verifies SHA-256 outside the serializable transaction. Transactional preparation then re-authorizes and re-reads source identity, document version, source revision, storage pointer, receipt/evidence bindings, and company aggregate revision before rebuilding the correction plan.

Prefetched evidence is evidence-only. Transaction-time state and authorization are authoritative. Source pointer/revision/version/hash, capability contract, authorization, restore state, or aggregate-revision drift fails closed.

### P12 correction transaction and recovery hardening — PR #20

PR #20 adds a correction-specific bounded serializable transaction policy without changing unrelated Business Assistant or BizFile transaction defaults:

- maximum transaction acquisition wait: **2,000 ms**;
- maximum interactive transaction runtime: **5,000 ms**;
- serializable conflict retry budget: **3 attempts**;
- only serialization conflicts are retried by the existing repository retry policy; timeout/non-serialization failures are not blindly retried.

`src/services/business-assistant/correction.service.ts` uses this bounded wrapper only for correction proposal creation. BizFile-specific mutation rules remain outside the generic service.

PR #20 also adds/extends evidence that:

- document `version` drift between prefetch and transactional revalidation fails closed;
- a legitimate-but-changed source storage pointer between prefetch and transactional revalidation fails closed;
- existing PR #17 coverage continues to reject source-revision and company aggregate-revision drift and to prove no retained-source storage download occurs inside transactional preparation;
- PostgreSQL advisory-lock waiting is observed through `pg_stat_activity`, measured against the correction runtime budget, and a bounded lock timeout leaves the transaction aborted so later statements cannot apply;
- serialization conflicts stop at the configured retry budget;
- repeated reconciliation of a durable committed BizFile operation returns the same original operation ID and receipt, with exactly one canonical receipt rather than a duplicate mutation identity; and
- the Node 24 PostgreSQL CI job explicitly executes the correction lock/timeout integration test rather than relying on an unrelated suite to discover it.

The existing durable Business Assistant worker remains responsible for exact approval, stable correction operation allocation after confirmation, canonical execution, `OUTCOME_UNKNOWN` reconciliation, required-effect continuation, read-back, and review handoff. PR #20 does not replace or bypass those canonical boundaries.

### Historical source lifecycle preservation

Existing PostgreSQL correction coverage verifies that a linked correction remains unapproved until normal confirmation, receives a new operation ID only after confirmation, and leaves the source item's original operation ID, committed lifecycle, and source review intact. PR #20 adds committed-operation reconciliation identity coverage so recovery continues the original committed operation rather than manufacturing a replacement identity.

No code in PR #20 rewrites historical source proposal, approval, receipt, review, or evidence rows.

## P12 correction work that remains open

PR #20 **does not claim the full P12 correction release gate is complete**. The following remain outstanding:

1. A single integrated **real-storage / real-BizFile correction E2E fixture** covering retained-source preparation, fresh confirmation/approval, canonical correction execution, required effects, canonical read-back, independent-review handoff, rollback/no-commit recovery, committed recovery, and preservation of the source operation lifecycle/receipt/review/approval/evidence.
2. A full transaction-bound race fixture that drives concurrent baseline/source changes through the complete correction service path. Current coverage combines transaction-bound unit stale-state checks with existing PostgreSQL aggregate/source revision tests and the new PostgreSQL lock/timeout test; that is not the same as the requested one-path full E2E proof.
3. Collection-row correction contracts with stable record identity. Array-index correction semantics remain prohibited.
4. Independent full-state/unselected-write review and reviewer-quality evaluation. This is owned by the separate P12 independent-review workstream.

Provider dispatch remains disabled unless its existing environment gate is deliberately enabled by an authorized deployment. PR #20 does not change that gate.

## Independent source review — separate P12 workstream

The current reviewer can produce explicit `REVIEWED`, `ABSENT`, `UNREADABLE`, or `UNSUPPORTED` section attestations with source SHA-256, page references, completeness, provider identity, and evidence bindings. Current factual comparison is still intentionally limited where full-state/unselected comparison is not established.

Still required by the separate reviewer workstream:

- compare unselected/full-state source differences against immutable before/after evidence;
- detect unauthorized or unexplained unselected writes;
- distinguish import-time defects, canonical mutation defects, later human edits, source drift, and insufficient evidence;
- validate section/page coverage on annotated fixtures; and
- complete held-out reviewer evaluation with declared metrics, denominators, abstention/coverage reporting, and release thresholds.

Do not infer reviewer quality from mocked tests, provider confidence, or user acceptance.

## Exact PR #20 ten-cycle review/fix/commit record

The workstream branch is based on `cde965ae0caad40c6553c67a164421be956167f0`. There are exactly ten workstream commits after that base. Cycle 1 contains implementation plus review/fix; Cycles 2–10 contain genuine review/fix work. The final commit is this Cycle-10 handover/fix commit, i.e. the current PR #20 head. Its exact SHA is recorded in GitHub PR metadata and the final delivery; a Git commit cannot embed its own final content-addressed SHA without changing that SHA.

| Cycle | Commit | Review finding / committed fix |
|---|---|---|
| 1 | `b83966ea31b5aa2a234397240692d5f0b647211c` | Added the correction-specific bounded serializable wrapper plus unit coverage for explicit `maxWait`/`timeout`, serialization retry, and non-retry of timeout-class failures. |
| 2 | `a0cc732413029ccb5c04ad9d0f7f5cbe38bcc4c3` | Review found the helper was not yet authoritative; wired `createCorrectionProposal` to the bounded wrapper without changing unrelated transactions. |
| 3 | `6bf6230443c6d8ba63c8845f50ecf819597f0e5f` | Review of stale-state coverage found document-version and legitimate-pointer races missing; added fail-closed tests for both. |
| 4 | `dcf7c87410cf6ee2f9324c78d70543af2b313a87` | Review found the correction service unit harness still mocked the old generic transaction helper; moved the harness to the correction-specific wrapper. |
| 5 | `b8a3f8ce80b4f4f4a37d9583d09e70415d2cf76d` | Added real PostgreSQL advisory-lock timing and timeout/aborted-transaction coverage for the correction boundary. |
| 6 | `34c3af9e0003151c806c4a6e6ad15230eae917a2` | Review found retry success was covered but exhaustion was not; proved conflicts stop after the configured three attempts. |
| 7 | `f3fcea9ffc64723ec31813c76f82033f22bab2ec` | Review of recovery identity found only the rollback/`NO_COMMIT` side was exercised; added repeated committed reconciliation proving one receipt and the original operation identity. |
| 8 | `b55e56fcffe6783f5851e71b6013a4eda6dd91db` | Review found timing assertions scheduler-sensitive; replaced arbitrary waiting with observed PostgreSQL advisory wait state and bound the assertion to the runtime timeout constant. |
| 9 | `ac8e6de91097a3c4d514af2637830efa8efce338` | Review found the new correction concurrency test was not actually invoked by the repository's PostgreSQL CI command; added an explicit Node 24 workflow step. |
| 10 | current PR #20 head | Final review ran the Node 24 gate and found TypeScript-only test defects: generic mocked transaction clients were not assignable to the production transaction interface, and committed reconciliation receipts were not narrowed from nullable. Fixed both test typings/narrowing, retained the final scope/handover audit, and kept full real-storage E2E plus reviewer/full-state gates explicitly open. |

No application or capability-contract version bump is required by this workstream: the external correction request/response contract is unchanged and the new behavior is internal transaction/recovery hardening plus tests/CI.

## PR #20 test coverage and verification policy

Focused coverage touched or added by this workstream:

- `__tests__/services/business-assistant-correction-transaction.test.ts`
- `__tests__/services/business-assistant-correction.test.ts`
- `__tests__/services/bizfile-correction-preparation.test.ts`
- `__tests__/integration/business-assistant-correction-concurrency.postgres.test.ts`
- `__tests__/integration/bizfile-operation-reconciliation.postgres.test.ts`

The repository-required Node 24 workflow remains the authoritative final gate. It runs:

- Node 24 runtime verification;
- lint;
- committed assistant registry freshness;
- Prisma generation;
- TypeScript typecheck;
- focused Chromium-path and Business Assistant/BizFile contract tests;
- PostgreSQL durable-worker and concurrent-authorization tests;
- PostgreSQL BizFile source revision, aggregate revision, reconciliation, and effect tests;
- the PR #20 correction lock/timeout PostgreSQL test;
- production application build with the documented 8 GB heap; and
- production image/runtime/Chromium verification.

The final PR #20 head must be green before merge. CI status is intentionally not hard-coded into this content because it runs after the content-addressed Cycle-10 commit; the final delivery and PR checks are authoritative.

No production deployment, live provider call, production migration, or production storage mutation is authorized by this handover.

## Architecture invariants to preserve

### Generic core

`src/services/business-assistant` remains module-neutral. BizFile parsing, source rules, table access, canonical mutation behavior, and source-specific review belong behind BizFile capability/application handlers.

### Exact approval

Canonical writes must bind the exact proposal revision, selected item set, prepared item hash, source/target identity, actor/workspace, capability/policy version, and applicable canonical revisions. A changed proposal requires fresh review and confirmation; never rewrite an old approval in place.

### Canonical mutation and recovery

- Canonical business tables change only through module-owned canonical commands.
- A committed operation keeps its original operation identity.
- Lost responses or worker restarts reconcile that identity instead of creating a replacement write.
- Required effects resume from durable intent; they do not rerun the company mutation.
- `OUTCOME_UNKNOWN` remains nonterminal until reconciliation establishes commit/no-commit.
- Retry/recovery must not allocate a replacement operation merely to bypass uncertainty.

### Fresh authorization

Fresh authorization is required at protected request, provider, preparation, confirmation, and resource-read boundaries as designed. Cached UI visibility never substitutes for transaction-time authority. Correction prefetch authorization is necessary but not authoritative; transaction-time authorization is authoritative.

### Source, review, and correction evidence

- Preserve immutable source identity/hash/revision evidence.
- Keep original committed receipt evidence separate from current-state drift.
- Never rewrite an old receipt/review to make a later correction look like the original operation was correct.
- Correction always creates linked new proposal lineage.
- Prefetched evidence remains evidence-only.
- Retained-source external/storage I/O remains outside the serializable correction write transaction.
- Collection corrections require stable record identity semantics.

### Learning

- Current-turn style instructions are not persistent-memory consent.
- Inferred preferences remain candidates until governed activation.
- Static schema validation is not behavioral evaluation.
- Deleted preference data must not reappear through rollback, cache, or derived candidates.

## Current outstanding work — ownership boundaries

### P12 — correction E2E and recovery

1. Add the full real-storage/real-BizFile correction E2E test described above.
2. Add a full-service concurrent source/baseline race fixture if the integrated E2E does not already prove those boundaries.
3. Keep collection-row corrections separate until stable identity semantics exist.

### P12 — independent review

Owned by the parallel reviewer workstream: full-state/unselected comparison, evidence classification, annotated source coverage, and reviewer-quality evaluation.

### P13/P15 — batch/operations

Owned by another parallel workstream: one-to-ten item fairness and isolation, budgets, retries/cancellation/expiry/revocation, retention/legal hold, backup/restore/purge, operations runbooks, and staging recovery drills.

### P14 — governed learning

Owned by another parallel workstream: held-out behavioral evaluation, source-controlled learnable targets, authorized versioned promotion, actual runtime consumption, rollback/deactivation/expiry/delete/cache cleanup, and stale promotion rejection.

### P16 — release verification

Still outstanding after parallel workstreams converge: real provider/storage/deployment topology, packaged worker/image, browser acceptance evidence, reviewer-quality and learning gates, cutover scans, kill switches/rollback, and complete release evidence.

A successful BizFile demo, passing unit test, or local build does **not** establish full-product completion.

## Test/failure matrix to preserve

| Case | Expected invariant |
|---|---|
| Duplicate correction request | Existing action may suppress external prefetch; transaction alone returns replay/conflict |
| Source pointer/version/revision changes after prefetch | Transaction rejects stale evidence |
| Company baseline/aggregate revision changes | Transaction rejects stale correction baseline |
| Permission revoked after prefetch | Transaction rejects before proposal writes |
| Restore/pause starts after prefetch | Transaction rejects before proposal writes |
| Serializable conflict | Retry only within the bounded correction retry budget |
| Transaction/lock timeout | Fail closed; do not blindly retry as a new operation |
| Worker dies before canonical commit | Retry only with the same validated operation/approval context |
| DB commits but response/status write is lost | Reconcile original receipt/operation and continue effects/read/review without repeating mutation |
| Earlier writer rolls back | Reconciliation may prove `NO_COMMIT`; no phantom receipt |
| Committed reconciliation repeated | Same receipt and operation identity; no duplicate canonical mutation |
| Storage finalize/page failure | Idempotent required-effect recovery; no reimport |
| Completed-source correction | New proposal/approval/operation; old operation/receipt/review/evidence preserved |
| Missing/unreadable/unsupported source coverage | `NEEDS_REVIEW`/review failure; never fabricate PASS |
| Unauthorized unselected write | Future full-state reviewer must detect it against immutable evidence |
| Ten items/two workspaces | P13 must prove isolated contexts/outcomes and bounded fair progress |

## CI and validation commands

Use Node 24 and an explicitly isolated disposable PostgreSQL/storage environment. Never point destructive or concurrency tests at the application database.

```bash
node --version
npm run check:assistant-capabilities
npm run db:generate
npm run lint
npm run typecheck
npm run test:run -- __tests__/services/business-assistant __tests__/api/business-assistant __tests__/services/bizfile __tests__/api/bizfile __tests__/lib/fresh-authorization.test.ts __tests__/middleware.test.ts --reporter=dot
npm run test:business-assistant:postgres
npx vitest run __tests__/integration/business-assistant-correction-concurrency.postgres.test.ts --maxWorkers=1
npx vitest run __tests__/integration/bizfile --maxWorkers=1
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

For production-image verification use `.github/workflows/node24-compatibility.yml` and verify the final image's Node major, configured Chromium path, executable Chromium binary, and Chromium smoke test.

## Operator recovery rules to preserve

| Situation | Permitted action | Prohibited shortcut |
|---|---|---|
| `OUTCOME_UNKNOWN` | Reconcile the original operation/receipt under canonical serialization | Allocate a new operation ID to bypass uncertainty |
| Storage/page finalization failed | Resume idempotent required effects from durable intent | Re-run the company mutation |
| Review failed/incomplete | Create a new review attempt with retained old evidence/findings | Manually mark PASS or omit coverage |
| Proposal stale/expired | Prepare a linked fresh proposal and require confirmation | Extend/rewrite the old approval |
| User revoked after commit | Finish only required committed recovery under audited authority | Administrator impersonation for a new assistant action |
| Worker deploy/restart | Drain/reconcile compatible claims and retain recovery handlers | Clear leases and blindly replay writes |
| Assistant disabled | Use ordinary module UI and preserve receipts/effects | Re-enable deprecated direct-save/helpbot fallback |
| Workspace restore | Keep dispatch off while reconciling receipts/effects/artifacts | Replay every restored pending approval |

## Next-session objective

For this Parallel Agent 1 scope, the next unresolved P12 correction task is the single full real-storage/real-BizFile correction execution/recovery fixture. It should prove preparation → fresh confirmation → canonical execution → required effects → read-back → independent-review handoff, plus rollback/no-commit and committed recovery, while showing the original source operation lifecycle/receipt/review/approval/evidence remains immutable.

Do not absorb the parallel independent-review, learning, P13/P15, or P16 scopes into that fixture. Keep collection-row correction semantics out until stable record identity is designed.