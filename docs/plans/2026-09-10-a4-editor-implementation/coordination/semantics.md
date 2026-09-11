# SEMANTICS handoff log

## SEMANTICS-S0-20260911-01

Dispatch ID: `SEMANTICS-S0-20260911-01`
Role and packet: SEMANTICS / S0 — structural positions and nested manual-break proof
Starting state: DISPATCHED
Ending state: READY FOR INTEGRATION
Dispatched baseline commit: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Remote branch integration base: `80056fb7ab6e410ef2d2ddc17a830b068d263671` (CORE C0 merge)
Branch: `codex/a4-editor-semantics-s0`
Contract consumed: proposed v1, C02/C03/C04/C09; G0 remains OPEN

### Coordination and ownership evidence

- The assignment was re-read from `coordination/dispatch.md` before implementation. Only S0 was executed; S1/S2/S3 were not started.
- The dispatch baseline was `63aa75b6170766a3e3d1728feb5e5417f5632f20`. During execution CORE C0 was merged to `main` as `80056fb7ab6e410ef2d2ddc17a830b068d263671`. Before the first SEMANTICS write, the empty remote S0 branch was fast-forwarded to that merge so this PR cannot appear to remove CORE-owned C0 files. No CORE production/test file was edited.
- The GitHub connector exposes the remote repository rather than the user's local shared checkout. The isolated remote branch was used only to satisfy the requested PR handoff; it did not switch, reset, stage, stash or otherwise alter the shared local checkout.
- Exclusive scope is preserved: the implementation adds only S-owned semantic proof modules, the specifically leased S browser fixture, and this SEMANTICS handoff.
- No package/lockfile/configuration, Prisma, generated pagination bundle, editor/session/history/toolbar, field, route/service or workflow file was changed. No version bump, deployment, merge to `main`, or v2 writer activation was performed.

### Files changed by S0

- `src/components/documents/a4-pagination/structural-position.ts` — C02 structural position proof: `text` versus `children` positions, affinity, directional selection capture, unique-node resolution and explicit rejection of ambiguous duplicate semantic IDs.
- `src/components/documents/a4-pagination/semantic-page-breaks.ts` — C03/C04 proof codec and projection: inline hard-break marker, tree-aware DOM Range partitioning, source-range mappings, list continuation projection, logical marker removal and typed cell-interior limitation.
- `__tests__/browser/a4-boundary-semantics.browser.test.tsx` — executable S0 fixtures for ordinary soft pagination, `<br>`, blank blocks, adjacent field boundaries, reverse selection, empty cells, legacy breaks, v2 nested breaks, numbering/source mapping and logical break deletion.
- This file — S0 contract/compatibility handoff for CORE.

### Proposed S0 interfaces and locations

`src/components/documents/a4-pagination/structural-position.ts` is the proposed C02 compatibility home for the structural selection primitives:

```ts
type A4Position =
  | { kind: 'text'; nodeId: string; offset: number; affinity: 'before' | 'after' }
  | { kind: 'children'; nodeId: string; index: number; affinity: 'before' | 'after' };

interface A4Selection {
  anchor: A4Position;
  focus: A4Position;
}

captureA4Position(root, node, offset, affinity?)
captureA4SelectionFromDomPoints(root, anchor, focus)
captureA4Selection(root)
resolveA4Position(root, position)
```

The proof deliberately leaves the existing `FlowPoint`/`FlowSelectionBookmark` API untouched. S1 may provide a migration adapter after G0 freezes the contract. `resolveA4Position` requires exactly one canonical element for a semantic ID; duplicated IDs are rejected rather than silently selecting the first/last page fragment.

`src/components/documents/a4-pagination/semantic-page-breaks.ts` is the proposed C03/C04 proof home:

```ts
const INLINE_A4_PAGE_BREAK_HTML = '<span data-a4-break="page"></span>';

projectA4SemanticBreaksForProof(html): A4BreakProjectionProof
mapProjectedTextOffsetToSource(proof, fragmentIndex, sourceNodeId, offset, affinity?)
hydrateA4SemanticProofHtml(html): string
removeA4PageBreakForProof(internalHtml, breakNodeId): A4PageBreakRemovalProof
serializeA4SemanticProofHtml(internalHtml): string
validateA4PageBreakPositionForProof(root, position): A4PageBreakPositionSupport
```

