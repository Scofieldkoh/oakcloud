# Oakcloud Database Schema

> **Last Updated**: 2025-01-12
> **Audience**: Developers

This document provides a detailed reference for the Oakcloud database schema.

## Related Documents

- [Architecture](../ARCHITECTURE.md) - System design overview
- [Service Patterns](../guides/SERVICE_PATTERNS.md) - Service layer conventions
- [API Reference](./API_REFERENCE.md) - REST API endpoints

## Multi-Tenancy Architecture

Oakcloud implements a multi-tenant architecture where data is isolated by tenant. The following entities are tenant-scoped:

- **Companies** - `tenantId` (required)
- **Contacts** - `tenantId` (required)
- **Contracts** - `tenantId` (required)
- **ContractServices** - `tenantId` (required)
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

### user_preferences

Per-user UI/application preferences persisted across devices (e.g., table column widths/visibility).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| user_id | UUID | No | FK to users |
| key | VARCHAR | No | Preference key (namespaced string) |
| value | JSONB | No | Preference value (JSON) |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

**Indexes:**
- `user_preferences_user_id_key_key` UNIQUE on (user_id, key)
- `user_preferences_user_id_idx` on user_id

---

### companies

Main company records with ACRA information. Each company belongs to a tenant.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| uen | VARCHAR(10) | No | Unique Entity Number (unique per tenant) |
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
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |
| deleted_reason | TEXT | Yes | Reason for deletion |

**Notes:**
- UEN is unique within a tenant, not globally. Companies in different tenants may share the same UEN.

**Indexes:**
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
| full_address | VARCHAR(500) | Yes | Complete address |
| is_active | BOOLEAN | No | Active status |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Notes:**
- Email and phone are stored in the `contact_details` table, not directly on contacts
- Use `contact_details` with `companyId = null` for default email/phone

**Indexes:**
- `contacts_tenant_id_id_type_number_key` UNIQUE on (tenant_id, identification_type, identification_number)
- `contacts_tenant_id_idx` on tenant_id
- `contacts_full_name_idx` on full_name
- `contacts_identification_number_idx` on identification_number
- `contacts_corporate_uen_idx` on corporate_uen
- `contacts_tenant_id_deleted_at_idx` on (tenant_id, deleted_at)

---

### note_tabs

Multi-tab internal notes with rich text support for companies and contacts.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| title | VARCHAR | No | Tab title (default: "General") |
| content | TEXT | Yes | Rich text HTML content |
| order | INT | No | Tab display order (default: 0) |
| company_id | UUID | Yes | FK to companies (one of company_id/contact_id set) |
| contact_id | UUID | Yes | FK to contacts (one of company_id/contact_id set) |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

**Notes:**
- Each tab belongs to either a company OR a contact (never both)
- Supports rich text with TipTap editor (bold, italic, underline, lists, links)
- Cascade delete when parent company/contact is deleted
- User can create multiple tabs, rename, reorder, and delete any tab

**Indexes:**
- `note_tabs_company_id_idx` on company_id
- `note_tabs_contact_id_idx` on contact_id
- `note_tabs_order_idx` on order

---

### contact_details

Additional contact methods (email, phone, fax, etc.) that can be linked to a Contact, Company, or both.
Supports multiple contact details per entity with labels for function/purpose.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| contact_id | UUID | Yes | FK to contacts (CASCADE on delete) |
| company_id | UUID | Yes | FK to companies (CASCADE on delete) |
| detail_type | ENUM | No | EMAIL, PHONE, FAX, MOBILE, WEBSITE, OTHER |
| value | VARCHAR(500) | No | The actual contact value |
| label | VARCHAR(100) | Yes | Purpose/function label (e.g., "Account Receivable") |
| description | VARCHAR(500) | Yes | Additional notes |
| display_order | INT | No | Display ordering (default: 0) |
| is_primary | BOOLEAN | No | Primary detail of this type (default: false) |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Use Cases:**
- Company-level: Direct contact info for the company (e.g., "Account Receivable email")
- Contact-level: Personal contact details for linked individuals
- Both: A contact's specific role at a company (e.g., director's work email)

**Indexes:**
- `contact_details_tenant_id_idx` on tenant_id
- `contact_details_contact_id_idx` on contact_id
- `contact_details_company_id_idx` on company_id
- `contact_details_detail_type_idx` on detail_type
- `contact_details_tenant_id_contact_id_idx` on (tenant_id, contact_id)
- `contact_details_tenant_id_company_id_idx` on (tenant_id, company_id)
- `contact_details_tenant_id_deleted_at_idx` on (tenant_id, deleted_at)

---

### company_contacts

Many-to-many relationship between companies and contacts.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| company_id | UUID | No | FK to companies (CASCADE on delete) |
| contact_id | UUID | No | FK to contacts (CASCADE on delete) |
| relationship | VARCHAR(50) | No | Role (Director, Shareholder, etc.) |
| is_primary | BOOLEAN | No | Primary contact flag |
| created_at | TIMESTAMP | No | Record creation time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Indexes:**
- `company_contacts_unique` UNIQUE on (company_id, contact_id, relationship)
- `company_contacts_deleted_at_idx` on deleted_at

---

### contracts

Master contract/agreement records. Each contract belongs to a company and tenant.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| company_id | UUID | No | FK to companies (CASCADE on delete) |
| title | VARCHAR(200) | No | Contract title (e.g., "Annual Engagement 2024") |
| contract_type | ENUM | No | Contract type (see ContractType enum, default: OTHER) |
| status | ENUM | No | Contract status (see ContractStatus enum, default: DRAFT) |
| start_date | DATE | No | Contract effective start date |
| signed_date | DATE | Yes | Date when contract was signed |
| document_id | UUID | Yes | FK to documents (optional attachment, UNIQUE, SET NULL on delete) |
| internal_notes | TEXT | Yes | Internal notes for the contract |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |
| deleted_reason | TEXT | Yes | Reason for deletion |

