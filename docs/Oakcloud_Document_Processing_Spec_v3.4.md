```md
# Oakcloud Document Processing Module
## Technical Specification v3.4

**Version:** 3.4
**Date:** December 2025
**Status:** Phase 1A Core Complete

---

## Implementation Status

| Phase | Component | Status | Notes |
|-------|-----------|--------|-------|
| **1A** | Database Schema | ✅ Complete | All models added to Prisma schema |
| **1A** | Document Processing Service | ✅ Complete | Pipeline management, locking, splitting |
| **1A** | Document Revision Service | ✅ Complete | Revision CRUD, approval workflow |
| **1A** | Document Extraction Service | ✅ Complete | AI extraction, split detection |
| **1A** | Duplicate Detection Service | ✅ Complete | Jaro-Winkler scoring |
| **1A** | API Routes | ✅ Complete | 11 endpoints implemented (list, detail, pages, bulk) |
| **1A** | UI - List Page | ✅ Complete | `/processing` with filters, stats, pagination, multi-select |
| **1A** | UI - Detail Page | ✅ Complete | `/processing/[id]` with revision history |
| **1A** | UI - Dialogs | ✅ Complete | Approve, duplicate decision dialogs |
| **1A** | UI - Document Page Viewer | ✅ Complete | Zoom, navigation, evidence highlight support |
| **1A** | UI - Line Item Editor | ✅ Complete | Editable table with auto-calc, validation display |
| **1A** | UI - Bulk Operations | ✅ Complete | Approve, re-extract, archive actions |
| **1B** | Multi-Currency | ⏳ Pending | Schema ready |
| **2** | Bank Reconciliation | ⏳ Pending | Schema ready |
| **3** | Client Portal | ⏳ Pending | Schema ready |
| **4** | Accounting Integration | ⏳ Pending | Schema ready |

**Last Updated:** December 2025

---

## Table of Contents

1. [Overview](#1-overview)
2. [Security & Access Control](#2-security--access-control)
3. [Phase 1A: Ingestion, Splitting, Classification & Extraction](#3-phase-1a-ingestion-splitting-classification--extraction)
4. [Phase 1B: Multi-Currency & GST](#4-phase-1b-multi-currency--gst)
5. [Phase 2: Bank Reconciliation](#5-phase-2-bank-reconciliation)
6. [Phase 3: Client Portal & Communication](#6-phase-3-client-portal--communication)
7. [Phase 4: Accounting Software Integration](#7-phase-4-accounting-software-integration)
8. [API Specifications](#8-api-specifications)
9. [UI Specification](#9-ui-specification)
10. [User Logic Flow](#10-user-logic-flow)
11. [Error Handling & Recovery](#11-error-handling--recovery)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Data Retention & Privacy](#13-data-retention--privacy)
14. [Implementation Timeline](#14-implementation-timeline)
15. [Appendix A: Evidence Coordinate Contract](#appendix-a-evidence-coordinate-contract)
16. [Appendix B: Document Fingerprints & Duplicate Scoring](#appendix-b-document-fingerprints--duplicate-scoring)
17. [Appendix C: Error Codes](#appendix-c-error-codes)
18. [Appendix D: State Diagrams](#appendix-d-state-diagrams)
19. [Appendix E: Invariants & Business Rules](#appendix-e-invariants--business-rules)
20. [Appendix F: Validation Issue Codes](#appendix-f-validation-issue-codes)
21. [Appendix G: Search (MVP)](#appendix-g-search-mvp)

---

## 1. Overview

### 1.1 Purpose

Build a document processing module for Oakcloud that automates:
- ingestion (including multi-document PDFs),
- document classification and structured extraction (including line items),
- multi-currency conversion (home currency + bank account currency aware),
- bank reconciliation matching,
- client communication and accounting exports/integrations,

for accounting practices.

### 1.2 Key Product Principles

1. **Immutability where it matters**
   - `DocumentExtraction` is immutable (raw AI/OCR outputs).
   - Approved accounting data is represented as immutable **revisions**.
   - Workflow state changes are captured as auditable state transitions.

2. **Human auditability**
   - Every approval/edit after approval creates a new revision.
   - Every revision, duplicate decision, lock event, posting action, and reconciliation action is auditable.
   - All data access and modifications are logged.

3. **Evidence-first UX**
   - Every extracted field must include evidence citations, including **bbox highlights** where feasible.
   - Evidence uses a defined coordinate contract (Appendix A) and must remain stable across container and child views.

4. **Currency correctness**
   - Company has a `homeCurrency`.
   - Bank accounts have their own `currency`.
   - Matching operates in the bank account currency (with rate audit trail).

5. **Security by design**
   - Tenant isolation enforced at database level.
   - Role-based access control for all operations.
   - Encryption at rest and in transit.

6. **Resilient processing**
   - Graceful degradation on provider failures.
   - Idempotent operations throughout (API and workers).
   - Comprehensive error recovery.

### 1.3 Definitions

| Term | Definition |
|------|------------|
| **Container document** | The uploaded file record (e.g., a PDF containing multiple receipts). Not directly "bookable". |
| **Child document** | A logical accounting document (invoice/receipt/etc.) representing a contiguous page range within a container. |
| **Extraction** | An immutable output from OCR/LLM normalization. |
| **Revision** | An immutable snapshot of structured accounting data (header + line items). Created on extraction and on every later edit. |
| **Duplicate** | Same underlying economic document; should not be booked twice. |
| **Version** | Same economic document, improved scan/reprocessing; replaces prior record as canonical. |
| **Tenant** | An accounting practice (the billable entity). |
| **Company** | A client of the accounting practice. Belongs to exactly one Tenant. |

### 1.4 Multi-Tenancy Model

```
Tenant (Accounting Practice)
├── Company (Client A)
│   ├── Documents
│   ├── Bank Accounts
│   └── Vendor Aliases
├── Company (Client B)
│   ├── Documents
│   ├── Bank Accounts
│   └── Vendor Aliases
└── Users (Staff)
```

- **Tenant**: Accounting practice (billable entity)
- **Company**: Client of the accounting practice
- A Company belongs to exactly one Tenant
- Documents are scoped to Company (inherits Tenant via Company)
- VendorAlias is Company-scoped (different clients may use same vendor differently)
- ExchangeRates are global (system-wide cache)
- Users belong to a Tenant and may access multiple Companies based on permissions

---

## 2. Security & Access Control

### 2.1 Authentication

| Component | Mechanism |
|-----------|-----------|
| API Authentication | JWT (RS256) with OAuth 2.0 |
| Token Lifetime | Access: 15 minutes, Refresh: 7 days |
| Service-to-Service | API keys with HMAC signing |
| MFA | Required for elevated permissions |

**JWT Claims:**
```json
{
  "sub": "user-uuid",
  "tid": "tenant-uuid",
  "roles": ["accountant"],
  "permissions": ["document:read", "document:write", "document:approve"],
  "exp": 1702500000
}
```

### 2.2 Role-Based Access Control (RBAC)

#### 2.2.1 Roles

| Role | Description |
|------|-------------|
| `tenant_admin` | Full access to tenant configuration and user management |
| `accountant` | Full access to document processing and reconciliation |
| `reviewer` | Read access plus approval capabilities |
| `client` | Limited access to own company's documents via portal |
| `api_service` | Programmatic access for integrations |

#### 2.2.2 Permissions

| Permission | Description | Roles |
|------------|-------------|-------|
| `document:read` | View documents and extractions | All |
| `document:write` | Upload and edit documents | accountant, tenant_admin |
| `document:approve` | Approve revisions | accountant, reviewer, tenant_admin |
| `document:delete` | Soft-delete documents | accountant, tenant_admin |
| `document:overrideLock` | Approve in locked periods | tenant_admin |
| `document:lock` | Acquire/release review locks | accountant, reviewer, tenant_admin |
| `reconciliation:read` | View matches | All except client |
| `reconciliation:write` | Create/modify matches | accountant, tenant_admin |
| `reconciliation:lock` | Lock reconciliation periods | tenant_admin |
| `export:execute` | Export to accounting software | accountant, tenant_admin |
| `posting:execute` | Post approved revisions to accounting software | accountant, tenant_admin |
| `posting:override` | Override posting lock for corrective actions | tenant_admin |
| `admin:users` | Manage users | tenant_admin |
| `admin:settings` | Modify tenant settings | tenant_admin |

### 2.3 Tenant Isolation

#### 2.3.1 Database Row-Level Security

All tenant-scoped tables must enforce RLS policies.

```sql
-- Example RLS policy for documents
CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Composite index pattern for all tenant-scoped queries
CREATE INDEX idx_documents_tenant_company ON documents(tenant_id, company_id);
```

Tenant-scoped tables include (non-exhaustive):
- documents, document_pages, document_extractions, document_revisions, document_revision_line_items
- companies, contacts, vendor_aliases
- bank_accounts, bank_transactions, match_groups, match_group_items, reconciliation_periods
- client_portal_users, client_requests, communications
- accounting_integrations, external_postings
- audit_logs, idempotency_records
- processing_attempts, processing_checkpoints
- split_plans, document_state_events, document_derived_files

#### 2.3.2 Tenant Consistency Constraints

Where `tenantId` is denormalized for performance, database-level consistency must be enforced:
- `Document.tenantId` must match `Company.tenantId` for `Document.companyId`
- `Contact.tenantId` must match `Company.tenantId` for `Contact.companyId`
- Same for any model with both `companyId` and `tenantId`

Implementation options (Postgres):
- trigger-based enforcement on insert/update, or
- composite foreign keys where feasible

#### 2.3.3 Query Enforcement

- All repository methods must include tenant filter
- API middleware sets tenant context from JWT
- Background jobs must explicitly set tenant context before operations

### 2.4 Encryption

| Data State | Mechanism |
|------------|-----------|
| In Transit | TLS 1.3 minimum |
| At Rest (Database) | AES-256 via cloud provider |
| At Rest (Files) | Envelope encryption (tenant KEK + per-object DEK) |
| Sensitive Fields | Application-level encryption for sensitive data |

#### 2.4.1 File Encryption (Envelope Encryption)

All stored file objects (original PDFs, rendered page images, derived PDFs) use envelope encryption:
- A per-object **DEK** encrypts file content.
- The DEK is encrypted with a **tenant-specific KEK** managed in cloud KMS.
- Rotation is supported by re-wrapping DEKs.

Key policies:
- KEK rotation: at least annually (or per enterprise policy)
- Suspension: tenant suspension may disable decryption
- Legal hold: prevents deletion of encryption metadata

**Sensitive fields requiring application-level encryption:**
- `Contact.taxIdentificationNumber`
- `BankAccount.accountNumber`
- `WebhookSubscription.secret`
- `User.mfaSecret`
- `ClientPortalUser.mfaSecret`

### 2.5 Audit Logging

```prisma
model AuditLog {
  id           String      @id @default(uuid())
  tenantId     String
  userId       String?
  serviceId    String?     // For service-to-service calls
  action       AuditAction
  resourceType String
  resourceId   String
  oldValue     Json?       // Encrypted for sensitive resources
  newValue     Json?       // Encrypted for sensitive resources
  metadata     Json?
  ipAddress    String?
  userAgent    String?
  requestId    String?     // Correlation ID
  createdAt    DateTime    @default(now())

  @@index([tenantId, resourceType, createdAt])
  @@index([tenantId, userId, createdAt])
  @@index([resourceId])
  @@index([requestId])
}

enum AuditAction {
  VIEW
  CREATE
  UPDATE
  DELETE
  APPROVE
  REJECT
  EXPORT
  DOWNLOAD
  LOGIN
  LOGOUT
  PERMISSION_CHANGE
  LOCK
  UNLOCK
  POST
  UNPOST
  RECONCILE
}
```

**Audit requirements:**
- All CRUD operations on Documents, Revisions, Matches, Postings
- All approval/rejection actions
- Authentication events
- Permission changes
- Export operations
- Lock acquire/release/force-release actions
- Duplicate decisions and canonical version changes
- Retention: 7 years minimum

---

## 3. Phase 1A: Ingestion, Splitting, Classification & Extraction

**Duration:** 6–9 weeks

**Risk Factors:**
- LLM provider API stability
- BBox accuracy across PDF variants
- Line item extraction complexity for non-standard formats

### 3.1 User Stories

| ID | Story | Acceptance Criteria |
|----|-------|---------------------|
| US-1.1 | As an accountant, I can upload multiple documents and have them processed | Upload 20 PDFs → 20 container Document records + 20 queued jobs within 20 seconds (excluding provider downtime) |
| US-1.2 | As an accountant, I can upload a multi-document PDF and Oakcloud splits it into child documents | 1 PDF with 10 receipts → 1 container + 10 child Documents, each with page ranges, within 60 seconds |
| US-1.3 | As an accountant, I can review extracted header + line items and approve | Review UI shows field values + evidence highlight; approval creates an APPROVED revision |
| US-1.4 | As an accountant, I can edit a previously approved document with full audit trail | Edit creates a new revision, superseding the prior revision; audit entry created |
| US-1.5 | As an accountant, I am warned when uploading a potential duplicate | Exact duplicate (hash match) shows confirmation dialog; suspected duplicates use multi-signal scoring |
| US-1.6 | As an accountant, I can re-process a document using a different model | New immutable DocumentExtraction created; new DRAFT revision created from it |
| US-1.7 | As an accountant, I can view bbox highlights for extracted fields | Clicking a field highlights bbox on the correct container page with correct orientation/scale (Appendix A) |
| US-1.8 | As an accountant, I can filter documents by category, status, date, vendor | Query < 500ms for 10,000 child documents (excluding full-text search cold cache) |
| US-1.9 | As an accountant, I can perform bulk operations on selected documents | Batch approve/archive/re-extract up to 100 documents |
| US-1.10 | As an accountant, I can download child PDFs created from a page range | Child PDF download returns a derived PDF with correct pages and stable evidence mapping |
| US-1.11 | As an accountant, I can lock/unlock a document for review | Lock prevents conflicting edits; auto-expiry and admin force-release work |

### 3.2 Data Model

#### 3.2.1 Core Entity Models

```prisma
model Tenant {
  id              String    @id @default(uuid())
  name            String
  slug            String    @unique
  settings        Json?
  
  // Subscription
  plan            TenantPlan @default(STANDARD)
  billingEmail    String?
  
  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  suspendedAt     DateTime?

  companies       Company[]
  users           User[]
  webhooks        WebhookSubscription[]
  
  @@index([slug])
}

