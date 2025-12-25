# Oakcloud - Practice Management System

A modular internal management system designed for accounting practices. Clean, efficient, and runs completely locally.

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Security](#security)
- [Module: Company Management](#module-company-management)
- [Module: Contact Management](#module-contact-management)
- [Module: Document Generation](#module-document-generation)
- [Module: Document Processing](#module-document-processing)
- [Version History](#version-history) | [Full Changelog](./CHANGELOG.md)

**Related Documentation:**
- [Design Guidelines](./DESIGN_GUIDELINE.md) - UI components, styling, and design system
- [RBAC Guidelines](./RBAC_GUIDELINE.md) - Role-based access control implementation
- [Changelog](./CHANGELOG.md) - Version history and release notes

---

## Overview

Oakcloud is a local-first, modular system for managing accounting practice operations. The system is built with a focus on:

- **Modularity**: Each feature is a separate module that can be developed and deployed independently
- **Local-first**: All data stays on your infrastructure, no external API dependencies
- **Clean Design**: Linear.app-inspired theme with light/dark mode support
- **Efficiency**: Fast, responsive UI with optimized database queries

### Core Modules (Planned)

1. ✅ **Company Management** - Manage companies, BizFile uploads, compliance tracking
2. ✅ **Contact Management** - Individual and corporate contacts with company linking
3. ✅ **Authentication** - JWT-based authentication with role-based access
4. ✅ **Multi-Tenancy** - Full tenant isolation with configurable limits
5. ✅ **Audit Logging** - Comprehensive activity tracking with request context
6. ✅ **RBAC & Permissions** - Fine-grained role-based access control
7. ✅ **User Management** - User accounts, invitations, multi-company assignments
8. ✅ **Password Management** - Secure reset flow, force change on first login
9. ✅ **Data Purge** - Permanent deletion of soft-deleted records (SUPER_ADMIN)
10. ✅ **Backup & Restore** - Per-tenant backup of database and files (SUPER_ADMIN)
11. ✅ **Email Notifications** - SMTP-based transactional emails (invitations, password reset)
11. ✅ **Connectors Hub** - External service integrations (AI providers, storage)
12. ✅ **Document Generation** - Templates, PDF export, sharing, comments, workflow integration
13. ✅ **Document Processing** - AI-powered ingestion, extraction, revisions, duplicate detection
14. 🔜 **Bank Reconciliation** - Bank transaction matching, multi-currency support
15. 🔜 **Client Portal** - Client access, document requests, communications
16. 🔜 **Accounting Integration** - Xero, QuickBooks, MYOB connectors
17. 🔜 **Module Marketplace** - Browse and install modules
18. 🔜 **Module Linking** - Configure module relationships
19. 🔜 **SuperAdmin Dashboard** - System administration

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
| Prisma | 7.x | ORM with driver adapters (`@prisma/adapter-pg`) |
| @prisma/adapter-pg | 7.x | PostgreSQL driver adapter with connection pooling |
| Next.js API Routes | 15.x | Backend API |
| JWT (jose) | 6.x | Authentication |
| @noble/hashes | 2.x | Cryptography (Argon2id, BLAKE3, SHA-512) |
| bcryptjs | 2.x | Legacy password hashing (migration support) |
| Nodemailer | 6.x | Email sending (SMTP) |
| OpenAI | 4.x | AI extraction - GPT models (lazy loaded) |
| Anthropic | 0.x | AI extraction - Claude models (lazy loaded) |
| Google Generative AI | 0.x | AI extraction - Gemini models (lazy loaded) |
| pdf-lib | 1.x | PDF metadata extraction (server-side) |
| pdfjs-dist | 5.x | PDF rendering (client-side) |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Docker Compose | Container orchestration |
| PostgreSQL | Database container |
| Redis | Cache/sessions (optional) |
| MinIO | S3-compatible object storage |
| @aws-sdk/client-s3 | AWS S3 client for storage operations |

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

3. **Start infrastructure containers:**
```bash
npm run docker:up
```

This will automatically create:
- PostgreSQL database named `oakcloud` (port 5433)
- User `oakcloud` with password `oakcloud_password`
- Redis instance for caching (port 6379)
- MinIO object storage (S3 API: port 9000, Web Console: port 9001)

> **Note:** The Docker PostgreSQL runs on port `5433` to avoid conflicts with local PostgreSQL installations.

**MinIO Console:** Access at http://localhost:9001 with credentials `oakcloud` / `oakcloud_minio_secret`

4. **Initialize database:**
```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database (creates tables)
npm run db:seed       # Seed with sample data
```

> **Important:** The seed script is idempotent and can be run multiple times safely. It creates a default tenant and assigns all sample data to it.

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

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `admin@oakcloud.local` | `admin123` |

> **Security:** Change this password in production!

The minimal seed creates only the SUPER_ADMIN user. Use this account to create tenants, users, and companies through the Admin dashboard.

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
| formerName | String? | Previous company name (if changed) |
| dateOfNameChange | DateTime? | Date when name was changed |
| entityType | Enum | PRIVATE_LIMITED, PUBLIC_LIMITED, etc. |
| status | Enum | LIVE, STRUCK_OFF, etc. |
| statusDate | DateTime? | Date when status became effective |
| incorporationDate | DateTime | Date of incorporation |
| dateOfAddress | DateTime? | Date when registered address became effective |
| primarySsicCode | String | Primary business activity code |
| financialYearEndMonth | Int | FYE month (1-12) |
| fyeAsAtLastAr | DateTime? | Financial year end as at last annual return |
| homeCurrency | String | Company's home currency (default: SGD) |
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
| entityName | String | Human-readable name of the affected entity |
| summary | String | Human-readable description of the action |
| changes | JSON | Old/new value pairs |
| reason | String | User-provided reason for the action |
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
| maxUsers | Int | Maximum allowed users (default: 50) |
| maxCompanies | Int | Maximum allowed companies (default: 100) |
| maxStorageMb | Int | Storage limit in MB (default: 10GB) |
| settings | JSON | Tenant-specific configuration |

#### Role (RBAC)
Role-based access control for fine-grained permissions.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| tenantId | UUID | Owning tenant (nullable for global roles) |
| name | String | Role name (unique per tenant) |
| description | String | Role description |
| isSystem | Boolean | System role (cannot be deleted) |
| systemRoleType | String | System role identifier: SUPER_ADMIN, TENANT_ADMIN, or null |

#### Permission
Permission definitions for RBAC.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| resource | String | Resource name (company, document, user, etc.) |
| action | String | Action type (create, read, update, delete, export, manage) |
| description | String | Permission description |

#### UserRoleAssignment
Links users to roles with optional company scope.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | UUID | Assigned user |
| roleId | UUID | Assigned role |
| companyId | UUID | Optional company scope (null = tenant-wide) |

#### UserCompanyAssignment
Multi-company user access with granular permissions.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | UUID | Assigned user |
| companyId | UUID | Assigned company |
| accessLevel | Enum | VIEW, EDIT, MANAGE |
| isPrimary | Boolean | Whether this is user's primary company |

---

## Multi-Tenancy

Oakcloud supports full multi-tenancy with tenant-level data isolation, RBAC, and configurable limits.

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

Roles are managed via `UserRoleAssignment` records. System roles have a `systemRoleType` field:

| System Role Type | Scope | Permissions |
|------------------|-------|-------------|
| `SUPER_ADMIN` | System-wide | Full access to all tenants and system settings |
| `TENANT_ADMIN` | Tenant | Manage tenant settings, users, roles, and all companies |
| Custom roles | Company | Configured via role permissions (Company Admin, Company User, etc.) |

Session includes computed flags `isSuperAdmin` and `isTenantAdmin` derived from role assignments.

### Tenant Limits

Each tenant has configurable limits:

- **maxUsers**: Maximum number of users (default: 50)
- **maxCompanies**: Maximum number of companies (default: 100)
- **maxStorageMb**: Storage quota in MB (default: 10GB)

Limits are enforced at the service layer before creating new resources.

### Tenant Lifecycle

1. **Creation** (`PENDING_SETUP`): SUPER_ADMIN creates tenant via Admin > Tenants
2. **Setup Wizard**: 4-step wizard guides through initial configuration:
   - Step 1: Review/update tenant information (name, contact, address)
   - Step 2: Create first TENANT_ADMIN user
   - Step 3: Optionally create first company
   - Step 4: Review and activate
3. **Activation** (`ACTIVE`): Setup completion activates the tenant
4. **Suspension** (`SUSPENDED`): SUPER_ADMIN can suspend for compliance/billing
5. **Deletion** (`DEACTIVATED`): Tenant must be SUSPENDED or PENDING_SETUP to be deleted
   - Cascade soft-deletes all users, companies, and contacts
   - Deleted data appears in Data Purge page for permanent removal
6. **Permanent Purge**: SUPER_ADMIN can permanently delete from Data Purge page

### Key Features

1. **Data Isolation**: All queries are automatically scoped to the user's tenant
2. **Tenant-aware Authentication**: Session includes tenant context
3. **RBAC**: Fine-grained role-based access control with custom roles
4. **Tenant Suspension**: Suspended tenants prevent user login
5. **Audit Trail**: All actions tracked with tenant context
6. **Setup Wizard**: Guided onboarding for new tenants with admin user creation
7. **SUPER_ADMIN Cross-Tenant Access**: Centralized tenant selector in sidebar for SUPER_ADMIN users to switch tenant context (persisted to localStorage)

---

## RBAC (Role-Based Access Control)

Oakcloud implements fine-grained role-based access control for managing permissions.

### Permission Model

Permissions are defined as `resource:action` combinations:

**Resources:**
- `tenant` - Tenant settings
- `user` - User management
- `role` - Role management
- `company` - Company data
- `contact` - Contact records
- `document` - Documents
- `officer` - Company officers
- `shareholder` - Shareholders
- `audit_log` - Audit logs

**Actions:**
- `create` - Create new records
- `read` - View records
- `update` - Modify records
- `delete` - Remove records
- `export` - Export data
- `import` - Import data
- `manage` - Full control (implies all actions)

### Company-Specific Role Assignments

Users can have different roles for different companies, enabling granular control:

| User  | Company       | Role        |
|-------|---------------|-------------|
| John  | All Companies | Data Viewer |
| John  | Company A     | Data Clerk  |
| John  | Company B     | Auditor     |

**Specificity Priority**: Company-specific roles **override** "All Companies" roles.

When John accesses Company A:
1. System checks: Any role assigned specifically for Company A? → Yes: Data Clerk
2. Uses Data Clerk permissions only (not combined with Data Viewer)

When John accesses Company C (no specific assignment):
1. System checks: Any role for Company C? → No
2. Falls back to "All Companies" role → Data Viewer

### Special Roles (systemRoleType)

System roles are identified by the `systemRoleType` field in the Role model:

| systemRoleType | Scope | UI Access | Description |
|----------------|-------|-----------|-------------|
| `SUPER_ADMIN` | System-wide | Tenants, Users, Roles, Audit Logs, Data Purge | Global role (tenantId = null), bypasses all permission checks |
| `TENANT_ADMIN` | Tenant | Users, Roles, Audit Logs | Full access within tenant, auto-access to all companies |
| `COMPANY_ADMIN` | Company | Companies, Contacts, Documents | Manage assigned company and its data |
| `COMPANY_USER` | Company | Companies (read-only) | View-only access to assigned company |
| `null` | Configurable | Based on permissions | Custom role with fine-grained permissions |

**Important**: The `systemRoleType` field is set when creating system roles via `createSystemRolesForTenant()`. Custom roles have `systemRoleType = null`.

### System Roles

When a tenant is created, three system roles are automatically provisioned:

#### Tenant Admin
Full access to all tenant resources:
- Manage users, roles, companies
- Access all company data automatically (no explicit company assignment needed)
- View audit logs and export data

#### Company Admin
Manage assigned company:
- Read/update company information
- Manage contacts, officers, shareholders
- Upload and manage documents
- View audit logs

#### Company User
View-only access to assigned company:
- Read company information
- View contacts, officers, shareholders
- View documents and audit logs

### Custom Roles

Tenant admins can create, edit, and delete custom roles with specific permissions through the **Admin > Roles & Permissions** page.

**Features:**
- Create new roles with custom permission sets
- Edit existing custom roles (name, description, permissions)
- Delete unused custom roles (only if no users are assigned)
- Duplicate existing roles as a starting point
- System roles (Tenant Admin, Company Admin, Company User) cannot be modified or deleted

**UI Features:**
- Expandable role cards showing all permissions grouped by resource
- Permission selector with "Select All" and "Clear All" options
- Toggle individual permissions or entire resource groups
- Visual indicators for selected permissions
- **SUPER_ADMIN tenant context**: SUPER_ADMIN users select a tenant from the sidebar button to view/manage their roles

```typescript
// Example: Create a custom "Auditor" role via API
await fetch('/api/tenants/:tenantId/roles', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Auditor',
    description: 'Read-only access to audit logs and company data',
    permissions: ['permission-id-1', 'permission-id-2', ...]
  })
});
```

### Default Custom Roles

The following custom roles are automatically seeded and ready for use:

| Role | Permissions | Use Case |
|------|-------------|----------|
| **Auditor** | 7 (read + export audit logs) | Compliance review, read-only access |
| **Data Entry Clerk** | 15 (create/read/update) | Data input staff, no delete or export |
| **Report Viewer** | 12 (read + export) | Reporting and analytics users |
| **Document Manager** | 10 (full document control) | Document specialists |
| **Manager** | 27 (full data access) | Team leads without admin privileges |

These roles can be customized or deleted if not needed. New tenants receive these roles automatically during setup.

### Company-Scoped Roles

Roles can be assigned at:
- **Tenant level**: Access to all companies in the tenant
- **Company level**: Access only to the specific company

```typescript
// Tenant-wide role assignment
await assignRoleToUser(userId, roleId);

// Company-specific role assignment
await assignRoleToUser(userId, roleId, companyId);
```

### Permission Checking

```typescript
import { hasPermission, requirePermission } from '@/lib/rbac';

// Check if user has permission
const canEdit = await hasPermission(userId, 'company', 'update', companyId);

// Require permission (throws if denied)
await requirePermission(session, 'company', 'update', companyId);
```

### RBAC Utilities (`src/lib/rbac.ts`)

| Function | Description |
|----------|-------------|
| `hasPermission()` | Check if user has a specific permission |
| `hasAnyPermission()` | Check if user has any of the specified permissions |
| `hasAllPermissions()` | Check if user has all specified permissions |
| `requirePermission()` | Require permission (throws on denial) |
| `getUserPermissions()` | Get all permissions for a user |
| `getTenantRoles()` | Get all roles for a tenant |
| `assignRoleToUser()` | Assign a role to a user |
| `removeRoleFromUser()` | Remove a role from a user |
| `createSystemRolesForTenant()` | Initialize system roles for new tenant |

> **For detailed implementation guidelines**, see [RBAC_GUIDELINE.md](./RBAC_GUIDELINE.md)

---

## Centralized Constants (`src/lib/constants.ts`)

Application enums and constants are centralized for maintainability. **Keep these in sync with Prisma schema enums.**

### Available Constants

| Constant | Description |
|----------|-------------|
| `OFFICER_ROLES` | Officer role options (Director, Secretary, CEO, etc.) |
| `SHAREHOLDER_TYPES` | Shareholder types (Individual, Corporate) |
| `IDENTIFICATION_TYPES` | ID types (NRIC, FIN, Passport, UEN, Other) |
| `CONTACT_TYPES` | Contact types (Individual, Corporate) |
| `COMPANY_STATUSES` | Company status options |
| `ENTITY_TYPES` | Entity types (Local Company, LLP, etc.) |
| `SHARE_CLASSES` | Common share classes (Ordinary, Preference, etc.) |

### Usage

```typescript
import { OFFICER_ROLES, getOfficerRoleLabel } from '@/lib/constants';

// Use in dropdowns
<select>
  {OFFICER_ROLES.map((role) => (
    <option key={role.value} value={role.value}>{role.label}</option>
  ))}
</select>

// Get display label
getOfficerRoleLabel('ALTERNATE_DIRECTOR'); // "Alternate Director"
```

### Adding New Values

1. Update the Prisma schema enum in `prisma/schema.prisma`
2. Run `npm run db:generate` to regenerate Prisma client
3. Add the new value to the corresponding constant in `src/lib/constants.ts`

---

## Audit Logging

Comprehensive audit logging tracks all changes, user actions, and system events.

### Tracked Actions

| Category | Actions |
|----------|---------|
| CRUD | CREATE, UPDATE, DELETE, RESTORE |
| Documents | UPLOAD, DOWNLOAD, EXTRACT |
| Authentication | LOGIN, LOGOUT, LOGIN_FAILED, PASSWORD_CHANGED, PASSWORD_RESET_REQUESTED, PASSWORD_RESET_COMPLETED, PASSWORD_CHANGE_REQUIRED, PASSWORD_CHANGE_CLEARED |
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

// Log a creation (with entity name for human-readable summary)
await logCreate(auditContext, 'Company', company.id, company.name, { uen: company.uen });

// Log an update with changes
await logUpdate(auditContext, 'Company', company.id, company.name, changes, 'Updated by user request');

// Log a deletion with reason
await logDelete(auditContext, 'Company', company.id, company.name, 'No longer a client');
```

### Human-Readable Summaries

All audit log entries include automatically generated summaries:

```typescript
// Example summaries generated:
"Created company 'Acme Pte Ltd'"
"Updated company 'Acme Pte Ltd'"
"Deleted tenant 'Demo Corp' (cascade: 5 users, 3 companies)"
"Invited user 'John Doe' with role Company Admin"
"User 'admin@example.com' logged in"
```

### Specialized Logging Functions

```typescript
// User membership changes
await logUserMembership(context, 'USER_INVITED', userId, {
  email: 'user@example.com',
  firstName: 'John',
  lastName: 'Doe',
  roleAssignments: [{ roleName: 'Company Admin', companyName: 'Acme Pte Ltd' }]
});

// Tenant operations (with cascade info)
await logTenantOperation('TENANT_DELETED', tenantId, 'Acme Corp', userId, undefined, 'Account closure');
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

#### Bulk Delete Companies
```
DELETE /api/companies/bulk
Content-Type: application/json

{
  "ids": ["uuid1", "uuid2", "uuid3"],
  "reason": "Companies no longer active clients - annual cleanup"
}
```

Response:
```json
{
  "success": true,
  "deleted": 3,
  "message": "Successfully deleted 3 companies"
}
```

Notes:
- Maximum 100 companies per request
- All companies must belong to user's tenant
- Reason must be at least 10 characters
- Performs soft delete with audit logging for each company

#### Link/Unlink Officer to Contact
```
PATCH /api/companies/:id/officers/:officerId
Content-Type: application/json

// Link officer to a contact
{
  "contactId": "contact-uuid"
}

// Unlink officer from contact
{
  "contactId": null
}
```

Response:
```json
{
  "success": true,
  "action": "linked"  // or "unlinked"
}
```

#### Link/Unlink Shareholder to Contact
```
PATCH /api/companies/:id/shareholders/:shareholderId
Content-Type: application/json

// Link shareholder to a contact
{
  "contactId": "contact-uuid"
}

// Unlink shareholder from contact
{
  "contactId": null
}
```

Response:
```json
{
  "success": true,
  "action": "linked"  // or "unlinked"
}
```

#### Remove Officer (Mark as Ceased)
```
DELETE /api/companies/:id/officers/:officerId
```

Response:
```json
{
  "success": true
}
```

Marks the officer as ceased (`isCurrent: false`) with cessation date set to today if not already set. Recalculates are not needed for officers.

#### Remove Shareholder (Mark as Former)
```
DELETE /api/companies/:id/shareholders/:shareholderId
```

Response:
```json
{
  "success": true
}
```

Marks the shareholder as former (`isCurrent: false`) and recalculates percentage held for all remaining current shareholders.

**Note:** Officer/shareholder address and nationality displayed on the Company detail page are sourced from the linked Contact record when available, falling back to the officer/shareholder's own stored data if no contact is linked.

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

#### Preview BizFile Diff (Update Mode)
```
POST /api/documents/:documentId/preview-diff
```

Extracts data from a BizFile document and compares it against the existing company data without saving changes. Includes officer and shareholder differences.

Response:
```json
{
  "extractedData": { ... },
  "diff": {
    "hasDifferences": true,
    "differences": [
      {
        "field": "status",
        "label": "Company Status",
        "oldValue": "LIVE",
        "newValue": "STRUCK_OFF",
        "category": "entity"
      }
    ],
    "existingCompany": {
      "name": "Acme Pte Ltd",
      "uen": "202012345A"
    },
    "officerDiffs": [
      {
        "type": "added",
        "name": "John Smith",
        "role": "DIRECTOR",
        "matchConfidence": "low",
        "extractedData": { ... }
      },
      {
        "type": "potentially_ceased",
        "officerId": "uuid",
        "name": "Jane Doe",
        "role": "DIRECTOR",
        "matchConfidence": "high"
      }
    ],
    "shareholderDiffs": [
      {
        "type": "updated",
        "shareholderId": "uuid",
        "name": "Investor Pte Ltd",
        "shareholderType": "CORPORATE",
        "shareholdingChanges": {
          "numberOfShares": { "old": 1000, "new": 2000 }
        },
        "matchConfidence": "high"
      },
      {
        "type": "removed",
        "shareholderId": "uuid",
        "name": "Old Shareholder",
        "shareholderType": "INDIVIDUAL"
      }
    ],
    "summary": {
      "officersAdded": 1,
      "officersUpdated": 0,
      "officersPotentiallyCeased": 1,
      "shareholdersAdded": 0,
      "shareholdersUpdated": 1,
      "shareholdersRemoved": 1
    }
  },
  "companyUpdatedAt": "2024-01-15T10:30:00.000Z",
  "aiMetadata": {
    "model": "gpt-4.1",
    "promptTokens": 1500,
    "completionTokens": 800
  }
}
```

The `companyUpdatedAt` field is used for concurrent update detection (optimistic locking). Pass it back as `expectedUpdatedAt` when calling apply-update.

Officer Diff Types:
- `added` - New officer from BizFile
- `updated` - Existing officer with changed details (role)
- `potentially_ceased` - Officer exists in DB but not in BizFile (user should provide cessation date or mark as "To-follow-up")

Shareholder Diff Types:
- `added` - New shareholder from BizFile
- `updated` - Existing shareholder with changed shareholding (shares, class)
- `removed` - Shareholder exists in DB but not in BizFile (will be marked as historical)

#### Apply Selective BizFile Update
```
POST /api/documents/:documentId/apply-update
Content-Type: application/json

{
  "companyId": "uuid",
  "extractedData": { ... },
  "officerActions": [
    {
      "officerId": "uuid",
      "action": "cease",
      "cessationDate": "2024-01-15"
    },
    {
      "officerId": "uuid2",
      "action": "follow_up"
    }
  ],
  "expectedUpdatedAt": "2024-01-15T10:30:00.000Z"
}
```

Applies only changed fields from BizFile extraction to the existing company, including officers and shareholders. Creates cleaner audit logs by only logging actual changes.

Request Body:
- `companyId` - The company ID to update
- `extractedData` - The extracted BizFile data from preview
- `officerActions` - Optional actions for potentially ceased officers:
  - `action: "cease"` - Mark officer as ceased with cessation date
  - `action: "follow_up"` - Skip this officer (mark for manual follow-up)
- `expectedUpdatedAt` - Optional ISO timestamp from preview-diff for concurrent update detection

Response:
```json
{
  "success": true,
  "companyId": "uuid",
  "updatedFields": ["status", "primarySsicDescription", "lastArFiledDate"],
  "officerChanges": {
    "added": 1,
    "updated": 0,
    "ceased": 1,
    "followUp": 0
  },
  "shareholderChanges": {
    "added": 0,
    "updated": 1,
    "removed": 1
  },
  "message": "Updated: 3 company field(s); Officers: 1 added, 1 ceased; Shareholders: 1 updated, 1 removed",
  "concurrentUpdateWarning": "This company was modified by another user at 2024-01-15T10:35:00.000Z. Your changes may overwrite their updates."
}
```

Notes:
- Only updates fields that have actually changed
- Officers are matched by identification (NRIC/FIN) or name + role
- Shareholders are matched by identification or name
- Shareholder percentages are automatically recalculated
- Creates separate audit logs for company, officer, and shareholder changes
- UEN must match an existing company owned by the tenant
- If `expectedUpdatedAt` is provided and the company was modified since preview, `concurrentUpdateWarning` is returned but the update still proceeds

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
    "isSuperAdmin": true,
    "isTenantAdmin": false,
    "tenantId": null
  },
  "mustChangePassword": false,
  "message": "Login successful"
}
```

Sets `auth-token` cookie (httpOnly, 7 days expiry).

> **Note:** If `mustChangePassword` is `true`, the user must change their password before accessing the application. Redirect to `/change-password?forced=true`.

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
    "isSuperAdmin": true,
    "isTenantAdmin": false,
    "tenantId": null,
    "companyIds": []
  }
}
```

Returns 401 if not authenticated.

#### Forgot Password
```
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

Response (always returns success to prevent email enumeration):
```json
{
  "success": true,
  "message": "If an account exists with this email, you will receive a password reset link."
}
```

> **Development Mode:** Returns `resetToken` and `resetUrl` for testing.

#### Reset Password
```
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "reset-token-from-email",
  "password": "newSecurePassword123",
  "confirmPassword": "newSecurePassword123"
}
```

Password requirements: 8+ characters, at least one uppercase, lowercase, and number.

#### Change Password (Authenticated)
```
POST /api/auth/change-password
Content-Type: application/json

{
  "currentPassword": "oldPassword",
  "newPassword": "newSecurePassword123",
  "confirmPassword": "newSecurePassword123"
}
```

Requires authentication. Used for voluntary password changes or forced password changes after first login.

### Tenants (SUPER_ADMIN Only)

#### List Tenants
```
GET /api/tenants
```

Query Parameters:
- `query` - Search term (name, slug, email)
- `status` - Filter by status (ACTIVE, SUSPENDED, etc.)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `sortBy` - Sort field (name, createdAt, status)
- `sortOrder` - asc or desc (default: desc)

#### Create Tenant
```
POST /api/tenants
Content-Type: application/json

{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "contactEmail": "admin@acme.com",
  "maxUsers": 50,
  "maxCompanies": 100
}
```

Note: System roles (Tenant Admin, Company Admin, Company User) are automatically created for new tenants.

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
  "maxUsers": 100
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

#### Delete Tenant (Soft Delete with Cascade)
```
DELETE /api/tenants/:id
Content-Type: application/json

{
  "reason": "Tenant requested account closure"
}
```

Requirements:
- Tenant must be in `SUSPENDED` or `PENDING_SETUP` status before deletion
- Reason must be at least 10 characters

Behavior:
- Cascade soft-deletes all users (sets `deletedAt`, `isActive: false`)
- Cascade soft-deletes all companies (sets `deletedAt`, adds deletion reason)
- Cascade soft-deletes all contacts (sets `deletedAt`)
- Sets tenant status to `DEACTIVATED`
- Audit log includes cascade counts

Note: Soft-deleted data can be restored or permanently purged via `/api/admin/purge`.

#### Restore Soft-Deleted Records
```
PATCH /api/admin/purge
Content-Type: application/json

{
  "entityType": "tenant",  // tenant, user, company, or contact
  "entityIds": ["uuid1", "uuid2"]
}
```

Response:
```json
{
  "success": true,
  "message": "Restored 2 tenant(s)",
  "restoredCount": 2,
  "restoredRecords": [
    { "id": "uuid1", "name": "Tenant A" },
    { "id": "uuid2", "name": "Tenant B" }
  ]
}
```

Restore behavior by entity type:
- **Tenant**: Cascade restore - restores tenant + all associated users, companies, contacts
  - Tenant restored to `SUSPENDED` status (admin must activate)
  - Users restored with `isActive: false` (admin must activate individually)
  - Companies and contacts restored to normal state
- **User**: Restored with `isActive: false` (admin must activate)
- **Company**: Restored to normal state
- **Contact**: Restored to normal state

Note: Users, companies, and contacts cannot be restored individually if their parent tenant is still deleted. Restore the tenant first (which will cascade restore all associated data).

#### Complete Tenant Setup (Wizard)
```
POST /api/tenants/:id/setup
Content-Type: application/json

{
  "tenantInfo": {
    "name": "Updated Name",
    "contactEmail": "admin@acme.com",
    "contactPhone": "+65 6123 4567"
  },
  "adminUser": {
    "email": "admin@acme.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "firstCompany": {
    "uen": "202312345A",
    "name": "Acme Pte Ltd",
    "entityType": "PRIVATE_LIMITED"
  }
}
```

Response:
```json
{
  "tenant": {
    "id": "uuid",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "status": "ACTIVE"
  },
  "adminUser": {
    "id": "uuid",
    "email": "admin@acme.com",
    "firstName": "John",
    "lastName": "Doe",
    "temporaryPassword": "abc123XYZ" // Only in development
  },
  "company": {
    "id": "uuid",
    "uen": "202312345A",
    "name": "Acme Pte Ltd"
  }
}
```

Notes:
- Only available for tenants in `PENDING_SETUP` status
- `tenantInfo` is optional - updates tenant details if provided
- `firstCompany` is optional - can be `null` to skip company creation
- On success, tenant status changes to `ACTIVE`
- Admin user is created with `mustChangePassword: true`

### Tenant Users

#### List Tenant Users
```
GET /api/tenants/:id/users
```

Query Parameters:
- `query` - Search term (name, email)
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
  "roleAssignments": [  // Required - at least one role assignment
    {
      "roleId": "role-uuid",
      "companyId": "uuid1"  // null for tenant-wide assignment
    }
  ]
}
```

Response:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@acme.com",
    "firstName": "John",
    "lastName": "Doe",
    "roleAssignments": [
      {
        "id": "assignment-uuid",
        "roleId": "role-uuid",
        "companyId": "uuid1",
        "role": { "name": "Company Admin", "systemRoleType": null }
      }
    ]
  },
  "temporaryPassword": "abc123XYZ"  // Only in development
}
```

**UI Behavior:**
- **SUPER_ADMIN**: Can check "Make Tenant Admin" checkbox to grant full tenant access (hides role picker)
- **TENANT_ADMIN**: Must assign at least one role via the role assignments section

> **Note:** Invited users have `mustChangePassword: true` by default and will be prompted to change their password on first login.

#### Get User Details
```
GET /api/tenants/:id/users/:userId
```

Response includes user details, company assignments, and role assignments.

#### Update User
```
PATCH /api/tenants/:id/users/:userId
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@acme.com",
  "isActive": true,
  "sendPasswordReset": true  // Optional - sends password reset email
}
```

Notes:
- Email must be unique across all users
- `sendPasswordReset` triggers a password reset email
- Role changes are managed via role assignment APIs, not this endpoint

#### Remove User from Tenant
```
DELETE /api/tenants/:id/users/:userId
Content-Type: application/json

