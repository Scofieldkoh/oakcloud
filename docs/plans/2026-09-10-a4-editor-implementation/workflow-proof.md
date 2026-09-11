# WORKFLOW W0 — Persistence and Output Proof

Status: COMPLETE — handoff ready for CORE  
Assignment: `W0` from `coordination/dispatch.md`  
Baseline: `main` at `80056fb7ab6e410ef2d2ddc17a830b068d263671`  
Scope boundary: proof/inventory only. No production service mutation, client contract change, Prisma migration, BODY/SEMANTICS/FIELDS test edit, or version bump is included.

## 1. What W0 proves

W0 converts the persistence/output findings into deterministic regression fixtures before later implementation work begins. Known broken behavior is expressed with Vitest `it.fails(...)`, matching the Wave 0 convention: the suite stays green only while the asserted desired contract is still missing. When a later authorized implementation fixes a defect, its corresponding `.fails` marker must be removed so the same proof becomes a normal regression.

The proof set covers:

- template snapshot freshness and optimistic save concurrency;
- generated-document save sequencing and draft lifecycle;
- batch body/layout edits preserving canonical `contentJson`;
- older-template compatibility;
- PDF/HTML structural parity;
- explicit behavior when PDF pagination cannot produce a canonical paginated result.

## 2. Writer / reader / API inventory

| Surface | Writer / reader | Current behavior observed | Contract / ticket |
| --- | --- | --- | --- |
| Template editor | `src/app/(dashboard)/template-partials/editor/page.tsx` | `handleSave` builds `dataToSave` from parent `formData.content` and `formData.layout`. The submit path has no independent editor snapshot/revision token. | C-07, A4E-021 |
| Template API | `src/app/api/document-templates/[id]/route.ts` → `updateDocumentTemplate` | Validates the update payload and calls the service without an expected-version precondition. | C-07/C-08, A4E-021 |
| Template validation | `src/lib/validations/document-template.ts` | `updateDocumentTemplateSchema` has no `expectedVersion`. | C-08, A4E-021 |
| Template service | `src/services/document-template.service.ts` | Reads current row, increments `version`, then updates by `id` only. Two stale clients can both write successfully; the later write wins. | C-07/C-08, A4E-021 |
| Generated-document editor | `src/app/(dashboard)/generated-documents/[id]/edit/page.tsx` | A draft callback exists as `_handleAutoSave`, but is not wired into the editor. Successful manual save unconditionally clears dirty state after the request returns. | C-08, A4E-021/A4E-022/A4E-029 |
| Draft API | `src/app/api/generated-documents/[id]/draft/route.ts` | GET/DELETE are tenant-gated and user-scoped. GET declares freshness using HTML-only `draft.content !== document.content`; returned draft has no explicit base revision. | C-08, A4E-022 |
| Draft storage | `DocumentDraft` in `prisma/schema.prisma` | Stores `content`, `contentJson`, optional `metadata`, and `createdAt`; there is no typed base document revision or supersession marker. | C-08, A4E-022 |
| Batch review editor | `src/components/documents/generation-batch/batch-review-workspace.tsx` | Body edit calls `onEditContent(..., html, null)`. Layout edit constructs `{ version: 1, layout: nextLayout }`, replacing sibling JSON metadata. | C-07, A4E-024 |
| Batch workspace | `src/components/documents/generation-batch/document-generation-batch-workspace.tsx` | Active layout is derived from template `contentJson`, not the active item's edited JSON. | C-07/C-09, A4E-024 |
| Batch persistence hook | `src/components/documents/generation-batch/use-document-generation-batch.ts` | Surviving contract: `buildUpdateInput` carries `editedContentJson`; persistence also carries `expectedRevision`. The loss occurs before this boundary when wrappers replace/null local JSON. | C-07/C-08, A4E-024 |
| Template preview | `src/app/(dashboard)/template-partials/editor/page.tsx` → `/api/document-templates/render-test` | Preview submits content/name/category/custom context, but not a canonical unsaved snapshot containing all layout/field/composition revision state. | C-09, A4E-027 |
| PDF export | `src/services/document-export.service.ts` | Pagination failure is caught, warned, and PDF creation continues. The initial PDF HTML uses shared print CSS without overflow-visible fallback semantics; fixed-height page content can remain clipped if pagination fails. | C-09, A4E-019/A4E-028 |
| HTML export | `src/services/document-export.service.ts` | Export sanitizer allowlist omits representative editor structures including `blockquote`, `caption`, `tfoot`, and ordered-list `start`. | C-09, A4E-018 |
| Shared print CSS | `src/components/documents/a4-print-styles.ts` | Supports overflow options, continuation markers, oversized fragments, and explicit page breaks. The capability exists; the PDF fallback contract does not currently surface failure/degraded mode explicitly. | C-09, A4E-019/A4E-028 |