enum TenantPlan {
  TRIAL
  STANDARD
  PROFESSIONAL
  ENTERPRISE
}

model Company {
  id              String    @id @default(uuid())
  tenantId        String
  name            String
  
  // Tax profile
  homeCurrency    String    // ISO 4217
  gstRegistered   Boolean   @default(false)
  gstRegistrationNo String?
  reverseChargeApplicable Boolean @default(false)
  gstFilingFrequency GstFilingFrequency?
  
  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  documents       Document[]
  bankAccounts    BankAccount[]
  contacts        Contact[]
  vendorAliases   VendorAlias[]

  @@index([tenantId])
  @@index([tenantId, name])
}

enum GstFilingFrequency {
  MONTHLY
  QUARTERLY
}

model User {
  id              String    @id @default(uuid())
  tenantId        String
  email           String
  name            String
  role            UserRole
  permissions     String[]  // Additional granular permissions
  
  // MFA
  mfaEnabled      Boolean   @default(false)
  mfaSecret       String?   // Encrypted
  
  // Status
  isActive        Boolean   @default(true)
  lastLoginAt     DateTime?
  
  // Timestamps
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  
  @@unique([tenantId, email])
  @@index([tenantId])
}

enum UserRole {
  TENANT_ADMIN
  ACCOUNTANT
  REVIEWER
  CLIENT
}

model Contact {
  id                    String    @id @default(uuid())
  companyId             String
  tenantId              String    // Denormalized; must match Company.tenantId (enforced)
  
  type                  ContactType
  name                  String
  email                 String?
  phone                 String?
  address               Json?
  
  // Tax identifiers (encrypted at application level)
  taxIdentificationNumber String?
  gstRegistrationNo     String?
  
  // Timestamps
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  deletedAt             DateTime?
  anonymizedAt          DateTime? // For GDPR erasure

  company               Company   @relation(fields: [companyId], references: [id])
  vendorAliases         VendorAlias[]

  @@index([companyId])
  @@index([tenantId, companyId])
  @@index([companyId, name])
}

enum ContactType {
  VENDOR
  CUSTOMER
  BOTH
}
```

#### 3.2.2 Document Model

```prisma
model Document {
  id                  String    @id @default(uuid())
  companyId           String
  tenantId            String    // Denormalized; must match Company.tenantId (enforced)

  // Container/child relationship
  isContainer         Boolean   @default(false)
  parentDocumentId    String?
  parentDocument      Document? @relation("DocumentSplit", fields: [parentDocumentId], references: [id])
  children            Document[] @relation("DocumentSplit")

  // Page addressing (contiguous ranges only)
  pageFrom            Int?      // inclusive (child only)
  pageTo              Int?      // inclusive (child only)
  pageCount           Int?      // container: computed on ingestion

  // File metadata (container only)
  fileName            String
  containerFilePath   String?   // Only set for containers
  containerFileSize   Int?      // Only set for containers
  mimeType            String
  contentTypeDetected String?

  // File characteristics
  isEncryptedPdf      Boolean   @default(false)
  isPasswordProtected Boolean   @default(false)

  // Duplicate detection (container level)
  fileHash            String    // SHA-256 exact match
  perceptualHash      String?   // pHash for scanned similarity

  // Processing lifecycle
  pipelineStatus      PipelineStatus @default(UPLOADED)
  processingPriority  ProcessingPriority @default(NORMAL)
  slaDeadline         DateTime?
  
  // Error tracking
  lastError           Json?
  errorCount          Int       @default(0)
  firstErrorAt        DateTime?
  canRetry            Boolean   @default(true)
  nextRetryAt         DateTime?
  deadLetterAt        DateTime?

  // Duplicate workflow (child-level)
  duplicateStatus     DuplicateStatus @default(NONE)
  duplicateOfId       String?
  duplicateScore      Float?
  duplicateReason     String?

  // Versioning (same economic document, better scan)
  rootDocumentId      String?
  version             Int       @default(1)

  // Canonical/version handling
  isArchived          Boolean   @default(false)
  archivedAt          DateTime?
  archivedById        String?
  archiveReason       String?

  // Current structured data pointer
  currentRevisionId   String?   @unique
  
  // Concurrency control
  lockVersion         Int       @default(0)
  lockedById          String?
  lockedAt            DateTime?
  lockExpiresAt       DateTime?

  // Upload context
  uploadSource        UploadSource @default(WEB)
  uploadedById        String?

  // Timestamps
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  deletedAt           DateTime?
  
  // Compliance
  legalHold           Boolean   @default(false)
  retentionUntil      DateTime?

  // Relations
  company             Company   @relation(fields: [companyId], references: [id])
  uploadedBy          User?     @relation(fields: [uploadedById], references: [id])
  archivedBy          User?     @relation(fields: [archivedById], references: [id])
  duplicateOf         Document? @relation("DocumentDuplicates", fields: [duplicateOfId], references: [id])
  rootDocument        Document? @relation("DocumentVersions", fields: [rootDocumentId], references: [id])
  currentRevision     DocumentRevision? @relation("CurrentRevision", fields: [currentRevisionId], references: [id])
  lockedBy            User?     @relation("DocumentLocks", fields: [lockedById], references: [id])

  pages               DocumentPage[]
  extractions         DocumentExtraction[]
  revisions           DocumentRevision[] @relation("DocumentRevisions")
  links               DocumentLink[]
  duplicateDecisions  DuplicateDecision[]
  processingAttempts  ProcessingAttempt[]
  processingCheckpoints ProcessingCheckpoint[]
  stateEvents         DocumentStateEvent[]
  derivedFiles        DocumentDerivedFile[]

  @@index([tenantId, companyId])
  @@index([companyId, pipelineStatus])
  @@index([companyId, createdAt])
  @@index([fileHash])
  @@index([parentDocumentId])
  @@index([rootDocumentId])
  @@index([pipelineStatus, nextRetryAt])
}

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

enum ProcessingPriority {
  LOW
  NORMAL
  HIGH
  CRITICAL
}

enum UploadSource {
  WEB
  EMAIL
  API
  CLIENT_PORTAL
}

enum DuplicateStatus {
  NONE
  SUSPECTED
  CONFIRMED
  REJECTED
}
```

#### 3.2.3 DocumentPage Model

```prisma
model DocumentPage {
  id            String   @id @default(uuid())
  documentId    String   // container document id
  pageNumber    Int

  // Rendered image for UI highlights
  renderDpi     Int      // e.g., 200
  imagePath     String   // stored image for consistent UI rendering
  imageFingerprint String? // sha256 of rendered image bytes

  // Geometry
  widthPx       Int
  heightPx      Int
  rotationDeg   Int      @default(0) // 0/90/180/270

  // OCR outputs
  ocrProvider   String?
  ocrJson       Json?    // Word boxes and confidence scores

  createdAt     DateTime @default(now())

  document      Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, pageNumber])
  @@index([documentId])
}
```

#### 3.2.4 DocumentExtraction Model

```prisma
model DocumentExtraction {
  id                      String         @id @default(uuid())
  documentId              String

  extractionType          ExtractionType

  // Provider details
  provider                String
  model                   String
  promptVersion           String
  extractionSchemaVersion String         // e.g. "1.0.0"

  // Inputs and reproducibility
  inputFingerprint        String?        // hash of prompt+tools+file/page ranges
  selectorVersion         String?        // model selector version

  // Results
  rawJson                 Json
  rawText                 String?
  confidenceJson          Json
  evidenceJson            Json?          // includes evidence per Appendix A
  overallConfidence       Float?

  // Text acquisition metadata
  hasEmbeddedText         Boolean
  textAcquisitionJson     Json?          // selector signals and per-page choice
  ocrProvider             String?
  
  // Cost/usage
  promptTokens            Int?
  completionTokens        Int?
  tokensUsed              Int?
  latencyMs               Int?
  providerRequestId       String?

  createdAt               DateTime       @default(now())

  document                Document       @relation(fields: [documentId], references: [id], onDelete: Cascade)
  revisions               DocumentRevision[]

  @@index([documentId, extractionType])
  @@index([providerRequestId])
}

enum ExtractionType {
  SPLIT
  FIELDS
}
```

#### 3.2.5 DocumentRevision Model

```prisma
model DocumentRevision {
  id                      String           @id @default(uuid())
  documentId              String

  // Lineage
  basedOnRevisionId       String?
  extractionId            String?

  revisionNumber          Int
  revisionType            RevisionType
  status                  RevisionStatus   @default(DRAFT)
  reason                  String?          // initial_extraction, user_edit, reprocess

  // Classification
  documentCategory        DocumentCategory

  // Header fields
  vendorName              String?
  vendorId                String?
  documentNumber          String?
  documentDate            DateTime?        @db.Date
  dueDate                 DateTime?        @db.Date

  // Amounts (document currency)
  currency                String
  subtotal                Decimal?         @db.Decimal(18,4)
  taxAmount               Decimal?         @db.Decimal(18,4)
  totalAmount             Decimal          @db.Decimal(18,4) // CREDIT_NOTE must be negative

  // Rounding policy used at approval time
  roundingMode            RoundingMode     @default(HALF_UP)

  // GST
  gstTreatment            GstTreatment?
  supplierGstNo           String?

  // Currency conversion (home currency)
  homeCurrency            String
  homeExchangeRateSource  ExchangeRateSource?
  homeExchangeRate        Decimal?         @db.Decimal(18,8)
  exchangeRateDate        DateTime?        @db.Date
  homeEquivalent          Decimal?         @db.Decimal(18,4)

  // Validation
  validationStatus        ValidationStatus @default(PENDING)
  validationIssues        Json?

  // Document key for duplicates
  documentKey             String?
  documentKeyVersion      String?          // e.g. "1"
  documentKeyConfidence   Float?

  // Evidence for header fields
  headerEvidenceJson      Json?

  // Posting/export lifecycle
  postingStatus           RevisionPostingStatus @default(NOT_POSTED)
  postedAt                DateTime?
  postingLock             Boolean          @default(false) // set true when posted to prevent silent edits

  // Reconciliation lifecycle
  reconciliationStatus    RevisionReconciliationStatus @default(NOT_RECONCILED)

  // Audit fields
  createdById             String
  createdAt               DateTime         @default(now())
  approvedById            String?
  approvedAt              DateTime?
  supersededAt            DateTime?

  document                Document         @relation("DocumentRevisions", fields: [documentId], references: [id], onDelete: Cascade)
  currentForDocument      Document?        @relation("CurrentRevision")
  extraction              DocumentExtraction? @relation(fields: [extractionId], references: [id])
  basedOnRevision         DocumentRevision? @relation("RevisionChain", fields: [basedOnRevisionId], references: [id])
  derivedRevisions        DocumentRevision[] @relation("RevisionChain")
  items                   DocumentRevisionLineItem[]
  matchGroupItems         MatchGroupItem[]
  postings                ExternalPosting[]

  @@unique([documentId, revisionNumber])
  @@index([documentId, status])
  @@index([vendorId])
  @@index([documentDate])
  @@index([documentKey])
}

model DocumentRevisionLineItem {
  id            String   @id @default(uuid())
  revisionId    String
  lineNo        Int

  description   String
  quantity      Decimal? @db.Decimal(18,4)
  unitPrice     Decimal? @db.Decimal(18,4)
  amount        Decimal  @db.Decimal(18,4)

  gstAmount     Decimal? @db.Decimal(18,4)
  taxCode       String?

  // Evidence for this line item
  evidenceJson  Json?

  revision      DocumentRevision @relation(fields: [revisionId], references: [id], onDelete: Cascade)

  @@unique([revisionId, lineNo])
  @@index([revisionId])
}

enum RevisionType {
  EXTRACTION
  USER_EDIT
  REPROCESS
  SYSTEM_MERGE
}

enum RevisionStatus {
  DRAFT
  APPROVED
  SUPERSEDED
}

enum DocumentCategory {
  INVOICE
  RECEIPT
  CREDIT_NOTE
  DEBIT_NOTE
  PURCHASE_ORDER
  STATEMENT
  OTHER
}

enum GstTreatment {
  STANDARD_RATED
  ZERO_RATED
  EXEMPT
  OUT_OF_SCOPE
  REVERSE_CHARGE
}

enum ValidationStatus {
  PENDING
  VALID
  WARNINGS
  INVALID
}

enum ExchangeRateSource {
  MAS_DAILY
  IRAS_MONTHLY_AVG
  MANUAL
  PROVIDER_DEFAULT
}

enum RoundingMode {
  HALF_UP
  HALF_EVEN
  DOWN
  UP
}

enum RevisionPostingStatus {
  NOT_POSTED
  POSTING
  POSTED
  POST_FAILED
  REVERSED
}

enum RevisionReconciliationStatus {
  NOT_RECONCILED
  SUGGESTED
  RECONCILED
  UNRECONCILED
}
```

#### 3.2.6 Supporting Models

```prisma
model VendorAlias {
  id                  String    @id @default(uuid())
  companyId           String
  tenantId            String    // Denormalized; must match Company.tenantId (enforced)
  rawName             String
  normalizedContactId String
  confidence          Float     @default(1.0)
  createdById         String?
  createdAt           DateTime  @default(now())
  deletedAt           DateTime?

  company             Company   @relation(fields: [companyId], references: [id])
  normalizedContact   Contact   @relation(fields: [normalizedContactId], references: [id])

  // Postgres implementation requirement:
  // unique(companyId, rawName) WHERE deletedAt IS NULL
  @@index([tenantId, companyId])
  @@index([companyId, rawName])
}

model DuplicateDecision {
  id            String          @id @default(uuid())
  documentId    String
  suspectedOfId String

  decision      DuplicateAction
  reason        String?

  decidedById   String
  decidedAt     DateTime        @default(now())

  document      Document        @relation(fields: [documentId], references: [id])
  decidedBy     User            @relation(fields: [decidedById], references: [id])

  @@index([documentId])
  @@index([suspectedOfId])
}

