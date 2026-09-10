# Business Assistant — Review and Implementation Handover

> **Updated:** 2026-09-10  
> **Status:** P12 deterministic-field correction UI complete; broader Business Assistant implementation remains in progress and is not deployment-ready  
> **Integration PR:** [#16 — complete Business Assistant BizFile correction UI](https://github.com/Scofieldkoh/oakcloud/pull/16)  
> **Design:** [Business Assistant specification v1.4-review](../features/business-assistant/SPECIFICATION.md)  
> **Correction workflow:** [Business Assistant BizFile Correction Workflow](../features/business-assistant/CORRECTION_WORKFLOW.md)

This file is the current implementation handover. The earlier long-form review narrative and historical package notes remain available in Git history at the pre-update plan blob `5ceeff0cd020daf736688224e3fac0e629905502`. The current file keeps the active constraints, verified implementation state, remaining packages, and next-session priorities in one place rather than requiring future sessions to separate stale historical checkpoints from current work.

## Start here next session

Business Assistant is the **general Oakcloud assistant product**. BizFile is a registered reference capability, not the product boundary. Do not make documents, companies, imports, or independent source review mandatory for every capability.

Read, in this order:

1. `AGENTS.md`
2. `docs/features/business-assistant/SPECIFICATION.md`
3. this handover
4. `docs/features/business-assistant/CORRECTION_WORKFLOW.md` for P12 correction behavior
5. applicable RBAC, service, design, staging, API, database, and environment reference docs before changing those surfaces

Do not enable provider or mutation dispatch, deploy to production, change retention policy, or weaken canonical approval/recovery guarantees merely because a local or CI suite passes.

## Current implementation checkpoint

### P12 deterministic-field correction UI — complete in PR #16

The existing correction backend is now exposed through the Business Assistant run-review UI.

Implemented behavior:

- `POST /api/business-assistant/runs/:id/corrections` remains the single generic correction preparation endpoint.
- The Business Assistant UI exposes correction creation only for the latest BizFile review on a committed item whose lifecycle is `NEEDS_REVIEW`, `PASSED`, or `PASSED_WITH_WARNINGS`.
- The panel shows the recorded value beside the independent review's expected correction.
- The user selects findings; the panel does **not** accept arbitrary replacement values.
- Submitted values are the immutable `expected` values from the independent review finding.
- A correction prepares a **new linked proposal**. It does not directly update canonical company data.
- The normal Business Assistant `CONFIRM` flow is still required before a new operation identity is allocated and any canonical write can occur.
- Identical retries use a stable `clientRequestId` and recover the existing proposal rather than creating duplicates.
- The UI distinguishes newly created proposals from idempotently recovered proposals.
- Changing the selected findings clears stale success/error state.
- Structured values render with valid block markup and correction checkboxes have explicit accessible names.

The shared client/server contract lives in `src/lib/bizfile-correction-contract.ts` and owns:

- allowed factual finding codes;
- deterministic correction source paths; and
- `BIZFILE_CORRECTION_MAX_ITEMS = 20`.

The UI currently presents **26 deterministic scalar or one-to-one fields**, grouped into entity details, SSIC activity, financial year/compliance, capital/currency, and address/auditor sections. A single proposal can contain **1–20 corrections**. When 20 are selected, additional unselected findings are disabled until one is deselected.

Allowed finding codes are:

- `SELECTED_FIELD_MISMATCH`
- `PERSISTED_FIELD_MISSING`
- `APPROVED_FIELD_MISMATCH`

Collection-row corrections remain intentionally unsupported, including officers, shareholders, charges, share-capital rows, and former-name rows. Those require a separate identity-aware correction contract.

### Correction backend — implemented, with production hardening still open

`src/services/business-assistant/correction.service.ts` provides the module-neutral correction proposal flow. The BizFile handler is `src/services/bizfile/application/prepare-correction.ts`.

The server validates the requested finding/value, old proposal and approval bindings, operation receipt identity, immutable source evidence and retained-byte hash, legitimate source-pointer finalization, review coverage/snapshot bindings, current source/company authorization, and current company revision. It rebuilds the canonical change plan and rejects a correction if the factual change no longer exists against current state.

Original approvals, operation receipts, operations, and reviews remain unchanged. A correction is always represented by a new run/item/proposal lineage.

Still open for this backend:

- full real-storage/real-BizFile correction execution coverage through confirmation, canonical execution, effects, review, and rollback;
- moving retained-source storage reads out of the authorization transaction into an authorized prefetch/revalidation design;
- measuring lock/timeout behavior under that corrected transaction boundary; and
- identity-aware collection-row corrections.

### Independent source review — partially complete

A connector-aware independent extractor produces explicit `REVIEWED`, `ABSENT`, `UNREADABLE`, or `UNSUPPORTED` section attestations. Source SHA-256, PDF/image decoding, one-based page references, completeness, provider identity, and evidence bindings are validated by the server.

Current factual comparison remains intentionally limited to `SELECTED_CHANGES_ONLY`. Complete source coverage cannot by itself produce a factual PASS when full-state/unselected comparison is not established.

Still required:

- compare unselected/full-state source differences against immutable before/after evidence;
- detect unauthorized unselected writes;
- distinguish later human edits from import defects;
- complete annotated held-out reviewer evaluation; and
- agree release thresholds with the domain/product owner before model comparison.

Do not infer review quality from mocked tests, provider confidence, or user acceptance.

### Manual BizFile upload path

The manual BizFile upload remains a canonical module flow independent of assistant review.

- New company creation uses the editable BizFile workspace as the final review and saves through `Confirm & Save` after server preparation.
- Existing-company updates retain the final proposed-change modal.
- Preparation binds the exact plan/token, source, actor/workspace, mode, selected changes, task context, and contact decisions.
- Direct-save bypasses without a prepared plan remain rejected.

The earlier user-reported `Forbidden` preparation path and missing-save confusion were addressed in the manual upload flow, but live production verification still depends on deployment.

### Origin validation follow-up

Business Assistant routes share the application's exact-origin validation rather than comparing the public browser origin with an internal Docker URL. Host and explicitly configured allowed origins are used without trusting forwarded headers.

If a production proxy rewrites Host, configure the approved public origin explicitly in deployment environment configuration. Rebuild/recreate the app after server-side origin changes; a browser refresh cannot update the running container code.

### Preferences, retries, authorization, and recovery

Current implemented boundaries include:

- transaction-bound actor/workspace authorization for assistant mutations;
- shared business-operation barrier participation;
- restore-pause checks;
- transaction-scoped request replay;
- capability/version-scoped memory versioning and supersession;
- read-only retry without the canonical mutation gate;
- write retry retaining the mutation gate;
- fresh resource authorization before protected work; and
- durable operation identity/reconciliation for committed or uncertain work.

Learning promotion remains blocked while only static validation exists. Do not treat a schema-valid candidate as a behaviorally evaluated candidate.

### PostgreSQL authorization bug resolved

The fresh-authorization advisory-lock helper previously selected PostgreSQL functions returning `void`, which Prisma 7 could not deserialize. The implementation now acquires the same transaction locks while selecting a scalar value. Focused authorization and guarded PostgreSQL recovery suites pass with the corrected query shape.

## PR #16 review record

PR #16 was implemented and then subjected to **10 review → fix → commit cycles**. Every cycle produced a material fix, so the early-stop rule of three consecutive clean reviews was never reached.

Review outcomes:

| Cycle | Fix |
|---|---|
| 1 | Guarded deterministic correction-field parity |
| 2 | Guarded allowed review finding-code parity |
| 3 | Improved supported-field presentation and post-creation guidance |
| 4 | Cleared stale mutation feedback when selection changes |
| 5 | Distinguished a new proposal from an idempotently recovered proposal |
| 6 | Fixed invalid structured-value markup and improved checkbox accessibility |
| 7 | Gated correction entry to backend-correctable committed lifecycle states |
| 8 | Replaced brittle source-text parity checks with a shared client/server correction contract |
| 9 | Enforced the API's 20-correction limit in the UI |
| 10 | Reused the same shared 20-item limit in request validation |

The final review also caught a CI-only issue: the Next production build compiled successfully and then exhausted Node's default ~4 GB heap during validation. Earlier repository evidence already showed that this production build succeeds with an 8 GB heap. `.github/workflows/node24-compatibility.yml` now sets `NODE_OPTIONS=--max-old-space-size=8192` for the build step instead of treating runner memory exhaustion as an application compile failure.

## Documentation and credential cleanup in this merge

The merge candidate updates the Business Assistant documentation set:

- adds `docs/features/business-assistant/CORRECTION_WORKFLOW.md` with the implemented deterministic correction flow, server invariants, request limits, user experience, implementation map, and remaining P12 work;
- consolidates this implementation plan around the current checkpoint and remaining P12-P16 work while preserving the verbose earlier plan in Git history;
- updates `docs/INDEX.md` to link the correction workflow and current handover; and
- removes working application/MinIO credentials from `docs/README.md`, replacing them with `.env` placeholders and secret-manager guidance.

The README no longer publishes a default application password or working MinIO secret. Local MinIO access is documented through `S3_ACCESS_KEY` / `S3_SECRET_KEY` in the developer's local `.env`.

**Important:** removing credentials from the current README does not erase them from Git history. If the removed values were ever used outside an isolated disposable development environment, rotate them separately. Do not rewrite repository history as part of this Business Assistant PR unless that remediation is deliberately authorized.

## Verification status for the merge candidate

Latest pre-merge CI evidence before the 8 GB workflow adjustment:

- Node 24 runtime setup: pass
- dependency installation: pass
- lint: pass
- committed assistant registry freshness: pass
- Prisma generation: pass
- TypeScript typecheck: pass
- Chromium path suite: **6 tests passed**
- Business Assistant/BizFile focused contract run: **34 test files / 295 tests passed**
- Business Assistant PostgreSQL recovery and authorization job: pass
- production Docker image build: pass
- final image Node 24/Chromium verification: pass
- Next build compilation: pass
- Next build validation under default ~4 GB heap: runner OOM

The workflow is now configured with the documented 8 GB build heap. **Merge only after the final PR run on the updated documentation/CI head is green.**

No production deployment, live provider call, production migration, or production storage mutation is authorized by this document.

## Current outstanding work — execution order

### 1. P12 correction hardening

The correction UI entry and deterministic-field presentation are complete. Remaining correction work:

1. Move storage/network reads out of the authorization transaction. Perform an authorized prefetch, then revalidate source identity/revision/hash under the transaction before preparing the correction.
2. Add a full real-storage/real-BizFile correction test that covers preparation, fresh approval, canonical execution, required effects, read-back, review, rollback/recovery, and preservation of the original source operation lifecycle/evidence.
3. Measure transaction lock duration, timeout behavior, and concurrent baseline/source changes.
4. Design identity-aware collection-row correction contracts separately. Do not extend scalar path semantics to officers/shareholders/charges by array position.

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

`src/services/business-assistant` must remain module-neutral. BizFile-specific field parsing, UEN rules, table access, and canonical mutation behavior belong behind capability/application handlers.

A second module should be able to register a read-only or canonical-write capability without changing the generic route family or introducing fake document/receipt/review requirements.

### Exact approval

Any canonical write must bind the exact proposal revision, selected item set, prepared item hash, source/target identity, actor/workspace, policy/capability version, and applicable revisions.

A changed proposal requires fresh review/approval. Do not mutate an old approved artifact in place.

### Canonical mutation and recovery

- Canonical business tables are changed only through module-owned canonical commands.
- A committed operation keeps its original operation identity.
- Lost responses or worker restarts reconcile that identity rather than creating a replacement write.
- Required effects resume from durable intent; they do not rerun the company mutation.
- `OUTCOME_UNKNOWN` remains nonterminal until reconciliation establishes commit/no-commit.

### Fresh authorization

Fresh authorization is required at protected request, provider, preparation, confirmation, and resource-read boundaries as designed. Cached UI visibility never substitutes for transaction-time authorization.

Authorization loss may stop new user/provider work while audited canonical recovery is still allowed to finish already committed required effects.

### Source and review evidence

- Preserve immutable source identity/hash/revision evidence.
- Keep original committed receipt evidence separate from current state drift.
- Never rewrite an old receipt/review to make a later correction look like the original operation was correct.
- Review failure is a review-stage outcome, not permission to replay a committed import.

### Correction

- Correction always creates linked new proposal lineage.
- UI values come from allowlisted independent-review findings.
- Server remains authoritative even when the UI hides an ineligible action.
- Collection corrections require stable record identity semantics.

### Learning

- Current-turn style instructions are not persistent-memory consent.
- Inferred preferences remain candidates until governed activation.
- Static schema validation is not behavioral evaluation.
- Deleted preference data must not reappear through rollback, cache, or derived candidates.

## Implemented/verified foundation summary

The implementation history before this checkpoint established the following boundaries. These are not a claim that every original P01-P11 acceptance criterion is permanently closed; revalidate affected gates when changing their code.

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
| Correction | Linked deterministic-field proposal preparation plus P12 UI entry |
| Learning | Candidate/static-validation protections exist; behavioral promotion still blocked |

## Remaining package definitions

### P12 — Evidence, independent review, findings, and correction

**Current state:** partially complete. Deterministic correction UI is complete; independent full-state comparison/evaluation and correction production hardening remain.

Required gate:

- deterministic invariants/conformance first;
- immutable source and receipt evidence;
- validated finding identity/severity/page references/coverage;
- no PASS with missing required coverage or unexplained unapproved changes;
- correction with fresh proposal/approval and preserved original operation evidence;
- agreed held-out reviewer-quality evidence for internal pilot.

### P13 — Batch fairness, partial outcomes, and resource budgets

**Depends on:** P12 safety/review contract.

Required gate:

- one-to-ten item isolation and deterministic partition/order;
- deployment-wide capacity/fairness across processes/workspaces;
- explicit per-item outcome and review dimensions;
- bounded pages/evidence/findings/time/provider cost/backlog;
- no silent coverage reduction when a budget is exhausted;
- cancellation/expiry/revocation behavior across mixed-stage batches;
- no duplicate mutation or cross-document prompt leakage.

### P14 — Governed preference and learning lifecycle

**Current state:** authorization/static-validation foundations exist; promotion remains intentionally blocked.

Required gate:

- confirmed harmless preference path;
- feedback → candidate → held-out behavioral evaluation → authorized activation;
- visible behavior/configuration consumption;
- source-controlled allowed targets;
- versioned promotion/rollback;
- expiry/deactivation/delete including cache/derived candidate cleanup.

### P15 — Operations, retention, backup, audit, and deployment

Required gate:

- worker/provider/mutation flags and operating limits;
- durable audit mapping and redacted observability;
- approved retention/legal-hold behavior;
- complete backup/restore/purge coverage;
- pending-version compatibility/recovery;
- real startup/restart/restore/effect-recovery drills;
- module UI fallback with assistant disabled.

### P16 — Cutover and release verification

Required gate:

- current general workspace/nav is usable;
- legacy helpbot surface is removed without deleting shared document AI or required history;
- API/database/environment/index documentation is current;
- Node 24 static/full/focused/PostgreSQL/browser/image/worker/provider evaluation gates are traceable;
- kill switches and rollback path are exercised;
- BA-AC01-23 have evidence or are explicitly marked incomplete.

Release remains incomplete if reviewer quality, governed learning, retention/recovery, active legacy retirement, or real deployment evidence is missing.

## Test and failure matrix still required

| Case | Expected invariant |
|---|---|
| Duplicate turn/confirm; changed body with same key | One logical action; changed body rejected |
| Revise vs confirm | One exact proposal revision/subset wins |
| Worker dies before canonical commit | Retry only with same validated operation/approval context |
| DB commits, response/status write lost | Receipt reconciliation resumes effects/read/review without repeating mutation |
| DB unavailable/in-flight transaction uncertain | Remain `OUTCOME_UNKNOWN`; never blind retry |
| Stale worker/fence | Stale state update and stale mutation rejected |
| Cancel/revoke before gate | No canonical write |
| Cancel/revoke after commit | Reconcile committed outcome and required effects only |
| Concurrent CREATE same UEN | Explicit conflict; never silently convert to UPDATE |
| Unselected field/relationship | Persisted value/ID/history unchanged |
| Completed-source correction | New operation/approval/evidence; old receipt/lifecycle preserved |
| Storage finalize/pointer/page failure | Idempotent effect recovery; no reimport |
| Later human edit before review | Original receipt evidence remains immutable; drift separately reported |
| Missing/unreadable/unsupported source coverage | `NEEDS_REVIEW`/review failure, never fabricated PASS |
| Unauthorized unselected write | Review detects it against immutable before/after evidence |
| Provider timeout/malformed/budget exhaustion | Stage-specific incomplete/retry state; no mutation replay |
| Malicious evidence/memory/links | No tool/authority expansion or unsafe rendering |
| Memory delete then rollback | Deleted value remains unavailable |
| Old capability version after deploy | Compatible committed recovery retained; stale uncommitted approval invalidated |
| Ten items/two workspaces | Isolated contexts/outcomes with bounded fair global progress |

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
npx vitest run __tests__/integration/bizfile --maxWorkers=1
npm run test:browser
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

For production-image verification, use the repository's Node 24 compatibility workflow and verify the final image's Node major, configured Chromium path, executable Chromium binary, and Chromium smoke test.

If a full build or full suite fails, distinguish application/test failures from environment capacity failures. Do not hide either category. The September 10 PR #16 build incident was a runner heap exhaustion after successful compilation, not a TypeScript/contract failure; CI now makes the required heap explicit.

## Operator runbooks to preserve and exercise

| Situation | Permitted action | Prohibited shortcut |
|---|---|---|
| `OUTCOME_UNKNOWN` | Reconcile the original operation/receipt under the canonical serialization boundary | New operation ID to bypass uncertainty |
| Storage/page finalization failed | Resume idempotent required effects from durable intent | Re-run company import |
| Review failed/incomplete | Create a new review attempt with retained old evidence/findings | Manually mark PASS or silently omit coverage |
| Proposal stale/expired | Prepare a linked fresh proposal and require confirmation | Extend/rewrite old approval in place |
| User revoked after commit | Finish only required committed recovery under audited authority | Administrator impersonation for a new assistant action |
| Worker deploy/restart | Drain/reconcile compatible claims and retain recovery handlers | Clear leases and blindly replay writes |
| Assistant disabled | Use ordinary module UI and preserve receipts/effects | Re-enable deprecated direct-save/helpbot fallback |
| Workspace restore | Keep dispatch off while reconciling receipts/effects/artifacts | Replay every restored pending approval |

## Documentation state

Current Business Assistant documentation:

- `docs/features/business-assistant/SPECIFICATION.md` — product/architecture specification
- `docs/features/business-assistant/CORRECTION_WORKFLOW.md` — implemented deterministic correction UI/API/safety behavior
- `docs/plans/2026-09-05-business-assistant-implementation.md` — current implementation handover and remaining work
- `docs/reference/API_REFERENCE.md#business-assistant-endpoints` — route contracts including correction preparation
- `docs/INDEX.md` — documentation navigation
- `docs/README.md` — project quick-start with credentials removed in favor of `.env` placeholders and secret-storage guidance

The pre-consolidation plan remains recoverable from Git history using blob `5ceeff0cd020daf736688224e3fac0e629905502` if a future investigation needs the verbose September 5-10 implementation narrative.

## Next-session objective

Continue with **P12 correction production hardening first**:

1. remove retained-source network/storage reads from the authorization transaction while preserving fresh authorization and source revalidation;
2. add the real-storage/real-BizFile end-to-end correction execution/recovery test;
3. then complete full-state/unselected-write independent review and annotated reviewer evaluation.

After P12, proceed to P14 governed behavioral learning and P13/P15 operational hardening according to dependency and risk, then P16 release verification.

Suggested handover prompt:

> Read `AGENTS.md`, `docs/features/business-assistant/SPECIFICATION.md`, `docs/features/business-assistant/CORRECTION_WORKFLOW.md`, and `docs/plans/2026-09-05-business-assistant-implementation.md`. Business Assistant is the general product and BizFile is the reference capability. The deterministic P12 correction UI has been implemented and reviewed in PR #16. Start with the remaining P12 production-hardening work: move retained-source network reads out of the authorization transaction with transaction-time revalidation, add a real-storage/real-BizFile correction execution/recovery test, then complete full-state/unselected-write independent review and annotated reviewer evaluation. Preserve exact approval, operation identity, immutable evidence, fresh authorization, existing user changes, and shared document AI. Keep provider/mutation dispatch disabled until the corresponding gates pass, and update this handover with exact evidence before moving to the next package.
