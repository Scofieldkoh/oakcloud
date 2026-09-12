# CORE handoff log

## CORE-C1-G1-CORRECTION-20260912-01

Dispatch ID: `CORE-C1-G1-CORRECTION-20260912-01`
Role and packet: CORE / C1 corrective owner — integrated G1 canonical integrity blockers only
Starting state: **G1 BLOCKED — CORRECTION REQUIRED**
Ending state: **READY FOR INTEGRATION — G1 remains blocked pending separate SEMANTICS correction integration and integrated G1 rerun**
Frozen contract consumed: **v1 frozen at G0 — unchanged**
Integrated baseline: `603f3a25d168435b56709ef9c2c2e8cdda9af737`
Branch: `codex/a4-editor-core-c1-g1-correction`
Corrective PR: **#41** — `C1 G1 corrective: restore projection and native selection integrity`
Validated production-source commit: `7dff3958f0c70a54378fa3eea2c17f72ede6e60a`
Validation workflow run: `34634080485` — **SUCCESS**
Validation environment: Node `24.20.0`; Playwright Chromium `149.0.7827.55`
Validation completed: `2026-09-11T18:40:05Z` source commit; handoff recorded `2026-09-12T07:19:00+08:00`

### Corrective scope and decisions

- C1 remains the sole canonical session/revision authority. No second canonical document, revision counter, or rendered-page authority was introduced.
- Ordinary canonical edits no longer replace the mounted `PageData[]` projection before revision-qualified reflow publishes. The most recent committed projection remains mounted while a newer canonical revision is being paginated.
- A collapsed native text transaction is repaired only when the S1 transaction returns changed canonical content but a collapsed logical caret that did not advance. The repair is derived from the canonical transaction result and available logical-flow text; SEMANTICS command ownership is unchanged.
- A cancelable canonical `beforeinput` transaction records a revision-bound pairing so the matching post-input event is consumed exactly once rather than being mistaken for a second DOM mutation.
- For an unpaired same-revision native `input` repair, C1 first bookmarks the valid logical selection and then repairs the rendered surface from canonical state; stale rendered DOM never replaces canonical content.
- Native cross-page mouse selection keeps the browser's valid anchor. A collapsed cross-page drag may be reconstructed from localized pointer endpoints only when both endpoints resolve to different rendered page contents. Focus refinement advances by one adjacent glyph only when pointer geometry proves that glyph was reached.
- Parsed pages may publish immediately only when a canonical replacement changes **hard-section topology**. Ordinary soft pagination remains asynchronous and revision-qualified.
- No SEMANTICS-owned algorithm, FIELDS/WORKFLOW production behavior, database schema, deployment setting, version, or frozen contract was changed.

### Validation evidence

The final corrective workflow ran from the integrated Stage-1 baseline with the temporary transform applied in CI and committed production source only after every gate passed.

```text
npx vitest run --config vitest.browser.config.ts \
  __tests__/browser/a4-input-sequences.browser.test.tsx \
  __tests__/browser/a4-boundary-semantics.browser.test.tsx \
  __tests__/browser/a4-page-editor.browser.test.tsx \
  --reporter=verbose
PASS — 3 files, 58/58 tests

npx vitest run \
  __tests__/components/a4-editor-session.test.ts \
  __tests__/components/a4-page-editor.test.tsx \
  __tests__/components/a4-editor-toolbar.test.tsx \
  __tests__/components/a4-page-editor-ssr.test.tsx \
  --reporter=verbose
PASS — 4 files, 94/94 tests

npm run db:generate
PASS

npm run typecheck
PASS

npx tsc -b
PASS

npm run build
PASS

git diff --check
PASS
```

The browser proof covers the blocked CORE regressions together with rapid Enter -> typing, document-order typing, native cross-page selection and replacement, hard-page behavior, caret preservation, committed-projection retention, and per-document history isolation.

### Net files and cleanup

- Production correction: `src/components/documents/a4-page-editor.tsx`.
- Coordination evidence: this `coordination/core.md` handoff entry.
- Temporary validation workflows/scripts and accidental placeholder files were removed before handoff and have **no net PR file diff**.
- The branch intentionally remains unmerged. `main` was rechecked at the integrated baseline `603f3a25d168435b56709ef9c2c2e8cdda9af737` before PR handoff.

### Integration disposition

PR #41 is **READY FOR CORE INTEGRATION REVIEW** but must remain unmerged until the user gives the merge call. This correction alone does **not** declare G1 passed: integrate the separately owned SEMANTICS G1 correction first (or together in the integrator's controlled order), then rerun the canonical G1 gate against the resulting immutable integrated commit. Do not begin C2, S2, F2, W2, deployment, or any Stage-2 work from this handoff.

