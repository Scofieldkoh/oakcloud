# WORKFLOW W0 — Persistence and Output Proof

Status: **READY FOR INTEGRATION — W0 only**  
Dispatch: `WORKFLOW-W0-20260911-01`  
Branch: `workflow/w0-a4-editor-persistence-proof`  
Existing PR: #33 — https://github.com/Scofieldkoh/oakcloud/pull/33  
Scope: proof, inventory and design only. No W1 production behavior, Prisma migration, schema change, generated bundle change, deployment, merge, or version bump.

## Environment and validation boundary

This execution environment can read/write the GitHub repository but does not provide an executable Oakcloud checkout under Node 24. The available container has Node 22 and cannot resolve `github.com`/the npm registry, so the required Node 24 commands and Puppeteer PDF-byte generation cannot be safely executed here. Per user direction, W0 corrections were committed to PR #33 anyway. No unexecuted command is reported as passed.

Required validation on an executable Node 24 checkout remains:

```bash
npm run lint
npm run typecheck
npm run build
npx vitest run tests/services/document-template-editor-save.test.ts
npx vitest run tests/services/document-template-editor-batch.test.ts
npx vitest run tests/services/document-template-editor-drafts.test.ts
npx vitest run tests/services/document-template-editor-fields.test.ts
npx vitest run tests/document-output/document-template-editor-output.test.ts
```

GitHub's existing Node-24 compatibility workflow may independently cover lint/typecheck/build after branch pushes; it does not substitute for the focused W0 Vitest commands. Synthetic HTML/resolver fixtures are committed; actual PDF bytes remain **UNEXECUTED** in this environment.

## Repository-wide persistence inventory

### DocumentTemplate

**Writers:** `createDocumentTemplate`, `updateDocumentTemplate`, `deleteDocumentTemplate` (soft delete), `restoreDocumentTemplate`, `duplicateDocumentTemplate` in `src/services/document-template.service.ts`; API/editor callers include the document-template routes and template editor. Update currently increments `version` but matches by `id` only. Delete/restore currently change lifecycle state without a revision precondition.

**Readers/consumers:** `getDocumentTemplateById`, `searchDocumentTemplates`, `getTemplateStats`, `getTemplatesByCategory`; template editor/preview routes; `renderTemplateForGeneration`; generated-document materialization; partial-usage/health analysis; document-generation batch/session paths; HTML/PDF export consumes generated snapshots derived from templates.

**W1 requirement:** every content/layout/title/field/letterhead or editing-lifecycle writer must participate in revision policy. `DocumentTemplate.version` remains the database revision source; API name is additive `expectedRevision`.

### TemplatePartial

**Writers:** `createTemplatePartial`, `updateTemplatePartial`, `deleteTemplatePartial` in `src/services/template-partial.service.ts`. Update is already serialized and increments `version` on material content/placeholders changes, but has no `expectedRevision` predicate. Delete is soft-delete and must not bypass stale-write protection when enforcement is active.

**Readers/consumers:** `getTemplatePartial`, `getTemplatePartialByName`, `searchTemplatePartials`, `getAllTemplatePartials`, `getPartialUsage`, `getPartialsUsedInTemplate`; template analysis, preview and `renderTemplateForGeneration`; service-agreement composition consumers. Nested partial dependencies are recursively discovered/resolved.

**W1 requirement:** map additive `expectedRevision` to existing `TemplatePartial.version`; preserve scoped field identity and all supported/unknown metadata through load/save/reopen.

### GeneratedDocument

**Writers:** materialize/update-or-create from a template, create blank document, `updateGeneratedDocument`, finalize, unfinalize, archive, soft delete, bulk delete, clone, and draft save paths in `src/services/document-generator.service.ts`; batch generation also updates generated-document content/snapshots. These paths must be classified as content/edit writers versus lifecycle/metadata writers before enforcement.

**Readers/consumers:** generated-document editor/API/search/detail/stats; batch review/generation; draft routes; document validation/comments/revisions; e-signing preparation/completion; SharePoint filing/upload; HTML/PDF export and downstream task integrations.

