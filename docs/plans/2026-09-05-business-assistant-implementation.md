# Business Assistant — Review and Implementation Handover

> **Updated:** 2026-09-10  
> **Status:** P12 deterministic-field correction UI and retained-source prefetch/transaction hardening implemented; broader Business Assistant work remains in progress and is not deployment-ready  
> **Current integration PR:** [#17 — harden Business Assistant BizFile correction source verification](https://github.com/Scofieldkoh/oakcloud/pull/17)  
> **Predecessor:** [#16 — complete Business Assistant BizFile correction UI](https://github.com/Scofieldkoh/oakcloud/pull/16)  
> **Design:** [Business Assistant specification v1.4-review](../features/business-assistant/SPECIFICATION.md)  
> **Correction workflow:** [Business Assistant BizFile Correction Workflow](../features/business-assistant/CORRECTION_WORKFLOW.md)

This file is the current implementation handover. The earlier long-form review narrative remains available in Git history at the pre-consolidation plan blob `5ceeff0cd020daf736688224e3fac0e629905502`. This handover records the live architecture constraints, verified implementation state, exact PR #17 review history, remaining packages, and next-session priorities.

## Start here next session

Business Assistant is the **general Oakcloud assistant product**. BizFile is a registered reference capability, not the product boundary. Do not make documents, companies, imports, or independent source review mandatory for every capability.

Read, in this order:

1. `AGENTS.md`
2. `docs/features/business-assistant/SPECIFICATION.md`
3. this handover
4. `docs/features/business-assistant/CORRECTION_WORKFLOW.md` for P12 correction behavior
5. applicable RBAC, service, design, staging, API, database, and environment reference docs before changing those surfaces

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

### PostgreSQL authorization bug — resolved before PR #17

The fresh-authorization advisory-lock helper previously selected PostgreSQL functions returning `void`, which Prisma 7 could not deserialize. The implementation now acquires the same transaction locks while selecting a scalar value. Focused authorization and guarded PostgreSQL recovery suites pass with the corrected query shape.

## PR #17 exact 10-cycle review record

The user requested exactly ten `review → fix → commit` cycles, with the first cycle also containing the implementation pass. PR #17 follows that cadence exactly; there are ten branch commits after the `main` base and no merge to `main` in this session.

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

## Verification and merge policy

No production deployment, live provider call, production migration, or production storage mutation is authorized by this handover.

Before merging PR #17, require the final head to pass the repository's Node 24 compatibility workflow, including:

- lint;
- committed assistant registry freshness;
- Prisma generation;
- TypeScript typecheck;
- Chromium path resolution tests;
- focused Business Assistant/BizFile contract tests;
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

### 4. P13/P15 operational hardening

1. Exercise one-to-ten item fairness, partial outcomes, provider budgets, retries, cancellation, expiry, and revocation.
2. Complete immutable source retention before commit where still outstanding.
3. Finalize evidence/conversation/feedback/memory retention and legal-hold decisions.
4. Verify backup/restore/purge ordering for assistant rows, canonical receipts/effects, and referenced artifacts.
5. Measure global authorization/aggregate lock contention.
6. Exercise worker restart, restore, committed-effect recovery, and kill-switch runbooks on staging.
7. Keep follow-up task creation explicitly unsupported by the current BizFile plan until a deliberate canonical contract is implemented.

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
| Worker | Durable claim/retry/recovery model and packaged worker entrypoint |
| Authorization | Fresh actor/resource checks plus coordinated transaction barriers |
| BizFile preparation | Signed exact canonical change plan before save/confirmation |
| Canonical operation | Stable operation identity, receipt/evidence/effect/reconciliation design |
| Existing UI convergence | Manual upload uses prepared canonical plan; deprecated direct-save path removed |
| Workspace | General Business Assistant conversation, run, approval, review and preferences UI |
| Independent review | Separate source extraction/review attempt with evidence coverage contract |
| Correction | Linked deterministic-field proposal + UI + authorized retained-source prefetch/transaction revalidation |
| Learning | Candidate/static-validation protections exist; behavioral promotion still blocked |

## Remaining package definitions

### P12 — Evidence, independent review, findings, and correction

**Current state:** partially complete. Deterministic correction UI and retained-source transaction hardening are implemented; real-storage end-to-end correction evidence, full-state comparison/evaluation, lock/timeout measurements, and collection identity semantics remain.

Required gate includes immutable source/receipt evidence, validated finding identity/severity/page references/coverage, no PASS with missing required coverage or unexplained unapproved changes, correction with fresh proposal/approval and preserved original operation evidence, and agreed held-out reviewer-quality evidence for internal pilot.

### P13 — Batch fairness, partial outcomes, and resource budgets

Required gate includes one-to-ten item isolation/order, deployment-wide capacity/fairness, explicit per-item outcomes, bounded resource/provider budgets, explicit budget-exhaustion coverage, cancellation/expiry/revocation behavior, and no duplicate mutation or cross-document prompt leakage.

### P14 — Governed preference and learning lifecycle

**Current state:** authorization/static-validation foundations exist; promotion remains intentionally blocked.

Required gate includes feedback → candidate → held-out behavioral evaluation → authorized activation, visible configuration consumption, source-controlled allowed targets, versioned promotion/rollback, and expiry/deactivation/delete including cache/derived candidate cleanup.

### P15 — Operations, retention, backup, audit, and deployment

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

Continue with **P12 correction production hardening first**:

1. add the full real-storage/real-BizFile end-to-end correction execution/recovery test;
2. measure lock duration/timeout behavior and concurrent source/baseline changes under the new prefetch boundary;
3. complete full-state/unselected-write independent review and annotated reviewer evaluation; and
4. design identity-aware collection-row corrections separately.

After P12, proceed to P14 governed behavioral learning and P13/P15 operational hardening according to dependency/risk, then P16 release verification.

Suggested handover prompt:

> Read `AGENTS.md`, `docs/features/business-assistant/SPECIFICATION.md`, `docs/features/business-assistant/CORRECTION_WORKFLOW.md`, and this handover. Business Assistant is the general product and BizFile is the reference capability. PR #16 completed the deterministic correction UI; PR #17 moved retained-source storage reads out of the serializable correction transaction into an authorized evidence-only prefetch with transaction-time permission, identity, pointer, version, revision, hash, capability-contract, and company-revision revalidation. Continue P12 with the full real-storage/real-BizFile correction execution/recovery test and lock/timeout/concurrency measurements, then complete full-state/unselected-write independent review and annotated reviewer evaluation. Preserve exact approval, operation identity, immutable evidence, fresh authorization, existing user changes, and shared document AI. Keep provider/mutation dispatch disabled until the corresponding gates pass, and update this handover with exact evidence before moving to the next package.
