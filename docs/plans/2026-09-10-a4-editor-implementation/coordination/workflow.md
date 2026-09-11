# WORKFLOW Coordination Log

## WORKFLOW-W0-20260911-01 — G0 correction handoff

Role and packet: WORKFLOW / W0 — persistence, concurrency, fields, drafts, batch editing and output proof  
Branch: `workflow/w0-a4-editor-persistence-proof`  
Existing PR: #33 — https://github.com/Scofieldkoh/oakcloud/pull/33  
Ending state: **READY FOR INTEGRATION — W0 only**  
G0 owner: CORE. WORKFLOW does not freeze or merge G0.

### Scope boundary

This correction stays inside W0. It does not begin W1/W2/W3/Stage 1 and does not change production resolver behavior, Zod/API schemas, Prisma schema/migrations, capability negotiation, `expectedRevision` enforcement, writer format level, pagination bundle, package/CI configuration, application version, deployment, or main.

### Corrections completed for CORE's second G0 review

1. **W-FIELD-05 corrected.** Current resolver behavior is now represented truthfully: ordinary values can presently introduce markup. The future C06 escape-at-interpolation requirement is an `it.fails` baseline and no resolver change is made.
2. **Fake field round-trip removed.** The W0 field fixture now exercises `placeholderDefinitionSchema`, document-template create/update request schemas, and TemplatePartial create/update request schemas. It explicitly records current stripping of `id`, `options` and unknown metadata, current defaulting of omitted `required`, and recognition of all current field types including `list` and `conditional`.
3. **F0 lossless target remains expected-failure evidence.** Full stable-ID/options/forward-metadata preservation and omitted-property presence semantics are not described as current production behavior.
4. **Capability contract published.** W0 defines `readerFormatLevel: 1 | 2`, `allowedWriterFormatLevel: 1 | 2`, and `revisionPrecondition: 'optional' | 'required'`. Repository search found no existing generic document-editor config endpoint. The established authenticated central read pattern is `src/app/api/page-bootstrap/*`; W0 therefore proposes, design-only, `src/lib/document-editor/a4-editor-capabilities.ts` plus `GET src/app/api/page-bootstrap/document-editor/route.ts` as the single propagation boundary. Old/missing capability data falls back to `1 / 1 / optional` and never enables writer level 2.
5. **C07 migration design completed.** Public precondition is `expectedRevision`; DocumentTemplate and TemplatePartial map it to existing `version`; GeneratedDocument gets future `revision Int @default(0)` with no `@map`; `templateVersion` remains provenance. Forward/transition/strict-enforcement/rollback ordering and participating writers are documented. No migration is applied.
6. **Synthetic output candidate completed.** The W0 output fixture now contains a heading, OL start=5, nested list, block quote, table caption/footer, synthetic field/reference, exact C03 inline break, legacy top-level hard break, 120 filler paragraphs, and unique first/last sentinels. Corresponding PDF-HTML sentinel ordering is represented in the test. Actual PDF-byte/page validation remains an execution gate, not an HTML claim.
7. **Handoff claims reclassified.** `workflow-proof.md` now labels evidence as SATISFIED, EXPECTED-FAILURE BASELINE CAPTURED, or BLOCKED FOR CORE INTEGRATION VALIDATION.

### W0 file set

PR #33 remains limited to these W-owned files:

1. `tests/services/document-template-editor-save.test.ts`
2. `tests/services/document-template-editor-batch.test.ts`
3. `tests/services/document-template-editor-drafts.test.ts`
4. `tests/services/document-template-editor-fields.test.ts`
5. `tests/document-output/document-template-editor-output.test.ts`
6. `docs/plans/2026-09-10-a4-editor-implementation/workflow-proof.md`
7. `docs/plans/2026-09-10-a4-editor-implementation/coordination/workflow.md`

This G0 correction changes only the field test, output test and the two WORKFLOW documents; the earlier W0 save/batch/draft proof files remain unchanged.

### Field test ledger

| Fixture | Classification | Meaning |
| --- | --- | --- |
| W-FIELD-01A | **SATISFIED** | actual `placeholderDefinitionSchema` current lossiness recorded |
| W-FIELD-01B | **SATISFIED** | actual DocumentTemplate create/update carriers show same current lossiness |
| W-FIELD-01C | **SATISFIED** | actual TemplatePartial create/update carriers show same current lossiness |
| W-FIELD-01D | **SATISFIED** | explicit `required:true` survives; omission currently materializes `false` |
| W-FIELD-01E | **SATISFIED** | all current types recognized, explicitly including legacy `list` and `conditional` |
| W-FIELD-01F | **EXPECTED-FAILURE BASELINE CAPTURED** | future lossless stable ID/options/unknown metadata contract |
| W-FIELD-01G | **EXPECTED-FAILURE BASELINE CAPTURED** | future omitted-property presence preservation |
| W-FIELD-04 | **SATISFIED** | layout merge keeps unrelated stored contentJson metadata |
| W-FIELD-05A | **SATISFIED** | current ordinary resolver value can inject markup; missing diagnostics remain observable |
| W-FIELD-05B | **EXPECTED-FAILURE BASELINE CAPTURED** | future C06 ordinary-value escaping boundary |

