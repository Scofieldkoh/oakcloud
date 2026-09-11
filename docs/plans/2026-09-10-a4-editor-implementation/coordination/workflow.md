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

## WORKFLOW-W1-20260911-01 — Integrated reader safety and revision plumbing

Role and packet: WORKFLOW / W1 only  
Integrated baseline: `339e068431d881f7d74c3b64e839c940e34feccf`  
Branch: `codex/a4-editor-workflow-w1`  
PR: #37 — existing PR only; **do not merge**  
Baseline reconciliation merge commit: `2cc51a6ff405251796cf3108f938b7a8c459fc5b`  
Latest W1 implementation head before this handoff-only commit: `12928afe857d5efdce8c7f8c35640a61e995dec6`  
W2/W3: **NOT STARTED**

A commit cannot contain its own SHA, so the implementation head above is the exact code head handed into this documentation commit. The final PR head and CI run are recorded in PR metadata after the handoff update.

### Baseline integration and conflict resolution

The previous W1 branch was reconciled with `main@339e068431d881f7d74c3b64e839c940e34feccf` as a real two-parent merge. The W1 changed-path set and the producer changes between the original Stage-1 common baseline and the integrated baseline were disjoint, so there were no content-level source conflicts to resolve. The merge retained every completed W1 blob while taking the integrated CORE C1 / FIELDS F1 / SEMANTICS S1 tree unchanged. No CORE-, SEMANTICS- or FIELDS-owned production implementation was edited to make W1 integrate.

### S1 production interfaces consumed

WORKFLOW consumes the integrated SEMANTICS production APIs rather than defining a second break parser or structural-position model:

- `detectA4BreakFormatLevel`
- `readA4BreakDocument`
- `partitionA4SemanticBreaks`
- `mapA4ProjectedTextPoint`
- `mapA4ProjectedStructuralPoint`
- `serializeA4CanonicalBreakDocument`
- `paginateA4FlowHtml`
- `paginateA4StructuralHtml`
- the revision-qualified projection map carrying CORE-owned `sessionKey` / `documentRevision`, text `sourceRanges` and exact structural `childBoundaries`

`src/lib/document-editor/a4-editor-format.ts` delegates markup format detection and canonical reading to S1 and only combines that result with the frozen optional `contentJson.a4Editor.schemaVersion` marker. `src/lib/document-editor/a4-server-dom.ts` is an environment adapter only: it provides one process-local JSDOM set of missing DOM primitives so the unchanged S1 DOM implementation can be consumed by server readers/export paths. It contains no hard-break parser, structural mapping algorithm or revision authority.

Compatibility preserved by these adapters includes legacy top-level hard breaks, nested C03 semantic breaks, one logical `LI` across a nested page break, revision-qualified text mapping and exact zero-text child-boundary mapping around `<br>`, field/atomic nodes and empty owners.

### F1 production interfaces consumed

WORKFLOW consumes FIELDS production contracts through the integrated modules, including:

- `parseTemplateFields`
- `resolveTemplateFields`
- `loadStoredFieldRegistry`
- `serializeStoredFieldDefinition`
- `resolveTypedFieldValueByPrecedence`
- `getA4SanitizerPolicy`
- `A4_EDITOR_DECORATION_ATTRIBUTES`
- the frozen C06 canonical trusted-rich capability model (WORKFLOW does not mint a parallel trust flag)

`placeholderDefinitionSchema` is now lossless for JSON-compatible field definitions: stable `id`; arbitrary stored/future type strings; `source`, `category`, `path`; `defaultValue`; `format`; `options`; explicit-vs-omitted `required`; `linkedTo`; `sourcePartial`; and unknown forward top-level metadata survive validation. Template and partial services pass stable owner IDs into the F1 registry/serializer. Unknown/preserve-only types remain stored unchanged and are not appearance-coerced.

