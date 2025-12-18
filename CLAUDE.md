# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## User Instruction

ALWAYS remember to keep the code clean, efficient, modular and reusable. Ensure documentations (README and database-schema) are kept up to date, updating where applicable instead of creating new documentation every time. 

## Project Overview

Oakcloud is a multi-tenant practice management system for accounting firms. Built with Next.js 15 (App Router), it manages companies, contacts, documents, and provides AI-powered BizFile extraction.

## Commands

```bash
# Development
npm run dev              # Start dev server (Turbopack)
npm run build            # Production build
npm run lint             # ESLint

# Database
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema to database
npm run db:migrate       # Create migration
npm run db:studio        # Open Prisma Studio
npm run db:seed          # Seed with sample data

# Docker
npm run docker:up        # Start PostgreSQL + Redis + MinIO
npm run docker:down      # Stop containers

# Testing
npm run test:run         # Run all tests
npm run test:coverage    # Run tests with coverage
```

## Architecture

### Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Protected routes with AuthGuard
│   ├── api/                # API routes
│   └── login/              # Public login page
├── components/
│   ├── ui/                 # Reusable UI components (Button, Modal, Toast, etc.)
│   └── companies/          # Company-specific components
├── generated/
│   └── prisma/             # Generated Prisma client (import from @/generated/prisma)
├── hooks/                  # React hooks (useAuth, useCompanies, etc.)
├── lib/                    # Core utilities
│   ├── prisma.ts           # Database client with PrismaPg adapter
│   ├── storage/            # Object storage abstraction (S3/MinIO)
│   ├── auth.ts             # JWT & session management
│   ├── audit.ts            # Audit logging
│   ├── rbac.ts             # Role-based access control
│   ├── tenant.ts           # Multi-tenancy utilities
│   └── validations/        # Zod schemas
├── services/               # Business logic layer
│   ├── company.service.ts  # Company CRUD (tenant-aware)
│   ├── tenant.service.ts   # Tenant management
│   ├── password.service.ts # Password reset & change
│   ├── user-company.service.ts # Multi-company user assignments
│   └── bizfile.service.ts  # AI extraction
└── stores/                 # Zustand state
```

### Key Patterns

**Multi-Tenancy**: All data queries are scoped by `tenantId`. The session includes tenant context, and services automatically filter by tenant.

**RBAC**: Permissions use `resource:action` format (e.g., `company:update`). Check with:
```typescript
import { hasPermission, requirePermission } from '@/lib/rbac';
await requirePermission(session, 'company', 'update', companyId);
```

**Audit Logging**: All changes tracked with request context:
```typescript
import { createAuditContext, logUpdate } from '@/lib/audit';
const ctx = await createAuditContext({ tenantId, userId, changeSource: 'MANUAL' });
await logUpdate(ctx, 'Company', id, changes);
```

**Path Alias**: Use `@/` for imports from `src/` directory.

**Number Input Fields**: When using controlled number inputs with `useState`, store the value as a **string** and convert to number only on form submission. This prevents the input from reverting when the user clears the field.

```typescript
// ❌ BAD: Value reverts immediately when field is cleared
const [maxUsers, setMaxUsers] = useState(50);
<input
  type="number"
  value={maxUsers}
  onChange={(e) => setMaxUsers(parseInt(e.target.value) || 50)}
/>

// ✅ GOOD: Store as string, parse on submit
const [maxUsers, setMaxUsers] = useState('50');
<input
  type="number"
  value={maxUsers}
  onChange={(e) => setMaxUsers(e.target.value)}
/>
// On submit: parseInt(maxUsers) || 50
```

Note: This doesn't apply to `react-hook-form` with `{ valueAsNumber: true }` which handles this correctly.

### Database

- PostgreSQL with Prisma ORM 7.x (Rust-free client with driver adapters)
- Docker runs on port `5433` (to avoid conflicts with local PostgreSQL)
- Soft delete pattern with `deletedAt` field
- Historical tracking with `isCurrent`, `effectiveFrom/To` fields
- Generated client at `src/generated/prisma/` - import from `@/generated/prisma`
- Uses `@prisma/adapter-pg` with connection pooling for PostgreSQL

### Authentication

- JWT stored in `auth-token` httpOnly cookie (7 days)
- Session retrieved via `getSession()` from `@/lib/auth`
- Session includes: `id`, `email`, `firstName`, `lastName`, `tenantId`, `isSuperAdmin`, `isTenantAdmin`, `companyIds`
- `companyIds` is derived from role assignments (authoritative source for company access)
- User roles: `SUPER_ADMIN`, `TENANT_ADMIN`, `COMPANY_ADMIN`, `COMPANY_USER`
- Password requirements: 8+ chars, uppercase, lowercase, number
- Force password change: New users must change password on first login
- Password reset: Token-based, expires in 24 hours

### UI Components

Located in `src/components/ui/`. Built on Chakra UI with custom styling.

Key components: `Button`, `FormInput`, `Modal`, `ConfirmDialog`, `Dropdown`, `Toast`, `Sidebar`

Design: Linear.app-inspired, compact, 4px grid system. Light mode default with dark mode toggle.

### API Routes

All API routes under `src/app/api/`:
- `/api/auth/*` - Authentication (login, logout, session)
- `/api/auth/forgot-password` - Request password reset
- `/api/auth/reset-password` - Reset password with token
- `/api/auth/change-password` - Change password (authenticated)
- `/api/companies/*` - Company CRUD + documents
- `/api/tenants/*` - Tenant management (SUPER_ADMIN)
- `/api/users/:id/companies` - Multi-company user assignments
- `/api/audit-logs/*` - Audit history

### Object Storage (MinIO/S3)

Documents are stored in S3-compatible object storage (MinIO in development):
- Storage abstraction: `src/lib/storage/` with `StorageKeys` utility
- Key pattern: `{tenantId}/companies/{companyId}/documents/{docId}/...`
- Pending uploads: `{tenantId}/pending/{docId}/original.{ext}`
- Environment: `STORAGE_PROVIDER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, etc.

### Environment Variables

Required: `DATABASE_URL`, `JWT_SECRET`
Optional: `OPENAI_API_KEY` (for BizFile extraction), `LOG_LEVEL` (silent|error|warn|info|debug|trace)
Storage: `STORAGE_PROVIDER` (s3|local), `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`

### Logging

Configurable via `LOG_LEVEL` environment variable:
- `debug` (default in development) - standard logging, no SQL queries
- `trace` - includes all SQL queries (verbose)
- `info` (default in production) - minimal logging
- `error` / `warn` / `silent` - progressively quieter

```typescript
import { createLogger } from '@/lib/logger';
const log = createLogger('module-name');
log.error('message'); log.warn('message'); log.info('message'); log.debug('message'); log.trace('message');
```

### Default Test Credentials

- Super Admin: `admin@oakcloud.local` / `admin123`
- Tenant Admin: `tenant@oakcloud.local` / `admin123`
- Remember to keep the code clean, efficient, modular, reusable and consistent. Ensure documentations are kept up to date, updating where applicable (README.md under docs; database-schema, RBAC_GUIDELINE, DESIGN_GUIDELINE under docs) instead of creating new documentation every time. 

you can read "README.md" inside of docs, it contains the latest information on the codebase, RBAC_GUIDELINE and DESIGN_GUIDELINE before implementing. If you encounter error or any potential improvement, raise it up to user.