{
  "reason": "User requested account deletion"
}
```

Notes:
- Cannot remove yourself
- Cannot remove the last tenant admin
- Performs soft delete (can be restored from Data Purge)

### User Company Assignments

Users can be assigned to multiple companies with different access levels.

#### List User's Company Assignments
```
GET /api/users/:id/companies
```

Response:
```json
{
  "assignments": [
    {
      "id": "uuid",
      "userId": "uuid",
      "companyId": "uuid",
      "accessLevel": "EDIT",
      "isPrimary": true,
      "company": {
        "id": "uuid",
        "name": "Company Name",
        "uen": "202012345A"
      }
    }
  ]
}
```

#### Assign User to Company
```
POST /api/users/:id/companies
Content-Type: application/json

{
  "companyId": "uuid",
  "roleId": "role-uuid",  // Optional: Role to assign for this company
  "isPrimary": false
}
```

This creates:
- A `UserCompanyAssignment` (grants access to company)
- A `UserRoleAssignment` if roleId provided (grants permissions for that company)

#### Update Company Assignment
```
PATCH /api/users/:id/companies
Content-Type: application/json

{
  "assignmentId": "uuid",
  "isPrimary": true
}
```

#### Remove Company Assignment
```
DELETE /api/users/:id/companies
Content-Type: application/json