enum DuplicateAction {
  CONFIRM_DUPLICATE
  REJECT_DUPLICATE
  MARK_AS_NEW_VERSION
}

model DocumentLink {
  id              String   @id @default(uuid())
  documentId      String
  linkedEntityType String  // e.g., "ClientRequest", "Communication"
  linkedEntityId  String
  linkType        String   // e.g., "attachment", "reference"
  createdAt       DateTime @default(now())

  document        Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, linkedEntityType, linkedEntityId])
  @@index([documentId])
  @@index([linkedEntityType, linkedEntityId])
}

model ProcessingAttempt {
  id              String        @id @default(uuid())
  documentId      String
  attemptNumber   Int
  step            ProcessingStep
  status          AttemptStatus
  
  startedAt       DateTime
  completedAt     DateTime?
  
  errorCode       String?
  errorMessage    String?
  errorDetails    Json?
  
  providerLatencyMs Int?
  providerRequestId String?

  document        Document      @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, attemptNumber, step])
  @@index([documentId, attemptNumber])
  @@index([status, completedAt])
}

enum ProcessingStep {
  FILE_VALIDATION
  RENDER
  TEXT_ACQUISITION
  SPLIT_DETECTION
  FIELD_EXTRACTION
  VALIDATION
  REVISION_CREATION
  DUPLICATE_CHECK
}

enum AttemptStatus {
  RUNNING
  SUCCEEDED
  FAILED_RETRYABLE
  FAILED_PERMANENT
}
```

#### 3.2.7 New: SplitPlan Model

```prisma
model SplitPlan {
  id            String   @id @default(uuid())
  containerId    String
  tenantId       String
  companyId      String

  method        SplitMethod
  schemaVersion String    // e.g. "1.0"
  rangesJson    Json      // ordered page ranges and metadata
  supersededAt  DateTime?

  createdById   String?
  createdAt     DateTime @default(now())

  @@index([containerId, createdAt])
}

enum SplitMethod {
  AUTO
  MANUAL
}
```

#### 3.2.8 New: DocumentStateEvent Model

```prisma
model DocumentStateEvent {
  id             String   @id @default(uuid())
  documentId     String
  tenantId       String
  companyId      String

  eventType      String   // PIPELINE_STATUS_CHANGED, LOCK_ACQUIRED, DUPLICATE_STATUS_CHANGED, ARCHIVED, etc.
  fromState      String?
  toState        String?
  reason         String?
  metadata       Json?

  actorUserId    String?
  actorServiceId String?

  createdAt      DateTime @default(now())

  document       Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([tenantId, companyId, createdAt])
  @@index([documentId, createdAt])
}
```

#### 3.2.9 New: DocumentDerivedFile Model

```prisma
model DocumentDerivedFile {
  id             String   @id @default(uuid())
  documentId     String
  tenantId       String
  companyId      String

  kind           DerivedFileKind
  path           String
  mimeType       String
  sizeBytes      Int?
  fingerprint    String?  // hash for cache/evidence compatibility

  createdAt      DateTime @default(now())

  document       Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId, kind])
  @@index([tenantId, companyId, createdAt])
}

enum DerivedFileKind {
  CHILD_PDF
  THUMBNAIL
  REDACTED_PDF
}
```

### 3.3 Processing State Machine

#### 3.3.1 Pipeline Status Flow

```
UPLOADED (container)
  └─► QUEUED
       └─► PROCESSING
            ├─► SPLIT_PENDING ─► SPLIT_DONE ─► (create child docs at QUEUED)
            ├─► FAILED_RETRYABLE ─► QUEUED (on retry)
            └─► FAILED_PERMANENT / DEAD_LETTER

QUEUED (child)
  └─► PROCESSING
       ├─► EXTRACTION_DONE ─► (create DRAFT revision)
       ├─► FAILED_RETRYABLE ─► QUEUED (on retry)
       └─► FAILED_PERMANENT / DEAD_LETTER
```

See Appendix D for detailed state diagrams.

#### 3.3.2 Business Workflow

- Each child document has zero or more revisions.
- Exactly one revision is current (`Document.currentRevisionId`).
- Approving a revision:
  1. Enforces gating rules (Appendix E), including duplicate decision requirements
  2. Sets revision to APPROVED
  3. Supersedes prior APPROVED revision (sets to SUPERSEDED)
  4. Updates `Document.currentRevisionId`
  5. Creates audit log entry and `DocumentStateEvent`

#### 3.3.3 Posting/Reconciliation Guardrails

- If a revision is posted to accounting software, set `DocumentRevision.postingStatus=POSTED` and `DocumentRevision.postingLock=true`.
- If a posted revision needs changes, a new revision must be created and a provider-specific corrective posting workflow must be executed (Phase 4).
- Tenant admins may override posting guardrails using `posting:override` with a mandatory reason and audit entry.

### 3.4 Ingestion & Extraction Pipeline

#### 3.4.1 Container Pipeline Steps

1. **Ingest & file checks**
   - Compute `fileHash` (SHA-256)
   - Detect encrypted/password protected PDF
   - Compute `pageCount`
   - Validate file size and page count limits
   - **Checkpoint: FILE_VALIDATION complete**

2. **Hash-based duplicate check**
   - Query existing documents by `fileHash`
   - If exact match found, prompt user for decision
   - If user proceeds, record acknowledgement and continue processing

3. **Page rendering**
   - Render each page at configured DPI (default: 200)
   - Store rendered images
   - Create `DocumentPage` records with geometry
   - Store `DocumentPage.imageFingerprint` for evidence compatibility
   - Rendering must be idempotent: re-running must not create duplicate page records
   - **Checkpoint: RENDER complete**

4. **Text acquisition model selector (per page)**
   - Analyze embedded text quality (density, entropy, language confidence)
   - Output: `EMBEDDED` / `OCR` / `HYBRID` per page
   - Store decision in extraction record
   - **Checkpoint: TEXT_ACQUISITION complete**

5. **Split detection**
   - Create `DocumentExtraction` of type `SPLIT`
   - Identify document boundaries
   - Persist `SplitPlan(method=AUTO)` with page ranges
   - Create child documents with page ranges; enforce idempotency by unique active page-range per container
   - Set container to `SPLIT_DONE`
   - Queue child documents for extraction
   - **Checkpoint: SPLIT_DETECTION complete**

#### 3.4.2 Manual Split Behavior

Manual split creates a new split plan and supersedes prior plans:

1. Create `SplitPlan(method=MANUAL)`
2. Mark prior non-superseded split plan `supersededAt=now()`
3. Archive existing children created under superseded split plan:
   - `Document.isArchived=true`
   - `archivedAt`, `archivedById`, `archiveReason="SPLIT_PLAN_SUPERSEDED"`
4. Create new child documents for the manual page ranges and queue them

#### 3.4.3 Child Document Pipeline Steps

Default behavior is strict extraction: page-level failures cause the child pipeline to fail retryably and no revision is created.

1. **Field extraction**
   - Create `DocumentExtraction` type `FIELDS`
   - Extract:
     - Document category
     - Header fields (vendor, dates, amounts)
     - Line items with quantities, prices, amounts
     - Evidence per field including bbox (Appendix A)
   - **Checkpoint: FIELD_EXTRACTION complete**

2. **Validation**
   - Arithmetic validation (subtotal + tax = total)
   - Line item sum validation
   - Date validation (not future, reasonable range)
   - Currency validation
   - GST validation (Phase 1B extends)
   - Credit note validation (negative total requirement)
   - **Checkpoint: VALIDATION complete**

3. **Create DRAFT revision**
   - Create `DocumentRevision` with `revisionType=EXTRACTION`
   - Create `DocumentRevisionLineItem[]`
   - Set `Document.currentRevisionId`
   - **Checkpoint: REVISION_CREATION complete**

4. **Content-based duplicate detection**
   - Compute `documentKey` using multi-signal model (Appendix B)
   - Calculate duplicate score against existing documents
   - If score >= threshold, set `Document.duplicateStatus=SUSPECTED`
   - **Checkpoint: DUPLICATE_CHECK complete**

5. **Set final status**
   - Set `Document.pipelineStatus=EXTRACTION_DONE`

Optional tenant setting:
- If enabled, partial extraction may create a DRAFT revision with a `PARTIAL_EXTRACTION` validation issue, but approval/export/match confirmation is blocked until a complete extraction exists.

#### 3.4.4 Model Selector Specification

The text acquisition selector determines the best text source for each page.

**Input signals:**
- Text density (characters per page area)
- Text entropy (character distribution)
- Font embedding status
- Language detection confidence
- Historical OCR improvement rate for similar documents

**Output (per page):**
```json
{
  "pageNumber": 1,
  "decision": "OCR",
  "signals": {
    "textDensity": 0.02,
    "entropy": 3.2,
    "languageConfidence": 0.45,
    "embeddedTextPresent": true,
    "embeddedTextQuality": "LOW"
  },
  "selectorVersion": "1.2.0"
}
```

**Decision rules:**
| Condition | Decision |
|-----------|----------|
| No embedded text | OCR |
| Embedded text quality HIGH + language confidence > 0.9 | EMBEDDED |
| Embedded text quality MEDIUM | HYBRID (embedded + OCR verification) |
| Embedded text quality LOW or language confidence < 0.7 | OCR |

#### 3.4.5 Evidence Requirements

For each extracted field in the revision:

**Header fields:**
- Store in `DocumentRevision.headerEvidenceJson`
- Structure per Appendix A

**Line items:**
- Store in `DocumentRevisionLineItem.evidenceJson`
- Each field (description, quantity, unitPrice, amount) should have bbox

**UI requirements:**
- Clicking any field highlights bbox on the correct container page
- Use stored page image at `renderDpi` for consistent overlay
- Handle page rotation

### 3.5 Validation Rules

#### 3.5.1 Line Item Validation

| Validation | Rule | Severity |
|-----------|------|----------|
| Line sum → subtotal | sum(line.amount) ≈ subtotal (± tolerance) | WARN |
| Header arithmetic | subtotal + taxAmount ≈ totalAmount | WARN |
| Quantity × unitPrice | quantity × unitPrice ≈ amount per line | WARN |
| Line GST sum | sum(line.gstAmount) ≈ taxAmount | WARN |
| Minimum line presence | INVOICE/RECEIPT must have ≥1 line item | ERROR |

**Tolerance calculation:** Based on currency minor units (e.g., ±0.01 for USD/SGD, ±1 for JPY)

#### 3.5.2 Header Validation

| Validation | Rule | Severity |
|-----------|------|----------|
| Document date | Not in future, within 2 years past | WARN |
| Due date | After or equal to document date | WARN |
| Total amount | Greater than zero for INVOICE/RECEIPT; negative for CREDIT_NOTE | ERROR |
| Currency | Valid ISO 4217 code | ERROR |
| Vendor name | Non-empty for INVOICE/RECEIPT | WARN |

#### 3.5.3 Credit Note Validation

| Validation | Rule | Severity |
|-----------|------|----------|
| Total amount sign | CREDIT_NOTE must have `totalAmount < 0` | ERROR |
| Line item sign consistency | Line item amounts should be negative; mixed sign produces warning | WARN |

### 3.6 Duplicate Detection

#### 3.6.1 Detection Stages

**Stage 1: Container hash-based (before processing)**
- SHA-256 hash comparison
- Exact match triggers user prompt
- User can choose to proceed anyway (records acknowledgement)

**Stage 2: Visual similarity (optional, after render)**
- Perceptual hash (pHash) comparison
- Threshold: similarity > 95% triggers check
- Useful for re-scanned documents

**Stage 3: Content-based (after extraction)**
- Multi-signal scoring (Appendix B)
- Compares extracted data across child documents

#### 3.6.2 Duplicate Status Flow

```
Upload ─► Hash Check ─┬─► [EXACT MATCH] ─► User Prompt ─┬─► Cancel upload
                      │                                  └─► Proceed (acknowledged)
                      └─► [NO MATCH] ─► Continue

Extraction Complete ─► Content Check ─┬─► [score >= 0.95] ─► SUSPECTED (require decision)
                                       ├─► [0.80 <= score < 0.95] ─► SUSPECTED (banner)
                                       └─► [score < 0.80] ─► NONE

User Decision ─┬─► CONFIRM_DUPLICATE ─► CONFIRMED (linked to original)
               ├─► REJECT_DUPLICATE ─► REJECTED (independent)
               └─► MARK_AS_NEW_VERSION ─► (archive original, this becomes canonical)
```

Rules:
- `SUSPECTED` duplicates require explicit decision before approval/export/posting/match confirmation.
- `CONFIRMED` duplicates are blocked from export/posting.
- `MARK_AS_NEW_VERSION` archives the prior canonical version and makes the new one canonical (Appendix E).

### 3.7 Concurrency Control

#### 3.7.1 Optimistic Locking

All write operations must include version check:

```typescript
async function approveRevision(documentId: string, revisionId: string, lockVersion: number) {
  const result = await prisma.document.updateMany({
    where: {
      id: documentId,
      lockVersion: lockVersion
    },
    data: {
      currentRevisionId: revisionId,
      lockVersion: { increment: 1 }
    }
  });

  if (result.count === 0) {
    throw new ConcurrentModificationError();
  }
}
```

#### 3.7.2 Pessimistic Locking (Review Workflow)

Locks are managed via explicit APIs (see §8.2.8), and must be auditable (`AuditLog` + `DocumentStateEvent`).

**Lock rules:**
- Default lock duration: 15 minutes
- Lock can be extended by active user
- Lock auto-expires and is cleared by background job
- Admin can force-release locks

### 3.8 Out of Scope (Phase 1A)

- Bank transaction matching (Phase 2)
- Client portal upload (Phase 3)
- Email ingestion (future)
- Handwritten document support (future)
- Non-contiguous page ranges for child documents (future)

---

## 4. Phase 1B: Multi-Currency & GST

**Duration:** 3–4 weeks

**Risk Factors:**
- Exchange rate provider reliability
- GST rule complexity across jurisdictions

### 4.1 Exchange Rate Management

```prisma
model ExchangeRate {
  id              String           @id @default(uuid())

  sourceCurrency  String           // ISO 4217
  targetCurrency  String           // ISO 4217
  rate            Decimal          @db.Decimal(18,8)
  rateDate        DateTime         @db.Date
  rateType        ExchangeRateType

  // Audit
  fetchedAt       DateTime         @default(now())
  sourceRef       String?          // URL or dataset identifier
  sourceHash      String?          // Checksum for audit

  @@unique([sourceCurrency, targetCurrency, rateDate, rateType])
  @@index([sourceCurrency, targetCurrency, rateDate])
}

