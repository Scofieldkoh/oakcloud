# Architecture

> **Last Updated**: 2026-07-27
> **Audience**: Developers

System architecture and runtime design overview for Oakcloud.

## Related Documents

- [Getting Started](./GETTING_STARTED.md) - Local setup and first run
- [Database Schema](./reference/DATABASE_SCHEMA.md) - Tables, relationships, and enums
- [Service Patterns](./guides/SERVICE_PATTERNS.md) - Backend implementation patterns

## Overview

Oakcloud is a multi-tenant Next.js application for accounting practice operations. It combines internal dashboards, authenticated API routes, public document and form flows, and an in-process task scheduler.

Core design principles:

- **Tenant isolation** across the app, API, and database
- **Service-oriented business logic** under `src/services/`
- **Public and internal workflows** in the same codebase, with explicit auth and rate-limit boundaries
- **Local-first infrastructure** for development with PostgreSQL and MinIO

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| Next.js 15 App Router | Routing, server rendering, API routes |
| React 19 | UI layer |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| Chakra UI | Shared component primitives |
| TanStack Query | Server-state fetching and invalidation |
| Zustand | Lightweight local app state |
| React Hook Form + Zod | Form state and validation |

### Backend

| Technology | Purpose |
|------------|---------|
| Node.js 20 | Runtime |
| Prisma 7 | Database access |
| PostgreSQL 16 | Primary relational database |
| `jose` | JWT-based auth/session tokens |
| `@noble/hashes` | Password hashing and crypto helpers |
| Nodemailer / Graph | Email delivery |
| OpenAI / Anthropic / Google AI / OpenRouter | AI-backed features |

### Documents And Forms

| Technology | Purpose |
|------------|---------|
| TipTap | Rich text editing |
| pdf-lib | Existing document export paths |
| Puppeteer | Form response PDF rendering |
| GoBusiness eAdviser API | Company name availability checks for the form "Company name check" element |
| Microsoft Graph | Word-to-PDF conversion for e-signing uploads through usable SharePoint/OneDrive connectors; uploads remain PDF-only when no valid connector is configured |
| MinIO / S3 | Uploaded file storage |

### Runtime Services

| Service | Purpose |
|---------|---------|
| In-process scheduler | Backup, cleanup, exchange-rate sync, form AI review, form count reconciliation, E-signing preparation |
| In-memory rate limiter | Public endpoint throttling |
| In-memory view counter buffer | Batches form view count writes every 30 seconds |

## High-Level Layout

```text
src/
|-- app/
|   |-- (dashboard)/           # Authenticated UI routes
|   |   |-- forms/             # Forms list, builder, responses, draft detail
|   |   |-- tasks/             # Tenant task workspace
|   |   |-- pipelines/         # Versioned pipeline list and builder
|   |-- api/                   # Authenticated and public API routes
|   |   |-- forms/             # Forms admin + public endpoints
|   |   |-- tasks/             # Task, status, stage, and transition endpoints
|   |   |-- task-pipelines/    # Pipeline CRUD, versioning, duplicate, archive
|   |-- forms/f/[slug]/        # Public form runtime
|-- components/
|   |-- forms/                 # Builder and form-specific UI pieces
|   |-- tasks/                 # Task list/cards, stage modal, pipeline builder
|   |-- ui/                    # Reusable shared components
|-- hooks/                     # Query and auth hooks
|-- lib/
|   |-- auth.ts                # Session and JWT helpers
|   |-- form-utils.ts          # Shared forms types, settings, helpers
|   |-- rate-limit.ts          # Public endpoint throttling
|   |-- scheduler/             # Background task framework
|   |-- storage/               # Object storage abstraction
|   |-- validations/           # Zod schemas
|-- services/
|   |-- tasks/                 # Pipeline, task, stage, registry, integrations
|   |-- form-crud.service.ts
|   |-- form-submission.service.ts
|   |-- form-draft.service.ts
|   |-- form-pdf.service.ts
|   |-- form-ai.task.service.ts
|   |-- ...other domain services
```