{
  "assignmentId": "uuid"
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

### Roles Management

#### Get All Permissions
```
GET /api/permissions
```

Response:
```json
{
  "resources": ["tenant", "user", "role", "company", ...],
  "actions": ["create", "read", "update", "delete", ...],
  "grouped": {
    "company": [
      { "id": "uuid", "action": "create", "description": "Create companies" },
      { "id": "uuid", "action": "read", "description": "View companies" },
      ...
    ],
    ...
  },
  "permissions": [...]
}
```

#### List Tenant Roles
```
GET /api/tenants/:id/roles
```

Returns all roles for the tenant including system and custom roles with permission details.

#### Create Role
```
POST /api/tenants/:id/roles
Content-Type: application/json

{
  "name": "Auditor",
  "description": "Read-only access to audit logs",
  "permissions": ["permission-id-1", "permission-id-2"]
}
```

Notes:
- Name must be 2-50 characters
- Name must be unique within the tenant
- Permissions array contains permission IDs (from GET /api/permissions)

#### Get Role Details
```
GET /api/tenants/:id/roles/:roleId
```

#### Update Role
```
PATCH /api/tenants/:id/roles/:roleId
Content-Type: application/json

{
  "name": "Senior Auditor",
  "description": "Updated description",
  "permissions": ["permission-id-1", "permission-id-2", "permission-id-3"]
}
```

Notes:
- System roles cannot be modified
- Permissions array replaces all existing permissions

#### Delete Role
```
DELETE /api/tenants/:id/roles/:roleId
```

Notes:
- System roles cannot be deleted
- Roles with assigned users cannot be deleted

#### Duplicate Role
```
POST /api/tenants/:id/roles/:roleId/duplicate
Content-Type: application/json

{
  "name": "Auditor (Copy)"
}
```

Creates a new role with the same permissions as the source role.

#### List Users Assigned to Role
```
GET /api/tenants/:id/roles/:roleId/users
```

Response:
```json
{
  "users": [
    {
      "id": "uuid",
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "isActive": true
      },
      "company": {
        "id": "uuid",
        "name": "Acme Pte Ltd",
        "uen": "202012345A"
      }
    }
  ]
}
```

#### Assign Role to User
```
POST /api/tenants/:id/roles/:roleId/users
Content-Type: application/json

{
  "userId": "uuid",
  "companyId": "uuid"  // Optional - for company-scoped assignment
}
```

#### Remove Role from User
```
DELETE /api/tenants/:id/roles/:roleId/users
Content-Type: application/json

{
  "userId": "uuid",
  "companyId": "uuid"  // Optional - must match original assignment
}
```

### Data Purge (SUPER_ADMIN Only)

#### Get Purgeable Records
```
GET /api/admin/purge
```

Response:
```json
{
  "stats": {
    "tenants": 2,
    "users": 5,
    "companies": 3,
    "contacts": 10
  },
  "records": {
    "tenants": [
      {
        "id": "uuid",
        "name": "Deleted Tenant",
        "slug": "deleted-tenant",
        "deletedAt": "2025-01-15T10:30:00Z",
        "_count": { "users": 2, "companies": 1 }
      }
    ],
    "users": [...],
    "companies": [...],
    "contacts": [...]
  }
}
```

#### Permanently Delete Records
```
POST /api/admin/purge
Content-Type: application/json

{
  "entityType": "tenant",  // tenant, user, company, or contact
  "entityIds": ["uuid1", "uuid2"],
  "reason": "Data retention policy - records older than 2 years"
}
```

Response:
```json
{
  "success": true,
  "message": "Permanently deleted 2 tenant(s)",
  "deletedCount": 2,
  "deletedRecords": [
    { "id": "uuid1", "name": "Tenant A" },
    { "id": "uuid2", "name": "Tenant B" }
  ]
}
```

Notes:
- Only soft-deleted records can be permanently deleted
- Reason must be at least 10 characters
- Deleting a tenant also removes all related data (users, companies, documents, audit logs)
- All purge actions are logged in the audit trail

### Backup & Restore (SUPER_ADMIN Only)

Full per-tenant backup and restore functionality including database data and all S3/MinIO files.

**Storage Format:**
- Database data is exported as JSON and **gzip compressed** (typically 75-85% size reduction)
- Files are stored at `backups/{backupId}/data.json.gz`
- Compression uses gzip level 6 (balanced speed/size)
- BLAKE3 checksum verifies data integrity (hash of uncompressed data)

#### List Backups
```
GET /api/admin/backup
```

Query Parameters:
- `tenantId` - Filter by tenant
- `status` - Filter by status (PENDING, IN_PROGRESS, COMPLETED, FAILED, RESTORING, RESTORED, DELETED)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

#### Create Backup
```
POST /api/admin/backup
```

Request:
```json
{
  "tenantId": "uuid",
  "name": "Monthly Backup - Dec 2024",
  "retentionDays": 30
}
```

Notes:
- Backup runs asynchronously - returns immediately with backupId
- Poll for progress via GET /api/admin/backup/{id}
- If `retentionDays` is set, backup will auto-delete after expiration

#### Get Backup Details
```
GET /api/admin/backup/{id}
```

#### Restore Backup
```
POST /api/admin/backup/{id}/restore
```

Request:
```json
{
  "dryRun": false,
  "overwriteExisting": false
}
```

**Restore Modes:**
- **Merge Mode** (`overwriteExisting: false`) - Adds missing records only. Existing data remains unchanged. Safe for partial restores.
- **Clean Restore** (`overwriteExisting: true`) - Deletes ALL existing tenant data (database records and S3 files), then restores from backup. Use when you need an exact point-in-time restore.

Notes:
- `dryRun: true` validates the backup without restoring
- Clean restore permanently deletes data created after the backup
- Both modes support restoring backups in COMPLETED or RESTORED status

#### Delete Backup
```
DELETE /api/admin/backup/{id}
```

#### Cleanup Expired Backups
```
POST /api/admin/backup/cleanup
GET /api/admin/backup/cleanup (preview mode)
```

Query Parameters:
- `dryRun=true` - Preview what would be cleaned up without deleting

Headers (for cron jobs):
- `x-cron-secret` - Must match CRON_SECRET environment variable

Response:
```json
{
  "success": true,
  "triggeredBy": "cron",
  "staleBackups": {
    "staleCount": 2,
    "markedFailedCount": 2
  },
  "expiredBackups": {
    "scannedCount": 5,
    "expiredCount": 5,
    "deletedCount": 5,
    "failedCount": 0,
    "errors": []
  }
}
```

Cleanup handles:
1. **Stale backups**: Marks PENDING/IN_PROGRESS backups as FAILED if stuck for >60 minutes
2. **Expired backups**: Deletes backups past their `expiresAt` date

**Environment Variables:**
- `CRON_SECRET` - Required for cron job authentication
- `BACKUP_CLEANUP_ENABLED` - Set to `true` to enable cleanup via cron jobs
- `BACKUP_STALE_THRESHOLD_MINUTES` - Minutes before in-progress backups are considered stale (default: 60)

To enable scheduled cleanup:
1. Set `CRON_SECRET` environment variable
2. Set `BACKUP_CLEANUP_ENABLED=true`
3. Configure external cron job to POST to `/api/admin/backup/cleanup` with `x-cron-secret` header

#### Scheduled Backups
```
POST /api/admin/backup/scheduled
GET /api/admin/backup/scheduled (status)
```

Process all due scheduled backups for tenants with enabled backup schedules.

Headers (for cron jobs):
- `x-cron-secret` - Must match CRON_SECRET environment variable

Response:
```json
{
  "success": true,
  "triggeredBy": "cron",
  "enabled": true,
  "processed": 3,
  "succeeded": 3,
  "failed": 0,
  "results": [
    { "scheduleId": "uuid", "tenantId": "uuid", "backupId": "uuid" }
  ]
}
```

**Backup Schedule Configuration (per tenant):**
- `cronPattern` - Cron expression (e.g., "0 2 * * *" for daily at 2 AM)
- `timezone` - Timezone for schedule (default: UTC)
- `retentionDays` - How long to keep scheduled backups (default: 30)
- `maxBackups` - Maximum number of scheduled backups to retain (default: 10)

**Environment Variables:**
- `SCHEDULER_ENABLED` - Master switch to enable the task scheduler (default: false)
- `SCHEDULER_BACKUP_ENABLED` - Enable the backup task (default: false)
- `SCHEDULER_BACKUP_CRON` - How often to check for due backups (default: "0,15,30,45 * * * *")
- `SCHEDULER_CLEANUP_ENABLED` - Enable the cleanup task (default: false)
- `SCHEDULER_CLEANUP_CRON` - When to run cleanup (default: "0 2 * * *")
- `BACKUP_DEFAULT_RETENTION_DAYS` - Default retention days for new schedules (default: 30)
- `BACKUP_DEFAULT_MAX_BACKUPS` - Default max backups for new schedules (default: 10)
- `CRON_SECRET` - Optional: for external cron job authentication (if not using built-in scheduler)

To enable scheduled backups (built-in scheduler):
1. Set `SCHEDULER_ENABLED=true`
2. Set `SCHEDULER_BACKUP_ENABLED=true`
3. Set `SCHEDULER_CLEANUP_ENABLED=true` (recommended)
4. Configure backup schedules for tenants via the Admin UI or Schedule API

Alternative: External cron job:
1. Set `SCHEDULER_ENABLED=false`
2. Set `CRON_SECRET` environment variable
3. Configure external cron job to POST to `/api/admin/backup/scheduled` with `x-cron-secret` header

#### Backup Schedule Management API

**List All Schedules:**
```
GET /api/admin/backup/schedule
```

Query Parameters:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Create Schedule:**
```
POST /api/admin/backup/schedule
```

Request:
```json
{
  "tenantId": "uuid",
  "cronPattern": "0 2 * * *",
  "isEnabled": true,
  "timezone": "UTC",
  "retentionDays": 30,
  "maxBackups": 10
}
```

**Get Schedule by Tenant:**
```
GET /api/admin/backup/schedule/{tenantId}
```

**Update Schedule:**
```
PUT /api/admin/backup/schedule/{tenantId}
```

Request (all fields optional):
```json
{
  "cronPattern": "0 3 * * *",
  "isEnabled": false,
  "timezone": "Asia/Singapore",
  "retentionDays": 60,
  "maxBackups": 5
}
```

**Delete Schedule:**
```
DELETE /api/admin/backup/schedule/{tenantId}
```

#### Backup Schedule Admin UI

The Backup & Restore page (`/admin/backup`) includes a **Schedules** tab for managing backup schedules:

**Features:**
- **Tab Navigation** - Switch between "Backups" (list/create/restore) and "Schedules" (manage schedules)
- **Schedule List** - View all configured backup schedules with tenant name, cron pattern (with human-readable description), status, retention settings, and run history
- **Create Schedule** - Add backup schedules for tenants (each tenant can have one schedule)
- **Edit Schedule** - Modify cron pattern, retention, timezone, and enable/disable
- **Toggle Enable/Disable** - Quick toggle to pause or resume scheduled backups
- **Run Now** - Manually trigger the scheduled backup processor to run all due backups immediately
- **Delete Schedule** - Remove a backup schedule

**Cron Pattern Examples:**
- `0 2 * * *` - Daily at 2:00 AM
- `0 0 * * 0` - Weekly on Sunday at midnight
- `0 3 1 * *` - Monthly on the 1st at 3:00 AM

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

### Connectors (SUPER_ADMIN & TENANT_ADMIN)

The Connectors Hub manages external service integrations with a two-level hierarchy:
- **System connectors** (`tenantId = null`) - SUPER_ADMIN only, available as fallback for all tenants
- **Tenant connectors** - TENANT_ADMIN manages their own, overrides system connectors

#### List Connectors
```
GET /api/connectors
```

Query Parameters:
- `tenantId` - Filter by tenant (SUPER_ADMIN can view any)
- `type` - Filter by type (AI_PROVIDER, STORAGE)
- `provider` - Filter by provider (OPENAI, ANTHROPIC, GOOGLE, ONEDRIVE)
- `isEnabled` - Filter by enabled status
- `includeSystem` - Include system connectors (default: true)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

#### Create Connector
```
POST /api/connectors
Content-Type: application/json

{
  "tenantId": null,  // null = system connector (SUPER_ADMIN only)
  "name": "OpenAI Production",
  "type": "AI_PROVIDER",
  "provider": "OPENAI",
  "credentials": {
    "apiKey": "sk-...",
    "organization": "org-..."  // Optional
  },
  "isEnabled": true,
  "isDefault": true
}
```

#### Get Connector
```
GET /api/connectors/:id
```

Returns connector details with masked credentials.

#### Update Connector
```
PATCH /api/connectors/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "credentials": { "apiKey": "sk-new-key" },
  "isEnabled": false
}
```

#### Delete Connector (Soft Delete)
```
DELETE /api/connectors/:id
Content-Type: application/json

{
  "reason": "Migrating to new provider"
}
```

#### Test Connector
```
POST /api/connectors/:id/test
```

Tests the connector connection and returns success/failure with latency.

Response:
```json
{
  "success": true,
  "latencyMs": 245
}
```

#### Get Tenant Access (SUPER_ADMIN Only)
```
GET /api/connectors/:id/access
```

Returns list of tenants and their access status for a system connector.

#### Update Tenant Access (SUPER_ADMIN Only)
```
PATCH /api/connectors/:id/access
Content-Type: application/json

{
  "tenantAccess": [
    { "tenantId": "uuid1", "isEnabled": true },
    { "tenantId": "uuid2", "isEnabled": false }
  ]
}
```

Allows SUPER_ADMIN to enable/disable system connectors per tenant.

#### Get Connector Usage
```
GET /api/connectors/:id/usage
```

Query Parameters:
- `startDate` - Filter from date (ISO format)
- `endDate` - Filter to date (ISO format)
- `model` - Filter by AI model
- `operation` - Filter by operation type
- `success` - Filter by success status (true/false)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 100)
- `sortBy` - Sort field (createdAt, costCents, totalTokens, latencyMs)
- `sortOrder` - Sort order (asc, desc)

