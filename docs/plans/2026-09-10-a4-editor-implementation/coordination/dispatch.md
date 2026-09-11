# A4Editor manual coordination dispatch

Coordinator: CORE
Shared checkout: `C:\Users\Scofieldkoh\Documents\oakcloud`
Integration branch (remote preparation): `codex/a4-editor-core-c0`
Starting baseline: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Contract: proposed v1; **G0 NOT PASSED**
Deployment: not authorized

## Shared resource reservations — Wave 0

- Git branch/index/commits, dependency installation, package/config changes, shared generated outputs: **CORE only**.
- Shared full build / `.next` output: **CORE only; workers must not run `next build` in the shared checkout during Wave 0**.
- Browser contexts and ports: CORE `3410`, SEMANTICS `3411`, FIELDS `3412`, WORKFLOW `3413`. Use isolated browser contexts and no shared authenticated fixture.
- Browser cache/output directories: `.tmp/a4-c0-core`, `.tmp/a4-s0-semantics`, `.tmp/a4-f0-fields`, `.tmp/a4-w0-workflow`; never reuse another role's directory.
- Database: Wave 0 production data is read-only. WORKFLOW may use only an explicitly disposable synthetic test database/schema for its own W0 tests; no other role has a database mutation lease.
- Generated pagination bundle and Prisma client: reserved to CORE integration windows; workers may inspect but must not regenerate in the shared checkout.
- Existing business records, credentials and document contents are never test fixtures.

## CORE-C0-20260911-01

Dispatch ID: CORE-C0-20260911-01
Role and packet: CORE / C0 — contract and input-routing proof
State: DISPATCHED
Working directory: `C:\Users\Scofieldkoh\Documents\oakcloud`
Baseline commit: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Contract version and status: proposed v1; G0 open
Integrated prerequisites and published consumer APIs: planning documents only; no production C01/C02/C04 implementation frozen yet
Exclusive writable production/test/document paths: `src/components/documents/a4-page-editor.tsx`, `src/components/documents/a4-editor-toolbar.tsx`, CORE-owned session/native-input/history modules including `src/components/documents/a4-pagination/editor-session.ts`, `__tests__/components/a4-page-editor.test.tsx`, `__tests__/components/a4-editor-toolbar.test.tsx`, `__tests__/components/a4-editor-session.test.ts`, `__tests__/browser/a4-page-editor.browser.test.tsx`, `__tests__/browser/a4-input-sequences.browser.test.tsx`, this `coordination/dispatch.md`, `coordination/core.md`, implementation README/contracts/gate documentation
Allowed new files within that scope: CORE session/native-input/history proof modules and the two named C0 test files; coordination files
Reserved validation resources and when they may be used: port 3410; browser/cache `.tmp/a4-c0-core`; shared build only when all other owners are not running source-dependent validation
Required acceptance evidence: input mutation inventory; rapid Enter->typing regression; A->B->Undo regression; cross-page Enter regression; executable revision bridge proof for delayed projection, rapid delete, stale-pointer mapping/rejection and composition; exact test results or explicit environment block
Allowed independent work if a producer is not yet available: C01/C04 proof types and compatibility adapter design only; do not implement S/F/W behavior
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/core.md`
Completion boundary and next dependency: C0 evidence ready for G0 review; G0 remains blocked on S0/F0/W0 handoffs

## SEMANTICS-S0-20260911-01

Dispatch ID: SEMANTICS-S0-20260911-01
Role and packet: SEMANTICS / S0 — structural positions and nested break representation proof
State: DISPATCHED
Working directory: `C:\Users\Scofieldkoh\Documents\oakcloud`
Baseline commit: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Contract version and status: proposed v1; G0 open
Integrated prerequisites and published consumer APIs: contracts C02/C03/C04 are proposals only; CORE C0 proof may be read but is not frozen
Exclusive writable production/test/document paths: `src/components/documents/a4-pagination/model.ts`, `selection.ts`, `document-actions.ts`, `formatting.ts`, `engine.ts`, `measure.ts`, `layout.ts`, `a4-page-layout.ts`, `a4-page-content-css.ts`, `a4-font-faces.ts`, `src/components/documents/a4-print-styles.ts`, `src/lib/document-page-breaks.ts`; existing S-owned pagination/break tests; new `__tests__/browser/a4-boundary-semantics.browser.test.tsx`; `coordination/semantics.md`
Allowed new files within that scope: S-only codec/projection/position proof helpers and fixtures inside the listed ownership; the named boundary browser test
Reserved validation resources and when they may be used: port 3411; browser/cache `.tmp/a4-s0-semantics`; no shared build, package install, Prisma generation or pagination-bundle generation
Required acceptance evidence: old/v2 nested-break codec proof; one logical list item through projection and break deletion; after-`<br>`/empty structural position distinctions; reverse selection; old/new serialization compatibility; explicit table limitation
Allowed independent work if a producer is not yet available: pure codec/position fixtures and tests; do not edit CORE/W/F files
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/semantics.md`
Completion boundary and next dependency: READY FOR INTEGRATION S0 handoff; wait for CORE G0 decision before S1

