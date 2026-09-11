# A4Editor manual coordination dispatch

Coordinator: CORE
Shared checkout: `C:\Users\Scofieldkoh\Documents\oakcloud`
Integration branch (remote preparation): `codex/a4-editor-core-c1`
Starting baseline: `bfdc4f95594b73ce4d20bff45f320bdb53837c37`
Contract: **v1 frozen at G0**; see `coordination/g0.md`
G0 integration base before freeze-record commit: `f5a103c85399a3e20d624140a963e19a79ced55a`
G0 freeze-record commit: `475e54ea4ea4a7218bc0565fb337298c04190afa`
Deployment: not authorized
Stage 1: **DISPATCHED**
Stage-1 common baseline: `bfdc4f95594b73ce4d20bff45f320bdb53837c37`

## Shared resource reservations — Stage 1

These reservations apply to the four released Stage-1 assignments below. They do not authorize Stage 2 or deployment.

- Git branch/index/commits, dependency installation, package/configuration changes and shared generated-output commands: **CORE only** in the shared checkout.
- Shared full build / `.next` output: **CORE only**. Workers may run only their assigned focused checks against isolated output/cache resources.
- Browser/server reservations: CORE port `3420` / `.tmp/a4-c1-core`; SEMANTICS `3421` / `.tmp/a4-s1-semantics`; FIELDS `3422` / `.tmp/a4-f1-fields`; WORKFLOW `3423` / `.tmp/a4-w1-workflow`. Use isolated browser contexts and no shared authenticated fixture.
- Database: CORE/SEMANTICS/FIELDS have no mutation lease. WORKFLOW may use only an explicitly disposable synthetic test database/schema for W1 persistence/concurrency work. No production or existing business data may be mutated.
- Prisma client and checked-in pagination bundle generation are reserved to CORE integration windows. WORKFLOW may author its owned schema/migration/bundle-source changes and record the exact generation commands; CORE executes shared generation after producer integration.
- Existing business records, credentials and document contents are never test fixtures. Use synthetic fixtures only.
- Commands that write shared caches/output or depend on an integrated producer must wait for the relevant integration window rather than racing another active owner.

## CORE-C1-20260911-01