Response includes usage logs with stats summary:
```json
{
  "logs": [
    {
      "id": "uuid",
      "model": "gpt-4.1",
      "provider": "openai",
      "operation": "bizfile_extraction",
      "inputTokens": 1500,
      "outputTokens": 500,
      "totalTokens": 2000,
      "costCents": 1200,
      "costUsd": 0.1200,
      "latencyMs": 2500,
      "success": true,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 50,
  "totalPages": 3,
  "stats": {
    "totalCalls": 150,
    "successfulCalls": 148,
    "failedCalls": 2,
    "totalTokens": 300000,
    "totalCostUsd": 15.5000,
    "avgLatencyMs": 2100
  }
}
```

> **Note:** `costCents` stores cost in micro-dollars (1/10000 USD) for 4 decimal precision. To convert: `costUsd = costCents / 10000`.

#### Export Connector Usage (CSV)
```
GET /api/connectors/:id/usage?export=csv
```

Exports usage logs as CSV file with same filtering parameters.

---

## Design Guidelines

For complete design system documentation including typography, color palette, component specifications, and usage examples, see **[DESIGN_GUIDELINE.md](./DESIGN_GUIDELINE.md)**.

Key highlights:
- **Design Philosophy**: Sleek, modern, compact UI inspired by Linear.app
- **Theme Support**: Light mode (default) and dark mode with CSS variables
- **Component Library**: Reusable UI components in `src/components/ui/`
- **Spacing System**: 4px grid (4, 8, 12, 16, 20, 24, 32px)