**Notes:**
- A contract has no end date - it's a master agreement shell
- Services under the contract have their own start/end dates
- Document attachment is optional and doesn't trigger processing pipeline

**Indexes:**
- `contracts_tenant_id_idx` on tenant_id
- `contracts_company_id_idx` on company_id
- `contracts_status_idx` on status
- `contracts_tenant_id_deleted_at_idx` on (tenant_id, deleted_at)
- `contracts_tenant_id_company_id_idx` on (tenant_id, company_id)

---

### contract_services

Billable service line items under a contract. Each service has its own dates, rates, and scope.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| contract_id | UUID | No | FK to contracts (CASCADE on delete) |
| name | VARCHAR(200) | No | Service name (e.g., "Monthly Bookkeeping") |
| service_type | ENUM | No | Service type (see ServiceType enum, default: RECURRING) |
| status | ENUM | No | Service status (see ServiceStatus enum, default: ACTIVE) |
| rate | DECIMAL(18,2) | Yes | Service rate amount |
| currency | VARCHAR(3) | No | Currency code (default: SGD) |
| frequency | ENUM | No | Billing frequency (see BillingFrequency enum, default: MONTHLY) |
| start_date | DATE | No | Service start date |
| end_date | DATE | Yes | Service end date (null for ongoing) |
| next_billing_date | DATE | Yes | Next billing date |
| scope | TEXT | Yes | Scope of work / statement of work (rich text) |
| auto_renewal | BOOLEAN | No | Auto-renewal enabled (default: false) |
| renewal_period_months | INT | Yes | Renewal period in months |
| display_order | INT | No | Display ordering (default: 0) |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Notes:**
- Services inherit tenant from parent contract
- Scope field supports rich text (TipTap HTML)
- Display order controls order within a contract

**Indexes:**
- `contract_services_tenant_id_idx` on tenant_id
- `contract_services_contract_id_idx` on contract_id
- `contract_services_status_idx` on status
- `contract_services_end_date_idx` on end_date
- `contract_services_tenant_id_deleted_at_idx` on (tenant_id, deleted_at)
- `contract_services_tenant_id_contract_id_idx` on (tenant_id, contract_id)

---

### company_officers

Officer records with appointment history.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| company_id | UUID | No | FK to companies (CASCADE on delete) |
| contact_id | UUID | Yes | FK to contacts (SET NULL on delete) |
| role | ENUM | No | DIRECTOR, SECRETARY, CEO, etc. |
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
| company_id | UUID | No | FK to companies (CASCADE on delete) |
| contact_id | UUID | Yes | FK to contacts (SET NULL on delete) |
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
PRIVATE_LIMITED              -- Private Company Limited by Shares
EXEMPTED_PRIVATE_LIMITED     -- Exempt Private Company Limited by Shares
PUBLIC_LIMITED               -- Public Company Limited by Shares
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
MANAGING_DIRECTOR
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

### ContactDetailType
```sql
EMAIL
PHONE
FAX
MOBILE
WEBSITE
OTHER
```

### ContractType
```sql
ENGAGEMENT_LETTER    -- Engagement letters for professional services
SERVICE_AGREEMENT    -- General service agreements
RETAINER_CONTRACT    -- Retainer arrangements
NDA                  -- Non-disclosure agreements
VENDOR_AGREEMENT     -- Agreements with vendors
OTHER                -- Other contract types
```

### ContractStatus
```sql
DRAFT                -- Contract in draft, not yet active
ACTIVE               -- Active contract
TERMINATED           -- Contract has been terminated
```

### ServiceType
```sql
RECURRING            -- Recurring service (monthly, quarterly, annually)
ONE_TIME             -- One-time service
```

### ServiceStatus
```sql
ACTIVE               -- Service is currently active
COMPLETED            -- Service has been completed
CANCELLED            -- Service was cancelled
PENDING              -- Service is pending activation
```

### BillingFrequency
```sql
MONTHLY              -- Monthly billing
QUARTERLY            -- Quarterly billing
SEMI_ANNUALLY        -- Semi-annual billing
ANNUALLY             -- Annual billing
ONE_TIME             -- One-time billing (for one-time services)
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

-- Connector Operations
CONNECTOR_CREATED
CONNECTOR_UPDATED
CONNECTOR_DELETED
CONNECTOR_TESTED
CONNECTOR_ENABLED
CONNECTOR_DISABLED
CONNECTOR_ACCESS_UPDATED
```

### ChangeSource
```sql
MANUAL
BIZFILE_UPLOAD
API
SYSTEM
```

### ConnectorType
```sql
AI_PROVIDER
STORAGE
```