## Multi-Tenancy And Permissions

- Tenant-scoped entities are keyed by `tenantId`.
- `SUPER_ADMIN` users can switch tenants in the UI and pass `tenantId` to admin endpoints where supported.
- Forms currently reuse the existing `document:*` permission surface for CRUD, response review, exports, and AI review actions.
- Public form endpoints do not require auth, but are protected with slug scoping, token checks for PDF delivery, and IP-based rate limits.

## Request Flow

### Authenticated Dashboard Flow

1. A dashboard page or hook calls an authenticated API route under `src/app/api/`.
2. The route calls `requireAuth()` and, where applicable, `requirePermission()`.
3. The route resolves tenant scope via `resolveTenantId(...)`.
4. The route delegates business logic to `src/services/...`.
5. Services read and write through Prisma and, when needed, storage/email/AI helpers.

### Public Form Flow

1. The public page loads at `/forms/f/[slug]`.
2. It fetches `/api/forms/public/[slug]` to load the published form definition.
3. Uploads are sent to `/api/forms/public/[slug]/uploads`.
4. Draft saves and resumes go through `/api/forms/public/[slug]/drafts...`.
5. Submission goes through `/api/forms/public/[slug]/submit`.
6. The success state may expose token-guarded PDF download and email actions.

## Forms Module Architecture

The Forms module is split into focused services:

- `form-crud.service.ts`: form creation, listing, duplication, updates, soft delete, and field persistence
- `form-submission.service.ts`: public definition loading, public uploads, submissions, response listing/detail, CSV export, attachment download/delete
- `form-draft.service.ts`: save/resume/email draft flows and draft cleanup
- `form-pdf.service.ts`: HTML rendering, PDF generation, and filename templating
- `form-ai.task.service.ts`: queued AI review processing, warning resolution, and warning summaries

### Forms Routes

Authenticated dashboard routes:

- `/forms`
- `/forms/[id]/builder`
- `/forms/[id]/responses`
- `/forms/[id]/responses/[submissionId]`
- `/forms/[id]/responses/drafts/[draftId]`

Public runtime route:

- `/forms/f/[slug]`

### Form Settings Model

Most builder configuration beyond title, slug, tags, and status lives in `Form.settings`:

- Response table configuration (`summaryFieldKeys`, column order, widths)
- Completion notification recipients
- Draft enablement and retention window
- Internal AI review settings and custom context
- Response PDF filename template
- I18n defaults, enabled locales, and translations
- Branding toggles such as `hideLogo` and `hideFooter`; per-form background images (`backgroundImageUrl` + `backgroundImageOpacity`) uploaded through `POST /api/forms/[id]/background` and served via `/api/storage/[...key]`

### Public Form Security And Delivery

- `FORM_VIEW`, `FORM_SUBMIT`, `FORM_UPLOAD`, `FORM_DRAFT_SAVE`, and `FORM_DRAFT_RESUME` rate limits are enforced in memory per IP and slug.
- Public draft resumption requires both a draft code and an access token.
- Public PDF delivery uses signed tokens with separate scopes for direct download and email-request authorization.
- Uploaded files are stored under `{tenantId}/forms/{formId}/uploads/{uploadId}{ext}`.

### Background Processing

The scheduler registers these form-related tasks:

- `form-ai-review`: processes queued submission AI reviews
- `form-count-reconciliation`: corrects denormalized `submissions_count`
- `cleanup`: also removes expired form drafts and orphaned uploads

Form view counts are buffered in-process and flushed to the database every 30 seconds to reduce write contention on public forms.

## Storage Architecture

Oakcloud uses the shared storage abstraction for documents and forms.

Examples:

```text
{tenantId}/companies/{companyId}/documents/{docId}/...
{tenantId}/forms/{formId}/uploads/{uploadId}.{ext}
```

MinIO is used in local development; S3-compatible providers can be used in production.

## A4 Document Editor Pagination