---

## Module: Company Management

### Features

1. **Company CRUD Operations**
   - Create companies manually or via BizFile
   - View paginated list with search and filters
   - View detailed company information with expanded officer/shareholder details
   - Edit company details
   - Soft-delete with reason tracking
   - **Bulk delete** - Select multiple companies for batch deletion

2. **BizFile Integration**
   - Upload BizFile documents (PDF or images: PNG, JPG, WebP)
   - AI vision-powered data extraction with multi-provider support (OpenAI, Anthropic, Google)
   - Model selection via UI or environment default
   - Optional context input for extraction hints
   - Standard context injection (current date/time, timezone)
   - Preview extracted data before saving
   - Automatic contact creation and linking
   - **Update via BizFile** - Update existing companies with diff preview
   - Selective updates - only changed fields are modified
   - Clean audit logs showing actual field changes
   - **Text normalization** - Automatic case normalization during extraction

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

4. **Contact Management from BizFile**
   - Automatic contact creation from officers, shareholders, and charge holders
   - **Duplicate Detection**:
     - For individuals: Matches by `identificationType` + `identificationNumber` (NRIC, FIN, Passport)
     - For corporates: Matches by `corporateUen`
     - If match found, links existing contact instead of creating duplicate
   - **Update Behavior**: BizFile extraction does NOT update existing contact details
     - Only creates new contacts or reuses existing ones
     - Contact updates must be done manually through the Contact management module
   - Company-contact relationship linking with role attribution

5. **Search & Filtering**
   - Full-text search across multiple fields
   - Filter by entity type, status
   - Filter by FYE month, charges

6. **Audit Trail**
   - All changes tracked with timestamps
   - Old/new value comparison
   - User and source attribution
   - Deletion reasons

---

## Module: Contact Management

### Features

1. **Contact CRUD Operations**
   - Create individual or corporate contacts
   - View paginated list with search and filters
   - View detailed contact information with company relationships
   - Edit contact details
   - Soft-delete with reason tracking
   - Restore deleted contacts

2. **Contact Types**
   - **Individual**: Personal contacts with name, nationality, date of birth
   - **Corporate**: Business entities with corporate name and UEN

3. **Identification**
   - NRIC (Singapore National Registration Identity Card)
   - FIN (Foreign Identification Number)
   - Passport
   - UEN (Unique Entity Number)
   - Other custom identification types

4. **Company Relationships**
   - Link contacts to multiple companies
   - Track relationship types (officer, shareholder, etc.)
   - View all company associations from contact detail
   - Link/unlink companies via modal interface
   - **Consolidated view**: Unified display of all relationships per company
   - **RBAC filtering**: Company relationships filtered by user's company access
   - **Hidden count indicator**: Shows count of hidden companies due to access restrictions
   - **Filter by company name**: Text search by company name or UEN
   - **Filter by position**: Dropdown to filter by officer role, shareholder, or general relationship

5. **Officer & Shareholder Tracking**
   - View officer positions across companies
   - View shareholding positions across companies
   - Historical position tracking with effective dates
   - **Edit officer positions**: Adjust appointment and cessation dates
   - **Edit shareholdings**: Modify number of shares and share class
   - **Remove positions**: Delete officer/shareholder records with automatic cleanup

6. **Search & Filtering**
   - Search by name, email, phone, ID number
   - Filter by contact type (Individual/Corporate)
   - Paginated results with sorting

7. **Bulk Operations**
   - Checkbox selection for multiple contacts
   - Bulk delete with confirmation dialog
   - Reason tracking for compliance
   - Maximum 100 contacts per bulk operation

8. **Audit Trail**
   - All changes tracked with timestamps
   - Old/new value comparison
   - User and source attribution
   - Deletion/restoration logging

### API Endpoints

#### List Contacts
```
GET /api/contacts
```

Query Parameters:
- `query` - Search term (name, email, phone, ID number)
- `contactType` - Filter by type (INDIVIDUAL, CORPORATE)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `sortBy` - Sort field (default: updatedAt)
- `sortOrder` - asc or desc (default: desc)

#### Get Contact
```
GET /api/contacts/:id
GET /api/contacts/:id?full=true  # Include all relations
```

#### Create Contact
```
POST /api/contacts
Content-Type: application/json

{
  "contactType": "INDIVIDUAL",
  "firstName": "John",
  "lastName": "Doe",
  "identificationType": "NRIC",
  "identificationNumber": "S1234567A",
  "email": "john@example.com",
  "phone": "+65 9123 4567"
}
```

#### Update Contact
```
PATCH /api/contacts/:id
Content-Type: application/json

{
  "email": "newemail@example.com",
  "phone": "+65 9987 6543"
}
```

#### Delete Contact (Soft Delete)
```
DELETE /api/contacts/:id
Content-Type: application/json

{
  "reason": "Duplicate contact entry"
}
```

#### Restore Contact
```
PUT /api/contacts/:id
Content-Type: application/json

{
  "action": "restore"
}
```

#### Bulk Delete Contacts
```
DELETE /api/contacts/bulk
Content-Type: application/json

{
  "ids": ["uuid1", "uuid2", "uuid3"],
  "reason": "Duplicate contact entries - data cleanup"
}
```

Response:
```json
{
  "success": true,
  "deleted": 3,
  "message": "Successfully deleted 3 contacts"
}
```

Notes:
- Maximum 100 contacts per request
- All contacts must belong to user's tenant
- Reason must be at least 10 characters
- Performs soft delete with audit logging for each contact

#### Link Contact to Company
```
PUT /api/contacts/:id
Content-Type: application/json

{
  "action": "link",
  "companyId": "company-uuid",
  "relationshipType": "OTHER"
}
```

#### Unlink Contact from Company
```
PUT /api/contacts/:id?action=unlink-company
Content-Type: application/json

{
  "companyId": "company-uuid",
  "relationship": "Nominee"
}
```

#### Remove Officer Position
```
DELETE /api/companies/:companyId/officers/:officerId
```

Marks the officer as ceased (`isCurrent: false`) with cessation date set to today if not already set.

#### Remove Shareholding
```
DELETE /api/companies/:companyId/shareholders/:shareholderId
```

Marks the shareholder as former (`isCurrent: false`) and recalculates percentage held for all remaining current shareholders.

#### Update Officer Position
```
PUT /api/contacts/:id?action=update-officer
Content-Type: application/json

{
  "officerId": "officer-uuid",
  "appointmentDate": "2024-01-15",
  "cessationDate": "2024-12-31"  // null to clear
}
```

Updates officer appointment/cessation dates. Setting cessationDate marks the position as ceased (`isCurrent: false`).

#### Update Shareholding
```
PUT /api/contacts/:id?action=update-shareholder
Content-Type: application/json

{
  "shareholderId": "shareholder-uuid",
  "numberOfShares": 5000,
  "shareClass": "Preference"
}
```

#### Get Contact Audit History
```
GET /api/contacts/:id/audit
```

Query Parameters:
- `limit` - Number of records (default: 50)
- `offset` - Skip records (default: 0)
- `actions` - Filter by actions (comma-separated)

### File Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   └── contacts/
│   │       ├── page.tsx           # Contact list
│   │       ├── loading.tsx        # List loading skeleton
│   │       ├── new/page.tsx       # Create contact
│   │       └── [id]/
│   │           ├── page.tsx       # Contact detail
│   │           ├── loading.tsx    # Detail loading skeleton
│   │           ├── edit/page.tsx  # Edit contact
│   │           └── audit/page.tsx # Audit history
│   └── api/
│       └── contacts/
│           ├── route.ts           # List/Create
│           └── [id]/
│               ├── route.ts       # Get/Update/Delete/Restore/Link/Unlink
│               └── audit/route.ts # Audit history
├── components/
│   └── contacts/
│       ├── contact-table.tsx         # Contact list table
│       ├── contact-filters.tsx       # Search and filter controls
│       └── company-relationships.tsx # Consolidated company relationships view
├── hooks/
│   └── use-contacts.ts            # Contact data hooks
└── services/
    └── contact.service.ts         # Contact business logic
