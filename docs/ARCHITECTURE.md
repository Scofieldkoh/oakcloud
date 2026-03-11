# Architecture

> **Last Updated**: 2026-03-11
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
| MinIO / S3 | Uploaded file storage |

### Runtime Services

| Service | Purpose |
|---------|---------|
| In-process scheduler | Backup, cleanup, exchange-rate sync, form AI review, form count reconciliation |
| In-memory rate limiter | Public endpoint throttling |
| In-memory view counter buffer | Batches form view count writes every 30 seconds |

## High-Level Layout

```text
src/
|-- app/
|   |-- (dashboard)/           # Authenticated UI routes
|   |   |-- forms/             # Forms list, builder, responses, draft detail
|   |-- api/                   # Authenticated and public API routes
|   |   |-- forms/             # Forms admin + public endpoints
|   |-- forms/f/[slug]/        # Public form runtime
|-- components/
|   |-- forms/                 # Builder and form-specific UI pieces
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
- Branding toggles such as `hideLogo` and `hideFooter`

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

## Implemented Modules

| Module | Notes |
|--------|-------|
| Companies | Core company data, BizFile ingestion, compliance metadata |
| Contacts | Individual and corporate contacts |
| Document Generation | Templates, sharing, comments, exports |
| Document Processing | Extraction, revisions, duplicate detection |
| Forms | Builder, public forms, drafts, attachments, PDF export, AI review |
| Workflow (Preview) | Project and task workspace |
| Exchange Rates | MAS sync and overrides |
| Chart Of Accounts | Hierarchical accounts and external code mapping |

## Planned Modules

| Module | Notes |
|--------|-------|
| Bank Reconciliation | Transaction matching and review |
| Client Portal | Client-facing access and requests |
| Accounting Integration | Xero, QuickBooks, MYOB |