enum ExchangeRateType {
  MAS_DAILY
  IRAS_MONTHLY_AVG
  ECB_DAILY
  MANUAL
}
```

### 4.2 Rate Selection Rules

| Scenario | Rate Source | Date Basis |
|----------|-------------|------------|
| Document approval | Company preference (default: MAS_DAILY) | documentDate |
| Bank matching | Company preference | Bank transaction valueDate |
| Manual override | MANUAL | User-specified |

**Fallback chain:**
1. Requested rate type for exact date
2. Requested rate type for previous business day
3. Alternative rate type (e.g., MAS → ECB)
4. Fail with error requiring manual rate entry

### 4.3 Home Currency Conversion

On revision approval:
1. If `revision.currency` == `company.homeCurrency`: `homeEquivalent` = `totalAmount`
2. Else:
   - Fetch rate for (`revision.currency` → `company.homeCurrency`) on `documentDate`
   - Calculate `homeEquivalent` = `totalAmount` × `rate`
   - Store `homeExchangeRate`, `homeExchangeRateSource`, `exchangeRateDate`

### 4.4 GST Validation

Using `Company.gstRegistered` and related fields:

| Company GST Status | Document GST Treatment | Validation |
|-------------------|----------------------|------------|
| Registered | STANDARD_RATED | Verify tax amount = subtotal × rate |
| Registered | ZERO_RATED | Verify tax amount = 0 |
| Registered | REVERSE_CHARGE | Verify supplier is overseas |
| Not registered | Any with tax | WARN: Company not GST registered |

**Validation output stored in `DocumentRevision.validationIssues`:**
```json
{
  "issues": [
    {
      "code": "GST_RATE_MISMATCH",
      "severity": "WARN",
      "message": "Tax amount 8.50 does not match 9% of subtotal 100.00 (expected 9.00)",
      "field": "taxAmount"
    }
  ]
}
```

### 4.5 FX Audit Requirements

When FX rates are applied during approval or matching:
- persist applied rate, rate source, rate date, and date basis
- persist fallback behavior (e.g., “previous business day”, “alternate provider”)
- persist `sourceHash` for auditable datasets where available
- for manual rates, persist user id and manual reason

---

## 5. Phase 2: Bank Reconciliation

**Duration:** 7–10 weeks

**Risk Factors:**
- Matching algorithm tuning for accuracy vs false positives
- Multi-currency conversion edge cases

### 5.1 Data Model

```prisma
model BankAccount {
  id              String    @id @default(uuid())
  companyId       String
  tenantId        String    // Denormalized; must match Company.tenantId (enforced)
  
  name            String
  accountNumber   String    // Encrypted
  currency        String    // ISO 4217 - matching basis
  
  // Integration
  bankProvider    String?   // e.g., "plaid", "yodlee"
  externalId      String?
  lastSyncAt      DateTime?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  company         Company   @relation(fields: [companyId], references: [id])
  transactions    BankTransaction[]

  @@index([tenantId, companyId])
  @@index([companyId])
}

model BankTransaction {
  id              String    @id @default(uuid())
  bankAccountId   String
  tenantId        String    // Denormalized
  
  // Transaction details
  transactionDate DateTime  @db.Date
  valueDate       DateTime? @db.Date
  description     String
  reference       String?
  
  // Amount in bank account currency
  amount          Decimal   @db.Decimal(18,4)
  currency        String    // Should match bankAccount.currency
  
  // Balance after transaction
  runningBalance  Decimal?  @db.Decimal(18,4)
  
  // Categorization
  transactionType BankTransactionType
  
  // Import tracking
  importBatchId   String?
  externalId      String?
  
  // Reconciliation status
  reconciliationStatus ReconciliationStatus @default(UNMATCHED)
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  bankAccount     BankAccount @relation(fields: [bankAccountId], references: [id])
  matchGroupItems MatchGroupItem[]

  @@index([tenantId, bankAccountId])
  @@index([bankAccountId, transactionDate])
  @@index([bankAccountId, reconciliationStatus])
  @@index([externalId])
}

enum BankTransactionType {
  CREDIT
  DEBIT
  TRANSFER
  FEE
  INTEREST
  OTHER
}

enum ReconciliationStatus {
  UNMATCHED
  SUGGESTED
  MATCHED
  EXCLUDED
}

model MatchGroup {
  id                    String    @id @default(uuid())
  companyId             String
  tenantId              String    // Denormalized
  
  matchType             MatchType
  matchMethod           MatchMethod
  matchAlgorithmVersion String
  
  // Confidence and reasoning
  confidence            Float
  matchReasons          Json      // Detailed scoring breakdown
  
  // Status
  status                MatchGroupStatus @default(SUGGESTED)
  
  // FX conversion used (if applicable)
  fxConversionJson      Json?     // Rate, date, source
  
  // Audit
  createdAt             DateTime  @default(now())
  confirmedById         String?
  confirmedAt           DateTime?
  rejectedById          String?
  rejectedAt            DateTime?
  rejectionReason       String?

  items                 MatchGroupItem[]

  @@index([tenantId, companyId])
  @@index([companyId, status])
}

model MatchGroupItem {
  id                  String    @id @default(uuid())
  matchGroupId        String

  bankTransactionId   String?
  documentId          String?
  documentRevisionId  String?   // Lock match to specific revision

  // Allocation for partial matches
  allocatedAmount     Decimal?  @db.Decimal(18,4)
  allocationCurrency  String?

  matchGroup          MatchGroup @relation(fields: [matchGroupId], references: [id], onDelete: Cascade)
  bankTransaction     BankTransaction? @relation(fields: [bankTransactionId], references: [id])
  document            Document? @relation(fields: [documentId], references: [id])
  documentRevision    DocumentRevision? @relation(fields: [documentRevisionId], references: [id])

  @@index([matchGroupId])
  @@index([bankTransactionId])
  @@index([documentId])
  @@index([documentRevisionId])
}

enum MatchType {
  ONE_TO_ONE
  ONE_TO_MANY
  MANY_TO_ONE
  MANY_TO_MANY
}

enum MatchMethod {
  AUTO
  MANUAL
  RULE_BASED
}

enum MatchGroupStatus {
  SUGGESTED
  CONFIRMED
  REJECTED
}

model ReconciliationPeriod {
  id              String    @id @default(uuid())
  companyId       String
  bankAccountId   String?   // Null = all accounts
  tenantId        String    // Denormalized
  
  periodStart     DateTime  @db.Date
  periodEnd       DateTime  @db.Date
  
  status          PeriodStatus @default(OPEN)
  
  lockedById      String?
  lockedAt        DateTime?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([companyId, bankAccountId, periodStart, periodEnd])
  @@index([tenantId, companyId])
  @@index([companyId, status])
}

enum PeriodStatus {
  OPEN
  LOCKED
  CLOSED
}
```

### 5.2 Matching Engine

#### 5.2.1 Currency Conversion

Matching compares amounts in **bank account currency**:

| Document Currency | Bank Currency | Conversion |
|------------------|---------------|------------|
| Same | Same | Direct comparison |
| Different | - | Convert document amount using FX policy |

**FX policy for matching:**
- Primary date: Bank transaction `valueDate`
- Fallback 1: Bank transaction `transactionDate`
- Fallback 2: Document `documentDate`

**Persist in `MatchGroup.fxConversionJson`:**
```json
{
  "documentCurrency": "USD",
  "bankCurrency": "SGD",
  "rate": 1.3456,
  "rateDate": "2025-12-10",
  "rateSource": "MAS_DAILY",
  "dateBasis": "valueDate"
}
```

#### 5.2.2 Matching Algorithm

**Input:** Unmatched bank transactions + unmatched APPROVED revisions

**Scoring factors:**
| Factor | Weight | Description |
|--------|--------|-------------|
| Amount proximity | 40% | Closeness of amounts (converted if needed) |
| Date proximity | 25% | Days between doc date and transaction date |
| Vendor match | 20% | Bank description vs vendor name similarity |
| Reference match | 15% | Document number in bank description |

**Output:**
- Suggested matches with confidence score
- `confidence >= 0.90`: High confidence
- `0.70 <= confidence < 0.90`: Medium confidence
- `confidence < 0.70`: Not suggested

**Store in `MatchGroup.matchReasons`:**
```json
{
  "algorithmVersion": "2.1.0",
  "scores": {
    "amount": 0.95,
    "date": 0.80,
    "vendor": 0.75,
    "reference": 1.0
  },
  "weightedScore": 0.88,
  "amountDifference": 0.50,
  "dateDifference": 3
}
```

#### 5.2.3 Match Balancing Requirement

A match group cannot be confirmed unless it balances in bank currency within tolerance:
- sum(allocated document amounts converted to bank currency) ≈ sum(bank transaction amounts)

Tolerance uses currency minor units (same approach as validation tolerances).

#### 5.2.4 Locked Period Handling

Locked periods apply to:
- approving a revision whose `documentDate` falls within a locked period
- confirming or unconfirming matches whose `valueDate` (or `transactionDate` fallback) falls within a locked period
- posting/export actions for revisions within a locked period

If locked:
- require `document:overrideLock` (approval) or an equivalent override permission for match changes (tenant admin)
- require a reason
- create an audit log entry with elevated visibility

---

## 6. Phase 3: Client Portal & Communication

**Duration:** 4–6 weeks

### 6.1 Data Model

```prisma
model ClientPortalUser {
  id              String    @id @default(uuid())
  companyId       String
  tenantId        String    // Denormalized
  
  email           String
  name            String
  
  // Authentication (separate from main User for security isolation)
  passwordHash    String
  mfaEnabled      Boolean   @default(false)
  mfaSecret       String?   // Encrypted
  
  isActive        Boolean   @default(true)
  lastLoginAt     DateTime?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([companyId, email])
  @@index([tenantId, companyId])
}

model ClientRequest {
  id              String    @id @default(uuid())
  companyId       String
  tenantId        String    // Denormalized
  
  title           String
  description     String?
  dueDate         DateTime? @db.Date
  
  status          ClientRequestStatus @default(PENDING)
  priority        RequestPriority @default(NORMAL)
  
  createdById     String
  createdAt       DateTime  @default(now())
  
  resolvedById    String?
  resolvedAt      DateTime?
  
  documentLinks   DocumentLink[]
  communications  Communication[]

  @@index([tenantId, companyId])
  @@index([companyId, status])
}

enum ClientRequestStatus {
  PENDING
  IN_PROGRESS
  WAITING_CLIENT
  RESOLVED
  CANCELLED
}

enum RequestPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

model Communication {
  id              String    @id @default(uuid())
  clientRequestId String?
  companyId       String
  tenantId        String    // Denormalized
  
  direction       CommunicationDirection
  channel         CommunicationChannel
  
  subject         String?
  body            String
  
  fromUserId      String?
  fromClientUserId String?
  toEmails        String[]
  
  externalMessageId String?
  threadId        String?
  
  sentAt          DateTime?
  readAt          DateTime?
  
  createdAt       DateTime  @default(now())

  clientRequest   ClientRequest? @relation(fields: [clientRequestId], references: [id])
  documentLinks   DocumentLink[]

  @@index([tenantId, companyId])
  @@index([clientRequestId])
  @@index([threadId])
}

enum CommunicationDirection {
  INBOUND
  OUTBOUND
}

enum CommunicationChannel {
  EMAIL
  PORTAL_MESSAGE
  SMS
}
```

### 6.2 Portal Capabilities

| Feature | Description |
|---------|-------------|
| Document upload | Client uploads documents directly |
| Request view | Client sees requests and status |
| Document review | Client views extracted data for verification |
| Communication | Two-way messaging with accountant |
| Notification | Email alerts for new requests |

### 6.3 Portal Security Requirements

- Password hashing must use **Argon2id** with parameters defined by security baseline.
- Login endpoints must implement rate limiting and account lockout policy.
- Password reset tokens must be single-use, expire in 30 minutes, and be stored hashed.
- Client portal auth must be isolated from staff auth (separate issuer/audience and signing keys).
- MFA secrets must be encrypted at application level.
- Portal authentication events must be audit logged.

---

## 7. Phase 4: Accounting Software Integration

**Duration:** 5–8 weeks

**Risk Factors:**
- API compatibility across accounting software versions
- Rate limiting by providers
- Field mapping complexity

### 7.1 Data Model

```prisma
model AccountingIntegration {
  id              String    @id @default(uuid())
  companyId       String
  tenantId        String    // Denormalized
  
  provider        AccountingProvider
  
  // OAuth credentials (encrypted)
  accessToken     String
  refreshToken    String?
  tokenExpiresAt  DateTime?
  
  // Connection status
  isActive        Boolean   @default(true)
  lastSyncAt      DateTime?
  lastError       String?
  
  // Provider-specific settings
  settings        Json?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([companyId, provider])
  @@index([tenantId, companyId])
}

enum AccountingProvider {
  XERO
  QUICKBOOKS
  MYOB
  SAGE
}

model ExternalPosting {
  id                  String    @id @default(uuid())
  documentRevisionId  String
  integrationId       String
  tenantId            String    // Denormalized
  
  // Idempotency
  idempotencyKey      String    @unique
  
  // External reference
  externalId          String?
  externalType        String?   // e.g., "Invoice", "Bill"
  externalUrl         String?
  
  // Status
  status              PostingStatus @default(PENDING)
  
  // Attempt tracking
  attemptCount        Int       @default(0)
  lastAttemptAt       DateTime?
  lastError           Json?
  
  // Timestamps
  createdAt           DateTime  @default(now())
  postedAt            DateTime?
  
  revision            DocumentRevision @relation(fields: [documentRevisionId], references: [id])
  integration         AccountingIntegration @relation(fields: [integrationId], references: [id])

  @@index([tenantId, status])
  @@index([documentRevisionId])
  @@index([integrationId, status])
}

enum PostingStatus {
  PENDING
  PROCESSING
  POSTED
  FAILED
  SKIPPED
}