## CORE-C1-20260911-01

Dispatch ID: `CORE-C1-20260911-01`
Role and packet: CORE / C1 — canonical session, native input and per-document history
Starting state: DISPATCHED
Ending state: **READY FOR INTEGRATION**
Baseline commit: `bfdc4f95594b73ce4d20bff45f320bdb53837c37`
Branch: `codex/a4-editor-core-c1`
Contract consumed: **v1 frozen at G0**
Validated production commit: `c66daf8d2f5feff2fa829abfa792518aa56801a3`
Validation workflow: `A4 C1 review fix validation` run `34587301343` — SUCCESS
Validation completed: `2026-09-11T10:06:28Z`

### C1 implementation and legacy resolution

- The canonical revisioned editor session is the authority for editor content, selection, history, layout metadata and revision-qualified projections. `PageData[]` remains a render/pagination projection.
- Cancelable text, paragraph, line-break, delete, paste and related editor mutations enter through canonical transactions; uninterrupted keyboard input can continue from the pending canonical selection while an older projection is still rendered.
- Stale whole-surface/page DOM can no longer silently replace canonical content. Stale Backspace/Delete boundary paths now fail closed and rebuild the projection from the canonical session.
- Async reflow publication is qualified by the active session plus document/layout/font revisions, so work started for Document A cannot publish into Document B.
- Per-document history remains isolated by `sessionKey`. Undo/redo restores complete editor state, including C1-owned layout metadata, while layout no-ops do not create history entries.
- Controlled external `value` loads and imperative `setContent` replacements are explicit external state transitions and no longer echo through legacy `onChange` as user mutations. Complete C1 snapshots remain available through the snapshot callback.
- Non-cancelable and IME paths retain bounded repair/composition state. Out-of-flow native mutations are repair-only and are discarded in favor of canonical state; active composition does not persist intermediate DOM and reconciles exactly once at `compositionend`.
- The old C0 expected-failure browser proofs were promoted to required passing regressions. Legacy component tests that directly mutated `innerHTML`/styles and then treated native `input` as a persistence API were replaced with canonical `beforeinput`, toolbar-command or explicit stale-projection repair assertions.
- Reversed selections are asserted by logical direction/endpoints across formatted nodes rather than unstable post-format DOM text-node identity.
- Temporary review-fix workflows/scripts were removed by the validated production commit; no temporary validation helper remains in the C1 code diff.

### Validation evidence

Executed in GitHub Actions with Node `24.20.0` and a provisioned Playwright Chromium runtime:

```text
npx vitest run __tests__/components/a4-editor-session.test.ts
PASS — 14/14

npx vitest run __tests__/components/a4-page-editor.test.tsx
PASS — 59/59

npx vitest run __tests__/components/a4-editor-toolbar.test.tsx
PASS — 17/17

npx vitest run __tests__/components/a4-page-editor-ssr.test.tsx
PASS — 4/4

npx vitest run --config vitest.browser.config.ts __tests__/browser/a4-input-sequences.browser.test.tsx
PASS — 3/3 browser sequences

npm run typecheck
PASS

static stale-authority review
PASS
```

The browser run executes the previously expected-failure cases as normal tests: rapid Enter followed immediately by typing without a reflow wait, cross-page Enter over a selection, and Document A -> Document B -> Undo isolation.

### Compatibility and ownership

- Existing public editor refs/props remain compatible; `sessionKey` is an additive identity input with a backward-compatible default.
- No C2 structural-command integration, S1/F1/W1 production implementation, schema migration, deployment or version bump is included in C1.
- SEMANTICS S1, FIELDS F1 and WORKFLOW W1 remain independent Stage-1 producers under their published ownership leases.
- C1 stops here at **READY FOR INTEGRATION**. CORE must not begin C2 until the user resumes it and the required S1 producer evidence is integrated.

## CORE-C0-20260911-01

Dispatch ID: CORE-C0-20260911-01
Role and packet: CORE / C0 — contract and input-routing proof
Starting state: RUNNING
Ending state: READY FOR INTEGRATION
Baseline commit: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Branch: `codex/a4-editor-core-c0`
Contract consumed: proposed v1; G0 remains open

### Workspace and environment evidence