The A4 editor stores one canonical HTML document and derives physical pages at runtime. Soft page boundaries are never persisted; explicit hard boundaries use `<div class="page-break" data-break-type="hard"></div>`. Legacy `<!-- PAGE_BREAK -->` comments are treated as soft layout hints and removed when content is normalized.

Pagination runs as one animation-frame transaction over hard-break-delimited sections. The engine reassembles continuation fragments, measures them against the active A4 content box, repacks content forward and backward, commits the full page set atomically, and restores selection through stable flow IDs. Paragraphs and list items may continue across pages, tables split between body rows, and oversized atomic blocks are rendered once instead of being requeued.

The editor renders a single canonical `contenteditable` root. Physical A4 page wrappers are derived children of that root, while page chrome remains non-editable. Native browser selection can therefore span any number of physical pages. Content commands capture a logical selection, update canonical HTML once, increment the reflow generation, schedule one measurement frame, atomically commit only the newest generation, and restore the logical selection. Native browser block splits receive distinct flow IDs before reassembly so an Enter-created paragraph is not mistaken for a continuation fragment. Automatic reflow never creates a history entry or emits a content change.

Document layout is versioned under `contentJson.layout`. The normalized model owns the global font family, base font size, line height, paragraph spacing, and independent top, right, bottom, and left margins. Missing or invalid metadata falls back to the default A4 layout, and saves merge layout without discarding unrelated JSON keys. Template editing, generated-document editing, read-only preview, print CSS, and PDF export all extract and normalize this same metadata; newly generated documents inherit the template JSON unless the generation workflow supplies an explicit edited JSON value. Resolved partials inherit their parent document's layout, while inline font family, font size, and line-height styles remain authoritative over the global typography defaults.

Preview, read-only, print, and PDF paths share the same hard-versus-soft break contract. The deterministic engine is covered by DOM-independent measurement tests, while Chromium browser tests verify physical overflow, pullback, table integrity, and caret restoration using real layout.

Template test previews use the same placeholder resolver as document generation. When structured company address fields are present but `company.address.letter` is absent, the resolver derives the letter-format value through the shared address formatter before resolving placeholders.

Document-generation work can be paused as explicit, server-backed sessions. Each save creates or updates a `GeneratedDocument` in `DRAFT` status with versioned `metadata.generationSession` state. Opening `/generated-documents/generate` starts clean; only `/generated-documents/generate?draft=<id>` resumes a selected session. Successful generation converts that same record into a normal generated draft, while discard follows the existing soft-delete lifecycle.

Editable experiences can use the shared `useUnsavedNavigationGuard` hook for native `beforeunload`, same-origin link, and browser-back protection. Its default copy is page-neutral, and document generation, forms, e-signing, or other editors can supply experience-specific dialog text.

## Service Catalog And Agreement Template Foundation

The service catalog is tenant-scoped and managed under the Services tab of
`/template-partials`. `ServiceFamily` groups ordered `ServiceVariant` records.
Each variant links to one active, same-tenant `TemplatePartial` containing its
statement-of-work wording and owns ordered, entity-agnostic
`ServiceVariantFeeTemplate` defaults. Catalog reads and writes use
`document:read/create/update/delete`; every service query includes `tenantId`
and `deletedAt: null` at the family, variant, fee-template, and linked-partial
boundaries. Archives are soft deletes. A family cannot be archived until its
variants have been archived, and a partial cannot be deleted while a
same-tenant, non-deleted variant references it.

`DocumentTemplate.compositionType` distinguishes normal templates from
Service Agreement composition templates:

- `STANDARD` preserves the existing template-generation behavior.
- `SERVICE_AGREEMENT` requires exactly one
  `{{@agreement.serviceSections}}`, `{{@agreement.feeTable}}`, and
  `{{@agreement.entityAppendix}}` slot. These reserved tokens are insertable
  editor blocks, not editable custom placeholder definitions. The editor blocks
  invalid saves, and document-template service writes validate the merged
  persisted composition on create, update, and duplication.

