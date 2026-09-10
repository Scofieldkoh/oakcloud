# Business Assistant P12 — Independent Source Review Handover (Parallel Agent 2)

> Date: 2026-09-10 (Singapore)
> Branch: `chatgpt/business-assistant-p12-reviewer-agent2-20260910`
> PR: #19 — https://github.com/Scofieldkoh/oakcloud/pull/19
> Base: `cde965ae0caad40c6553c67a164421be956167f0`
> Merge status: **not merged**
> Production provider/mutation gates: **unchanged / not enabled**

This handover is the P12 independent-review completion workstream only. It does not take ownership of correction transaction/prefetch hardening, real-storage correction execution/recovery, P14 learning, P13/P15 operations, P16 release verification, or collection-row correction identity semantics.

## Completed reviewer capabilities

- Added a fail-closed full-state independent reviewer that compares immutable before state, after state, and independent source evidence for every reviewer-contract path rather than selected changes only.
- Added a reviewer-owned BizFile full-state contract covering normalized `entity`, `addresses`, `activities`, `capital`, `officers`, `shareholders`, `auditor`, `compliance`, `charges`, and `document` sections. Evidence producers cannot shrink the denominator by supplying their own path list.
- Added explicit field attribution for confirmed source matches, corrected import-time defects, uncorrected import-time defects, canonical mutation defects, unauthorized unselected writes, independently proven later human edits, source drift, and insufficient evidence.
- A factual PASS requires complete reviewer-owned state coverage, `REVIEWED` attestations for every required path, valid section/page/evidence bindings, source identity/reference/revision/SHA-256 integrity, matching immutable before/after digests, and procedural independence.
- `ABSENT`, `UNREADABLE`, and `UNSUPPORTED` evidence is preserved explicitly and causes abstention rather than a factual PASS.
- Later-human-edit attribution is accepted only when an audit event binds the exact field path, prior and resulting values, actor, audit event ID, source revision, operation completion time, and strictly later event timestamp.
- Added a strict reviewer context allowlist so planner history, assistant memory, persona/personalization, mutation tools, conclusions, renamed arbitrary context, and nested payloads are not exposed to the independent reviewer.
- Added evidence-integrity checks for malformed source references/SHA/revisions, section-reference mistakes, bad/duplicate pages, missing evidence IDs, and cross-section evidence-ID reuse.
- Added a read-only final combiner. The legacy selected-change reviewer remains responsible for approved-change execution conformance, but it cannot establish a factual PASS alone; independent full-state evidence is a mandatory second gate.

## Annotated development fixtures

Development fixtures cover:

1. correct import;
2. selected-field import defect corrected to source;
3. unselected-field import defect;
4. unauthorized unselected write;
5. missing section;
6. unreadable source section;
7. ambiguous/unsupported evidence;
8. independently proven later human edit; and
9. source drift.

Development fixture IDs use the `dev.` namespace.

## Held-out evaluation design

The held-out corpus is physically separated under `__tests__/held-out`, uses a different source identity/hash/revision/value family, and uses `holdout-*` identifiers. A fixture-isolation test fingerprints case payloads and rejects exact evidence-payload overlap with development fixtures. Reviewer execution against held-out cases was intentionally deferred until after cycles 1–8 stabilised reviewer logic and thresholds.

Predeclared metrics and denominators:

- factual PASS precision = correct factual PASS / all predicted PASS;
- factual PASS recall = correct factual PASS / all expected PASS;
- defect recall = correct FAIL / all expected FAIL;
- required-abstention recall = correct ABSTAIN / all expected ABSTAIN;
- attribution accuracy = cases with the expected attribution present / cases declaring an expected attribution;
- false-PASS rate = predicted PASS on any non-PASS case / all held-out cases;
- PASS evidence coverage = reviewed required evidence / required evidence for expected-PASS cases;
- overall evidence coverage is reported separately and is not used to disguise legitimate abstention cases.

Predeclared acceptance thresholds:

| Metric | Threshold |
|---|---:|
| Factual PASS precision | 1.00 |
| Factual PASS recall | >= 0.95 |
| Defect recall | >= 0.95 |
| Required-abstention recall | >= 0.95 |
| Attribution accuracy | >= 0.90 |
| False-PASS rate | 0.00 |
| PASS evidence coverage | 1.00 |

A missing class produces a zero-denominator metric value of zero and therefore cannot accidentally satisfy the corresponding threshold. Aggregate accuracy is intentionally not an acceptance criterion.

