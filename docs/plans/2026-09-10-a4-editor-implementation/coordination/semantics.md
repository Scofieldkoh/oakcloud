# SEMANTICS handoff log

## SEMANTICS-S0-20260911-01

Dispatch ID: `SEMANTICS-S0-20260911-01`
Role and packet: SEMANTICS / S0 — structural positions and nested manual-break proof
Starting state: DISPATCHED
Ending state: READY FOR INTEGRATION — S0 ONLY
Dispatched baseline commit: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Remote branch integration base: `80056fb7ab6e410ef2d2ddc17a830b068d263671` (CORE C0 merge)
Branch / PR: `codex/a4-editor-semantics-s0` / `#34`
Contract consumed: proposed v1 C02/C03/C04/C09; G0 remains OPEN

### Scope and ownership

- This correction pass resumes only the existing S0 packet after CORE review. S1/S2/S3 were not started.
- Writable scope remains the original SEMANTICS lease. The correction changes only `structural-position.ts`, `semantic-page-breaks.ts`, the leased `a4-boundary-semantics.browser.test.tsx`, and this handoff.
- No CORE/FIELDS/WORKFLOW production or test file was edited. `editor-session.ts` / `CanonicalInputBridge` is imported only by the S-owned proof fixture to demonstrate the contract boundary.
- No editor/session/toolbar wiring, active v2 command, migration, package/lock/config change, generated pagination bundle, version bump, deployment, or merge to `main` is included.

### CORE G0 review corrections completed

1. **Structural selection affinity**
   - Collapsed DOM anchor/focus capture is performed once and reused, so a logically collapsed DOM selection cannot become two A4 positions merely because the endpoints were assigned different fallback affinities.
   - Non-collapsed anchor/focus direction remains represented by anchor/focus ordering; endpoint role no longer injects `after` for anchor and `before` for focus.
   - Child-boundary capture canonicalizes the side of a single adjacent structural node: before `<br>` captures `affinity: 'before'`; after it captures `affinity: 'after'`.
   - `resolveA4Position` now uses affinity when a text offset coincides with a zero-text structural boundary and when a text offset lies exactly between text nodes.
   - The browser fixture performs capture -> resolve -> capture regressions for immediately before/after `<br>`, blank paragraph, empty cell, adjacent atomic field-like elements, collapsed selection, forward non-collapsed selection, and reverse non-collapsed selection.

2. **Multiple semantic breaks in one logical list item**
   - Added the ordered-list fixture `Before [break1] Middle [break2] After` with `start="5"` and a following item 6.
   - Projection still produces one canonical OL/LI/P chain; all three projected fragments retain the source `list` -> `item-5` -> `paragraph` ancestry. When a between-break DOM Range has a common ancestor below the canonical root, the proof reconstructs that shallow ancestor chain around the cloned contents.
   - Source-range constraints now intersect. The middle paragraph/item range is exactly `[7,14]` for `Middle ` rather than being overwritten to `[0,14]` or `[7,end]`.
   - Continuation metadata composes across adjacent break boundaries. A fragment that is after break 1 and before break 2 receives `data-flow-continuation="both"`; its ordered-list counter is not reset back to the canonical list base.
   - Removing either `break-1` or `break-2` leaves one logical item 5, retains all `Before Middle After` text, retains the other break, and preserves `start="5"`.

3. **C02/C04 contract boundary completed**
   - Exact S1 transaction/document and projection mapping contracts are published below and exported by the proof modules.
   - The projection mapping is tagged with the `sessionKey` and `documentRevision` copied from CORE C0. The S map never allocates or advances a revision.
   - A proof fixture instantiates CORE's existing `createCanonicalInputBridge<A4Selection>()`, creates a revision-tagged S projection from its snapshot, maps a pointer selection, commits an `A4TransactionResult` through `bridge.commitCanonical`, and proves the old position map remains revision 0 and is rejected by CORE after revision 1 exists.

4. **Rendered ordered-list evidence strengthened**
   - The proof now derives concrete marker labels using the same counter rules as `a4-page-content-css.ts`: `--flow-list-start` initializes the list counter, ordinary LI increments and displays it, and `data-flow-continuation-item` suppresses both increment and marker.
   - For the single-break `start="5"` fixture the displayed sequence is: first fragment `5.`, continuation item no marker, following item `6.`.
   - For the two-break fixture the displayed sequence is: fragment 1 `5.`, fragment 2 continuation/no marker, fragment 3 continuation/no marker followed by `6.`.
   - Existing nested-list, legacy top-level break, `start="5"`, soft-pagination, serialization, and deletion evidence remains covered.

