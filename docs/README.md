# Oakcloud - Practice Management System

> **Last Updated**: 2026-03-11

Oakcloud is a modular practice management system for accounting firms. It is local-first, multi-tenant, and now includes a full Forms module for internal builders and public submissions.

## Documentation

Start with [Documentation Index](./INDEX.md) for the current docs map.

### Quick Links

- [Getting Started](./GETTING_STARTED.md) - Local setup and first run
- [Architecture](./ARCHITECTURE.md) - Runtime design, modules, and service layout
- [TODO / Roadmap](./TODO.md) - Known issues and planned work

### Guides

- [RBAC Guideline](./guides/RBAC_GUIDELINE.md) - Roles, permissions, multi-tenancy
- [Design Guideline](./guides/DESIGN_GUIDELINE.md) - UI components and styling
- [Keyboard Shortcuts](./guides/KEYBOARD_SHORTCUTS.md) - Shared shortcut patterns
- [Service Patterns](./guides/SERVICE_PATTERNS.md) - Service-layer conventions
- [Audit Logging](./guides/AUDIT_LOGGING.md) - Activity tracking

### Reference

- [Database Schema](./reference/DATABASE_SCHEMA.md) - Tables, relationships, indexes, enums
- [API Reference](./reference/API_REFERENCE.md) - Authenticated and public API routes
- [Environment Variables](./reference/ENVIRONMENT_VARIABLES.md) - Runtime configuration

### Feature And Rollout Docs

- [AI Helpbot Specification](./features/ai-helpbot/SPECIFICATION.md) - Current feature specification under `docs/features/`
- [Forms Improvements](./plans/2026-03-04-forms-improvements.md) - Main Forms rollout plan
- [Form Submission PDF Redesign](./plans/2026-03-09-form-submission-pdf-redesign.md) - Public and internal response PDF export
- [Resume Draft UI Implementation](./plans/2026-03-09-resume-draft-ui-implementation.md) - Draft save and resume flow
- [Forms Implementation Review](./plans/2026-03-10-forms-implementation-review.md) - Post-implementation review and hardening notes

## Overview

Oakcloud is built around a few core principles:

- **Modular**: Business capabilities are split into focused modules and services
- **Local-first**: Your data stays on your infrastructure
- **Multi-tenant**: Tenant scoping is enforced across app, API, and data layers
- **Operational**: The app includes document workflows, forms, AI-assisted processing, and auditability

## Implemented Modules

| Module | Description |
|--------|-------------|
| Company Management | Companies, BizFile uploads, compliance tracking |
| Contact Management | Individual and corporate contacts |
| Authentication | JWT-based auth with tenant-aware sessions |
| Multi-Tenancy | Tenant isolation with limits and SUPER_ADMIN scoping |
| Audit Logging | Activity tracking with reasons and change sources |
| RBAC And Permissions | Fine-grained access control |
| User Management | Accounts, invitations, assignments |
| Password Management | Reset flow and forced password changes |
| Data Purge | Permanent deletion for SUPER_ADMIN workflows |
| Backup And Restore | Per-tenant backups |
| Email Notifications | Graph API or SMTP delivery |
| Connectors Hub | External service integrations |
| Document Generation | Templates, PDF export, sharing, comments |
| Document Processing | AI-powered ingestion, extraction, revisions |
| Forms | Builder, public links, drafts, uploads, PDF export, response review, AI review |
| Exchange Rates | MAS API integration and manual overrides |
| Chart Of Accounts | Hierarchical accounts and external mapping |
| Workflow (Preview) | Project list and project detail workspace with live API-backed data |

## Planned Modules

| Module | Description |
|--------|-------------|
| Bank Reconciliation | Transaction matching and multi-currency support |
| Client Portal | Client access and document requests |
| Accounting Integration | Xero, QuickBooks, MYOB connectors |
| Module Marketplace | Browse and install modules |
| SuperAdmin Dashboard | System administration workflows |

## Local Development Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env

# 3. Start PostgreSQL + MinIO
npm run docker:db:up

# 4. Generate client, push schema, and seed
npm run db:generate
npm run db:push
npm run db:seed

# 5. Start the local Next.js dev server
npm run dev
```

If you use the bundled MinIO stack from `oakcloud_db.yml`, set these values in your local `.env` before starting the app:

```env
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="oakcloud"
S3_SECRET_KEY="Preparefortrouble!"
S3_BUCKET="oakcloud"
```

**Access**

- Frontend: `http://localhost:3000`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

**Default Login**

- Super Admin: `admin@oaktreesolutions.com.sg` / `Preparefortrouble!`

**Local MinIO Console Login**

- Username: `oakcloud`
- Password: `Preparefortrouble!`

`npm run docker:up` starts the containerized app stack from `docker-compose.yml` and is optional for local development. Do not run it at the same time as `npm run dev` unless you intentionally want the app running in Docker on port `3000`.

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Chakra UI |
| State | Zustand, TanStack Query, React Hook Form |
| Backend | Node.js 20, PostgreSQL 16, Prisma 7 |
| Auth | JWT (`jose`), Argon2id (`@noble/hashes`) |
| AI | OpenAI, Anthropic, Google AI, OpenRouter |
| Storage | MinIO / S3-compatible object storage |
| Documents | TipTap, pdf-lib, Puppeteer |
| Infra | Docker Compose, optional Redis, in-process scheduler |

Current package version: `0.1.0` (from [`package.json`](../package.json)).