```

---

### File Structure (Full Application)

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx             # Dashboard layout with AuthGuard
│   │   ├── companies/
│   │   │   ├── page.tsx           # Company list
│   │   │   ├── new/page.tsx       # Create company
│   │   │   ├── upload/page.tsx    # BizFile upload
│   │   │   └── [id]/
│   │   │       ├── page.tsx       # Company detail
│   │   │       ├── edit/page.tsx  # Edit company
│   │   │       └── audit/page.tsx # Audit history
│   │   ├── contacts/
│   │   │   ├── page.tsx           # Contact list
│   │   │   ├── loading.tsx        # List loading skeleton
│   │   │   ├── new/page.tsx       # Create contact
│   │   │   └── [id]/
│   │   │       ├── page.tsx       # Contact detail
│   │   │       ├── loading.tsx    # Detail loading skeleton
│   │   │       ├── edit/page.tsx  # Edit contact
│   │   │       └── audit/page.tsx # Audit history
│   │   └── admin/
│   │       ├── users/page.tsx     # User management (TENANT_ADMIN+)
│   │       ├── audit-logs/page.tsx # Audit logs dashboard
│   │       ├── roles/page.tsx     # Roles & permissions view
│   │       ├── tenants/page.tsx   # Tenant management (SUPER_ADMIN)
│   │       └── data-purge/page.tsx # Permanent deletion (SUPER_ADMIN)
│   ├── login/
│   │   └── page.tsx               # Login page
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts     # POST - Login
│       │   ├── logout/route.ts    # POST - Logout
│       │   └── me/route.ts        # GET - Current session
│       ├── companies/
│       │   ├── route.ts           # List/Create
│       │   ├── bulk/route.ts      # Bulk delete
│       │   ├── stats/route.ts     # Statistics
│       │   └── [id]/
│       │       ├── route.ts       # Get/Update/Delete
│       │       ├── audit/route.ts # Audit history
│       │       ├── documents/     # Document management
│       │       └── notes/         # Internal notes (CRUD for tabs)
│       ├── contacts/
│       │   ├── route.ts           # List/Create contacts
│       │   ├── bulk/route.ts      # Bulk delete contacts
│       │   └── [id]/
│       │       ├── route.ts       # Get/Update/Delete/Restore/Link/Unlink
│       │       ├── audit/route.ts # Contact audit history
│       │       └── notes/         # Internal notes (CRUD for tabs)
│       ├── documents/
│       │   └── [documentId]/
│       │       ├── preview-diff/route.ts  # Preview BizFile diff
│       │       └── apply-update/route.ts  # Apply selective update
│       ├── tenants/
│       │   ├── route.ts           # List/Create tenants
│       │   └── [id]/
│       │       ├── route.ts       # Get/Update/Delete tenant
│       │       ├── users/route.ts # Tenant user management
│       │       ├── roles/
│       │       │   ├── route.ts   # List/Create roles
│       │       │   └── [roleId]/
│       │       │       ├── route.ts     # Get/Update/Delete role
│       │       │       ├── duplicate/route.ts # Duplicate role
│       │       │       └── users/route.ts # Role user management
│       │       └── stats/route.ts # Tenant statistics
│       ├── permissions/
│       │   └── route.ts           # List all permissions
│       ├── audit-logs/
│       │   ├── route.ts           # List audit logs
│       │   └── stats/route.ts     # Audit statistics
│       └── admin/
│           └── purge/route.ts     # Data purge (SUPER_ADMIN)
├── components/
│   ├── auth/
│   │   └── auth-guard.tsx         # Route protection
│   ├── error-boundary.tsx         # React error boundary
│   ├── ui/
│   │   ├── sidebar.tsx            # Responsive navigation sidebar
│   │   ├── button.tsx             # Reusable button
│   │   ├── form-input.tsx         # Form input with validation
│   │   ├── date-input.tsx         # Segmented date input with calendar
│   │   ├── alert.tsx              # Alert/notification
│   │   ├── modal.tsx              # Accessible modal dialog
│   │   ├── confirm-dialog.tsx     # Confirmation with reason input
│   │   ├── dropdown.tsx           # Click-outside aware dropdown
│   │   ├── toast.tsx              # Toast notification system
│   │   ├── theme-toggle.tsx       # Theme switcher component
│   │   ├── ai-model-selector.tsx  # AI model selection with context
│   │   ├── stepper.tsx            # Multi-step wizard component
│   │   ├── checkbox.tsx           # Checkbox with indeterminate state
│   │   ├── rich-text-editor.tsx   # TipTap rich text editor (with DOMPurify sanitization)
│   │   └── prefetch-link.tsx      # Link with data prefetching on hover
│   ├── theme-provider.tsx         # Theme context provider
│   ├── notes/
│   │   └── internal-notes.tsx     # Multi-tab notes component
│   ├── companies/
│   │   ├── company-table.tsx
│   │   ├── company-filters.tsx
│   │   └── pagination.tsx
│   └── contacts/
│       ├── contact-table.tsx      # Contact list table
│       └── contact-filters.tsx    # Search and filter controls
├── hooks/
│   ├── use-auth.ts                # Auth hooks (useSession, useLogin, useLogout)
│   ├── use-companies.ts           # Company data hooks
│   ├── use-contacts.ts            # Contact data hooks (includes bulk delete)
│   ├── use-admin.ts               # Admin hooks (users, tenants, roles, audit logs)
│   ├── use-notes.ts               # Internal notes CRUD hooks
│   ├── use-selection.ts           # Multi-select state management
│   ├── use-click-outside.ts       # Click outside detection
│   ├── use-local-storage.ts       # localStorage persistence
│   └── use-media-query.ts         # Responsive breakpoints
├── stores/
│   ├── ui-store.ts                # Zustand UI state (sidebar, theme)
│   └── tenant-store.ts            # SUPER_ADMIN tenant selection (persisted to localStorage)
├── lib/
│   ├── prisma.ts                  # Database client
│   ├── auth.ts                    # JWT & session management
│   ├── audit.ts                   # Audit logging with request context
│   ├── email.ts                   # Email sending service (SMTP)
│   ├── email-templates.ts         # HTML email templates
│   ├── tenant.ts                  # Multi-tenancy utilities
│   ├── rbac.ts                    # Role-based access control
│   ├── request-context.ts         # Request context extraction
│   ├── utils.ts                   # Utility functions (date formatting, text normalization)
│   ├── ai/                        # AI service (multi-provider)
│   │   ├── index.ts               # Main AI service entry point
│   │   ├── types.ts               # TypeScript types
│   │   ├── models.ts              # Model registry and configuration
│   │   └── providers/             # Provider implementations
│   │       ├── openai.ts          # OpenAI GPT models
│   │       ├── anthropic.ts       # Anthropic Claude models
│   │       └── google.ts          # Google Gemini models
│   └── validations/
│       ├── company.ts             # Company Zod schemas
│       ├── contact.ts             # Contact Zod schemas
│       ├── tenant.ts              # Tenant Zod schemas
│       └── audit.ts               # Audit log query schemas
└── services/
    ├── company.service.ts         # Company business logic (tenant-aware)
    ├── tenant.service.ts          # Tenant management (with email)
    ├── password.service.ts        # Password reset & change (with email)
    ├── contact.service.ts         # Contact management
    ├── role.service.ts            # Role management & permissions
    ├── notes.service.ts           # Internal notes management
    └── bizfile.service.ts         # AI extraction
```

---

## Module: Document Generation

### Overview

The Document Generation module enables users to create, edit, and share professional documents from templates. It supports placeholder-based templates, rich text editing, PDF export with letterhead, and secure document sharing.

### Features

1. **Document Templates** (Admin > Templates)
   - Combined template management page at `/admin/template-partials` with tab navigation
   - Create templates with Handlebars placeholders
   - Rich text content with formatting using TipTap editor
   - Categories: RESOLUTION, CONTRACT, LETTER, MINUTES, NOTICE, CERTIFICATE, OTHER
   - Placeholder categories (company, contacts, directors, shareholders, custom)
   - Template preview, duplicate, and active/inactive toggle
   - Version tracking and change history
   - Include Template Partials using `{{>partial_name}}` syntax

   **Full-Page Template Editor** (`/admin/template-partials/editor`):
   - Three-panel layout with resizable and collapsible sidebars
   - **Left Panel Tabs**:
     - *Details*: Tenant display (from sidebar selection for SUPER_ADMIN), template name, category, description, active status
     - *Placeholders*: Available placeholders palette with categories, includes Template Partials with `{{>partial}}` syntax
     - *Test Data*: Mock data panel with company selector to pull real company data for testing
   - **Center Panel**: Rich text editor with TipTap for template content
   - **Right Panel Tabs**:
     - *Preview*: Live PDF preview with resolved placeholders
     - *AI Assistant*: Context-aware AI help with tenant context for template writing assistance
   - Placeholder syntax help via info icon with hover tooltip

2. **Document Generation**
   - Generate documents from templates
   - Automatic placeholder replacement from company/contact data
   - Pre-generation validation with error/warning indicators
   - Custom data support for manual placeholders

3. **Document Editor**
   - Rich text editing with TipTap
   - Undo/redo support
   - Font size and color controls
   - Lists, links, and formatting
   - Page break indicators

4. **Export Options**
   - PDF export with Puppeteer
   - HTML export with optional styling
   - Draft watermark for non-finalized documents
   - Tenant letterhead (header, footer, logo, margins)
   - Download and inline viewing modes

5. **Document Sharing**
   - Generate shareable links with tokens
   - Password protection (optional)
   - Expiration dates
   - Configurable permissions (view, download, print, comment)
   - Anonymous/guest commenting
   - Rate limiting for external comments
   - Comment notifications

6. **Auto-Save & Recovery**
   - Automatic draft saving
   - Draft recovery prompts
   - Conflict detection

7. **Template Partials** (Admin > Templates > Partials tab)
   - Accessible via the Partials tab in `/admin/template-partials`
   - Reusable template fragments (snippets) for common content blocks
   - Include in Document Templates using `{{>partial_name}}` syntax
   - Examples: standard clauses, signature blocks, legal disclaimers
   - Usage tracking (which templates use which partials)
   - Circular reference detection

8. **Workflow Integration**
   - Clean interface exports for workflow modules
   - `IDocumentGenerator` - Generate and manage documents
   - `IDocumentExporter` - Export to PDF/HTML
   - `IDocumentPublisher` - Share and publish documents
   - `DocumentStepResult` for workflow orchestration
   - E-signature, URL shortener, notification hooks

### API Endpoints

#### Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/document-templates` | List templates |
| POST | `/api/document-templates` | Create template |
| GET | `/api/document-templates/:id` | Get template |
| PUT | `/api/document-templates/:id` | Update template |
| DELETE | `/api/document-templates/:id` | Delete template |
| POST | `/api/document-templates/:id/versions` | Create new version |

#### Generated Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/generated-documents` | List documents |
| POST | `/api/generated-documents` | Generate document |
| GET | `/api/generated-documents/:id` | Get document |
| PUT | `/api/generated-documents/:id` | Update document |
| DELETE | `/api/generated-documents/:id` | Delete document |
| POST | `/api/generated-documents/:id/clone` | Clone document |
| POST | `/api/generated-documents/:id/draft` | Save draft |
| GET | `/api/generated-documents/:id/draft` | Get latest draft |
| POST | `/api/generated-documents/validate` | Pre-generation validation |

#### Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/generated-documents/:id/export/pdf` | Export to PDF |
| GET | `/api/generated-documents/:id/export/html` | Export to HTML |

#### Sharing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/generated-documents/:id/share` | List shares |
| POST | `/api/generated-documents/:id/share` | Create share link |
| DELETE | `/api/generated-documents/:id/share?shareId=:shareId` | Revoke share |

#### Public Access (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/share/:token` | View shared document |
| POST | `/api/share/:token` | Add comment |
| GET | `/api/share/:token/pdf` | Download PDF |

#### Letterhead

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/letterhead` | Get letterhead config |
| PUT | `/api/letterhead` | Update letterhead |
| PATCH | `/api/letterhead` | Toggle letterhead enabled |
| DELETE | `/api/letterhead` | Delete letterhead |

#### Template Partials

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/template-partials` | List partials |
| POST | `/api/template-partials` | Create partial |
| GET | `/api/template-partials/:id` | Get partial |
| PATCH | `/api/template-partials/:id` | Update partial |
| DELETE | `/api/template-partials/:id` | Delete partial |
| POST | `/api/template-partials/:id/duplicate` | Duplicate partial |
| GET | `/api/template-partials/:id/usage` | Get usage info |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHROME_PATH` | Path to Chrome/Chromium for PDF generation | Auto-detect |

### Services

```
src/services/
├── document-template.service.ts      # Template CRUD & versioning
├── document-generator.service.ts     # Document generation & sharing
├── document-validation.service.ts    # Pre-generation validation
├── document-export.service.ts        # PDF/HTML export
├── document-comment.service.ts       # Comments & review workflow
├── template-partial.service.ts       # Template partials (snippets)
├── letterhead.service.ts             # Tenant letterhead management
└── document-generation/              # Integration module
    ├── types.ts                      # Type definitions
    ├── interfaces.ts                 # IDocumentGenerator, IDocumentExporter, IDocumentPublisher
    ├── implementations.ts            # Interface implementations
    └── index.ts                      # Barrel exports
```

#### Integration Module Usage

```typescript
import {
  IDocumentGenerator,
  IDocumentExporter,
  IDocumentPublisher,
  getDocumentGenerator,
  getDocumentExporter,
  getDocumentPublisher,
  DocumentStepResult,
} from '@/services/document-generation';

// Generate a document
const generator = getDocumentGenerator();
const document = await generator.generate({
  tenantId,
  userId,
  templateId,
  companyId,
  title: 'Annual Report',
});

// Export to PDF
const exporter = getDocumentExporter();
const pdf = await exporter.toPDF({ tenantId, userId, documentId: document.id });