model FieldMapping {
  id              String    @id @default(uuid())
  integrationId   String
  
  sourceField     String    // Oakcloud field path
  targetField     String    // Provider field path
  transformRule   Json?     // Transformation logic
  
  isActive        Boolean   @default(true)
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  integration     AccountingIntegration @relation(fields: [integrationId], references: [id])

  @@unique([integrationId, sourceField, targetField])
  @@index([integrationId])
}
```

### 7.2 Integration Flow

1. **Connect** - OAuth flow to establish integration  
2. **Configure** - Set up field mappings and preferences  
3. **Post** - Push APPROVED revisions to accounting software  
4. **Sync** - Optionally pull existing data for duplicate detection  

**Export/posting rules:**
- Only APPROVED revisions can be posted
- Duplicate documents (CONFIRMED) are skipped
- Failed postings retry with exponential backoff
- Idempotency key prevents duplicate posts
- Posting must update `DocumentRevision.postingStatus` and set `postingLock=true` when posted

---

## 8. API Specifications

### 8.1 Standard Conventions

#### 8.1.1 Base URL
```
https://api.oakcloud.io/v1
```

#### 8.1.2 Authentication
```
Authorization: Bearer <jwt_token>
```

#### 8.1.3 Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | Bearer token |
| `X-Request-ID` | No | Client correlation ID (generated if absent) |
| `Idempotency-Key` | Conditional | Required for mutating operations |
| `If-Match` | Conditional | Lock version for optimistic locking |

#### 8.1.4 Response Envelope

**Success:**
```json
{
  "success": true,
  "data": { },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2025-12-13T10:00:00Z"
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": [
      {
        "field": "documentDate",
        "code": "FUTURE_DATE",
        "message": "Document date cannot be in the future"
      }
    ]
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2025-12-13T10:00:00Z"
  }
}
```

#### 8.1.5 Pagination

Cursor-based pagination for list endpoints:

**Request:**
```
GET /documents?limit=50&cursor=eyJpZCI6ImFiYzEyMyJ9
```

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "hasMore": true,
      "nextCursor": "eyJpZCI6Inh5ejc4OSJ9",
      "totalCount": 1250
    }
  }
}
```

### 8.2 Document APIs

#### 8.2.1 Upload Document

```
POST /documents
Content-Type: multipart/form-data
Idempotency-Key: <uuid>
```

**Request body:**
- `file`: Binary file data
- `companyId`: Company UUID
- `priority`: Processing priority (optional)
- `metadata`: JSON metadata (optional)

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "document": {
      "id": "doc_abc123",
      "fileName": "invoice.pdf",
      "pipelineStatus": "QUEUED",
      "isContainer": true
    },
    "jobId": "job_xyz789"
  }
}
```

#### 8.2.2 Get Document

```
GET /documents/{documentId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "document": {
      "id": "doc_abc123",
      "companyId": "comp_123",
      "isContainer": false,
      "parentDocumentId": "doc_parent",
      "pageFrom": 1,
      "pageTo": 2,
      "pipelineStatus": "EXTRACTION_DONE",
      "duplicateStatus": "NONE",
      "currentRevisionId": "rev_456",
      "lockVersion": 3,
      "createdAt": "2025-12-13T10:00:00Z"
    },
    "currentRevision": {
      "id": "rev_456",
      "revisionNumber": 1,
      "status": "DRAFT",
      "documentCategory": "INVOICE",
      "vendorName": "Acme Corp",
      "totalAmount": "1000.00",
      "currency": "SGD"
    }
  }
}
```

#### 8.2.3 List Documents

```
GET /documents?companyId={companyId}&status={status}&category={category}&dateFrom={date}&dateTo={date}&vendorId={vendorId}&limit={limit}&cursor={cursor}
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `companyId` | UUID | Required. Filter by company |
| `status` | String | Pipeline status filter |
| `category` | String | Document category filter |
| `dateFrom` | Date | Document date range start |
| `dateTo` | Date | Document date range end |
| `vendorId` | UUID | Filter by vendor |
| `duplicateStatus` | String | Filter by duplicate status |
| `search` | String | Full-text search (vendor, doc number) |
| `sort` | String | Sort field (default: `-createdAt`) |
| `limit` | Integer | Page size (max 100) |
| `cursor` | String | Pagination cursor |

#### 8.2.4 Trigger Extraction

```
POST /documents/{documentId}/extract
Idempotency-Key: <uuid>
```

**Request body (optional):**
```json
{
  "provider": "openai",
  "model": "gpt-4-vision",
  "priority": "HIGH"
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "jobId": "job_extract_123",
    "estimatedCompletionSeconds": 30
  }
}
```

#### 8.2.5 Split Document (Auto)

```
POST /documents/{documentId}/split
Idempotency-Key: <uuid>
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "jobId": "job_split_123"
  }
}
```

#### 8.2.6 Split Document (Manual)

```
POST /documents/{documentId}/split/manual
Idempotency-Key: <uuid>
```

Manual split creates a new split plan, supersedes the previous plan, archives old children created under the superseded plan, then creates and queues new child documents.

**Request body:**
```json
{
  "children": [
    { "pageFrom": 1, "pageTo": 2 },
    { "pageFrom": 3, "pageTo": 3 },
    { "pageFrom": 4, "pageTo": 6 }
  ]
}
```

#### 8.2.7 Get Job Status

```
GET /jobs/{jobId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "job": {
      "id": "job_123",
      "type": "EXTRACTION",
      "status": "COMPLETED",
      "documentId": "doc_abc",
      "progress": 100,
      "result": {
        "extractionId": "ext_789",
        "revisionId": "rev_456"
      },
      "createdAt": "2025-12-13T10:00:00Z",
      "completedAt": "2025-12-13T10:00:25Z"
    }
  }
}
```

#### 8.2.8 Lock / Unlock Document

Locks are explicit APIs. Lock/unlock actions must create `AuditLog` and `DocumentStateEvent` entries.

**Acquire lock**
```
POST /documents/{documentId}/lock
Idempotency-Key: <uuid>
If-Match: {lockVersion}
```

**Release lock**
```
POST /documents/{documentId}/unlock
Idempotency-Key: <uuid>
If-Match: {lockVersion}
```

#### 8.2.9 Download Document File

```
GET /documents/{documentId}/file?kind=ORIGINAL|CHILD_PDF|REDACTED_PDF
```

Returns a signed URL for download. For child documents, `kind=CHILD_PDF` returns a derived PDF generated from `pageFrom..pageTo`.

**Response:**
```json
{
  "success": true,
  "data": {
    "kind": "CHILD_PDF",
    "url": "https://example.com/signed-url",
    "expiresAt": "2025-12-13T10:10:00Z"
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2025-12-13T10:00:00Z"
  }
}
```

#### 8.2.10 Get Rendered Page Image

```
GET /documents/{containerId}/pages/{pageNumber}/image
```

Returns a signed URL for the stored rendered image used for evidence overlay.

### 8.3 Revision APIs

#### 8.3.1 Create Revision (Edit)

```
POST /documents/{documentId}/revisions
Idempotency-Key: <uuid>
If-Match: {lockVersion}
```

Edits use explicit patch semantics to avoid ambiguous array replacement.

**Request body:**
```json
{
  "basedOnRevisionId": "rev_456",
  "reason": "user_edit",
  "patch": {
    "set": {
      "vendorName": "Acme Corporation Pte Ltd",
      "documentNumber": "INV-2025-001"
    },
    "itemsToUpsert": [
      {
        "lineNo": 1,
        "description": "Consulting Services",
        "quantity": "10",
        "unitPrice": "100.00",
        "amount": "1000.00"
      }
    ],
    "itemsToDelete": [2, 3]
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "revision": {
      "id": "rev_457",
      "revisionNumber": 2,
      "status": "DRAFT",
      "revisionType": "USER_EDIT",
      "basedOnRevisionId": "rev_456"
    },
    "document": {
      "lockVersion": 4
    }
  }
}
```

#### 8.3.2 Approve Revision

```
POST /documents/{documentId}/revisions/{revisionId}/approve
Idempotency-Key: <uuid>
If-Match: {lockVersion}
```

Approval enforces:
- duplicate-decision gating (Appendix E)
- posting lock and reconciliation lock rules where applicable

**Request body (optional for locked period override):**
```json
{
  "overrideReason": "Month-end adjustment required"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "revision": {
      "id": "rev_457",
      "status": "APPROVED",
      "approvedAt": "2025-12-13T10:05:00Z",
      "homeEquivalent": "1000.00"
    },
    "document": {
      "currentRevisionId": "rev_457",
      "lockVersion": 5
    }
  }
}
```

#### 8.3.3 Get Revision History

```
GET /documents/{documentId}/revisions
```

**Response:**
```json
{
  "success": true,
  "data": {
    "revisions": [
      {
        "id": "rev_457",
        "revisionNumber": 2,
        "status": "APPROVED",
        "revisionType": "USER_EDIT",
        "createdAt": "2025-12-13T10:04:00Z",
        "approvedAt": "2025-12-13T10:05:00Z"
      },
      {
        "id": "rev_456",
        "revisionNumber": 1,
        "status": "SUPERSEDED",
        "revisionType": "EXTRACTION",
        "createdAt": "2025-12-13T10:00:30Z",
        "supersededAt": "2025-12-13T10:05:00Z"
      }
    ]
  }
}
```

### 8.4 Duplicate APIs

#### 8.4.1 Record Duplicate Decision

```
POST /documents/{documentId}/duplicate-decision
Idempotency-Key: <uuid>
```

**Request body:**
```json
{
  "suspectedOfId": "doc_original",
  "decision": "REJECT_DUPLICATE",
  "reason": "Different invoice numbers"
}
```

#### 8.4.2 Acknowledge Exact Duplicate on Upload

```
POST /documents/{documentId}/duplicates/acknowledge
Idempotency-Key: <uuid>
```

Records that a user acknowledged an exact `fileHash` duplicate and proceeded.

### 8.5 Batch APIs

#### 8.5.1 Batch Operation

```
POST /documents/batch
Idempotency-Key: <uuid>
```

**Request body:**
```json
{
  "operation": "APPROVE",
  "documentIds": ["doc_1", "doc_2", "doc_3"],
  "options": {
    "skipValidationWarnings": false,
    "continueOnError": true
  }
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "batchId": "batch_123",
    "status": "PROCESSING",
    "total": 3,
    "processed": 0
  }
}
```

**Supported operations:** `APPROVE`, `ARCHIVE`, `RE_EXTRACT`, `EXPORT`, `POST`

#### 8.5.2 Get Batch Status

```
GET /documents/batch/{batchId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "batch": {
      "id": "batch_123",
      "operation": "APPROVE",
      "status": "COMPLETED",
      "total": 3,
      "processed": 3,
      "succeeded": 2,
      "failed": 1,
      "results": [
        { "documentId": "doc_1", "status": "SUCCESS" },
        { "documentId": "doc_2", "status": "SUCCESS" },
        { "documentId": "doc_3", "status": "FAILED", "error": "VALIDATION_ERROR" }
      ]
    }
  }
}
```

### 8.6 Search API

```
POST /documents/search
```

**Request body:**
```json
{
  "companyId": "comp_123",
  "query": "acme invoice",
  "filters": {
    "category": ["INVOICE", "RECEIPT"],
    "dateRange": {
      "from": "2025-01-01",
      "to": "2025-12-31"
    },
    "amountRange": {
      "min": 100,
      "max": 10000
    },
    "status": ["EXTRACTION_DONE"]
  },
  "sort": {
    "field": "documentDate",
    "order": "desc"
  },
  "pagination": {
    "limit": 50,
    "cursor": null
  }
}
```

### 8.7 Webhook APIs

#### 8.7.1 Create Webhook Subscription

```
POST /webhooks
```

**Request body:**
```json
{
  "url": "https://example.com/webhook",
  "events": ["document.revision.approved.v1", "match.created.v1"],
  "secret": "whsec_..."
}
```

#### 8.7.2 Webhook Payload

```json
{
  "id": "evt_123",
  "type": "document.revision.approved.v1",
  "tenantId": "tenant_123",
  "timestamp": "2025-12-13T10:05:00Z",
  "data": {
    "documentId": "doc_abc",
    "revisionId": "rev_457",
    "companyId": "comp_123"
  }
}
```

**Signature header:**
```
X-Oakcloud-Signature: sha256=<hmac_signature>
```

**Supported events:**
- `document.uploaded.v1`
- `document.extraction.completed.v1`
- `document.revision.approved.v1`
- `document.duplicate.suspected.v1`
- `match.created.v1`
- `match.confirmed.v1`
- `reconciliation.period.locked.v1`
- `export.completed.v1`
- `export.failed.v1`
- `posting.completed.v1`
- `posting.failed.v1`

### 8.8 Idempotency

| Endpoint | Idempotency Window | Behavior on Repeat |
|----------|-------------------|-------------------|
| POST /documents | 24 hours | Return original document |
| POST /documents/{id}/extract | 1 hour | Return existing job |
| POST /documents/{id}/split/manual | 24 hours | Return existing job/split plan |
| POST /documents/{id}/revisions | 24 hours | Return existing revision |
| POST /documents/{id}/revisions/{id}/approve | 24 hours | Return success if already approved |
| POST /documents/{id}/lock | 1 hour | Return current lock state |
| POST /documents/{id}/unlock | 1 hour | Return current lock state |
| POST /documents/batch | 24 hours | Return existing batch |

```prisma
model IdempotencyRecord {
  key         String    @id
  tenantId    String
  endpoint    String
  method      String
  requestHash String    // Hash of request body
  response    Json
  statusCode  Int
  expiresAt   DateTime
  createdAt   DateTime  @default(now())

  @@index([expiresAt])
  @@index([tenantId])
}
```

---

## 9. UI Specification

This section defines the user interface components, layouts, and interactions for the Document Processing module.

### 9.1 Page Structure

#### 9.1.1 Document Processing List Page

**Route:** `/processing`