## FIELDS-F0-20260911-01

Dispatch ID: FIELDS-F0-20260911-01
Role and packet: FIELDS / F0 — grammar, legacy and trust-boundary inventory
State: DISPATCHED
Working directory: `C:\Users\Scofieldkoh\Documents\oakcloud`
Baseline commit: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Contract version and status: proposed v1; G0 open
Integrated prerequisites and published consumer APIs: C05/C06 proposals only; no protected-field or escaping writer enabled
Exclusive writable production/test/document paths: `src/components/documents/template-editor/*` except route wrappers; `src/types/placeholders.ts`; `src/lib/template-placeholder-storage.ts`, `template-analysis.ts`, `placeholder-resolver.ts`, `document-generation-master-fields.ts`; proposed F-owned parser/registry/content-policy modules; existing F-owned component/lib tests and new grammar/scoped-field fixtures; `coordination/fields.md`
Allowed new files within that scope: F-only parser/registry/policy proof modules and synthetic fixtures inside the listed ownership
Reserved validation resources and when they may be used: port 3412; browser/cache `.tmp/a4-f0-fields`; no shared build, package install, Prisma generation or route/service edits
Required acceptance evidence: supported/malformed grammar matrix; stored-type and unknown-metadata round trips; plain-text vs trusted-rich inventory; scoped collision proof; exact C05/C06 interface proposal and integration requests
Allowed independent work if a producer is not yet available: parser/adapter fixtures and policy inventory only; server/API preservation requests go in handoff, not cross-owner edits
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/fields.md`
Completion boundary and next dependency: READY FOR INTEGRATION F0 handoff; wait for CORE G0 decision before F1

## WORKFLOW-W0-20260911-01

Dispatch ID: WORKFLOW-W0-20260911-01
Role and packet: WORKFLOW / W0 — writer, reader and deployment inventory
State: DISPATCHED
Working directory: `C:\Users\Scofieldkoh\Documents\oakcloud`
Baseline commit: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Contract version and status: proposed v1; G0 open
Integrated prerequisites and published consumer APIs: C07/C08/C09 proposals only; no migration applied and no new writer enabled
Exclusive writable production/test/document paths: template/partial and generated-document route files; `src/components/documents/generation-batch/*`; document template/partial/generator/export services and document-generation-batch service directory; related APIs/validation schemas; Prisma forward migration source; server font adapter; pagination bundle build source/generated bundle **source changes may be authored but generation is reserved to CORE**; W-owned route/batch/service/API/persistence/output tests; `coordination/workflow.md`
Allowed new files within that scope: W-only synthetic writer/reader/output fixtures and proposed forward migration files; do not regenerate shared artifacts in Wave 0
Reserved validation resources and when they may be used: port 3413; browser/cache `.tmp/a4-w0-workflow`; only explicitly disposable synthetic DB/schema; generation commands must be handed to CORE rather than run in shared checkout
Required acceptance evidence: complete writer/consumer/reader matrix; capability design; expectedRevision/additive response and GeneratedDocument revision migration design; failing delayed-save/conflict/layout-loss fixtures; real synthetic two-page PDF/HTML baseline if environment permits; rollback notes
Allowed independent work if a producer is not yet available: inventory, failing tests, capability/migration design; do not recreate S/F/CORE contracts
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/workflow.md`
Completion boundary and next dependency: READY FOR INTEGRATION W0 handoff; wait for CORE G0 decision before W1

## Integration freeze

Wave 0 may run only under the leases above. G0 cannot be marked passed until all four packet handoffs are present and CORE has reviewed the actual changes and evidence. No production v2 writer, strict revision enforcement, changed escaping behavior, deployment or merge-to-main is authorized by this dispatch.
