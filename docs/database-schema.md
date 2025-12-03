# Oakcloud Database Schema

This document provides a detailed reference for the Oakcloud database schema.

## Multi-Tenancy Architecture

Oakcloud implements a multi-tenant architecture where data is isolated by tenant. The following entities are tenant-scoped:

- **Companies** - `tenantId` (required)
- **Contacts** - `tenantId` (required)
- **Documents** - `tenantId` (required)
- **AuditLogs** - `tenantId` (optional, for system-level events)
- **Roles** - `tenantId` (optional, null for global SUPER_ADMIN role)

Users are linked to tenants via `tenantId`. SUPER_ADMIN users have `tenantId = null` and are identified by having a role assignment with `systemRoleType = 'SUPER_ADMIN'`.

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MULTI-TENANCY LAYER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────┐                                                              │
│  │   Tenant   │◄────────────────────────────────────────────────────┐       │
│  ├────────────┤                                                      │       │
│  │ id (PK)    │        ┌────────────┐     ┌────────────┐            │       │
│  │ name       │        │    Role    │     │ Permission │            │       │
│  │ slug       │◄───────┤ tenantId   │────▶│ resource   │            │       │
│  │ status     │        │ name       │     │ action     │            │       │
│  │ maxUsers   │        │ isSystem   │     └────────────┘            │       │
│  │ maxCompanies│       └────────────┘                               │       │
│  └──────┬─────┘                                                      │       │
│         │                                                            │       │
│         │ 1:N                                                        │       │
│         ▼                                                            │       │
│  ┌────────────┐                                                      │       │
│  │    User    │                                                      │       │
│  ├────────────┤                                                      │       │
│  │ id         │◄─────────────────────────────────────┐               │       │
│  │ email      │                                      │               │       │
│  │ tenantId   │  Company access via UserRoleAssignment               │       │
│  └────────────┘  (companyId on role assignments)     │               │       │
│                                                      │               │       │
├─────────────────────────────────────────────────────────────────────────────┤
│                              CORE ENTITIES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                            Company                                  │    │
│  ├─────────────┬──────────────┬────────────────┬───────────────────────┤    │
│  │ id (PK)     │ tenantId (FK)│ uen (UNIQUE)   │ name                  │    │
│  │ entityType  │ status       │ incorporation  │ primarySsic           │    │
│  │ paidUpCap   │ issuedCap    │ hasCharges     │ deleted_at            │    │
│  └──────┬──────┴──────────────┴────────────────┴───────────────────────┘    │
│         │                                                                    │
│         │ 1:N                                                                │
│         │                                                                    │
│  ┌──────┴─────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  ▼                                                                     │    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐           │    │
│  │CompanyAddress  │  │CompanyOfficer  │  │CompanyShareholder│          │    │
│  ├────────────────┤  ├────────────────┤  ├────────────────┤           │    │
│  │ addressType    │  │ role           │  │ shareholderType│           │    │
│  │ fullAddress    │  │ name           │  │ numberOfShares │           │    │
│  │ isCurrent      │  │ isCurrent      │  │ percentageHeld │           │    │
│  │ effectiveFrom  │  │ appointmentDate│  │ isCurrent      │           │    │
│  └────────────────┘  └───────┬────────┘  └───────┬────────┘           │    │
│                              │                    │                    │    │
│         ┌────────────────────┴────────────────────┘                    │    │
│         │                                                              │    │
│         ▼ N:1                                                          │    │
│  ┌────────────────┐                                                    │    │
│  │    Contact     │                                                    │    │
│  ├────────────────┤                                                    │    │
│  │ tenantId (FK)  │  Required for tenant isolation                     │    │
│  │ contactType    │  INDIVIDUAL | CORPORATE                            │    │
│  │ fullName       │                                                    │    │
│  │ idType         │  NRIC | FIN | PASSPORT | UEN                      │    │
│  │ idNumber       │                                                    │    │
│  └────────────────┘                                                    │    │
│                                                                        │    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐           │    │
│  │CompanyCharge   │  │  ShareCapital  │  │CompanyFormerName│          │    │
│  ├────────────────┤  ├────────────────┤  ├────────────────┤           │    │
│  │ chargeNumber   │  │ shareClass     │  │ formerName     │           │    │
│  │ chargeHolder   │  │ numberOfShares │  │ effectiveFrom  │           │    │
│  │ amountSecured  │  │ parValue       │  │ effectiveTo    │           │    │
│  │ isDischarge    │  │ totalValue     │  │                │           │    │
│  └────────────────┘  └────────────────┘  └────────────────┘           │    │
│                                                                        │    │
│  ┌────────────────┐  ┌────────────────┐                               │    │
│  │   Document     │  │   AuditLog     │◄──────────────────────────────┘    │
│  ├────────────────┤  ├────────────────┤                                    │
│  │ tenantId (FK)  │  │ tenantId (FK)  │  Optional for system events        │
│  │ documentType   │  │ action         │  CREATE | UPDATE | DELETE          │
│  │ fileName       │  │ entityType     │                                    │
│  │ extractStatus  │  │ entityId       │                                    │
│  │ extractedData  │  │ changes (JSON) │                                    │
│  │ version        │  │ changeSource   │  MANUAL | BIZFILE | API            │
│  └────────────────┘  │ reason         │                                    │
│                      └────────────────┘                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tables Reference

