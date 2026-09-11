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

---

## WORKFLOW-W1-20260911-01 — Reader safety and revision plumbing

Role and packet: WORKFLOW / W1 only  
Common Stage-1 baseline: `bfdc4f95594b73ce4d20bff45f320bdb53837c37`  
Branch: `codex/a4-editor-workflow-w1`  
PR: #37 — https://github.com/Scofieldkoh/oakcloud/pull/37 (draft; do not merge)  
W2/W3: **NOT STARTED**

### W1 status matrix

| W1 requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| CORE dispatch `WORKFLOW-W1-20260911-01` confirmed | **COMPLETE** | Read from `codex/a4-editor-core-c1`; branch remains based on common Stage-1 baseline, not CORE C1 implementation. |
| GeneratedDocument forward SQL migration | **COMPLETE** | `prisma/migrations/20260911181700_add_generated_document_revision/migration.sql`; additive `revision INTEGER NOT NULL DEFAULT 0`; disposable PostgreSQL migration step passed in Node 24 CI. |
| GeneratedDocument Prisma model declaration | **BLOCKED ENVIRONMENT** | Required exact declaration is `revision Int @default(0)` with no `@map`. The connected GitHub writer exposes whole-file replacement only for this large schema and no safe line patch; migration/runtime use the frozen physical column but the Prisma declaration must be added before integration. |
| DocumentTemplate revision CAS / acknowledgement | **COMPLETE** | Public `expectedRevision`; existing `version` is compared in tenant/deleted predicate and incremented in accepted mutation; responses retain `version` and add `revision`. |
| TemplatePartial revision CAS / acknowledgement | **COMPLETE** | Public `expectedRevision`; existing `version` is compared/incremented atomically; responses retain `version` and add `revision`. |
| GeneratedDocument revision CAS / acknowledgement | **COMPLETE** | DB-side CAS claim updates `generated_documents.revision` by tenant/id/deleted/status/expected revision within the same transaction as canonical mutation. Create/clone return 0; get/search expose public `revision`. |
| Existing-target materialization revision safety | **COMPLETE** | CAS occurs before canonical update; linked draft Service Agreement deletion moved behind accepted CAS so stale materialization cannot delete it. |
| Finalize/unfinalize/archive/delete revision safety | **COMPLETE** | CAS before mutation; audit/task/e-sign effects run only after an accepted mutation. |
| Bulk generated-document delete revision participation | **COMPLETE** | Additive `expectedRevisions` map; each canonical row is independently CAS-protected and returns per-item failure without stale success effects. |
| Draft base-revision reconciliation | **NOT YET REQUIRED** | Draft rows do not increment canonical revision. Binding/reconciliation extension remains a later workflow/draft integration item; no W2 behavior was started. |
| Existing batch revision | **NOT YET REQUIRED** | Existing `DocumentGenerationBatch.revision` is preserved. No new W2 batch UX/session work was begun in W1. |
| Capability producer | **COMPLETE** | `src/lib/document-editor/a4-editor-capabilities.ts` + authenticated `GET /api/page-bootstrap/document-editor`; production/fallback is reader 1, writer 1, revision optional; client claims can only reduce authority. |
| v2 writer activation | **NOT YET REQUIRED** | Explicitly disabled in W1. |
| Independent PDF/export failure containment | **COMPLETE** | Pagination must succeed before `page.pdf`; no warning-and-clipped-success fallback; font readiness awaited; 30s bounds; page/browser cleanup in `finally`; stored document untouched; success audit only after PDF success. |
| Old/new C03 break readers / nested pagination | **WAITING FOR S1** | Must consume final S1 exports; no duplicate parser/paginator created. |
| Shared C06 content-policy adapters / sanitizer parity | **WAITING FOR F1** | Must consume final F1 policy exports; existing sanitizer allowlists were not independently widened/replaced. |
| TemplatePartial markup-based v2 feature detection | **WAITING FOR F1** | Final parser/registry adapter required. |
| Reader-before-writer level-2 content detection | **WAITING FOR S1** | Level-2 writer guard exists, but authoritative break-format detection must use S1 rather than a duplicate detector. |
| Server/render/export reader compatibility | **WAITING FOR S1** | Final structural reader integration deferred. |
| Pagination bundle regeneration/freshness | **WAITING FOR S1** | Regenerate only after S1 integration according to ownership procedure. |
| Actual Puppeteer PDF byte/sentinel evidence | **BLOCKED ENVIRONMENT** | Standard CI validates Node/Chromium path but this session has no dependency-capable Node 24 checkout for the requested real PDF proof. HTML-only evidence is not treated as PDF proof. |
| W2/W3 | **NOT YET REQUIRED** | Not started. |