## Frozen S0 interface proposal for G0

### C02 — structural positions and pure transaction result

Proposed home: `src/components/documents/a4-pagination/structural-position.ts`.

```ts
type A4Position =
  | { kind: 'text'; nodeId: string; offset: number; affinity: 'before' | 'after' }
  | { kind: 'children'; nodeId: string; index: number; affinity: 'before' | 'after' };

interface A4Selection {
  anchor: A4Position;
  focus: A4Position;
}

interface CanonicalEditorDocument {
  readonly internalHtml: string;
}

type A4TransactionResult =
  | {
      status: 'applied';
      document: CanonicalEditorDocument;
      selection: A4Selection;
      changedNodeIds: readonly string[];
    }
  | { status: 'unchanged'; reason: string }
  | { status: 'rejected'; code: string; message: string };
```

`CanonicalEditorDocument` deliberately has **no session key and no revision field**. It is the S-owned HTML-backed canonical tree/snapshot value with internal semantic IDs. A pure S1 command will receive the current canonical document + structural selection and return the union above; it will not increment session revision or publish rendered state.

The G0 adapter to today's `DocumentTransactionResult` is therefore explicit and one-way during rollout:

```text
A4TransactionResult.applied.document.internalHtml
    -> serialize canonical HTML according to the agreed persistence/view boundary
A4TransactionResult.applied.selection
    -> structural selection retained by CORE
A4TransactionResult.applied.changedNodeIds
    -> CORE history/change-map invalidation input

unchanged/rejected
    -> no canonical content commit
```

S1 may implement this adapter only after G0. S0 does not alter `document-actions.ts` or activate this command surface.

### C04 — exact projection-position map supplied to CORE

Proposed home: `src/components/documents/a4-pagination/semantic-page-breaks.ts`.

```ts
interface A4ProjectionSourceRevision {
  sessionKey: EditorSessionKey;      // imported from CORE editor-session.ts
  documentRevision: EditorRevision;  // imported from CORE editor-session.ts
}

interface A4SourceRangeBinding {
  sourceNodeId: string;
  startTextOffset: number;
  endTextOffset: number;
}

interface A4ProjectionFragmentPositionMap {
  fragmentIndex: number;
  sourceRanges: readonly A4SourceRangeBinding[];
}

interface A4ProjectionPositionMap extends A4ProjectionSourceRevision {
  fragments: readonly A4ProjectionFragmentPositionMap[];
}

interface A4ProjectedTextPoint {
  fragmentIndex: number;
  sourceNodeId: string;
  projectedOffset: number;
  affinity?: A4Position['affinity'];
}

interface A4MappedSourcePosition extends A4ProjectionSourceRevision {
  position: A4Position;
}
```

`mapProjectedTextOffsetToSource(positionMap, point)` returns the revision association together with the canonical `A4Position`. The projected offset is relative to that fragment's bound source range; e.g. the two-break middle range `[7,14]` maps projected offset `2` to canonical offset `9`.

### Binding to C0 `CanonicalInputBridge` — one revision authority

CORE C0 already owns:

```ts
interface CanonicalInputBridge<TSelection> {
  getSnapshot(): SnapshotResult;
  commitCanonical(content: string, selection: TSelection): EditorRevision;
  publishProjection(revision: EditorRevision): boolean;
  resolveNativeInputTarget(input: {
    renderedRevision: EditorRevision;
    origin: NativeInputOrigin;
    renderedSelection: TSelection;
  }): NativeInputTarget<TSelection>;
  // ...other C0 members unchanged
}
```

The G0 composition is exactly:

```text
1. CORE bridge.getSnapshot() yields { sessionKey, revision, content }.
2. S projection receives { sessionKey, documentRevision: revision } as immutable source metadata.
3. S returns fragments + A4ProjectionPositionMap tagged with those copied values.
4. A rendered point is mapped to { sessionKey, documentRevision, position: A4Position }.
5. CORE verifies/uses that same rendered revision through resolveNativeInputTarget(...).
6. If an S transaction is applied, CORE calls commitCanonical(serializedContent, result.selection).
7. commitCanonical alone allocates the next EditorRevision. The old S position map does not mutate; it remains tagged with the old revision and becomes stale.
```

