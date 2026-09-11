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

---

## SEMANTICS-S1-20260911-01

Dispatch ID: `SEMANTICS-S1-20260911-01`
Role and packet: SEMANTICS / S1 — structural positions, commands and versioned break readers
Starting state: DISPATCHED
Ending state: READY FOR INTEGRATION — S1 ONLY
Frozen Stage-1 common baseline: `bfdc4f95594b73ce4d20bff45f320bdb53837c37`
Implementation branch / PR: `codex/a4-editor-semantics-s1` / `#36`
Implementation code head immediately before this handoff: `f8b228f32637dcfab93e5d2c6be3b73cc7d84803`
Contract consumed: frozen G0 C02/C03/C04/C09 and Stage-1 CORE dispatch; no contract widening.

### Scope completed

- Expanded runtime semantic identity hydration across paragraph/heading/block nodes, ordered/unordered lists and items, nested structures, table/table-section/row/cell nodes, empty blocks/cells, `<br>`, explicit old/new page-break nodes and atomic field/reference-like nodes. These `data-flow-id` values remain runtime flow identity only and are stripped at persistence.
- Promoted structural positions from S0 proof to production validation/comparison/range APIs. `text` and `children` positions and `before`/`after` affinity are retained; zero-text boundaries remain distinguishable. Missing, ambiguous, stale, deleted-node, cross-session and invalid-offset cases return typed rejection rather than falling back to a physical page boundary.
- Added revision-qualified retained change maps. SEMANTICS records how retained semantic nodes changed but does not allocate document revisions; `sessionKey`, `fromRevision` and `toRevision` are supplied by CORE.
- Added pure S1 semantic commands for manual break insertion/removal, logical deletion, paragraph break and line break. Commands consume `CanonicalEditorDocument + A4Selection`, operate on the unsplit logical tree and return the frozen `A4TransactionResult` union with resulting structural selection and `changedNodeIds`.
- Canonical nested manual-break writing is exactly `<span data-a4-break="page"></span>` internally (with removable runtime identity only). Legacy top-level `<div class="page-break" data-break-type="hard"></div>` remains readable/removable. A break inside an OL item does not create another canonical LI.
- Collapsed Backspace/Delete first removes one adjacent explicit manual break. Ordinary character deletion is grapheme-safe through `Intl.Segmenter` with a code-point fallback. Range deletion acts only on the logical selection and preserves unrelated siblings/ancestors.
- Added tree-aware production break readers/projection by promoting the S0 range-based visitor behind production APIs. Projection clones ancestry only in fragments, preserves the canonical unsplit tree, emits fragment content/source ranges/continuation information/`hardBreakBefore`, and retains the C04 `sessionKey + documentRevision` map. Multiple breaks in one logical block preserve the exact intermediate source ranges proven by S0.
- Updated the source pagination entry so `paginateFlowHtml` now routes explicit hard-break partitioning through the semantic tree-aware projection before existing soft measurement. Existing `paginateFlowHtml(input, measurer, maxHeight)` callers remain functional through a synthetic compatibility revision; revision-aware CORE/WORKFLOW callers receive a native position map from `paginateA4FlowHtml` / `paginateA4StructuralHtml`.
- Exported applicability/capability functions for insert/remove manual break, delete blank page/break, list-level context and table/break support. Arbitrary manual-break insertion inside `td`/`th` returns typed `table-cell-interior-unsupported` and does not mutate content. Soft page continuation deliberately exposes no physical delete-page mutation.
- Added S1 regression coverage for after-`<br>` position, empty paragraph/cell, adjacent atomics, reverse selection, stale positions, change mapping, multiple nested breaks, nested lists, `start=5`, Unicode grapheme deletion, old/new hard-break insertion/removal, selected-range Enter/Delete, unsupported table-cell break insertion, soft-continuation capability and persistence metadata stripping.
- No editor key/event wiring, FIELDS parsing/identity logic, WORKFLOW persistence/output adapter, v2 writer activation, generated pagination bundle, package/config/version change, deployment or merge is included.

### Exact production APIs exported to CORE / WORKFLOW

`structural-position.ts`:

- `hydrateA4RuntimeIdentity(root)`
- `hydrateA4RuntimeHtml(input)`
- `createCanonicalEditorDocument(input)`
- `captureA4Position(root, node, offset, affinity)`
- `captureA4SelectionFromDomPoints(root, anchor, focus)`
- `captureA4Selection(root)`
- `resolveA4Position(root, position)`
- `validateA4Position(root, position)`
- `validateA4DocumentPosition(canonical, position)`
- `compareA4Positions(canonical, left, right)`
- `normalizeA4SelectionRange(canonical, selection)`
- `compareA4StructuralRanges(canonical, left, right)`
- `createA4ChangeMap(before, after, identity)`
- `mapA4PositionThroughChangeMap(changeMap, source)`
- frozen structural/result types plus `A4RevisionedPosition`, `A4ChangeMapIdentity`, `A4ChangeMap`, `A4ChangeMapResult`.

`structural-commands.ts`:

- `createA4CommandDocument(html)`
- `insertA4ManualPageBreak(canonical, selection)`
- `removeA4ManualPageBreak(canonical, selection)`
- `deleteA4Selection(canonical, selection, direction)`
- `insertA4ParagraphBreak(canonical, selection)`
- `insertA4LineBreak(canonical, selection)`
- `getInsertManualBreakCapability(canonical, selection)`
- `getRemoveManualBreakCapability(canonical, selection)`
- `getDeleteBlankPageOrBreakCapability(canonical, selection)`
- `getA4ListLevelContext(canonical, position)`
- `getTableBreakCapability(canonical, selection)`
- `A4CommandCapability`, `A4CommandCapabilityCode`, `A4BlankPageCapability`, `A4ListLevelContext`.