Service-specific input definitions use the `service` placeholder source, for
example `service.fields.software`, and may use the `textarea` type. The editor
keeps these separate from custom fields and preserves source, path, category,
type, and forward-compatible metadata on save. Stage 2
resolves those paths for a selected service and copies catalog fee defaults
into entity-specific agreement fee rows before rendering the reserved slots.

Material versioning provides the Stage 2 snapshot boundary.
`TemplatePartial.version` increments only when normalized `content` or
serialized `placeholders` changes. `ServiceVariant.version` increments once
per update when its name, linked partial, cadence/custom cadence label, or fee
template set changes. Labels, descriptions, display order, and active-state
maintenance do not independently create new material versions.

### Service Agreement generation

A Service Agreement generation draft has one tenant-scoped
`ServiceAgreement` record linked one-to-one to its `GeneratedDocument`.
Agreement entities, service items, item/entity assignments, and fee lines are
normalized relational data. This structured draft is the authority used by
the later Client Services activation workflow.

Generation session metadata is versioned. Version 1 sessions remain readable
and are normalized to the three-stage version 2 model in memory; the next save
writes version 2. A version 2 Service Agreement session also returns its
relational agreement DTO. The document-session write and agreement upsert use
one interactive transaction.

For `SERVICE_AGREEMENT` templates, server rendering first replaces the three
reserved agreement slots. Each pinned SOW snapshot is resolved in an isolated
`service` context, followed by the entity-specific fee table and Appendix 3.
Normal master-template partial expansion and placeholder resolution run only
after that deterministic assembly. Saved wording never refreshes implicitly;
the explicit refresh endpoint replaces snapshot/version fields only.

The generated HTML remains editable. Its metadata records the agreement ID, a
canonical structured-data hash, and whether the user-edited HTML diverged from
the server render. HTML edits never reverse-sync to the relational agreement,
and later operational Services must consume the structured rows rather than
parse document content.

### Signed agreement activation and operational Services

Signing activates the relational agreement data, never the rendered HTML. One
`ClientService` is created for every unique agreement-item/company pairing and
owns copies of only that entity's fee rows. Identity, cadence, dates, and field
values are operational and remain fully editable; pinned SOW wording and signed
document content remain immutable and are not exposed as Client Service fields.

Envelope completion queues activation without depending on the post-commit
worker. The scheduler claims pending or retryable agreements with
`FOR UPDATE SKIP LOCKED`, a unique claim token, a five-minute lease, partial
queue indexes, and 1/5/15/60 minute backoff. Compare-and-set transitions keep
stale workers, retries, and repeated manual requests from overwriting newer
state. The task inherits the master scheduler switch and polls every minute.
Five failed attempts become `FAILED_PERMANENT`; an authorized retry resets the
agreement to `PENDING`. External agreements use Mark effective, which records
the actor, signed/effective dates, and audit reason. Automatic activation uses
the system change source; manual activation preserves its actor.
Automatic activation preserves an existing effective date or derives the
Singapore calendar date from envelope completion. It never uses delayed worker
execution time. Client Service edits use `updatedAt` optimistic preconditions;
domain writes and their audit entries commit or roll back together.

Backup export, restore, and tenant cleanup explicitly include every catalog,
agreement, and Client Service table. Restore orders parents before fee children;
cleanup reverses those dependencies.

## Tasks And Pipelines Architecture

`/pipelines` manages tenant-scoped templates and `/tasks` runs work from them. Creating or editing a pipeline publishes a new immutable pipeline version. Creating a task copies that version's ordered stage definitions and checklist items into a locked live-task snapshot. Later template edits therefore affect future tasks only; an existing task never changes its stage structure or pipeline version.

The `src/services/tasks/` stage-action registry owns action configuration parsing, blockers, launch context, outcome summaries, and derived stage status:

| Adapter | Curated default icon | Authoritative module | Completion rule |
|---------|----------------------|----------------------|-----------------|
| `MANUAL` | `CircleCheckBig` | Tasks | Explicit manual completion |
| `COMPANY_PROFILE` | `Building2` | Company | A tenant-owned Company is linked |
| `DOCUMENT_GENERATION` | `FileText` | Document Generation | The linked `GeneratedDocument` is `FINALIZED` |
| `ESIGNING` | `PenLine` | E-signing | All required signatures are complete |