There is therefore no S revision counter, no projection-owned revision increment, no alternate stale-selection authority, and no database version conflation. S1 must preserve this boundary.

## C03 nested-break representation and compatibility

Canonical v2 nested break remains:

```html
<ol start="5">
  <li><p>Before<span data-a4-break="page"></span>After</p></li>
</ol>
```

The canonical tree is unsplit. `Range.cloneContents()` is used only to derive view fragments. For each inline break, every split ancestor carries its source semantic ID into the projected fragment. Multiple range constraints for the same source node are intersected so a fragment between two breaks maps only to its true source slice.

Legacy top-level compatibility remains:

```html
<div class="page-break" data-break-type="hard"></div>
```

Legacy boundaries are read/projected without inferring that independent lists on opposite sides form one logical list. Blank paragraphs, table caption/tfoot content, nested mixed lists and serialization stripping of runtime `data-flow-*` / `--flow-list-start` metadata remain covered.

A manual page break inside `td`/`th` remains explicitly unsupported by S0 and returns `table-cell-interior-unsupported` without changing content. No split-cell/row promise is introduced.

## Validation evidence

### Supported Node 24 repository CI

PR #34 code/test head after the final S0 logic review: `91b215415b440f394326d4ac4c120f2a6526f0c5`.
GitHub Actions run: `Node 24 compatibility` run `#139` (`34571059005`).

At the time this handoff text was prepared, the supported runner had already recorded:

```text
Set up Node 24                  PASS
Verify runtime major           PASS
Lint                           PASS
Typecheck                      PASS
```

The final PR review must use the latest run attached to the eventual handoff commit, because updating this file creates a new PR head and therefore a fresh workflow run.

### Required targeted S0 commands

CORE requested these exact Node 24 commands:

```text
npx vitest run --config vitest.browser.config.ts \
  __tests__/browser/a4-boundary-semantics.browser.test.tsx

npx vitest run __tests__/components/a4-pagination
```

Result in this execution environment:

```text
NOT EXECUTED — environment/ownership block, not a test failure.
```

Reason: the available working container is Node `v22.16.0`, has no repository checkout/dependencies and cannot resolve `github.com`/`nodejs.org`. The repository's only GitHub workflow correctly provisions Node 24 but does not expose arbitrary/ad-hoc commands and does not run either command above. S0 does not have a lease to edit `.github/workflows`, `package.json`, shared config, or another owner's test to inject these commands. Those files were intentionally left untouched.

Local proof-only compile performed after the correction draft:

```text
tsc --noEmit -p isolated-s0-tsconfig.json
PASS — TypeScript 5.8.3 / Node v22.16.0
```

This local compile is supplemental only and is **not** represented as the requested Node 24 Vitest evidence. G0 must not treat the two targeted commands as passed until they are executed verbatim in an authorized Node 24 checkout/runner.

## Acceptance mapping after CORE correction

- **A4E-002 / C03:** single and multiple inline breaks retain one canonical ordered-list item, list-start intent, concrete projected numbering, and logical deletion semantics.
- **A4E-011 / C02:** structural positions distinguish before/after `<br>`, blank blocks/cells and adjacent atomics; capture/resolve round-trips cover collapsed, forward and reverse selections.
- **C04:** position maps carry CORE's session/document revision association and stale maps cannot advance themselves.
- **A4E-008/018:** durable `ol[start]` remains canonical; projection counter offsets remain runtime-only.
- **A4E-028:** existing one-item soft-pagination/reassembly invariant remains covered.
- **A4E-029:** S0 boundary fixture is expanded without enabling production writer behavior.

## Remaining dependency and stop boundary

Implementation corrections requested by CORE are authored within S0 and the proof interfaces are published. **G0 remains OPEN.** The two requested targeted Node 24 Vitest invocations still require an authorized runner that can execute ad-hoc commands without violating the Wave-0 ownership lease. No result is fabricated here.

SEMANTICS stops at **READY FOR INTEGRATION — S0 only**. Do not begin S1 until CORE explicitly freezes/publishes G0 and dispatches a new S1 assignment.
