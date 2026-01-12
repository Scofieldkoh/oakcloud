# Document Generation - Database Schema

> **Last Updated**: 2025-01-12
> **Audience**: Developers

Database tables and relationships for the Document Generation module.

## Related Documents

- [Overview](./OVERVIEW.md) - Module overview
- [Database Schema (Full)](../../reference/DATABASE_SCHEMA.md) - Complete schema reference

---

## Tables

### document_templates

Document template definitions with versioning support.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants |
| name | VARCHAR(200) | No | Template name |
| description | TEXT | Yes | Template description |
| category | VARCHAR(50) | No | Category (RESOLUTION, CONTRACT, LETTER, OTHER) |
| content | TEXT | No | Template content with placeholders (HTML) |
| placeholders | JSONB | No | Extracted placeholder definitions |
| is_active | BOOLEAN | No | Template availability (default: true) |
| default_share_expiry_hours | INT | Yes | Default share link expiration (null = never) |
| version | INT | No | Version number (default: 1) |
| created_by_id | UUID | No | FK to users |
| updated_by_id | UUID | Yes | FK to users |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Indexes:**
- `document_templates_tenant_id_idx` on tenant_id
- `document_templates_category_idx` on category
- `document_templates_tenant_id_deleted_at_idx` on (tenant_id, deleted_at)

---

### generated_documents

Generated document instances from templates.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants |
| template_id | UUID | Yes | FK to document_templates |
| template_version | INT | Yes | Version of template used |
| company_id | UUID | Yes | FK to companies (primary context) |
| title | VARCHAR(300) | No | Document title |
| content | TEXT | No | Final rendered HTML content |
| content_json | JSONB | Yes | Structured content for navigation |
| status | VARCHAR(20) | No | DRAFT, FINALIZED, ARCHIVED |
| finalized_at | TIMESTAMP | Yes | When document was finalized |
| finalized_by_id | UUID | Yes | FK to users who finalized |
| unfinalized_at | TIMESTAMP | Yes | When un-finalized (audit trail) |
| unfinalized_by_id | UUID | Yes | FK to users who un-finalized |
| use_letterhead | BOOLEAN | No | Include letterhead in PDF (default: true) |
| share_expiry_hours | INT | Yes | Override share expiration |
| metadata | JSONB | Yes | Additional context (resolution number, etc.) |
| created_by_id | UUID | No | FK to users |
| updated_by_id | UUID | Yes | FK to users |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Indexes:**
- `generated_documents_tenant_id_idx` on tenant_id
- `generated_documents_template_id_idx` on template_id
- `generated_documents_company_id_idx` on company_id
- `generated_documents_status_idx` on status

---

### document_shares

Shareable document links with access control.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| document_id | UUID | No | FK to generated_documents |
| share_token | VARCHAR(64) | No | Unique share token (URL-safe) |
| expires_at | TIMESTAMP | Yes | Expiration time (null = never) |
| password_hash | VARCHAR(255) | Yes | Optional password protection |
| is_active | BOOLEAN | No | Share link active (default: true) |
| view_count | INT | No | Number of views (default: 0) |
| last_viewed_at | TIMESTAMP | Yes | Last view timestamp |
| allowed_actions | VARCHAR[] | No | Actions: ['view', 'download', 'print'] |
| allow_comments | BOOLEAN | No | Allow external comments (default: false) |
| comment_rate_limit | INT | No | Max comments/hour/IP (default: 20) |
| notify_on_comment | BOOLEAN | No | Notify owner on comments |
| notify_on_view | BOOLEAN | No | Notify owner on views |
| created_by_id | UUID | No | FK to users |
| created_at | TIMESTAMP | No | Record creation time |
| revoked_at | TIMESTAMP | Yes | When link was revoked |

**Indexes:**
- `document_shares_share_token_key` UNIQUE on share_token
- `document_shares_document_id_idx` on document_id
- `document_shares_expires_at_idx` on expires_at

---

### document_comments

Comments on documents for review workflows.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| document_id | UUID | No | FK to generated_documents |
| share_id | UUID | Yes | FK to document_shares (external comments) |
| user_id | UUID | Yes | FK to users (null for external) |
| guest_name | VARCHAR(100) | Yes | External commenter's name |
| guest_email | VARCHAR(255) | Yes | External commenter's email |
| content | TEXT | No | Comment content (max 1,000 chars) |
| selection_start | INT | Yes | Start position of selected text |
| selection_end | INT | Yes | End position of selected text |
| selected_text | TEXT | Yes | Snapshot of selected text |
| parent_id | UUID | Yes | FK to document_comments (replies) |
| status | VARCHAR(20) | No | OPEN, RESOLVED |
| resolved_by_id | UUID | Yes | FK to users who resolved |
| resolved_at | TIMESTAMP | Yes | When resolved |
| ip_address | VARCHAR(45) | Yes | IP for rate limiting |
| created_at | TIMESTAMP | No | Record creation time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Notes:**
- Internal users: `user_id` set, `guest_name` null
- External commenters: `user_id` null, `guest_name` required
- Rate limiting: max 20 comments/hour per IP

---

### tenant_letterheads

Tenant letterhead configuration for PDF exports.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants (UNIQUE) |
| header_html | TEXT | Yes | Header HTML content |
| footer_html | TEXT | Yes | Footer HTML content |
| header_image_url | VARCHAR(500) | Yes | Header image path |
| footer_image_url | VARCHAR(500) | Yes | Footer image path |
| logo_url | VARCHAR(500) | Yes | Company logo path |
| page_margins | JSONB | No | Margins: {top, right, bottom, left} |
| is_enabled | BOOLEAN | No | Enable letterhead (default: true) |

---

### document_sections

Section definitions for navigation in shareable pages.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| document_id | UUID | No | FK to generated_documents |
| title | VARCHAR(200) | No | Section title |
| anchor | VARCHAR(100) | No | URL anchor/slug |
| order | INT | No | Display order |
| level | INT | No | Heading level (1-6) |
| page_break_before | BOOLEAN | No | Insert page break before |

---

### template_partials

Reusable content blocks for templates.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants |
| name | VARCHAR(100) | No | Partial name |
| description | TEXT | Yes | Description |
| content | TEXT | No | HTML content |
| category | VARCHAR(50) | No | Category |
| placeholders | JSONB | No | Placeholder definitions |
| is_active | BOOLEAN | No | Active (default: true) |

---

## Enums

```sql
-- Document template categories
CREATE TYPE DocumentCategory AS ENUM (
  'RESOLUTION',     -- Board/shareholder resolutions
  'CONTRACT',       -- Contracts and agreements
  'LETTER',         -- Formal letters
  'NOTICE',         -- Notices and announcements
  'MINUTES',        -- Meeting minutes
  'CERTIFICATE',    -- Certificates
  'OTHER'           -- Miscellaneous
);

-- Generated document status
CREATE TYPE DocumentStatus AS ENUM (
  'DRAFT',          -- In progress, editable
  'FINALIZED',      -- Locked, ready for sharing/export
  'ARCHIVED'        -- No longer active
);
```

---

## Relationships

```
DocumentTemplate (1) ──────────> (N) GeneratedDocument
                                      │
                                      ├──> (N) DocumentShare
                                      │         │
                                      │         └──> (N) DocumentComment
                                      │
                                      └──> (N) DocumentSection

Tenant (1) ──────────> (1) TenantLetterhead
       │
       └──────────────> (N) TemplatePartial
```
