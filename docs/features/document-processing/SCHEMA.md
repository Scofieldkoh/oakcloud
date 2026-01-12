# Document Processing - Database Schema

> **Last Updated**: 2025-01-12
> **Audience**: Developers

Database tables for the Document Processing module.

## Related Documents

- [Overview](./OVERVIEW.md) - Module overview
- [Database Schema (Full)](../../reference/DATABASE_SCHEMA.md) - Complete schema

---

## Core Tables

### processing_documents

Main document records for processing pipeline.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tenant_id | UUID | FK to tenants |
| company_id | UUID | FK to companies |
| container_id | UUID | Parent container (null if this is container) |
| document_type | ENUM | INVOICE, RECEIPT, STATEMENT, etc. |
| status | ENUM | PENDING, PROCESSING, NEEDS_REVIEW, APPROVED, etc. |
| page_start | INT | Start page (1-indexed) |
| page_end | INT | End page (inclusive) |
| storage_key | VARCHAR | S3 storage path |
| fingerprint | VARCHAR(64) | BLAKE3 hash for duplicate detection |
| is_split_suggestion | BOOLEAN | AI suggested split |
| locked_by_id | UUID | User who has review lock |
| locked_at | TIMESTAMP | When lock was acquired |
| approved_at | TIMESTAMP | When approved |
| approved_by_id | UUID | Who approved |
| posted_at | TIMESTAMP | When posted to accounting |
| metadata | JSONB | Additional metadata |
| created_at | TIMESTAMP | Creation time |
| deleted_at | TIMESTAMP | Soft delete |

**Indexes:**
- `processing_documents_tenant_id_idx`
- `processing_documents_company_id_idx`
- `processing_documents_status_idx`
- `processing_documents_fingerprint_idx`

---

### document_extractions

Immutable AI extraction results.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| document_id | UUID | FK to processing_documents |
| extraction_provider | VARCHAR | openai, anthropic, gemini |
| extraction_model | VARCHAR | Model used |
| raw_response | JSONB | Raw AI response |
| normalized_data | JSONB | Normalized extracted data |
| confidence_score | DECIMAL | Overall confidence (0-1) |
| field_confidences | JSONB | Per-field confidence scores |
| extraction_cost | DECIMAL | API cost |
| latency_ms | INT | Processing time |
| created_at | TIMESTAMP | Extraction time |

**Notes:**
- Extractions are **immutable** - never update, only create new
- Multiple extractions can exist per document (re-extractions)

---

### document_revisions

Immutable revision snapshots for accounting data.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| document_id | UUID | FK to processing_documents |
| revision_number | INT | Sequential revision number |
| source | ENUM | EXTRACTION, MANUAL, BULK_UPDATE |
| header_data | JSONB | Document header fields |
| line_items | JSONB | Line items array |
| total_amount | DECIMAL | Document total |
| currency | VARCHAR(3) | Document currency |
| is_current | BOOLEAN | Current active revision |
| created_by_id | UUID | User who created |
| created_at | TIMESTAMP | Creation time |
| change_reason | VARCHAR | Reason for revision |

**Notes:**
- Revisions are **immutable**
- Only one revision per document has `is_current = true`
- New edits create new revisions

---

### document_line_items

Line items for approved documents.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| revision_id | UUID | FK to document_revisions |
| line_number | INT | Line order |
| description | TEXT | Line description |
| quantity | DECIMAL | Quantity |
| unit_price | DECIMAL | Unit price |
| amount | DECIMAL | Total amount |
| tax_code | VARCHAR | Tax/GST code |
| tax_amount | DECIMAL | Tax amount |
| account_code | VARCHAR | GL account code |
| account_confidence | DECIMAL | AI confidence for account |
| evidence | JSONB | Bounding box coordinates |

---

### duplicate_decisions

Duplicate handling decisions.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| document_id | UUID | Document being evaluated |
| duplicate_of_id | UUID | Potential duplicate |
| decision | ENUM | DUPLICATE, NOT_DUPLICATE, VERSION |
| similarity_score | DECIMAL | Jaro-Winkler score |
| decision_reason | VARCHAR | User explanation |
| decided_by_id | UUID | User who decided |
| decided_at | TIMESTAMP | Decision time |

---

### vendor_aliases

Company-specific vendor name mappings.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tenant_id | UUID | FK to tenants |
| company_id | UUID | FK to companies |
| extracted_name | VARCHAR | Name from extraction |
| canonical_name | VARCHAR | Standardized name |
| vendor_code | VARCHAR | Vendor code in accounting |
| created_at | TIMESTAMP | Creation time |

**Unique:** (company_id, extracted_name)

---

## Bank Reconciliation Tables (Phase 2)

### bank_accounts

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| company_id | UUID | FK to companies |
| account_name | VARCHAR | Display name |
| account_number | VARCHAR | Account number |
| currency | VARCHAR(3) | Account currency |
| bank_name | VARCHAR | Bank name |
| is_active | BOOLEAN | Active status |

### bank_transactions

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| bank_account_id | UUID | FK to bank_accounts |
| transaction_date | DATE | Transaction date |
| description | TEXT | Transaction description |
| amount | DECIMAL | Transaction amount |
| balance | DECIMAL | Running balance |
| reference | VARCHAR | Bank reference |
| is_matched | BOOLEAN | Matched to document |

### reconciliation_matches

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| bank_transaction_id | UUID | FK to bank_transactions |
| document_id | UUID | FK to processing_documents |
| match_type | ENUM | AUTO, MANUAL, RULE |
| match_confidence | DECIMAL | Confidence score |
| matched_by_id | UUID | User who matched |

---

## Enums

```sql
-- Document types
CREATE TYPE ProcessingDocumentType AS ENUM (
  'INVOICE',
  'RECEIPT',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'STATEMENT',
  'PURCHASE_ORDER',
  'OTHER'
);

-- Processing status
CREATE TYPE ProcessingStatus AS ENUM (
  'PENDING',
  'PROCESSING',
  'NEEDS_REVIEW',
  'APPROVED',
  'POSTED',
  'ARCHIVED',
  'FAILED'
);

-- Revision source
CREATE TYPE RevisionSource AS ENUM (
  'EXTRACTION',
  'MANUAL',
  'BULK_UPDATE',
  'API'
);

-- Duplicate decision
CREATE TYPE DuplicateDecision AS ENUM (
  'DUPLICATE',
  'NOT_DUPLICATE',
  'VERSION'
);
```

---

## Relationships

```
ProcessingDocument (Container)
├── ProcessingDocument[] (Children)
├── DocumentExtraction[] (Immutable extractions)
├── DocumentRevision[] (Immutable revisions)
│   └── DocumentLineItem[]
└── DuplicateDecision[]

Company
├── ProcessingDocument[]
├── VendorAlias[]
└── BankAccount[]
    └── BankTransaction[]
        └── ReconciliationMatch[]
```