**Purpose:** Display all processing documents with filtering, pagination, and status overview.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Header                                                          │
│ ├── Title: "Document Processing"                                │
│ ├── Subtitle: Description of AI-powered workflow                │
│ └── Actions: [Refresh] [Upload Document]                        │
├─────────────────────────────────────────────────────────────────┤
│ Stats Cards (5 columns)                                         │
│ ├── Total Documents                                             │
│ ├── Queued                                                      │
│ ├── Processing                                                  │
│ ├── Extracted                                                   │
│ └── Failed                                                      │
├─────────────────────────────────────────────────────────────────┤
│ Filter Bar                                                      │
│ ├── Pipeline Status (dropdown)                                  │
│ ├── Duplicate Status (dropdown)                                 │
│ └── Document Type (dropdown: All/Containers/Children)           │
├─────────────────────────────────────────────────────────────────┤
│ Document Table                                                  │
│ ├── Columns: Document | Pipeline | Duplicate | Vendor | Amount │
│ │            | Date | Actions                                   │
│ └── Pagination: [Previous] Page X of Y [Next]                   │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**

| Component | Description | Implementation |
|-----------|-------------|----------------|
| Stats Cards | Display aggregate counts by status | Grid of 5 cards with icons and counts |
| Filter Bar | Filter documents by pipeline/duplicate/type | Dropdown selects with URL sync |
| Document Table | Paginated list of documents | Table with status badges, click-to-view |
| Status Badge | Visual indicator for status | Colored badge with icon (see §9.3) |

#### 9.1.2 Document Detail Page

**Route:** `/processing/[id]`

**Purpose:** Display detailed document information, current revision, and allow workflow actions.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Header                                                          │
│ ├── Back Button (→ /processing)                                 │
│ ├── Title: "Container Document" or "Processing Document"        │
│ ├── Pipeline Status Badge                                       │
│ ├── Document ID                                                 │
│ └── Refresh Button                                              │
├─────────────────────────────────────────────────────────────────┤
│ Actions Bar                                                     │
│ ├── [Trigger Extraction] (if UPLOADED or FAILED_RETRYABLE)      │
│ ├── [Acquire Lock] / [Release Lock]                             │
│ ├── [Resolve Duplicate] (if SUSPECTED)                          │
│ └── [Approve Revision] (if DRAFT and duplicate resolved)        │
├─────────────────────────────────────────────────────────────────┤
│ Content Area (2:1 grid)                                         │
│ ┌─────────────────────────────┬─────────────────────────────────┐
│ │ Document Details Card       │ Revision History Card           │
│ │ ├── Type (Container/Child)  │ ├── Revision #N (status)        │
│ │ ├── Pages                   │ │   ├── Type                    │
│ │ ├── Pipeline Status         │ │   ├── Vendor                  │
│ │ ├── Duplicate Status        │ │   ├── Amount                  │
│ │ ├── Lock Version            │ │   ├── Created                 │
│ │ └── Created Date            │ │   └── Approved (if any)       │
│ ├─────────────────────────────│ └── ... more revisions          │
│ │ Current Revision Card       │                                 │
│ │ ├── Category                │                                 │
│ │ ├── Vendor Name             │                                 │
│ │ ├── Document Number         │                                 │
│ │ ├── Document Date           │                                 │
│ │ ├── Total Amount            │                                 │
│ │ ├── Home Equivalent         │                                 │
│ │ ├── Validation Status       │                                 │
│ │ └── Line Item Count         │                                 │
│ └─────────────────────────────┴─────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 UI Components

#### 9.2.1 Status Badge Component

Displays status with appropriate color and icon.

**Props:**
```typescript
interface StatusBadgeProps {
  status: PipelineStatus | DuplicateStatus | RevisionStatus;
  config: {
    label: string;
    color: string;
    icon: React.ComponentType<{ className?: string }>;
  };
}
```

**Status Configurations:**

| Pipeline Status | Label | Color | Icon |
|-----------------|-------|-------|------|
| UPLOADED | Uploaded | text-secondary / bg-tertiary | Upload |
| QUEUED | Queued | text-info / bg-info/10 | Clock |
| PROCESSING | Processing | text-info / bg-info/10 | RefreshCw (animated) |
| SPLIT_PENDING | Split Pending | text-warning / bg-warning/10 | FileStack |
| SPLIT_DONE | Split Done | text-success / bg-success/10 | FileStack |
| EXTRACTION_DONE | Extracted | text-success / bg-success/10 | CheckCircle |
| FAILED_RETRYABLE | Failed (Retry) | text-warning / bg-warning/10 | AlertTriangle |
| FAILED_PERMANENT | Failed | text-error / bg-error/10 | XCircle |
| DEAD_LETTER | Dead Letter | text-error / bg-error/10 | XCircle |

| Duplicate Status | Label | Color | Icon |
|------------------|-------|-------|------|
| NONE | Not Checked | text-muted / bg-tertiary | Clock |
| SUSPECTED | Suspected Duplicate | text-warning / bg-warning/10 | AlertTriangle |
| CONFIRMED | Confirmed Duplicate | text-error / bg-error/10 | Copy |
| REJECTED | Not Duplicate | text-success / bg-success/10 | CheckCircle |

| Revision Status | Label | Color |
|-----------------|-------|-------|
| DRAFT | Draft | text-warning / bg-warning/10 |
| APPROVED | Approved | text-success / bg-success/10 |
| SUPERSEDED | Superseded | text-muted / bg-tertiary |

#### 9.2.2 Action Buttons

| Action | Condition | Button Style | Icon |
|--------|-----------|--------------|------|
| Upload Document | Always (with permission) | Primary | Upload |
| Refresh | Always | Secondary/Ghost | RefreshCw |
| Trigger Extraction | UPLOADED or FAILED_RETRYABLE | Primary | Play |
| Acquire Lock | Always (with permission) | Secondary | Lock |
| Release Lock | Always (with permission) | Secondary | Unlock |
| Resolve Duplicate | SUSPECTED status | Warning border | Copy |
| Approve Revision | DRAFT + duplicate resolved | Primary | Check |
| View Details | Always | Ghost | Eye |

#### 9.2.3 Dialogs

**Approve Revision Dialog:**
- Type: ConfirmDialog
- Variant: info
- Title: "Approve Revision"
- Description: Confirmation message with revision number
- Actions: Cancel / Approve

**Duplicate Decision Dialog:**
- Type: Custom Modal
- Title: "Resolve Duplicate Status"
- Options (radio buttons):
  - Not a duplicate - unique document
  - Confirmed duplicate - do not process
  - Version update - replaces previous
- Actions: Cancel / Confirm Decision

### 9.3 Responsive Design

| Breakpoint | Stats Cards | Table | Filters |
|------------|-------------|-------|---------|
| Mobile (< 640px) | 2 columns | Horizontal scroll | Stack vertically |
| Tablet (640-1024px) | 3-4 columns | Full width | Wrap |
| Desktop (> 1024px) | 5 columns | Full width | Single row |

### 9.4 Future UI Components (Phase 1A Pending)

| Component | Description | Priority |
|-----------|-------------|----------|
| PDF Viewer | Display document pages with zoom/pan | High |
| Evidence Highlighter | Highlight extracted fields on PDF | High |
| Line Item Editor | Edit individual line items with evidence | Medium |
| Bulk Actions Toolbar | Select multiple documents for batch operations | Medium |
| Split Editor | Manually adjust document page splits | Low |
| Audit Timeline | Visual history of document changes | Low |

---

## 10. User Logic Flow

This section documents the user journey through the Document Processing module, including decision points, actions, and system responses.

### 10.1 Document Upload Flow

```
┌──────────────┐
│  Start       │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ User navigates   │
│ to Upload page   │
│ (/companies/     │
│ upload)          │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ User selects     │
│ company and      │
│ drops file(s)    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐     ┌─────────────────┐
│ System computes  │────►│ Exact hash match│
│ file hash (SHA-  │     │ found?          │
│ 256)             │     └────────┬────────┘
└──────────────────┘              │
                         ┌────────┴────────┐
                         │ Yes             │ No
                         ▼                 ▼
              ┌──────────────────┐  ┌──────────────────┐
              │ Show duplicate   │  │ Create Document  │
              │ warning dialog   │  │ record           │
              └────────┬─────────┘  │ (UPLOADED)       │
                       │            └──────┬───────────┘
              ┌────────┴────────┐          │
              │                 │          │
         ┌────▼────┐     ┌──────▼─────┐    │
         │ Cancel  │     │ Proceed    │    │
         │ upload  │     │ anyway     │    │
         └─────────┘     └─────┬──────┘    │
                               │           │
                               ▼           │
                    ┌──────────────────┐   │
                    │ Record duplicate │   │
                    │ acknowledgement  │   │
                    └──────┬───────────┘   │
                           │               │
                           └───────┬───────┘
                                   │
                                   ▼
                        ┌──────────────────┐
                        │ Queue for        │
                        │ processing       │
                        │ (QUEUED)         │
                        └──────┬───────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │ Redirect to      │
                        │ /processing      │
                        └──────────────────┘
```

### 10.2 Document Processing Pipeline (System Flow)

```
┌──────────────┐
│ QUEUED       │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ PROCESSING       │
│ ├── Render pages │
│ ├── OCR/text     │
│ │   acquisition  │
│ └── Split detect │
└──────┬───────────┘
       │
       ├──────────────────┐
       │ Container        │ Child
       ▼                  ▼
┌──────────────────┐  ┌──────────────────┐
│ SPLIT_PENDING    │  │ Continue to      │
│ (creating child  │  │ extraction       │
│ documents)       │  └──────┬───────────┘
└──────┬───────────┘         │
       │                     │
       ▼                     │
┌──────────────────┐         │
│ SPLIT_DONE       │         │
│ (children queued)│         │
└──────────────────┘         │
                             ▼
                  ┌──────────────────┐
                  │ Field extraction │
                  │ ├── Category     │
                  │ ├── Header       │
                  │ ├── Line items   │
                  │ └── Evidence     │
                  └──────┬───────────┘
                         │
                         ▼
                  ┌──────────────────┐
                  │ Validation       │
                  │ ├── Arithmetic   │
                  │ ├── Date ranges  │
                  │ └── GST rules    │
                  └──────┬───────────┘
                         │
                         ▼
                  ┌──────────────────┐
                  │ Create DRAFT     │
                  │ revision         │
                  └──────┬───────────┘
                         │
                         ▼
                  ┌──────────────────┐
                  │ Duplicate check  │
                  │ (content-based)  │
                  └──────┬───────────┘
                         │
                  ┌──────┴──────┐
                  │ Score ≥0.80 │
                  └──────┬──────┘
             ┌───────────┴───────────┐
             │ Yes                   │ No
             ▼                       ▼
  ┌──────────────────┐    ┌──────────────────┐
  │ EXTRACTION_DONE  │    │ EXTRACTION_DONE  │
  │ duplicateStatus: │    │ duplicateStatus: │
  │ SUSPECTED        │    │ NONE             │
  └──────────────────┘    └──────────────────┘
```

### 10.3 Document Review Flow

```
┌───────────────────────┐
│ User views Processing │
│ List (/processing)    │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Filter/search for     │
│ documents to review   │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Click "View" on       │
│ document row          │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Document Detail Page  │
│ (/processing/[id])    │
└───────────┬───────────┘
            │
            ▼
  ┌─────────┴─────────┐
  │ Need to re-extract?│
  └─────────┬─────────┘
       ┌────┴────┐
       │ Yes     │ No
       ▼         ▼
┌────────────┐  ┌────────────────────┐
│ Click      │  │ Review current     │
│ "Trigger   │  │ revision details   │
│ Extraction"│  └────────┬───────────┘
└─────┬──────┘           │
      │                  ▼
      │         ┌────────────────────┐
      │         │ Is duplicate       │
      │         │ status SUSPECTED?  │
      │         └────────┬───────────┘
      │            ┌─────┴─────┐
      │            │ Yes       │ No
      │            ▼           │
      │   ┌────────────────┐   │
      │   │ Click "Resolve │   │
      │   │ Duplicate"     │   │
      │   └───────┬────────┘   │
      │           │            │
      │           ▼            │
      │   ┌────────────────┐   │
      │   │ Select decision:│  │
      │   │ • Not duplicate │  │
      │   │ • Is duplicate  │  │
      │   │ • Is version    │  │
      │   └───────┬────────┘   │
      │           │            │
      │           ▼            │
      │   ┌────────────────┐   │
      │   │ Click "Confirm │   │
      │   │ Decision"      │   │
      │   └───────┬────────┘   │
      │           │            │
      │           ▼            │
      │   ┌────────────────┐   │
      │   │ Status updated:│   │
      │   │ REJECTED or    │   │
      │   │ CONFIRMED      │───┘
      │   └────────────────┘
      │                  │
      └──────────────────┘
                         │
                         ▼
              ┌────────────────────┐
              │ Is revision DRAFT  │
              │ and duplicate      │
              │ resolved?          │
              └────────┬───────────┘
                  ┌────┴────┐
                  │ Yes     │ No
                  ▼         ▼
       ┌────────────────┐  ┌────────────────┐
       │ Click "Approve │  │ Cannot approve │
       │ Revision"      │  │ yet            │
       └───────┬────────┘  └────────────────┘
               │
               ▼
       ┌────────────────┐
       │ Confirm in     │
       │ dialog         │
       └───────┬────────┘
               │
               ▼
       ┌────────────────┐
       │ Revision status│
       │ → APPROVED     │
       │ Prior APPROVED │
       │ → SUPERSEDED   │
       └────────────────┘
```

### 10.4 Concurrency Control Flow

```
┌───────────────────────┐
│ User wants to edit    │
│ document              │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Click "Acquire Lock"  │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ System checks:        │
│ - Already locked?     │
│ - Lock expired?       │
└───────────┬───────────┘
            │
     ┌──────┴──────┐
     │ Available   │ Locked by other
     ▼             ▼
┌──────────┐  ┌──────────────────┐
│ Lock     │  │ Show error:      │
│ acquired │  │ "Document locked │
│ (15 min) │  │ by [user]"       │
└────┬─────┘  └──────────────────┘
     │
     ▼
┌───────────────────────┐
│ User performs edits   │
│ (within lock window)  │
└───────────┬───────────┘
     │
     ├──────────────────┐
     │ Done editing     │ Need more time
     ▼                  ▼
┌──────────────┐  ┌──────────────────┐
│ Click        │  │ Lock auto-extends│
│ "Release     │  │ on activity      │
│ Lock"        │  └──────────────────┘
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Lock released    │
│ (available for   │
│ other users)     │
└──────────────────┘

Admin Override:
┌──────────────────┐
│ Admin clicks     │
│ "Force Release"  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Lock forcibly    │
│ released + audit │
│ entry created    │
└──────────────────┘
```