// Create share link
const publisher = getDocumentPublisher();
const share = await publisher.publish({ tenantId, userId, documentId: document.id });
```

### UI Components

```
src/components/documents/
├── document-editor.tsx              # Rich text editor
├── document-generation-wizard.tsx   # Multi-step document generation wizard
├── template-selector.tsx            # Template selection with search/filter
├── validation-panel.tsx             # Pre-generation validation UI
├── draft-recovery-prompt.tsx        # Draft recovery modal/banner
└── index.ts                         # Barrel exports

src/components/ui/
└── rich-text-editor.tsx             # Reusable TipTap rich text editor
```

### Admin Pages

```
src/app/(dashboard)/admin/
├── document-templates/page.tsx  # Template management (CRUD, preview, duplicate)
└── template-partials/page.tsx   # Partial management (reusable snippets)
```

### User Pages

```
src/app/(dashboard)/generated-documents/
├── page.tsx                     # Document list
├── [id]/page.tsx                # Document view/edit
└── generate/page.tsx            # Document generation wizard
```

### Public Pages

```
src/app/share/[token]/
└── page.tsx    # Public shared document view (unbranded)
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

### Data Caching & Prefetching

The application uses TanStack Query with optimized caching for faster navigation:

1. **QueryClient Configuration** (`src/app/providers.tsx`)
   ```typescript
   staleTime: 5 * 60 * 1000,    // Data stays fresh for 5 minutes
   gcTime: 30 * 60 * 1000,      // Cache retained for 30 minutes
   refetchOnMount: false,       // Don't refetch if data is fresh
   refetchOnWindowFocus: false, // No automatic refetch on focus
   ```

2. **Data Prefetch Hooks**
   - `usePrefetchCompany(id)` - Prefetch single company data
   - `usePrefetchCompanies(params)` - Prefetch company list
   - `usePrefetchContact(id)` - Prefetch single contact data
   - `usePrefetchContacts(params)` - Prefetch contact list

3. **PrefetchLink Component** (`src/components/ui/prefetch-link.tsx`)

   A drop-in replacement for Next.js `Link` that prefetches both route and data on hover:

   ```tsx
   import { PrefetchLink } from '@/components/ui/prefetch-link';

   // Automatic detection from URL
   <PrefetchLink href={`/companies/${id}`}>
     {company.name}
   </PrefetchLink>

   // Explicit type for better performance
   <PrefetchLink
     href={`/companies/${id}`}
     prefetchType="company"
     prefetchId={id}
   >
     {company.name}
   </PrefetchLink>
   ```

   **Props:**
   | Prop | Type | Description |
   |------|------|-------------|
   | `href` | string | Link destination (required) |
   | `prefetchType` | `'company' \| 'contact'` | Entity type to prefetch (auto-detected if omitted) |
   | `prefetchId` | string | Entity ID to prefetch (extracted from href if omitted) |
   | ...rest | LinkProps | All standard Next.js Link props |

4. **Sidebar Route Prefetching** - Navigation links prefetch routes on hover

### Security: HTML Sanitization

User-generated HTML content (e.g., rich text notes) is sanitized using DOMPurify before rendering:

```typescript
// RichTextDisplay component automatically sanitizes content
import { RichTextDisplay } from '@/components/ui/rich-text-editor';

<RichTextDisplay content={userHtml} />
```

Allowed HTML tags: `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `s`, `ul`, `ol`, `li`, `a`, `span`, `hr`, `h1-h6`

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
| ENCRYPTION_KEY | AES encryption key for connector credentials (32+ chars) | Required for Connectors |
| LOG_LEVEL | Logging verbosity (silent, error, warn, info, debug, trace) | debug (dev), info (prod) |
| OPENAI_API_KEY | OpenAI API key (GPT models) | Optional* |
| ANTHROPIC_API_KEY | Anthropic API key (Claude models) | Optional* |
| GOOGLE_AI_API_KEY | Google AI API key (Gemini models) | Optional* |
| DEFAULT_AI_MODEL | Default AI model for extraction | gpt-4.1 |
| UPLOAD_DIR | Directory for file uploads | ./uploads |
| MAX_FILE_SIZE | Max upload size in bytes | 10485760 |
| SMTP_HOST | SMTP server hostname | Optional |
| SMTP_PORT | SMTP server port | 587 |
| SMTP_SECURE | Use TLS/SSL | false |
| SMTP_USER | SMTP authentication username | Optional |
| SMTP_PASSWORD | SMTP authentication password | Optional |
| EMAIL_FROM_ADDRESS | Default sender email | SMTP_USER |
| EMAIL_FROM_NAME | Default sender name | Oakcloud |

> **Note:** *At least one AI provider API key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY) is required for AI-powered features like BizFile extraction. Alternatively, configure AI connectors via the Connectors Hub for tenant-aware credential management.

---

## Security

### Cryptographic Standards

Oakcloud uses industry-standard cryptographic algorithms:

| Component | Algorithm | Purpose |
|-----------|-----------|---------|
| **Password Hashing** | Argon2id | Memory-hard, OWASP recommended |
| **File Hashing** | BLAKE3 | 3-10x faster than SHA-256, cryptographically secure |
| **Credential Encryption** | AES-256-GCM | Authenticated encryption for API keys |
| **Token Hashing** | SHA-256 | Password reset tokens, share tokens |
| **Storage Encryption** | SSE-S3 (AES256) | Server-side encryption for S3/MinIO |

### Password Security (Argon2id)

All user passwords are hashed using Argon2id with OWASP-recommended parameters:
- **Memory**: 64 MB
- **Iterations**: 3
- **Parallelism**: 4 threads
- **Output**: 32 bytes

Legacy bcrypt hashes are automatically migrated to Argon2id on successful login.

### File Integrity (BLAKE3)

Document file hashes use BLAKE3 for:
- **Duplicate detection** across the document processing pipeline
- **File integrity verification** during storage operations
- **Fingerprint generation** for images and PDFs

BLAKE3 provides:
- Cryptographic security equivalent to SHA-256
- 3-10x faster performance
- Parallel processing support

### Storage Encryption (S3)

Documents stored in S3/MinIO are encrypted at rest:

| Option | Environment Variable | Description |
|--------|---------------------|-------------|
| SSE-S3 | `S3_ENCRYPTION=AES256` | Amazon-managed keys (default) |
| SSE-KMS | `S3_ENCRYPTION=aws:kms` | AWS Key Management Service |
| None | `S3_ENCRYPTION=none` | No encryption (not recommended) |

### Credential Encryption (AES-256-GCM)

Connector credentials (API keys, OAuth tokens) are encrypted before storage:
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **IV**: Random 16-byte initialization vector per encryption
- **Auth Tag**: 16-byte authentication tag for integrity
- **Format**: `iv:tag:ciphertext` (hex-encoded)

Requires `ENCRYPTION_KEY` environment variable (32+ characters).

### Production Security Checklist

```bash
# Generate secure keys
JWT_SECRET=$(openssl rand -base64 48)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Required settings
NODE_ENV=production
S3_USE_SSL=true
S3_ENCRYPTION=AES256
DATABASE_URL="postgresql://...?sslmode=require"
```

---

## Email Configuration

Oakcloud supports sending transactional emails for password resets, user invitations, and notifications via SMTP.

### Supported Email Types

| Email Type | Trigger | Description |
|------------|---------|-------------|
| Password Reset | User requests password reset | Contains secure reset link (24h expiry) |
| Password Changed | User changes their password | Security confirmation notification |
| User Invitation | Admin invites user to tenant | Contains temporary password and login link |
| Tenant Setup Complete | Admin completes tenant setup wizard | Welcome email with credentials |
| User Removed | Admin removes user from tenant | Notification of access removal |

### SMTP Configuration

Configure SMTP in your `.env` file:

```bash
# Required for email sending
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="your-smtp-username"
SMTP_PASSWORD="your-smtp-password"
EMAIL_FROM_ADDRESS="noreply@your-domain.com"
EMAIL_FROM_NAME="Oakcloud"
```

### Provider Examples

**Gmail** (requires App Password if 2FA enabled):
```bash
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-app-password"
```

**Amazon SES**:
```bash
SMTP_HOST="email-smtp.us-east-1.amazonaws.com"
SMTP_PORT="587"
SMTP_USER="your-ses-smtp-user"
SMTP_PASSWORD="your-ses-smtp-password"
```

**SendGrid**:
```bash
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT="587"
SMTP_USER="apikey"
SMTP_PASSWORD="your-sendgrid-api-key"
```

**Mailgun**:
```bash
SMTP_HOST="smtp.mailgun.org"
SMTP_PORT="587"
SMTP_USER="postmaster@your-domain.mailgun.org"
SMTP_PASSWORD="your-mailgun-password"
```

### Development Mode

If SMTP is not configured in development mode:
- Email sending is simulated (logged to console)
- Password reset tokens/URLs are returned in API responses for testing
- User invitation temporary passwords are returned in API responses

### Email Service Utilities

```typescript
import { sendEmail, isEmailConfigured, verifyEmailConnection } from '@/lib/email';

// Check if email is configured
if (isEmailConfigured()) {
  // Verify SMTP connection
  const isConnected = await verifyEmailConnection();
}

// Send custom email
await sendEmail({
  to: 'user@example.com',
  subject: 'Your Subject',
  html: '<p>Email content</p>',
});
```

---

## AI Services

Oakcloud provides a unified AI service that supports multiple providers for document extraction and other AI-powered features.

### Supported Providers

| Provider | Models | Env Variable |
|----------|--------|--------------|
| OpenAI | GPT-5, GPT-4.1 | `OPENAI_API_KEY` |
| Anthropic | Claude Opus 4.5, Claude Sonnet 4.5 | `ANTHROPIC_API_KEY` |
| Google | Gemini 3, Gemini 2.5 Flash | `GOOGLE_AI_API_KEY` |

### Configuration

Configure at least one AI provider in your `.env` file:

```bash
# AI Providers (configure at least one)
OPENAI_API_KEY="sk-your-openai-api-key"
ANTHROPIC_API_KEY="sk-ant-your-anthropic-api-key"
GOOGLE_AI_API_KEY="your-google-ai-api-key"

# Default AI Model (optional)
# Available: gpt-5, gpt-4.1, claude-opus-4.5, claude-sonnet-4.5, gemini-3, gemini-2.5-flash
DEFAULT_AI_MODEL="gpt-5"
```

### Model Selection

Users can select an AI model in two ways:

1. **Environment Default**: Set `DEFAULT_AI_MODEL` in `.env` to configure the default model
2. **UI Selection**: Use the AI Model Selector component in BizFile upload and other AI-powered features

The system automatically falls back to the first available model if the configured default is not available.

### AI Model Selector Component

The `AIModelSelector` is a reusable component for AI model selection with optional context input.

```tsx
import { AIModelSelector, buildFullContext } from '@/components/ui/ai-model-selector';