Generation now enters the F1 parser/resolver boundary through `resolveTemplateFields`; typed top-level custom value selection uses `resolveTypedFieldValueByPrecedence`. F2 ordinary-field escaping and later scoped runtime rebinding are intentionally not activated in W1.

### Reader-before-writer capability state

The server capability is now:

```json
{
  "readerFormatLevel": 2,
  "allowedWriterFormatLevel": 1,
  "revisionPrecondition": "optional"
}
```

Old/missing/malformed client capability metadata still falls back conservatively to `1 / 1 / optional`. Client claims can reduce authority but cannot elevate server reader/writer/revision authority. Level-2 writers remain disabled. W-owned template, partial, generated-document, generation, preview/batch and export reader boundaries now validate stored content through the integrated S1 reader before a corresponding newer writer capability can ever be enabled.

### C07 revision / migration status

- Public precondition remains `expectedRevision`.
- DocumentTemplate and TemplatePartial compare it to their existing `version` and increment atomically in the accepted scoped mutation; successful responses preserve `version` and add public `revision`.
- `GeneratedDocument` now has `revision Int @default(0)` in `prisma/schema.prisma`; physical migration `prisma/migrations/20260911181700_add_generated_document_revision/migration.sql` adds `generated_documents.revision INTEGER NOT NULL DEFAULT 0`. There is no `@map` and `templateVersion` remains generation provenance only.
- GeneratedDocument canonical/lifecycle writers use a tenant/deleted/status/revision-qualified database claim and increment before canonical mutation in the same transaction. Zero-row claims are reclassified only through tenant-scoped state.
- Create/clone begin at revision 0; ordinary reads/search expose the dedicated revision.
- Finalize/unfinalize/archive/delete and existing-target materialization retain CAS and execute audit/task/e-sign effects only after an accepted canonical mutation.
- Bulk delete accepts per-document expected revisions so one stale item fails independently without mutating another item.
- Batch materialization/retry now carries each hidden GeneratedDocument's loaded revision into materialization and the returned revision into finalization. A concurrent child-document change therefore fails that item rather than being overwritten by an unchecked batch lifecycle write.
- Draft save records the canonical base revision and rejects a stale base before replacing that user's draft. Full overlapping autosave/session sequencing remains W2 and was not started.

### Output / export fail-safe

`src/services/document-export.service.ts` now routes canonical output through S1 and sanitizes through F1's shared C06 policy. It no longer uses the legacy top-level string splitter or independent sanitizer allowlists for W1 output. HTML/preview/PDF retain the supported canonical structures and semantic break attribute.

PDF pagination is a correctness gate: bundle/load/pagination/fragment/installation failure throws `ExportPaginationError` before `page.pdf`; invalid/empty fragment output is not accepted; fonts are awaited before measurement; cancellation and timeout do not produce successful bytes; page/browser resources close in `finally`; and successful audit logging occurs only after PDF bytes exist. No content/field values are logged on the failure path.

### Pagination browser bundle status

WORKFLOW does **not** hold the shared CORE generation lease. W-owned source/build integration is complete:

- `src/services/document-export-pagination-browser.entry.ts` is the stable W output bridge and delegates to the integrated S1 browser paginator.
- `scripts/build-pagination-bundle.mts` now bundles that W bridge, so S1's transitive projection/semantic dependencies are included when CORE regenerates.

The checked-in shared artifact was deliberately **not regenerated or hand-edited** by WORKFLOW. CORE must run exactly:

```bash
npm run generate:pagination-bundle
```

Expected generated file:

```text
src/components/documents/a4-pagination/pagination-bundle.generated.ts
```

This is a coordination handoff item, not permission for WORKFLOW to bypass the lease.

### Regression coverage added/updated

Synthetic W-owned coverage now includes:

