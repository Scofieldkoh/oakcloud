# WORKFLOW Coordination Log

## WORKFLOW-W0-20260911-01

Role and packet: WORKFLOW / W0 — persistence, save concurrency, drafts, batch editing, preview and HTML/PDF compatibility proof  
Starting state: RUNNING  
Ending state: **READY FOR INTEGRATION — W0 only**  
Branch: `workflow/w0-a4-editor-persistence-proof`  
Existing PR: #33 — https://github.com/Scofieldkoh/oakcloud/pull/33  
Contract consumed: proposed v1 plus CORE/S0/F0 W0 handoff decisions; G0 remains open.

### Scope completed

W0 only was completed. The existing PR was updated; no competing PR, merge, W1 production behavior, Prisma migration/schema change, generated bundle update, version bump or deployment was performed.

Evidence now includes:
- writer/reader/consumer inventory for DocumentTemplate, TemplatePartial and GeneratedDocument, including lifecycle, draft, batch, preview and output consumers;
- closed revision-source design: API `expectedRevision`; DocumentTemplate/TemplatePartial use existing `version`; GeneratedDocument gets a dedicated future `revision` integer while `templateVersion` stays provenance;
- 409 conflict/error payload and audit/soft-delete/editability semantics;
- batch same-revision race and `selected_ids`/legacy ordering fixtures;
- draft stale-restore, save acknowledgement and reopen/status fixtures;
- exact C03 `<span data-a4-break="page"></span>` preservation fixture through the real recursive partial resolver plus legacy break compatibility expectations;
- C05/C06/C08 field persistence/identity/derived-value/missing-value fixtures;
- explicit synthetic-vs-PDF-byte validation boundary.

### Files changed

1. `tests/services/document-template-editor-save.test.ts`
2. `tests/services/document-template-editor-batch.test.ts`
3. `tests/services/document-template-editor-drafts.test.ts`
4. `tests/services/document-template-editor-fields.test.ts` (new)
5. `tests/document-output/document-template-editor-output.test.ts`
6. `docs/plans/2026-09-10-a4-editor-implementation/workflow-proof.md`
7. `docs/plans/2026-09-10-a4-editor-implementation/coordination/workflow.md`

No production source file is changed by this correction set.

### Validation evidence

This environment does not provide an executable Oakcloud checkout under Node 24. Its available container is Node 22 and cannot resolve GitHub/npm for a dependency-capable checkout. Therefore the following required commands remain **NOT EXECUTED here** and are not claimed as passing:

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

Likewise, actual Puppeteer PDF bytes could not be generated. Synthetic resolver/PDF-HTML fixtures are committed, but production PDF-byte readiness remains a later executable gate. The user explicitly authorized updating the PR despite this validation limitation.

### Owner status at W0 handoff

| Owner | Wave-0 packet | Evidence observed | Status / next gate |
| --- | --- | --- | --- |
| CORE | C0 | `coordination/core.md`; bounded C01/C04 proof, input inventory; targeted execution blocked in its environment | READY FOR INTEGRATION; CORE owns G0 review |
| SEMANTICS | S0 | PR #34; structural selection/C03 nested-break/list-continuity corrections; Node24 workflow lint/typecheck evidence, focused targets not executed | READY FOR INTEGRATION — S0 only |
| FIELDS | F0 | PR #32; field grammar/identity/lossless codec/trusted-rich proof; Node24 smoke/workflow evidence with focused Vitest blocked | READY FOR INTEGRATION — F0 only |
| WORKFLOW | W0 | PR #33; persistence/concurrency/draft/batch/output/field proof updated in this handoff | READY FOR INTEGRATION — W0 only |

G0 is **not** frozen by WORKFLOW. VERIFY remains idle until CORE publishes a verification assignment.

### W -> owner requests

**To CORE**
- Freeze the additive persistence contract name as `expectedRevision` across W consumers.
- Freeze revision sources: `DocumentTemplate.version`, `TemplatePartial.version`, and a dedicated future `GeneratedDocument.revision`; never use `templateVersion` as edit revision.
- Approve the repository-convention conflict mapping: HTTP 409 with stable `VERSION_CONFLICT`, safe current/expected revision details and reload/reconcile action; settle HTTP 428/equivalent for missing preconditions when enforcement becomes strict.
- Assign/sequence the future GeneratedDocument revision migration in W1 integration; W0 deliberately does not edit schema/migrations.
- Run/arrange the exact Node24 focused commands before treating W0 executable acceptance as complete.

**To SEMANTICS**
- Keep S0's exact C03 nested marker and list-continuity codec as the reader contract consumed by W output paths.
- Preserve legacy hard breaks plus supported authored class/style/attributes/context; identify any export projection attributes that W must allowlist later.

**To FIELDS**
- Publish the final F0 stored-field definition/identity codec and trusted-rich origin capability for W1 consumption.
- Preserve scoped IDs, raw-vs-derived distinction, forward metadata and false/zero/empty/missing semantics through persistence/reopen.

### Shared-change request to CORE

For W1 only, CORE must coordinate the shared database/API migration window for the dedicated `GeneratedDocument.revision` field and any shared error/capability contract changes. WORKFLOW does not request or authorize those shared changes in W0 and has not implemented them here.

### Exact stop point

All authorized W0 proof/design corrections are committed to the existing WORKFLOW branch/PR. WORKFLOW stops now. It must not implement W1 persistence/concurrency behavior, migrations, reader activation, PDF fallback fixes or bundle changes until CORE reviews C0/S0/F0/W0, freezes G0 and publishes a new explicit WORKFLOW assignment.

**READY FOR INTEGRATION — W0 only**
