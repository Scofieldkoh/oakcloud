# Architecture

> **Last Updated**: 2025-01-12
> **Audience**: Developers

System architecture and design overview for Oakcloud.

## Related Documents

- [Getting Started](./GETTING_STARTED.md) - Setup and installation
- [Database Schema](./reference/DATABASE_SCHEMA.md) - Tables and relationships
- [Service Patterns](./guides/SERVICE_PATTERNS.md) - Backend patterns

---

## Overview

Oakcloud is a local-first, modular practice management system for accounting firms. Built with:

- **Modularity**: Each feature is a separate module
- **Local-first**: All data stays on your infrastructure
- **Clean Design**: Linear.app-inspired theme with light/dark mode
- **Efficiency**: Fast UI with optimized database queries

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.x | React framework with App Router + Turbopack |
| React | 19.x | UI library |
| TypeScript | 5.7+ | Type-safe JavaScript |
| Tailwind CSS | 3.4+ | Utility-first styling |
| Chakra UI | 3.x | Component library |
| Zustand | 5.x | Global state management |
| TanStack Query | 5.x | Server state & caching |
| React Hook Form | 7.x | Form handling |
| Zod | 3.x | Schema validation |
| Lucide React | 0.474+ | Icon library |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20 LTS | Runtime environment |
| PostgreSQL | 16 | Primary database |
| Prisma | 7.x | ORM with driver adapters |
| Next.js API Routes | 15.x | Backend API |
| JWT (jose) | 6.x | Authentication |
| @noble/hashes | 2.x | Cryptography (Argon2id, BLAKE3) |
| Nodemailer | 6.x | Email sending (SMTP) |
| OpenAI | 4.x | AI extraction - GPT (lazy loaded) |
| Anthropic | 0.x | AI extraction - Claude (lazy loaded) |
| Google Generative AI | 0.x | AI extraction - Gemini (lazy loaded) |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| Docker Compose | Container orchestration |
| PostgreSQL | Database container (port 5433) |
| Redis | Cache/sessions (optional, port 6379) |
| MinIO | S3-compatible object storage (ports 9000/9001) |

---

## Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Protected routes with AuthGuard
│   ├── api/                # API routes
│   └── login/              # Public login page
├── components/
│   ├── ui/                 # Reusable UI components
│   └── [feature]/          # Feature-specific components
├── generated/
│   └── prisma/             # Generated Prisma client
├── hooks/                  # React hooks
├── lib/                    # Core utilities
│   ├── prisma.ts           # Database client
│   ├── storage/            # Object storage abstraction
│   ├── auth.ts             # JWT & session management
│   ├── audit.ts            # Audit logging
│   ├── rbac.ts             # Role-based access control
│   ├── tenant.ts           # Multi-tenancy utilities
│   └── validations/        # Zod schemas
├── services/               # Business logic layer
└── stores/                 # Zustand state
```

---

## Multi-Tenancy Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SUPER_ADMIN                                  │
│                    (Cross-tenant access)                             │
└─────────────────────────────────────────────────────────────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                    ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│    Tenant A     │   │    Tenant B     │   │    Tenant C     │
│  ┌───────────┐  │   │  ┌───────────┐  │   │  ┌───────────┐  │
│  │TENANT_ADMIN│  │   │  │TENANT_ADMIN│  │   │  │TENANT_ADMIN│  │
│  └───────────┘  │   │  └───────────┘  │   │  └───────────┘  │
│       │         │   │       │         │   │       │         │
│  ┌────┴────┐    │   │  ┌────┴────┐    │   │  ┌────┴────┐    │
│  │Companies│    │   │  │Companies│    │   │  │Companies│    │
│  │Users    │    │   │  │Users    │    │   │  │Users    │    │
│  │Contacts │    │   │  │Contacts │    │   │  │Contacts │    │
│  │Documents│    │   │  │Documents│    │   │  │Documents│    │
│  └─────────┘    │   │  └─────────┘    │   │  └─────────┘    │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

### Key Features

1. **Data Isolation**: All queries automatically scoped to user's tenant
2. **Tenant-aware Auth**: Session includes tenant context
3. **RBAC**: Fine-grained role-based access control
4. **Tenant Suspension**: Suspended tenants prevent user login
5. **Audit Trail**: All actions tracked with tenant context
6. **SUPER_ADMIN Cross-Tenant**: Centralized tenant selector in sidebar

### Tenant Limits

| Limit | Default | Description |
|-------|---------|-------------|
| maxUsers | 50 | Maximum users per tenant |
| maxCompanies | 100 | Maximum companies per tenant |
| maxStorageMb | 10240 | Storage quota in MB (10GB) |

---

## Core Entity Relationships

```
┌──────────────────────────────────────────────────────────────────────┐
│                           COMPANY MODULE                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────┐     ┌────────────────┐     ┌──────────────┐           │
│  │  Company │────▶│ CompanyAddress │     │ CompanyOfficer│           │
│  └──────────┘     └────────────────┘     └──────────────┘           │
│       │                                         │                    │
│       │           ┌─────────────────┐          │                    │
│       ├──────────▶│CompanyShareholder│◀────────┤                    │
│       │           └─────────────────┘          │                    │
│       │                                         ▼                    │
│       │           ┌──────────────┐        ┌─────────┐               │
│       ├──────────▶│ CompanyCharge │       │ Contact │               │
│       │           └──────────────┘        └─────────┘               │
│       │                                                              │
│       │           ┌──────────────┐     ┌───────────┐                │
│       └──────────▶│   Document   │────▶│  AuditLog │                │
│                   └──────────────┘     └───────────┘                │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## User Roles