function MyComponent() {
  const [modelId, setModelId] = useState('');
  const [context, setContext] = useState('');
  const [standardContexts, setStandardContexts] = useState<string[]>([]);

  const handleSubmit = () => {
    // Combine standard contexts with custom context
    const fullContext = buildFullContext(standardContexts, context);
    // Use modelId and fullContext for AI request
  };

  return (
    <AIModelSelector
      value={modelId}
      onChange={setModelId}
      label="AI Model"
      helpText="Select the AI model to use"
      jsonModeOnly  // Only show models that support JSON mode
      // Context input (optional)
      showContextInput
      contextValue={context}
      onContextChange={setContext}
      contextLabel="Additional Instructions"
      contextPlaceholder="Provide hints for the AI..."
      // Standard context checkboxes (optional)
      showStandardContexts
      selectedStandardContexts={standardContexts}
      onStandardContextsChange={setStandardContexts}
    />
  );
}
```

**Props:**
| Prop | Type | Description |
|------|------|-------------|
| `value` | string | Selected model ID |
| `onChange` | function | Callback when model changes |
| `jsonModeOnly` | boolean | Only show models supporting JSON output |
| `showContextInput` | boolean | Show context textarea |
| `contextValue` | string | Current context text |
| `onContextChange` | function | Callback when context changes |
| `showStandardContexts` | boolean | Show quick-select context buttons |
| `selectedStandardContexts` | string[] | Selected standard context IDs |
| `onStandardContextsChange` | function | Callback when selections change |

**Built-in Standard Contexts:**
- `datetime` - Current Date & Time
- `date` - Current Date only
- `timezone` - Timezone Info

### AI Service API

```typescript
import { callAI, extractJSON, getBestAvailableModel, getAvailableModels } from '@/lib/ai';
import type { AIImageInput } from '@/lib/ai';

// Get available models
const models = getAvailableModels();
const bestModel = getBestAvailableModel();

// Call AI with specific model
const response = await callAI({
  model: 'gpt-5',
  systemPrompt: 'You are a helpful assistant.',
  userPrompt: 'Hello!',
  temperature: 0.7,
  jsonMode: false,
});

// Call AI with vision (images/PDFs)
const images: AIImageInput[] = [
  { base64: 'base64-encoded-data', mimeType: 'image/png' }
];

const visionResponse = await callAI({
  model: 'claude-sonnet-4.5',
  systemPrompt: 'Analyze this document.',
  userPrompt: 'Extract the key information.',
  images,  // Supports PDF, PNG, JPG, WebP
  jsonMode: true,
});

// Extract JSON data
const { data, response } = await extractJSON<MyType>({
  model: 'claude-sonnet-4.5',
  systemPrompt: 'Extract data as JSON.',
  userPrompt: 'Document text here...',
});
```

**Supported Image Types:**
- `application/pdf` - PDF documents
- `image/png` - PNG images
- `image/jpeg` - JPEG images
- `image/webp` - WebP images

### API Endpoints

#### Get Available Models
```
GET /api/ai/models
```

Response:
```json
{
  "models": [
    {
      "id": "gpt-4.1",
      "name": "GPT-4.1",
      "provider": "openai",
      "providerName": "OpenAI",
      "description": "Latest GPT-4.1 model",
      "available": true,
      "supportsJson": true,
      "supportsVision": true,
      "isDefault": true
    }
  ],
  "providers": [
    { "id": "openai", "name": "OpenAI", "available": true, "configured": true }
  ],
  "defaultModel": "gpt-4.1"
}
```

### File Structure

```
src/lib/ai/
├── index.ts           # Main AI service entry point
├── types.ts           # TypeScript types
├── models.ts          # Model registry and configuration
└── providers/
    ├── openai.ts      # OpenAI provider implementation
    ├── anthropic.ts   # Anthropic provider implementation
    └── google.ts      # Google provider implementation
```

---

## Logging

Oakcloud includes a configurable logging system with multiple log levels for different environments and debugging needs.

### Log Levels

| Level | Description | Prisma Logs |
|-------|-------------|-------------|
| `silent` | No logging | None |
| `error` | Only errors | error |
| `warn` | Errors + warnings | error, warn |
| `info` | Errors + warnings + info (production default) | error, warn, info |
| `debug` | All above + debug messages (development default) | error, warn, info |
| `trace` | All above + SQL queries (most verbose) | query, error, warn, info |

### Configuration

Set the `LOG_LEVEL` environment variable in `.env`:

```bash
# Quiet mode - only errors
LOG_LEVEL=error

# Standard development (default)
LOG_LEVEL=debug

# See all SQL queries (verbose)
LOG_LEVEL=trace
```

### Usage in Code

```typescript
import { createLogger } from '@/lib/logger';

const log = createLogger('my-module');

log.error('Something went wrong', { details: 'error context' });
log.warn('Warning message');
log.info('Informational message');
log.debug('Debug information');
log.trace('Detailed trace (includes SQL at this level)');

// Create child logger for sub-modules
const childLog = log.child('sub-feature');
childLog.info('Message from sub-feature'); // [my-module:sub-feature]
```

### Utilities

```typescript
import { getCurrentLogLevel, isLogLevelEnabled, getPrismaLogConfig } from '@/lib/logger';

// Check current level
const level = getCurrentLogLevel(); // 'debug'

// Check if a level is enabled
if (isLogLevelEnabled('trace')) {
  // expensive logging operation
}

// Get Prisma log config (used internally)
const prismaLogs = getPrismaLogConfig(); // ['error', 'warn', 'info']
```

### Quick Reference

```bash
# Production - minimal logging
LOG_LEVEL=info npm run start

# Development - default (no SQL queries)
LOG_LEVEL=debug npm run dev

# Debugging database issues - see all queries
LOG_LEVEL=trace npm run dev

# Disable all logging
LOG_LEVEL=silent npm run dev
```

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

## Module: Document Processing

The Document Processing module provides AI-powered document ingestion, extraction, revision workflow, and duplicate detection. Implements Oakcloud_Document_Processing_Spec_v3.3.

### Pipeline Overview

```
Container Upload → Queued → Processing → Split Detection → Child Documents
                                              ↓
                                      Field Extraction → Revision (DRAFT)
                                              ↓
                                      Duplicate Check → User Review → APPROVED
```

### Pipeline Status

| Status | Description |
|--------|-------------|
| `UPLOADED` | File uploaded, awaiting processing |
| `QUEUED` | Queued for processing |
| `PROCESSING` | Currently being processed |
| `SPLIT_PENDING` | Split detection in progress |
| `SPLIT_DONE` | Split complete, children created |
| `EXTRACTION_DONE` | Field extraction complete |
| `FAILED_RETRYABLE` | Failed, can retry |
| `FAILED_PERMANENT` | Permanent failure |
| `DEAD_LETTER` | Exhausted retries |

### Revision Workflow

| Status | Description |
|--------|-------------|
| `DRAFT` | Initial extraction or edit, awaiting approval |
| `APPROVED` | User-approved, becomes current revision |
| `SUPERSEDED` | Replaced by newer approved revision |

### Duplicate Detection

The system uses content-based duplicate scoring:
- Vendor name similarity (25%)
- Document number matching (30%)
- Date proximity (20%)
- Amount matching (15% doc currency, 10% home currency)

| Confidence | Score Range | Action |
|------------|-------------|--------|
| HIGH | ≥ 0.95 | Blocking decision required |
| SUSPECTED | 0.80-0.94 | Warning, soft requirement |
| POSSIBLE | 0.60-0.79 | Informational |
| NONE | < 0.60 | No indication |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/processing-documents` | Upload document for processing |
| `GET` | `/api/processing-documents` | List processing documents |
| `GET` | `/api/processing-documents/:id` | Get document details |
| `POST` | `/api/processing-documents/:id/extract` | Trigger field extraction |
| `POST` | `/api/processing-documents/:id/lock` | Acquire document lock |
| `POST` | `/api/processing-documents/:id/unlock` | Release document lock |
| `GET` | `/api/processing-documents/:id/revisions` | Get revision history |
| `POST` | `/api/processing-documents/:id/revisions` | Create new revision (edit) |
| `POST` | `/api/processing-documents/:id/revisions/:revId/approve` | Approve revision |
| `POST` | `/api/processing-documents/:id/duplicate-decision` | Record duplicate decision |

### Services

| Service | Purpose |
|---------|---------|
| `document-processing.service.ts` | Pipeline management, locking, splitting |
| `document-revision.service.ts` | Revision CRUD, approval, validation |
| `document-extraction.service.ts` | AI-powered field extraction |
| `duplicate-detection.service.ts` | Duplicate scoring, decision workflow |

### Storage Architecture

All document files are stored in **MinIO** (S3-compatible object storage) with a centralized storage abstraction layer.

**Storage Key Structure:**
```
{tenantId}/
├── pending/                           # BizFile pending uploads
│   └── {documentId}/
│       └── {filename}
└── companies/
    └── {companyId}/
        └── documents/
            └── {processingDocId}/
                ├── original.{ext}     # Original upload
                ├── pages/
                │   ├── 1.png
                │   ├── 2.png
                │   └── ...
                └── derived/
                    ├── thumbnail.jpg
                    └── child-pages.pdf
```

**Storage Service (`src/lib/storage/`):**
| File | Purpose |
|------|---------|
| `types.ts` | StorageAdapter interface definition |
| `config.ts` | Environment configuration, storage key utilities |
| `local.adapter.ts` | Filesystem adapter (development fallback) |
| `s3.adapter.ts` | S3/MinIO adapter (production) |
| `index.ts` | Factory function, singleton export |

**Environment Variables:**
```bash
STORAGE_PROVIDER=s3                    # s3 | local
S3_ENDPOINT=http://localhost:9000      # MinIO endpoint
S3_REGION=us-east-1
S3_BUCKET=oakcloud
S3_ACCESS_KEY=oakcloud
S3_SECRET_KEY=oakcloud_minio_secret
S3_FORCE_PATH_STYLE=true               # Required for MinIO
```

### Database Models (Phase 1A)

- `ProcessingDocument` - Extended document with pipeline state
- `DocumentPage` - Page metadata for UI (dimensions, page count)
- `DocumentExtraction` - Immutable AI/OCR outputs
- `DocumentRevision` - Structured accounting data snapshots
- `DocumentRevisionLineItem` - Line items for revisions
- `VendorAlias` - Vendor name normalization
- `DuplicateDecision` - User decisions on duplicates
- `ProcessingAttempt` - Processing attempt tracking
- `ProcessingCheckpoint` - Checkpointing for recovery
- `SplitPlan` - Document splitting plans
- `DocumentStateEvent` - Auditable state transitions
- `DocumentDerivedFile` - Child PDFs, thumbnails

### PDF Rendering Architecture

PDFs are rendered **client-side** using `pdfjs-dist` for optimal coordinate accuracy:

- **Server-side**: Uses `pdf-lib` to extract page metadata (count, dimensions) - no image rendering
- **Client-side**: Uses `pdfjs-dist` to render PDFs in browser canvas with SVG highlight overlays
- **Benefits**: Better bounding box accuracy, no storage overhead, vector quality at any zoom

**Key Components:**
- `DocumentPageViewer` - Consolidated client-side PDF renderer with highlight support (supports both `documentId` and direct `pdfUrl` props)
- `/api/processing-documents/:id/pdf` - Streams original PDF file
- `/api/processing-documents/:id/pages` - Returns page metadata with `isPdf` flag

### Future Phases

- **Phase 1B**: Multi-currency, GST validation, exchange rates
- **Phase 2**: Bank reconciliation, transaction matching
- **Phase 3**: Client portal, communications
- **Phase 4**: Accounting software integration (Xero, QuickBooks)

---

## Version History

For detailed version history and changelog, see [CHANGELOG.md](./CHANGELOG.md).

**Current Version:** v0.10.01 (2025-12-19)

---

## Common Patterns & Best Practices

### Number Input Fields (Controlled Components)

When using controlled number inputs with `useState`, store the value as a **string** and convert to number only on form submission. This prevents the input from reverting to its default value when the user clears the field.

**Problem**: `parseInt(e.target.value) || defaultValue` immediately reverts empty fields because `parseInt('')` returns `NaN`, and `NaN || 50` evaluates to `50`.

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

// On form submit:
const handleSubmit = () => {
  const data = {
    maxUsers: parseInt(maxUsers) || 50,  // Apply default here
  };
};
```

**Note**: This issue doesn't apply when using `react-hook-form` with `{ valueAsNumber: true }`, which handles the conversion correctly.

---

## License

Private - Internal use only.