### Output test ledger

| Fixture | Classification | Meaning |
| --- | --- | --- |
| W-OUTPUT-FIXTURE-00 | **SATISFIED at source-contract level** | complete deterministic multi-page candidate and ordered HTML sentinels defined |
| W-OUTPUT-01..05 | **EXPECTED-FAILURE BASELINE CAPTURED** | current sanitizer/attribute/fallback gaps remain visible without production fixes |
| W-OUTPUT-FIXTURE-01/02 | **SATISFIED at source-contract level** | real recursive partial resolver and missing-partial observability fixtures |
| W-OUTPUT-SURVIVE-01 | **SATISFIED at source-contract level** | continuation/oversized markers remain in shared paginated-section builder contract |
| Actual Puppeteer PDF bytes/page count/text order/break/clipping proof | **BLOCKED FOR CORE INTEGRATION VALIDATION** | no Node 24 dependency-capable Oakcloud checkout on this session host |

“SATISFIED at source-contract level” identifies a normal passing assertion in the committed test source; it is **not** a claim that this session executed Vitest.

### Capability handoff

Proposed single server contract, not implemented in W0:

```ts
export interface A4EditorCapabilities {
  readerFormatLevel: 1 | 2;
  allowedWriterFormatLevel: 1 | 2;
  revisionPrecondition: 'optional' | 'required';
}
```

Proposed producer boundary: authenticated `GET /api/page-bootstrap/document-editor`, backed by one server module `src/lib/document-editor/a4-editor-capabilities.ts`.

Default when absent/old deployment:

```json
{
  "readerFormatLevel": 1,
  "allowedWriterFormatLevel": 1,
  "revisionPrecondition": "optional"
}
```

Reader-before-writer ordering and rollback are fully specified in `workflow-proof.md`. No scattered client flags are proposed.

### GeneratedDocument revision handoff

Design-only Prisma target:

```prisma
revision Int @default(0)
```

Physical table: `generated_documents`; physical column: `revision`; no `@map` needed. Existing/new rows begin at 0. Later accepted canonical/lifecycle writes compare public `expectedRevision` and increment once. Template/partial continue to use existing `version`. `templateVersion` is not an edit revision.

### Validation actually executed in this session

Focused W0 tests: **NOT EXECUTED**.  
`npx tsc -b`: **NOT EXECUTED**.  
Puppeteer/PDF bytes: **NOT EXECUTED**.

Reason: the available local host exposes Node `22.16.0`, no Node 24 binary and no dependency-capable Oakcloud checkout; `package.json` requires Node `>=24 <25`. W0 does not downgrade runtime requirements or alter CI/package configuration to fabricate a pass.

The existing repository PR workflow `.github/workflows/node24-compatibility.yml` does use Node 24 for checkout, lint, typecheck, build and Chromium-path validation after PR updates. Its result is useful independent evidence but does not substitute for the focused W0 Vitest commands below.

### Required CORE integration validation

```bash
npx vitest run \
  tests/services/document-template-editor-save.test.ts \
  tests/services/document-template-editor-batch.test.ts \
  tests/services/document-template-editor-drafts.test.ts \
  tests/services/document-template-editor-fields.test.ts

npx vitest run \
  tests/document-output/document-template-editor-output.test.ts

npx tsc -b
```

CORE integration validation must additionally run the actual Puppeteer PDF path against the committed synthetic candidate and verify page count >=2, first/last sentinel preservation and order, explicit break behavior, and no clipped-success output.

### G0 status matrix

| Requirement | Status |
| --- | --- |
| W-FIELD-05 truthfully represents current resolver + future C06 | **EXPECTED-FAILURE BASELINE CAPTURED** |
| Actual DocumentTemplate/TemplatePartial Zod boundary evidence | **SATISFIED** |
| Future F0 lossless field boundary | **EXPECTED-FAILURE BASELINE CAPTURED** |
| Exact capability contract/central propagation design | **SATISFIED** |
| Exact GeneratedDocument revision migration design | **SATISFIED** |
| Complete synthetic multi-page output candidate | **SATISFIED** |
| Real PDF-byte validation | **BLOCKED FOR CORE INTEGRATION VALIDATION** |
| Focused Node24 W0 Vitest execution | **BLOCKED FOR CORE INTEGRATION VALIDATION** |
| Node24 `npx tsc -b` | **BLOCKED FOR CORE INTEGRATION VALIDATION** |
| Production behavior/schema remains untouched | **SATISFIED** |

### Stop point

WORKFLOW stops after this W0 correction. No W1/W2/W3/Stage-1 implementation, migration, capability activation, revision enforcement, v2 writer, bundle regeneration, deployment or merge is started.

CORE owns the final G0 decision and execution-only integration validation.

**READY FOR INTEGRATION — W0 only**
