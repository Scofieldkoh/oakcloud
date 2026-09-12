from pathlib import Path

CANDIDATE = "6e8d4426c0d57043d85a830045dee465f6ff9a47"


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Missing expected marker in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


def append_once(path: Path, marker: str, addition: str) -> None:
    text = path.read_text()
    if marker in text:
        return
    path.write_text(text.rstrip() + "\n\n" + addition.strip() + "\n")


g2 = Path("docs/plans/2026-09-10-a4-editor-implementation/coordination/g2.md")
replace_once(
    g2,
    "Status: **G2 CANDIDATE BLOCKED — CORRECTION REQUIRED**",
    "Status: **G2 CORE CANDIDATE FROZEN — Q1 RELEASED**",
)
replace_once(
    g2,
    "This is a CORE integration closeout only. It does not mark G2 passed/frozen and does not execute Q1.",
    "This record preserves the original blocked closeout and records its correction. CORE has frozen the corrected production candidate for independent Q1. G2 is not marked passed until Q1 reports the required boundary/reader/output evidence, and CORE does not execute Q1.",
)
replace_once(
    g2,
    "## Gate decision\n\n**G2 CANDIDATE BLOCKED — CORRECTION REQUIRED**\n\nQ1: **WITHHELD** until a corrected immutable candidate passes all required CORE-side checks.\n\nNo C3, S3, F3, W3, deployment, or version bump is authorized.",
    "## Historical blocked gate decision — superseded by corrected candidate below\n\n**G2 CANDIDATE BLOCKED — CORRECTION REQUIRED**\n\nQ1 was **WITHHELD** at this checkpoint until a corrected immutable candidate passed all required CORE-side checks.\n\nNo C3, S3, F3, W3, deployment, or version bump was authorized.",
)
append_once(
    g2,
    "## Corrected candidate resolution and Q1 release",
    f"""
## Corrected candidate resolution and Q1 release

Date: 2026-09-12

Current CORE decision: **G2 CORE CANDIDATE FROZEN — Q1 RELEASED**

Frozen production candidate for independent verification: `{CANDIDATE}`.

The production candidate is the product commit above. Later coordination-only commits on PR #47 do not change the candidate under verification. Production edits are frozen while Q1 runs. The frozen contract remains **v1 frozen at G0 — unchanged** and G1 remains **FROZEN/PASSED**.

### Resolved blockers

1. **SEMANTICS/S2 indent limit** — indentation now preserves the required usable content width instead of allowing the 288px overshoot; the focused S2 lane is green.
2. **SEMANTICS/S2 mixed formatting** — selected text-node sampling now aggregates cross-span state correctly; component and real-Chromium mixed-formatting proofs are green.
3. **SEMANTICS/S2 unlist** — `clearA4S2ListType` provides a semantic unlist transaction while preserving surrounding ordered-list values; CORE routes active-list toggle-off through it and retains C1 history/revision authority.
4. **WORKFLOW/W2 compatibility proofs** — W1 source-contract tests now inspect the extracted Wave-2 workflow implementation/service boundaries rather than stale pre-extraction source locations.
5. **CORE caret viewport follow** — post-repagination restoration follows the restored flow element by real geometry; the formerly failing Enter/caret Chromium sequence is green.

No database schema or migration was added by these corrections.

### Immutable corrected-candidate evidence

All evidence below checks out exact production candidate `{CANDIDATE}` under Node 24; validation-only workflow commits are not the candidate.

- complete corrected component/static matrix: **PASS** — S2 focused, CORE C1/C2 focused, full A4 pagination, FIELDS F1/F2, WORKFLOW W1, WORKFLOW W2 non-PostgreSQL, bundle freshness, lint, typecheck, `npx tsc -b`, and production `npm run build`;
- real Chromium integrated boundary/editor matrix: **66/66 passed** across `a4-input-sequences`, `a4-boundary-semantics`, and `a4-page-editor`;
- disposable PostgreSQL 16: **31/31 passed** after all **71 migrations** replayed — W1 CAS/batch 13/13, W2 drafts 5/5, W2/W1 compatibility 13/13;
- PostgreSQL identity: synthetic `assistant_test` on `127.0.0.1:55439/business_assistant_test`, with all test database URLs pointed there; no production/business data was touched;
- production build used validation-only synthetic environment values and a 6144MB Node heap after the default CI heap proved insufficient; those values are not production credentials or product changes.

An earlier immutable PostgreSQL attempt used the wrong synthetic username (`postgres`) and was rejected by the W2 test environment guard. The corrected rerun above used the suite-mandated `assistant_test` identity and passed; the rejected run is harness evidence, not a product defect.

### Current gate decision

**G2 is READY FOR INDEPENDENT Q1, not yet G2-passed.**

Q1 dispatch: `VERIFY-Q1-20260912-01` in `coordination/dispatch.md`.

CORE stops production editing at `{CANDIDATE}`. VERIFY must independently prove the G2/Q1 boundary, save/reopen, two-item batch identity, old/new reader, and actual PDF/list-continuation requirements against exactly that candidate. A candidate change invalidates the Q1 record and requires a fresh dispatch.

No C3, S3, F3, W3, D1 deployment, or version bump is authorized.
""",
)

