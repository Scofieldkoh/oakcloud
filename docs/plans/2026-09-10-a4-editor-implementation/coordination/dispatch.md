# A4Editor manual coordination dispatch

Coordinator: CORE
Shared checkout: `C:\Users\Scofieldkoh\Documents\oakcloud`
Integration branch (remote preparation): `main`
Starting baseline: `63aa75b6170766a3e3d1728feb5e5417f5632f20`
Contract: **v1 frozen at G0**; see `coordination/g0.md`
G0 integration base before freeze-record commit: `f5a103c85399a3e20d624140a963e19a79ced55a`
G0 freeze-record commit: `475e54ea4ea4a7218bc0565fb337298c04190afa`
Deployment: not authorized
Stage 1: **NOT DISPATCHED**

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
Completion boundary: S0 integrated; S1 remains undispatched.

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
Completion boundary: F0 integrated; F1 remains undispatched.

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
Completion boundary: W0 integrated; W1 remains undispatched.

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

**Wave 0 is complete. G0 PASSED.**

This file does not dispatch C1, S1, F1 or W1. A fresh Stage-1 dispatch must start from the G0 frozen common base recorded in `coordination/g0.md` and preserve the ownership/contracts frozen there.