| System Role | Scope | Description |
|-------------|-------|-------------|
| `SUPER_ADMIN` | System-wide | Full access to all tenants |
| `TENANT_ADMIN` | Tenant | Manage tenant settings, users, roles |
| `COMPANY_ADMIN` | Company | Manage assigned company |
| `COMPANY_USER` | Company | View-only access |
| Custom roles | Configurable | Fine-grained permissions |

---

## Key Patterns

### Authentication Flow

1. User submits credentials to `/api/auth/login`
2. Server validates and creates JWT token
3. Token stored in `auth-token` httpOnly cookie (7 days)
4. Session retrieved via `getSession()` from `@/lib/auth`

### Service Layer Pattern

```typescript
// All services accept TenantAwareParams
export async function createCompany(
  data: CreateCompanyInput,
  params: TenantAwareParams  // { tenantId, userId }
): Promise<Company> {
  // Business logic with tenant isolation
}
```

### Audit Logging Pattern

```typescript
import { createAuditContext, logUpdate } from '@/lib/audit';

const ctx = await createAuditContext({ tenantId, userId, changeSource: 'MANUAL' });
await logUpdate(ctx, 'Company', id, companyName, changes);
```

### Permission Checking

```typescript
import { hasPermission, requirePermission } from '@/lib/rbac';

// Check permission
const canEdit = await hasPermission(userId, 'company', 'update', companyId);

// Require permission (throws if denied)
await requirePermission(session, 'company', 'update', companyId);
```

---

## Storage Architecture

Documents are stored in S3-compatible object storage (MinIO in development):

```
{tenantId}/
├── companies/{companyId}/
│   └── documents/{docId}/
│       ├── original.pdf
│       └── extracted.json
└── pending/{docId}/
    └── original.{ext}
```

**Environment Variables:**
- `STORAGE_PROVIDER=s3`
- `S3_ENDPOINT` - MinIO/S3 endpoint
- `S3_BUCKET` - Bucket name
- `S3_ACCESS_KEY` / `S3_SECRET_KEY` - Credentials
- `S3_ENCRYPTION=AES256` - Server-side encryption

---

## Module List

### Implemented

| Module | Description |
|--------|-------------|
| Company Management | Companies, BizFile uploads, compliance |
| Contact Management | Individual/corporate contacts |
| Authentication | JWT-based auth with RBAC |
| Multi-Tenancy | Tenant isolation with limits |
| Audit Logging | Activity tracking |
| User Management | Users, invitations, assignments |
| Document Generation | Templates, PDF export, sharing |
| Document Processing | AI extraction, revisions |
| Exchange Rates | MAS API integration |
| Chart of Accounts | Hierarchical accounts |

### Planned

| Module | Description |
|--------|-------------|
| Bank Reconciliation | Transaction matching |
| Client Portal | Client access |
| Accounting Integration | Xero, QuickBooks connectors |
