# Oakcloud - Practice Management System

> **Last Updated**: 2026-02-05

A modular internal management system designed for accounting practices. Clean, efficient, and runs completely locally.

## Documentation

📚 **[Documentation Index](./INDEX.md)** - Start here for navigation to all docs

### Quick Links
- [Getting Started](./GETTING_STARTED.md) - Installation and setup
- [Architecture](./ARCHITECTURE.md) - System design overview
- [TODO / Roadmap](./TODO.md) - Issues and planned features

### Guides
- [RBAC Guideline](./guides/RBAC_GUIDELINE.md) - Authentication and permissions
- [Design Guideline](./guides/DESIGN_GUIDELINE.md) - UI components and styling
- [Keyboard Shortcuts](./guides/KEYBOARD_SHORTCUTS.md) - Standard shortcut mappings across modules
- [Service Patterns](./guides/SERVICE_PATTERNS.md) - Service layer conventions
- [Audit Logging](./guides/AUDIT_LOGGING.md) - Activity tracking

### Reference
- [Database Schema](./reference/DATABASE_SCHEMA.md) - All tables and relationships
- [API Reference](./reference/API_REFERENCE.md) - REST API endpoints
- [Environment Variables](./reference/ENVIRONMENT_VARIABLES.md) - Configuration options

### Feature Specifications
- [Document Generation](./features/document-generation/) - Templates, PDF export, sharing
- [Document Processing](./features/document-processing/) - AI extraction, revisions

### Debug
- [AI Debug](./debug/AI_DEBUG.md) - AI extraction debugging

---

## Overview

Oakcloud is a local-first, modular system for managing accounting practice operations:

- **Modularity**: Each feature is a separate module
- **Local-first**: All data stays on your infrastructure
- **Clean Design**: Linear.app-inspired theme with light/dark mode
- **Efficiency**: Fast, responsive UI with optimized queries

---

## Modules

### Implemented ✅
| Module | Description |
|--------|-------------|
| Company Management | Companies, BizFile uploads, compliance tracking |
| Contact Management | Individual and corporate contacts |
| Authentication | JWT-based with role-based access |
| Multi-Tenancy | Full tenant isolation with limits |
| Audit Logging | Activity tracking with request context |
| RBAC & Permissions | Fine-grained role-based access control |
| User Management | Accounts, invitations, multi-company assignments |
| Password Management | Reset flow, force change on first login |
| Data Purge | Permanent deletion (SUPER_ADMIN) |
| Backup & Restore | Per-tenant backup (SUPER_ADMIN) |
| Email Notifications | SMTP-based transactional emails |
| Connectors Hub | External service integrations |
| Document Generation | Templates, PDF export, sharing, comments |
| Document Processing | AI-powered ingestion, extraction, revisions |
| Exchange Rates | MAS API integration, manual overrides |
| Chart of Accounts | Hierarchical accounts, platform mapping |

### Planned 🔜
| Module | Description |
|--------|-------------|
| Bank Reconciliation | Transaction matching, multi-currency |
| Client Portal | Client access, document requests |
| Accounting Integration | Xero, QuickBooks, MYOB connectors |
| Module Marketplace | Browse and install modules |
| SuperAdmin Dashboard | System administration |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env

# 3. Start infrastructure (PostgreSQL, Redis, MinIO)
npm run docker:up

# 4. Initialize database
npm run db:generate && npm run db:push && npm run db:seed

# 5. Start development server
npm run dev
```

**Access:**
- Frontend: http://localhost:3000
- MinIO Console: http://localhost:9001 (`oakcloud` / `oakcloud_minio_secret`)

**Default Login:**
- Super Admin: `admin@oaktreesolutions.com.sg` / `Preparefortrouble!`

> See [Getting Started](./GETTING_STARTED.md) for detailed instructions.

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Chakra UI 3 |
| State | Zustand, TanStack Query, React Hook Form |
| Backend | Node.js 20, PostgreSQL 16, Prisma 7 |
| Auth | JWT (jose), Argon2id (@noble/hashes) |
| AI | OpenAI, Anthropic, Google Generative AI |
| Storage | MinIO (S3-compatible), AWS SDK |
| Infra | Docker Compose, Redis |

> See [Architecture](./ARCHITECTURE.md) for detailed breakdown.

---

## Version History

### Latest: v0.12.02

See [TODO.md](./TODO.md) for current issues and planned features.