## Held-out corpus categories

The predeclared held-out set includes correct import, corrected selected defect, unselected import defect, unauthorized unselected write, selected mutation defect, missing section, unreadable section, unsupported evidence, absent evidence, source drift, independently bound later human edit, bad section binding, and immutable digest tamper.

The evaluation test emits `P12_HELD_OUT_REVIEWER_REPORT=<json>` to CI logs. Results must be taken from the final Node 24 PR workflow; do not infer quality from the fixture definitions or from mocked-provider confidence.

## Exact ten-cycle review record

| Cycle | Substantive review finding | Fix committed |
|---|---|---|
| 1 | Full-state logic without adversarial tests could regress into a false PASS. | Added the fail-closed full-state evaluator plus tests for missing canonical paths, unexplained unselected writes, and digest tamper before the first commit. |
| 2 | Evidence could self-declare an incomplete `canonicalPaths` denominator and still appear complete. | Added a versioned reviewer-owned BizFile full-state contract and ignored producer-supplied completeness paths at the final contract gate. |
| 3 | A blacklist of planner/memory/persona keys could be bypassed by renamed or nested context. | Replaced the final-gate context boundary with a small allowlist of scalar routing/audit identifiers and rejected all other context. |
| 4 | A timestamped human-edit marker alone could incorrectly exonerate a mutation. | Required exact path, before/resulting values, actor, audit ID, source revision, and post-operation timing before accepting later-human attribution. |
| 5 | Selected/unselected defects and unauthorized writes needed annotated behavioural proof, not isolated examples. | Added annotated fixtures covering correct import, selected defect, unselected defect, unauthorized write, missing/unreadable/ambiguous evidence, later human edit, and source drift. |
| 6 | Mutually matching but malformed source metadata and reused evidence IDs could still look trustworthy. | Added source SHA/reference/revision integrity, exact section/page binding checks, and cross-section evidence-ID uniqueness. |
| 7 | Held-out cases could accidentally duplicate development evidence under different IDs. | Added a physically separate held-out corpus with distinct data plus fingerprint-based fixture-overlap rejection; the reviewer was not run on it in this cycle. |
| 8 | Aggregate accuracy would hide dangerous false PASSes and abstention quality. | Predeclared separate precision/recall/abstention/coverage metrics with explicit denominators and fail-closed thresholds. Reviewer logic and thresholds stabilised here. |
| 9 | Modifying the legacy selected-change reviewer directly would couple this work to correction-runtime ownership; it also intentionally cannot set full-state complete. | Added a read-only final combiner requiring both selected-change conformance and the independent full-state gate; added the held-out evaluation test without changing stabilized reviewer logic. |
| 10 | The Node 24 workflow targets `__tests__/services/bizfile`, while isolated reviewer tests live beside their modules, so CI could miss them. | Added a CI-visible BizFile reviewer suite shim that imports the complete isolated reviewer suite, including held-out evaluation, into the existing Node 24 BizFile test target. |

The branch must contain exactly ten workstream commits after the base. The final commit SHA is intentionally recorded in PR/final-delivery metadata rather than self-referenced inside this commit, because a Git commit cannot contain its own final hash without changing that hash.

## Known limitations / outstanding gaps

- The new final full-state gate is read-only and intentionally does not alter correction/canonical mutation behaviour.
- Collection-row correction identity semantics remain outside this workstream.
- Full real-storage correction execution/recovery and transaction timing/race work remain owned by Parallel Agent 1.
- Reviewer quality is acceptable only if the final CI-held-out report reaches every predeclared threshold. If CI fails or the report is unavailable, status remains **not quality-verified**.
- These synthetic/annotated source fixtures validate deterministic reviewer semantics. They do not substitute for P16 real-provider/storage release verification.
- No user acceptance, provider confidence, static schema validation, planner conclusion, assistant memory, or persona is treated as reviewer-quality evidence.

## Verification required on final head

Use the repository's existing Node 24 compatibility workflow and require all applicable jobs to pass. Relevant checks include lint, assistant capability registry freshness, Prisma generation, TypeScript, reviewer unit/annotated/held-out tests via the BizFile CI shim, existing Business Assistant/BizFile contracts, PostgreSQL recovery/authorization and BizFile integration suites, application build, and production image/runtime compatibility.

If the final workflow does not run or does not expose a held-out report, record that limitation rather than reporting a PASS.