core = Path("docs/plans/2026-09-10-a4-editor-implementation/coordination/core.md")
append_once(
    core,
    "## Corrected Wave-2 CORE closeout / Q1 release — 2026-09-12",
    f"""
## Corrected Wave-2 CORE closeout / Q1 release — 2026-09-12

Status: **G2 CORE CANDIDATE FROZEN — Q1 RELEASED**

The earlier blocked Wave-2 closeout above is retained as chronology. CORE corrected all five blocking findings without changing the frozen v1 contract and froze production candidate `{CANDIDATE}` for independent VERIFY/Q1.

Corrections are limited to the integrated Wave-2 boundary: S2 indent/mixed-format/unlist semantics, CORE semantic list-toggle and caret-viewport integration, and W1/W2 source-contract proof alignment. No new database schema/migration, deployment, version bump, C3, S3, F3 or W3 work was introduced.

Immutable corrected-candidate evidence against exact `{CANDIDATE}`:

- corrected S2 focused lane: **107/107 passed**;
- corrected CORE focused lane: **100/100 passed**;
- real Chromium integrated matrix: **66/66 passed**;
- disposable PostgreSQL 16 after **71 migrations**: **31/31 passed** (W1 CAS/batch 13/13; W2 drafts 5/5; W2/W1 compatibility 13/13);
- complete required component/static lanes: **PASS** including full pagination, FIELDS F1/F2, W1, W2 non-PostgreSQL, pagination-bundle freshness, lint, typecheck, `npx tsc -b`, and production build;
- lint completed with no errors; repository warnings remain non-blocking and did not change the gate outcome;
- production build required a larger validation-runner Node heap and synthetic required environment values only; the application candidate was unchanged.

The first immutable PostgreSQL lane used `postgres` instead of the W2 suite-required synthetic username `assistant_test`; its guard failure was corrected in the harness. The exact candidate then passed the complete 31-test PostgreSQL matrix on the required disposable database. No production data was used.

CORE does **not** mark G2 passed from its own matrix and does **not** execute Q1. Production edits are frozen at `{CANDIDATE}`. `VERIFY-Q1-20260912-01` is released in `coordination/dispatch.md` for independent evidence. Any production-code change requires a new immutable candidate and fresh Q1 dispatch.

Stop boundary remains: no C3, S3, F3, W3, D1 deployment or version bump.
""",
)