- legacy top-level hard-break read/partition;
- nested C03 v2 read/partition and one-list-item projection;
- revision-qualified S1 text mapping;
- exact zero-text structural child-boundary mapping through W adapters;
- revision-qualified `paginateA4StructuralHtml`;
- server Node-environment S1 read/serialize adapter;
- 2/1 reader-before-writer capability and old-client fallback;
- level-2 write rejection;
- field ID/type/options/format/required-presence/link/sourcePartial/unknown-metadata preservation through W schemas and F1 registry;
- distinct identities for colliding field keys under different stable partial scopes;
- explicit PDF pagination failure, complete-fragment installation, cancellation cleanup and navigation-timeout cleanup;
- disposable-PostgreSQL source coverage for two stale template clients, stale partial writes, atomic GeneratedDocument revision increments, lifecycle stale rejection, bulk per-item isolation, tenant scoping, draft base freshness and field metadata persistence/read-back.

The PostgreSQL suite is gated by `TEST_DATABASE_URL`; it contains synthetic workspace/users/documents only and cannot run against production/business data by default.

### Validation actually executed / blocked

Local execution host:

```text
node --version
v22.16.0
```

Oakcloud requires Node `>=24 <25`, and this host cannot resolve `github.com` for an executable checkout. Therefore the following requested W1 commands are **NOT EXECUTED** here and are not claimed as passes:

```bash
npx vitest run \
  tests/lib/a4-editor-capabilities-w1.test.ts \
  tests/lib/a4-editor-producer-integration-w1.test.ts \
  tests/lib/a4-editor-server-reader-w1.test.ts \
  tests/services/document-export-w1.test.ts \
  tests/services/document-template-editor-save.test.ts \
  tests/services/document-template-editor-fields.test.ts \
  tests/services/document-template-editor-drafts.test.ts \
  tests/document-output/document-template-editor-output.test.ts

TEST_DATABASE_URL=<disposable-synthetic-postgres> npx vitest run \
  __tests__/integration/a4-editor-workflow-w1.postgres.test.ts \
  __tests__/integration/document-generation-batch.postgres.test.ts \
  --maxWorkers=1

npx tsc -b
```

Database fixture used by WORKFLOW in this session: **none**. No production/business database was touched. The new PostgreSQL suite is prepared only for an explicitly disposable `TEST_DATABASE_URL`.

GitHub Actions provides the repository's available Node-24 execution environment. On W1 implementation head `dddc21d86e2b60b22025fa83611dc94d8da55636`, run `34612857457` reached and passed the Node-24 runtime guard, lint, registry freshness, Prisma client generation and repository `npm run typecheck`; its disposable PostgreSQL migration-deploy job also completed successfully. At handoff drafting time that full workflow was still completing unrelated contract/build jobs. The child-revision follow-up head `12928afe857d5efdce8c7f8c35640a61e995dec6` queued run `34613376988`; final PR metadata should be consulted for its completed result.

Repository `npm run typecheck` is `tsc --noEmit`; it is useful compile evidence but is **not** represented as the requested `npx tsc -b` execution.

Actual Puppeteer PDF-byte/page/sentinel validation against the regenerated S1 bundle is also **BLOCKED FOR CORE INTEGRATION VALIDATION** until CORE holds the generation lease and produces the checked-in bundle.

### Remaining compatibility / integration adapters

No competing producer implementation remains. The remaining integration-only actions are:

1. CORE regeneration of the checked-in pagination bundle using the exact command/file above.
2. Execution of the focused W1 Vitest set, the disposable W1 PostgreSQL suite and `npx tsc -b` in an authorized Node-24 checkout.
3. Real PDF byte/page/sentinel validation after the regenerated bundle is present.

These are validation/integration gates; WORKFLOW has not started W2 route-snapshot/save-acknowledgement UI migration, W2 overlapping-draft sequencing, W3 field lifecycle/escaping, or any deployment activation.

### Stop boundary

PR #37 remains open, draft and unmerged until the outstanding Node-24 focused validation and CORE bundle-generation gate are satisfied. No application version bump was made. No deployment was activated. No production/business data was used.

**W2/W3 DID NOT START.**