These names intentionally say `ForProof`: S0 does not make them active production writers/readers. At G0 CORE can freeze/refine naming and S1 can integrate the agreed contract into the existing model/actions/engine without bypassing ownership.

### C02 structural-position proof

The fixture distinguishes positions that the legacy text-only bookmark aliases together:

- before versus after `<br>` are distinct `children` positions;
- a blank paragraph has a valid child position despite zero text;
- adjacent field-like atomic elements expose the boundary between them;
- an empty table cell has a distinct structural position;
- directional anchor/focus values remain directional for reverse selections.

CORE adapter rule: use canonical semantic IDs for C02. A position resolved against a canonical tree must be unique. A pointer/caret on a projected page fragment must first use the projection source mapping; it must not search a multi-page DOM by duplicate view IDs and sum unrelated content.

### C03 nested manual-break and list-continuity proof

The proposed canonical v2 fixture remains one list and one logical list item:

```html
<ol start="5">
  <li><p>Before<span data-a4-break="page"></span>After</p></li>
</ol>
```

The proof hydrates runtime semantic IDs without persisting them, partitions the canonical tree with DOM `Range.cloneContents()` around the nested marker, and creates two **view fragments** whose ancestors retain the same source-node IDs. The canonical OL/LI is never split into two independent canonical lists/items.

For a break in item 5 of `<ol start="5">`:

- first view fragment keeps the item marker and has `--flow-list-start: 4`;
- continuation view fragment has `data-flow-continuation-item="true"` and `--flow-list-start: 5`, so the item marker is not repeated and following items continue at the intended number;
- those values are projection metadata only and are stripped before serialization;
- the canonical `start="5"` remains durable numbering intent.

The nested mixed-list fixture proves ancestry is preserved through outer list → outer item → nested list → nested item → paragraph. Both outer and nested continuation items map back to their single canonical source items.

### Source mapping example for CORE

For canonical item text `BeforeAfter` with a break after `Before`, the first fragment binds source range `[0, 6]` and the continuation binds `[6, 11]` for the same `sourceNodeId`.

```text
first fragment item offset 2  -> { kind: 'text', nodeId: itemId, offset: 2 }
second fragment item offset 2 -> { kind: 'text', nodeId: itemId, offset: 8 }
```

This is the S0 bridge requested by CORE C0: a later-page projected position maps directly to one logical source item instead of relying on duplicated physical-page identities. C1/C2 still own revision tagging, stale projection change maps and event dispatch.

### Soft-pagination invariant

S0 also exercises the existing `paginateFlowHtml` path with one long ordered-list item. The item spans multiple soft pages using the same runtime source ID; continuation pages suppress the duplicate marker; `reassemblePageFragments` produces one canonical `<ol start="5"><li>...</li></ol>` with all text retained. This is treated as an existing invariant to preserve, not a new writer implementation.

### Compatibility proof and WORKFLOW handoff

Legacy top-level hard break remains:

```html
<div class="page-break" data-break-type="hard"></div>
```

The S0 fixture reads it, projects it as a hard boundary, preserves explicit blank paragraphs plus table `caption`/`tfoot`, and serializes it through the existing normalization path. Independent old lists on opposite sides of such a marker are not inferred to be one list.

The v2 marker remains:

```html
<span data-a4-break="page"></span>
```

The proof serializer keeps this semantic marker while removing runtime `data-flow-*` attributes and `--flow-list-start`. WORKFLOW should eventually consume canonical content through the agreed S reader/projection interface; it must not persist projection counter offsets or rely only on `contentJson` feature metadata because partials have no such column. No generated bundle change is requested in S0 because no production engine integration has landed.

### Logical break deletion proof

`removeA4PageBreakForProof` removes only the selected inline semantic marker from the canonical tree and returns a collapsed structural selection at the former child index. The fixture verifies that the ordered list still has the same two items, keeps `start="5"`, and rejoins `Before` + `After` as `BeforeAfter`. This models the required first Backspace/Delete action at a manual break: remove the break without deleting user text.

