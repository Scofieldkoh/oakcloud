# WORKFLOW Coordination Log

Instance: `WORKFLOW`  
Assignment: `W0`  
Status: COMPLETE — HANDOFF READY FOR CORE  
Baseline: `main` at `80056fb7ab6e410ef2d2ddc17a830b068d263671`

## Scope completed

Executed only the released W0 assignment from `coordination/dispatch.md`:

- inventoried template/generated-document/batch/draft/preview/export readers and writers;
- converted save-concurrency, draft, batch-JSON and output-parity defects into focused baseline proofs;
- exercised a representative rich document through the actual PDF HTML builder;
- closed the inferred version/draft/read-after-write assumptions from current code;
- recorded migration/client-contract implications and future collision points in `workflow-proof.md`.

No worker was delegated. No later WORKFLOW assignment was started.

## Files changed

Only the six WORKFLOW-owned W0 paths were changed:

1. `tests/services/document-template-editor-save.test.ts`
2. `tests/services/document-template-editor-batch.test.ts`
3. `tests/services/document-template-editor-drafts.test.ts`
4. `tests/document-output/document-template-editor-output.test.ts`
5. `docs/plans/2026-09-10-a4-editor-implementation/workflow-proof.md`
6. `docs/plans/2026-09-10-a4-editor-implementation/coordination/workflow.md`

No production source, Prisma schema/migration, version file, BODY/SEMANTICS/FIELDS test, or shared coordination file was modified.

## Backend / persistence readers and writers reviewed

- `src/app/(dashboard)/template-partials/editor/page.tsx`
- `src/app/api/document-templates/[id]/route.ts`
- `src/lib/validations/document-template.ts`
- `src/services/document-template.service.ts`
- `src/app/(dashboard)/generated-documents/[id]/edit/page.tsx`
- `src/app/api/generated-documents/[id]/draft/route.ts`
- `src/services/document-generator.service.ts`
- `src/components/documents/generation-batch/batch-review-workspace.tsx`
- `src/components/documents/generation-batch/document-generation-batch-workspace.tsx`
- `src/components/documents/generation-batch/use-document-generation-batch.ts`
- `src/services/document-export.service.ts`
- `src/components/documents/a4-print-styles.ts`
- `src/components/documents/a4-pagination/layout.ts`
- `prisma/schema.prisma`

## Baseline failures captured

| Proof | Baseline defect |
| --- | --- |
| `W-SAVE-01` | template submit composes persistence from parent `formData`, not a canonical editor snapshot |
| `W-SAVE-02` | no expected-version request/write predicate |
| `W-BATCH-01` | body edit sends `null` content JSON |
| `W-BATCH-02` | layout edit replaces sibling JSON metadata |
| `W-BATCH-03` | active layout reads template JSON instead of item-edited JSON |
| `W-DRAFT-01` | generated-document autosave callback is unwired |
| `W-DRAFT-02` | draft freshness is HTML-only |
| `W-DRAFT-03` | save acknowledgement can clear dirty state without an edit/save revision guard |
| `W-OUTPUT-01` | PDF sanitizer does not preserve representative rich structure |
| `W-OUTPUT-02` | HTML sanitizer contract is not aligned |
| `W-OUTPUT-03` | fallback PDF HTML retains fixed-height hidden overflow |
| `W-OUTPUT-04` | pagination failure is warned and swallowed |

These are intentionally wrapped in `it.fails` for W0 baseline proof. Later fixes must remove `.fails` as each desired invariant becomes true.

## Surviving fixtures / compatibility

- `DocumentTemplate.version` already exists and increments, so basic template expected-version CAS can reuse it without a schema migration.
- Batch save input already carries `editedContentJson` and `expectedRevision`; wrapper boundaries are the data-loss point.
- Draft GET/DELETE paths are tenant-gated and user-scoped.
- `DocumentDraft.metadata` can carry initial base-revision metadata without a migration.
- Older `null` / unversioned template `contentJson` resolves to `DEFAULT_A4_DOCUMENT_LAYOUT`.
- Paginated output preserves continuation and oversized-page markers.

## Migration and client-contract implications

W0 itself changes neither schema nor client/API contracts.

Before later WORKFLOW implementation, CORE must explicitly settle:

- template update `expectedVersion` request and stale-write response semantics;
- generated-document conflict token: `updatedAt` precondition versus a new integer revision (the latter requires migration);
- whether draft base revision remains in existing JSON `metadata` or is promoted to typed/indexed storage;
- degraded PDF fallback policy: explicit failure versus clearly labeled overflow-visible fallback.

Template CAS can use the existing integer version. Draft base revision can initially use existing metadata. No migration is justified by W0 alone.

## Collision risks for later waves

Do not release later WORKFLOW production edits on shared editor/export hotspots without CORE sequencing:

- template editor save + preview surface can collide with FIELDS/CORE;
- generated-document editor can collide with CORE editor-session work;
- batch review/workspace can collide with CORE/SEMANTICS integration;
- export service can collide with SEMANTICS pagination/output changes;
- any Prisma migration remains shared/integration-sensitive.

No such hotspot was edited in W0.

## Acceptance targets

```bash
npx vitest run tests/services/document-template-editor-save.test.ts tests/services/document-template-editor-batch.test.ts tests/services/document-template-editor-drafts.test.ts
npx vitest run tests/document-output/document-template-editor-output.test.ts
npx tsc -b
```

Expected-failure fixtures are baseline specifications, not waived bugs.

## CORE handoff

Detailed evidence, writer/reader inventory, inferred-assumption closure, compatibility proof, intended later fixes, and risk map are in:

`docs/plans/2026-09-10-a4-editor-implementation/workflow-proof.md`

Handoff status: READY. WORKFLOW stops at W0 and awaits CORE review/release before any production persistence, draft, batch, preview, HTML/PDF or schema work.