- GitHub `main` was rechecked before branch creation and pointed to `63aa75b6170766a3e3d1728feb5e5417f5632f20`.
- The CORE branch was created directly from that commit. No reset, stash, force update, deployment or merge was performed.
- Root `AGENTS.md` applies; no nearer `AGENTS.md` was found under the CORE source or browser-test directories.
- The GitHub connector exposes the remote repository, not the user's local shared checkout, so local uncommitted/untracked changes in `C:\Users\Scofieldkoh\Documents\oakcloud` cannot be inventoried from this execution environment. The branch therefore preserves remote `main` exactly but does not claim knowledge of local-only edits.
- A container clone was attempted only to obtain an executable Node 24 checkout, but the container could not resolve `github.com`; therefore Node-version verification and test execution are BLOCKED in this environment. No test is reported as passed here.

### Files changed by C0

- `src/components/documents/a4-pagination/editor-session.ts` — bounded executable C01/C04 revision/native-input bridge proof; not wired to production editor behavior.
- `__tests__/components/a4-editor-session.test.ts` — proof cases for stale-DOM rejection, pending canonical keyboard selection, stale-pointer rejection, projection publication, composition and rapid delete revisions.
- `__tests__/browser/a4-input-sequences.browser.test.tsx` — expected-failure baseline regressions for rapid Enter→typing, cross-page Enter and cross-document Undo contamination.
- `docs/plans/2026-09-10-a4-editor-implementation/coordination/dispatch.md` — Wave 0 assignments, leases and resource reservations.
- `docs/plans/2026-09-10-a4-editor-implementation/coordination/{semantics,fields,workflow,verify}.md` — single-writer handoff stubs only; CORE did not start those instances.
- This file — C0 evidence and handoff.

### C0 native sequence regression inventory

The new browser regression file uses the review's 30-item long ordered-list fixture and locates the first paragraph of visual page 2 dynamically. The critical sequence sends `{Enter}NEW` as one native keyboard sequence with no layout/reflow wait between Enter and the first typed character. It asserts all original Item 1–30 labels remain, `NEW` is present, the logical list contains 31 items and the controlled parent value equals `getContent()` after settling.

The same file captures two additional baseline defects requested by C0:

1. Enter over a selection spanning visual pages must change the canonical document, collapse the resulting selection and retain later content.
2. After editing Document A and loading Document B in the same editor instance, Undo must never restore A content into B.

These are deliberately marked as expected-failure regressions while C0 records the broken baseline; C1/C2 must convert them into ordinary passing regressions when the production fix is integrated. They were not executed in this environment, so their current runtime result is not restated as fresh evidence.

### Mutation entry-point routing inventory

| Entry point | Current active behavior | C01/C04 target class | C0 decision / owner boundary |
| --- | --- | --- | --- |
| `beforeinput: insertParagraph` | Captures flow bookmark and calls `insertParagraphAtSelection` | canonical command | CORE dispatches; S owns structural command/position semantics. |
| Cross-page `beforeinput` | Prevents default; delete/text replacement handled, paragraph/line-break falls through to no-op | canonical command | C2 removes physical-page branch after S1. C0 regression records defect. |
| Plain cancelable text input | Usually browser DOM mutation followed by `input`/`commitDocumentSurface` | canonical native-input intent | C1 migrates supported input to revisioned canonical path. |
| Non-cancelable input | Snapshot/repair bookkeeping then DOM reconciliation | bounded native reconciliation | C1 must associate base rendered revision/range; never whole-surface stale replacement. |
| IME composition | Composition-end repair path | bounded composition session | C0 bridge proves one commit and snapshot blocking; real browser/IME remains a later gate. |
| Backspace/Delete at structural boundaries | Keydown/cross-page handlers call logical delete in several branches | canonical command | CORE dispatch + S command/position semantics. |
| Ordinary native Backspace/Delete | Browser DOM then `input` surface commit | canonical native-input intent | C1 revision bridge; rapid-delete proof added. |
| Paste | Prevented; sanitized HTML sent through logical replacement | canonical command/import | CORE dispatch; F owns import/content policy in later packet. |
| Cut/drop and other native mutations | No complete dedicated canonical path located; can reach DOM input commit | native reconciliation until canonicalized | C1 inventory gap remains explicit; do not invent S/F behavior in C0. |
| Inline/block/list/table toolbar commands | Logical formatting/document transactions | canonical command | CORE dispatch; S owns command semantics. |
| Table column resize | Mutates linked rendered tables then `commitDocumentSurface` | bounded native reconciliation or explicit table transaction | C1 must revision-qualify; S owns structural table semantics if extracted. |
| `setContent` | Parses/replaces page state explicitly | replace-document intent | C1 defines history/session policy; must not masquerade as user input. |
| Controlled external `value` | Rehydrates and schedules reflow unless treated as internal echo | controlled echo or replace-document intent | C1 distinguishes acknowledgement/echo from genuine external replacement. |
| Field / HTML insertion through ref | `replaceLogicalSelection` + `commitUserTransaction` | canonical command | CORE owns dispatch; F supplies lifecycle/token transactions later. |
| Layout changes | Updates controlled/internal layout independently of content history | output-affecting metadata transaction | C1 snapshot/history must carry layout revision; W later persists it. |
| Reflow/pagination | Derives pages and publishes React state | non-mutating projection | Must never increment canonical history/revision; publication must match current revisions. |
| Print/preview display | Reads rendered/canonical output paths | non-mutating view/output | C3/W own later shared print/output integration. |