dispatch = Path("docs/plans/2026-09-10-a4-editor-implementation/coordination/dispatch.md")
replace_once(
    dispatch,
    "Wave 2: **DISPATCHED — IMPLEMENTATION NOT STARTED**",
    "Wave 2: **INTEGRATED — CORRECTED G2 CANDIDATE FROZEN FOR Q1**",
)
append_once(
    dispatch,
    "## VERIFY-Q1-20260912-01 — released after corrected CORE matrix",
    f"""
## VERIFY-Q1-20260912-01 — released after corrected CORE matrix

Dispatch ID: `VERIFY-Q1-20260912-01`

Role / gate: **VERIFY / Q1 — G2 boundary and reader compatibility**

State: **DISPATCHED — independent verification not started**

Immutable production candidate: `{CANDIDATE}`

Integration PR: **#47** on `codex/a4-editor-wave2-g2-integration-20260912`; PR remains open/unmerged. VERIFY must check out the exact candidate SHA above, not a later coordination-only PR head.

Contract: **v1 frozen at G0 — unchanged**.

Prerequisites: **G1 FROZEN/PASSED**; C2, S2, required W1/W2 adapters and the integrated Wave-2 candidate have passed the CORE-side immutable matrix. Production writers/production code are frozen at the candidate SHA while Q1 runs.

### VERIFY ownership and exact lease

VERIFY may write only independent acceptance evidence under these leases:

- `docs/plans/2026-09-10-a4-editor-implementation/coordination/verify.md`;
- new Q1-only acceptance tests, if needed, at `__tests__/browser/a4-q1-acceptance.browser.test.tsx`;
- new Q1-only persistence acceptance tests, if needed, at `__tests__/integration/a4-editor-q1-persistence.test.ts`;
- new Q1-only output acceptance tests, if needed, at `tests/document-output/a4-editor-q1-output.test.ts`.

VERIFY must not edit production code, frozen contracts, shared configuration, existing owner tests, migrations, package metadata, version files, or Git history. A production defect returns to CORE/owner for correction and a new candidate.

### Reserved verification resources

- Node: **24 (`>=24 <25`)**, executable verified in the report;
- primary browser: real Chromium using an isolated context; use `.tmp/a4-q1-verify` for Q1-only browser/cache artifacts;
- server port if a live synthetic app fixture is required: **3423**, released from WORKFLOW after Wave-2 handoff;
- database: only a disposable synthetic test database/schema; no production or existing business data;
- output fixtures: synthetic only; actual generated PDF/HTML may be produced for verification, but nothing may be sent, signed, finalized, filed, or deployed.

### Required Q1 evidence

Run the complete Q1 acceptance in `verification-and-rollout.md`, including Q1-01 through Q1-12. In particular:

- native Enter -> immediate typing, Backspace/Delete, formatting, paste, field insertion, break removal and cross-page selections with no synthetic inter-action waits;
- hard/soft break behavior, nested/long lists, numbering/restart/continuation, Tab/Shift+Tab, toolbar indent, list exit and undo;
- document A/B history isolation and save/reopen agreement across canonical/ref/parent/server/reopened content;
- `ol start=5`, alpha/bold/nested numbering through save/reopen and **actual PDF**, asserting every original item/text once and correct list continuation;
- two-item batch identity/layout preservation and required old/new reader compatibility;
- native blank-page add/delete proof without weakening or skipping assertions;
- the critical deterministic fixture for at least **20 consecutive native sequences** per supported primary browser configuration, plus fault/delayed variants;
- preserve failure artifacts/revisions; one unexplained content-loss event keeps G2 open.

VERIFY must confirm actual HEAD/build equals `{CANDIDATE}` before recording results. If the candidate changes, stop and request a fresh immutable assignment.

### Completion boundary

Write the independent gate report to `coordination/verify.md` with environment, exact commands/counts, native sequence results, PDF/HTML evidence, compatibility/readers, blocked/untested checks, defects and technical promotion decision.

Stop after the Q1 report. Q1 verification is not deployment permission. Do not start Q2, D1, C3, S3, F3, W3, deployment or a version bump.
""",
)