### ConnectorProvider
```sql
OPENAI
ANTHROPIC
GOOGLE
ONEDRIVE
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

## Connectors Tables

### connectors

External service connector configuration with encrypted credentials.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | Yes | FK to tenants (null = system connector) |
| name | VARCHAR | No | Display name |
| type | ENUM | No | ConnectorType (AI_PROVIDER, STORAGE) |
| provider | ENUM | No | ConnectorProvider (OPENAI, ANTHROPIC, GOOGLE, ONEDRIVE) |
| credentials | TEXT | No | AES-256-GCM encrypted JSON credentials |
| settings | JSONB | Yes | Provider-specific configuration |
| is_enabled | BOOLEAN | No | Connector enabled status (default: true) |
| is_default | BOOLEAN | No | Default connector for type (default: false) |
| call_count | INT | No | Usage counter (default: 0) |
| last_used_at | TIMESTAMP | Yes | Last successful call |
| last_tested_at | TIMESTAMP | Yes | Last connection test time |
| last_test_result | VARCHAR | Yes | "success" or "error:message" |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**System vs Tenant Connectors:**
- `tenant_id = NULL` - System connector, managed by SUPER_ADMIN only
- `tenant_id = <id>` - Tenant connector, managed by TENANT_ADMIN

**Resolution Logic:**
1. Check tenant-specific connector → use if exists & enabled
2. Check TenantConnectorAccess for system connector → skip if disabled
3. Check system connector → use if exists & enabled
4. Feature unavailable

**Indexes:**
- `connectors_tenant_id_provider_deleted_at_key` UNIQUE on (tenant_id, provider, deleted_at)
- `connectors_tenant_id_idx` on tenant_id
- `connectors_type_provider_idx` on (type, provider)
- `connectors_deleted_at_idx` on deleted_at

---

### tenant_connector_access

Per-tenant access control for system connectors (SUPER_ADMIN only).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants |
| connector_id | UUID | No | FK to connectors |
| is_enabled | BOOLEAN | No | Access enabled (default: true, false = blocked) |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

**Use Case:** Allows SUPER_ADMIN to enable/disable system connectors per tenant. For example, enable AI features for Tenant A but not Tenant B.

**Indexes:**
- `tenant_connector_access_tenant_id_connector_id_key` UNIQUE on (tenant_id, connector_id)
- `tenant_connector_access_tenant_id_idx` on tenant_id
- `tenant_connector_access_connector_id_idx` on connector_id

---

### connector_usage_logs

Detailed usage logging for connectors with cost tracking.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| connector_id | UUID | No | FK to connectors (CASCADE on delete) |
| tenant_id | UUID | Yes | FK to tenants - tenant that made the call |
| user_id | UUID | Yes | FK to users - user who triggered the call |
| model | VARCHAR | No | AI model ID (e.g., "gpt-4.1") |
| provider | VARCHAR | No | Provider name (openai, anthropic, google) |
| input_tokens | INT | No | Number of input tokens (default: 0) |
| output_tokens | INT | No | Number of output tokens (default: 0) |
| total_tokens | INT | No | Total tokens (default: 0) |
| cost_cents | INT | No | Cost in micro-dollars (1/10000 USD) for 4 decimal precision (default: 0) |
| latency_ms | INT | Yes | Response time in milliseconds |
| operation | VARCHAR | Yes | Operation type (e.g., "bizfile_extraction") |
| success | BOOLEAN | No | Whether call succeeded (default: true) |
| error_message | TEXT | Yes | Error details if failed |
| metadata | JSONB | Yes | Additional context (document ID, etc.) |
| created_at | TIMESTAMP | No | Record creation time |

**Use Case:** Provides detailed usage tracking for billing, analytics, and auditing. Includes token usage, cost calculation, latency metrics, and operation context.

**Indexes:**
- `connector_usage_logs_connector_id_idx` on connector_id
- `connector_usage_logs_tenant_id_idx` on tenant_id
- `connector_usage_logs_user_id_idx` on user_id
- `connector_usage_logs_created_at_idx` on created_at
- `connector_usage_logs_connector_id_created_at_idx` on (connector_id, created_at)
- `connector_usage_logs_tenant_id_created_at_idx` on (tenant_id, created_at)

---

## Document Generation Module Tables

### document_templates

Reusable document templates with placeholder support.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| name | VARCHAR(200) | No | Template name (unique per tenant) |
| description | TEXT | Yes | Template description |
| category | ENUM | No | Template category (see DocumentTemplateCategory) |
| content | TEXT | No | HTML content with placeholders |
| content_json | JSONB | Yes | TipTap JSON format (for editor state) |
| placeholders | JSONB | No | Array of placeholder definitions (default: []) |
| is_active | BOOLEAN | No | Active status (default: true) |
| default_share_expiry_hours | INT | Yes | Default expiry for share links |
| version | INT | No | Template version (increments on update) |
| created_by_id | UUID | No | FK to users |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Placeholder Definition Schema:**
```json
{
  "key": "company.name",
  "label": "Company Name",
  "type": "text|date|number|currency|list|conditional",
  "source": "company|contact|officer|shareholder|custom|system",
  "path": "name",
  "defaultValue": "",
  "format": "dd MMMM yyyy",
  "required": true
}
```

**Indexes:**
- `document_templates_tenant_id_idx` on tenant_id
- `document_templates_category_idx` on category
- `document_templates_is_active_idx` on is_active
- `document_templates_tenant_id_deleted_at_idx` on (tenant_id, deleted_at)

---

### generated_documents

Documents created from templates or blank.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| template_id | UUID | Yes | FK to document_templates (null for blank docs) |
| template_version | INT | Yes | Snapshot of template version used |
| company_id | UUID | Yes | FK to companies (optional) |
| title | VARCHAR(300) | No | Document title |
| content | TEXT | No | Resolved HTML content |
| content_json | JSONB | Yes | TipTap JSON format |
| status | ENUM | No | Document status (see GeneratedDocumentStatus) |
| finalized_at | TIMESTAMP | Yes | When document was finalized |
| finalized_by_id | UUID | Yes | FK to users who finalized |
| unfinalized_at | TIMESTAMP | Yes | Last time un-finalized |
| use_letterhead | BOOLEAN | No | Include letterhead in PDF (default: true) |
| share_expiry_hours | INT | Yes | Override default share expiry |
| placeholder_data | JSONB | Yes | Snapshot of data used for placeholders |
| metadata | JSONB | Yes | Additional metadata |
| created_by_id | UUID | No | FK to users |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Indexes:**
- `generated_documents_tenant_id_idx` on tenant_id
- `generated_documents_template_id_idx` on template_id
- `generated_documents_company_id_idx` on company_id
- `generated_documents_status_idx` on status
- `generated_documents_created_by_id_idx` on created_by_id
- `generated_documents_tenant_id_deleted_at_idx` on (tenant_id, deleted_at)

---

### document_sections

Navigation sections for generated documents.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| document_id | UUID | No | FK to generated_documents (CASCADE) |
| title | VARCHAR(200) | No | Section title |
| anchor | VARCHAR(100) | No | HTML anchor ID for navigation |
| order | INT | No | Display order |
| level | INT | No | Heading level 1-3 (default: 1) |
| page_break_before | BOOLEAN | No | Insert page break (default: false) |
| created_at | TIMESTAMP | No | Record creation time |

**Indexes:**
- `document_sections_document_id_idx` on document_id
- `document_sections_document_id_order_idx` on (document_id, order)

---

### document_shares

Shareable links for documents with access control.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| document_id | UUID | No | FK to generated_documents (CASCADE) |
| share_token | VARCHAR(64) | No | Unique share token (UNIQUE) |
| expires_at | TIMESTAMP | Yes | Link expiration time |
| password_hash | VARCHAR(255) | Yes | Bcrypt password hash |
| is_active | BOOLEAN | No | Active status (default: true) |
| view_count | INT | No | Number of views (default: 0) |
| last_viewed_at | TIMESTAMP | Yes | Last view timestamp |
| allowed_actions | TEXT[] | No | Allowed actions (default: ["view"]) |
| allow_comments | BOOLEAN | No | Allow external comments (default: false) |
| comment_rate_limit | INT | No | Max comments/hour/IP (default: 20) |
| notify_on_comment | BOOLEAN | No | Notify on new comment (default: false) |
| notify_on_view | BOOLEAN | No | Notify on view (default: false) |
| created_by_id | UUID | No | FK to users |
| created_at | TIMESTAMP | No | Record creation time |
| revoked_at | TIMESTAMP | Yes | When link was revoked |

**Indexes:**
- `document_shares_document_id_idx` on document_id
- `document_shares_share_token_key` UNIQUE on share_token
- `document_shares_expires_at_idx` on expires_at

---

### tenant_letterheads

Tenant letterhead configuration for PDF export.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (UNIQUE, one per tenant) |
| header_html | TEXT | Yes | HTML header content |
| footer_html | TEXT | Yes | HTML footer content |
| header_image_url | VARCHAR(500) | Yes | Header image URL |
| footer_image_url | VARCHAR(500) | Yes | Footer image URL |
| logo_url | VARCHAR(500) | Yes | Logo URL |
| page_margins | JSONB | No | Margins in mm (default: top:25, right:20, bottom:25, left:20) |
| is_enabled | BOOLEAN | No | Letterhead enabled (default: true) |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

**Indexes:**
- `tenant_letterheads_tenant_id_key` UNIQUE on tenant_id

---

### document_comments

Comments on documents (internal and external).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| document_id | UUID | No | FK to generated_documents (CASCADE) |
| share_id | UUID | Yes | FK to document_shares (for external) |
| user_id | UUID | Yes | FK to users (null for external) |
| guest_name | VARCHAR(100) | Yes | External commenter name |
| guest_email | VARCHAR(255) | Yes | External commenter email |
| content | VARCHAR(1000) | No | Comment content (max 1000 chars) |
| selection_start | INT | Yes | Text selection start position |
| selection_end | INT | Yes | Text selection end position |
| selected_text | TEXT | Yes | Selected text snippet |
| parent_id | UUID | Yes | FK to document_comments (for replies) |
| status | ENUM | No | Comment status (OPEN/RESOLVED) |
| resolved_by_id | UUID | Yes | FK to users who resolved |
| resolved_at | TIMESTAMP | Yes | Resolution timestamp |
| hidden_at | TIMESTAMP | Yes | When comment was hidden (moderation) |
| hidden_by_id | UUID | Yes | FK to users who hid |
| hidden_reason | VARCHAR(255) | Yes | Reason for hiding |
| ip_address | VARCHAR(45) | Yes | Commenter IP (for rate limiting) |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Rate Limiting:**
- External comments limited to 20/hour per IP address by default
- Configurable per share link via `comment_rate_limit`

**Indexes:**
- `document_comments_document_id_idx` on document_id
- `document_comments_share_id_idx` on share_id
- `document_comments_user_id_idx` on user_id
- `document_comments_parent_id_idx` on parent_id
- `document_comments_status_idx` on status
- `document_comments_ip_address_created_at_idx` on (ip_address, created_at)

---

### document_drafts

Auto-save storage for document editing.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| document_id | UUID | No | FK to generated_documents (CASCADE) |
| user_id | UUID | No | FK to users |
| content | TEXT | No | Draft content |
| content_json | JSONB | Yes | TipTap JSON format |
| metadata | JSONB | Yes | Additional metadata |
| created_at | TIMESTAMP | No | Record creation time |

**Notes:**
- Only latest draft per user per document is kept
- Old drafts are deleted when new one is saved

**Indexes:**
- `document_drafts_document_id_idx` on document_id
- `document_drafts_user_id_created_at_idx` on (user_id, created_at)

---

### template_partials

Reusable template blocks (Phase 7 feature).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| name | VARCHAR(100) | No | Partial name (unique per tenant) |
| description | TEXT | Yes | Partial description |
| content | TEXT | No | HTML content |
| placeholders | JSONB | No | Placeholder definitions (default: []) |
| created_by_id | UUID | No | FK to users |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Indexes:**
- `template_partials_tenant_id_name_key` UNIQUE on (tenant_id, name)
- `template_partials_tenant_id_idx` on tenant_id

---

### ai_conversations

Chat history for AI assistant (Phase 7 feature).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| user_id | UUID | No | FK to users |
| context_type | VARCHAR(20) | No | 'template' or 'document' |
| context_id | UUID | Yes | Template or Document ID |
| messages | JSONB | No | Array of {role, content, timestamp} |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

**Indexes:**
- `ai_conversations_tenant_id_user_id_idx` on (tenant_id, user_id)
- `ai_conversations_context_type_context_id_idx` on (context_type, context_id)

---

## Document Generation Module Enums

### DocumentTemplateCategory
```sql
RESOLUTION      -- Board/shareholder resolutions
CONTRACT        -- Contracts and agreements
LETTER          -- Official letters
MINUTES         -- Meeting minutes
NOTICE          -- Notices (AGM, EGM, etc.)
CERTIFICATE     -- Certificates
OTHER           -- Other documents
```

### GeneratedDocumentStatus
```sql
DRAFT           -- Work in progress, editable
FINALIZED       -- Locked, ready for sharing/export
ARCHIVED        -- Historical, no longer active
```

### DocumentCommentStatus
```sql
OPEN            -- Active comment
RESOLVED        -- Comment addressed
```

---

## Document Generation Audit Actions

The following audit actions are specific to the Document Generation Module:

```sql
-- Template Operations
DOCUMENT_TEMPLATE_CREATED
DOCUMENT_TEMPLATE_UPDATED
DOCUMENT_TEMPLATE_DELETED
DOCUMENT_TEMPLATE_DUPLICATED