### tenants

Multi-tenancy support for data isolation.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| name | VARCHAR | No | Tenant display name |
| slug | VARCHAR | No | URL-friendly identifier (unique) |
| status | ENUM | No | ACTIVE, SUSPENDED, PENDING_SETUP, DEACTIVATED |
| contact_email | VARCHAR | Yes | Primary contact email |
| contact_phone | VARCHAR | Yes | Primary contact phone |
| settings | JSONB | Yes | Tenant-specific configuration |
| max_users | INT | No | Maximum allowed users (default: 50) |
| max_companies | INT | No | Maximum allowed companies (default: 100) |
| max_storage_mb | INT | No | Storage limit in MB (default: 10GB) |
| logo_url | VARCHAR | Yes | Custom logo URL |
| primary_color | VARCHAR | Yes | Brand color (default: #294d44) |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |
| activated_at | TIMESTAMP | Yes | When tenant was activated |
| suspended_at | TIMESTAMP | Yes | When tenant was suspended |
| suspend_reason | TEXT | Yes | Reason for suspension |

**Indexes:**
- `tenants_slug_key` UNIQUE on slug
- `tenants_status_idx` on status
- `tenants_deleted_at_idx` on deleted_at

**Tenant Lifecycle:**

1. **Creation** (`PENDING_SETUP`): SUPER_ADMIN creates tenant via `/admin/tenants`
2. **Setup Wizard**: After creation, a setup wizard guides through:
   - Review/update tenant information
   - Create first TENANT_ADMIN user
   - Optionally create first company
3. **Activation** (`ACTIVE`): Setup completion activates the tenant
4. **Suspension** (`SUSPENDED`): SUPER_ADMIN can suspend for compliance/billing
5. **Deactivation** (`DEACTIVATED`): Soft-delete marks tenant as deactivated

**Setup API Endpoint:**
- `POST /api/tenants/:id/setup` - Complete tenant setup wizard

---

### users

User accounts for authentication and authorization. Permissions and company access are managed via `user_role_assignments`.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| email | VARCHAR | No | Unique email address |
| password_hash | VARCHAR | No | Bcrypt hashed password |
| first_name | VARCHAR | No | First name |
| last_name | VARCHAR | No | Last name |
| is_active | BOOLEAN | No | Account active status |
| last_login_at | TIMESTAMP | Yes | Last login timestamp |
| must_change_password | BOOLEAN | No | Force password change on next login |
| password_reset_token | VARCHAR | Yes | Hashed password reset token (unique) |
| password_reset_expires | TIMESTAMP | Yes | Token expiration time |
| password_changed_at | TIMESTAMP | Yes | Last password change time |
| tenant_id | UUID | Yes | FK to tenants (null for SUPER_ADMIN) |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Note:** User roles and company access are determined by `user_role_assignments`. System roles (SUPER_ADMIN, TENANT_ADMIN) are identified by the role's `system_role_type` field. Company access is derived from role assignments with non-null `company_id`.

**Indexes:**
- `users_email_key` UNIQUE on email
- `users_password_reset_token_key` UNIQUE on password_reset_token
- `users_tenant_id_idx` on tenant_id

---

### companies

Main company records with ACRA information. Each company belongs to a tenant.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| uen | VARCHAR(10) | No | Unique Entity Number |
| name | VARCHAR(200) | No | Current company name |
| former_name | VARCHAR(200) | Yes | Previous company name (if changed) |
| date_of_name_change | DATE | Yes | Date when name was changed |
| entity_type | ENUM | No | Company type (see EntityType enum) |
| status | ENUM | No | Company status (see CompanyStatus enum) |
| status_date | DATE | Yes | Date when status became effective |
| incorporation_date | DATE | Yes | Date of incorporation |
| registration_date | DATE | Yes | Date of registration |
| date_of_address | DATE | Yes | Date when registered address became effective |
| primary_ssic_code | VARCHAR(10) | Yes | Primary SSIC code |
| primary_ssic_description | VARCHAR(500) | Yes | Primary business activity |
| secondary_ssic_code | VARCHAR(10) | Yes | Secondary SSIC code |
| secondary_ssic_description | VARCHAR(500) | Yes | Secondary business activity |
| financial_year_end_day | INT | Yes | FYE day (1-31) |
| financial_year_end_month | INT | Yes | FYE month (1-12) |
| fye_as_at_last_ar | DATE | Yes | Financial year end as at last AR |
| home_currency | VARCHAR(3) | Yes | Company's home currency (default: SGD) |
| last_agm_date | DATE | Yes | Last AGM date |
| last_ar_filed_date | DATE | Yes | Last annual return filed |
| next_agm_due_date | DATE | Yes | Next AGM due date |
| next_ar_due_date | DATE | Yes | Next AR due date |
| accounts_due_date | DATE | Yes | Accounts due date |
| paid_up_capital_currency | VARCHAR(3) | Yes | Currency (default: SGD) |
| paid_up_capital_amount | DECIMAL(18,2) | Yes | Paid up capital amount |
| issued_capital_currency | VARCHAR(3) | Yes | Currency (default: SGD) |
| issued_capital_amount | DECIMAL(18,2) | Yes | Issued capital amount |
| has_charges | BOOLEAN | No | Has outstanding charges |
| is_gst_registered | BOOLEAN | No | GST registration status |
| gst_registration_number | VARCHAR(20) | Yes | GST number |
| gst_registration_date | DATE | Yes | GST registration date |
| internal_notes | TEXT | Yes | Internal notes |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |
| deleted_reason | TEXT | Yes | Reason for deletion |

**Indexes:**
- `companies_uen_key` UNIQUE on uen
- `companies_tenant_id_uen_key` UNIQUE on (tenant_id, uen)
- `companies_tenant_id_idx` on tenant_id
- `companies_name_idx` on name
- `companies_status_idx` on status
- `companies_entity_type_idx` on entity_type
- `companies_tenant_id_deleted_at_idx` on (tenant_id, deleted_at)
- `companies_deleted_at_idx` on deleted_at

---

### company_former_names

Historical company names.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| company_id | UUID | No | FK to companies |
| former_name | VARCHAR(200) | No | Previous company name |
| effective_from | DATE | No | Name effective from date |
| effective_to | DATE | Yes | Name effective until date |
| source_document_id | UUID | Yes | FK to documents |
| created_at | TIMESTAMP | No | Record creation time |

---

### company_addresses

Company address records with history.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| company_id | UUID | No | FK to companies |
| address_type | ENUM | No | REGISTERED_OFFICE, MAILING, etc. |
| block | VARCHAR(10) | Yes | Block number |
| street_name | VARCHAR(200) | No | Street name |
| level | VARCHAR(10) | Yes | Floor level |
| unit | VARCHAR(10) | Yes | Unit number |
| building_name | VARCHAR(200) | Yes | Building name |
| postal_code | VARCHAR(10) | No | Postal code |
| country | VARCHAR(100) | No | Country (default: SINGAPORE) |
| full_address | TEXT | No | Complete formatted address |
| effective_from | DATE | Yes | Address effective from |
| effective_to | DATE | Yes | Address effective until |
| is_current | BOOLEAN | No | Current address flag |
| source_document_id | UUID | Yes | FK to documents |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

---

### contacts

Unified contact management for individuals and corporates. Each contact belongs to a tenant.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| contact_type | ENUM | No | INDIVIDUAL or CORPORATE |
| first_name | VARCHAR(100) | Yes | First name (individuals) |
| last_name | VARCHAR(100) | Yes | Last name (individuals) |
| full_name | VARCHAR(200) | No | Computed full name |
| identification_type | ENUM | Yes | NRIC, FIN, PASSPORT, UEN, OTHER |
| identification_number | VARCHAR(50) | Yes | ID number |
| nationality | VARCHAR(100) | Yes | Nationality |
| date_of_birth | DATE | Yes | Date of birth |
| corporate_name | VARCHAR(200) | Yes | Corporate name |
| corporate_uen | VARCHAR(10) | Yes | Corporate UEN |
| email | VARCHAR(200) | Yes | Email address |
| phone | VARCHAR(20) | Yes | Phone number |
| alternate_phone | VARCHAR(20) | Yes | Alternate phone |
| address_line_1 | VARCHAR(200) | Yes | Address line 1 |
| address_line_2 | VARCHAR(200) | Yes | Address line 2 |
| postal_code | VARCHAR(10) | Yes | Postal code |
| city | VARCHAR(100) | Yes | City |
| country | VARCHAR(100) | Yes | Country (default: SINGAPORE) |
| is_active | BOOLEAN | No | Active status |
| internal_notes | TEXT | Yes | Internal notes |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Indexes:**
- `contacts_tenant_id_id_type_number_key` UNIQUE on (tenant_id, identification_type, identification_number)
- `contacts_tenant_id_idx` on tenant_id
- `contacts_full_name_idx` on full_name
- `contacts_identification_number_idx` on identification_number
- `contacts_corporate_uen_idx` on corporate_uen
- `contacts_tenant_id_deleted_at_idx` on (tenant_id, deleted_at)

---

### company_contacts

Many-to-many relationship between companies and contacts.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| company_id | UUID | No | FK to companies |
| contact_id | UUID | No | FK to contacts |
| relationship | VARCHAR(50) | No | Role (Director, Shareholder, etc.) |
| is_primary | BOOLEAN | No | Primary contact flag |
| created_at | TIMESTAMP | No | Record creation time |

**Indexes:**
- `company_contacts_unique` UNIQUE on (company_id, contact_id, relationship)

---

### company_officers

Officer records with appointment history.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| company_id | UUID | No | FK to companies |
| contact_id | UUID | Yes | FK to contacts |
| role | ENUM | No | DIRECTOR, SECRETARY, CEO, etc. |
| designation | VARCHAR(100) | Yes | Custom designation |
| name | VARCHAR(200) | No | Officer name (denormalized) |
| identification_type | ENUM | Yes | ID type |
| identification_number | VARCHAR(50) | Yes | ID number |
| nationality | VARCHAR(100) | Yes | Nationality |
| address | TEXT | Yes | Address |
| appointment_date | DATE | Yes | Appointment date |
| cessation_date | DATE | Yes | Cessation date (null if current) |
| is_current | BOOLEAN | No | Current officer flag |
| source_document_id | UUID | Yes | FK to documents |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

---

### company_shareholders

Shareholder records with shareholding details.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| company_id | UUID | No | FK to companies |
| contact_id | UUID | Yes | FK to contacts |
| name | VARCHAR(200) | No | Shareholder name (denormalized) |
| shareholder_type | ENUM | No | INDIVIDUAL or CORPORATE |
| identification_type | ENUM | Yes | ID type |
| identification_number | VARCHAR(50) | Yes | ID number |
| nationality | VARCHAR(100) | Yes | Nationality |
| place_of_origin | VARCHAR(100) | Yes | Place of origin (for corporate shareholders) |
| address | TEXT | Yes | Address |
| share_class | VARCHAR(50) | No | Share class (default: ORDINARY) |
| number_of_shares | INT | No | Number of shares held |
| percentage_held | DECIMAL(5,2) | Yes | Percentage ownership |
| currency | VARCHAR(3) | No | Currency (default: SGD) |
| allotment_date | DATE | Yes | Date shares allotted |
| transfer_date | DATE | Yes | Date shares transferred |
| is_current | BOOLEAN | No | Current shareholder flag |
| source_document_id | UUID | Yes | FK to documents |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

---

### share_capital

Share capital structure.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| company_id | UUID | No | FK to companies |
| share_class | VARCHAR(50) | No | Share class (default: ORDINARY) |
| currency | VARCHAR(3) | No | Currency (default: SGD) |
| number_of_shares | INT | No | Total shares in class |
| par_value | DECIMAL(18,4) | Yes | Par value per share |
| total_value | DECIMAL(18,2) | No | Total value |
| is_paid_up | BOOLEAN | No | Fully paid up flag |
| is_treasury | BOOLEAN | No | Treasury shares flag (default: false) |
| effective_date | DATE | Yes | Effective date |
| source_document_id | UUID | Yes | FK to documents |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

---

### company_charges

Charges and encumbrances.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| company_id | UUID | No | FK to companies |
| charge_holder_id | UUID | Yes | FK to contacts |
| charge_number | VARCHAR(50) | Yes | Charge reference number |
| charge_type | VARCHAR(100) | Yes | Type of charge |
| description | TEXT | Yes | Charge description |
| charge_holder_name | VARCHAR(200) | No | Charge holder name |
| amount_secured | DECIMAL(18,2) | Yes | Amount secured (numeric) |
| amount_secured_text | VARCHAR(100) | Yes | Amount secured as text (e.g., "All Monies") |
| currency | VARCHAR(3) | Yes | Currency (default: SGD) |
| registration_date | DATE | Yes | Registration date |
| discharge_date | DATE | Yes | Discharge date |
| is_fully_discharged | BOOLEAN | No | Fully discharged flag |
| source_document_id | UUID | Yes | FK to documents |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

---

### documents

Document storage and extraction tracking. Each document belongs to a tenant.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| company_id | UUID | No | FK to companies |
| uploaded_by_id | UUID | No | FK to users |
| document_type | VARCHAR(50) | No | BIZFILE, CONSTITUTION, etc. |
| file_name | VARCHAR(255) | No | Stored filename |
| original_file_name | VARCHAR(255) | No | Original filename |
| file_path | VARCHAR(500) | No | File storage path |
| file_size | INT | No | File size in bytes |
| mime_type | VARCHAR(100) | No | MIME type |
| extracted_at | TIMESTAMP | Yes | Extraction timestamp |
| extraction_status | VARCHAR(20) | Yes | PENDING, PROCESSING, COMPLETED, FAILED |
| extraction_error | TEXT | Yes | Error message if failed |
| extracted_data | JSONB | Yes | Raw extracted JSON data |
| version | INT | No | Document version (default: 1) |
| is_latest | BOOLEAN | No | Latest version flag |
| previous_version_id | UUID | Yes | FK to previous version |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

---

### audit_logs

Complete audit trail. Tenant ID is optional for system-level events.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | Yes | FK to tenants (optional for system events) |
| user_id | UUID | Yes | FK to users |
| company_id | UUID | Yes | FK to companies |
| action | ENUM | No | See AuditAction enum below |
| entity_type | VARCHAR(50) | No | Table/model name |
| entity_id | VARCHAR(50) | No | Record ID |
| change_source | ENUM | No | MANUAL, BIZFILE_UPLOAD, API, SYSTEM |
| changes | JSONB | Yes | Field changes {field: {old, new}} |
| reason | TEXT | Yes | Reason (required for DELETE) |
| metadata | JSONB | Yes | Additional context |
| ip_address | VARCHAR(45) | Yes | Client IP address |
| user_agent | TEXT | Yes | Browser user agent |
| request_id | VARCHAR | Yes | For correlating related operations |
| session_id | VARCHAR | Yes | For tracking user sessions |
| created_at | TIMESTAMP | No | Record creation time |

**Indexes:**
- `audit_logs_tenant_id_idx` on tenant_id
- `audit_logs_user_id_idx` on user_id
- `audit_logs_company_id_idx` on company_id
- `audit_logs_entity_idx` on (entity_type, entity_id)
- `audit_logs_action_idx` on action
- `audit_logs_created_at_idx` on created_at
- `audit_logs_tenant_id_created_at_idx` on (tenant_id, created_at)
- `audit_logs_tenant_id_entity_type_idx` on (tenant_id, entity_type)
- `audit_logs_request_id_idx` on request_id

---

## Enums

### TenantStatus
```sql
ACTIVE
SUSPENDED
PENDING_SETUP
DEACTIVATED
```

### EntityType
```sql
PRIVATE_LIMITED
PUBLIC_LIMITED
SOLE_PROPRIETORSHIP
PARTNERSHIP
LIMITED_PARTNERSHIP
LIMITED_LIABILITY_PARTNERSHIP
FOREIGN_COMPANY
VARIABLE_CAPITAL_COMPANY
OTHER
```

### CompanyStatus
```sql
LIVE
STRUCK_OFF
WINDING_UP
DISSOLVED
IN_LIQUIDATION
IN_RECEIVERSHIP
AMALGAMATED
CONVERTED
OTHER
```

### OfficerRole
```sql
DIRECTOR
ALTERNATE_DIRECTOR
SECRETARY
CEO
CFO
AUDITOR
LIQUIDATOR
RECEIVER
JUDICIAL_MANAGER
```

### ContactType
```sql
INDIVIDUAL
CORPORATE
```

### IdentificationType
```sql
NRIC
FIN
PASSPORT
UEN
OTHER
```

### AddressType
```sql
REGISTERED_OFFICE
MAILING
RESIDENTIAL
BUSINESS
```

### AuditAction
```sql
-- CRUD Operations
CREATE
UPDATE
DELETE
RESTORE

-- Document Operations
UPLOAD
DOWNLOAD
EXTRACT

-- Authentication Events
LOGIN
LOGOUT
LOGIN_FAILED
PASSWORD_CHANGED
PASSWORD_RESET_REQUESTED
PASSWORD_RESET_COMPLETED
PASSWORD_CHANGE_REQUIRED
PASSWORD_CHANGE_CLEARED

-- Access Control
PERMISSION_GRANTED
PERMISSION_REVOKED
ROLE_CHANGED

-- Tenant Operations
TENANT_CREATED
TENANT_UPDATED
TENANT_SUSPENDED
TENANT_ACTIVATED
USER_INVITED
USER_REMOVED

-- User Company Assignment
USER_COMPANY_ASSIGNED
USER_COMPANY_UPDATED
USER_COMPANY_REMOVED

-- Data Operations
EXPORT
IMPORT
BULK_UPDATE
```

### ChangeSource
```sql
MANUAL
BIZFILE_UPLOAD
API
SYSTEM
```

---

## RBAC Tables

### roles

Role definitions for fine-grained access control.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | Yes | FK to tenants (null for global SUPER_ADMIN role) |
| name | VARCHAR | No | Role name (unique per tenant) |
| description | TEXT | Yes | Role description |
| is_system | BOOLEAN | No | System role (cannot be deleted) |
| system_role_type | VARCHAR | Yes | System role identifier: `SUPER_ADMIN`, `TENANT_ADMIN`, or null |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

**System Role Types:**
- `SUPER_ADMIN` - Global role with `tenant_id = null`, full system access
- `TENANT_ADMIN` - Tenant-scoped role, full access within tenant (Users, Roles, Audit Logs, all Companies)
- `COMPANY_ADMIN` - Company-scoped role, manage assigned company and its data
- `COMPANY_USER` - Company-scoped role, view-only access to assigned company
- `null` - Custom role with configurable permissions

**Indexes:**
- `roles_tenant_id_name_key` UNIQUE on (tenant_id, name)
- `roles_tenant_id_idx` on tenant_id
- `roles_system_role_type_idx` on system_role_type

---

### permissions

Permission definitions for RBAC.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| resource | VARCHAR | No | Resource name (company, document, user, etc.) |
| action | VARCHAR | No | Action type (create, read, update, delete, export) |
| description | TEXT | Yes | Permission description |

**Indexes:**
- `permissions_resource_action_key` UNIQUE on (resource, action)
- `permissions_resource_idx` on resource

---

### role_permissions

Links roles to permissions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| role_id | UUID | No | FK to roles |
| permission_id | UUID | No | FK to permissions |
| created_at | TIMESTAMP | No | Record creation time |

**Indexes:**
- `role_permissions_role_id_permission_id_key` UNIQUE on (role_id, permission_id)
- `role_permissions_role_id_idx` on role_id
- `role_permissions_permission_id_idx` on permission_id

---

### user_role_assignments

Links users to roles with optional company scope. This table is the authoritative source for user permissions and company access.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| user_id | UUID | No | FK to users |
| role_id | UUID | No | FK to roles |
| company_id | UUID | Yes | Optional company scope (null = tenant-wide) |
| created_at | TIMESTAMP | No | Record creation time |

**Multi-Company Access:**
- Users can have multiple role assignments, each scoped to a different company
- The session's `companyIds` array is computed from all role assignments with non-null `company_id`
- When checking permissions for a specific company, company-specific roles override tenant-wide roles
- If no company-specific role exists, the system falls back to tenant-wide roles (company_id = null)

**Permission Resolution Priority:**
1. Company-specific role assignments (most specific)
2. Tenant-wide role assignments (company_id = null)
3. System role types (SUPER_ADMIN, TENANT_ADMIN) bypass individual permissions

**Indexes:**
- `user_role_assignments_user_id_role_id_company_id_key` UNIQUE on (user_id, role_id, company_id)
- `user_role_assignments_user_id_idx` on user_id
- `user_role_assignments_role_id_idx` on role_id
- `user_role_assignments_company_id_idx` on company_id

---

### user_company_assignments

Multi-company user assignments. Tracks which companies a user can access. Permissions are controlled separately through `user_role_assignments` with company-specific role scoping.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| user_id | UUID | No | FK to users |
| company_id | UUID | No | FK to companies |
| is_primary | BOOLEAN | No | Whether this is the user's primary company |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

**Note:** Permissions are NOT stored here. Use `user_role_assignments` with `company_id` to assign company-specific roles. A role assignment with `company_id = NULL` applies to all companies.

**Indexes:**
- `user_company_assignments_user_id_company_id_key` UNIQUE on (user_id, company_id)
- `user_company_assignments_user_id_idx` on user_id
- `user_company_assignments_company_id_idx` on company_id

---

## Migration Notes

### Multi-Tenancy

All tenant-scoped entities (Company, Contact, Document) require a `tenantId` field. When adding new rows to these tables:

1. Always include the `tenantId` when creating records
2. The seed script automatically creates a default tenant and assigns all sample data to it
3. Unique constraints that include tenant-scoped fields also include `tenantId` (e.g., company UEN is unique per tenant)

### Soft Delete Pattern

All major entities use soft delete with `deleted_at` timestamp. Queries should filter by `deleted_at IS NULL` by default.

### Historical Tracking

Entities that track history (addresses, officers, shareholders) use:
- `is_current` boolean flag for active records
- `effective_from` / `effective_to` date range
- `source_document_id` to track data source

### Denormalization

Officer and shareholder records denormalize contact information to preserve historical accuracy even if the contact record is updated.

### Database Initialization

To initialize a fresh database:

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database
npm run db:seed       # Seed with sample data (creates default tenant)
```

The seed script is idempotent and can be run multiple times safely.