### 10.5 Error Recovery Flow

```
┌───────────────────────┐
│ Document in           │
│ FAILED_RETRYABLE      │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ User views document   │
│ detail page           │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Review error details  │
│ in lastError field    │
└───────────┬───────────┘
            │
     ┌──────┴──────┐
     │ Retryable   │ Permanent
     ▼             ▼
┌──────────────┐  ┌──────────────────┐
│ Click        │  │ Document moves   │
│ "Trigger     │  │ to DEAD_LETTER   │
│ Extraction"  │  │ after max        │
└──────┬───────┘  │ retries          │
       │          └──────────────────┘
       ▼
┌──────────────────┐
│ Document queued  │
│ for retry        │
│ (QUEUED)         │
└──────────────────┘
```

### 10.6 Bulk Operations Flow

```
┌───────────────────────┐
│ User on Processing    │
│ List page             │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Select multiple       │
│ documents (checkbox)  │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Bulk Actions toolbar  │
│ appears               │
│ ├── Approve Selected  │
│ ├── Re-extract        │
│ └── Archive           │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ Click bulk action     │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐
│ System validates:     │
│ - All docs eligible?  │
│ - Permission check    │
└───────────┬───────────┘
            │
     ┌──────┴──────┐
     │ Valid       │ Invalid
     ▼             ▼
┌──────────────┐  ┌──────────────────┐
│ Show confirm │  │ Show error with  │
│ dialog with  │  │ ineligible items │
│ count        │  │ highlighted      │
└──────┬───────┘  └──────────────────┘
       │
       ▼
┌──────────────────┐
│ Execute batch    │
│ operation        │
│ (progress shown) │
└──────────────────┘
```

### 10.7 Decision Matrix

| Current State | User Action | Preconditions | Result |
|---------------|-------------|---------------|--------|
| UPLOADED | Trigger Extraction | document:write permission | → QUEUED |
| QUEUED | - | System processing | → PROCESSING |
| PROCESSING | - | System processing | → SPLIT_PENDING (container) or EXTRACTION_DONE (child) |
| FAILED_RETRYABLE | Trigger Extraction | document:write, retries < max | → QUEUED |
| EXTRACTION_DONE | - | DRAFT revision exists | Ready for review |
| DRAFT revision | Approve | duplicate resolved, valid | → APPROVED |
| SUSPECTED duplicate | Resolve Duplicate | document:write | → REJECTED/CONFIRMED |
| Any | Acquire Lock | document:lock, not locked | Lock acquired |
| Locked (by self) | Release Lock | document:lock | Lock released |
| Locked (by other) | Force Release | document:overrideLock (admin) | Lock released + audit |

### 10.8 Validation Gates

Before certain actions can proceed, the system enforces these validation gates:

| Action | Required Conditions |
|--------|---------------------|
| Approve Revision | Revision status = DRAFT; duplicateStatus ∈ {NONE, REJECTED}; validationStatus ≠ INVALID |
| Export to Accounting | Revision status = APPROVED; postingStatus = NOT_POSTED |
| Confirm Match (Phase 2) | Revision status = APPROVED; duplicateStatus ∈ {NONE, REJECTED} |
| Create New Version | duplicateStatus = SUSPECTED with decision = MARK_AS_NEW_VERSION |

---

## 11. Error Handling & Recovery

### 11.1 Error Classification

| Category | Retry | Examples |
|----------|-------|----------|
| Client Error (4xx) | No | Validation, authentication, not found |
| Server Error (5xx) | Yes | Internal errors, timeout |
| Provider Error | Conditional | AI provider errors, rate limits |
| Infrastructure Error | Yes | Database, queue, storage |

### 11.2 Retry Strategy

```typescript
const retryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 4,
  
  // Delay calculation: min(baseDelay * (multiplier ^ attempt), maxDelay)
  // Attempt 1: 1s, Attempt 2: 4s, Attempt 3: 16s
};
```

**Per-error-type configuration:**
| Error Type | Max Retries | Strategy |
|------------|-------------|----------|
| Provider timeout | 3 | Exponential backoff |
| Provider rate limit | 5 | Wait for rate limit window |
| Provider 5xx | 3 | Exponential backoff |
| Invalid PDF | 0 | Permanent failure |
| Encryption detected | 0 | Permanent failure (unless password provided) |
| Network error | 5 | Exponential backoff |
| Database deadlock | 3 | Immediate retry |

### 11.3 Dead Letter Queue

Documents move to dead letter after exhausting retries:

```typescript
if (document.errorCount >= maxRetries && !document.canRetry) {
  await prisma.document.update({
    where: { id: documentId },
    data: {
      pipelineStatus: 'DEAD_LETTER',
      deadLetterAt: new Date()
    }
  });
  
  // Notify operations team
  await alerting.notify('DOCUMENT_DLQ', { documentId, errors: document.lastError });
}
```

**DLQ handling:**
- Daily report of DLQ documents
- Manual review interface
- Ability to retry with different parameters
- Ability to mark as permanently failed with reason

### 11.4 Circuit Breaker

For external provider calls:

```typescript
const circuitBreaker = {
  provider: 'openai',
  failureThreshold: 5,        // Failures before opening
  successThreshold: 3,        // Successes before closing
  timeout: 30000,             // Request timeout
  resetTimeout: 60000,        // Time before half-open
  
  states: ['CLOSED', 'OPEN', 'HALF_OPEN']
};
```

**Behavior:**
- CLOSED: Normal operation
- OPEN: Fail fast, queue requests for retry
- HALF_OPEN: Allow single request to test recovery

### 11.5 Checkpointing

Pipeline progress is checkpointed after each step:

```prisma
model ProcessingCheckpoint {
  id            String    @id @default(uuid())
  documentId    String
  step          ProcessingStep
  status        CheckpointStatus
  stateJson     Json?     // Step-specific state for resume
  createdAt     DateTime  @default(now())
  
  @@unique([documentId, step])
  @@index([documentId])
}

enum CheckpointStatus {
  STARTED
  COMPLETED
  FAILED
}
```

**Recovery:** On worker restart, query incomplete checkpoints and resume from last completed step.

### 11.6 Partial Failure Handling

Default behavior is strict extraction: if OCR/text acquisition fails for required pages, the extraction job fails retryably and no revision is created. If tenant configuration allows partial extraction drafts, the system may create a draft revision marked with `PARTIAL_EXTRACTION` and block approval/export/match confirmation until a complete extraction exists.

---

## 12. Non-Functional Requirements

### 12.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Container upload throughput | 100 uploads/minute per tenant | Load test |
| Split + render (20 pages) | P95 < 60s | APM |
| Child extraction (≤5 pages) | P95 < 30s | APM |
| Document list query | < 500ms for 10k docs | Query analysis |
| Full-text search | < 1s for 100k docs | Search metrics |
| Matching engine | < 5s for 500 tx × 1k revisions | Benchmark |
| API response (simple) | P95 < 200ms | APM |
| API response (complex) | P95 < 500ms | APM |

### 12.2 Processing Limits

| Limit | Value |
|-------|-------|
| Max file size | 50MB |
| Max pages (container) | 50 pages |
| Max pages (child extraction) | 20 pages |
| Max concurrent uploads per tenant | 10 |
| Max batch size | 100 documents |
| API rate limit | 1000 requests/minute per tenant |

### 12.3 Priority SLAs

| Priority | Target P95 | Alert Threshold |
|----------|-----------|-----------------|
| CRITICAL | 30s | 45s |
| HIGH | 2 min | 5 min |
| NORMAL | 10 min | 30 min |
| LOW | 4 hours | 8 hours |

### 12.4 Availability

| Component | Target | Measurement |
|-----------|--------|-------------|
| API availability | 99.9% | Uptime monitoring |
| Processing availability | 99.5% | Job success rate |
| Data durability | 99.999999999% (11 9s) | Cloud storage SLA |

### 12.5 Observability

#### 12.5.1 Logging

- Structured JSON logging
- Correlation IDs across all services
- Log levels: DEBUG, INFO, WARN, ERROR
- PII masking in logs

#### 12.5.2 Metrics (Prometheus)

```
# Document processing
documents_uploaded_total{tenant, source}
documents_processed_total{tenant, status}
document_processing_duration_seconds{step, provider}

# Extraction
extraction_requests_total{provider, model}
extraction_duration_seconds{provider, model}
extraction_tokens_total{provider, model, type}

# Queue
queue_depth{queue_name}
queue_processing_time_seconds{queue_name}
queue_dead_letter_total{queue_name}

# Providers
provider_requests_total{provider, status}
provider_errors_total{provider, error_code}
provider_latency_seconds{provider}
circuit_breaker_state{provider}

# API
http_requests_total{method, path, status}
http_request_duration_seconds{method, path}
```

#### 12.5.3 Tracing

- OpenTelemetry integration
- Trace IDs propagated through queues
- Span attributes include: documentId, tenantId, provider, model

#### 12.5.4 Health Endpoints

**GET /health**
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "healthy", "latencyMs": 5 },
    "queue": { "status": "healthy", "depth": 42 },
    "storage": { "status": "healthy" },
    "cache": { "status": "healthy" }
  }
}
```

**GET /health/ready**
- Returns 200 only when fully ready to serve traffic
- Includes warm cache status

**GET /metrics**
- Prometheus format metrics endpoint

**GET /api/admin/diagnostics/document/{id}**
- Full processing history
- All extraction attempts
- Provider request IDs
- Error details
- Requires admin permission

---

## 13. Data Retention & Privacy

### 13.1 Retention Policies

| Data Type | Default Retention | Legal Hold Override | Notes |
|-----------|-------------------|---------------------|-------|
| Documents | 7 years from upload | Indefinite | Accounting compliance |
| Document revisions | 7 years | Indefinite | Audit trail |
| Extractions | 7 years | Indefinite | Reproducibility |
| Audit logs | 7 years | Indefinite | Compliance |
| Processing attempts | 90 days | N/A | Debugging only |
| Idempotency records | 7 days | N/A | Operational |
| User sessions | 30 days | N/A | Security |

### 13.2 Deletion Workflow

```typescript
async function processRetention() {
  const expiredDocs = await prisma.document.findMany({
    where: {
      retentionUntil: { lte: new Date() },
      legalHold: false,
      deletedAt: null
    }
  });
  
  for (const doc of expiredDocs) {
    await prisma.$transaction(async (tx) => {
      await tx.documentPage.deleteMany({ where: { documentId: doc.id } });
      await tx.documentDerivedFile.deleteMany({ where: { documentId: doc.id } });
      await tx.documentExtraction.deleteMany({ where: { documentId: doc.id } });
      await tx.documentRevisionLineItem.deleteMany({
        where: { revision: { documentId: doc.id } }
      });
      await tx.documentRevision.deleteMany({ where: { documentId: doc.id } });
      await tx.document.delete({ where: { id: doc.id } });
      
      await storage.delete(doc.containerFilePath);
      
      await tx.auditLog.create({
        data: {
          tenantId: doc.tenantId,
          action: 'DELETE',
          resourceType: 'Document',
          resourceId: doc.id,
          metadata: { reason: 'RETENTION_EXPIRED' }
        }
      });
    });
  }
}
```

### 13.3 Right to Erasure (GDPR Article 17)

For vendor/contact PII:

```typescript
async function anonymizeContact(contactId: string) {
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      name: '[REDACTED]',
      email: null,
      phone: null,
      address: null,
      taxIdentificationNumber: null,
      anonymizedAt: new Date()
    }
  });
}
```

**Erasure constraints:**
- Cannot delete data required for legal/tax compliance
- Anonymization preserves record integrity
- Audit trail of erasure request retained

### 13.4 Data Export (GDPR Article 20)

```
GET /api/companies/{companyId}/export
```

**Response:** ZIP file containing:
- documents.json (metadata)
- revisions.json (structured data)
- files/ (original documents and derived child PDFs where applicable)
- audit.json (activity history)

### 13.5 PII Inventory

Classification rules:
- **Personal (PII):** names, emails, phone, addresses
- **Sensitive:** tax ids, bank account numbers, secrets/credentials
- **Business:** invoice vendor names (default), may be personal for sole proprietors

| Field | Model | Classification | Encryption |
|-------|-------|----------------|------------|
| Contact.name | Contact | Personal | Application-level (or tokenized search + encrypted value) |
| Contact.email | Contact | Personal | Application-level (or tokenized search + encrypted value) |
| Contact.taxIdentificationNumber | Contact | Sensitive | Application-level |
| BankAccount.accountNumber | BankAccount | Sensitive | Application-level |
| User.email | User | Personal | At rest |
| DocumentRevision.vendorName | DocumentRevision | Business | At rest |

---

## 14. Implementation Timeline

| Phase | Duration | Key Deliverables | Risk Factors |
|-------|----------|------------------|--------------|
| **1A** | 6–9 weeks | Ingestion, splitting, extraction, revisions, bbox evidence, line items | LLM provider stability, bbox accuracy, line item complexity |
| **1B** | 3–4 weeks | Home currency, GST profile, exchange rates, rate audit | Rate provider reliability, GST rule complexity |
| **2** | 7–10 weeks | Bank reconciliation, multi-currency matching, revision-locked matches | Algorithm tuning, FX edge cases |
| **3** | 4–6 weeks | Client portal, communication, document requests | Authentication isolation, UX complexity |
| **4** | 5–8 weeks | Accounting integrations, posting model, field mapping | API compatibility, rate limiting |

### 14.1 Phase 1A Milestones

| Week | Milestone |
|------|-----------|
| 1-2 | Core data model, file upload, storage |
| 3-4 | Page rendering, text acquisition selector |
| 5-6 | Split detection, child document creation |
| 7-8 | Field extraction, line items, bbox evidence |
| 9 | Revision workflow, duplicate detection, testing |

### 12.2 Dependencies

```
Phase 1A ──► Phase 1B ──► Phase 2
                │
                └──────► Phase 3 ──► Phase 4
