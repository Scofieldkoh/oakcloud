# Business Assistant — Review and Implementation Handover

> **Updated:** 2026-09-10  
> **Status:** P12 deterministic correction UI, retained-source prefetch boundary, and Agent 1 correction transaction/recovery hardening are implemented in review branches; broader P12 and Business Assistant release gates remain incomplete  
> **Current Agent 1 PR:** [#22 — Harden Business Assistant P12 correction runtime and recovery](https://github.com/Scofieldkoh/oakcloud/pull/22)  
> **Agent 1 branch:** `chatgpt/p12-correction-runtime-agent1-20260910`  
> **Base:** `cde965ae0caad40c6553c67a164421be956167f0`  
> **Predecessors:** [#17 — retained-source correction hardening](https://github.com/Scofieldkoh/oakcloud/pull/17), [#16 — deterministic correction UI](https://github.com/Scofieldkoh/oakcloud/pull/16)  
> **Design:** [Business Assistant specification v1.4-review](../features/business-assistant/SPECIFICATION.md)  
> **Correction workflow:** [Business Assistant BizFile Correction Workflow](../features/business-assistant/CORRECTION_WORKFLOW.md)

This is the current implementation handover. The detailed predecessor handovers remain available in Git history. Do not infer completion of broader P12, P13, P14, P15, P16, or the overall Business Assistant from this Agent 1 workstream.

## Start here next session

Business Assistant is the **general Oakcloud assistant product**. BizFile is a registered reference capability, not the product boundary. Keep `src/services/business-assistant` module-neutral and keep BizFile parsing, canonical mutation, source semantics, and receipt logic behind the BizFile capability/application boundary.

Read, in order:

1. `AGENTS.md`
2. `docs/features/business-assistant/SPECIFICATION.md`
3. this handover
4. `docs/features/business-assistant/CORRECTION_WORKFLOW.md`
5. applicable RBAC, service, database, environment, staging, and deployment references before changing those surfaces

Do not enable provider or mutation dispatch, deploy to production, run production migrations, mutate production storage, weaken exact approval, or discard canonical recovery evidence merely because CI passes.

## Current P12 correction architecture

`POST /api/business-assistant/runs/:id/corrections` remains the generic correction preparation endpoint. Correction is restricted to allowlisted deterministic scalar/one-to-one fields. Collection-row correction by array index remains intentionally unsupported until stable record identity semantics are designed.

A correction never edits the old operation. It creates a **new linked proposal**, waits for the normal fresh `CONFIRM`/approval flow, receives a new operation identity only after approval, and then executes through the module-owned canonical write path. The original source run, item lifecycle, operation ID, approval, receipt, review, source evidence, and before/after evidence remain historical records.

PR #17 established the retained-source boundary:

- retained-source authorization, storage reads, and SHA-256 verification occur before the serializable correction proposal transaction;
- prefetched evidence is bound to capability ID/version/contract and remains evidence-only;
- transaction-time actor/workspace authorization, restore/pause policy, source run/latest review/item, capability binding, source document identity/version/source revision/storage pointer, receipt/review binding, and company aggregate revision are authoritative;
- a stale source pointer, source revision, source version, company baseline, capability binding, permission, or restore state fails closed;
- no retained-source `storage.download` occurs inside transactional correction preparation.

## Parallel Agent 1 — PR #22 correction runtime / transaction / recovery hardening

### Completed in this workstream

1. **Bounded correction proposal transactions.** `src/services/business-assistant/correction-transaction.ts` applies explicit correction-only Prisma interactive-transaction bounds (`maxWait=2s`, `timeout=5s`) while retaining the repository serializable-conflict retry budget of three attempts. This does not change unrelated Business Assistant/BizFile transaction policy.
2. **Transaction-time capability authority.** Focused tests prove capability ID, capability version, and contract changes occurring after prefetch fail with `PROPOSAL_STALE` before a new run/item/proposal/action write.
3. **Source/baseline race coverage.** BizFile correction tests independently cover aggregate baseline, source revision, source document version, and legitimate source-pointer movement between prefetch and transaction; transactional preparation performs no storage download.
4. **Measured PostgreSQL lock timeout.** A disposable-database integration suite holds a row lock, applies a 100 ms PostgreSQL `lock_timeout`, measures the observed wait, and verifies bounded failure instead of indefinite blocking. The same suite exercises baseline/source-revision/source-version/source-pointer drift using serializable PostgreSQL transactions.
5. **Disposable-database safety fence.** The new PostgreSQL test refuses to run unless the connection is exactly the repository's isolated `assistant_test@127.0.0.1:55439/business_assistant_test` database.
6. **Recovery operation identity.** Reconciliation regression coverage proves repeated recovery reads query and return the new correction operation identity; they do not fall back to the original source operation.
7. **Historical source immutability.** Correction proposal tests explicitly reject future regressions that update/delete the original source run, run item, or review while new correction lineage is created. The source operation and receipt reference remain unchanged.
8. **Retry/timeout semantics.** Serialization conflicts retry only within the three-attempt correction budget; timeout/non-serialization errors are not blindly retried.
9. **Scope discipline.** No P12 full-state independent-review implementation, P14 learning work, P13/P15 general operations changes, P16 release work, collection-row semantics, production dispatch, production migration, or production storage mutation is included.

### Existing canonical execution/recovery path relied on by this workstream

The established worker/capability path remains authoritative and is not duplicated:

- fresh exact approval is loaded before canonical write;
- the BizFile capability executes its module-owned canonical command and returns durable operation receipt/evidence/effect intents;
- committed writes continue through required effects, canonical read-back, and independent-review handoff;
- `OUTCOME_UNKNOWN` remains recoverable and reconciliation uses the same operation identity/advisory gate as the writer;
- a proven `NO_COMMIT` can re-enter execution only under still-valid approval, while a committed receipt resumes effects/read/review without replaying the company mutation;
- storage/PDF effect I/O occurs outside database write transactions.

### Known limitations / still outstanding

This PR strengthens the correction runtime and its component/integration evidence, but **does not claim the whole P12 release gate is complete**. Remaining work includes:

- a single full-stack fixture that drives one real retained local-storage BizFile correction continuously from preparation through fresh confirmation/approval, canonical mutation, required storage/page effects, canonical read-back, independent-review handoff, and injected rollback/recovery while asserting the original source history end-to-end;
- broader full-state/unselected independent-review logic and reviewer-quality evaluation, owned by the parallel P12 review workstream;
- collection-row correction identity semantics (officers/shareholders/charges/etc.); do not extend scalar paths by array index;
- staging/release verification and deployment topology evidence under P16;
- P13/P15 batch/retention/backup/runbook hardening and P14 governed learning, owned by their respective parallel agents.

The Node 24 workflow already exercises real disposable PostgreSQL Business Assistant recovery/authorization plus the complete `__tests__/integration/bizfile` suite. PR #22 adds correction-specific races to that suite through `__tests__/integration/bizfile/bizfile-correction-races.postgres.test.ts`.

## Agent 1 exact ten-cycle review / fix / commit record

There are exactly ten workstream commits after base `cde965ae0caad40c6553c67a164421be956167f0`. Cycle 1 contains implementation → review → fix → commit; Cycles 2–10 contain review → fix → commit. The final Cycle 10 commit is the PR head; its exact SHA is reported by PR #22/final delivery because a commit cannot embed its own SHA before creation.

| Cycle | Commit | Genuine review finding / fix |
|---|---|---|
| 1 | `b83966ea31b5aa2a234397240692d5f0b647211c` | Correction preparation inherited implicit Prisma interactive-transaction limits. Added correction-scoped explicit max-wait/timeout and retry-budget tests. |
| 2 | `a0cc732413029ccb5c04ad9d0f7f5cbe38bcc4c3` | The new bounded helper was not yet used by the correction service. Wired correction proposal preparation to it without changing unrelated transactions. |
| 3 | `6bf6230443c6d8ba63c8845f50ecf819597f0e5f` | Existing race tests covered aggregate/source revision but not document version or legitimate pointer movement. Added both fail-closed cases with zero transaction-time storage I/O. |
| 4 | `a255c12274ebaa6f03edee9ed71eeeaf1bf7c992` | Retry tests proved eventual success but not exhaustion. Added three-conflict exhaustion coverage and asserted no fourth transaction attempt. |
| 5 | `914821bce63c4ba88b9371b4ec53d723463c8155` | Prefetched evidence could not be considered safe without explicit capability-binding race tests. Added capability ID/version/contract drift coverage proving transaction-time state wins before writes. |
| 6 | `c928fd7476cd42bb8f4448a0ef7e3bc940ef6013` | Mock tests did not measure real database blocking. Added disposable PostgreSQL lock-duration/timeout measurement and serializable stale-state race coverage. |
| 7 | `1bb37f953a84302ebe337dcacdaf5e0d8b2308c8` | The new test database guard was too permissive for a destructive/concurrency test. Restricted it to the exact isolated repository test database. |
| 8 | `0126475b35a6324eb4ecda242fbad3a10b50ba4d` | Reconciliation was generally tested read-only, but correction-specific operation identity was not pinned. Added repeated recovery coverage bound to the correction operation, never the source operation. |
| 9 | `e172eb350b5f4eff72e446b384708c1b2eccd1ac` | New-lineage behavior was tested, but source-history immutability was not an explicit regression condition. Added assertions that source run/item/review lifecycle, operation, receipt, and evidence are not updated/deleted. |
| 10 | PR #22 final head | Final diff review found avoidable formatting churn in the BizFile correction preparation fixture and stale handover status. Restored base formatting while retaining only the two intended race cases and updated this handover with exact scope, limitations, tests, branch/PR, and cycle record. |

### Parallel branch collision note

The initially created name `chatgpt/business-assistant-p12-correction-runtime-20260910` was independently advanced while this workstream was in progress. GitHub correctly rejected a non-fast-forward update. Agent 1 did **not** force-push or overwrite that parallel work. The exact nine-cycle chain was instead preserved on the collision-free branch `chatgpt/p12-correction-runtime-agent1-20260910`, and PR #22 was opened from that branch before Cycle 10 so this handover could record the real PR number.

## Verification requirements for PR #22

The final PR head must pass the repository Node 24 compatibility workflow. That workflow is the authoritative verification surface and includes:

- Node 24 runtime verification;
- lint;
- committed Business Assistant capability-registry freshness;
- Prisma generation;
- TypeScript typecheck;
- Chromium path tests;
- focused Business Assistant/BizFile contracts;
- disposable PostgreSQL durable-worker and concurrent-authorization tests;
- the complete BizFile integration suite, including the correction race/lock test;
- production application build with the documented heap; and
- production image/runtime/Chromium smoke verification.

Before final delivery also review the final PR diff for scope leakage and confirm there are exactly ten commits after the base. No merge to `main` is authorized by this handover.

## Architecture invariants to preserve

### Generic core

`src/services/business-assistant` remains module-neutral. BizFile-specific parsing, source rules, table access, canonical mutation behavior, receipts, and effects stay behind capability/application handlers.

### Exact approval

Every canonical write binds exact proposal revision, selected item set, prepared item hash, source/target identity, actor/workspace, capability/policy version, and applicable revisions. A changed/stale proposal requires a fresh proposal/confirmation; never rewrite an old approval.

### Canonical mutation and recovery

- Canonical business tables change only through module-owned canonical commands.
- A committed operation keeps its original operation identity.
- Lost responses/restarts reconcile that identity; they do not allocate a replacement write.
- Required effects resume from durable intent and do not rerun the company mutation.
- `OUTCOME_UNKNOWN` remains nonterminal until reconciliation proves commit/no-commit.

### Fresh authorization and transaction authority

- Fresh authorization is required at protected request/provider/preparation/confirmation/resource-read boundaries as designed.
- Cached/preflight state never overrides transaction-time authorization.
- Prefetched retained-source evidence is evidence-only.
- Mutable source identity/version/revision/pointer, baseline revision, capability contract, restore state, and authorization are revalidated transactionally.
- Retained-source/storage network I/O stays outside the serializable correction proposal transaction.

### Immutable source/review/correction evidence

- Preserve source identity/hash/revision evidence and the original committed receipt/review.
- Later correction/drift never rewrites an old receipt to make the original operation appear correct.
- Correction always creates linked new proposal/operation lineage.
- Collection corrections require stable record identities rather than array positions.

## Other parallel packages remain separate

### P12 independent review

Full-state/unselected comparison, unauthorized unselected-write detection, import-defect vs later-human-edit/source-drift classification, annotated source/page coverage, and held-out reviewer-quality evaluation remain owned by the independent-review workstream.

### P13/P15 operations

One-to-ten item fairness/partial outcomes, provider/resource/retry budgets, retention/legal hold, backup/restore/purge ordering, staging recovery drills, and operator runbooks remain owned by the operations workstream.

### P14 learning

Held-out behavioral evaluation, source-controlled learnable targets, expected-version promotion CAS, activation consumption, rollback/deactivation/expiry/delete cleanup, and audit lineage remain owned by the governed-learning workstream. Static schema validation is not behavioral evaluation.

### P16 release

Real provider/storage/deployment topology, final browser acceptance, reviewer-quality/learning gates, legacy cutover scans, kill switches/fallbacks, and release evidence remain incomplete until separately verified.

## Failure matrix to keep exercising

| Case | Required invariant |
|---|---|
| Duplicate correction request | Existing action may suppress prefetch; transaction alone decides replay/conflict |
| Baseline/source pointer/revision/version changes after prefetch | Transaction fails closed; no silent rebase |
| Capability ID/version/contract changes after prefetch | Transaction fails closed before new lineage writes |
| Permission/restore state changes after prefetch | Fresh transaction-time state blocks new proposal writes |
| Serializable conflict | Retry only inside the bounded correction budget |
| Transaction timeout/non-serialization failure | Fail; do not blind-retry as a serialization conflict |
| Worker dies before canonical commit | Retry/reconcile only the same approved operation context |
| DB commits but worker response/state write is lost | Reconcile committed receipt, resume effects/read/review; never repeat canonical mutation |
| In-flight outcome remains uncertain | Stay `OUTCOME_UNKNOWN`; never allocate a replacement write |
| Completed-source correction | New proposal/approval/operation/evidence; original source lifecycle and receipt remain immutable |
| Storage/page effect failure | Resume idempotent effect intent; no company reimport |
| Collection finding | Reject until stable record identity semantics exist |

## CI commands / environment

Use Node 24 and only isolated disposable PostgreSQL/storage environments:

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

Use `.github/workflows/node24-compatibility.yml` for the complete Node 24 / production-image verification. Never point concurrency/destructive tests at the application or production database.

## Merge policy

PR #22 must remain unmerged until the repository owner explicitly authorizes integration. Do not enable auto-merge. Do not enable production provider dispatch or mutation dispatch as part of this PR. Do not deploy or perform production migrations/storage changes from this handover.