Tasks retain only links and immutable stage snapshots. Company, Generated Document, and E-signing Envelope records remain authoritative in their own modules. Optional `TaskLaunchContext` (`taskId`, `taskStageId`, `returnTo`) follows the user into those workspaces; creation/status callbacks link or reconcile the stage outcome. Detail reads also reconcile so missed callbacks self-heal. Declined, expired, voided, or cancelled envelopes derive a failed stage.

E-signing task stages use a durable preparation record rather than creating an envelope during navigation. Preparation selects the nearest preceding Document Generation stage and becomes eligible only after its generated document is finalized and every intervening stage, such as Review, is `COMPLETED` or `SKIPPED`. The worker creates or reuses one draft envelope, links it to the E-signing stage, and attaches one managed PDF without adding recipients, fields, or sending the envelope. Opening the task stage ensures legacy preparation state, polls `QUEUED` or `PROCESSING` work, and opens the prepared envelope when it reaches `READY`.

Unfinalizing the generated document queues removal of only its managed envelope document; document-bound fields cascade away while recipients, manual documents, and envelope settings remain. Refinalizing queues a fresh PDF attachment to the same draft. Unfinalization is rejected after the related envelope leaves `DRAFT` unless it has been voided.

Preparation jobs are claimed in bounded batches with PostgreSQL `FOR UPDATE SKIP LOCKED`, so one worker can process unrelated tenants and pipelines concurrently and multiple application instances claim disjoint jobs. Claim leases recover abandoned `PROCESSING` work. Lifecycle callbacks request immediate processing after authoritative mutations commit, while the one-minute scheduler is the durable fallback. States are `WAITING`, `QUEUED`, `PROCESSING`, `READY`, `FAILED_RETRYABLE`, and `FAILED_PERMANENT`.

Task status is derived from all live stages as `NOT_STARTED`, `IN_PROGRESS`, or `COMPLETED`: every required stage must be completed, and every optional stage must be completed or explicitly skipped. `PAUSED` and `CANCELLED` are explicit task overrides. Optional stages may be skipped with a reason; required stages cannot be skipped. A skipped integrated stage remains a durable user override until it is reopened. Stage status includes `NOT_STARTED`, `IN_PROGRESS`, `WAITING`, `COMPLETED`, `SKIPPED`, and `FAILED`. The UI assigns fixed semantic surfaces and non-colour markers; pipelines store curated Lucide icon names but no user-defined colours.

The default tenant-aware seed publishes Client Onboarding v1 with three required stages: Company Profile, Generate Contract, and E-signing. Deterministic IDs and a transaction make the seed repeatable without creating extra versions.

### Legacy Module Reset

The 2026-07-24 migration is a complete reset of the retired Workflow/Projects data model: all `workflow_*` tables are dropped and the Task/Pipeline tables are created. There are no compatibility routes, redirects, or data migration. Company, Document Generation, E-signing, Contact, and other non-retired module records are preserved.

## Implemented Modules

| Module | Notes |
|--------|-------|
| Companies | Core company data, BizFile ingestion, compliance metadata |
| Contacts | Individual and corporate contacts |
| Document Generation | Templates, sharing, comments, exports |
| Document Vault | Extraction, revisions, duplicate detection; workspace-managed extraction prompts and quick context buttons |
| Forms | Builder, public forms, drafts, attachments, PDF export, AI review |
| Tasks | Versioned pipeline execution with responsive list and stage modal |
| Pipelines | Tenant-scoped reusable stage templates and immutable published versions |
| Exchange Rates | MAS sync and overrides |
| Chart Of Accounts | Hierarchical accounts and external code mapping |

## Planned Modules

| Module | Notes |
|--------|-------|
| Bank Reconciliation | Transaction matching and review |
| Client Portal | Client-facing access and requests |
| Accounting Integration | Xero, QuickBooks, MYOB |
