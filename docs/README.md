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
- [Version History](#version-history) | [Full Changelog](./CHANGELOG.md)

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
5. ✅ **RBAC & Permissions** - Fine-grained role-based access control
6. ✅ **User Management** - User accounts, invitations, multi-company assignments
7. ✅ **Password Management** - Secure reset flow, force change on first login
8. ✅ **Data Purge** - Permanent deletion of soft-deleted records (SUPER_ADMIN)
9. ✅ **Email Notifications** - SMTP-based transactional emails (invitations, password reset)
10. 🔜 **Module Marketplace** - Browse and install modules
11. 🔜 **Connectors Hub** - External service integrations
12. 🔜 **Module Linking** - Configure module relationships
13. 🔜 **SuperAdmin Dashboard** - System administration

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
| Nodemailer | 6.x | Email sending (SMTP) |
| OpenAI | 4.x | AI extraction - GPT models (lazy loaded) |
| Anthropic | 0.x | AI extraction - Claude models (lazy loaded) |
| Google Generative AI | 0.x | AI extraction - Gemini models (lazy loaded) |
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
| Tenant Admin | `tenant@oakcloud.local` | `admin123` |

> **Security:** Change these passwords in production!

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
- **SUPER_ADMIN tenant selector**: SUPER_ADMIN users see a tenant dropdown to select which tenant's roles to view/manage

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
| `Dropdown` | Composable: `Trigger`, `Menu`, `Item`, `align` | Portal-rendered dropdown (prevents clipping in tables) |
| `Toast` | Via `useToast()` hook | Toast notifications (success, error, warning, info) |
| `Sidebar` | - | Responsive navigation with mobile drawer and theme toggle |
| `AuthGuard` | - | Route protection wrapper |
| `ErrorBoundary` | `fallback`, `onError` | React error boundary with fallback UI |
| `ThemeProvider` | - | Theme context provider, applies theme class to document |
| `ThemeToggle` | `variant` | Theme switcher (button or dropdown variant) |
| `TenantSelector` | `value`, `onChange`, `label`, `placeholder`, `helpText`, `variant` | Tenant dropdown for SUPER_ADMIN operations |
| `AIModelSelector` | `value`, `onChange`, `showContextInput`, `showStandardContexts`, etc. | AI model selection with optional context input |

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

#### TenantSelector Examples
```tsx
import { TenantSelector, useActiveTenantId } from '@/components/ui/tenant-selector';

function AdminPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.isSuperAdmin ?? false;
  const [selectedTenantId, setSelectedTenantId] = useState('');

  // Get active tenant (session tenant for normal users, selected for SUPER_ADMIN)
  const activeTenantId = useActiveTenantId(isSuperAdmin, selectedTenantId, session?.tenantId);

  return (
    <>
      {/* Default variant with card wrapper */}
      {isSuperAdmin && (
        <TenantSelector
          value={selectedTenantId}
          onChange={setSelectedTenantId}
          helpText="Select a tenant to manage."
        />
      )}

      {/* Compact variant without card wrapper */}
      {isSuperAdmin && (
        <TenantSelector
          value={selectedTenantId}
          onChange={setSelectedTenantId}
          variant="compact"
        />
      )}
    </>
  );
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
   - Upload BizFile documents (PDF or images: PNG, JPG, WebP)
   - AI vision-powered data extraction with multi-provider support (OpenAI, Anthropic, Google)
   - Model selection via UI or environment default
   - Optional context input for extraction hints
   - Standard context injection (current date/time, timezone)
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
│   │   ├── companies/
│   │   │   ├── page.tsx           # Company list
│   │   │   ├── new/page.tsx       # Create company
│   │   │   ├── upload/page.tsx    # BizFile upload
│   │   │   └── [id]/
│   │   │       ├── page.tsx       # Company detail
│   │   │       ├── edit/page.tsx  # Edit company
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
│       │   ├── stats/route.ts     # Statistics
│       │   └── [id]/
│       │       ├── route.ts       # Get/Update/Delete
│       │       ├── audit/route.ts # Audit history
│       │       └── documents/     # Document management
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
│   │   ├── alert.tsx              # Alert/notification
│   │   ├── modal.tsx              # Accessible modal dialog
│   │   ├── confirm-dialog.tsx     # Confirmation with reason input
│   │   ├── dropdown.tsx           # Click-outside aware dropdown
│   │   ├── toast.tsx              # Toast notification system
│   │   ├── theme-toggle.tsx       # Theme switcher component
│   │   └── ai-model-selector.tsx  # AI model selection with context
│   ├── theme-provider.tsx         # Theme context provider
│   └── companies/
│       ├── company-table.tsx
│       ├── company-filters.tsx
│       └── pagination.tsx
├── hooks/
│   ├── use-auth.ts                # Auth hooks (useSession, useLogin, useLogout)
│   ├── use-companies.ts           # Company data hooks
│   ├── use-admin.ts               # Admin hooks (users, tenants, roles, audit logs)
│   ├── use-click-outside.ts       # Click outside detection
│   ├── use-local-storage.ts       # localStorage persistence
│   └── use-media-query.ts         # Responsive breakpoints
├── stores/
│   └── ui-store.ts                # Zustand UI state (sidebar, theme)
├── lib/
│   ├── prisma.ts                  # Database client
│   ├── auth.ts                    # JWT & session management
│   ├── audit.ts                   # Audit logging with request context
│   ├── email.ts                   # Email sending service (SMTP)
│   ├── email-templates.ts         # HTML email templates
│   ├── tenant.ts                  # Multi-tenancy utilities
│   ├── rbac.ts                    # Role-based access control
│   ├── request-context.ts         # Request context extraction
│   ├── utils.ts                   # Utility functions
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

> **Note:** *At least one AI provider API key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY) is required for AI-powered features like BizFile extraction.

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

For detailed version history and changelog, see [CHANGELOG.md](./CHANGELOG.md).

**Current Version:** v0.7.0 (2025-12-04)

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