### Public API contract implemented

Successful edit-capable responses preserve existing fields and acknowledge:

```json
{ "revision": 8 }
```

Template and partial responses also retain their native `version`; public `revision` mirrors it. GeneratedDocument public `revision` comes from the dedicated database column. Requests use additive:

```json
{ "expectedRevision": 7 }
```

Lifecycle DELETE endpoints accept `expectedRevision` as a query parameter where a request body is not already part of the route. Bulk generated-document delete accepts:

```json
{
  "ids": ["..."],
  "reason": "...",
  "expectedRevisions": { "<document-id>": 7 }
}
```

Transitional missing preconditions remain accepted only while server capability is `revisionPrecondition: "optional"`.

Stale mutation response is frozen as HTTP 409:

```json
{
  "error": "This document changed since you opened it. Reload or reconcile before saving.",
  "code": "VERSION_CONFLICT",
  "details": {
    "resourceType": "GeneratedDocument",
    "expectedRevision": 7,
    "currentRevision": 8,
    "action": "reload-or-reconcile"
  }
}
```

Future strict-mode missing precondition is HTTP 428:

```json
{
  "error": "expectedRevision is required for this mutation.",
  "code": "REVISION_PRECONDITION_REQUIRED",
  "details": {
    "resourceType": "GeneratedDocument",
    "action": "reload-and-retry"
  }
}
```

Capability bootstrap response is exactly:

```json
{
  "a4EditorCapabilities": {
    "readerFormatLevel": 1,
    "allowedWriterFormatLevel": 1,
    "revisionPrecondition": "optional"
  }
}
```

### Writer coverage

Independent W1 now covers the W0 inventory for document-template update/delete/restore, TemplatePartial update/delete, GeneratedDocument ordinary update, existing-target materialization, finalize, unfinalize, archive, soft delete and per-row bulk delete. Create/clone paths acknowledge their defined initial revision. Task/e-signing effects attached to finalize/unfinalize and task-outcome reconciliation are downstream of successful CAS and do not execute after a stale rejection. `templateVersion` remains generation provenance.

### Export containment

`generatePDF` now treats pagination as a correctness gate. When pagination is requested, failure to load the bundle, paginate, produce fragments, or install them into the print target throws typed recoverable `ExportPaginationError` before PDF bytes are returned. It does not log source document HTML or field values. Browser/page resources close in `finally`, and font readiness is awaited before pagination measurement. Existing HTML/preview sanitizers remain unchanged pending the F1 shared C06 policy.

### Tests and CI

Added focused capability tests for conservative fallback, non-elevation of authority and unsupported level-2 writer rejection. Existing W0 save/batch/draft/output fixtures remain the integration proof inventory. GitHub Actions `Node 24 compatibility` run `34590841516` completed **SUCCESS** on head `a6bac83b75673db9e0769e41817822c1e616f476`; its disposable PostgreSQL step successfully applied the new migration. Standard CI is useful compile/migration evidence but does not replace the requested real Puppeteer PDF-byte/sentinel validation.

Focused real-PDF proof remains **BLOCKED ENVIRONMENT** and must not be inferred from HTML-string tests.

### Producer integration dependencies

After S1/F1 are integrated, resume this same W1 branch/PR and only consume their final exports for C03 old/new break readers, nested-break pagination semantics, shared C06 policy/sanitizer parity, TemplatePartial v2 feature detection, server/render/export compatibility and reader-before-writer format rejection. Then regenerate the pagination bundle after S1 integration and rerun the output/PDF gates. No S1/F1 source has been copied into W1.

### Migration / rollback implications

Forward migration is additive and existing rows become revision 0. Rollback ordering remains: keep writer level 1; keep revision precondition optional; roll back strict clients/writers before reader plumbing; retain `generated_documents.revision` while any deployed code reads it; drop the column last only as part of a coordinated full schema rollback. No production database was reset or touched.

### Intermediate stop point

S1/F1 are not integrated. The PR remains draft/open and unmerged. W2/W3 have not started. Before producer integration, the one-line Prisma schema declaration noted above must be applied safely and the producer-dependent reader/policy/bundle work must remain deferred until S1/F1 land.