**Revision-source decision is CLOSED for W1:** add a dedicated integer `GeneratedDocument.revision` (contract target `Int @default(0)`, mapping per repository conventions). `templateVersion` remains immutable generation provenance and MUST NOT be reused as edit concurrency state. W0 does not apply this migration.

### Batch, draft, preview and output consumers

- Batch persistence already carries `expectedRevision`; body/layout wrappers can currently null/replace `editedContentJson` and active layout can ignore edited JSON.
- `DocumentDraft` already carries `content`, `contentJson` and `metadata`; W1 can record `baseServerRevision`, `sessionKey` and local `snapshotRevision` additively without a W0 schema change.
- Preview must consume one complete unsaved snapshot and identify the request/snapshot revision; stale responses must not replace current preview.
- HTML/PDF/local-print/readers must understand canonical C03 break markup before any v2 writer is activated.
- Existing checked-in pagination bundle remains untouched in W0; later regeneration belongs to the authorized W packet/integration window.

## Shared concurrency/versioning design for W1

### Request and success contract

All editable resources use the request name `expectedRevision`. For `DocumentTemplate` and `TemplatePartial`, it maps to existing `version`; for `GeneratedDocument`, it maps to the dedicated `revision`; batches retain their existing revision.

Successful mutation returns existing response data plus the newly acknowledged `revision`. A client saves canonical snapshot N against server revision R. Only acknowledgement of N/R may clear N's dirty state. If the editor has advanced to N+1 while the request is in flight, N+1 remains dirty and the next request uses returned R+1.

### Atomic predicate

The write predicate must contain resource id, workspace/tenant, non-deleted state, `expectedRevision`, and editable status where applicable. The revision increment and mutation occur atomically in the same statement/transaction. A zero-row update is re-read only to classify not-found/deleted/not-editable/conflict; it must never perform an unchecked fallback write.

### Conflict mapping

Use the repository's existing `ApiError`/`ConflictError` + `createErrorResponse` convention and HTTP **409**. Stable W1 code should be `VERSION_CONFLICT` (already present in `ErrorCodes`) rather than inventing content-specific text parsing. Safe payload:

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

Do not include document body, field values, credentials, internal database diagnostics or another tenant's identifiers. After strict enforcement is activated, a missing required precondition should use recoverable HTTP 428 (or the final repository-wide equivalent frozen by CORE) rather than silently accepting an unsafe write.

### Field/content policy

One save snapshot must atomically preserve canonical HTML, `contentJson`, layout, stored field definitions/metadata, title/letterhead and any output-affecting metadata in scope. `mergeA4DocumentLayout` preserves unrelated JSON keys. Content-only edits must not send `null` metadata as a reset. Field IDs remain stable and owner-scoped; same labels/keys in different scopes cannot collapse. Derived definitions remain distinguishable from raw source values. `false`, `0`, empty and missing remain distinct. Client `renderMode` cannot promote untrusted text to trusted HTML.

### Audit requirements

Every accepted content/edit/lifecycle mutation retains existing tenant/user audit boundaries and records at minimum resource/entity, actor/workspace, old revision, new revision, changed-field summary and change source/reason where currently supported. Conflict/rejected writes do not generate a successful mutation audit. Logs/errors must not contain canonical document bodies or sensitive field values.

### Soft delete and lifecycle

Soft-deleted resources are excluded from normal CAS predicates. Delete/restore/finalize/unfinalize/archive operations that alter editability or can race with an editor must participate in revision sequencing once enforcement is active. Generated documents are editable only in the authorized editable lifecycle state (currently DRAFT); finalized/archived rows cannot accept editor content writes. Authorized unfinalize may return to DRAFT with a new revision.

### Batch race

Batch writes retain their existing `expectedRevision`. Two requests from revision R cannot both succeed: the first commits R+1; the second receives a conflict carrying current R+1. Item ordering prefers explicit `selected_ids` when present and preserves legacy ordering as the reader fallback. Per-item `editedContentJson` is merged/preserved and cannot be erased by body-only changes.

## Executable W0 fixture catalogue

### Save/reopen and stale save

