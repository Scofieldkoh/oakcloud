from pathlib import Path

path = Path('docs/plans/2026-09-10-a4-editor-implementation/coordination/core.md')
entry = r'''

## 2026-09-12 — C2 handoff — CORE-C2-20260912-01

Status: **READY FOR INTEGRATION — C2 ONLY**

### Scope and frozen baseline

- Packet: `CORE-C2-20260912-01`
- Branch: `codex/a4-editor-core-c2-20260912`
- Actual branch start: `6f1ab8d3cb90056c556771936f4c763d9596efdf` (current merged main with final G1 coordination records and Wave-2 dispatch).
- Programme-recorded G1-validated Stage-2 source baseline: `ad7285ace280f0b4002f119f923a8e2166b9475f` (reference only; branch was **not** reset to it).
- Frozen contract consumed: **v1 frozen at G0 — unchanged**.
- G1 state consumed: **G1 FROZEN/PASSED**.
- Validated C2 production/test code commit before this handoff-only coordination commit: `e825d900b3fdc19e9fa9f0ae69c0fe8d878ebbd7`.
- No application version bump, deployment work, C3 work, or merge to `main` was performed.

### C2 implementation completed

1. `A4PageEditor` now routes canonical native structural editing through the C1 session authority and SEMANTICS-owned transactions instead of persisting physical-page DOM fragments.
   - cross-page Backspace/Delete and selected deletion use S1 `deleteA4Selection`;
   - Shift+Enter uses S1 `insertA4LineBreak`;
   - manual page break insertion uses S1 `insertA4ManualPageBreak` and canonical semantic break markers;
   - hard-page-start Backspace maps the rendered page-start position to the semantic boundary and supplies explicit S1 affinity;
   - cut uses the same canonical semantic deletion route;
   - no new revision/session/history authority was introduced.
2. The old `splitActivePageAtSelection` physical fragment writer was removed. Manual breaks are canonical semantic transactions; projection derives physical pages afterward.
3. Reflow now consumes `paginateA4FlowHtml` and the S1 revision-qualified `A4ProjectionPositionMap`. CORE verifies the map session/document revision against the C1 projection revision before publication. C1 remains the only authority that decides whether a projection can publish.
4. Latest canonical state remains authoritative while pagination/reflow is behind; stale rendered selections continue through C1 `resolveNativeInputTarget` rejection/mapping rules rather than replacing canonical content.
5. F1 is consumed instead of duplicated:
   - editor sanitization uses `getA4SanitizerPolicy()` plus the approved editor decoration attributes;
   - optional stable `fieldScope` and `onFieldAnalysis` hooks expose F1 `parseTemplateFields` output from canonical C1 snapshots;
   - CORE does not create field grammar, identity, resolution, escaping, or field mutation semantics.
6. Collapsed Clear Formatting now records neutral pending typing marks so the next typed run is actually cleared rather than merely changing toolbar state.
7. Focused C2 browser coverage was added for semantic page-break insertion/removal inside a later-page list item and for a native cross-page selection replaced by one semantic line break.
8. The obsolete component expectation that the page-break toolbar must synchronously create a second physical page was replaced by a canonical semantic-break assertion. Physical pagination is projection only.

### Deliberate compatibility boundary retained pending S2

S1 does not yet provide the complete list-item Enter/exit semantics required by the frozen G1 browser contract. Directly routing Enter through the current S1 paragraph primitive regressed list-item split/exit and caret-follow cases during C2 validation. CORE therefore centralizes a temporary compatibility path in `a4-editor-semantic-bridge.ts` that calls the existing **SEMANTICS-owned canonical** `insertParagraphAtSelection` transaction for Enter only. CORE does not duplicate that implementation. Delete, Shift+Enter, manual breaks, position mapping and projection mapping use the S1 contracts directly.

Exact S2 integration request: provide the finalized structural paragraph/list Enter/exit command (including ordered/unordered list continuity, empty-item exit and selection/caret result) so CORE can replace this compatibility call without changing C1 authority or G1 behavior.

### Additional owner integration requests

- **SEMANTICS / S2:** provide one canonical indent/outdent capability for Tab/Shift+Tab and toolbar equivalence, constrained to valid list/table contexts. CORE must not invent list/table structural rules. Also provide a semantic table-column-resize transaction when that behavior is assigned; the existing table resize remains bounded native reconciliation through C1 and is not a page-state writer.
- **FIELDS / F2:** provide the canonical field insertion/edit/import lifecycle transactions. CORE currently consumes F1 parsing/content policy only and intentionally does not implement field-domain mutation behavior.
- **WORKFLOW / W2:** pass the stable field owner scope/session identity from the workflow/template owner and consume the resulting canonical C1 snapshot in persistence/output. CORE did not edit WORKFLOW-owned routes or persistence files.

### Exact focused validation executed under Node 24

Validation run: `https://github.com/Scofieldkoh/oakcloud/actions/runs/34667643792`

```text
node -e "if (Number(process.versions.node.split('.')[0]) !== 24) process.exit(1)"
npm ci
npx playwright install --with-deps chromium

npx vitest run \
  __tests__/components/a4-editor-c2-bridge.test.ts \
  __tests__/components/a4-editor-session.test.ts \
  __tests__/components/a4-page-editor.test.tsx \
  __tests__/components/a4-editor-toolbar.test.tsx \
  __tests__/components/a4-page-editor-ssr.test.tsx \
  --reporter=verbose
PASS — 5 files, 98/98 tests

npx vitest run __tests__/components/a4-pagination --reporter=verbose
PASS — 8 files, 171/171 tests

npx vitest run \
  __tests__/lib/template-field-contract.test.ts \
  __tests__/lib/template-field-f0-compatibility.test.ts \
  __tests__/lib/template-field-f1.test.ts \
  __tests__/lib/a4-content-policy-f1.test.ts \
  --reporter=verbose
PASS — 4 files, 63/63 tests

npx vitest run --config vitest.browser.config.ts \
  __tests__/browser/a4-input-sequences.browser.test.tsx \
  __tests__/browser/a4-boundary-semantics.browser.test.tsx \
  __tests__/browser/a4-page-editor.browser.test.tsx \
  --reporter=verbose
PASS — 3 real-Chromium files, 60/60 tests

npx eslint \
  src/components/documents/a4-page-editor.tsx \
  src/components/documents/a4-editor-semantic-bridge.ts \
  __tests__/components/a4-editor-c2-bridge.test.ts \
  __tests__/components/a4-page-editor.test.tsx \
  __tests__/browser/a4-input-sequences.browser.test.tsx
PASS — exit 0, 0 errors, 8 warnings

DATABASE_URL=postgresql://localhost:5432/oakcloud npm run db:generate
PASS

npm run typecheck
PASS

npx tsc -b
PASS
```

Focused C2 total: **20 test files, 392 tests passed, 0 failed** across the four explicitly executed Vitest/browser groups. The Chromium evidence is actual browser execution and includes the two new C2 cross-page/semantic-break cases plus all frozen G1 Enter/list/caret regressions.

The full production `npm run build` is intentionally not claimed from this focused run. It is executed by the repository's existing `Node 24 compatibility` pull-request workflow after the C2 PR is opened; that PR evidence must be reported separately rather than inferred.

### Review/correction evidence

C2 was reviewed and corrected against fresh Node 24 runs rather than weakening the frozen contract:

- initial component validation exposed the obsolete physical-page page-break assertion and the hard-page/leading-empty-block Backspace boundary;
- the hard-page boundary was corrected by semantic position/affinity mapping, not physical-page mutation;
- an unchanged rerun distinguished one transient selection assertion from a reproducible C2 defect;
- real Chromium then exposed that the current S1 paragraph primitive does not yet implement the frozen list Enter/exit semantics; CORE restored the existing SEMANTICS-owned canonical paragraph transaction as the bounded S2 compatibility path;
- final run `34667643792` is green for all focused component, S1, F1, Chromium, lint, Prisma, typecheck and `tsc -b` gates above.

### Compatibility impact / remaining risks

- Canonical C1 revision/session/history authority is unchanged.
- No reconstruction of canonical state from physical page DOM was introduced; the page-break writer that did persist cloned physical fragments is removed.
- Existing v1 semantic hard-break compatibility is preserved; no v2 writer is enabled.
- G1 browser behavior is preserved by the final 60/60 Chromium run.
- Existing explicit Add Blank Page/Delete Current Page controls still call SEMANTICS-owned canonical hard-section helpers (`appendHardPage` / `deleteHardPageSection`) selected from derived page metadata. They do not persist page DOM, but a future SEMANTICS packet should replace them with the final semantic page/break capability if the frozen model removes those helpers.
- Existing table column resize remains bounded rendered-table reconciliation through C1 until SEMANTICS supplies a canonical table-resize transaction.
- Complete field lifecycle remains dependent on F2; workflow persistence/output remains dependent on W2.
- Production Next build and repository-wide PR checks are not claimed here until the PR workflow executes them.

**READY FOR INTEGRATION — C2 ONLY**
'''

text = path.read_text(encoding='utf-8')
marker = '## 2026-09-12 — C2 handoff — CORE-C2-20260912-01'
if marker in text:
    raise SystemExit('C2 handoff already present')
path.write_text(text.rstrip() + entry + '\n', encoding='utf-8')
