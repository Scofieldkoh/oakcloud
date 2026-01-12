# Document Processing - Overview

> **Last Updated**: 2025-01-12
> **Audience**: Developers

AI-powered document processing module for accounting practices. Handles ingestion, classification, extraction, and approval workflows.

## Related Documents

- [Schema](./SCHEMA.md) - Database tables
- [API](./API.md) - API endpoints
- [UI](./UI.md) - UI components
- [Extraction](./EXTRACTION.md) - AI extraction details
- [Appendices](./APPENDICES.md) - Error codes, state diagrams

---

## Implementation Status

| Phase | Component | Status |
|-------|-----------|--------|
| **1A** | Database Schema | Complete |
| **1A** | Document Processing Service | Complete |
| **1A** | Document Revision Service | Complete |
| **1A** | Document Extraction Service | Complete |
| **1A** | Duplicate Detection Service | Complete |
| **1A** | API Routes | Complete |
| **1A** | UI - List Page | Complete |
| **1A** | UI - Detail Page | Complete |
| **1B** | Multi-Currency | Pending |
| **2** | Bank Reconciliation | Pending |
| **3** | Client Portal | Pending |
| **4** | Accounting Integration | Pending |

---

## Purpose

Build a document processing module that automates:
- Ingestion (including multi-document PDFs)
- Document classification and structured extraction
- Multi-currency conversion
- Bank reconciliation matching
- Client communication and accounting exports

---

## Key Principles

### 1. Immutability Where It Matters
- `DocumentExtraction` is immutable (raw AI/OCR outputs)
- Approved accounting data = immutable **revisions**
- Workflow state changes are auditable

### 2. Human Auditability
- Every approval/edit creates a new revision
- All decisions are logged and auditable
- Complete change history

### 3. Evidence-First UX
- Every extracted field includes evidence citations
- Bounding box highlights where feasible
- Stable coordinate contract

### 4. Currency Correctness
- Company has `homeCurrency`
- Bank accounts have their own currency
- Matching operates in bank account currency

### 5. Resilient Processing
- Graceful degradation on failures
- Idempotent operations throughout
- Comprehensive error recovery

---

## Definitions

| Term | Definition |
|------|------------|
| **Container document** | Uploaded file (e.g., PDF with multiple receipts). Not directly "bookable". |
| **Child document** | Logical accounting document representing a page range within a container. |
| **Extraction** | Immutable output from OCR/LLM normalization. |
| **Revision** | Immutable snapshot of structured accounting data (header + line items). |
| **Duplicate** | Same economic document; should not be booked twice. |
| **Version** | Same document, improved scan; replaces prior as canonical. |

---

## Multi-Tenancy Model

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
- Documents are scoped to Company
- VendorAlias is Company-scoped
- ExchangeRates are global (system-wide cache)

---

## Processing Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │────▶│  Splitting  │────▶│ Extraction  │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Export    │◀────│  Approved   │◀────│   Review    │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Pipeline Stages

1. **Upload**: File received, container document created
2. **Splitting**: Multi-document PDFs split into child documents
3. **Extraction**: AI extracts structured data
4. **Review**: Human reviews and edits extracted data
5. **Approved**: Data locked, revision created
6. **Export**: Posted to accounting software

---

## Document States

| State | Description |
|-------|-------------|
| `PENDING` | Awaiting processing |
| `PROCESSING` | AI extraction in progress |
| `NEEDS_REVIEW` | Extraction complete, awaiting human review |
| `APPROVED` | Human approved, ready for posting |
| `POSTED` | Posted to accounting software |
| `ARCHIVED` | No longer active |
| `FAILED` | Processing failed |

---

## Phases Overview

### Phase 1A: Core Processing (Complete)
- File upload and storage
- Document splitting
- AI extraction
- Revision workflow
- Duplicate detection
- Approval workflow

### Phase 1B: Multi-Currency & GST (Pending)
- Currency conversion
- GST handling
- Exchange rate integration

### Phase 2: Bank Reconciliation (Pending)
- Bank statement import
- Transaction matching
- Match rules

### Phase 3: Client Portal (Pending)
- Client document upload
- Communication workflow
- Query resolution

### Phase 4: Accounting Integration (Pending)
- Xero integration
- QuickBooks integration
- Export formats
