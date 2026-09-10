# Business Assistant — Review and Implementation Handover

> **Updated:** 2026-09-10  
> **Status:** P12 deterministic-field correction UI and retained-source prefetch/transaction hardening implemented; P13/P15 operational hardening implemented in PR #21 with final CI required; broader Business Assistant work remains in progress and is not deployment-ready  
> **Current P13/P15 workstream PR:** [#21 — harden Business Assistant P13/P15 operations and recovery](https://github.com/Scofieldkoh/oakcloud/pull/21)  
> **P12 integration PR:** [#17 — harden Business Assistant BizFile correction source verification](https://github.com/Scofieldkoh/oakcloud/pull/17)  
> **Predecessor:** [#16 — complete Business Assistant BizFile correction UI](https://github.com/Scofieldkoh/oakcloud/pull/16)  
> **Design:** [Business Assistant specification v1.4-review](../features/business-assistant/SPECIFICATION.md)  
> **Correction workflow:** [Business Assistant BizFile Correction Workflow](../features/business-assistant/CORRECTION_WORKFLOW.md)

This file is the current implementation handover. The earlier long-form review narrative remains available in Git history at the pre-consolidation plan blob `5ceeff0cd020daf736688224e3fac0e629905502`. This handover records the live architecture constraints, verified implementation state, exact review histories, remaining packages, and next-session priorities.

## Start here next session

Business Assistant is the **general Oakcloud assistant product**. BizFile is a registered reference capability, not the product boundary. Do not make documents, companies, imports, or independent source review mandatory for every capability.

Read, in this order:

1. `AGENTS.md`
2. `docs/features/business-assistant/SPECIFICATION.md`
3. this handover
4. `docs/features/business-assistant/CORRECTION_WORKFLOW.md` for P12 correction behavior
5. `docs/runbooks/business-assistant-operations.md` for P13/P15 operational recovery and retention guidance
6. applicable RBAC, service, design, staging, API, database, and environment reference docs before changing those surfaces

Do not enable provider or mutation dispatch, deploy to production, change retention policy, or weaken canonical approval/recovery guarantees merely because CI passes.

## Current implementation checkpoint

### P12 deterministic-field correction UI — complete in PR #16

`POST /api/business-assistant/runs/:id/corrections` remains the single generic correction preparation endpoint. The run-review UI exposes correction creation only for the latest review on a committed BizFile item in a backend-correctable lifecycle. Users select allowlisted findings and the UI submits the immutable independent-review `expected` values; it does not accept arbitrary replacements.

A correction prepares a **new linked proposal**. It never edits the old operation, receipt, approval, or review, and it never writes company data directly. The normal `CONFIRM` flow is still required before a new operation identity is allocated.

The shared client/server contract in `src/lib/bizfile-correction-contract.ts` owns the allowed factual finding codes, deterministic source paths, and `BIZFILE_CORRECTION_MAX_ITEMS = 20`. The UI presents 26 deterministic scalar/one-to-one fields. Collection-row corrections remain intentionally unsupported until stable record identity semantics are designed.

### P12 retained-source transaction hardening — implemented in PR #17

The previous correction path downloaded retained source bytes while the serializable correction transaction was open. PR #17 moves that network/storage I/O into an authorized evidence-only prefetch stage and revalidates all mutable authority/state under the transaction before a new proposal can be prepared.

The generic module-neutral adapter is `src/services/business-assistant/correction-prefetch.ts`. Existing one-argument correction handlers remain compatible. A handler may opt into an optional prefetch hook without changing the externally registered correction request/response contract.

`src/services/business-assistant/correction.service.ts` now:

- performs top-level mutation access checks before preflight;
- resolves the source run/capability under owner/workspace scope outside the write transaction;
- invokes a capability prefetch hook before the serializable transaction when required;
- binds prefetched evidence to capability ID, capability version, and contract version;
- reacquires the shared business-operation barrier, fresh actor/workspace authorization, restore/pause policy, source run, latest review/item, and capability inside the transaction;
- rejects prefetched evidence if the capability/version/contract changed before use; and
- keeps request replay/body-hash conflict resolution transaction-authoritative.

For idempotent retries, an advisory existing-action preflight suppresses unnecessary external source I/O. It does **not** return or trust the stored response outside the transaction; fresh actor/pause/dispatch checks and replay/conflict decisions still happen inside the transaction.

`src/services/bizfile/application/prepare-correction.ts` now splits source verification into two stages:

1. `prefetchBizFileCorrection` validates receipt/source/review bindings, performs fresh document-read and company-update authorization, validates the legitimate source pointer, downloads retained source objects, and verifies their SHA-256 **before** the serializable transaction.
2. Transactional preparation re-authorizes both resources; re-reads source document identity, version, source revision and storage pointer; revalidates receipt/source/review bindings and company aggregate revision; and requires an exact match to the prefetched evidence before rebuilding the canonical correction plan.

No `storage.download` call remains in the transactional correction preparer. A source pointer/revision/version/hash, capability contract, permission, restore state, or company revision race fails closed instead of silently rebasing the old review.

Original approvals, operations, operation receipts, and reviews remain unchanged. A correction is still represented only by new run/item/proposal lineage.

### Correction backend — remaining production hardening

The source-prefetch boundary is implemented, but P12 correction is not production-complete. Still open:

- full real-storage/real-BizFile correction execution coverage through preparation, fresh confirmation/approval, canonical execution, required effects, read-back, review, rollback/recovery, and preservation of the original source operation lifecycle/evidence;
- transaction lock-duration and timeout measurement plus concurrent source/baseline-change coverage under the corrected boundary; and
- identity-aware collection-row correction contracts.

### Independent source review — partially complete

A connector-aware independent extractor produces explicit `REVIEWED`, `ABSENT`, `UNREADABLE`, or `UNSUPPORTED` section attestations. Source SHA-256, PDF/image decoding, one-based page references, completeness, provider identity, and evidence bindings are validated by the server.

Current factual comparison remains intentionally limited to `SELECTED_CHANGES_ONLY`. Complete source coverage cannot by itself produce a factual PASS when full-state/unselected comparison is not established.

Still required:

- compare unselected/full-state source differences against immutable before/after evidence;
- detect unauthorized unselected writes;
- distinguish later human edits from import defects;
- validate source section/page coverage on annotated fixtures;
- complete held-out reviewer evaluation with predeclared metrics, denominators, abstention/coverage reporting, and agreed thresholds; and
- preserve procedural independence from planner history, memory, persona, and mutation tools.

Do not infer reviewer quality from mocked tests, provider confidence, or user acceptance.

### Manual BizFile upload path

The manual BizFile upload remains a canonical module flow independent of assistant review. New company creation uses the editable BizFile workspace as final review and saves through `Confirm & Save` after server preparation. Existing-company updates retain the final proposed-change modal. Direct-save bypasses without a prepared plan remain rejected.

### Preferences, retries, authorization, and recovery

Current implemented boundaries include transaction-bound actor/workspace authorization for assistant mutations, the shared business-operation barrier, restore-pause checks, transaction-scoped request replay, capability/version-scoped memory versioning/supersession, read-only retry without the mutation gate, write retry retaining that gate, fresh resource authorization before protected work, and durable operation identity/reconciliation for committed or uncertain work.

Learning promotion remains blocked while only static validation exists. Do not treat a schema-valid candidate as a behaviorally evaluated candidate.

### P13/P15 operational hardening — implemented in PR #21

PR #21 is the Parallel Agent 4 workstream and is intentionally isolated from P12 correction/reviewer implementation and P14 governed learning. It adds operational policy bounds, retry/stage fencing, partial-outcome tests, retention safe defaults, and a staging-compatible recovery/runbook without enabling production dispatch or destructive purge.

Implemented boundaries:

- run workloads remain capped at 10 items;
- resource references are bounded at 50 per item by the assistant contract/operational policy;
- per-stage attempts remain capped at 3 and a new aggregate per-item stage-attempt budget is capped at 18;
- worker-level failures are capped at 6 per item and become terminal as `RETRY_BUDGET_EXHAUSTED` rather than leaving active-but-unclaimable poison work;
- provider-backed execution is bounded to the registered execution-stage attempt ceiling for the current provider-backed capability; future capabilities that perform more than one provider dispatch inside a single stage must adopt an explicit provider-consumption counter before registration;
- claim ordering considers `availableAt` first and retry count before creation/id tie-breaks;
- the existing worker's 30-second failure retry delay is now preserved when `releaseItemClaim(..., { keepState: true })` clears the lease, fixing the race that previously reset delayed work to immediately runnable;
- 1–10 item aggregate tests verify a single failed item remains an isolated partial outcome rather than contaminating successful siblings;
- canonical operation identity/reconciliation semantics are unchanged, so one item failure cannot authorize a replacement operation ID;
- destructive purge remains fail-closed unless an explicit versioned decision confirms owner approval, legal-hold review, and referenced-source reachability review;
- receipts, evidence, effects, approvals, reviews, run steps/action requests, conversations/messages, feedback, memory/preferences, runs/items/proposals, and referenced documents are explicitly classified for retention dependencies;
- follow-up task creation remains unsupported by the current BizFile plan; no task-creation side channel was added; and
- provider/mutation dispatch remains disabled unless existing release gates are deliberately enabled outside this workstream.

The operational runbook is `docs/runbooks/business-assistant-operations.md`. It covers worker restart, committed-effect recovery, `OUTCOME_UNKNOWN` reconciliation, restore pause, provider/mutation kill-switch semantics, retention dependencies, policy-gated purge ordering, and staging measurement requirements.

### P13/P15 measurements and evidence

Static/source-controlled bounds at PR #21 final review:

| Measurement | Result |
|---|---:|
| Maximum items per run | 10 |
| Global durable capacity slots | 2 |
| Lease duration | 90 s |
| Heartbeat cadence | 15 s |
| Per-stage attempts | 3 |
| Aggregate stage attempts per item | 18 |
| Worker-level failures per item | 6 |
| Current provider-backed execution attempts per item | 3 |
| Resource references per item | 50 |
| Worker failure retry delay | 30 s, preserved across claim release |
| Approval lifetime | 30 min |

CI evidence before the final documentation commit: the ninth workstream commit (`2b545e361220b2533d315727763963259e751302`) reached green PostgreSQL Business Assistant recovery/authorization and BizFile reconciliation/effects tests; Node 24 lint, registry freshness, and Prisma generation were green while the remaining static/build and production-image steps were still running. The final documentation commit must receive a fresh complete workflow result; do not infer final CI from the ninth commit.

Representative staging timings for claim p50/p95/max, fresh-authorization latency, aggregate-update latency, and correction-specific transaction contention are **not claimed as measured** by this connector-only workstream. They remain required staging evidence. Correction-specific lock measurements must be rerun after the Parallel Agent 1 P12 transaction changes integrate rather than being duplicated here.

### P13/P15 unresolved policy decisions and operational risks

- Retention durations for evidence, conversations, feedback, memory/preferences, canonical receipts/effects, and referenced artifacts require owner/product/legal policy. PR #21 deliberately defines no durations.
- Legal-hold semantics and the exact referenced-document reachability test require an approved product/legal decision before destructive purge can exist.
- Current registered provider-backed answer execution performs one provider call per execution stage attempt; a future capability with multiple provider calls inside one attempt needs an explicit durable provider-consumption counter rather than relying solely on stage attempts.
- Deployment-wide fairness is improved by preserving retry backoff and preferring eligible lower-retry work within the current FIFO availability model, but representative multi-worker staging claim-latency measurements remain required for P16 release verification.
- Authorization revocation is already checked at protected capability/resource boundaries; staging must still exercise revocation races against representative real provider/storage topology.
- No production restore, destructive purge, live provider mutation, or production kill-switch test was performed by this workstream.

### PostgreSQL authorization bug — resolved before PR #17

The fresh-authorization advisory-lock helper previously selected PostgreSQL functions returning `void`, which Prisma 7 could not deserialize. The implementation now acquires the same transaction locks while selecting a scalar value. Focused authorization and guarded PostgreSQL recovery suites pass with the corrected query shape.

## PR #17 exact 10-cycle review record

The user requested exactly ten `review → fix → commit` cycles, with the first cycle also containing the implementation pass. PR #17 follows that cadence exactly; there are ten branch commits after the `main` base and no merge to `main` in that workstream.

| Cycle | Review finding / committed fix |
|---|---|
| 1 | Added a typed optional correction-prefetch adapter while preserving existing correction-handler compatibility. |
| 2 | Staged prefetch before the serializable transaction and bound evidence to capability ID/version/contract before transactional use. |
| 3 | Added generic regression coverage proving prefetch precedes the transaction and that fresh revocation/restore-pause checks still prevent writes. |
| 4 | Moved BizFile retained-source byte download/hash verification into authorized prefetch and kept transactional pointer/revision/hash revalidation. |
| 5 | Added BizFile regression coverage for byte verification, source/target authorization ordering, pointer legitimacy, revision drift, baseline drift, and zero transactional storage reads. |
| 6 | Fixed test isolation so a shared mock could not leak a prefetch property into the no-prefetch compatibility case. |
| 7 | Prevented idempotent replay candidates from unnecessarily re-downloading source bytes while keeping replay/conflict resolution transaction-authoritative. |
| 8 | Added replay regression coverage proving duplicate/conflict retries suppress external prefetch after the first action. |
| 9 | CI exposed return-type widening in the generic adapter; preserved each wrapped handler's narrower return type, restoring TypeScript safety without weakening the test. |
| 10 | Re-reviewed the green code boundary and corrected the handover/workflow documentation so the completed prefetch work is no longer listed as outstanding. |

Commit 9 code-head verification confirmed Node 24 lint, committed assistant-registry freshness, Prisma generation, TypeScript typecheck, Chromium path tests, focused Business Assistant/BizFile contracts, PostgreSQL durable-worker/concurrent-authorization tests, and BizFile canonical revision/reconciliation/effects integration tests. The final documentation-only commit must receive the same PR CI before merge.

No application or capability-contract version is bumped in PR #17. The change is additive internal execution-boundary hardening and does not change the approved external correction request/response contract. Provider/mutation dispatch remains gated.

## PR #21 exact 10-cycle P13/P15 review record

Branch: `codex/business-assistant-p13-p15-hardening`  
Base: `cde965ae0caad40c6553c67a164421be956167f0`  
PR: [#21](https://github.com/Scofieldkoh/oakcloud/pull/21)  
Final workstream SHA: the Cycle 10 commit containing this record; its exact SHA is recorded in PR #21 metadata/final report because a Git commit cannot cryptographically contain its own final SHA without changing that SHA.

| Cycle | Commit | Review finding / committed fix |
|---|---|---|
| 1 | `a962ab05fecf05539b59207b6d008a5c829c4303` | Implemented source-controlled operational limits and explicit provider/resource/retry/stage budget-exhaustion types; review confirmed the prior code had only per-stage retry bounds and no single operational budget model. |
| 2 | `fdea0810a8adc984f6a5619a0c87c021f84fafd2` | Added direct boundary tests for 1–10 resource workloads, resource/provider/retry/stage exhaustion, and bounded retry-delay calculation. |
| 3 | `33a999c8e79190089d6bfef145741ed88ba0e72e` | Review found a retry ceiling alone could leave active-but-unclaimable poison work; made the terminal retry transition transactional and added an aggregate durable stage-attempt ceiling. |
| 4 | `7a4bb5ce1a8cf7be85e8740286a1631f9c4b280d` | Added claim-fencing regression tests proving terminal retry exhaustion and aggregate-stage exhaustion do not create another attempt. |
| 5 | `351dfa6501b7815c88211d9ba103c9d0b655a022` | Review of retention dependencies found policy could not safely be invented; added explicit retention classes, purge dependency order, referenced-source classification, and fail-closed destructive-purge authorization. |
| 6 | `99271576fc13e9a6c8b9597e92f444ca510c048a` | Added tests covering immutable operation records, audit/context retention, referenced documents, dependency ordering, and unresolved legal-hold/source policy rejection. |
| 7 | `6fb77f66418a13b1cecda97aa01826383292a72b` | Added staging-compatible runbooks for restart, restore pause, committed-effect recovery, `OUTCOME_UNKNOWN`, kill switches, retention, purge ordering, and required contention measurements; task creation remains unsupported. |
| 8 | `f14bdcf89550cc51906a931b5690e62e89c92ed0` | Review found `releaseItemClaim(..., { keepState: true })` overwrote the worker's delayed `availableAt` with the current time, defeating backoff and enabling starvation; release now preserves the scheduled retry time unless explicitly replaced. |
| 9 | `2b545e361220b2533d315727763963259e751302` | Added regression coverage for preserved retry delay and 1–10 item partial outcomes; early PR CI confirmed PostgreSQL recovery/authorization plus BizFile reconciliation/effects, lint, registry freshness, and Prisma generation before Cycle 10. |
| 10 | `this handover commit` | Final review reconciled documentation with actual runtime behavior, recorded exact scope/bounds/policy gaps/CI limitations, and explicitly separated static evidence from staging measurements that still must be rerun after parallel P12 transaction work integrates. |

Exactly ten workstream commits exist after the branch base. Do not squash this workstream if preservation of the requested cycle history is required for review evidence.

## Verification and merge policy

No production deployment, live provider call, production migration, or production storage mutation is authorized by this handover.

Before merging PR #21, require the final head to pass the repository's Node 24 compatibility workflow, including:

- lint;
- committed assistant registry freshness;
- Prisma generation;
- TypeScript typecheck;
- Chromium path resolution tests;
- focused Business Assistant/BizFile contract tests, including the new operational/claim/retention tests;
- PostgreSQL recovery/authorization and BizFile reconciliation/effects tests;
- production application build with the documented 8 GB heap; and
- production image/runtime/Chromium compatibility.

`main` is intentionally unchanged until the repository owner explicitly authorizes the merge.

## Current outstanding work — execution order

### 1. P12 correction hardening

1. Add a full real-storage/real-BizFile correction test covering preparation, fresh approval, canonical execution, required effects, read-back, independent review, rollback/recovery, and preservation of the original source operation lifecycle/evidence.
2. Measure transaction lock duration and timeout behavior, including concurrent baseline/source pointer/revision changes under the corrected prefetch boundary.
3. Design identity-aware collection-row correction contracts separately. Do not extend scalar path semantics to officers/shareholders/charges by array position.

### 2. P12 independent-review completion

1. Compare unselected/full-state source differences and unauthorized unselected writes against immutable before/after evidence.
2. Distinguish later human edits from import-time defects.
3. Validate source section/page coverage on annotated fixtures.
4. Complete held-out reviewer evaluation with predeclared metrics, denominators, abstention/coverage reporting, and agreed thresholds.
5. Preserve procedural independence from planner history, memory, persona, and mutation tools.

### 3. P14 governed learning

1. Implement real held-out behavioral evaluation rather than static validation.
2. Keep candidates scoped to source-controlled allowed preference/prompt/config targets.
3. Require authorized promotion with expected-version compare-and-swap.
4. Demonstrate visible configuration consumption after promotion.
5. Prove rollback, deactivation, expiry, deletion, and cache/derived-data erasure guarantees.
6. Resolve legacy target aliases explicitly.

Promotion remains blocked until behavioral evaluation exists.

### 4. P13/P15 remaining operational evidence

1. Run representative staging multi-worker timing measurements for claim fairness, fresh authorization, aggregate updates, and global contention.
2. Rerun correction-specific lock timing after Parallel Agent 1 transaction changes integrate.
3. Exercise real staging-compatible worker restart, restore, committed-effect recovery, provider kill switch, mutation kill switch, expiry, and authorization-revocation races against the deployed topology.
4. Obtain owner/product/legal decisions for retention durations, legal holds, and referenced-document purge reachability. Until then destructive purge remains disabled.
5. Keep follow-up task creation explicitly unsupported by the current BizFile plan until a deliberate canonical contract is implemented.

### 5. P16 release verification

1. Verify real provider/storage/deployment topology.
2. Verify the packaged Node 24 worker/image, not only development execution.
3. Complete end-to-end browser acceptance evidence.
4. Complete reviewer-quality and governed-learning gates.
5. Re-run legacy/helpbot cutover scans and preserve shared document AI.
6. Exercise mutation/provider disable and ordinary module UI fallback.
7. Keep additive schema/receipts on rollback; never replay old approvals or drop recovery evidence as a shortcut.

A successful BizFile demo, passing unit tests, or a local build does **not** establish full-product completion.

## Architecture invariants to preserve

### Generic core

`src/services/business-assistant` must remain module-neutral. BizFile-specific parsing, rules, table access, and canonical mutation behavior belong behind capability/application handlers. A second module must be able to register a read-only or canonical-write capability without fake document/receipt/review requirements.

### Exact approval

Any canonical write must bind the exact proposal revision, selected item set, prepared item hash, source/target identity, actor/workspace, policy/capability version, and applicable revisions. A changed proposal requires fresh review/approval; never mutate an old approved artifact in place.

### Canonical mutation and recovery

- Canonical business tables change only through module-owned canonical commands.
- A committed operation keeps its original operation identity.
- Lost responses or worker restarts reconcile that identity instead of creating a replacement write.
- Required effects resume from durable intent; they do not rerun the company mutation.
- `OUTCOME_UNKNOWN` remains nonterminal until reconciliation establishes commit/no-commit.

### Fresh authorization

Fresh authorization is required at protected request, provider, preparation, confirmation, and resource-read boundaries as designed. Cached UI visibility never substitutes for transaction-time authorization. Authorization loss may stop new work while audited canonical recovery is still allowed to finish already committed required effects.

### Source, review, and correction evidence

- Preserve immutable source identity/hash/revision evidence.
- Keep original committed receipt evidence separate from current-state drift.
- Never rewrite an old receipt/review to make a later correction look like the original operation was correct.
- Correction always creates linked new proposal lineage.
- Prefetch evidence is evidence only; transaction-time authorization and state are authoritative.
- Retained-source network I/O stays outside the serializable correction write transaction.
- Collection corrections require stable record identity semantics.

### Learning

- Current-turn style instructions are not persistent-memory consent.
- Inferred preferences remain candidates until governed activation.
- Static schema validation is not behavioral evaluation.
- Deleted preference data must not reappear through rollback, cache, or derived candidates.

## Implemented/verified foundation summary

| Area | Current boundary |
|---|---|
| Product framing | General Business Assistant with module-owned capabilities; BizFile reference adapter |
| Transport | Durable turn/action APIs with owner/workspace scoping and idempotency |
| Registry | Generated static capability registry with freshness check |
| Worker | Durable claim/retry/recovery model, bounded worker/stage budgets, preserved retry backoff, packaged worker entrypoint |
| Authorization | Fresh actor/resource checks plus coordinated transaction barriers |
| BizFile preparation | Signed exact canonical change plan before save/confirmation |
| Canonical operation | Stable operation identity, receipt/evidence/effect/reconciliation design |
| Existing UI convergence | Manual upload uses prepared canonical plan; deprecated direct-save path removed |
| Workspace | General Business Assistant conversation, run, approval, review and preferences UI |
| Independent review | Separate source extraction/review attempt with evidence coverage contract |
| Correction | Linked deterministic-field proposal + UI + authorized retained-source prefetch/transaction revalidation |
| Operations | P13/P15 retry/stage bounds, 1–10 partial-outcome tests, safe retention classes, recovery/restore/kill-switch runbook |
| Learning | Candidate/static-validation protections exist; behavioral promotion still blocked |

## Remaining package definitions

### P12 — Evidence, independent review, findings, and correction

**Current state:** partially complete. Deterministic correction UI and retained-source transaction hardening are implemented; real-storage end-to-end correction evidence, full-state comparison/evaluation, lock/timeout measurements, and collection identity semantics remain.

Required gate includes immutable source/receipt evidence, validated finding identity/severity/page references/coverage, no PASS with missing required coverage or unexplained unapproved changes, correction with fresh proposal/approval and preserved original operation evidence, and agreed held-out reviewer-quality evidence for internal pilot.

### P13 — Batch fairness, partial outcomes, and resource budgets

**Current state:** code-level retry/stage/resource/provider bounds and 1–10 partial-outcome/backoff regression coverage are implemented in PR #21. Representative deployment-wide fairness/contention timing remains a staging/P16 gate.

Required gate includes one-to-ten item isolation/order, deployment-wide capacity/fairness, explicit per-item outcomes, bounded resource/provider budgets, explicit budget-exhaustion coverage, cancellation/expiry/revocation behavior, and no duplicate mutation or cross-document prompt leakage.

### P14 — Governed preference and learning lifecycle

**Current state:** authorization/static-validation foundations exist; promotion remains intentionally blocked.

Required gate includes feedback → candidate → held-out behavioral evaluation → authorized activation, visible configuration consumption, source-controlled allowed targets, versioned promotion/rollback, and expiry/deactivation/delete including cache/derived candidate cleanup.

### P15 — Operations, retention, backup, audit, and deployment

**Current state:** PR #21 implements fail-closed retention classes/purge authorization, retry/backoff hardening, and recovery/runbook guidance. Retention durations/legal-hold policy and representative staging drills remain unresolved by design.

Required gate includes worker/provider/mutation flags, durable audit/redacted observability, approved retention/legal-hold behavior, complete backup/restore/purge coverage, pending-version compatibility/recovery, real restart/restore/effect-recovery drills, and ordinary module UI fallback with the assistant disabled.

### P16 — Cutover and release verification

Required gate includes current workspace/nav usability, legacy helpbot retirement without deleting shared document AI/history, current API/database/environment/index docs, traceable Node 24/static/focused/PostgreSQL/browser/image/worker/provider evidence, exercised kill switches/rollback, and BA-AC01-23 evidence or explicit incompletion.

Release remains incomplete if reviewer quality, governed learning, retention/recovery, active legacy retirement, or real deployment evidence is missing.

## Test and failure matrix still required

| Case | Expected invariant |
|---|---|
| Duplicate correction request | Existing action may suppress external prefetch; transaction alone returns replay/conflict |
| Source changes after prefetch | Transaction rejects stale pointer/version/revision/hash evidence |
| Permission revoked after prefetch | Transaction rejects before proposal writes |
| Restore/pause starts after prefetch | Transaction rejects before proposal writes |
| Duplicate turn/confirm; changed body with same key | One logical action; changed body rejected |
| Revise vs confirm | One exact proposal revision/subset wins |
| Worker dies before canonical commit | Retry only with same validated operation/approval context |
| DB commits, response/status write lost | Receipt reconciliation resumes effects/read/review without repeating mutation |
| DB unavailable/in-flight transaction uncertain | Remain `OUTCOME_UNKNOWN`; never blind retry |
| Cancel/revoke before gate | No canonical write |
| Cancel/revoke after commit | Reconcile committed outcome and required effects only |
| Concurrent CREATE same UEN | Explicit conflict; never silently convert to UPDATE |
| Completed-source correction | New operation/approval/evidence; old receipt/lifecycle preserved |
| Storage finalize/pointer/page failure | Idempotent effect recovery; no reimport |
| Later human edit before review | Original receipt evidence remains immutable; drift separately reported |
| Missing/unreadable/unsupported source coverage | `NEEDS_REVIEW`/review failure, never fabricated PASS |
| Unauthorized unselected write | Review detects it against immutable before/after evidence |
| Provider timeout/malformed/budget exhaustion | Stage-specific incomplete/retry state; no mutation replay |
| Memory delete then rollback | Deleted value remains unavailable |
| Old capability version after deploy | Compatible committed recovery retained; stale uncommitted approval invalidated |
| Ten items/two workspaces | Isolated contexts/outcomes with bounded fair global progress |

## CI and validation commands

Use Node 24 and explicitly isolated disposable PostgreSQL/storage environments. Never point destructive or concurrency tests at the application database.

```bash
node --version
npm run check:assistant-capabilities
npm run db:generate
npm run lint
npm run typecheck
npm run test:run -- __tests__/services/business-assistant __tests__/api/business-assistant __tests__/services/bizfile __tests__/api/bizfile __tests__/lib/fresh-authorization.test.ts __tests__/middleware.test.ts --reporter=dot
npm run test:business-assistant:postgres
npx vitest run __tests__/integration/bizfile --maxWorkers=1
npm run test:browser
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

For production-image verification, use `.github/workflows/node24-compatibility.yml` and verify the final image's Node major, configured Chromium path, executable Chromium binary, and Chromium smoke test.

If a full build or suite fails, distinguish application/test failures from environment-capacity failures. Do not hide either category.

## Operator runbooks to preserve

| Situation | Permitted action | Prohibited shortcut |
|---|---|---|
| `OUTCOME_UNKNOWN` | Reconcile the original operation/receipt under canonical serialization | New operation ID to bypass uncertainty |
| Storage/page finalization failed | Resume idempotent required effects from durable intent | Re-run company import |
| Review failed/incomplete | Create a new review attempt with retained old evidence/findings | Manually mark PASS or silently omit coverage |
| Proposal stale/expired | Prepare a linked fresh proposal and require confirmation | Extend/rewrite old approval in place |
| User revoked after commit | Finish only required committed recovery under audited authority | Administrator impersonation for a new assistant action |
| Worker deploy/restart | Drain/reconcile compatible claims and retain recovery handlers | Clear leases and blindly replay writes |
| Assistant disabled | Use ordinary module UI and preserve receipts/effects | Re-enable deprecated direct-save/helpbot fallback |
| Workspace restore | Keep dispatch off while reconciling receipts/effects/artifacts | Replay every restored pending approval |

## Next-session objective

Continue parallel work without taking over another agent's package. For P13/P15 specifically:

1. wait for Parallel Agent 1 correction transaction changes to integrate, then rerun correction-specific contention instrumentation rather than duplicating that implementation;
2. run representative staging-compatible multi-worker restart/restore/recovery/kill-switch/revocation drills and capture latency/contention evidence;
3. obtain explicit owner/product/legal decisions for retention durations, legal holds, and referenced-source purge reachability before implementing any destructive behavior; and
4. keep follow-up task creation unsupported until a deliberate canonical task contract exists.

P12 correction/reviewer completion and P14 governed behavioral learning remain separately owned workstreams. P16 final release verification must consume their integrated results plus the remaining P13/P15 staging evidence.

Suggested handover prompt:

> Read `AGENTS.md`, `docs/features/business-assistant/SPECIFICATION.md`, `docs/features/business-assistant/CORRECTION_WORKFLOW.md`, `docs/runbooks/business-assistant-operations.md`, and this handover. Business Assistant is the general product and BizFile is the reference capability. PR #21 is the P13/P15 workstream: it adds bounded retry/stage/resource/provider policy, fixes retry-delay loss on claim release, tests 1–10 partial outcomes, adds fail-closed retention/purge policy mechanics, and documents restart/restore/effect-recovery/kill-switch runbooks. Do not invent retention or legal-hold policy, do not enable destructive purge or global provider/mutation dispatch, and do not introduce follow-up task creation. Rerun representative staging contention and recovery drills after parallel P12 transaction work integrates, then feed that evidence into P16 release verification.