Dispatch ID: `CORE-C1-20260911-01`
Role and packet: CORE / C1 — canonical session, native input and per-document history
State: **DISPATCHED**
Working directory: `C:\Users\Scofieldkoh\Documents\oakcloud`
Baseline commit: `bfdc4f95594b73ce4d20bff45f320bdb53837c37`
Contract version and status: **v1 frozen at G0**; `coordination/g0.md` is authoritative.
Integrated prerequisites and published consumer APIs: C0/S0/F0/W0 and G0 freeze are integrated. Consume C01/C04 from `editor-session.ts`; consume the frozen C02 structural-selection and C04 projection-map contracts from SEMANTICS; preserve C05/C06 field/policy boundaries without implementing F-owned grammar or policy.
Exclusive writable production/test/document paths:
- `src/components/documents/a4-page-editor.tsx`
- `src/components/documents/a4-editor-toolbar.tsx` only where C1 compatibility/integration requires it
- `src/components/documents/a4-pagination/editor-session.ts` (CORE-owned exception)
- CORE-owned new editor session/native-input/history modules under `src/components/documents/`
- `__tests__/components/a4-editor-session.test.ts`
- `__tests__/browser/a4-input-sequences.browser.test.tsx`
- existing CORE-owned A4 page-editor/toolbar/SSR/selection-scroll tests when a C1 regression requires an edit
- `docs/plans/2026-09-10-a4-editor-implementation/coordination/core.md`
- `docs/plans/2026-09-10-a4-editor-implementation/coordination/dispatch.md`
Allowed new files: CORE-owned editor session/native-input/history helpers and narrowly scoped CORE regressions within the ownership above. No S/F/W production module may be created or copied.
Reserved validation resources: Node 24; port `3420`; browser/cache `.tmp/a4-c1-core`; no database mutation. CORE alone may use the shared build/config/generated-output window.
Required acceptance evidence: canonical snapshot before projection completion; Enter -> immediate typing; delete/format -> immediate typing; stale-pointer rejection/mapping without caret substitution; exactly-once input/paste; bounded composition; stale projection publication rejection; untouched later canonical nodes preserved; A -> B -> Undo isolation; controlled-value acknowledgement; relevant existing CORE regressions. Record exact commands and pass/fail counts, and record blocked browser/IME evidence explicitly.
Allowed independent work if a producer is not yet available: implement the complete C1 authority/input/history boundary against frozen S0/F0 contracts and compatibility adapters. Do not reproduce S1 structural algorithms or F1 parser/policy behavior. C2 wiring that requires S1 production commands is not authorized.
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/core.md`
Completion boundary and next dependency: stop at **READY FOR INTEGRATION — C1 only**. Do not begin C2. G1 requires C1 + integrated S1 evidence.

## SEMANTICS-S1-20260911-01

Dispatch ID: `SEMANTICS-S1-20260911-01`
Role and packet: SEMANTICS / S1 — structural positions, commands and versioned break readers/projection
State: **DISPATCHED**
Working directory: `C:\Users\Scofieldkoh\Documents\oakcloud`
Baseline commit: `bfdc4f95594b73ce4d20bff45f320bdb53837c37`
Contract version and status: **v1 frozen at G0**; C02/C03/C04 decisions in `coordination/g0.md` are fixed.
Integrated prerequisites and published consumer APIs: S0 proof and CORE C0 bridge are integrated. CORE remains the sole editor/session revision authority; S position/projection maps copy CORE `sessionKey` and `documentRevision`.
Exclusive writable production/test/document paths:
- SEMANTICS-owned `src/components/documents/a4-pagination/{model.ts,selection.ts,document-actions.ts,formatting.ts,engine.ts,measure.ts,layout.ts,a4-page-layout.ts,a4-page-content-css.ts,a4-font-faces.ts,structural-position.ts,semantic-page-breaks.ts}`
- `src/components/documents/a4-print-styles.ts`
- `src/lib/document-page-breaks.ts`
- SEMANTICS-owned new structural/change-map/projection modules within that domain
- `__tests__/components/a4-pagination/**`
- `__tests__/browser/a4-boundary-semantics.browser.test.tsx`
- `docs/plans/2026-09-10-a4-editor-implementation/coordination/semantics.md`
Allowed new files: S-owned structural position/change-map/command/projection helpers and S regressions only. `editor-session.ts`, `a4-page-editor.tsx`, F parser/policy files and W routes/services are excluded.
Reserved validation resources: Node 24; port `3421`; browser/cache `.tmp/a4-s1-semantics`; no database mutation; no shared build/generated-output commands.
Required acceptance evidence: C02 position validation/comparison/mapping; zero-text/affinity round trips; canonical C03 nested break insertion/removal preserving one logical item; legacy + v2 readers; tree-aware projection; deletion/Enter transaction results; Unicode/grapheme boundary proof; revision-qualified C04 maps with no S revision counter; explicit unsupported table-cell behavior.
Allowed independent work if a producer is not yet available: all S1 pure structural/command/projection implementation against the frozen C01 shape. Do not edit CORE to wire it and do not implement W output routes/bundle generation.
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/semantics.md`
Completion boundary and next dependency: stop at **READY FOR INTEGRATION — S1 only**. No S2. Publish exact producer exports for CORE/W consumers.

## FIELDS-F1-20260911-01

Dispatch ID: `FIELDS-F1-20260911-01`
Role and packet: FIELDS / F1 — one parser, registry, lossless definitions and content-policy contract
State: **DISPATCHED**
Working directory: `C:\Users\Scofieldkoh\Documents\oakcloud`
Baseline commit: `bfdc4f95594b73ce4d20bff45f320bdb53837c37`
Contract version and status: **v1 frozen at G0**; C05/C06 identity/trust decisions are fixed.
Integrated prerequisites and published consumer APIs: F0 grammar/definition/trust proofs are integrated. Consume frozen C01/C02 identities without editing CORE/S owners.
Exclusive writable production/test/document paths:
- `src/components/documents/template-editor/**` except route-level wrappers owned by WORKFLOW
- `src/types/placeholders.ts`
- `src/lib/template-placeholder-storage.ts`
- `src/lib/template-analysis.ts`
- `src/lib/placeholder-resolver.ts`
- `src/lib/document-generation-master-fields.ts`
- `src/lib/template-field-contract.ts`
- `src/lib/a4-content-policy.ts`
- FIELDS-owned new parser/registry/definition/content-policy domain modules
- corresponding F-owned template-editor/lib resolver/storage/parser/policy tests
- `docs/plans/2026-09-10-a4-editor-implementation/coordination/fields.md`
Allowed new files: F-owned HTML-aware parser, field registry/lossless adapters/content-policy modules and regressions. No W route/API/Zod/batch file and no CORE editor file.
Reserved validation resources: Node 24; port `3422`; browser/cache `.tmp/a4-f1-fields`; no database mutation; no shared build/generated-output commands.
Required acceptance evidence: shared parser grammar/source spans/diagnostics; scoped stable identities; lossless round-trip including legacy/unknown metadata; typed value/input descriptors; duplicate-scope handling; unsupported legacy preserve-only behavior; C06 declarative-text/trusted-rich authority separation; policy semantics including the exact C03 break attribute.
Allowed independent work if a producer is not yet available: complete F1 parser/registry/lossless/policy domain work and tests. Route/API preservation wiring remains a WORKFLOW responsibility; do not duplicate it.
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/fields.md`
Completion boundary and next dependency: stop at **READY FOR INTEGRATION — F1 only**. No F2/F3 and no changed production escaping writer activation.

## WORKFLOW-W1-20260911-01

Dispatch ID: `WORKFLOW-W1-20260911-01`
Role and packet: WORKFLOW / W1 — reader expansion, output fail-safe and persistence revision plumbing
State: **DISPATCHED**
Working directory: `C:\Users\Scofieldkoh\Documents\oakcloud`
Baseline commit: `bfdc4f95594b73ce4d20bff45f320bdb53837c37`
Contract version and status: **v1 frozen at G0**; C07/C09/C10 and reader-before-writer ordering are fixed.
Integrated prerequisites and published consumer APIs: W0 writer/reader/capability/revision inventory is integrated. C01 is frozen; S1/F1 producer implementations are not yet integrated at dispatch time.
Exclusive writable production/test/document paths:
- template/partial and generated-document route pages owned by WORKFLOW
- `src/components/documents/generation-batch/**`
- document template/partial/generator/export services and document-generation-batch services
- related document APIs and validation schemas
- `prisma/schema.prisma` and W-owned forward migrations
- server font adapter
- pagination bundle build script and generated pagination bundle (generation itself waits for CORE integration window)
- W-owned persistence/route/batch/output tests
- W-owned capability module/page-bootstrap route introduced by the frozen W0 design
- `docs/plans/2026-09-10-a4-editor-implementation/coordination/workflow.md`
Allowed new files: W-owned capability/readers/revision migration/API/service/output files and tests inside the scopes above. Do not create a competing S break parser/change map or F field parser/content policy.
Reserved validation resources: Node 24; port `3423`; browser/cache `.tmp/a4-w1-workflow`; explicitly disposable synthetic database/schema only for persistence/concurrency/migration proof. Shared Prisma/bundle generation is reserved to a CORE integration window.
Required acceptance evidence: additive `expectedRevision` plumbing and GeneratedDocument revision migration; atomic scoped conflict behavior; reader/capability fallback; explicit non-clipping export failure; font/resource cleanup; writer inventory participation; old-client/read compatibility. After S1/F1 integration, add the required legacy/v2 break reader and C06 policy adapters and regenerate/check the pagination bundle through the coordinated integration window.
Allowed independent work if a producer is not yet available: **W1 may immediately implement its independent revision, export-failure, font/resource and capability work. It must not recreate S1 or F1 functionality. S1/F1-dependent break-reader, parser/policy and sanitizer integration must wait until those producer exports have been reviewed and integrated.**
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/workflow.md`
Completion boundary and next dependency: W1 may hand off an independent producer-complete subset while S1/F1 are pending, then finish only after CORE integrates the required exports. Stop at **READY FOR INTEGRATION — W1 only**. No W2.

## Shared resource reservations — Wave 0

Wave 0 is complete and integrated. Historical reservations below remain the record of the completed assignments; they do not authorize Stage 1 work.

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
State: **INTEGRATED**
Working directory: `C:\Users\Scofieldkoh\Documents\oakcloud`
Baseline commit: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Merged PR: #30
Merge commit: `80056fb7ab6e410ef2d2ddc17a830b068d263671`
Contract version and status: v1 frozen at G0
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/core.md`
Completion boundary: C0 integrated; no C1 dispatch in this record.

## SEMANTICS-S0-20260911-01

Dispatch ID: SEMANTICS-S0-20260911-01
Role and packet: SEMANTICS / S0 — structural positions and nested break representation proof
State: **INTEGRATED**
Baseline commit: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Merged PR: #34
Merge commit: `f0238a954e7124819459266e19523419071d462a`
Contract version and status: v1 frozen at G0
Published interfaces: C02/C03/C04 structural positions, transaction result, nested break codec and revision-associated projection mapping.
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/semantics.md`
Completion boundary: S0 integrated; S1 remains undispatched historically.

## FIELDS-F0-20260911-01

Dispatch ID: FIELDS-F0-20260911-01
Role and packet: FIELDS / F0 — grammar, legacy and trust-boundary inventory
State: **INTEGRATED**
Baseline commit: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Merged PR: #32
Merge commit: `63028fe2f3479d469b7499e314aa0c1bbbbd63d9`
Contract version and status: v1 frozen at G0
Published interfaces: C05 scoped identity/lossless definitions/grammar and C06 content/trust policy.
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/fields.md`
Completion boundary: F0 integrated; F1 remains undispatched historically.

## WORKFLOW-W0-20260911-01

Dispatch ID: WORKFLOW-W0-20260911-01
Role and packet: WORKFLOW / W0 — writer, reader and deployment inventory
State: **INTEGRATED**
Baseline commit: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Merged PR: #33
Merge commit: `f5a103c85399a3e20d624140a963e19a79ced55a`
Contract version and status: v1 frozen at G0
Published interfaces/design: C07 `expectedRevision` mapping, GeneratedDocument dedicated revision design, C08 save/draft/preview semantics, C09 output compatibility, and C10 capability negotiation design.
Handoff path: `docs/plans/2026-09-10-a4-editor-implementation/coordination/workflow.md`
Completion boundary: W0 integrated; W1 remains undispatched historically.

## G0 contract freeze

G0 passed after CORE review of the actual merged C0/S0/F0/W0 evidence. The authoritative freeze record is:

`docs/plans/2026-09-10-a4-editor-implementation/coordination/g0.md`

Frozen high-level decisions include:

- CORE owns the only local editor revision authority and canonical session snapshot.
- SEMANTICS structural positions use text/children positions plus before/after affinity.
- Canonical nested page break is `<span data-a4-break="page"></span>`; legacy top-level hard breaks remain readable.
- Projection maps copy CORE `sessionKey`/`documentRevision`; they do not create another revision authority.
- Field identity is stable and owner-scoped; lossless definitions preserve legacy/unknown metadata.
- Client/stored field metadata cannot grant trusted-rich authority.
- Public persistence precondition is `expectedRevision`; Template/Partial map to existing `version`, GeneratedDocument gets a dedicated future `revision` while `templateVersion` remains provenance.
- Capability negotiation uses reader format level, allowed writer format level and revision-precondition mode, with conservative legacy fallback.
- No production v2 writer, strict revision enforcement, changed escaping behavior, migration, deployment or Stage 1 implementation was enabled by G0.

## Validation carried forward

Final Wave-0 PR heads passed the repository's Node-24 compatibility workflow. Worker environments did not execute every focused packet-specific Vitest command or actual Puppeteer PDF-byte/page-image validation. Those checks remain explicit later integration/output evidence and must not be claimed as passes merely because G0 is frozen.

## Integration freeze

**Wave 0 is complete. G0 PASSED. Stage 1 is dispatched from `bfdc4f95594b73ce4d20bff45f320bdb53837c37`.**
