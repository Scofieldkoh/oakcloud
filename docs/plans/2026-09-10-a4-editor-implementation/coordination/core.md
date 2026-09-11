# CORE handoff log

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
