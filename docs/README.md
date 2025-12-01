# Oakcloud - Practice Management System

A modular internal management system designed for accounting practices. Clean, efficient, and runs completely locally.

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Design Guidelines](#design-guidelines)
- [Module: Company Management](#module-company-management)
- [Version History](#version-history)

---

## Overview

Oakcloud is a local-first, modular system for managing accounting practice operations. The system is built with a focus on:

- **Modularity**: Each feature is a separate module that can be developed and deployed independently
- **Local-first**: All data stays on your infrastructure, no external API dependencies
- **Clean Design**: Linear.app-inspired theme with light/dark mode support
- **Efficiency**: Fast, responsive UI with optimized database queries

### Core Modules (Planned)

1. ✅ **Company Management** - Manage companies, BizFile uploads, compliance tracking
2. ✅ **Authentication** - JWT-based authentication with role-based access
3. ✅ **Multi-Tenancy** - Full tenant isolation with configurable limits
4. ✅ **Audit Logging** - Comprehensive activity tracking with request context
5. 🔜 **User Management** - User accounts and profile management
6. 🔜 **RBAC & Permissions** - Fine-grained role-based access control
7. 🔜 **Audit Logging Dashboard** - System-wide activity tracking UI
8. 🔜 **Module Marketplace** - Browse and install modules
9. 🔜 **Connectors Hub** - External service integrations
10. 🔜 **Module Linking** - Configure module relationships
11. 🔜 **SuperAdmin Dashboard** - System administration

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.x | React framework with App Router + Turbopack |
| React | 19.x | UI library |
| TypeScript | 5.7+ | Type-safe JavaScript |
| Tailwind CSS | 3.4+ | Utility-first styling |
| Chakra UI | 3.x | Component library (Button, Input, Box, etc.) |
| Zustand | 5.x | Global state management |
| TanStack Query | 5.x | Server state & caching |
| React Hook Form | 7.x | Form handling |
| Zod | 3.x | Schema validation |
| Lucide React | 0.474+ | Icon library |
| Motion | 12.x | Animation library |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20 LTS | Runtime environment |
| PostgreSQL | 16 | Primary database |
| Prisma | 6.x | ORM & database toolkit |
| Next.js API Routes | 15.x | Backend API |
| JWT (jose) | 6.x | Authentication |
| OpenAI | 4.x | AI document extraction (lazy loaded) |
| pdf-parse | 1.x | PDF text extraction (lazy loaded) |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Docker Compose | Container orchestration |
| PostgreSQL | Database container |
| Redis | Cache/sessions (optional) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm (or pnpm/yarn)

### Installation

1. **Clone and install dependencies:**
```bash
cd oakcloud
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start database containers:**
```bash
npm run docker:up
```

This will automatically create:
- PostgreSQL database named `oakcloud`
- User `oakcloud` with password `oakcloud_password`
- Redis instance for caching

> **Note:** The Docker PostgreSQL runs on port `5433` to avoid conflicts with local PostgreSQL installations.

4. **Initialize database:**
```bash
npm run db:generate
npm run db:push
npm run db:seed
```

5. **Start development server:**
```bash
npm run dev  # Uses Turbopack for faster compilation
```

6. **Access the application:**
   - Frontend: http://localhost:3000
   - Database Studio: `npm run db:studio`

### Using Local PostgreSQL (Alternative)

If you prefer to use a local PostgreSQL installation instead of Docker:

1. Connect to PostgreSQL as a superuser:
```bash
psql -U postgres
```

2. Create the user and database:
```sql
CREATE USER oakcloud WITH PASSWORD 'oakcloud_password';
CREATE DATABASE oakcloud OWNER oakcloud;
GRANT ALL PRIVILEGES ON DATABASE oakcloud TO oakcloud;
\c oakcloud
GRANT ALL ON SCHEMA public TO oakcloud;
```

3. Update `.env` to use port `5432`:
```
DATABASE_URL="postgresql://oakcloud:oakcloud_password@localhost:5432/oakcloud?schema=public"
```

### Default Credentials

After seeding, you can login with:
- Email: `admin@oakcloud.local`
- Password: `admin123`

---

## Database Schema

### Core Entities

```
┌─────────────────────────────────────────────────────────────────────┐
│                           COMPANY MODULE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐     ┌────────────────┐     ┌──────────────┐          │
│  │  Company │────▶│ CompanyAddress │     │ CompanyOfficer│          │
│  └──────────┘     └────────────────┘     └──────────────┘          │
│       │                                         │                   │
│       │           ┌─────────────────┐          │                   │
│       ├──────────▶│CompanyShareholder│◀────────┤                   │
│       │           └─────────────────┘          │                   │
│       │                                         ▼                   │
│       │           ┌──────────────┐        ┌─────────┐              │
│       ├──────────▶│ CompanyCharge │       │ Contact │              │
│       │           └──────────────┘        └─────────┘              │
│       │                                                             │
│       │           ┌──────────────┐     ┌───────────┐               │
│       ├──────────▶│   Document   │────▶│  AuditLog │               │
│       │           └──────────────┘     └───────────┘               │
│       │                                                             │
│       └──────────▶ FormerNames, ShareCapital, etc.                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Models

#### Company
Primary entity for business records.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| uen | String | Unique Entity Number |
| name | String | Company name |
| entityType | Enum | PRIVATE_LIMITED, PUBLIC_LIMITED, etc. |
| status | Enum | LIVE, STRUCK_OFF, etc. |
| incorporationDate | DateTime | Date of incorporation |
| primarySsicCode | String | Primary business activity code |
| financialYearEndMonth | Int | FYE month (1-12) |
| paidUpCapitalAmount | Decimal | Paid up capital |
| hasCharges | Boolean | Has outstanding charges |

#### Contact
Unified contact management for individuals and corporates.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| contactType | Enum | INDIVIDUAL or CORPORATE |
| fullName | String | Computed full name |
| identificationType | Enum | NRIC, FIN, PASSPORT, UEN |
| identificationNumber | String | ID number |
| email | String | Email address |

#### Document
File storage and BizFile tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| companyId | UUID | Related company |
| documentType | String | BIZFILE, CONSTITUTION, etc. |
| extractionStatus | String | PENDING, COMPLETED, FAILED |
| extractedData | JSON | Raw extracted data |

#### AuditLog
Complete audit trail for all changes.

| Field | Type | Description |
|-------|------|-------------|
| tenantId | UUID | Tenant scope (optional for system events) |
| action | Enum | CREATE, UPDATE, DELETE, LOGIN, etc. |
| entityType | String | Table/model name |
| entityId | String | Record ID |
| changes | JSON | Old/new value pairs |
| changeSource | Enum | MANUAL, BIZFILE_UPLOAD, API, SYSTEM |
| requestId | String | Correlates related operations |
| ipAddress | String | Client IP address |
| userAgent | String | Client browser info |

#### Tenant
Multi-tenancy support for data isolation.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String | Tenant display name |
| slug | String | URL-friendly identifier (unique) |
| status | Enum | ACTIVE, SUSPENDED, PENDING_SETUP, DEACTIVATED |
| plan | Enum | FREE, STARTER, PROFESSIONAL, ENTERPRISE |
| maxUsers | Int | Maximum allowed users |
| maxCompanies | Int | Maximum allowed companies |
| maxStorageMb | Int | Storage limit in MB |
| settings | JSON | Tenant-specific configuration |

---

## Multi-Tenancy

Oakcloud supports full multi-tenancy with tenant-level data isolation and configurable limits.

### Architecture

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

### User Roles

| Role | Scope | Permissions |
|------|-------|-------------|
| SUPER_ADMIN | System-wide | Full access to all tenants and system settings |
| TENANT_ADMIN | Tenant | Manage tenant settings, users, and all companies |
| COMPANY_ADMIN | Company | Manage assigned company and its data |
| COMPANY_USER | Company | View-only access to assigned company |

### Tenant Limits

Each tenant has configurable limits:

- **maxUsers**: Maximum number of users (default: 5)
- **maxCompanies**: Maximum number of companies (default: 10)
- **maxStorageMb**: Storage quota in MB (default: 1024)

Limits are enforced at the service layer before creating new resources.

### Key Features

1. **Data Isolation**: All queries are automatically scoped to the user's tenant
2. **Tenant-aware Authentication**: Session includes tenant context
3. **Configurable Plans**: FREE, STARTER, PROFESSIONAL, ENTERPRISE
4. **Tenant Suspension**: Suspended tenants prevent user login
5. **Audit Trail**: All actions tracked with tenant context

---

## Audit Logging

Comprehensive audit logging tracks all changes, user actions, and system events.

### Tracked Actions

| Category | Actions |
|----------|---------|
| CRUD | CREATE, UPDATE, DELETE, RESTORE |
| Documents | UPLOAD, DOWNLOAD, EXTRACT |
| Authentication | LOGIN, LOGOUT, LOGIN_FAILED, PASSWORD_CHANGED, PASSWORD_RESET |
| Access Control | PERMISSION_GRANTED, PERMISSION_REVOKED, ROLE_CHANGED |
| Tenant | TENANT_CREATED, TENANT_UPDATED, TENANT_SUSPENDED, TENANT_ACTIVATED, USER_INVITED, USER_REMOVED |
| Data | EXPORT, IMPORT, BULK_UPDATE |

### Request Context

Each audit log automatically captures:

- **IP Address**: Client IP (supports proxy headers)
- **User Agent**: Browser/client information
- **Request ID**: Correlates related operations
- **Timestamp**: Immutable creation time

### Change Tracking

For UPDATE actions, the system records:

```json
{
  "changes": {
    "name": { "old": "Old Company Name", "new": "New Company Name" },
    "status": { "old": "LIVE", "new": "STRUCK_OFF" }
  }
}
```

### Usage in Services

```typescript
import { createAuditContext, logCreate, logUpdate, logDelete } from '@/lib/audit';

// Create audit context at the start of a request
const auditContext = await createAuditContext({
  tenantId: session.tenantId,
  userId: session.id,
  changeSource: 'MANUAL',
});

// Log a creation
await logCreate(auditContext, 'Company', company.id, { uen: company.uen });

// Log an update with changes
await logUpdate(auditContext, 'Company', company.id, changes, 'Updated by user request');

// Log a deletion with reason
await logDelete(auditContext, 'Company', company.id, 'No longer a client');
```

---

## API Reference

### Companies

#### List Companies
```
GET /api/companies
```

Query Parameters:
- `query` - Search term (name, UEN, officer, address)
- `entityType` - Filter by entity type
- `status` - Filter by company status
- `hasCharges` - Filter by charges (true/false)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `sortBy` - Sort field (default: updatedAt)
- `sortOrder` - asc or desc (default: desc)

#### Get Company
```
GET /api/companies/:id
GET /api/companies/:id?full=true  # Include all relations
```

#### Create Company
```
POST /api/companies
Content-Type: application/json

{
  "uen": "202012345A",
  "name": "Company Name Pte Ltd",
  "entityType": "PRIVATE_LIMITED",
  "status": "LIVE"
}
```

#### Update Company
```
PATCH /api/companies/:id
Content-Type: application/json

{
  "name": "New Company Name"
}
```

#### Delete Company (Soft Delete)
```
DELETE /api/companies/:id
Content-Type: application/json

{
  "reason": "Company is no longer a client"
}
```

### Documents

#### Upload Document
```
POST /api/companies/:id/documents
Content-Type: multipart/form-data

file: [PDF file]
documentType: BIZFILE
```

#### Extract BizFile Data
```
POST /api/companies/:id/documents/:documentId/extract
```

#### Preview Extraction
```
GET /api/companies/:id/documents/:documentId/extract
```

### Audit

#### Get Company Audit History
```
GET /api/companies/:id/audit
```

Query Parameters:
- `limit` - Number of records (default: 50)
- `offset` - Skip records (default: 0)
- `actions` - Filter by actions (comma-separated)

### Authentication

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@oakcloud.local",
  "password": "admin123"
}
```

Response:
```json
{
  "user": {
    "id": "uuid",
    "email": "admin@oakcloud.local",
    "firstName": "Super",
    "lastName": "Admin",
    "role": "SUPER_ADMIN"
  },
  "message": "Login successful"
}
```

Sets `auth-token` cookie (httpOnly, 7 days expiry).

#### Logout
```
POST /api/auth/logout
```

Clears the `auth-token` cookie.

#### Get Current Session
```
GET /api/auth/me
```

Response:
```json
{
  "user": {
    "id": "uuid",
    "email": "admin@oakcloud.local",
    "firstName": "Super",
    "lastName": "Admin",
    "role": "SUPER_ADMIN",
    "companyId": null
  }
}
```

Returns 401 if not authenticated.

### Tenants (SUPER_ADMIN Only)

#### List Tenants
```
GET /api/tenants
```

Query Parameters:
- `query` - Search term (name, slug, email)
- `status` - Filter by status (ACTIVE, SUSPENDED, etc.)
- `plan` - Filter by plan (FREE, STARTER, etc.)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `sortBy` - Sort field (name, createdAt, status, plan)
- `sortOrder` - asc or desc (default: desc)

#### Create Tenant
```
POST /api/tenants
Content-Type: application/json

{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "plan": "PROFESSIONAL",
  "contactEmail": "admin@acme.com",
  "maxUsers": 20,
  "maxCompanies": 50
}
```

#### Get Tenant
```
GET /api/tenants/:id
```

#### Update Tenant
```
PATCH /api/tenants/:id
Content-Type: application/json

{
  "name": "Acme Corporation",
  "plan": "ENTERPRISE"
}
```

#### Update Tenant Status
```
PATCH /api/tenants/:id
Content-Type: application/json

{
  "status": "SUSPENDED",
  "reason": "Payment overdue"
}
```

#### Delete Tenant
```
DELETE /api/tenants/:id
Content-Type: application/json

{
  "reason": "Tenant requested account closure"
}
```

Note: Tenant must have no users or companies to be deleted.

### Tenant Users

#### List Tenant Users
```
GET /api/tenants/:id/users
```

Query Parameters:
- `query` - Search term (name, email)
- `role` - Filter by role
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

#### Invite User to Tenant
```
POST /api/tenants/:id/users
Content-Type: application/json

{
  "email": "user@acme.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "COMPANY_ADMIN",
  "companyId": "uuid" // Optional
}
```

### Tenant Statistics

#### Get Tenant Stats
```
GET /api/tenants/:id/stats
```

Response includes user counts, company counts, storage usage, and activity metrics.

### Audit Logs

#### List Audit Logs
```
GET /api/audit-logs
```

Query Parameters:
- `action` - Single action filter
- `actions` - Comma-separated actions
- `entityType` - Filter by entity type
- `entityTypes` - Comma-separated entity types
- `userId` - Filter by user
- `companyId` - Filter by company
- `tenantId` - Filter by tenant (SUPER_ADMIN only)
- `startDate` - ISO date string
- `endDate` - ISO date string
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50)
- `sortBy` - Sort field (createdAt, action, entityType)
- `sortOrder` - asc or desc (default: desc)

Note: Non-SUPER_ADMIN users only see logs from their tenant.

#### Get Audit Statistics
```
GET /api/audit-logs/stats
```

Query Parameters:
- `startDate` - ISO date string (default: 30 days ago)
- `endDate` - ISO date string (default: now)
- `tenantId` - Filter by tenant (SUPER_ADMIN only)

Response:
```json
{
  "totalLogs": 1234,
  "actionCounts": [
    { "action": "UPDATE", "count": 500 },
    { "action": "CREATE", "count": 300 }
  ],
  "entityTypeCounts": [
    { "entityType": "Company", "count": 400 },
    { "entityType": "User", "count": 200 }
  ],
  "topUsers": [
    { "userId": "uuid", "count": 150 }
  ]
}
```

---

## Design Guidelines

Oakcloud follows a **sleek, modern, and compact** design philosophy inspired by Linear.app. The UI prioritizes information density while maintaining readability.

### Design Principles

1. **Compact & Dense** - Minimize whitespace, use smaller font sizes for data-heavy interfaces
2. **Subtle Interactions** - Muted hover states, smooth transitions (150ms)
3. **Light/Dark Mode** - Full theme support with light mode as default, carefully tuned contrast for both modes
4. **Consistent Spacing** - Use the 4px grid system (4, 8, 12, 16, 20, 24, 32px)
5. **Minimal Borders** - Prefer subtle borders over shadows for separation (shadows enabled in light mode for depth)

### Typography Scale

Balanced font sizes for modern, readable interfaces:

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `text-2xs` | 11px | 16px | Timestamps, metadata |
| `text-xs` | 12px | 18px | Labels, badges, captions |
| `text-sm` | 13px | 20px | Body text, inputs, buttons |
| `text-base` | 14px | 24px | Primary content |
| `text-lg` | 16px | 26px | Section headers |
| `text-xl` | 18px | 28px | Page subtitles |
| `text-2xl` | 20px | 30px | Page titles |
| `text-3xl` | 24px | 34px | Hero text |

**Font Families:**
- **Sans**: Inter (UI text)
- **Mono**: JetBrains Mono (code blocks, technical IDs)

### Color Palette

The application supports both light and dark modes with CSS variables. Light mode is the default.

#### Light Mode (Default)
```css
/* Primary Brand (Teal-Green) */
--oak-primary: #294d44;    /* Buttons, active states */
--oak-hover: #23423a;      /* Button hover */
--oak-light: #3a6b5f;      /* Accent text, links */
--oak-dark: #1f3a33;       /* Button active/pressed */

/* Backgrounds (Soft off-white tones) */
--bg-primary: #f8f9fb;     /* Page background (soft gray) */
--bg-secondary: #ffffff;   /* Cards, sidebar (white) */
--bg-tertiary: #f1f3f5;    /* Hover states, table headers */
--bg-elevated: #ffffff;    /* Dropdowns, elevated cards */

/* Borders */
--border-primary: #e2e4e9; /* Default borders */
--border-secondary: #d0d3d9; /* Emphasized borders */
--border-focus: #294d44;   /* Focus rings */

/* Text */
--text-primary: #1a1d23;   /* Primary content */
--text-secondary: #5c6370; /* Secondary text */
--text-tertiary: #7d838f;  /* Placeholder, disabled */
--text-muted: #a0a5b0;     /* Muted, decorative */
```

#### Dark Mode
```css
/* Primary Brand (Teal-Green) */
--oak-primary: #294d44;    /* Buttons, active states */
--oak-hover: #3a6b5f;      /* Button hover */
--oak-light: #4a8b7f;      /* Accent text, links */
--oak-dark: #1f3a33;       /* Button active/pressed */

/* Backgrounds (Darkest to Lightest) */
--bg-primary: #0d0d0d;     /* Page background */
--bg-secondary: #141414;   /* Cards, sidebar */
--bg-tertiary: #1a1a1a;    /* Hover states, table headers */
--bg-elevated: #212121;    /* Dropdowns, elevated cards */

/* Borders */
--border-primary: #2a2a2a; /* Default borders */
--border-secondary: #333;  /* Emphasized borders */
--border-focus: #294d44;   /* Focus rings */

/* Text */
--text-primary: #ffffff;   /* Primary content */
--text-secondary: #a1a1a1; /* Secondary text */
--text-tertiary: #6b6b6b;  /* Placeholder, disabled */
--text-muted: #525252;     /* Muted, decorative */
```

#### Status Colors (Both Modes)
```css
--status-success: #22c55e; /* Success states */
--status-warning: #eab308; /* Warning states */
--status-error: #ef4444;   /* Error states */
--status-info: #3b82f6;    /* Info states */
```

#### Theme Toggle
Users can switch themes via the toggle in the sidebar. The preference is persisted to localStorage.

### Component Size Reference

#### Buttons
| Size | Height | Padding | Font | Border Radius | Use Case |
|------|--------|---------|------|---------------|----------|
| `xs` | 28px | 12px | 12px | 4px | Inline actions, table rows |
| `sm` | 32px | 16px | 13px | 4px | Default, most actions |
| `md` | 36px | 20px | 13px | 4px | Primary actions, forms |
| `lg` | 40px | 24px | 14px | 6px | Hero CTAs |

#### Inputs
| Size | Height | Padding | Font | Border Radius | Use Case |
|------|--------|---------|------|---------------|----------|
| `xs` | 28px | 12px | 12px | 4px | Compact filters |
| `sm` | 32px | 12px | 13px | 4px | Table inline edit |
| `md` | 36px | 14px | 13px | 4px | Default forms |
| `lg` | 40px | 16px | 14px | 4px | Login, prominent inputs |

#### Spacing
| Token | Value | Usage |
|-------|-------|-------|
| `p-1` | 4px | Icon padding |
| `p-2` | 8px | Compact elements |
| `p-3` | 12px | Card padding, nav items |
| `p-4` | 16px | Section padding |
| `p-6` | 24px | Page padding |
| `gap-1` | 4px | Icon + text |
| `gap-2` | 8px | Related elements |
| `gap-4` | 16px | Sections |

### CSS Component Classes

```css
/* Buttons (combine variant + size) */
.btn-primary    /* Oak green, white text */
.btn-secondary  /* Dark bg, border, white text */
.btn-ghost      /* Transparent, text only */
.btn-danger     /* Red tint for destructive */

.btn-xs / .btn-sm / .btn-md / .btn-lg  /* Sizes */
.btn-icon       /* Square icon-only button */

/* Inputs */
.input          /* Base input styles */
.input-xs / .input-sm / .input-md / .input-lg
.input-error    /* Red border for errors */

/* Labels */
.label          /* Form labels (12px, medium) */
.label-sm       /* Small labels (10px) */

/* Cards */
.card           /* bg-secondary, subtle border */
.card-elevated  /* bg-elevated, shadow */

/* Badges */
.badge          /* Base (10px, pill-shaped) */
.badge-success / .badge-warning / .badge-error / .badge-info / .badge-neutral

/* Tables */
.table-container  /* Scrollable wrapper */
.table            /* Full table styles */
.table th         /* Uppercase, 10px, tertiary */
.table td         /* 13px, primary text */

/* Navigation */
.nav-item         /* Sidebar item (12px) */
.nav-item-active  /* Active state with oak tint */

/* Utilities */
.divider          /* Horizontal rule */
.section-title    /* Uppercase label (10px) */
.skeleton         /* Loading placeholder */
```

### UI Consistency Standards

All pages follow these consistency standards for a unified look and feel:

| Element | Standard Class |
|---------|---------------|
| Buttons | `btn-{variant} btn-sm` (use `btn-sm` by default) |
| Inputs | `input input-sm` |
| Page Padding | `p-4 sm:p-6` (responsive) |
| Page Headers | `text-xl sm:text-2xl font-semibold text-text-primary` |
| Description Text | `text-sm text-text-secondary mt-1` |
| Back Links | `text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors` |
| Error Messages | `text-xs text-status-error mt-1.5` |
| Card Headers | `p-4 border-b border-border-primary` |
| Form Labels | `label` class (12px, medium weight) |

### Reusable UI Components

Located in `src/components/ui/`. These components use **Chakra UI** primitives with custom styling to match the Oakcloud design system.

| Component | Props | Description |
|-----------|-------|-------------|
| `Button` | `variant`, `size`, `isLoading`, `iconOnly`, `leftIcon`, `rightIcon` | Chakra-based button with oak theme |
| `FormInput` | `label`, `error`, `hint`, `inputSize`, `leftIcon`, `rightIcon` | Chakra Input with validation |
| `Alert` | `variant`, `title`, `compact`, `onClose` | Chakra Box-based notifications |
| `Modal` | `isOpen`, `onClose`, `title`, `size`, `closeOnEscape` | Accessible modal dialog |
| `ConfirmDialog` | `title`, `description`, `variant`, `requireReason` | Confirmation dialog with optional reason input |
| `Dropdown` | Composable: `Trigger`, `Menu`, `Item` | Click-outside aware dropdown |
| `Toast` | Via `useToast()` hook | Toast notifications (success, error, warning, info) |
| `Sidebar` | - | Responsive navigation with mobile drawer and theme toggle |
| `AuthGuard` | - | Route protection wrapper |
| `ErrorBoundary` | `fallback`, `onError` | React error boundary with fallback UI |
| `ThemeProvider` | - | Theme context provider, applies theme class to document |
| `ThemeToggle` | `variant` | Theme switcher (button or dropdown variant) |

#### Button Examples
```tsx
import { Button } from '@/components/ui/button';

// Standard button
<Button variant="primary" size="sm">Save</Button>

// With loading state
<Button isLoading>Saving...</Button>

// Icon button
<Button variant="ghost" size="sm" iconOnly leftIcon={<Plus />} />

// Danger action
<Button variant="danger" size="xs" leftIcon={<Trash />}>Delete</Button>
```

#### FormInput Examples
```tsx
import { FormInput } from '@/components/ui/form-input';

// Basic input
<FormInput label="Email" type="email" placeholder="you@example.com" />

// With icon and error
<FormInput
  label="Password"
  type="password"
  inputSize="md"
  leftIcon={<Lock />}
  error="Password is required"
/>
```

#### Alert Examples
```tsx
import { Alert } from '@/components/ui/alert';

// Error alert
<Alert variant="error">Invalid credentials</Alert>

// Success with title
<Alert variant="success" title="Saved">Company updated successfully</Alert>

// Compact variant
<Alert variant="info" compact>Processing...</Alert>
```

#### Modal & ConfirmDialog Examples
```tsx
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Basic modal
<Modal isOpen={isOpen} onClose={onClose} title="Edit Company">
  <ModalBody>Content here</ModalBody>
  <ModalFooter>
    <Button variant="secondary" onClick={onClose}>Cancel</Button>
    <Button variant="primary" onClick={onSave}>Save</Button>
  </ModalFooter>
</Modal>

// Delete confirmation with reason
<ConfirmDialog
  isOpen={isOpen}
  onClose={onClose}
  onConfirm={(reason) => handleDelete(reason)}
  title="Delete Company"
  description="This action cannot be undone."
  variant="danger"
  requireReason
  reasonMinLength={10}
/>
```

#### Dropdown Examples
```tsx
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@/components/ui/dropdown';

<Dropdown>
  <DropdownTrigger>Options</DropdownTrigger>
  <DropdownMenu>
    <DropdownItem icon={<Edit />} onClick={onEdit}>Edit</DropdownItem>
    <DropdownItem icon={<Trash />} destructive onClick={onDelete}>Delete</DropdownItem>
  </DropdownMenu>
</Dropdown>
```

#### Toast Examples
```tsx
import { useToast } from '@/components/ui/toast';

function MyComponent() {
  const { success, error, warning, info } = useToast();

  const handleSave = async () => {
    try {
      await saveData();
      success('Data saved successfully');
    } catch (err) {
      error('Failed to save data');
    }
  };
}
```

### Layout Guidelines

#### Sidebar
- Width: `224px` (expanded), `56px` (collapsed)
- Nav items: `13px` font, `8px` vertical padding
- Logo: `28px` icon, `14px` text
- Icons: `18px`

#### Page Content
- Main content: `ml-56` (224px left margin)
- Page padding: `p-4` to `p-6`
- Max content width: None (fluid)

#### Cards & Sections
- Card padding: `p-3` (compact) to `p-4` (standard)
- Section gaps: `space-y-4` to `space-y-6`
- Border radius: `4px` (default), `6px` (cards, large buttons)

---

## Module: Company Management

### Features

1. **Company CRUD Operations**
   - Create companies manually or via BizFile
   - View paginated list with search and filters
   - View detailed company information
   - Edit company details
   - Soft-delete with reason tracking

2. **BizFile Integration**
   - Upload BizFile PDF documents
   - AI-powered data extraction using OpenAI
   - Preview extracted data before saving
   - Automatic contact creation and linking

3. **Data Extracted from BizFile**
   - Entity details (UEN, name, type, status)
   - Former names with effective dates
   - SSIC activities (primary and secondary)
   - Registered and mailing addresses
   - Share capital structure
   - Officers (directors, secretary, CEO)
   - Shareholders with shareholding details
   - Charges and encumbrances
   - Auditor information
   - Compliance dates

4. **Contact Management**
   - Automatic contact creation from BizFile
   - Duplicate detection by ID number
   - Company-contact relationship linking

5. **Search & Filtering**
   - Full-text search across multiple fields
   - Filter by entity type, status
   - Filter by FYE month, charges

6. **Audit Trail**
   - All changes tracked with timestamps
   - Old/new value comparison
   - User and source attribution
   - Deletion reasons

### File Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx             # Dashboard layout with AuthGuard
│   │   └── companies/
│   │       ├── page.tsx           # Company list
│   │       ├── new/page.tsx       # Create company
│   │       ├── upload/page.tsx    # BizFile upload
│   │       └── [id]/
│   │           ├── page.tsx       # Company detail
│   │           ├── edit/page.tsx  # Edit company
│   │           └── audit/page.tsx # Audit history
│   ├── login/
│   │   └── page.tsx               # Login page
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts     # POST - Login
│       │   ├── logout/route.ts    # POST - Logout
│       │   └── me/route.ts        # GET - Current session
│       └── companies/
│           ├── route.ts           # List/Create
│           ├── stats/route.ts     # Statistics
│           └── [id]/
│               ├── route.ts       # Get/Update/Delete
│               ├── audit/route.ts # Audit history
│               └── documents/     # Document management
├── components/
│   ├── auth/
│   │   └── auth-guard.tsx         # Route protection
│   ├── error-boundary.tsx         # React error boundary
│   ├── ui/
│   │   ├── sidebar.tsx            # Responsive navigation sidebar
│   │   ├── button.tsx             # Reusable button
│   │   ├── form-input.tsx         # Form input with validation
│   │   ├── alert.tsx              # Alert/notification
│   │   ├── modal.tsx              # Accessible modal dialog
│   │   ├── confirm-dialog.tsx     # Confirmation with reason input
│   │   ├── dropdown.tsx           # Click-outside aware dropdown
│   │   ├── toast.tsx              # Toast notification system
│   │   └── theme-toggle.tsx       # Theme switcher component
│   ├── theme-provider.tsx         # Theme context provider
│   └── companies/
│       ├── company-table.tsx
│       ├── company-filters.tsx
│       └── pagination.tsx
├── hooks/
│   ├── use-auth.ts                # Auth hooks (useSession, useLogin, useLogout)
│   ├── use-companies.ts           # Company data hooks
│   ├── use-click-outside.ts       # Click outside detection
│   ├── use-local-storage.ts       # localStorage persistence
│   └── use-media-query.ts         # Responsive breakpoints
├── stores/
│   └── ui-store.ts                # Zustand UI state (sidebar, theme)
├── lib/
│   ├── prisma.ts                  # Database client
│   ├── auth.ts                    # JWT & session management
│   ├── audit.ts                   # Audit logging with request context
│   ├── tenant.ts                  # Multi-tenancy utilities
│   ├── request-context.ts         # Request context extraction
│   ├── utils.ts                   # Utility functions
│   └── validations/
│       ├── company.ts             # Company Zod schemas
│       ├── contact.ts             # Contact Zod schemas
│       ├── tenant.ts              # Tenant Zod schemas
│       └── audit.ts               # Audit log query schemas
└── services/
    ├── company.service.ts         # Company business logic (tenant-aware)
    ├── tenant.service.ts          # Tenant management
    ├── contact.service.ts         # Contact management
    └── bizfile.service.ts         # AI extraction
```

---

## Performance Optimizations

The application includes several optimizations for faster development and production builds:

### Build Optimizations

1. **Turbopack Dev Server** - Next.js 15 Turbopack for faster compilation
   ```bash
   npm run dev  # Uses --turbopack flag
   ```

2. **Lazy Loading Heavy Dependencies**
   - `openai` - Loaded only when BizFile extraction is triggered
   - `pdf-parse` - Loaded only when parsing PDF documents

   This reduces the initial bundle size and cold start time.

3. **Chakra UI Components** - Using Chakra primitives (Box, Input, Button) with tree-shakeable imports

4. **Code Splitting** - Automatic route-based code splitting via Next.js App Router

### Bundle Analysis

To analyze the bundle size:
```bash
npm run build
# Check the output for route sizes
```

Target first load JS for main routes: < 150kB

---

## Development

### Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run start            # Start production server
npm run lint             # Run linting

# Database
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema to database
npm run db:migrate       # Create migration
npm run db:studio        # Open Prisma Studio
npm run db:seed          # Seed database

# Docker
npm run docker:up        # Start containers
npm run docker:down      # Stop containers
npm run docker:logs      # View container logs
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | Required |
| JWT_SECRET | Secret for JWT signing | Required |
| JWT_EXPIRES_IN | Token expiration | 7d |
| OPENAI_API_KEY | OpenAI API key for extraction | Optional |
| UPLOAD_DIR | Directory for file uploads | ./uploads |
| MAX_FILE_SIZE | Max upload size in bytes | 10485760 |

---

## Troubleshooting

### Database Connection Issues

#### Port Conflict with Local PostgreSQL

If you have PostgreSQL installed locally and get authentication errors, the local instance may be intercepting connections on port 5432. The Docker configuration uses port `5433` to avoid this.

If you still have issues:
1. Verify Docker containers are running: `docker ps`
2. Check the `.env` file uses port `5433`
3. Or stop your local PostgreSQL service

#### Authentication Failed Error

If you see `P1000: Authentication failed against database server`:

1. Check if Docker containers are running:
```bash
docker ps --filter "name=oakcloud-postgres"
```

2. Verify database is accessible:
```bash
docker exec oakcloud-postgres psql -U oakcloud -d oakcloud -c "SELECT 1;"
```

3. Restart containers if needed:
```bash
npm run docker:down
npm run docker:up
```

#### Container Health Check

```bash
# View container logs
npm run docker:logs

# Check container status
docker ps
```

---

## Version History

### v0.2.0 (2025-12-01)
- **Multi-Tenancy**: Full tenant isolation with configurable limits
  - New Tenant model with status, plan, and limits
  - TenantId added to Company, Contact, Document, AuditLog
  - TENANT_ADMIN role for tenant-level management
  - Tenant-scoped queries with automatic filtering
  - User invitation system within tenants
  - Tenant statistics and usage tracking
- **Enhanced Audit Logging**: Comprehensive activity tracking
  - Request context capture (IP, user agent, request ID)
  - Expanded audit actions (login, logout, permissions, etc.)
  - Tenant-aware audit history
  - Audit statistics and reporting endpoints
  - Batch audit logging for related operations
- **API Endpoints**:
  - `/api/tenants` - Tenant CRUD (SUPER_ADMIN)
  - `/api/tenants/:id/users` - Tenant user management
  - `/api/tenants/:id/stats` - Tenant statistics
  - `/api/audit-logs` - Audit log queries
  - `/api/audit-logs/stats` - Audit statistics

### v0.1.5 (2025-12-01)
- **UX Improvement**: UEN and SSIC codes displayed as plain text instead of badge/code styling
- Cleaner, less cluttered appearance in company tables and detail pages

### v0.1.4 (2025-12-01)
- **Light/Dark Theme Support**: Implemented light mode as default with dark mode toggle
- Theme toggle in sidebar (desktop and mobile)
- Theme preference persisted to localStorage
- CSS variables for all colors, enabling easy theme switching
- Soft off-white light mode palette (less glaring than pure white)
- Improved collapsed sidebar layout (toggle button centered, no overflow)

### v0.1.3 (2025-12-01)
- **UI Consistency**: Standardized all buttons, inputs, and layout elements
- All buttons use `btn-sm` size class
- All inputs use `input input-sm` classes
- Consistent page padding, headers, and typography

### v0.1.2 (2025-12-01)
- **UI/UX Improvements**: Updated button and card styling
- Buttons use `rounded-lg`, cards use `rounded-xl`
- Improved badge font sizing and padding
- Status badges display proper labels

### v0.1.1 (2025-12-01)
- **Infrastructure Improvements**: Added essential UI components
- Modal, ConfirmDialog, Dropdown, Toast components
- ErrorBoundary for graceful error handling
- Mobile-responsive sidebar with drawer
- Route-level loading and error states
- JWT security fix (no fallback in production)

### v0.1.0 (Initial)
- Core Company Management module
- Authentication with JWT
- BizFile PDF upload and AI extraction
- Audit logging

---

## License

Private - Internal use only.