```

- Phase 1B requires Phase 1A (revisions for currency conversion)
- Phase 2 requires Phase 1B (multi-currency matching)
- Phase 3 can start after Phase 1B (independent of Phase 2)
- Phase 4 requires Phase 1B minimum (export revisions)

---

## Appendix A: Evidence Coordinate Contract

### A.1 Evidence Structure

All evidence bounding boxes must conform to the v3.3 evidence structure and must reference **container page numbers**.

```json
{
  "containerPageNumber": 1,
  "childPageNumber": 1,
  "text": "Total: USD 1,000.00",
  "confidence": 0.92,
  "coordSpace": "RENDERED_IMAGE",
  "renderFingerprint": "sha256:...",
  "bbox": {
    "x0": 0.12,
    "y0": 0.34,
    "x1": 0.28,
    "y1": 0.38,
    "unit": "normalized",
    "origin": "top-left"
  }
}
```

### A.2 Coordinate Rules

| Rule | Requirement |
|------|-------------|
| Coordinate system | Normalized [0..1] relative to stored rendered page image |
| Origin | Top-left corner |
| X-axis | Left to right |
| Y-axis | Top to bottom |
| Ordering | `x0 < x1`, `y0 < y1` |
| Reference | `DocumentPage.widthPx`, `DocumentPage.heightPx` at `renderDpi` |
| Rotation | Evidence must be transformed to match stored rendered image orientation |

### A.3 Evidence Collection

**Header fields:**
```json
{
  "vendorName": {
    "value": "Acme Corp",
    "evidence": {
      "containerPageNumber": 1,
      "childPageNumber": 1,
      "text": "Acme Corp Pte Ltd",
      "confidence": 0.95,
      "coordSpace": "RENDERED_IMAGE",
      "renderFingerprint": "sha256:...",
      "bbox": { "x0": 0.1, "y0": 0.05, "x1": 0.4, "y1": 0.08, "unit": "normalized", "origin": "top-left" }
    }
  },
  "totalAmount": {
    "value": "1000.00",
    "evidence": {
      "containerPageNumber": 1,
      "childPageNumber": 1,
      "text": "Total: SGD 1,000.00",
      "confidence": 0.98,
      "coordSpace": "RENDERED_IMAGE",
      "renderFingerprint": "sha256:...",
      "bbox": { "x0": 0.6, "y0": 0.85, "x1": 0.9, "y1": 0.88, "unit": "normalized", "origin": "top-left" }
    }
  }
}
```

**Line items:**
```json
{
  "lineNo": 1,
  "description": "Consulting",
  "amount": "500.00",
  "evidenceJson": {
    "description": {
      "containerPageNumber": 1,
      "childPageNumber": 1,
      "text": "Consulting Services",
      "confidence": 0.92,
      "coordSpace": "RENDERED_IMAGE",
      "renderFingerprint": "sha256:...",
      "bbox": { "x0": 0.1, "y0": 0.4, "x1": 0.5, "y1": 0.43, "unit": "normalized", "origin": "top-left" }
    },
    "amount": {
      "containerPageNumber": 1,
      "childPageNumber": 1,
      "text": "500.00",
      "confidence": 0.97,
      "coordSpace": "RENDERED_IMAGE",
      "renderFingerprint": "sha256:...",
      "bbox": { "x0": 0.8, "y0": 0.4, "x1": 0.9, "y1": 0.43, "unit": "normalized", "origin": "top-left" }
    }
  }
}
```

### A.4 UI Implementation

```typescript
function renderHighlight(evidence: Evidence, pageImage: HTMLImageElement) {
  const { bbox } = evidence;

  const x = bbox.x0 * pageImage.naturalWidth;
  const y = bbox.y0 * pageImage.naturalHeight;
  const width = (bbox.x1 - bbox.x0) * pageImage.naturalWidth;
  const height = (bbox.y1 - bbox.y0) * pageImage.naturalHeight;

  return { x, y, width, height };
}
```

---

## Appendix B: Document Fingerprints & Duplicate Scoring

### B.1 Document Key Generation

```typescript
function generateDocumentKey(revision: DocumentRevision): string {
  const components = [
    normalizeVendorName(revision.vendorName),
    revision.documentNumber?.toLowerCase(),
    revision.documentDate?.toISOString().split('T')[0],
    revision.totalAmount.toString(),
    revision.currency
  ].filter(Boolean);

  return sha256(components.join('|'));
}
```

### B.2 Duplicate Scoring Model

| Signal | Weight | Calculation |
|--------|--------|-------------|
| Vendor similarity | 25% | Jaro-Winkler on normalized names + alias lookup |
| Document number | 30% | Exact: 1.0, Near (edit distance ≤ 2): 0.8 |
| Date proximity | 20% | 1.0 if same day, decay 0.1 per day |
| Amount (doc currency) | 15% | 1.0 if exact, decay by % difference |
| Amount (home currency) | 10% | 1.0 if exact, decay by % difference |

Optional signals:
- Text fingerprint (SimHash)
- Visual fingerprint (pHash)

### B.3 Scoring Thresholds

| Score Range | Classification | UI Treatment |
|-------------|----------------|--------------|
| ≥ 0.95 | High confidence duplicate | Blocking modal, require decision |
| 0.80 – 0.94 | Suspected duplicate | Warning banner, soft requirement |
| 0.60 – 0.79 | Possible duplicate | Informational notice |
| < 0.60 | Not duplicate | No indication |

### B.4 Vendor Name Normalization

```typescript
function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pte|ltd|llc|inc|corp|co)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}
```

### B.5 Canonical Version Rules

- A version chain is represented by `rootDocumentId`.
- Exactly one document in a chain is canonical: `isArchived=false` and not deleted.
- `MARK_AS_NEW_VERSION` archives the prior canonical (`isArchived=true`, `archiveReason="SUPERSEDED_BY_NEW_VERSION"`) and makes the new document canonical.

---

## Appendix C: Error Codes

### C.1 Client Errors (4xx)

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INVALID_FILE_TYPE` | 400 | Unsupported file format |
| `FILE_TOO_LARGE` | 400 | Exceeds size limit |
| `PAGE_LIMIT_EXCEEDED` | 400 | Exceeds page count limit |
| `INVALID_PAGE_RANGE` | 400 | Invalid split page range |
| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid token |
| `TOKEN_EXPIRED` | 401 | JWT token expired |
| `PERMISSION_DENIED` | 403 | Insufficient permissions |
| `RESOURCE_NOT_FOUND` | 404 | Document/resource not found |
| `DUPLICATE_EXISTS` | 409 | Exact duplicate already exists |
| `CONCURRENT_MODIFICATION` | 409 | Lock version mismatch |
| `DOCUMENT_LOCKED` | 409 | Document locked by another user |
| `PERIOD_LOCKED` | 409 | Reconciliation period locked |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

### C.2 Server Errors (5xx)

| Code | HTTP | Description |
|------|------|-------------|
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `STORAGE_ERROR` | 500 | File storage operation failed |
| `PROVIDER_ERROR` | 502 | AI/OCR provider error |
| `PROVIDER_TIMEOUT` | 504 | Provider request timeout |
| `PROVIDER_UNAVAILABLE` | 503 | Provider circuit breaker open |

### C.3 Processing Errors

| Code | Retryable | Description |
|------|-----------|-------------|
| `PDF_ENCRYPTED` | No | PDF requires password |
| `PDF_CORRUPTED` | No | PDF file is corrupted |
| `PDF_UNSUPPORTED` | No | PDF version/feature not supported |
| `OCR_FAILED` | Yes | OCR processing failed |
| `EXTRACTION_FAILED` | Yes | Field extraction failed |
| `SPLIT_FAILED` | Yes | Document splitting failed |
| `RENDER_FAILED` | Yes | Page rendering failed |

---

## Appendix D: State Diagrams

### D.1 Document Pipeline Status

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CONTAINER DOCUMENT                          │
└─────────────────────────────────────────────────────────────────────┘

  UPLOADED ──► QUEUED ──► PROCESSING ──┬──► SPLIT_PENDING ──► SPLIT_DONE
                │                       │         │
                │                       │         └──► (creates child docs)
                │                       │
                ▼                       ▼
        FAILED_RETRYABLE ◄──────── [error]
                │
                ├──► QUEUED (on retry, if retries remaining)
                │
                ▼
        FAILED_PERMANENT ──► DEAD_LETTER (after max retries)


┌─────────────────────────────────────────────────────────────────────┐
│                          CHILD DOCUMENT                             │
└─────────────────────────────────────────────────────────────────────┘

  QUEUED ──► PROCESSING ──┬──► EXTRACTION_DONE
                          │         │
                          │         └──► (creates DRAFT revision)
                          │
                          ▼
                  FAILED_RETRYABLE ◄──────── [error]
                          │
                          ├──► QUEUED (on retry)
                          │
                          ▼
                  FAILED_PERMANENT ──► DEAD_LETTER
```

### D.2 Revision Status

```
                    ┌─────────────┐
                    │   DRAFT     │◄──────────────────────┐
                    └──────┬──────┘                       │
                           │                              │
                           │ approve                      │ create new revision
                           ▼                              │ (edit after approval)
                    ┌─────────────┐                       │
   ┌───────────────►│  APPROVED   │───────────────────────┘
   │                └──────┬──────┘
   │                       │
   │                       │ new revision approved
   │                       ▼
   │                ┌─────────────┐
   │                │ SUPERSEDED  │
   │                └─────────────┘
   │
   └── (only one APPROVED revision per document at any time)
```

### D.3 Duplicate Detection Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      UPLOAD (Container)                          │
└──────────────────────────────────────────────────────────────────┘

  Upload ──► Hash Check ──┬──► [EXACT MATCH]
                          │         │
                          │         ▼
                          │   User Prompt ──┬──► Cancel
                          │                 │
                          │                 └──► Proceed (acknowledged)
                          │                          │
                          └──► [NO MATCH] ───────────┘
                                    │
                                    ▼
                               Continue Processing


┌──────────────────────────────────────────────────────────────────┐
│                    EXTRACTION COMPLETE (Child)                   │
└──────────────────────────────────────────────────────────────────┘

  Extraction ──► Content Check ──┬──► [score ≥ 0.95]
       │                         │         │
       │                         │         ▼
       │                         │   SUSPECTED (require decision)
       │                         │         │
       │                         │         ├──► CONFIRM ──► CONFIRMED
       │                         │         │                    │
       │                         │         │         (linked, prevent booking/posting)
       │                         │         │
       │                         │         ├──► REJECT ──► REJECTED
       │                         │         │                    │
       │                         │         │            (independent doc)
       │                         │         │
       │                         │         └──► NEW_VERSION ──► NONE
       │                         │                    │
       │                         │           (original archived; new canonical)
       │                         │
       │                         ├──► [0.80 ≤ score < 0.95]
       │                         │         │
       │                         │         ▼
       │                         │   SUSPECTED (soft warning)
       │                         │
       │                         └──► [score < 0.80]
       │                                   │
       ▼                                   ▼
  duplicateStatus = NONE ◄─────────────────┘
```

### D.4 Match Group Status

```
  Matching Engine ──► Creates MatchGroup ──► SUGGESTED
                                                 │
                                                 ├──► User Confirms ──► CONFIRMED
                                                 │                          │
                                                 │                   (reconciled)
                                                 │
                                                 └──► User Rejects ──► REJECTED
                                                                          │
                                                                   (back to unmatched)
```

---

## Appendix E: Invariants & Business Rules

### E.1 Core invariants

1. `Document.currentRevisionId` must reference a revision whose `documentId` matches the document.
2. At most one `APPROVED` revision exists per document at a time.
3. If `Document.duplicateStatus = SUSPECTED`, approval/export/posting/match confirmation are blocked until a `DuplicateDecision` exists for the suspected pair.
4. If `Document.duplicateStatus = CONFIRMED`, export/posting are blocked.
5. Confirmed reconciliation requires balancing in bank currency within tolerance (see §5.2.3).

### E.2 Version chain invariants

1. A version chain is defined by `rootDocumentId`.
2. Exactly one document in a chain is canonical (not archived, not deleted).
3. `MARK_AS_NEW_VERSION` archives the old canonical and makes the new document canonical, recording `archivedAt`, `archivedById`, and `archiveReason`.

### E.3 Posting invariants

1. Only `APPROVED` revisions may be posted.
2. When a revision is posted successfully:
   - `DocumentRevision.postingStatus=POSTED`
   - `DocumentRevision.postingLock=true`
3. If a posted revision is superseded, a corrective posting workflow is required (provider-specific).
4. `posting:override` may be used by tenant admin with a mandatory reason and audit entry.

---

## Appendix F: Validation Issue Codes

Validation issues are stored in `DocumentRevision.validationIssues` as:

```json
{
  "issues": [
    {
      "code": "LINE_SUM_MISMATCH",
      "severity": "WARN",
      "message": "Sum of line items does not match subtotal",
      "field": "subtotal"
    }
  ]
}
```

Common codes:
- `PARTIAL_EXTRACTION` (WARN)
- `HEADER_ARITHMETIC_MISMATCH` (WARN)
- `LINE_SUM_MISMATCH` (WARN)
- `FUTURE_DATE` (WARN)
- `INVALID_CURRENCY` (ERROR)
- `MISSING_VENDOR` (WARN/ERROR by category)
- `GST_RATE_MISMATCH` (WARN)
- `CREDIT_NOTE_TOTAL_NOT_NEGATIVE` (ERROR)

---

## Appendix G: Search (MVP)

Search is implemented using Postgres full-text search for MVP.

Requirements:
- Tenant/company scoping is applied before FTS query execution.
- Maintain a normalized `searchText` (and optionally `tsvector`) for `DocumentRevision` including:
  - vendorName, documentNumber, currency, totalAmount, documentDate (as text), and other key fields
- Optionally include sanitized `DocumentExtraction.rawText` for search depending on plan and retention policy.
- Use a GIN index for FTS performance.

Example approach (conceptual):
- `document_revisions.search_tsv tsvector GENERATED ALWAYS AS (...) STORED`
- `CREATE INDEX ... USING GIN (search_tsv)`

---

*End of Specification v3.3*
```