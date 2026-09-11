# FIELDS handoff log

## FIELDS-F0-20260911-01 — READY FOR INTEGRATION

**Role:** FIELDS  
**Packet:** F0 — grammar, legacy and trust-boundary inventory  
**Assigned baseline:** `63aa75b6170766a3e3d1728feb5e5417f5632f20`  
**Branch base used for PR:** `80056fb7ab6e410ef2d2ddc17a830b068d263671` (CORE C0 already merged; its changed files were checked and do not overlap FIELDS production/test ownership)  
**Contract consumed:** proposed contracts v1; G0 remains open.  
**Resulting implementation commit:** `7da9853d19b5861906fd79d0eb054b16328bd03c`

FIELDS has completed only the released F0 assignment. No F1/F2/F3 behavior, new parser wiring, escaping policy, protected-token writer, route/API behavior, persistence change, or deployment capability has been enabled.

### Files changed by F0

- `src/lib/template-field-contract.ts` — executable C05 contract proof: stable scoped identity, lossless definition shape, typed value distinctions, input descriptor, parser/diagnostic/lifecycle interfaces, and an isolated grammar probe.
- `src/lib/a4-content-policy.ts` — C06 policy definition only: canonical semantics, editor-only decoration attributes, structural attributes, legacy preserve-only content, and text/trusted-rich boundaries. It is intentionally not connected to DOMPurify or resolution in F0.
- `__tests__/lib/template-field-contract.test.ts` — passing contract fixtures for supported/malformed grammar, stable scope identity and typed-value distinctions.
- `__tests__/lib/template-field-f0-compatibility.test.ts` — deliberate `it.fails` baseline proofs for current compatibility defects; these freeze the gaps without activating later behavior.
- `__tests__/lib/a4-content-policy.test.ts` — passing policy-contract coverage.
- This handoff file.

No other owner's production, route, service, API validation, Prisma, package/configuration or generated-output file was modified.

### F0 grammar inventory and proposed normalization

| Fixture | Current behavior observed from source/baseline | C05 F0 contract |
| --- | --- | --- |
| `{{custom.note}}` | validator/resolver recognize | supported simple reference |
| `{{ custom.note }}` | editor validation trims/accepts; resolver leaves literal | normalize whitespace to `{{custom.note}}` through one parser |
| `{{PCASE(company.name)}}` | resolver supports | supported modifier |
| `PCASE({{company.name}})` | resolver supports, including editor-added inline wrappers | supported external modifier; parser owns expression meaning before rendering |
| `{{DESIGNATION({{selectedDirector.role}})}}` | resolver has special normalization | supported legacy nested modifier syntax |
| `{{#each directors}}…{{/each}}` | resolver supports | supported block |
| `{{#if path …}}`, `{{#unless path}}`, `{{#with path}}` | resolver supports more than editor validator | supported blocks; one grammar must cover all four |
| `{{> partial-name}}` / encoded `>` form | resolver/analysis support | supported partial; hyphenated names retained |
| `{{@index}}`, `{{@number}}`, `{{@first}}`, `{{@last}}` | resolver supports in loops | supported loop variables |
| `data-template-each` | resolver expands canonical builder form | supported structural/service-builder construct; retained by C06 |
| `{{custom.<b>note</b>}}` | validator silently skips; resolver leaves literal | `formatted-expression` diagnostic; original source retained |
| dangling braces | analysis only counts some mismatch forms | explicit `dangling-expression` diagnostic |
| invalid/unknown key | grammar and availability are currently conflated | parser emits syntax node first; registry binding emits scoped unknown-field diagnostic |
| nested/missing/circular partials | analysis has dependency checks; merge only discovers direct definitions | preserve dependency diagnostics; nested definition discovery required in F1/F2 |

The isolated `parseFieldExpressionContract` helper is proof code only. F1 must implement the full HTML-aware parser with source spans and registry binding after CORE freezes G0; production regex entry points remain untouched in this packet.

### Definition/type/API compatibility inventory