### C01/C04 executable interface proposal

C0 publishes `src/components/documents/a4-pagination/editor-session.ts` as the proposed CORE-owned implementation location, matching contracts v1. Its proof deliberately remains generic over the selection type until SEMANTICS S0 returns the final C02 structural position adapter.

The proof establishes these invariants:

- A canonical command increments local revision immediately; pagination may still be rendering the older revision.
- A DOM commit tagged with an older rendered revision is rejected and cannot replace newer canonical content.
- An uninterrupted keyboard event arriving before the new projection is published may use the latest canonical pending selection.
- An explicit pointer move on an older projection is not silently redirected to that pending keyboard caret; it is rejected pending S0's retained position/change-map solution.
- A projection publishes only when its revision equals the current canonical revision.
- Composition is a bounded session: complete snapshots are unavailable while active, intermediate native DOM writes are not committed independently, and composition completion produces one canonical revision.

This is a **bounded design/executable proof, not a production fix**. `A4PageEditor` is intentionally unchanged during C0; no new writer or behavior is enabled.

### Interface proposals for other Wave 0 owners

**SEMANTICS S0:** bind C02's final `A4Selection`/position representation to the generic bridge selection parameter. Return enough source-revision mapping/change-map evidence for an explicit pointer selection made on a stale projection to map safely or reject without arbitrary fallback. The current text-only `FlowSelectionBookmark` is only a compatibility adapter.

**FIELDS F0:** no C0 field parser or lifecycle behavior is implemented. C01 snapshot generics reserve a lossless fields payload; F0 should publish the actual stored field definition type and C06 policy before CORE wires field history/decorations.

**WORKFLOW W0:** consume the proposed synchronous snapshot semantics only as an interface inventory. Do not require the proof module from routes yet. W0 should return stable session-key sources and writer/save consumers that will later call the production C01 snapshot adapter.

### Validation evidence

Commands actually attempted in this execution environment:

```text
git clone --depth 1 https://github.com/Scofieldkoh/oakcloud.git /tmp/oakcloud-c0
```

Result: BLOCKED — `Could not resolve host: github.com` inside the container. Because an executable checkout could not be obtained, Node 24, Vitest browser/component tests, lint, typecheck and build were not run. The remote GitHub connector was used for source inspection, focused branch writes and diff review only.

Required next validation when CORE is resumed in the real shared checkout or an executable CI environment:

```text
node --version                              # must be >=24 <25
npx vitest run __tests__/components/a4-editor-session.test.ts
npx vitest run --config vitest.browser.config.ts __tests__/browser/a4-input-sequences.browser.test.tsx
```

The browser file is baseline evidence and uses expected-failure cases intentionally; do not count those expected failures as repaired. C1/C2 must remove the expected-failure markers only when the production implementation makes the assertions pass.

### Compatibility and rollout

- Existing editor APIs and production mutation paths are unchanged.
- No v2 hard-break writer is enabled.
- No schema/migration, sanitizer/escaping, revision enforcement or deployment change is included.
- The proof module is additive and has no runtime consumer yet.
- G0 remains **OPEN** pending S0/F0/W0 handoffs, executable validation and CORE integration review.

### Remaining dependencies and next action

Start/resume only the three released Wave 0 worker packets:

- SEMANTICS — `SEMANTICS-S0-20260911-01`
- FIELDS — `FIELDS-F0-20260911-01`
- WORKFLOW — `WORKFLOW-W0-20260911-01`

CORE should remain idle after this C0 handoff until their files contain READY FOR INTEGRATION/BLOCKED evidence and the user resumes CORE. VERIFY must remain idle; no Q1/Q2 assignment exists. Do not advance any worker to S1/F1/W1 or freeze G0 yet.