## 3. Deterministic proof fixtures

### Save / concurrency — `tests/services/document-template-editor-save.test.ts`

- `W-SAVE-01` — expected failure: submit-time template persistence still reads `formData.content` / `formData.layout` instead of an independently captured canonical editor snapshot.
- `W-SAVE-02` — expected failure: validation/service do not require or consume `expectedVersion` in the write predicate.
- `W-SAVE-COMPAT-01` — survives: `DocumentTemplate.version` already exists and is incremented on every update; `contentJson` remains optional/nullable.

### Batch — `tests/services/document-template-editor-batch.test.ts`

- `W-BATCH-01` — expected failure: body-only edit explicitly sends `null` for item JSON.
- `W-BATCH-02` — expected failure: layout edit does not merge into `activeItem.editedContentJson`.
- `W-BATCH-03` — expected failure: active layout is not sourced from active item edited JSON.
- `W-BATCH-SURVIVE-01` — survives: downstream batch update carries both `editedContentJson` and `expectedRevision`.
- `W-BATCH-COMPAT-01` — survives: `extractA4DocumentLayout(null)` and legacy unversioned JSON resolve to the default layout.

### Drafts / generated-document save — `tests/services/document-template-editor-drafts.test.ts`

- `W-DRAFT-01` — expected failure: `_handleAutoSave` has no consumer.
- `W-DRAFT-02` — expected failure: draft freshness is HTML-only instead of canonical JSON/base revision aware.
- `W-DRAFT-03` — expected failure: save acknowledgement is not bound to an edit/save revision before dirty state is cleared.
- `W-DRAFT-SURVIVE-01` — survives: draft reads/deletes are tenant-gated and user-scoped.
- `W-DRAFT-COMPAT-01` — survives: optional draft `metadata` and `contentJson` provide a migration-free place to carry a base revision/snapshot contract initially.

### Output — `tests/document-output/document-template-editor-output.test.ts`

A representative synthetic document includes a block quote, table caption/footer, and ordered list starting at 4. It is run through the real `buildPDFHtml` export builder.

- `W-OUTPUT-01` — expected failure: the actual PDF HTML sanitizer strips at least part of the representative rich structure.
- `W-OUTPUT-02` — expected failure: HTML exporter allowlist is not aligned with the same representative structure/attributes.
- `W-OUTPUT-03` — expected failure: long fallback PDF HTML contains fixed-height hidden overflow, so a pagination failure can hide trailing content while still producing a PDF.
- `W-OUTPUT-04` — expected failure: pagination failure is logged and swallowed instead of being surfaced/labeled as degraded.
- `W-OUTPUT-SURVIVE-01` — survives: the canonical paginated-section builder preserves continuation and oversized-page markers.

## 4. Inferred persistence assumptions closed by code + proof

### Template version semantics

`DocumentTemplate.version` is monotonic today, but advisory: service updates increment it while matching only `id`. It is not optimistic concurrency control until the request contract sends an expected version and the write predicate consumes it atomically.

Implication: basic template CAS does **not** require a new version column. A later implementation can reuse the existing integer, return a conflict when no row matches `{ id, tenantId, version: expectedVersion }`, and return the newly persisted row/version on success.

### Generated-document save semantics

`GeneratedDocument` has no independent integer revision field in the reviewed contract. Its editor can obtain a live HTML snapshot for a request, but the client currently has no request/edit generation token that prevents an older response from clearing newer dirty state.

Implication: CORE must choose one explicit compatibility contract before later WORKFLOW production work:

1. use `updatedAt` as an HTTP/API precondition and keep schema unchanged; or
2. add a dedicated revision column and migration if stronger integer-CAS semantics are required.

W0 does not choose or implement either.

### Draft semantics

Draft rows have no typed base revision, but already expose `metadata`. The least invasive first contract is to persist the canonical editor snapshot plus a base template/document revision in metadata and compare it on restore. A typed/indexed base-revision column is optional later hardening, not a Wave 0 prerequisite.

### Read-after-write semantics

The template service returns the row produced by Prisma `update`, so server read-after-write can expose the persisted version. That does not make the client race-safe: a stale client can still overwrite a newer version, and an older generated-document save response can still clear dirty UI state after a newer edit.

## 5. Intended later fixes — not authorized in W0

