# Document Generation Module - Design Document

## Table of Contents

- [Overview](#overview)
- [Goals & Requirements](#goals--requirements)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Service Layer](#service-layer)
- [API Endpoints](#api-endpoints)
- [UI Components](#ui-components)
- [Template System](#template-system)
- [PDF Generation](#pdf-generation)
- [Shareable Documents](#shareable-documents)
- [Integration Points](#integration-points)
- [Security Considerations](#security-considerations)
- [Accessibility (WCAG 2.1)](#accessibility-wcag-21)
- [SEO & Meta Tags](#seo--meta-tags)
- [Performance Considerations](#performance-considerations)
- [Additional Features](#additional-features)
- [Implementation Phases](#implementation-phases)

---

## Overview

The Document Generation Module enables corporate secretaries to draft resolutions, contracts, and other legal documents using pre-defined templates populated with company and contact data from the system. Documents can be previewed, edited, exported to PDF (with optional letterhead), and shared via unique URLs.

### Key Capabilities

1. **Template Management** - Create/manage reusable document templates with placeholders
2. **Document Generation** - Generate documents from templates with auto-populated data
3. **Live Preview & Editing** - Edit generated content before finalizing
4. **PDF Export** - Export to PDF with optional tenant letterhead
5. **Shareable Pages** - Generate unique URLs for external viewing
6. **Page Breaks** - Customizable page breaks for contracts and multi-page documents
7. **Modular Design** - Expose interfaces for future workflow integration

---

## Goals & Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Select from pre-drafted template library | Must |
| FR-2 | Auto-populate placeholders from company/contact data | Must |
| FR-3 | Preview document with live editing capability | Must |
| FR-4 | Insert customizable page breaks | Must |
| FR-5 | Generate shareable webpage with section navigation | Must |
| FR-6 | Export to PDF format | Must |
| FR-7 | Support tenant letterhead in PDF exports | Should |
| FR-8 | Template default settings (e.g., share expiration) | Should |
| FR-9 | Document audit trail | Must |
| FR-10 | Modular interfaces for workflow integration | Must |

### Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Multi-tenant isolation for templates and documents |
| NFR-2 | RBAC integration for create/read/update/delete operations |
| NFR-3 | Consistent with existing service patterns |
| NFR-4 | Shareable links must be secure (unguessable tokens) |
| NFR-5 | PDF generation should handle up to 100 pages |

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DOCUMENT GENERATION MODULE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │ Template Editor │    │Document Generator│    │  PDF Exporter   │          │
│  │   (UI/Admin)    │───▶│   (Service)      │───▶│   (Service)     │          │
│  └─────────────────┘    └────────┬─────────┘    └─────────────────┘          │
│                                  │                                            │
│                                  ▼                                            │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │ Placeholder     │    │Generated Document│    │ Share Service   │          │
│  │ Resolver        │───▶│   (Database)     │───▶│ (Public URLs)   │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
│                                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                         INTEGRATION INTERFACES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │ IDocumentGenerator│  │ IDocumentExporter│    │IDocumentPublisher│         │
│  │ .generate()      │    │ .toPDF()        │    │ .publish()       │          │
│  │ .preview()       │    │ .toHTML()       │    │ .getShareUrl()   │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
│                                                                               │
│  Future: Workflow Module can call these interfaces                            │
│  ┌────────────────────────────────────────────────────────────────┐          │
│  │ Workflow → Generate Doc → E-Sign → URL Shortener → Email/SMS   │          │
│  └────────────────────────────────────────────────────────────────┘          │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Responsibility |
|-----------|----------------|
| **Template Service** | CRUD operations for document templates |
| **Placeholder Resolver** | Resolve placeholders to actual data |
| **Document Generator** | Generate documents from templates |
| **PDF Exporter** | Convert HTML content to PDF with letterhead |
| **Share Service** | Generate and manage shareable URLs |
| **Letterhead Service** | Manage tenant letterhead assets |

---

## Database Schema

### New Tables

#### document_templates

Document template definitions with versioning support.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants |
| name | VARCHAR(200) | No | Template name |
| description | TEXT | Yes | Template description |
| category | VARCHAR(50) | No | Category (RESOLUTION, CONTRACT, LETTER, OTHER) |
| content | TEXT | No | Template content with placeholders (HTML/Markdown) |
| placeholders | JSONB | No | Extracted placeholder definitions |
| is_active | BOOLEAN | No | Template availability (default: true) |
| default_share_expiry_hours | INT | Yes | Default share link expiration in hours (null = never) |
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

#### generated_documents

Generated document instances from templates.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants |
| template_id | UUID | Yes | FK to document_templates (nullable for imports) |
| template_version | INT | Yes | Version of template used |
| company_id | UUID | Yes | FK to companies (primary context) |
| title | VARCHAR(300) | No | Document title |
| content | TEXT | No | Final rendered HTML content |
| content_json | JSONB | Yes | Structured content for section navigation |
| status | VARCHAR(20) | No | DRAFT, FINALIZED, ARCHIVED |
| finalized_at | TIMESTAMP | Yes | When document was finalized |
| finalized_by_id | UUID | Yes | FK to users who finalized |
| unfinalized_at | TIMESTAMP | Yes | When document was un-finalized (audit trail) |
| unfinalized_by_id | UUID | Yes | FK to users who un-finalized |
| use_letterhead | BOOLEAN | No | Include tenant letterhead in PDF (default: true) |
| share_expiry_hours | INT | Yes | Override share expiration (from template default) |
| metadata | JSONB | Yes | Additional context (e.g., resolution number) |
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
- `generated_documents_tenant_id_deleted_at_idx` on (tenant_id, deleted_at)

---

#### document_shares

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
| allowed_actions | VARCHAR[] | No | Actions allowed: ['view', 'download', 'print'] |
| allow_comments | BOOLEAN | No | Allow external viewers to leave comments (default: false) |
| comment_rate_limit | INT | No | Max comments per hour per IP (default: 20) |
| notify_on_comment | BOOLEAN | No | Notify owner on new comments (default: false) |
| notify_on_view | BOOLEAN | No | Notify owner on views (default: false) |
| created_by_id | UUID | No | FK to users |
| created_at | TIMESTAMP | No | Record creation time |
| revoked_at | TIMESTAMP | Yes | When link was revoked |

**Indexes:**
- `document_shares_share_token_key` UNIQUE on share_token
- `document_shares_document_id_idx` on document_id
- `document_shares_expires_at_idx` on expires_at

---

#### tenant_letterheads

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
| page_margins | JSONB | No | Margins in mm: {top, right, bottom, left} |
| is_enabled | BOOLEAN | No | Enable letterhead (default: true) |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

**Indexes:**
- `tenant_letterheads_tenant_id_key` UNIQUE on tenant_id

---

#### document_sections

Section definitions for navigation in shareable pages.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| document_id | UUID | No | FK to generated_documents |
| title | VARCHAR(200) | No | Section title |
| anchor | VARCHAR(100) | No | URL anchor/slug |
| order | INT | No | Display order |
| level | INT | No | Heading level (1-6) |
| page_break_before | BOOLEAN | No | Insert page break before (default: false) |
| created_at | TIMESTAMP | No | Record creation time |

**Indexes:**
- `document_sections_document_id_idx` on document_id
- `document_sections_document_id_order_idx` on (document_id, order)

---

#### ai_conversations

AI conversation threads for template/document editing assistance (optional persistence).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| tenant_id | UUID | No | FK to tenants |
| user_id | UUID | No | FK to users |
| context_type | VARCHAR(20) | No | Context type: 'template' or 'document' |
| context_id | UUID | Yes | FK to template or document (null for general) |
| messages | JSONB | No | Array of {role, content, timestamp} |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |

**Indexes:**
- `ai_conversations_tenant_id_user_id_idx` on (tenant_id, user_id)
- `ai_conversations_context_type_context_id_idx` on (context_type, context_id)

---

#### document_comments

Comments and annotations on documents for review workflows. Supports both internal users and external/anonymous commenters via shared links.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| document_id | UUID | No | FK to generated_documents |
| share_id | UUID | Yes | FK to document_shares (if comment from shared link) |
| user_id | UUID | Yes | FK to users (internal commenter, null for external) |
| guest_name | VARCHAR(100) | Yes | External commenter's name |
| guest_email | VARCHAR(255) | Yes | External commenter's email (optional) |
| content | TEXT | No | Comment content |
| selection_start | INT | Yes | Start position of selected text |
| selection_end | INT | Yes | End position of selected text |
| selected_text | TEXT | Yes | Snapshot of selected text |
| parent_id | UUID | Yes | FK to document_comments (for replies) |
| status | VARCHAR(20) | No | OPEN, RESOLVED (default: OPEN) |
| resolved_by_id | UUID | Yes | FK to users who resolved |
| resolved_at | TIMESTAMP | Yes | When comment was resolved |
| hidden_at | TIMESTAMP | Yes | When comment was hidden (moderation) |
| hidden_by_id | UUID | Yes | FK to users who hid the comment |
| hidden_reason | VARCHAR(255) | Yes | Reason for hiding |
| ip_address | VARCHAR(45) | Yes | IP address of commenter (for rate limiting) |
| created_at | TIMESTAMP | No | Record creation time |
| updated_at | TIMESTAMP | No | Last update time |
| deleted_at | TIMESTAMP | Yes | Soft delete timestamp |

**Notes:**
- For internal users: `user_id` is set, `guest_name`/`guest_email` are null
- For external commenters: `user_id` is null, `guest_name` is required, `guest_email` optional
- `share_id` tracks which share link was used for external comments
- `content` has a maximum length of 1,000 characters
- `ip_address` is used for rate limiting external comments (max 20/hour per IP)

**Indexes:**
- `document_comments_document_id_idx` on document_id
- `document_comments_share_id_idx` on share_id
- `document_comments_user_id_idx` on user_id
- `document_comments_parent_id_idx` on parent_id
- `document_comments_status_idx` on status

---

#### document_drafts

Auto-save storage for document drafts.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | No | Primary key |
| document_id | UUID | No | FK to generated_documents |
| user_id | UUID | No | FK to users |
| content | TEXT | No | Draft content snapshot |
| metadata | JSONB | Yes | Additional draft metadata |
| created_at | TIMESTAMP | No | Auto-save timestamp |

**Indexes:**
- `document_drafts_document_id_idx` on document_id
- `document_drafts_user_id_created_at_idx` on (user_id, created_at)

**Note:** Old drafts are automatically cleaned up after the document is saved.

---

### Enums

```sql
-- Document template categories
CREATE TYPE DocumentCategory AS ENUM (
  'RESOLUTION',          -- Board/shareholder resolutions
  'CONTRACT',            -- Contracts and agreements
  'LETTER',              -- Formal letters
  'NOTICE',              -- Notices and announcements
  'MINUTES',             -- Meeting minutes
  'CERTIFICATE',         -- Certificates
  'OTHER'                -- Miscellaneous
);

-- Generated document status
CREATE TYPE DocumentStatus AS ENUM (
  'DRAFT',               -- In progress, editable
  'FINALIZED',           -- Locked, ready for sharing/export
  'ARCHIVED'             -- No longer active
);
```

---

### Prisma Schema Addition

```prisma
// Document Templates
model DocumentTemplate {
  id            String   @id @default(uuid())
  tenantId      String   @map("tenant_id")
  name          String   @db.VarChar(200)
  description   String?  @db.Text
  category      String   @db.VarChar(50)
  content       String   @db.Text
  placeholders  Json     @default("[]")
  isActive      Boolean  @default(true) @map("is_active")
  defaultShareExpiryHours Int? @map("default_share_expiry_hours")
  version       Int      @default(1)
  createdById   String   @map("created_by_id")
  updatedById   String?  @map("updated_by_id")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  deletedAt     DateTime? @map("deleted_at")

  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  createdBy     User     @relation("TemplateCreatedBy", fields: [createdById], references: [id])
  updatedBy     User?    @relation("TemplateUpdatedBy", fields: [updatedById], references: [id])
  documents     GeneratedDocument[]

  @@index([tenantId])
  @@index([category])
  @@index([tenantId, deletedAt])
  @@map("document_templates")
}

// Generated Documents
model GeneratedDocument {
  id              String    @id @default(uuid())
  tenantId        String    @map("tenant_id")
  templateId      String?   @map("template_id")
  templateVersion Int?      @map("template_version")
  companyId       String?   @map("company_id")
  title           String    @db.VarChar(300)
  content         String    @db.Text
  contentJson     Json?     @map("content_json")
  status          String    @default("DRAFT") @db.VarChar(20)
  finalizedAt     DateTime? @map("finalized_at")
  finalizedById   String?   @map("finalized_by_id")
  unfinalizedAt   DateTime? @map("unfinalized_at")
  unfinalizedById String?   @map("unfinalized_by_id")
  useLetterhead   Boolean   @default(true) @map("use_letterhead")
  shareExpiryHours Int?     @map("share_expiry_hours")
  metadata        Json?
  createdById     String    @map("created_by_id")
  updatedById     String?   @map("updated_by_id")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")

  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  template        DocumentTemplate? @relation(fields: [templateId], references: [id])
  company         Company?  @relation(fields: [companyId], references: [id])
  createdBy       User      @relation("DocumentCreatedBy", fields: [createdById], references: [id])
  updatedBy       User?     @relation("DocumentUpdatedBy", fields: [updatedById], references: [id])
  finalizedBy     User?     @relation("DocumentFinalizedBy", fields: [finalizedById], references: [id])
  unfinalizedBy   User?     @relation("DocumentUnfinalizedBy", fields: [unfinalizedById], references: [id])
  shares          DocumentShare[]
  sections        DocumentSection[]

  @@index([tenantId])
  @@index([templateId])
  @@index([companyId])
  @@index([status])
  @@index([tenantId, deletedAt])
  @@map("generated_documents")
}

// Document Shares
model DocumentShare {
  id              String    @id @default(uuid())
  documentId      String    @map("document_id")
  shareToken      String    @unique @map("share_token") @db.VarChar(64)
  expiresAt       DateTime? @map("expires_at")
  passwordHash    String?   @map("password_hash") @db.VarChar(255)
  isActive        Boolean   @default(true) @map("is_active")
  viewCount       Int       @default(0) @map("view_count")
  lastViewedAt    DateTime? @map("last_viewed_at")
  allowedActions  String[]  @default(["view"]) @map("allowed_actions")
  allowComments   Boolean   @default(false) @map("allow_comments")
  commentRateLimit Int      @default(20) @map("comment_rate_limit")
  notifyOnComment Boolean   @default(false) @map("notify_on_comment")
  notifyOnView    Boolean   @default(false) @map("notify_on_view")
  createdById     String    @map("created_by_id")
  createdAt       DateTime  @default(now()) @map("created_at")
  revokedAt       DateTime? @map("revoked_at")

  document        GeneratedDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  createdBy       User      @relation(fields: [createdById], references: [id])
  comments        DocumentComment[] // Comments made via this share link

  @@index([documentId])
  @@index([expiresAt])
  @@map("document_shares")
}

// Tenant Letterheads
model TenantLetterhead {
  id              String   @id @default(uuid())
  tenantId        String   @unique @map("tenant_id")
  headerHtml      String?  @map("header_html") @db.Text
  footerHtml      String?  @map("footer_html") @db.Text
  headerImageUrl  String?  @map("header_image_url") @db.VarChar(500)
  footerImageUrl  String?  @map("footer_image_url") @db.VarChar(500)
  logoUrl         String?  @map("logo_url") @db.VarChar(500)
  pageMargins     Json     @default("{\"top\": 25, \"right\": 20, \"bottom\": 25, \"left\": 20}") @map("page_margins")
  isEnabled       Boolean  @default(true) @map("is_enabled")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  tenant          Tenant   @relation(fields: [tenantId], references: [id])

  @@map("tenant_letterheads")
}

// Document Sections (for navigation)
model DocumentSection {
  id              String   @id @default(uuid())
  documentId      String   @map("document_id")
  title           String   @db.VarChar(200)
  anchor          String   @db.VarChar(100)
  order           Int
  level           Int      @default(1)
  pageBreakBefore Boolean  @default(false) @map("page_break_before")
  createdAt       DateTime @default(now()) @map("created_at")

  document        GeneratedDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@index([documentId, order])
  @@map("document_sections")
}

// Document Comments (for review - supports internal users and external guests)
model DocumentComment {
  id              String    @id @default(uuid())
  documentId      String    @map("document_id")
  shareId         String?   @map("share_id")  // Which share link was used (for external comments)
  userId          String?   @map("user_id")   // Nullable for external commenters
  guestName       String?   @map("guest_name") @db.VarChar(100)  // External commenter name
  guestEmail      String?   @map("guest_email") @db.VarChar(255) // External commenter email (optional)
  content         String    @db.VarChar(1000) // Max 1000 characters
  selectionStart  Int?      @map("selection_start")
  selectionEnd    Int?      @map("selection_end")
  selectedText    String?   @map("selected_text") @db.Text
  parentId        String?   @map("parent_id")
  status          String    @default("OPEN") @db.VarChar(20)
  resolvedById    String?   @map("resolved_by_id")
  resolvedAt      DateTime? @map("resolved_at")
  hiddenAt        DateTime? @map("hidden_at")    // Moderation: when hidden
  hiddenById      String?   @map("hidden_by_id") // Moderation: who hid it
  hiddenReason    String?   @map("hidden_reason") @db.VarChar(255)
  ipAddress       String?   @map("ip_address") @db.VarChar(45) // For rate limiting
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")

  document        GeneratedDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  share           DocumentShare?    @relation(fields: [shareId], references: [id])
  user            User?     @relation("CommentAuthor", fields: [userId], references: [id])
  resolvedBy      User?     @relation("CommentResolver", fields: [resolvedById], references: [id])
  hiddenBy        User?     @relation("CommentHider", fields: [hiddenById], references: [id])
  parent          DocumentComment?  @relation("CommentReplies", fields: [parentId], references: [id])
  replies         DocumentComment[] @relation("CommentReplies")

  @@index([documentId])
  @@index([shareId])
  @@index([userId])
  @@index([parentId])
  @@index([status])
  @@index([ipAddress, createdAt]) // For rate limiting queries
  @@map("document_comments")
}

// Document Drafts (auto-save)
model DocumentDraft {
  id              String   @id @default(uuid())
  documentId      String   @map("document_id")
  userId          String   @map("user_id")
  content         String   @db.Text
  metadata        Json?
  createdAt       DateTime @default(now()) @map("created_at")

  document        GeneratedDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  user            User     @relation(fields: [userId], references: [id])

  @@index([documentId])
  @@index([userId, createdAt])
  @@map("document_drafts")
}
```

---

## Service Layer

### Template Service (`src/services/document-template.service.ts`)

```typescript
// ============================================================================
// Types
// ============================================================================

interface CreateTemplateInput {
  name: string;
  description?: string;
  category: DocumentCategory;
  content: string;
  isSystem?: boolean;
}

interface UpdateTemplateInput {
  name?: string;
  description?: string;
  category?: DocumentCategory;
  content?: string;
  isActive?: boolean;
}

interface TemplateSearchParams extends TenantAwareParams {
  search?: string;
  category?: DocumentCategory;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

// ============================================================================
// Public Functions
// ============================================================================

export async function createTemplate(
  tenantId: string,
  userId: string,
  input: CreateTemplateInput
): Promise<DocumentTemplate>;

export async function updateTemplate(
  tenantId: string,
  userId: string,
  templateId: string,
  input: UpdateTemplateInput
): Promise<DocumentTemplate>;

export async function deleteTemplate(
  tenantId: string,
  userId: string,
  templateId: string,
  reason?: string
): Promise<void>;

export async function getTemplate(
  tenantId: string,
  templateId: string
): Promise<DocumentTemplate | null>;

export async function searchTemplates(
  params: TemplateSearchParams
): Promise<PaginatedResult<DocumentTemplate>>;

export async function duplicateTemplate(
  tenantId: string,
  userId: string,
  templateId: string,
  newName: string
): Promise<DocumentTemplate>;

// SUPER_ADMIN only: Copy template to another tenant
export async function copyTemplateToTenant(
  userId: string,
  sourceTemplateId: string,
  targetTenantId: string,
  newName?: string
): Promise<DocumentTemplate>;

// Extract and validate placeholders from template content
export function extractPlaceholders(content: string): PlaceholderDefinition[];
```

---

### Document Generator Service (`src/services/document-generator.service.ts`)

This is the core service with interfaces designed for workflow integration.

```typescript
// ============================================================================
// Interfaces (for workflow integration)
// ============================================================================

export interface IDocumentGenerator {
  /**
   * Generate a document from a template
   */
  generate(params: GenerateDocumentParams): Promise<GeneratedDocument>;

  /**
   * Preview document without saving
   */
  preview(params: PreviewDocumentParams): Promise<PreviewResult>;

  /**
   * Resolve placeholders for a given context
   */
  resolvePlaceholders(
    templateContent: string,
    context: PlaceholderContext
  ): Promise<ResolvedContent>;
}

// ============================================================================
// Types
// ============================================================================

interface GenerateDocumentParams {
  tenantId: string;
  userId: string;
  templateId: string;
  companyId?: string;
  title: string;
  // Custom placeholder overrides
  customData?: Record<string, unknown>;
  // Additional contacts to include
  contactIds?: string[];
  // Metadata (e.g., resolution number, date)
  metadata?: Record<string, unknown>;
}

interface PreviewDocumentParams {
  tenantId: string;
  templateId: string;
  companyId?: string;
  customData?: Record<string, unknown>;
  contactIds?: string[];
}

interface PlaceholderContext {
  company?: Company;
  contacts?: Contact[];
  officers?: CompanyOfficer[];
  shareholders?: CompanyShareholder[];
  customData?: Record<string, unknown>;
  // System data
  currentDate: Date;
  generatedBy?: User;
}

interface PreviewResult {
  html: string;
  sections: SectionDefinition[];
  unresolvedPlaceholders: string[];
}

interface ResolvedContent {
  html: string;
  resolvedPlaceholders: Record<string, string>;
  unresolvedPlaceholders: string[];
}

// ============================================================================
// Public Functions
// ============================================================================

export async function generateDocument(
  params: GenerateDocumentParams
): Promise<GeneratedDocument>;

export async function previewDocument(
  params: PreviewDocumentParams
): Promise<PreviewResult>;

export async function updateDocumentContent(
  tenantId: string,
  userId: string,
  documentId: string,
  content: string
): Promise<GeneratedDocument>;

export async function finalizeDocument(
  tenantId: string,
  userId: string,
  documentId: string
): Promise<GeneratedDocument>;

// Un-finalize to allow further editing (audit logged)
export async function unfinalizeDocument(
  tenantId: string,
  userId: string,
  documentId: string,
  reason: string
): Promise<GeneratedDocument>;

export async function archiveDocument(
  tenantId: string,
  userId: string,
  documentId: string
): Promise<void>;

export async function getDocument(
  tenantId: string,
  documentId: string
): Promise<GeneratedDocument | null>;

export async function searchDocuments(
  params: DocumentSearchParams
): Promise<PaginatedResult<GeneratedDocument>>;

// ============================================================================
// Placeholder Resolution
// ============================================================================

export function resolvePlaceholders(
  templateContent: string,
  context: PlaceholderContext
): ResolvedContent;

export function buildPlaceholderContext(
  tenantId: string,
  companyId?: string,
  contactIds?: string[],
  customData?: Record<string, unknown>
): Promise<PlaceholderContext>;

// Clone an existing document
export async function cloneDocument(
  tenantId: string,
  userId: string,
  documentId: string,
  newTitle?: string
): Promise<GeneratedDocument>;

// ============================================================================
// Auto-Save Functions
// ============================================================================

// Save draft automatically (debounced, called from UI)
export async function saveDocumentDraft(
  tenantId: string,
  documentId: string,
  userId: string,
  content: string
): Promise<void>;

// Get latest auto-saved draft
export async function getLatestDraft(
  tenantId: string,
  documentId: string,
  userId: string
): Promise<DocumentDraft | null>;

// Clean up old drafts after document save
export async function cleanupDrafts(
  documentId: string
): Promise<void>;
```

---

### PDF Export Service (`src/services/document-export.service.ts`)

```typescript
// ============================================================================
// Interfaces (for workflow integration)
// ============================================================================

export interface IDocumentExporter {
  /**
   * Export document to PDF
   */
  toPDF(params: ExportPDFParams): Promise<PDFResult>;

  /**
   * Export document to clean HTML
   */
  toHTML(params: ExportHTMLParams): Promise<HTMLResult>;
}

// ============================================================================
// Types
// ============================================================================

interface ExportPDFParams {
  tenantId: string;
  documentId: string;
  includeLetterhead?: boolean;
  filename?: string;
}

interface PDFResult {
  buffer: Buffer;
  filename: string;
  pageCount: number;
}

interface ExportHTMLParams {
  tenantId: string;
  documentId: string;
  includeStyles?: boolean;
}

interface HTMLResult {
  html: string;
  styles: string;
}

// ============================================================================
// Public Functions
// ============================================================================

export async function exportToPDF(
  params: ExportPDFParams
): Promise<PDFResult>;

export async function exportToHTML(
  params: ExportHTMLParams
): Promise<HTMLResult>;

// Apply letterhead to PDF
export async function applyLetterhead(
  tenantId: string,
  pdfBuffer: Buffer
): Promise<Buffer>;
```

---

### Share Service (`src/services/document-share.service.ts`)

```typescript
// ============================================================================
// Interfaces (for workflow integration)
// ============================================================================

export interface IDocumentPublisher {
  /**
   * Publish document for sharing
   */
  publish(params: PublishParams): Promise<DocumentShare>;

  /**
   * Get shareable URL
   */
  getShareUrl(shareToken: string): string;

  /**
   * Revoke share access
   */
  revoke(shareId: string): Promise<void>;
}

// ============================================================================
// Types
// ============================================================================

interface PublishParams {
  tenantId: string;
  userId: string;
  documentId: string;
  expiresIn?: number; // hours, null = never
  password?: string;
  allowedActions?: ('view' | 'download' | 'print')[];
  allowComments?: boolean; // Allow external viewers to comment (default: false)
  commentRateLimit?: number; // Max comments per hour per IP (default: 20)
  notifyOnComment?: boolean; // Notify owner on new comments (default: false)
  notifyOnView?: boolean; // Notify owner on views (default: false)
}

interface ShareAccessResult {
  document: GeneratedDocument;
  sections: DocumentSection[];
  allowedActions: string[];
  allowComments: boolean;
  comments?: DocumentComment[]; // Included if allowComments is true
}

// ============================================================================
// Public Functions
// ============================================================================

export async function createShare(
  params: PublishParams
): Promise<DocumentShare>;

export async function getShareByToken(
  token: string,
  password?: string
): Promise<ShareAccessResult | null>;

export async function revokeShare(
  tenantId: string,
  userId: string,
  shareId: string
): Promise<void>;

export async function listDocumentShares(
  tenantId: string,
  documentId: string
): Promise<DocumentShare[]>;

export function generateShareUrl(shareToken: string): string;

// Record view
export async function recordView(shareToken: string): Promise<void>;
```

---

### Letterhead Service (`src/services/letterhead.service.ts`)

```typescript
// ============================================================================
// Types
// ============================================================================

interface LetterheadInput {
  headerHtml?: string;
  footerHtml?: string;
  headerImageUrl?: string;
  footerImageUrl?: string;
  logoUrl?: string;
  pageMargins?: PageMargins;
  isEnabled?: boolean;
}

interface PageMargins {
  top: number;    // mm
  right: number;
  bottom: number;
  left: number;
}

// ============================================================================
// Public Functions
// ============================================================================

export async function getLetterhead(
  tenantId: string
): Promise<TenantLetterhead | null>;

export async function upsertLetterhead(
  tenantId: string,
  userId: string,
  input: LetterheadInput
): Promise<TenantLetterhead>;

export async function uploadHeaderImage(
  tenantId: string,
  userId: string,
  file: File
): Promise<string>; // Returns URL

export async function uploadFooterImage(
  tenantId: string,
  userId: string,
  file: File
): Promise<string>;

export async function deleteLetterhead(
  tenantId: string,
  userId: string
): Promise<void>;
```

---

### Comment Service (`src/services/document-comment.service.ts`)

```typescript
// ============================================================================
// Types
// ============================================================================

// For internal authenticated users
interface CreateInternalCommentInput {
  documentId: string;
  content: string;
  selectionStart?: number;
  selectionEnd?: number;
  selectedText?: string;
  parentId?: string;
}

// For external users via shared link (no login required)
interface CreateExternalCommentInput {
  shareToken: string;      // Share link token for validation
  guestName: string;       // Required for external commenters
  guestEmail?: string;     // Optional email
  content: string;
  selectionStart?: number;
  selectionEnd?: number;
  selectedText?: string;
  parentId?: string;
}

interface UpdateCommentInput {
  content: string;
}

// ============================================================================
// Public Functions (Internal - Authenticated)
// ============================================================================

export async function createComment(
  tenantId: string,
  userId: string,
  input: CreateInternalCommentInput
): Promise<DocumentComment>;

export async function updateComment(
  tenantId: string,
  userId: string,
  commentId: string,
  input: UpdateCommentInput
): Promise<DocumentComment>;

export async function deleteComment(
  tenantId: string,
  userId: string,
  commentId: string
): Promise<void>;

export async function resolveComment(
  tenantId: string,
  userId: string,
  commentId: string
): Promise<DocumentComment>;

export async function reopenComment(
  tenantId: string,
  userId: string,
  commentId: string
): Promise<DocumentComment>;

export async function getDocumentComments(
  tenantId: string,
  documentId: string,
  includeResolved?: boolean
): Promise<DocumentComment[]>;

// ============================================================================
// Public Functions (External - No Auth Required)
// ============================================================================

// Create comment via shared link (external viewer)
export async function createExternalComment(
  input: CreateExternalCommentInput
): Promise<DocumentComment>;

// Get comments for shared document (validates share token)
export async function getSharedDocumentComments(
  shareToken: string
): Promise<DocumentComment[]>;

// Reply to a comment via shared link
export async function replyToComment(
  shareToken: string,
  parentId: string,
  guestName: string,
  content: string,
  guestEmail?: string
): Promise<DocumentComment>;

// ============================================================================
// Moderation Functions (Internal - Authenticated)
// ============================================================================

// Hide a comment (moderation)
export async function hideComment(
  tenantId: string,
  userId: string,
  commentId: string,
  reason?: string
): Promise<DocumentComment>;

// Unhide a previously hidden comment
export async function unhideComment(
  tenantId: string,
  userId: string,
  commentId: string
): Promise<DocumentComment>;

// Check rate limit for external comments
export async function checkCommentRateLimit(
  shareToken: string,
  ipAddress: string
): Promise<{ allowed: boolean; remainingCount: number; resetAt: Date }>;
```

---

## API Endpoints

### Template Management

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/document-templates` | List templates | `document_template:read` |
| POST | `/api/document-templates` | Create template | `document_template:create` |
| GET | `/api/document-templates/:id` | Get template | `document_template:read` |
| PATCH | `/api/document-templates/:id` | Update template | `document_template:update` |
| DELETE | `/api/document-templates/:id` | Delete template | `document_template:delete` |
| POST | `/api/document-templates/:id/duplicate` | Duplicate template | `document_template:create` |
| POST | `/api/document-templates/:id/copy-to-tenant` | Copy to another tenant | SUPER_ADMIN |
| POST | `/api/document-templates/:id/test` | Test template with sample data | `document_template:read` |

### Document Generation

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/documents` | List generated documents | `document:read` |
| POST | `/api/documents/generate` | Generate from template | `document:create` |
| POST | `/api/documents/preview` | Preview without saving | `document:read` |
| GET | `/api/documents/:id` | Get document | `document:read` |
| PATCH | `/api/documents/:id` | Update document content | `document:update` |
| POST | `/api/documents/:id/finalize` | Finalize document | `document:update` |
| POST | `/api/documents/:id/unfinalize` | Un-finalize for editing | `document:update` |
| POST | `/api/documents/:id/archive` | Archive document | `document:delete` |
| DELETE | `/api/documents/:id` | Soft delete document | `document:delete` |
| POST | `/api/documents/:id/clone` | Clone document | `document:create` |
| POST | `/api/documents/:id/draft` | Auto-save draft | `document:update` |
| GET | `/api/documents/:id/draft` | Get latest draft | `document:read` |
| GET | `/api/documents/:id/preview-pdf` | Real-time PDF preview | `document:read` |

### Export & Sharing

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/documents/:id/export/pdf` | Export to PDF | `document:export` |
| GET | `/api/documents/:id/export/html` | Export to HTML | `document:export` |
| POST | `/api/documents/:id/share` | Create share link | `document:update` |
| GET | `/api/documents/:id/shares` | List share links | `document:read` |
| DELETE | `/api/documents/shares/:shareId` | Revoke share link | `document:update` |

### Document Comments

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/documents/:id/comments` | List document comments | `document:read` |
| POST | `/api/documents/:id/comments` | Create comment | `document:comment` |
| PATCH | `/api/documents/comments/:commentId` | Update comment | `document:comment` |
| DELETE | `/api/documents/comments/:commentId` | Delete comment | `document:comment` |
| POST | `/api/documents/comments/:commentId/resolve` | Resolve comment | `document:update` |
| POST | `/api/documents/comments/:commentId/reopen` | Reopen comment | `document:update` |
| POST | `/api/documents/comments/:commentId/hide` | Hide comment (moderation) | `document:update` |
| POST | `/api/documents/comments/:commentId/unhide` | Unhide comment | `document:update` |

### Public Share Access (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/public/documents/:token` | View shared document |
| POST | `/api/public/documents/:token/verify` | Verify password |
| GET | `/api/public/documents/:token/pdf` | Download PDF (if allowed) |
| GET | `/api/public/documents/:token/comments` | Get comments (if allowed) |
| POST | `/api/public/documents/:token/comments` | Add comment (if allowed) |
| POST | `/api/public/documents/:token/comments/:commentId/reply` | Reply to comment |

### Letterhead Management

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/api/letterhead` | Get tenant letterhead | TENANT_ADMIN |
| PUT | `/api/letterhead` | Update letterhead | TENANT_ADMIN |
| POST | `/api/letterhead/upload/header` | Upload header image | TENANT_ADMIN |
| POST | `/api/letterhead/upload/footer` | Upload footer image | TENANT_ADMIN |
| DELETE | `/api/letterhead` | Delete letterhead | TENANT_ADMIN |

---

## UI Components

### Page Structure

```
src/app/(dashboard)/
├── documents/
│   ├── page.tsx                    # Document list
│   ├── generate/
│   │   └── page.tsx                # Template selection & generation wizard
│   ├── [id]/
│   │   ├── page.tsx                # Document detail/edit
│   │   ├── preview/
│   │   │   └── page.tsx            # Full preview with sections
│   │   └── shares/
│   │       └── page.tsx            # Manage share links
│   └── templates/
│       ├── page.tsx                # Template list (admin)
│       ├── new/
│       │   └── page.tsx            # Create template
│       └── [id]/
│           └── page.tsx            # Edit template

src/app/(public)/
├── share/
│   └── [token]/
│       └── page.tsx                # Public shared document view

src/app/(dashboard)/admin/
├── letterhead/
│   └── page.tsx                    # Letterhead configuration
```

### Component Hierarchy

```
src/components/documents/
├── template-selector.tsx           # Template selection grid/list
├── template-editor.tsx             # Template content editor with placeholder insertion
├── placeholder-inserter.tsx        # UI for inserting placeholders
├── placeholder-preview.tsx         # Preview resolved placeholders
├── document-editor.tsx             # Edit generated document content
├── document-preview.tsx            # Document preview with sections
├── section-navigator.tsx           # Section navigation sidebar
├── page-break-indicator.tsx        # Visual page break marker
├── share-dialog.tsx                # Create share link dialog (with allow comments option)
├── share-list.tsx                  # List of share links
├── pdf-options-dialog.tsx          # PDF export options
├── letterhead-preview.tsx          # Preview letterhead on document
├── comment-panel.tsx               # Internal comment panel for authenticated users
└── external-comment-panel.tsx      # Comment panel for shared links (no auth required)
```

### Key UI Features

#### 1. Template Editor
- Rich text editor (TipTap) for template content
- Placeholder insertion toolbar with autocomplete
- Live preview panel
- Placeholder validation

#### 2. Document Generation Wizard
```
Step 1: Select Template     →  Category filter, search, preview
Step 2: Select Context      →  Company selection, contact selection
Step 3: Review Placeholders →  Auto-populated values with edit capability
Step 4: Preview & Edit      →  Full document preview, inline editing
Step 5: Finalize            →  Save, generate share link, export
```

#### 3. Shareable Document Page
- Clean, professional layout
- Section navigation sidebar (sticky)
- Responsive design
- Print-friendly styles
- Optional password protection
- External comment panel (if `allowComments` enabled on share link)
- Simple name input for commenters (no login/signup required)
- Comment threading with replies

---

## Template System

### Placeholder Syntax

Placeholders use double-brace syntax with dot notation. The system supports both simple placeholders and block helpers for dynamic content.

#### Simple Placeholders

```handlebars
{{company.name}}
{{company.uen}}
{{company.registeredAddress}}
{{company.incorporationDate|date:DD MMMM YYYY}}

{{contact.fullName}}
{{contact.identificationNumber}}

{{custom.resolutionNumber}}
{{custom.effectiveDate|date:DD/MM/YYYY}}

{{system.currentDate|date:DD MMMM YYYY}}
{{system.generatedBy}}
```

#### Block Helpers (for Dynamic Arrays)

**Iteration Block** - Loop through arrays:

```handlebars
{{#each directors}}
Name: {{name}}
NRIC: {{identificationNumber}}
Nationality: {{nationality}}

{{/each}}
```

**Conditional Block** - Show/hide content based on conditions:

```handlebars
{{#if directors.length > 2}}
Note: This resolution requires approval from more than 2 directors.
{{/if}}

{{#if company.hasCharges}}
Warning: This company has outstanding charges.
{{else}}
The company has no outstanding charges.
{{/if}}
```

**Signing Block** - Generate signature sections dynamically:

```handlebars
{{#signing_block directors}}
_________________________
Name: {{name}}
Designation: {{role}}
Date: ___________________
{{/signing_block}}
```

This generates one signature block per director, with page breaks automatically inserted if needed.

**Table Block** - Generate tables from arrays:

```handlebars
{{#table shareholders columns="Name,Share Class,No. of Shares,Percentage"}}
{{name}}, {{shareClass}}, {{numberOfShares}}, {{percentageHeld}}%
{{/table}}
```

Renders as:

| Name | Share Class | No. of Shares | Percentage |
|------|-------------|---------------|------------|
| John Tan | Ordinary | 50,000 | 50% |
| Mary Lee | Ordinary | 50,000 | 50% |

#### Index and Position Helpers

```handlebars
{{#each directors}}
{{@index}}. {{name}}  <!-- 0-based index: 0, 1, 2... -->
{{@number}}. {{name}} <!-- 1-based number: 1, 2, 3... -->
{{#if @first}}(First Director){{/if}}
{{#if @last}}(Last Director){{/if}}
{{/each}}
```

### Placeholder Categories

| Category | Prefix | Description |
|----------|--------|-------------|
| Company | `company.*` | Company fields |
| Directors | `directors[n].*` or `{{#each directors}}` | Company officers with DIRECTOR role |
| Shareholders | `shareholders[n].*` or `{{#each shareholders}}` | Company shareholders |
| Officers | `officers[n].*` or `{{#each officers}}` | All officers |
| Contact | `contact.*` | Selected contact |
| Custom | `custom.*` | User-provided values |
| System | `system.*` | System values (date, user) |

### Placeholder Definition Schema

```typescript
interface PlaceholderDefinition {
  key: string;           // e.g., "company.name"
  label: string;         // e.g., "Company Name"
  category: string;      // e.g., "company"
  type: 'text' | 'date' | 'number' | 'currency' | 'list' | 'block';
  format?: string;       // e.g., "DD MMMM YYYY"
  required: boolean;
  defaultValue?: string;
  minItems?: number;     // For arrays: minimum required items
  maxItems?: number;     // For arrays: maximum allowed items
}
```

### Page Breaks

Insert page breaks using a special marker:

```html
<!-- PAGE_BREAK -->
```

Or in the rich text editor, insert via toolbar button. Rendered as:

```html
<div class="page-break" style="page-break-after: always;"></div>
```

### Section Headers

Sections are auto-detected from heading tags or explicit markers:

```html
<h2 data-section="resolution-1">Resolution 1: Appointment of Director</h2>

<!-- Or explicit section marker -->
<!-- SECTION: Resolution 1: Appointment of Director -->
```

---

## Pre-Generation Validation

### Validation Flow

Before generating a document, the system validates that all required data is available:

```
┌─────────────────────────┐
│ User Selects Template   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ User Selects Company    │
│ (and optional contacts) │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ System Scans Template   │
│ Extracts Required Fields│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Validate Company Data   │
│ Against Requirements    │
└───────────┬─────────────┘
            │
     ┌──────┴──────┐
     │             │
     ▼             ▼
┌─────────┐  ┌──────────────────────────┐
│ All OK  │  │ Missing/Insufficient Data │
└────┬────┘  └──────────┬───────────────┘
     │                  │
     ▼                  ▼
┌─────────┐  ┌──────────────────────────┐
│Generate │  │ Show Validation Panel:   │
│Document │  │ • List missing fields    │
└─────────┘  │ • Link to edit company   │
             │ • "Save as Draft" option │
             │ • "Continue Anyway" btn  │
             └──────────────────────────┘
```

### Validation Service

```typescript
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  field: string;           // e.g., "company.registeredAddress"
  message: string;         // e.g., "Registered address is required"
  category: 'company' | 'directors' | 'shareholders' | 'contacts';
  fixUrl?: string;         // e.g., "/companies/123/edit"
}

interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;     // e.g., "Consider adding more directors"
}

// Validate before generation
export async function validateForGeneration(
  tenantId: string,
  templateId: string,
  companyId: string,
  contactIds?: string[]
): Promise<ValidationResult>;
```

### Validation Rules

| Rule | Example | Severity |
|------|---------|----------|
| Required field missing | `company.uen` is null | Error |
| Array minimum not met | Template needs 2+ directors, company has 1 | Error |
| Array maximum exceeded | Template supports max 4 shareholders, company has 6 | Warning |
| Date in past | `custom.effectiveDate` is before today | Warning |
| Recommended field empty | `company.financialYearEndMonth` not set | Warning |

### UI Component

```tsx
// Pre-generation validation panel
<ValidationPanel
  template={selectedTemplate}
  company={selectedCompany}
  contacts={selectedContacts}
  onValidationComplete={(result) => {
    if (result.isValid) {
      proceedToGeneration();
    }
  }}
/>
```

**Display Example:**

```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Missing Required Information                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ✓ Company Name: ABC Pte Ltd                            │
│ ✓ UEN: 202312345A                                      │
│ ✗ Registered Address: Missing          [Edit Company]  │
│ ✗ Directors: 1 found, minimum 2 required [Add Director]│
│ ⚠ Financial Year End: Not set (optional)               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ [Save as Draft]              [Continue Anyway] [Cancel] │
└─────────────────────────────────────────────────────────┘
```

### Draft Documents with Missing Data

When user chooses "Save as Draft" with missing data:

- Document is saved with `status: 'DRAFT'`
- `metadata.validationErrors` stores the list of missing fields
- User can return later to complete the document
- Finalization is blocked until all required fields are resolved

---

## PDF Generation

### Technology Choice

Use **Puppeteer** for server-side PDF generation:
- High-fidelity HTML/CSS rendering
- Support for page breaks, headers, footers
- Handles complex layouts

### PDF Options

```typescript
interface PDFOptions {
  format: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  margins: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  displayHeaderFooter: boolean;
  headerTemplate: string;
  footerTemplate: string;
  printBackground: boolean;
}
```

### Letterhead Integration

```
┌────────────────────────────────────────┐
│        HEADER / LOGO                    │ ← From tenant_letterheads
│   [Company Logo] [Company Name]         │
│   Address | Phone | Email               │
├────────────────────────────────────────┤
│                                         │
│        DOCUMENT CONTENT                 │
│                                         │
│   Resolution 1: ...                     │
│                                         │
│   <!-- PAGE_BREAK -->                   │
│                                         │
│   Resolution 2: ...                     │
│                                         │
├────────────────────────────────────────┤
│        FOOTER                           │ ← From tenant_letterheads
│   Page {{pageNumber}} of {{totalPages}} │
└────────────────────────────────────────┘
```

---

## Shareable Documents

### Share URL Structure

```
https://app.oakcloud.com/share/{shareToken}
```

### Public Page Layout

Clean, unbranded design for optimal document viewing experience. External viewers can leave comments if enabled. Comments are designed to be **non-obstructive** - they don't block or overlay the document content.

#### Default View (Comments Collapsed)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Document Title                              [Download] [Print] [💬 3]       │
├─────────┬────────────────────────────────────────────────────────────────────┤
│         │                                                                     │
│ Section │  Document Content                                                   │
│ Nav     │                                                                     │
│         │  ┌─────────────────────────────────────────────────────────────┐   │
│ ┌─────┐ │  │ Resolution 1: Appointment of Director                        │   │
│ │ 1   │ │  │                                                              │   │
│ │ 2   │ │  │ RESOLVED THAT the appointment of [highlighted text¹]        │   │
│ │ 3   │ │  │ as a Director of the Company be approved...                  │   │
│ └─────┘ │  └─────────────────────────────────────────────────────────────┘   │
│         │                                                                     │
│         │  ┌─────────────────────────────────────────────────────────────┐   │
│         │  │ Resolution 2: Change of Address                              │   │
│         │  │                                                              │   │
│         │  │ RESOLVED THAT the [highlighted text²] be changed...          │   │
│         │  └─────────────────────────────────────────────────────────────┘   │
│         │                                                                     │
└─────────┴────────────────────────────────────────────────────────────────────┘
```

#### Expanded View (Comments Panel Open)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Document Title                              [Download] [Print] [💬 3 ✕]     │
├─────────┬─────────────────────────────────────────┬──────────────────────────┤
│         │                                         │ Comments            [−]  │
│ Section │  Document Content                       ├──────────────────────────┤
│ Nav     │                                         │ ┌────────────────────┐   │
│         │  ┌─────────────────────────────────┐   │ │ ¹ John Doe · 2h     │   │
│ ┌─────┐ │  │ Resolution 1: Appointment...    │   │ │ Re: "Mary Lee"      │   │
│ │ 1   │ │  │                                  │   │ │ ─────────────────   │   │
│ │ 2   │ │  │ RESOLVED THAT [Mary Lee¹]...    │   │ │ Should this be the  │   │
│ │ 3   │ │  └─────────────────────────────────┘   │ │ full legal name?    │   │
│ └─────┘ │                                         │ │ [Reply]             │   │
│         │  ┌─────────────────────────────────┐   │ └────────────────────┘   │
│         │  │ Resolution 2: Change of Address  │   │                          │
│         │  │                                  │   │ ┌────────────────────┐   │
│         │  │ RESOLVED THAT [registered²]...  │   │ │ ² Jane Wong · 1h    │   │
│         │  └─────────────────────────────────┘   │ │ Re: "registered"    │   │
│         │                                         │ │ ─────────────────   │   │
│         │                                         │ │ Please verify the   │   │
│         │                                         │ │ address format.     │   │
│         │                                         │ │ [Reply] ✓ Resolved  │   │
│         │                                         │ └────────────────────┘   │
│         │                                         │                          │
│         │                                         │ ┌────────────────────┐   │
│         │                                         │ │ + Add Comment       │   │
│         │                                         │ │ Name: [__________]  │   │
│         │                                         │ │ Comment:            │   │
│         │                                         │ │ [________________]  │   │
│         │                                         │ │ 0/1000  [Submit]    │   │
│         │                                         │ └────────────────────┘   │
└─────────┴─────────────────────────────────────────┴──────────────────────────┘
```

#### Comment Tagging System

Comments are linked to specific text in the document:

| Element | Appearance | Interaction |
|---------|------------|-------------|
| **Highlighted text** | Light yellow background with superscript number (e.g., `[text¹]`) | Click to jump to comment |
| **Comment marker** | Superscript number matches highlight | Hover shows preview |
| **Comment card** | Shows "Re: {selected text}" to identify context | Click scrolls to text |
| **General comment** | No highlight, appears at bottom of list | Document-wide feedback |

```css
/* Non-obstructive highlight styles */
.comment-highlight {
  background-color: rgba(255, 235, 59, 0.3); /* Light yellow, semi-transparent */
  border-bottom: 2px solid #ffc107;
  cursor: pointer;
  position: relative;
}

.comment-highlight::after {
  content: attr(data-comment-number);
  font-size: 0.65em;
  vertical-align: super;
  color: #f57c00;
  margin-left: 2px;
}

/* Comment panel - slides in from right, doesn't overlay content */
.comment-panel {
  width: 320px;
  border-left: 1px solid #e0e0e0;
  overflow-y: auto;
  flex-shrink: 0;
}
```

**Design Principles:**
- **Non-obstructive**: Comments panel is a sidebar, not an overlay - document always readable
- **Clear tagging**: Superscript numbers link highlights to comments
- **Collapsible**: Panel can be hidden to focus on document
- **Context preserved**: Comments show the exact text being referenced
- No branding (no logos, company names in header)
- Clean typography for professional appearance
- Mobile-responsive (panel becomes bottom sheet on mobile)
- Print-friendly styles (comments hidden in print view)

### Access Control

| Feature | Implementation |
|---------|----------------|
| Expiration | Check `expires_at` on access |
| Password | Bcrypt hash comparison |
| Actions | Check `allowed_actions` array |
| Comments | Check `allow_comments` flag - if true, external viewers can comment |
| Revocation | Check `is_active` and `revoked_at` |
| Rate limiting | Implement at API level |

### External Comment Flow

```
┌──────────────────────────────────────────────────────────────┐
│ External Viewer Opens Shared Link                             │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Check: share.allowComments === true?                          │
└───────────────────────────┬──────────────────────────────────┘
                    ┌───────┴───────┐
                    │               │
                    ▼               ▼
              ┌──────────┐   ┌──────────────────┐
              │   No     │   │      Yes         │
              │ Comments │   │ Show Comment     │
              │ Hidden   │   │ Panel            │
              └──────────┘   └────────┬─────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │ User enters:                     │
                    │ • Name (required)                │
                    │ • Email (optional)               │
                    │ • Comment text                   │
                    └─────────────────┬───────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │ Comment saved with:              │
                    │ • shareId = share.id            │
                    │ • userId = null                 │
                    │ • guestName = input name        │
                    │ • guestEmail = input email      │
                    └─────────────────────────────────┘
```

---

## Integration Points

### Workflow Module Interface

The Document Generation Module exposes clean interfaces for future workflow integration:

```typescript
// Future workflow module can import and use:
import {
  IDocumentGenerator,
  IDocumentExporter,
  IDocumentPublisher
} from '@/services/document-generation';

// Example workflow step
async function executeDocumentStep(
  workflowContext: WorkflowContext,
  stepConfig: DocumentStepConfig
): Promise<StepResult> {
  const generator: IDocumentGenerator = getDocumentGenerator();

  // Generate document
  const document = await generator.generate({
    tenantId: workflowContext.tenantId,
    userId: workflowContext.triggeredById,
    templateId: stepConfig.templateId,
    companyId: workflowContext.companyId,
    title: stepConfig.title,
    customData: workflowContext.variables,
  });

  // Export to PDF if needed
  if (stepConfig.exportPDF) {
    const exporter: IDocumentExporter = getDocumentExporter();
    const pdf = await exporter.toPDF({
      tenantId: workflowContext.tenantId,
      documentId: document.id,
      includeLetterhead: true,
    });
    // Store PDF for next step (e-signature)
  }

  // Create share link if needed
  if (stepConfig.createShareLink) {
    const publisher: IDocumentPublisher = getDocumentPublisher();
    const share = await publisher.publish({
      tenantId: workflowContext.tenantId,
      userId: workflowContext.triggeredById,
      documentId: document.id,
      expiresIn: stepConfig.shareLinkExpiry,
    });
    // Pass share URL to next step (email/SMS)
  }

  return { documentId: document.id, success: true };
}
```

### Workflow Step Result Interface

All document generation operations return a standardized result for workflow orchestration:

```typescript
/**
 * Result returned by document generation workflow step
 * Used by workflow designer to pass data to subsequent steps
 */
interface DocumentStepResult {
  // Status
  success: boolean;
  error?: string;

  // Document info
  documentId: string;
  documentTitle: string;
  status: 'DRAFT' | 'FINALIZED';

  // For next steps (e.g., e-signature)
  shareUrl?: string;           // If share was created
  shareToken?: string;         // Raw token for URL shortener
  pdfUrl?: string;             // Temporary URL to PDF
  pdfBuffer?: Buffer;          // Raw PDF for e-sign module

  // Context for downstream steps
  companyId?: string;
  companyName?: string;
  companyUen?: string;

  // Signatories extracted from document (for e-sign step)
  signatories?: {
    name: string;
    email?: string;
    role: string;              // e.g., "Director"
    identificationNumber?: string;
  }[];

  // Validation info (if draft due to missing data)
  validationErrors?: string[];

  // Metadata for logging/tracking
  templateId?: string;
  templateName?: string;
  generatedAt: Date;
  generatedBy: string;
}

/**
 * Example workflow usage:
 *
 * Step 1: Document Generation → returns DocumentStepResult
 * Step 2: E-Signature → uses result.pdfBuffer, result.signatories
 * Step 3: URL Shortener → uses result.shareUrl
 * Step 4: Email/SMS → uses shortened URL, result.documentTitle
 */
```

### E-Signature Module Hook

```typescript
// Document ready for signature
interface DocumentForSignature {
  documentId: string;
  pdfBuffer: Buffer;
  title: string;
  signatories: Signatory[];
}

// Export function for e-signature module
export async function prepareForSignature(
  tenantId: string,
  documentId: string,
  signatories: Signatory[]
): Promise<DocumentForSignature>;
```

### URL Shortener Module Hook

```typescript
// Create shortened URL for share link
interface ShortenedUrl {
  originalUrl: string;
  shortUrl: string;
  trackingCode: string;
}

// Integration point
export function getShareableUrl(shareToken: string): string;
```

### Notification Module Hook

```typescript
// Document share notification
interface ShareNotification {
  type: 'document_share';
  recipientEmail: string;
  documentTitle: string;
  shareUrl: string;
  expiresAt?: Date;
  message?: string;
}
```

---

## Security Considerations

### Share Token Security

- Use cryptographically secure random tokens (32 bytes, base64url encoded)
- Tokens are unguessable (high entropy)
- Store hashed tokens if extra security needed

```typescript
import { randomBytes } from 'crypto';

function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}
```

### Password Protection

- Use bcrypt for password hashing
- Implement rate limiting on password attempts
- Lock share after N failed attempts

### Data Access

- All operations tenant-scoped
- RBAC permissions enforced at API level
- Audit logging for all document operations
- Share links don't expose tenant information

### XSS Prevention

- Sanitize all HTML content (DOMPurify)
- Use CSP headers on public pages
- Escape user-provided content in templates

### External Comment Protection

- **Rate Limiting**: Max 20 comments per hour per IP address (configurable per share link)
- **Honeypot Field**: Hidden field to detect bots
- **Content Validation**: Max 1,000 characters, no HTML allowed
- **IP Tracking**: Store IP for rate limiting and abuse tracking
- **Moderation**: Document owner can hide inappropriate comments

```typescript
// Rate limit check before allowing external comment
async function checkRateLimit(shareToken: string, ipAddress: string): Promise<boolean> {
  const share = await getShareByToken(shareToken);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentComments = await prisma.documentComment.count({
    where: {
      shareId: share.id,
      ipAddress,
      createdAt: { gte: oneHourAgo },
    },
  });

  return recentComments < share.commentRateLimit;
}
```

---

## Accessibility (WCAG 2.1)

The shared document pages must be accessible to all users:

### Requirements

| Category | Requirement |
|----------|-------------|
| **Semantic HTML** | Proper heading hierarchy (h1 → h2 → h3), landmark regions |
| **Keyboard Navigation** | All interactive elements focusable, visible focus indicators |
| **Screen Readers** | ARIA labels for buttons, live regions for comment updates |
| **Color Contrast** | Minimum 4.5:1 for normal text, 3:1 for large text |
| **Focus Management** | Focus trapped in modals, returned after close |
| **Text Sizing** | Content readable at 200% zoom |
| **Motion** | Respect `prefers-reduced-motion` setting |

### Implementation Notes

```tsx
// Comment panel with proper ARIA
<aside
  aria-label="Document comments"
  role="complementary"
>
  <h2 id="comments-heading">Comments</h2>
  <div
    role="log"
    aria-live="polite"
    aria-labelledby="comments-heading"
  >
    {comments.map(comment => (
      <article key={comment.id} aria-label={`Comment by ${comment.guestName || comment.user.name}`}>
        ...
      </article>
    ))}
  </div>
</aside>

// Skip link for keyboard users
<a href="#main-content" className="skip-link">
  Skip to document content
</a>
```

---

## SEO & Meta Tags

### Share Page Meta Tags

```html
<!-- Prevent indexing of shared documents -->
<meta name="robots" content="noindex, nofollow">

<!-- Basic meta tags (no sensitive content) -->
<meta property="og:title" content="Shared Document">
<meta property="og:description" content="View this shared document">
<meta property="og:type" content="article">

<!-- Disable caching for password-protected pages -->
<meta http-equiv="Cache-Control" content="no-store">
```

### URL Structure

```
/share/{token}              - Clean URL, no document info exposed
/share/{token}?password=... - Never include password in URL (use POST)
```

---

## Performance Considerations

### Optimization Strategies

| Area | Strategy |
|------|----------|
| **Large Documents** | Lazy load sections, virtual scrolling for 100+ pages |
| **PDF Generation** | Queue system (Bull/Redis) for documents > 20 pages |
| **Real-time Preview** | Debounce (1s) + cache recent renders |
| **Comments** | Paginate if > 50 comments, lazy load older |
| **Images in Templates** | Compress, lazy load, use CDN |

### Caching Strategy

```typescript
// PDF preview caching
const PDF_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Share page caching (for public, non-password pages)
Cache-Control: public, max-age=300  // 5 minutes

// Comment list caching
Cache-Control: private, max-age=60  // 1 minute, private due to user context
```

### Database Query Optimization

```typescript
// Efficient comment loading with pagination
async function getDocumentComments(
  documentId: string,
  page: number = 1,
  limit: number = 50
) {
  return prisma.documentComment.findMany({
    where: {
      documentId,
      hiddenAt: null,  // Exclude hidden comments
      deletedAt: null,
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      replies: {
        where: { hiddenAt: null, deletedAt: null },
        take: 3,  // Show first 3 replies, load more on demand
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });
}
```

---

## AI Integration

The Document Generation Module includes AI assistance for template creation and document editing, leveraging the existing Connectors Hub infrastructure.

### AI Sidebar Component

A collapsible AI assistant sidebar integrated into the template editor and document editor:

```
┌─────────────────────────────────────────────────────────────┐
│ Template Editor                          │ AI Assistant [x] │
├─────────────────────────────────────────┬───────────────────┤
│                                         │ ┌───────────────┐ │
│  DIRECTORS' RESOLUTION                  │ │ Model: GPT-4  │ │
│                                         │ │ [▼ Select]    │ │
│  {{#each directors}}                    │ └───────────────┘ │
│  ...                                    │                   │
│                                         │ ┌───────────────┐ │
│                                         │ │ User:         │ │
│                                         │ │ Draft a       │ │
│                                         │ │ resolution    │ │
│                                         │ │ for appointing│ │
│                                         │ │ a new director│ │
│                                         │ └───────────────┘ │
│                                         │ ┌───────────────┐ │
│                                         │ │ AI:           │ │
│                                         │ │ Here's a draft│ │
│                                         │ │ resolution... │ │
│                                         │ │               │ │
│                                         │ │ [Insert ↓]    │ │
│                                         │ └───────────────┘ │
│                                         │                   │
│                                         │ ┌───────────────┐ │
│                                         │ │ Type message..│ │
│                                         │ │         [Send]│ │
│                                         │ └───────────────┘ │
└─────────────────────────────────────────┴───────────────────┘
```

### AI Features

| Feature | Description | Use Case |
|---------|-------------|----------|
| **Draft Content** | Generate template/document content | "Write a resolution for changing registered address" |
| **Rephrase** | Rewrite selected text | "Make this clause more formal" |
| **Explain** | Explain legal/technical terms | "What does 'ordinary resolution' mean?" |
| **Suggest Placeholders** | Recommend placeholders for text | "What placeholders should I add here?" |
| **Review** | Check document for errors | "Review this resolution for completeness" |
| **Insert** | Insert AI response into editor | One-click insertion at cursor position |

### AI Context Awareness

The AI assistant receives context about the current editing session:

```typescript
interface AIContext {
  mode: 'template_editor' | 'document_editor';
  templateCategory?: DocumentCategory;  // RESOLUTION, CONTRACT, etc.
  templateName?: string;

  // Company context (when editing document)
  companyContext?: {
    name: string;
    uen: string;
    entityType: string;
    directors: { name: string; role: string }[];
    shareholders: { name: string; percentage: number }[];
  };

  // Editor context
  selectedText?: string;         // User's text selection
  cursorPosition?: number;       // Where to insert
  surroundingContent?: string;   // Text around cursor for context
}
```

### AI Model Selection

Reuses the existing `AIModelSelector` component from the Connectors Hub:

```tsx
import { AIModelSelector } from '@/components/ui/ai-model-selector';

<AIModelSelector
  value={selectedModel}
  onChange={setSelectedModel}
  showContextInput={false}
/>
```

### Conversation Persistence (Optional)

AI conversations can be persisted for continuity:

```prisma
model AIConversation {
  id            String   @id @default(uuid())
  tenantId      String   @map("tenant_id")
  userId        String   @map("user_id")
  contextType   String   @map("context_type")  // 'template' | 'document'
  contextId     String?  @map("context_id")    // templateId or documentId
  messages      Json     // Array of {role, content, timestamp}
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  user          User     @relation(fields: [userId], references: [id])

  @@index([tenantId, userId])
  @@index([contextType, contextId])
  @@map("ai_conversations")
}
```

### AI API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/chat` | Send message to AI |
| GET | `/api/ai/conversations/:contextType/:contextId` | Get conversation history |
| DELETE | `/api/ai/conversations/:id` | Clear conversation |

### AI Chat Service

```typescript
interface AIChatParams {
  tenantId: string;
  userId: string;
  message: string;
  context: AIContext;
  model?: string;           // e.g., "gpt-4", "claude-3"
  conversationId?: string;  // For continuing conversation
}

interface AIChatResponse {
  message: string;
  conversationId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export async function sendAIChatMessage(
  params: AIChatParams
): Promise<AIChatResponse>;
```

### UI Component

```tsx
// AI Sidebar component
<AISidebar
  isOpen={showAI}
  onClose={() => setShowAI(false)}
  context={{
    mode: 'template_editor',
    templateCategory: 'RESOLUTION',
    selectedText: editorSelection,
  }}
  onInsert={(text) => {
    editor.insertContent(text);
  }}
/>
```

### System Prompt Template

```typescript
const DOCUMENT_AI_SYSTEM_PROMPT = `
You are an AI assistant helping with corporate document drafting.
You specialize in Singapore corporate secretarial documents including:
- Directors' resolutions
- Shareholders' resolutions
- Board meeting minutes
- Corporate letters and notices

Context:
- Template Category: {{category}}
- Company: {{companyName}} ({{entityType}})
- Directors: {{directorsList}}

Guidelines:
1. Use formal legal language appropriate for corporate documents
2. Reference Singapore Companies Act where relevant
3. Include appropriate placeholder syntax: {{placeholder.name}}
4. Suggest page breaks for multi-page documents
5. Be concise and professional
`;
```

---

## Additional Features

This section covers additional features that enhance the document generation experience.

### 1. Real-Time PDF Preview

Preview how the document will look as a PDF while editing, without needing to download.

#### UI Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Document Editor                                              [PDF Preview ↔] │
├────────────────────────────────────────┬────────────────────────────────────┤
│                                        │                                     │
│  DIRECTORS' RESOLUTION                 │  ┌─────────────────────────────┐   │
│                                        │  │     PDF Preview              │   │
│  [Edit document content here]          │  │                              │   │
│                                        │  │  ┌───────────────────────┐   │   │
│  {{company.name}}                      │  │  │ [Letterhead]          │   │   │
│  RESOLVED THAT...                      │  │  │                       │   │   │
│                                        │  │  │ DIRECTORS' RESOLUTION │   │   │
│                                        │  │  │                       │   │   │
│                                        │  │  │ ABC Pte Ltd           │   │   │
│                                        │  │  │ RESOLVED THAT...      │   │   │
│                                        │  │  │                       │   │   │
│                                        │  │  └───────────────────────┘   │   │
│                                        │  │                              │   │
│                                        │  │  Page 1 of 2     [◀][▶]     │   │
│                                        │  └─────────────────────────────┘   │
│                                        │                                     │
│                                        │  ☑ Include Letterhead              │
│                                        │  ☑ Show Draft Watermark            │
└────────────────────────────────────────┴────────────────────────────────────┘
```

#### Implementation

```typescript
// Debounced PDF preview generation
const PREVIEW_DEBOUNCE_MS = 1000;

interface PDFPreviewState {
  isLoading: boolean;
  pdfUrl: string | null;
  pageCount: number;
  currentPage: number;
  error?: string;
}

// API endpoint returns base64 PDF or URL
// GET /api/documents/:id/preview-pdf?includeLetterhead=true&includeDraftWatermark=true
// Returns: { pdfBase64: string, pageCount: number }

// UI hook
function usePDFPreview(documentId: string, content: string, options: PreviewOptions) {
  // Debounced content changes trigger preview regeneration
  // Uses react-pdf or PDF.js for rendering
}
```

#### Features

- Debounced preview generation (1 second after last edit)
- Page navigation (previous/next)
- Toggle letterhead on/off
- Toggle draft watermark
- Zoom controls
- Loading indicator during generation

---

### 2. Auto-Save for Draft Documents

Automatically save document changes to prevent data loss.

#### Behavior

- Auto-save triggers 5 seconds after user stops typing
- Only applies to documents with `status: 'DRAFT'`
- Visual indicator shows save status: "Saving...", "Saved ✓", "Changes not saved"
- User can manually save with Ctrl+S / Cmd+S

#### UI Indicator

```
┌─────────────────────────────────────────────────────────┐
│ Document: Board Resolution                  ● Saving... │
│ Document: Board Resolution                  ✓ Saved     │
│ Document: Board Resolution                  ○ Unsaved   │
└─────────────────────────────────────────────────────────┘
```

#### Implementation

```typescript
// Auto-save hook
function useAutoSave(documentId: string, content: string) {
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  useEffect(() => {
    setSaveStatus('unsaved');
    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      await saveDraft(documentId, content);
      setSaveStatus('saved');
    }, 5000); // 5 second debounce

    return () => clearTimeout(timer);
  }, [content]);

  return saveStatus;
}
```

#### Draft Recovery

- On page load, check for unsaved drafts
- Prompt user: "You have unsaved changes from [timestamp]. Restore?"
- Show diff between saved version and draft

---

### 3. Template Testing with Sample Data

Test templates with realistic sample data before publishing.

#### UI Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Template Editor                                              [Test Template] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Template: Director Appointment Resolution                                   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Test with Sample Data                                                  │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                        │ │
│  │  Sample Company: ○ Use default sample  ○ Select existing company       │ │
│  │                                                                        │ │
│  │  [Generate Sample Data]                                                │ │
│  │                                                                        │ │
│  │  Sample Values:                                                        │ │
│  │  ┌────────────────────────────────────────────────────────────────┐   │ │
│  │  │ company.name: "Sample Company Pte Ltd"               [Edit]    │   │ │
│  │  │ company.uen: "202312345A"                            [Edit]    │   │ │
│  │  │ directors[0].name: "John Tan"                        [Edit]    │   │ │
│  │  │ directors[1].name: "Mary Lee"                        [Edit]    │   │ │
│  │  └────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                        │ │
│  │  [Preview with Sample Data]                                            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Sample Data Generation

```typescript
// Default sample data for testing
const DEFAULT_SAMPLE_DATA: PlaceholderContext = {
  company: {
    name: 'Sample Company Pte Ltd',
    uen: '202312345A',
    registeredAddress: '123 Sample Street, #01-01, Singapore 123456',
    incorporationDate: new Date('2023-01-15'),
    entityType: 'Private Limited Company',
  },
  directors: [
    { name: 'John Tan Wei Ming', identificationNumber: 'S1234567A', nationality: 'Singaporean' },
    { name: 'Mary Lee Mei Ling', identificationNumber: 'S7654321B', nationality: 'Singaporean' },
  ],
  shareholders: [
    { name: 'John Tan Wei Ming', shareClass: 'Ordinary', numberOfShares: 50000, percentageHeld: 50 },
    { name: 'Mary Lee Mei Ling', shareClass: 'Ordinary', numberOfShares: 50000, percentageHeld: 50 },
  ],
  customData: {
    resolutionNumber: 'DR-2024-001',
    effectiveDate: new Date(),
  },
  currentDate: new Date(),
};

// API: POST /api/document-templates/:id/test
// Body: { sampleData?: Partial<PlaceholderContext>, companyId?: string }
// Returns: { html: string, unresolvedPlaceholders: string[] }
```

---

### 4. Draft Watermark on Non-Finalized PDFs

Add a diagonal "DRAFT" watermark to PDFs of non-finalized documents.

#### Visual

```
┌───────────────────────────────────────┐
│                                       │
│     D  R  A  F  T                    │
│        R  A  F  T                    │
│           A  F  T                    │
│   ┌─────────────────────────────┐    │
│   │                             │    │
│   │  Document Content           │    │
│   │                             │    │
│   │  This is a draft...         │    │
│   │                             │    │
│   └─────────────────────────────┘    │
│              F  T                    │
│                 T                    │
│                                       │
└───────────────────────────────────────┘
```

#### Implementation

```typescript
interface WatermarkOptions {
  text: string;           // Default: "DRAFT"
  color: string;          // Default: "rgba(128, 128, 128, 0.2)"
  fontSize: number;       // Default: 72
  rotation: number;       // Default: -45 degrees
  opacity: number;        // Default: 0.2
}

// Applied during PDF generation
async function exportToPDF(params: ExportPDFParams): Promise<PDFResult> {
  const document = await getDocument(params.documentId);

  // Add watermark for non-finalized documents
  const includeWatermark = document.status !== 'FINALIZED';

  // ... generate PDF with watermark overlay
}
```

#### Behavior

- Watermark appears on ALL pages
- Diagonal text: "DRAFT"
- Semi-transparent (20% opacity)
- Automatically removed when document is finalized
- Can be toggled in preview mode

---

### 5. Document Cloning

Duplicate an existing document to create a new version or similar document.

#### UI

```
┌─────────────────────────────────────────┐
│ Document Actions                    [⋮] │
├─────────────────────────────────────────┤
│ ▸ Edit                                  │
│ ▸ Export PDF                            │
│ ▸ Share                                 │
│ ▸ Clone Document ←                      │
│ ▸ Archive                               │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Clone Document                          │
├─────────────────────────────────────────┤
│                                         │
│ Source: Board Resolution - 2024-001     │
│                                         │
│ New Title: [Board Resolution - Copy   ] │
│                                         │
│ ☑ Copy content                          │
│ ☑ Reset to DRAFT status                 │
│ ☐ Copy comments (if any)                │
│                                         │
│ [Cancel]                    [Clone]     │
└─────────────────────────────────────────┘
```

#### API

```typescript
// POST /api/documents/:id/clone
// Body: { newTitle?: string, copyComments?: boolean }
// Returns: GeneratedDocument (the cloned document)

async function cloneDocument(
  tenantId: string,
  userId: string,
  documentId: string,
  newTitle?: string,
  copyComments?: boolean
): Promise<GeneratedDocument> {
  const source = await getDocument(tenantId, documentId);

  return prisma.generatedDocument.create({
    data: {
      tenantId,
      templateId: source.templateId,
      templateVersion: source.templateVersion,
      companyId: source.companyId,
      title: newTitle || `${source.title} (Copy)`,
      content: source.content,
      contentJson: source.contentJson,
      status: 'DRAFT',
      useLetterhead: source.useLetterhead,
      shareExpiryHours: source.shareExpiryHours,
      metadata: source.metadata,
      createdById: userId,
    },
  });
}
```

---

### 6. Template Partials (Reusable Blocks)

Create reusable template fragments that can be included in multiple templates.

#### Partial Definition

```handlebars
{{!-- Partial: signing-block-directors --}}
{{#partial "signing-block-directors"}}
<div class="signing-section">
  <h3>SIGNED BY THE DIRECTORS:</h3>
  {{#each directors}}
  <div class="signature-block">
    <div class="signature-line">_________________________</div>
    <div class="signatory-name">{{name}}</div>
    <div class="signatory-role">Director</div>
    <div class="signature-date">Date: _______________</div>
  </div>
  {{/each}}
</div>
{{/partial}}
```

#### Using Partials

```handlebars
{{!-- In template content --}}
<h1>DIRECTORS' RESOLUTION IN WRITING</h1>

<p>The undersigned, being all the directors of {{company.name}}...</p>

{{#each resolutions}}
<section>
  <h2>Resolution {{@number}}: {{title}}</h2>
  <p>{{content}}</p>
</section>
{{/each}}

{{!-- Include the signing block partial --}}
{{> signing-block-directors}}
```

#### Database Schema Addition

```sql
-- Template partials table
CREATE TABLE template_partials (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  placeholders JSONB DEFAULT '[]',
  created_by_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,

  UNIQUE(tenant_id, name)
);
```

#### Prisma Model

```prisma
model TemplatePartial {
  id            String   @id @default(uuid())
  tenantId      String   @map("tenant_id")
  name          String   @db.VarChar(100)
  description   String?  @db.Text
  content       String   @db.Text
  placeholders  Json     @default("[]")
  createdById   String   @map("created_by_id")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  deletedAt     DateTime? @map("deleted_at")

  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  createdBy     User     @relation(fields: [createdById], references: [id])

  @@unique([tenantId, name])
  @@index([tenantId])
  @@map("template_partials")
}
```

#### UI for Managing Partials

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Template Partials                                          [+ New Partial]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌───────────────────────────────────────────────────────────────────────┐   │
│ │ signing-block-directors                                               │   │
│ │ Standard director signing section with signature lines                │   │
│ │ Used in: 5 templates                                      [Edit] [⋮]  │   │
│ └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│ ┌───────────────────────────────────────────────────────────────────────┐   │
│ │ company-header                                                         │   │
│ │ Company name, UEN, and registered address header                       │   │
│ │ Used in: 12 templates                                     [Edit] [⋮]  │   │
│ └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 7. Document Comments & Annotations

Add comments and annotations to documents for review workflows. Supports both internal users (authenticated) and external viewers (via shared links without login).

#### UI Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Document: Board Resolution                              [Comments (3)] [≡]  │
├──────────────────────────────────────────────────┬──────────────────────────┤
│                                                  │ Comments                 │
│  DIRECTORS' RESOLUTION IN WRITING                │ ┌────────────────────┐  │
│                                                  │ │ John Tan (2 hrs)   │  │
│  The undersigned, being all the directors of     │ │ "Should this be    │  │
│  [ABC Pte Ltd]← highlighted text with comment    │ │ the full legal     │  │
│                                                  │ │ name?"             │  │
│  RESOLVED THAT:                                  │ │                    │  │
│                                                  │ │ [Reply] [Resolve]  │  │
│  1. The appointment of [Mary Lee] as a director  │ └────────────────────┘  │
│     of the Company be and is hereby approved...  │                         │
│                                                  │ ┌────────────────────┐  │
│                                                  │ │ Jane Wong (1 hr)   │  │
│                                                  │ │ "Please check      │  │
│                                                  │ │ NRIC number"       │  │
│                                                  │ │ ✓ Resolved         │  │
│                                                  │ └────────────────────┘  │
│                                                  │                         │
│                                                  │ + Add Comment           │
│                                                  │                         │
└──────────────────────────────────────────────────┴──────────────────────────┘
```

#### Comment Features

| Feature | Description |
|---------|-------------|
| **Text Selection** | Comment on specific highlighted text |
| **General Comments** | Comments without text selection |
| **Replies** | Thread replies to comments |
| **Resolve/Reopen** | Mark comments as resolved (internal users only) |
| **External Commenting** | External viewers can comment via shared links (no login required) |
| **Guest Identity** | External commenters provide name (required) and email (optional) |
| **Mentions** | @mention users in comments (future) |
| **Notifications** | Email notification on new comments (future) |

#### Comment Component (Internal - Authenticated Users)

```tsx
interface CommentPanelProps {
  documentId: string;
  comments: DocumentComment[];
  selectedText?: string;
  onAddComment: (content: string, selection?: TextSelection) => void;
  onResolve: (commentId: string) => void;
  onReply: (parentId: string, content: string) => void;
}

// Highlight annotations in editor
function highlightCommentedText(
  editor: TipTapEditor,
  comments: DocumentComment[]
) {
  comments.forEach(comment => {
    if (comment.selectionStart && comment.selectionEnd) {
      editor.addMark('comment', {
        commentId: comment.id,
        from: comment.selectionStart,
        to: comment.selectionEnd,
      });
    }
  });
}
```

#### External Comment Panel (Public - No Auth Required)

```tsx
interface ExternalCommentPanelProps {
  shareToken: string;
  comments: DocumentComment[];
  allowComments: boolean;
  onAddComment: (guestName: string, content: string, guestEmail?: string) => void;
  onReply: (parentId: string, guestName: string, content: string, guestEmail?: string) => void;
}

// External comment form (simple name + comment)
function ExternalCommentForm({ onSubmit }: { onSubmit: (name: string, content: string, email?: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Your Name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        type="email"
        placeholder="Email (optional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <textarea
        placeholder="Your comment..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        required
      />
      <button type="submit">Submit Comment</button>
    </form>
  );
}
```

---

### 8. Undo/Redo in Editor

Full undo/redo support in the document editor.

#### Features

- **Unlimited History**: Store all changes during editing session
- **Keyboard Shortcuts**: Ctrl+Z (Undo), Ctrl+Shift+Z (Redo)
- **Toolbar Buttons**: Visual undo/redo buttons with state indication
- **History Panel** (optional): View recent changes

#### TipTap Configuration

```typescript
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { History } from '@tiptap/extension-history';

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      history: {
        depth: 100,         // Max undo steps
        newGroupDelay: 500, // Group rapid changes
      },
    }),
  ],
  content: documentContent,
});

// Undo/Redo controls
function EditorToolbar({ editor }) {
  return (
    <div className="toolbar">
      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        ↶ Undo
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        ↷ Redo
      </button>
    </div>
  );
}
```

#### UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [↶ Undo] [↷ Redo] │ B I U │ H1 H2 H3 │ • • │ ⊞ ⊟ │ {{}} │ --- │ AI     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Document content...                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Foundation) ✅ COMPLETED

- [x] Database schema (Prisma models)
- [x] Template service (CRUD)
- [x] Placeholder resolver (simple + block helpers)
- [x] Basic document generator
- [x] Template testing with sample data
- [x] Default sample data generation

### Phase 2: Document Generation ✅ COMPLETED

- [x] Generate document from template
- [x] Preview functionality (API endpoint)
- [x] Document editor (TipTap) with undo/redo (UI component)
- [x] Section detection (service)
- [x] Pre-generation validation service
- [x] Validation UI panel (UI component)
- [x] Auto-save for draft documents (API + service)
- [x] Draft recovery prompt (UI component)
- [x] Document cloning feature

### Phase 3: Export & Sharing

- [ ] PDF export (Puppeteer)
- [ ] Letterhead management
- [ ] Draft watermark for non-finalized documents
- [ ] Share link creation
- [ ] Public share page (unbranded)

### Phase 4: UI Polish

- [ ] Template selection wizard
- [ ] Document generation wizard
- [ ] Section navigation sidebar
- [ ] Page break indicators
- [ ] Signing block rendering
- [ ] Real-time PDF preview panel
- [ ] PDF preview page navigation
- [ ] Letterhead toggle in preview

### Phase 5: AI Integration

- [ ] AI sidebar component
- [ ] AI chat service (using Connectors Hub)
- [ ] Context-aware prompts
- [ ] Insert AI content to editor
- [ ] Conversation persistence (optional)

### Phase 6: Comments & Review

- [ ] Document comments database schema
- [ ] Comment service (CRUD, resolve, reply)
- [ ] Comment panel UI
- [ ] Text selection highlighting
- [ ] Comment thread display
- [ ] Resolve/reopen workflow

### Phase 7: Template Partials (Future Enhancement)

- [ ] Template partials database schema
- [ ] Partial service (CRUD)
- [ ] Partial inclusion syntax (`{{> partial-name}}`)
- [ ] Partial management UI
- [ ] Usage tracking (which templates use which partials)

### Phase 8: Integration Readiness

- [ ] Clean interface exports (IDocumentGenerator, etc.)
- [ ] DocumentStepResult for workflow
- [ ] Documentation for workflow integration
- [ ] API versioning consideration

---

## RBAC Additions

Add new resource permissions:

```typescript
// Add to RESOURCES in src/lib/rbac.ts
export const RESOURCES = [
  // ...existing
  'document_template',
  'generated_document',
] as const;

// Default permissions for system roles
const TENANT_ADMIN_PERMISSIONS = [
  // ...existing
  'document_template:manage',
  'generated_document:manage',
];

const COMPANY_ADMIN_PERMISSIONS = [
  // ...existing
  'document_template:read',
  'generated_document:create',
  'generated_document:read',
  'generated_document:update',
  'generated_document:delete',
  'generated_document:export',
  'generated_document:comment',
];

const COMPANY_USER_PERMISSIONS = [
  // ...existing
  'document_template:read',
  'generated_document:read',
  'generated_document:comment',
];
```

---

## Audit Log Actions

Add new audit actions:

```typescript
// Add to AuditAction enum
TEMPLATE_CREATED
TEMPLATE_UPDATED
TEMPLATE_DELETED
TEMPLATE_DUPLICATED
TEMPLATE_COPIED_TO_TENANT   // SUPER_ADMIN copies template between tenants

DOCUMENT_GENERATED
DOCUMENT_UPDATED
DOCUMENT_FINALIZED
DOCUMENT_UNFINALIZED        // Document returned to draft status
DOCUMENT_ARCHIVED
DOCUMENT_EXPORTED

SHARE_CREATED
SHARE_REVOKED
SHARE_ACCESSED

LETTERHEAD_UPDATED
```

---

## Dependencies

### New NPM Packages

| Package | Purpose | Version |
|---------|---------|---------|
| puppeteer | PDF generation | ^22.x |
| @tiptap/react | Rich text editor (existing) | ^2.x |
| dompurify | HTML sanitization (existing) | ^3.x |
| date-fns | Date formatting | ^3.x |

### Lazy Loading

PDF generation (Puppeteer) should be lazy-loaded to avoid increasing bundle size:

```typescript
async function getPuppeteer() {
  const puppeteer = await import('puppeteer');
  return puppeteer.default;
}
```

---

## Design Decisions

The following decisions were made during the design phase:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **System Templates** | No system-wide templates | SUPER_ADMIN can copy templates between tenants instead |
| **Version History** | Current version only | Simplifies implementation; duplicate template for variations |
| **Letterhead Scope** | Tenant-level only | User selects letterhead or none at generation time |
| **Document Finalization** | Reversible (un-finalize) | Allows corrections with full audit trail |
| **Share Page Branding** | No branding | Clean, professional viewing experience for recipients |
| **Share Expiration** | Template default + override | Defined at template level, user can override at generation |
| **Resolution Numbering** | Manual entry | User enters via custom data fields |
| **Template Access** | Permission-based | Anyone with `document_template:create` can create templates |
| **Batch Generation** | Not supported | Generate documents one at a time |
| **External Comments** | Optional per share link | External viewers can comment without login when `allowComments` is enabled |
| **External Commenter Identity** | Name required, email optional | Simple identification without requiring registration |
| **Comment Resolution** | Internal users only | Only authenticated users can resolve/reopen comments |
| **Comment Character Limit** | 1,000 characters | Prevents abuse while allowing detailed feedback |
| **Comment Rate Limit** | 20 per hour per IP | Configurable per share link, prevents spam |
| **Comment Moderation** | Hide/unhide by document owner | Owner can hide inappropriate comments without deleting |
| **Comment Notifications** | Optional per share link | Owner chooses whether to be notified of new comments/views |
| **Comment Display** | Non-obstructive sidebar | Doesn't overlay document; collapsible panel with clear text tagging |
| **Comment Tagging** | Superscript numbers on highlighted text | Clear visual link between document text and comments |

---

## Summary

The Document Generation Module provides a comprehensive solution for:

1. **Template Management** - Create and manage reusable document templates
2. **Smart Placeholders** - Auto-populate company/contact data with flexible syntax
3. **Document Generation** - Generate, edit, and finalize documents
4. **PDF Export** - Professional PDFs with optional tenant letterhead
5. **Sharing** - Secure, shareable URLs with section navigation and external commenting
6. **External Collaboration** - External viewers can leave comments without signup/login
7. **Modularity** - Clean interfaces for future workflow integration

The design follows existing Oakcloud patterns for multi-tenancy, RBAC, audit logging, and service architecture, ensuring consistency and maintainability.