-- Document Operations
DOCUMENT_GENERATED
DOCUMENT_FINALIZED
DOCUMENT_UNFINALIZED
DOCUMENT_ARCHIVED
DOCUMENT_CLONED

-- Sharing Operations
SHARE_LINK_CREATED
SHARE_LINK_REVOKED

-- Letterhead Operations
LETTERHEAD_UPDATED

-- Comment Operations
COMMENT_CREATED
COMMENT_RESOLVED
COMMENT_HIDDEN
```

---

## Document Processing Module Tables

### ProcessingDocument

Extended document model for the processing pipeline.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| documentId | UUID | Reference to base Document |
| isContainer | Boolean | Whether this is a container document |
| parentProcessingDocId | UUID? | Parent container (for child documents) |
| pageFrom | Int? | Starting page (inclusive) |
| pageTo | Int? | Ending page (inclusive) |
| pageCount | Int? | Total page count |
| fileHash | String? | SHA-256 for duplicate detection |
| pipelineStatus | PipelineStatus | Current processing status |
| processingPriority | ProcessingPriority | Processing priority |
| duplicateStatus | DuplicateStatus | Duplicate detection status |
| currentRevisionId | UUID? | Current approved revision |
| lockVersion | Int | Optimistic locking version |
| lockedById | UUID? | User holding edit lock |
| uploadSource | UploadSource | WEB, EMAIL, API, CLIENT_PORTAL |

### DocumentPage

Rendered pages for UI highlights.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| processingDocumentId | UUID | Parent processing document |
| pageNumber | Int | Page number (1-indexed) |
| renderDpi | Int | Render resolution (default 200) |
| imagePath | String | Path to rendered image |
| widthPx | Int | Image width in pixels |
| heightPx | Int | Image height in pixels |
| ocrJson | JSON? | OCR word boxes and confidence |

### DocumentRevision

Immutable snapshots of structured accounting data.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| processingDocumentId | UUID | Parent processing document |
| revisionNumber | Int | Revision number (1, 2, 3...) |
| revisionType | RevisionType | EXTRACTION, USER_EDIT, REPROCESS |
| status | RevisionStatus | DRAFT, APPROVED, SUPERSEDED |
| documentCategory | DocumentCategory | ACCOUNTS_PAYABLE, TREASURY, etc. |
| documentSubCategory | DocumentSubCategory? | VENDOR_INVOICE, BANK_STATEMENT, etc. |
| vendorName | String? | Extracted vendor name |
| documentNumber | String? | Invoice/receipt number |
| documentDate | Date? | Document date |
| currency | String | ISO 4217 currency code |
| subtotal | Decimal(18,4)? | Subtotal amount |
| taxAmount | Decimal(18,4)? | Tax amount |
| totalAmount | Decimal(18,4) | Total amount |
| homeCurrency | String? | Home currency (company's currency) |
| homeExchangeRate | Decimal(18,6)? | Exchange rate used for conversion |
| homeExchangeRateSource | ExchangeRateSource? | MAS_DAILY, IRAS_MONTHLY_AVG, MANUAL, DOCUMENT |
| exchangeRateDate | Date? | Date of the exchange rate |
| homeSubtotal | Decimal(18,4)? | Subtotal in home currency |
| homeTaxAmount | Decimal(18,4)? | Tax in home currency |
| homeEquivalent | Decimal(18,4)? | Total in home currency |
| isHomeExchangeRateOverride | Boolean | User overrode exchange rate (default: false) |
| validationStatus | ValidationStatus | PENDING, VALID, WARNINGS, INVALID |
| createdById | UUID | User who created |
| approvedById | UUID? | User who approved |

### DocumentRevisionLineItem

Line items within a revision.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| revisionId | UUID | Parent revision |
| lineNo | Int | Line number |
| description | String | Line description |
| quantity | Decimal(18,4)? | Quantity |
| unitPrice | Decimal(18,4)? | Unit price |
| amount | Decimal(18,4) | Line amount |
| gstAmount | Decimal(18,4)? | GST amount |
| taxCode | String? | Tax code |
| homeAmount | Decimal(18,4)? | Line amount in home currency |
| homeGstAmount | Decimal(18,4)? | Line GST in home currency |
| isHomeAmountOverride | Boolean | User overrode home amount (default: false) |
| isHomeGstOverride | Boolean | User overrode home GST (default: false) |

### DocumentExtraction

Immutable AI/OCR outputs.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| processingDocumentId | UUID | Parent processing document |
| extractionType | ExtractionType | SPLIT or FIELDS |
| provider | String | AI provider (openai, anthropic) |
| model | String | Model used |
| rawJson | JSON | Raw extraction output |
| confidenceJson | JSON | Confidence scores |
| evidenceJson | JSON? | Bounding box evidence |
| tokensUsed | Int? | Token consumption |

### BankAccount

Bank accounts for reconciliation.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tenantId | UUID | Tenant reference |
| companyId | UUID | Company reference |
| name | String | Account name |
| accountNumber | String | Account number (encrypted) |
| currency | String | Account currency |

### BankTransaction

Bank transactions for matching.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| bankAccountId | UUID | Parent bank account |
| transactionDate | Date | Transaction date |
| description | String | Transaction description |
| amount | Decimal(18,4) | Transaction amount |
| transactionType | BankTransactionType | CREDIT, DEBIT, etc. |
| reconciliationStatus | ReconciliationStatus | UNMATCHED, MATCHED, etc. |

## Document Processing Module Enums

```typescript
enum PipelineStatus {
  UPLOADED
  QUEUED
  PROCESSING
  SPLIT_PENDING
  SPLIT_DONE
  EXTRACTION_DONE
  FAILED_RETRYABLE
  FAILED_PERMANENT
  DEAD_LETTER
}