These are handoff requirements, not changes in this branch:

1. **Template save snapshot:** capture `{ content, contentJson, layout, fields/placeholders, compositionType }` from one canonical editor snapshot at submit time; do not compose the persisted body from delayed parent mirrors.
2. **Template CAS:** extend the template update request with `expectedVersion`; atomically reject stale writes; return persisted version/snapshot on success.
3. **Generated-document sequencing:** bind each request to an edit/save generation; only clear dirty state if the acknowledged request still represents the latest editor generation.
4. **Draft lifecycle:** wire autosave, persist canonical HTML+JSON with base revision metadata, restore only after explicit freshness comparison, and clean superseded/accepted drafts deterministically.
5. **Batch JSON merge:** body edits retain existing JSON; layout edits use the canonical merge helper so layout changes cannot delete sibling metadata; derive active layout from item-edited JSON first.
6. **Preview freshness:** preview request includes the exact unsaved canonical snapshot and a client revision; stale preview responses cannot replace a newer preview.
7. **Output parity:** share one structural sanitizer/schema across editor preview, HTML, and PDF; preserve intentional supported structures/attributes.
8. **PDF fallback:** either fail explicitly when canonical pagination fails, or render a clearly labeled degraded fallback with overflow-visible/natural page flow. A successful-looking clipped PDF is not acceptable.

## 6. Migration and client-contract implications

- **This W0 branch:** no migration and no runtime/API/client contract change.
- **Template optimistic concurrency:** can reuse existing `DocumentTemplate.version`; expected-version request/409 response is a future client/API contract change but not necessarily a schema change.
- **Generated-document concurrency:** using `updatedAt` avoids a migration; a dedicated revision requires one. CORE owns that decision before authorizing later WORKFLOW production edits.
- **Draft base revision:** can begin in existing `metadata`; typed/indexed storage would require a later migration only if justified.
- **Standards-version readiness:** no new schema marker is introduced in W0. Existing `contentJson.version === 1` compatibility behavior must remain readable while future document standards/versioning is designed.

## 7. Older-contract compatibility proof

W0 deliberately protects legacy stored templates:

- `contentJson` remains optional/nullable in the template contract.
- `extractA4DocumentLayout` returns `DEFAULT_A4_DOCUMENT_LAYOUT` for `null` and unversioned legacy JSON.
- The batch persistence hook already preserves `editedContentJson` when callers do not erase it.
- No stored row is rewritten by this branch.

This means later repairs should merge/augment canonical JSON instead of requiring bulk rewrites of older templates.

## 8. Collision / hotspot map for CORE

W0 owns only the six files released in `coordination/dispatch.md`; it touches no production hotspot.

Likely later collision points that CORE should sequence explicitly:

| Hotspot | WORKFLOW reason | Other likely owner |
| --- | --- | --- |
| `template-partials/editor/page.tsx` | save snapshot, preview snapshot | FIELDS / CORE can also touch this surface |
| `generated-documents/[id]/edit/page.tsx` | save sequencing, draft wiring | CORE may touch A4 editor integration |
| `batch-review-workspace.tsx` | preserve JSON, layout merge | CORE/SEMANTICS integration risk |
| `document-generation-batch-workspace.tsx` | active item layout/read path | CORE integration risk |
| `document-export.service.ts` | sanitizer + fallback semantics | SEMANTICS can affect pagination/output |
| template validation/API/service | expected-version contract | primarily WORKFLOW, but API contract needs CORE approval |
| Prisma schema | only if generated-document/draft revision is promoted to typed columns | schema migration is shared/integration-sensitive |

FIELDS-owned parser/catalog work and SEMANTICS-owned list/page-break work are not modified here.

## 9. Acceptance commands

Per dispatch, the authoritative Wave 0 commands are:

```bash
npx vitest run tests/services/document-template-editor-save.test.ts tests/services/document-template-editor-batch.test.ts tests/services/document-template-editor-drafts.test.ts
npx vitest run tests/document-output/document-template-editor-output.test.ts
npx tsc -b
```

The expected-failure cases are intentionally baseline-red specifications wrapped with `it.fails`. Once the corresponding production fix is authorized and lands, remove `.fails` from that proof in the same change that makes it pass.

## 10. W0 stop condition

Inventory is complete, persistence/output loss is captured, a representative synthetic PDF fixture is exercised through the actual PDF HTML builder, inferred version/draft assumptions are closed, compatibility is recorded, and migration/client-contract risks are handed to CORE.

WORKFLOW must stop here. No W1/W2 production work is self-released from this document.