`semantic-break-projection.ts`:

- `detectA4BreakFormatLevel(input)`
- `readA4BreakDocument(input)`
- `partitionA4SemanticBreaks(input, source)`
- `mapA4ProjectedTextPoint(positionMap, point)`
- `mapA4ProjectedStructuralPoint(canonical, projection, point)`
- `serializeA4CanonicalBreakDocument(canonical)`
- `A4BreakFormatLevel`, `A4BreakReaderResult`, `A4ProjectedStructuralPoint`, `A4ProjectedStructuralMapResult`.

`engine.ts` / `structural-pagination.ts`:

- `paginateA4FlowHtml(input, source, measurer, maxHeight)` returns pages + projected source fragments + revision-qualified position map.
- `paginateA4StructuralHtml(...)` is the SEMANTICS-facing stable alias.
- Existing `paginateFlowHtml(input, measurer, maxHeight)` remains available.

### Compatibility adapters retained

- `a4PositionFromFlowPoint`, `flowPointFromA4Position`, `a4SelectionFromFlowBookmark` and `flowBookmarkFromA4Selection` bridge existing text-offset selection callers while CORE migrates. The adapter does not pretend legacy text offsets can distinguish every zero-text boundary; native C02 callers must use `A4Position` for that precision.
- `paginateFlowHtml` remains source-compatible and delegates to the structural partition entry with a synthetic legacy session/revision. `paginateFlowHtmlStructuralCompat` is an explicit alias for staged consumers.
- S0 proof exports in `semantic-page-breaks.ts` remain intact; S1 production wrappers call the proven tree-aware visitor rather than duplicating its logic.
- Legacy top-level hard breaks remain readable and removable. New semantic break writing is implemented only as a pure command; no user-visible v2 writer gate is enabled in this packet.

### WORKFLOW W1 generated-bundle regeneration requirement

S1 intentionally did **not** modify `scripts/build-pagination-bundle.mts` or `src/components/documents/a4-pagination/pagination-bundle.generated.ts`, because the generated output is WORKFLOW-owned. After S1 is integrated, W1 must run exactly:

```text
npm run generate:pagination-bundle
```

and commit the regenerated:

```text
src/components/documents/a4-pagination/pagination-bundle.generated.ts
```

The regeneration is required because `paginate-in-browser.entry.ts` imports `paginateFlowHtml` and S1 changes `engine.ts` plus its transitive semantic-partition dependencies. Until W1 regenerates the bundle, the committed generated browser pagination artifact will still reflect the pre-S1 engine.

### Validation and test results

Required Node 24 commands from the S1 dispatch:

```text
npx vitest run --config vitest.browser.config.ts \
  __tests__/browser/a4-boundary-semantics.browser.test.tsx

npx vitest run __tests__/components/a4-pagination
```

Result in this execution environment:

```text
NOT EXECUTED — environment/tooling block, not represented as a pass or a test failure.
```

Reason: the available working container is Node `v22.16.0`, has no repository checkout/dependencies and cannot resolve GitHub. The authenticated GitHub connector can mutate/read the repository but cannot execute arbitrary workflow commands. The repository's `Node 24 compatibility` workflow does provision Node 24 and validates lint/typecheck/build, but it does not expose the two required ad-hoc Vitest invocations. No workflow/config/package file was modified to bypass the SEMANTICS ownership boundary.

S1-specific regressions are authored in `__tests__/components/a4-pagination/structural-commands.test.ts`. The existing S0 browser proof was not weakened or modified. The latest code-head workflow before this handoff is `Node 24 compatibility` run `#193` (`34590849406`); final review must use the latest run attached to the handoff PR head because this documentation update itself creates a newer commit/run.

A prior code-head run (`#188`, `34590552868`) found two `prefer-const` lint errors in `structural-commands.ts`; both were corrected in the final code head. Its independent Business Assistant PostgreSQL compatibility job passed. No targeted Vitest result is fabricated.

### Unsupported cases / explicit no-op boundaries

- Arbitrary page-break insertion inside a table cell is unsupported and returns typed `table-cell-interior-unsupported` with unchanged content.
- S1 does not promise split-cell or between-row manual-break authoring UI. Table row/cell runtime identity exists for structural mapping and soft pagination support only.
- Paragraph-break behavior inside `td`/`th` is left unchanged/browser-native until a table command contract is assigned.
- Full list Enter/backspace/indent/outdent/conversion/numbering command semantics are S2 scope and are not implemented here.
- No command infers destructive scope from rendered page count. A soft continuation is a projection and has no `delete page` mutation.
- The semantic v2 break command exists but activation remains behind the later CORE/WORKFLOW reader/writer capability gate.

### Remaining integration dependencies

- CORE C1/C2 must wire native editor input/key handling and commit the pure `A4TransactionResult` through CORE's single revision authority. SEMANTICS does not allocate revisions or wire DOM events.
- WORKFLOW W1 must consume the reader/pagination APIs, apply its persistence/output capability gate and regenerate the generated browser pagination bundle after S1 integration.
- FIELDS remains owner of durable C05 field identity/parser/registry behavior. S1 only treats field/reference-like DOM nodes as atomic runtime structural nodes; runtime flow IDs are not durable field IDs.
- The frozen C04 source map is ready for CORE native-input reconciliation; stale positions are rejected rather than snapped to visual page locations.

### Stop boundary

S1 implementation is complete within the SEMANTICS lease. S2 and S3 have **not started**. The PR remains unmerged for CORE review/integration.

SEMANTICS state: **READY FOR INTEGRATION — S1 only**