enum RevisionStatus {
  DRAFT
  APPROVED
  SUPERSEDED
}

enum DocumentCategory {
  ACCOUNTS_PAYABLE      // Vendor/Purchase documents
  ACCOUNTS_RECEIVABLE   // Customer/Sales documents
  TREASURY              // Banking & Cash management
  TAX_COMPLIANCE        // Tax & Regulatory
  PAYROLL               // HR & Payroll
  CORPORATE_SECRETARIAL // Corporate governance
  CONTRACTS             // Legal agreements
  FINANCIAL_REPORTS     // Reporting & Analysis
  INSURANCE             // Risk management
  CORRESPONDENCE        // General communications
  OTHER                 // Uncategorized
}

enum DocumentSubCategory {
  // See src/lib/document-categories.ts for full mapping
  // Each category has 2-6 sub-categories, e.g.:
  // ACCOUNTS_PAYABLE: VENDOR_INVOICE, VENDOR_CREDIT_NOTE, PURCHASE_ORDER, etc.
  // TREASURY: BANK_STATEMENT, BANK_ADVICE, PAYMENT_VOUCHER, etc.
}

enum DuplicateStatus {
  NONE
  SUSPECTED
  CONFIRMED
  REJECTED
}

enum DuplicateAction {
  CONFIRM_DUPLICATE
  REJECT_DUPLICATE
  MARK_AS_NEW_VERSION
}
```

---

## Document Tagging Tables

### document_tags

Custom tags for organizing and categorizing processing documents. Supports a hybrid scope system with tenant-level (shared) tags and company-level tags.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (required) |
| company_id | UUID | Yes | FK to companies (NULL = tenant-level shared tag, UUID = company-specific tag) |
| name | VARCHAR | No | Tag name (e.g., "Quarterly", "Urgent", "Tax Filing") |
| color | TagColor | No | Tag color (default: GRAY) |
| description | TEXT | Yes | Optional description |
| usage_count | INT | No | Number of times used (default: 0) |
| last_used_at | TIMESTAMP | Yes | Last time tag was used |
| created_by_id | UUID | No | FK to users who created the tag |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Tag Scope System:**
- `company_id = NULL` - **Tenant Tag** (shared across all companies in the tenant)
- `company_id = UUID` - **Company Tag** (specific to one company only)

**Permissions:**
- **Tenant Tags**: Only SUPER_ADMIN or TENANT_ADMIN can create/edit/delete
- **Company Tags**: Any user with access to the company can create/edit/delete

**Visual Differentiation:** Tenant tags display a globe icon in the UI to indicate they're shared across companies.

**Indexes:**
- `document_tags_tenant_id_company_id_name_deleted_at_key` UNIQUE on (tenant_id, company_id, name, deleted_at)
- `document_tags_tenant_id_deleted_at_idx` on (tenant_id, deleted_at) - For fetching tenant tags

---

### processing_document_tags

Many-to-many relationship linking processing documents to tags.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| processing_document_id | UUID | No | FK to processing_documents (CASCADE) |
| tag_id | UUID | No | FK to document_tags (CASCADE) |
| added_by_id | UUID | No | FK to users who added the tag |
| added_at | TIMESTAMP | No | When tag was added (default: now) |

**Indexes:**
- `processing_document_tags_processing_document_id_tag_id_key` UNIQUE on (processing_document_id, tag_id)
- `processing_document_tags_processing_document_id_idx` on processing_document_id
- `processing_document_tags_tag_id_idx` on tag_id

---

### TagColor Enum

```sql
GRAY        -- Default neutral color
RED         -- High priority / Urgent
ORANGE      -- Warning / Attention
YELLOW      -- Highlight
GREEN       -- Success / Approved
BLUE        -- Information
PURPLE      -- Special / Premium
PINK        -- Personal / Custom
```

---

## Chart of Accounts Module Tables

### chart_of_accounts

Hierarchical chart of accounts with support for system defaults, tenant-level customization, and company-level overrides.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | Yes | FK to tenants (null = system-level default) |
| company_id | UUID | Yes | FK to companies (null = tenant-level, not company-specific) |
| code | VARCHAR(20) | No | Account code (e.g., "6100") |
| name | VARCHAR(200) | No | Account name (e.g., "Advertising & Marketing") |
| description | VARCHAR(500) | Yes | Optional description |
| account_type | AccountType | No | ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE |
| status | AccountStatus | No | ACTIVE, INACTIVE, ARCHIVED (default: ACTIVE) |
| parent_id | UUID | Yes | Self-reference for hierarchy |
| sort_order | INTEGER | No | Display order (default: 0) |
| is_system | BOOLEAN | No | Whether this is a system-defined account (default: false) |
| is_tax_applicable | BOOLEAN | No | Whether tax calculations apply (default: true) |
| created_at | TIMESTAMP | No | Creation timestamp |
| updated_at | TIMESTAMP | No | Last update timestamp |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Unique Constraint:** `(tenant_id, company_id, code)` - Account codes are unique within a scope.

**Account Resolution:** When resolving accounts for a document, the system looks up in order:
1. Company-level accounts (matching tenantId and companyId)
2. Tenant-level accounts (matching tenantId, null companyId)
3. System-level accounts (null tenantId, null companyId)

### chart_of_accounts_mappings

Maps Oakcloud accounts to external accounting platform codes (Xero, Odoo, etc.). Mappings are company-specific.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| account_id | UUID | No | FK to chart_of_accounts |
| company_id | UUID | No | FK to companies (mappings are per-company) |
| provider | AccountingProvider | No | XERO, QUICKBOOKS, MYOB, SAGE |
| external_code | VARCHAR(50) | Yes | External platform's account code |
| external_id | VARCHAR(100) | Yes | External platform's account ID |
| external_name | VARCHAR(200) | Yes | External platform's account name |
| last_synced_at | TIMESTAMP | Yes | Last sync timestamp |
| sync_status | VARCHAR | Yes | Sync status (PENDING, SYNCED, ERROR) |
| created_at | TIMESTAMP | No | Creation timestamp |
| updated_at | TIMESTAMP | No | Last update timestamp |

**Unique Constraint:** `(account_id, company_id, provider)` - One mapping per account/company/provider.

## Chart of Accounts Module Enums

### AccountType

```sql
ASSET       -- Resources owned (cash, inventory, equipment)
LIABILITY   -- Debts and obligations (loans, payables)
EQUITY      -- Owner's stake (capital, retained earnings)
REVENUE     -- Income (sales, service fees)
EXPENSE     -- Costs (salaries, rent, utilities)
```

### AccountStatus

```sql
ACTIVE      -- Active and available for use
INACTIVE    -- Temporarily disabled
ARCHIVED    -- No longer in use
```

## Chart of Accounts Audit Actions

```sql
CHART_OF_ACCOUNTS_CREATED    -- Account created
CHART_OF_ACCOUNTS_UPDATED    -- Account updated
CHART_OF_ACCOUNTS_DELETED    -- Account deleted (soft)
CHART_OF_ACCOUNTS_MAPPING_CREATED  -- Mapping created
CHART_OF_ACCOUNTS_MAPPING_UPDATED  -- Mapping updated
CHART_OF_ACCOUNTS_MAPPING_DELETED  -- Mapping deleted
```

## Chart of Accounts Seed Data

The system seeds 53 standard Singapore chart of accounts (SFRS-aligned) as system-level defaults:

- **Assets (1xxx)**: Current Assets, Cash, AR, Inventory, Fixed Assets, etc.
- **Liabilities (2xxx)**: AP, Accrued Expenses, GST Payable, Long-term Loans, etc.
- **Equity (3xxx)**: Share Capital, Retained Earnings, Reserves, Dividends
- **Revenue (4xxx)**: Sales, Service Revenue, Interest Income, Other Income
- **COGS (5xxx)**: Cost of Goods Sold, Direct Labor, Direct Materials
- **Operating Expenses (6xxx-7xxx)**: Advertising, Bank Charges, Rent, Utilities, etc.
- **Tax Expenses (8xxx)**: Income Tax, Deferred Tax

---

## Exchange Rate Module Tables

### exchange_rates

Exchange rates for multi-currency document processing. Supports MAS (Monetary Authority of Singapore) daily rates and manual tenant overrides.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | Yes | FK to tenants (null = system-wide rate, non-null = tenant override) |
| source_currency | VARCHAR | No | Source currency ISO 4217 code (e.g., USD, EUR) |
| target_currency | VARCHAR | No | Target currency (default: SGD) |
| rate | DECIMAL(18,8) | No | Exchange rate (source → target) |
| inverse_rate | DECIMAL(18,8) | Yes | Inverse rate (1/rate) for convenience |
| rate_date | DATE | No | Effective date of the rate |
| rate_type | ENUM | No | Rate source type (see ExchangeRateType enum) |
| is_manual_override | BOOLEAN | No | Whether this is a manual override |
| manual_reason | TEXT | Yes | Reason for manual rate (required for overrides) |
| created_by_id | UUID | Yes | FK to users who created (for manual rates) |
| fetched_at | TIMESTAMP | No | When rate was fetched/created |
| source_ref | VARCHAR | Yes | Source URL or dataset identifier |
| source_hash | VARCHAR | Yes | Checksum for audit |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

**Rate Lookup Priority:**
1. Tenant-specific override (if tenantId matches)
2. System rate for exact date
3. Fallback to most recent system rate

**Indexes:**
- `exchange_rates_tenant_id_source_currency_target_currency_rate_date_rate_type_key` UNIQUE
- `exchange_rates_tenant_id_idx` on tenant_id
- `exchange_rates_source_currency_target_currency_rate_date_idx`
- `exchange_rates_rate_date_idx` on rate_date
- `exchange_rates_source_currency_rate_date_idx`

---

## Exchange Rate Module Enums

### ExchangeRateSource
```sql
MAS_DAILY            -- MAS (Monetary Authority of Singapore) daily end-of-day rates
IRAS_MONTHLY_AVG     -- IRAS monthly average rates from Data.gov.sg
MANUAL               -- Manually entered rates
PROVIDER_DEFAULT     -- Default rate from AI provider
DOCUMENT             -- Extracted from the document itself (e.g., invoice shows SGD equivalent)
```

### Rate Preference (Tenant Settings)

Tenants can choose their preferred rate type for currency conversion. This is stored in the `Tenant.settings` JSON field:

```json
{
  "exchangeRate": {
    "preferredRateType": "MONTHLY"  // "MONTHLY" or "DAILY"
  }
}
```

- **MONTHLY** (default): Uses MAS monthly end-of-period rates
- **DAILY**: Uses MAS daily rates for more precise day-to-day conversion

**Rate Lookup Priority with Preferences:**
1. Tenant-specific manual override for exact date
2. Tenant's preferred rate type:
   - **MONTHLY**: Looks up `MAS_MONTHLY_RATE` for the **first day of the document's month** (e.g., doc dated Nov 19 → Nov 1 rate)
   - **DAILY**: Looks up `MAS_DAILY_RATE` for the **exact document date**
3. System rate of preferred type
4. Fallback to most recent available system rate

---

## Exchange Rate Audit Actions

```sql
EXCHANGE_RATE_SYNCED     -- Batch sync from external source (MAS API)
EXCHANGE_RATE_CREATED    -- Manual rate created
EXCHANGE_RATE_UPDATED    -- Rate updated
EXCHANGE_RATE_DELETED    -- Rate deleted
```

## Exchange Rate Data Sources

### MAS APIMG Gateway API

The system uses MAS's (Monetary Authority of Singapore) APIMG Gateway API which requires API key authentication. Both daily and monthly rates are sourced from MAS.

**Monthly End-of-Period Rates:**
- **Endpoint**: `https://eservices.mas.gov.sg/apimg-gw/server/monthly_statistical_bulletin_non610ora/exchange_rates_end_of_period_monthly/views/exchange_rates_end_of_period_monthly`
- **Authentication**: API Key via `KeyId` header
- **Update Frequency**: Monthly (end-of-month rates)
- **Currencies**: USD, EUR, GBP, JPY, AUD, CAD, CNY, HKD, INR, IDR, KRW, MYR, NZD, PHP, QAR, SAR, CHF, TWD, THB, AED, VND (21 currencies)
- **Date Storage**: MAS returns rates for the last day of the month (e.g., Nov 30). These are stored with `rateDate` as the **first day of the following month** (e.g., Dec 1). This simplifies lookup: a document dated Nov 19 uses the Nov 1 rate (which represents October's end-of-month rate).

**Daily End-of-Period Rates:**
- **Endpoint**: `https://eservices.mas.gov.sg/apimg-gw/server/monthly_statistical_bulletin_non610ora/exchange_rates_end_of_period_daily/views/exchange_rates_end_of_period_daily`
- **Authentication**: API Key via `KeyId` header
- **Update Frequency**: Daily (end-of-day rates, typically updated around 6 PM SGT)
- **Currencies**: Same as monthly

**API Key Management:**
- API keys expire annually and must be renewed
- Current expiry: December 26, 2026
- System warns SUPER_ADMIN 30 days before expiry
- Keys configured via environment variables: `MAS_MONTHLY_API_KEY`, `MAS_DAILY_API_KEY`

### Scheduled Sync
The system automatically syncs exchange rates daily at 6 AM SGT:
1. **MAS Daily Rates**: Always synced (if enabled via `SCHEDULER_EXCHANGE_RATE_MAS_DAILY_ENABLED`)
2. **MAS Monthly Rates**: Synced on days 1-5 of each month for previous month's data (if enabled via `SCHEDULER_EXCHANGE_RATE_MAS_MONTHLY_ENABLED`)

### Environment Variables
```bash
# Enable/disable scheduled sync (both default to true)
SCHEDULER_EXCHANGE_RATE_SYNC_ENABLED=true
SCHEDULER_EXCHANGE_RATE_MAS_DAILY_ENABLED=true
SCHEDULER_EXCHANGE_RATE_MAS_MONTHLY_ENABLED=true

# API Keys (required for sync)
MAS_MONTHLY_API_KEY=your-monthly-api-key
MAS_DAILY_API_KEY=your-daily-api-key
MAS_API_KEY_EXPIRY=2026-12-26  # For expiry warnings
```

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