1. `src/lib/template-placeholder-storage.ts` currently converts unsupported stored types to editor `text`. Therefore stored `list` and `conditional` definitions can be rewritten as `text` on a no-change editor round-trip even though the document-template API schema accepts those legacy types.
2. The same storage adapter generates a fresh `crypto.randomUUID()` every time definitions are loaded. Runtime identity therefore is not stable across reopen/reload.
3. Missing `required` defaults disagree: the storage/editor adapter uses `true`; the template-analysis adapter uses `false`.
4. `template-analysis.ts` has a second definition adapter and does not preserve the same complete unknown metadata contract as `template-placeholder-storage.ts`.
5. The document-template Zod `placeholderDefinitionSchema` currently enumerates `list`/`conditional`, but has no stable `id` or `options` field and uses a normal `z.object`, so unlisted forward-compatible definition keys are stripped at that API boundary. FIELDS did not edit this W/integration-owned validation file.
6. C05 F0 therefore proposes a lossless internal definition carrying `storedType`, nullable `supportedType`, owner scope, resolver path, explicit-vs-defaulted required state, persisted ID where present, render mode and the complete original object. Unsupported types remain preserve-only until intentional conversion.
7. Typed values distinguish missing, empty, boolean `false`, exact numeric/currency strings, ISO date values and legacy structured values. Appearance does not coerce text: an ISO-looking text string remains text; string `"false"` is not automatically boolean `false`.

### Scoped identity and partial collision proof

Current `mergeTemplateAndPartialPlaceholders` resolves a parent/partial collision by exposing the partial field as `${partialName}_${baseKey}` while the partial content still references `{{custom.<baseKey>}}`. This changes the input key without rebinding the reference and can select the wrong value. It also walks definitions of directly referenced partials only, so nested-partial field discovery is incomplete.

F0 proposes structured identity as `(owner kind, owner stable ID, persisted field ID when available else scoped stored key)`. Display names and underscore concatenation never define identity. A parent and two partials may therefore each declare `custom.note` and remain distinct; repeated use of the same partial shares that partial's declared identity unless an explicit existing linking says otherwise. Resolver/value binding for this design belongs to F2 + W integration, not F0.

### Text versus trusted-rich inventory / C06

Source inspection confirms ordinary values flow through `formatResolvedValue` as raw strings; only letter-address paths currently escape HTML and deliberately convert newlines to `<br>`. Thus benign `A & B <em>literal</em>` can become document markup for an ordinary text field. Partial expansion, canonical builders and service-composition structures are intentional rich producers and cannot be fixed by escaping the entire template.

The F0 C06 policy data therefore separates:

- ordinary text: escape at interpolation boundary;
- trusted rich: canonical partial/builder/service-composition origins, then sanitize through the shared policy;
- legacy rich: only an inventoried explicit compatibility binding may retain rich meaning;
- unknown legacy rich: preserve the source and block destructive conversion rather than silently changing it.

No escaping behavior changes in F0. Activation remains behind the D2/G3 compatibility gate.

### Sanitizer compatibility inventory

The baseline editor sanitizer preserves `blockquote`, `caption`, `tfoot`, `scope` and `ol[start]` but does not allow legacy `img`, `sup`, `sub` or section `id`. The export sanitizer does the reverse for several of these: it allows `img`/`sup`/`sub`/`id` while dropping `blockquote`/`caption`/`tfoot`/`scope`/`start`. C06 now records one proposed semantic set for G0 review, while keeping runtime `data-flow-*` attributes explicitly non-canonical.

`data-a4-break` is included only as the SEMANTICS-owned C03 structural attribute. FIELDS does not define a second break format.

### Field UI contracts exported for later consumers

`FieldInputDescriptor` provides W with stable identity/scope, business label, description/source, stored type, control kind, required/default semantics and an explicit disabled reason for preserve-only legacy types. This supports date, multiline, boolean and exact numeric/currency forms without forcing FIELDS to edit W-owned batch/route components.

Parser nodes carry source spans and occurrence identity so CORE can later decorate a complete field atomically and navigate diagnostics. Token markup remains view-only and cannot become trusted identity when pasted. `FieldLifecycleSnapshot` / `FieldLifecycleIntent` / `FieldLifecycleResult` define the atomic create/relabel/key-migrate/change/delete boundary for later F2; CORE history and W persistence must consume the complete snapshot rather than independent setters.