Actual keyboard Backspace/Delete routing remains CORE/S1 integration work after G0; S0 does not patch the editor or active `document-actions.ts` path.

### Explicit limitations and rejected scope

- A manual break **inside a table cell** is explicitly unsupported by this proof and returns `table-cell-interior-unsupported` without modifying content. No split-row/cell representation is claimed.
- Between-row table break semantics are not implemented in S0. If required later, S1 must define and test a row-boundary contract that preserves caption/header/footer behavior.
- Structural text offsets use DOM UTF-16 conventions at this adapter boundary, matching C02. Grapheme-aware delete behavior belongs to S1 commands.
- The proof source-range map covers stable source-node text ranges. Full zero-text projected-node mapping, revision/change maps and stale-projection reconciliation remain C1/S1 integration work.
- Existing field-like attributes in the fixture are only atomic structural-boundary descriptors. Field grammar, durable field identity and decorations remain F-owned.
- This packet does not fix A4E-002/003/011 in the live editor. It proves the representation/adapter required before the active mutation path can change.

### Validation evidence

The remote connector cannot provide an executable checkout to the container, and outbound `github.com` DNS is unavailable there. The container reports Node `v22.16.0`, while Oakcloud requires Node `>=24 <25`; therefore no repository Vitest/browser suite, lint, typecheck or build is claimed as passed.

An isolated TypeScript 5.8.3 compile was run against the exact two S0 production-module drafts and the browser fixture, with minimal declarations for existing model/engine/Vitest imports:

```text
tsc --noEmit -p tsconfig.json
isolated-tsc=PASS
node=v22.16.0
TypeScript=5.8.3
```

This proves TypeScript syntax/type consistency of the authored S0 surface under the isolated declarations, not repository integration under Node 24. The supported validation remains required before G0 is frozen:

```text
node --version  # must be >=24 <25
node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts \
  __tests__/browser/a4-boundary-semantics.browser.test.tsx

node_modules/vitest/vitest.mjs run \
  __tests__/components/a4-pagination
```

If CI executes these checks on the PR, CORE should use those exact run results as the executable evidence; otherwise run them in the user's Node-24 checkout before integration sign-off.

### A4E acceptance mapping

- A4E-002: representation proof keeps one logical LI and numbering intent through manual break projection and logical break removal; production keyboard path remains pending S1/CORE.
- A4E-008/018: durable `ol[start]` remains semantic intent; runtime counter offsets are not persisted; export-reader parity remains WORKFLOW/S1 gate work.
- A4E-011: structural `children` positions distinguish `<br>`, blank content, adjacent atomic boundaries and empty cells; full editor migration remains pending S1/CORE.
- A4E-028: existing long-item soft pagination identity/reassembly is explicitly retained as an invariant; performance work is not started.
- A4E-029: a dedicated native-browser-config fixture now captures S0 semantic invariants; the previously recorded editor race/blank-page gates remain unchanged.

### Compatibility, migration and rollout

- Existing public editor APIs and active mutation routes are unchanged.
- Existing legacy hard-break content remains compatible.
- No schema/database/API migration is introduced.
- No v2 writer is enabled. Writer activation remains blocked until S1/W1 reader compatibility and the later G2 rollout gate.
- No output bundle regeneration is required for this proof-only packet.
- Rollback is deletion of the additive proof modules/test/handoff only; stored business documents are unaffected.

### Remaining dependencies and CORE action

S0 is READY FOR INTEGRATION review, but G0 remains **OPEN**. CORE must not advance SEMANTICS to S1 from this handoff alone. Before freezing G0, CORE should:

1. run/obtain Node-24 executable results for the S0 fixture plus existing pagination suite;
2. review the C02 type/location against C0's generic editor-session selection bridge;
3. review the C03 inline marker/source-range/list-continuation representation with WORKFLOW's reader/output inventory;
4. resolve any contract naming or mapping refinements centrally in `contracts.md`/dispatch and publish one common G0 base.

SEMANTICS stops here and waits for a new explicit S1 assignment after G0.
