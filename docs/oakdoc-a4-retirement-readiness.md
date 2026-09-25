# OakDoc Stage 7: A4 Retirement Readiness

Stage 7 adds migration inventory, semantic parity checks, DOCX package diagnostics, readiness states, and reversible preference controls. It intentionally does **not** remove A4Editor, deactivate legacy templates, or rewrite historical GeneratedDocuments.

## What Stage 7 proves

A migrated OakDoc template can be linked to its exact legacy source by stable template ID/version metadata. A parity check compares normalized business semantics rather than HTML/DOCX bytes or layout. Only a passing check for the current legacy and OakDoc revisions can reach `READY_FOR_SWITCHOVER`; an explicit audited preference change is then required for `OAKDOC_PRIMARY`.

The legacy template remains active and retained. Preference can be changed back to `LEGACY`. Existing GeneratedDocuments continue to retain their original `templateId` and `templateVersion` references.

## A4-dependent production paths still present

Complete A4 removal is blocked while any of these paths remain authoritative:

| Area | Current A4 dependency | Retirement requirement |
| --- | --- | --- |
| Template authoring | `src/components/documents/a4-page-editor.tsx`, `a4-editor-toolbar.tsx`, `a4-editor-semantic-bridge.ts`, `a4-pagination/`, `a4-print-styles.ts`, and the template-editor components continue to edit HTML/A4 templates. | OakDoc must cover the same authoring, field, layout, validation, and recovery workflows before A4 authoring is disabled. |
| Template storage compatibility | `src/lib/document-editor/a4-editor-format.ts`, `a4-editor-capabilities.ts`, `a4-workflow-status.ts`, and template CRUD still preserve/read A4 HTML and A4 `contentJson`. | Keep read compatibility for historical data; remove A4 write paths only after all active templates are migrated and verified. |
| Legacy document generation | `src/services/document-generator.service.ts` resolves legacy placeholders/partials into HTML and creates GeneratedDocuments from that result. | A server-capable OakDoc generation/materialization path must persist DOCX-native generated documents with equivalent context, audit, tenancy, and revision behavior. |
| Generation workspace | `src/app/(dashboard)/generated-documents/generate/page.tsx` deliberately filters OakDoc templates from the legacy batch workflow; `src/components/documents/generation-batch/` reviews/edits HTML-oriented generated content. | Batch generation, review, edit, validation, save and resume must accept OakDoc documents before the legacy workspace can retire. |
| Preview and template test APIs | `src/app/api/generated-documents/preview/route.ts` and `src/app/api/document-templates/render-test/route.ts` use the legacy generation/rendering contracts. | Provide OakDoc-native preview/test endpoints with equivalent validation evidence. |
| PDF/HTML export | `src/services/document-export.service.ts`, `a4-output-browser.service.ts`, `document-export-pagination-browser.entry.ts`, and `src/lib/document-editor/a4-output-preparation.ts` remain tied to A4 HTML/browser pagination. | Define the canonical OakDoc DOCX -> PDF/export route and prove layout/signing parity where PDF is required. |
| Service Agreements | `src/services/service-agreement/renderer.ts` assembles service sections, fees and entity appendices into HTML; service partials are currently HTML-based. | Port the Service Agreement composition model to OakDoc-native structural blocks/repeaters and validate representative scenarios with the Stage 7 semantic harness. |
| Generated-document editing | Existing GeneratedDocument `content` / `contentJson` editing and finalization flows are still centered on the legacy document model. | Introduce a DOCX-native generated-document storage/editing contract without breaking historical A4 GeneratedDocuments. |
| E-sign/PDF preparation | Downstream e-signing preparation consumes finalized generated-document/PDF behavior that today originates from legacy generation/export for A4 documents. | Verify OakDoc-generated documents can enter the same signing, completion, certificate, download, and filing flows without semantic loss. |
| Content safety/sanitization | `src/lib/a4-content-policy.ts` and `src/services/a4-content-sanitizer.service.ts` remain part of trusted A4 content handling. | Replace only after equivalent DOCX-native trust/sanitization boundaries are explicit and tested. |
| Operational tests/tooling | `scripts/run-a4-editor-smoke.mjs`, `test:a4:smoke`, and A4-focused unit/browser tests protect live behavior. | Keep these gates until the associated production path is retired; replace them with OakDoc parity/regression gates rather than simply deleting them. |

## Safe retirement gates

A4 write/generation paths should not be removed until all of the following are true:

1. Every A4 template that is still operationally required is represented by a stable migrated pair and has current-revision parity evidence.
2. Templates selected for cutover are explicitly `OAKDOC_PRIMARY`; no automatic bulk deactivation occurs.
3. OakDoc supports server-side materialization into the GeneratedDocument lifecycle, including tenant isolation, revision/concurrency checks, audit events, finalization and historical template/version references.
4. Standard generation, batch generation, Service Agreements, preview/test, PDF export, e-signing and SharePoint filing are verified against OakDoc outputs.
5. Historical A4 templates and GeneratedDocuments remain readable/exportable after A4 authoring is disabled.
6. Rollback to the retained legacy template is exercised and documented before any destructive cleanup is considered.
7. A production migration report shows no `MIGRATION_PENDING` or `MIGRATION_VALIDATION_FAILED` records for templates intended for A4 retirement.

## Stage 7 interfaces

- `src/lib/document-editor/oakdoc-migration.ts`: migration metadata, inventory classification and readiness calculation.
- `src/lib/document-editor/oakdoc-semantic-compare.ts`: shared-context semantic comparison harness.
- `src/lib/document-editor/oakdoc-package-diagnostics.ts`: DOCX structural/package diagnostics.
- `src/lib/document-editor/oakdoc-service-agreement-parity.ts`: Service Agreement semantic contract.
- `src/services/oakdoc-migration.service.ts`: tenant-scoped linking, validation evidence, reversible preferred-template control and preferred-pair resolution.
- `GET /api/document-templates?migrationInventory=true`: migration inventory.
- `PATCH /api/document-templates/:id` actions: `linkOakDocMigration`, `recordOakDocMigrationValidation`, and `setOakDocMigrationPreference`.

The remaining A4 dependencies above are therefore expected and intentional after Stage 7.