### Exact integration requests

**CORE / G0**

- Freeze how parser source spans/occurrences map to C02 structural positions and C01 complete snapshot/history.
- When protected-token integration is later dispatched, decoration must serialize the original expression exactly; pasted token attributes are not identity/trust authority.
- Field definition/layout/content lifecycle must be one history transaction once F2 is integrated.

**WORKFLOW / G0 and later F1 integration**

- Add service/API regression coverage proving stable field IDs, `options`, legacy types and unknown definition metadata survive document-template and partial validation/persistence. The current document-template Zod object strips unlisted keys; do not enable persisted IDs until this boundary is made explicitly lossless/validated.
- Demonstrate parent + two partials with colliding `custom.note` values and a nested partial through the canonical tenant-scoped render path; FIELDS local merge fixtures alone do not close A4E-017.
- Inventory any intentional HTML-valued custom/service fields before enabling escaped ordinary-text semantics. Unknown cases remain a compatibility blocker.
- Consume `FieldInputDescriptor` instead of inventing route-specific type coercion. Keep current effective-value precedence while replacing flattened collision aliases with explicit scoped bindings after contract freeze.

**SEMANTICS**

- Confirm C03's final structural break attribute/shape for the shared C06 policy. FIELDS will consume it and will not create a competing break codec.

### A4E coverage from F0

- **A4E-013:** grammar divergence and formatted/split expression gaps frozen as executable baseline failures; exact shared-parser contract proposed.
- **A4E-014:** raw ordinary-text interpolation inventoried; text/trusted-rich policy proposed but not activated.
- **A4E-015:** unstable identity/path/lifecycle boundaries inventoried; stable scoped identity and atomic lifecycle interface proposed only.
- **A4E-016:** typed input/value descriptor contract defined; no UI behavior changed in F0.
- **A4E-017:** legacy type/default disagreement, partial collision aliasing and nested discovery gaps frozen as compatibility failures.
- **A4E-018:** editor/export schema mismatch inventoried; C06 policy definition proposed only.
- **A4E-023/027/030:** parser occurrence/UI descriptors establish later integration contracts; no paste/preview/catalog behavior advanced beyond F0.

### Validation and limitations

- Source/diff ownership review: completed against assigned baseline and current CORE-merged main; no overlap with another role's production/test ownership.
- Focused executable fixtures were added. Known defects are marked `it.fails` intentionally so they remain visible while F0 stays read-compatible and behavior-neutral.
- Local Node/Vitest execution could not be performed in this session because the isolated runtime could not resolve `github.com` when cloning the private repository (`Could not resolve host: github.com`). No local test pass is claimed.
- Browser QA was not run because F0 makes no rendered frontend behavior change. The required frontend-testing guidance was read; Browser plugin is absent in this session.
- GitHub Actions status must be taken from the PR/head commit if the repository has a matching workflow. A missing/pending workflow is not counted as a pass.

### Compatibility / rollout implications

This packet is intentionally read/behavior neutral: it adds proof contracts and fixtures only. It performs no migration, bulk rewrite, API enforcement, new field serialization, sanitization change, generation change or deployment. Existing generated documents remain snapshots. D2/G3 field behavior stays disabled until F1/F2/F3 plus W/CORE integration evidence passes.

### Known risks and remaining dependencies

- The C05/C06 names and exact signatures remain proposed until CORE's G0 decision.
- The API-schema lossiness around stable IDs/options/unknown keys blocks persistence of new definition metadata.
- Rich-valued legacy fields must be inventoried before ordinary-text escaping can be activated.
- Scoped resolution cannot be declared complete until canonical generation proves parent/nested-partial collision behavior.
- Final content policy must consume SEMANTICS' frozen C03 break contract and W/CORE environment adapters.

**FIELDS state:** `READY FOR INTEGRATION — F0 only`. Do not dispatch or begin F1 from this handoff alone. Wait for CORE to freeze/publish G0 and a new FIELDS assignment in `coordination/dispatch.md`.