`tests/services/document-template-editor-save.test.ts` now records:
- expected failure for delayed parent-form save instead of a canonical submit-time snapshot;
- expected failures for `expectedRevision` CAS on template/partial and dedicated GeneratedDocument revision;
- compatibility proof that template/partial version integers already exist and old nullable JSON remains readable.

`tests/services/document-template-editor-drafts.test.ts` adds pure executable fixtures proving a delayed save acknowledgement cannot clear N+1 dirty state, draft restore requires reconciliation when base server revision is stale, reopen preserves editable HTML/JSON for DRAFT, and FINALIZED/ARCHIVED are non-editable.

### Batch

`tests/services/document-template-editor-batch.test.ts` retains baseline loss fixtures and adds executable proof that layout merge preserves sibling/forward JSON metadata, `selected_ids` overrides legacy order while old ordering stays readable, and a same-revision race has exactly one winner.

### Exact C03 break and output compatibility

Canonical break is exactly:

```html
<span data-a4-break="page"></span>
```

Legacy top-level break remains supported:

```html
<div class="page-break" data-break-type="hard"></div>
```

`tests/document-output/document-template-editor-output.test.ts` now covers direct PDF-HTML assembly preservation as a baseline expected failure, including authored class/style/custom attribute/context. Its nested fixture reaches the real recursive `resolvePlaceholders` partial-resolution path (`outer -> inner`) and asserts the exact canonical break remains inside the logical OL/LI/P structure. This replaces a fake string-only nested-partial proof. Missing partials are also asserted observable.

Actual PDF binary generation is mandatory at a later executable gate but was impossible here because Puppeteer/Node24 dependencies cannot be executed. W0 therefore distinguishes **synthetic canonical HTML/resolver evidence** from **production PDF-byte readiness**.

### Fields C05/C06/C08

`tests/services/document-template-editor-fields.test.ts` proves save/reopen preservation of scoped stable identity and unknown metadata, distinguishes derived definitions from raw source values, preserves false/zero/empty/missing, proves layout merge does not collapse field metadata, and exercises escaped ordinary values plus missing-field diagnostics on the canonical resolver.

## Deployment/capability and reader-before-writer design

No existing feature/cohort flag was assumed. G0/W1 must publish an actual additive capability through the existing read/route contract or approved feature configuration with at least reader format level, allowed writer level and revision-precondition requirement.

Rollout order:
1. deploy compatible readers to API, editor reopen, batch, render/preview, export workers/static output and local print;
2. add GeneratedDocument revision storage/readback and additive revision responses;
3. deploy clients that send `expectedRevision` while server remains transition-compatible;
4. verify mixed old/new readers and rollback;
5. only then require the precondition and enable v2/C03 writers.

Rollback disables new writers/precondition requirement before rolling back readers. Never roll back reader capability while persisted newer-format content may still exist. Existing canonical HTML/unknown metadata must remain recoverable; no destructive bulk rewrite is part of W0.

## Cross-owner requests for CORE G0

- **CORE:** freeze C01 snapshot adapter/session identity and approve `VERSION_CONFLICT`/409 plus the recoverable missing-precondition response; coordinate GeneratedDocument revision migration ownership for W1 without applying it in W0.
- **SEMANTICS:** confirm S0 canonical C03 serializer/parser fixtures are the reader contract for direct and nested breaks, including preservation of supported attributes/context and list continuity.
- **FIELDS:** publish the F0 stored-field type/codec and trusted-rich capability API so W1 can persist definitions atomically without locally recreating parser/policy logic.
- **WORKFLOW:** no self-advance. Resume only after CORE publishes a new W1 dispatch against an integrated/frozen prerequisite.

## File/checkpoint evidence

The branch was updated directly through GitHub on the existing PR #33. No competing PR was created and no merge was performed. Git blob SHA/byte-size values should be treated as repository content checksums; final branch commit SHA is the integration checkpoint. Re-fetch these values at CORE review because this file itself changes during handoff.

## Stop point

W0 stops after inventory, concurrency design, executable baseline/survival fixtures, compatibility/output design and handoff evidence. Focused Node24/Puppeteer execution remains an explicit validation gap, not a blocker to committing this W0 proof per user instruction.

**READY FOR INTEGRATION — W0 only**
