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
npm run docker:up        # Start PostgreSQL + Redis
npm run docker:down      # Stop containers
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
├── hooks/                  # React hooks (useAuth, useCompanies, etc.)
├── lib/                    # Core utilities
│   ├── prisma.ts           # Database client
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

- PostgreSQL with Prisma ORM
- Docker runs on port `5433` (to avoid conflicts with local PostgreSQL)
- Soft delete pattern with `deletedAt` field
- Historical tracking with `isCurrent`, `effectiveFrom/To` fields

### Authentication

- JWT stored in `auth-token` httpOnly cookie (7 days)
- Session retrieved via `getSession()` from `@/lib/auth`
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

### Environment Variables

Required: `DATABASE_URL`, `JWT_SECRET`
Optional: `OPENAI_API_KEY` (for BizFile extraction)

### Default Test Credentials

- Super Admin: `admin@oakcloud.local` / `admin123`
- Tenant Admin: `tenant@oakcloud.local` / `admin123`
