# Document Processing - API Reference

> **Last Updated**: 2025-01-12
> **Audience**: Developers

API endpoints for the Document Processing module.

## Related Documents

- [Overview](./OVERVIEW.md) - Module overview
- [API Reference (Full)](../../reference/API_REFERENCE.md) - Complete API reference

---

## Processing Documents

### List Documents

```
GET /api/processing
```

**Query Parameters:**
- `status` - Filter by status
- `companyId` - Filter by company
- `documentType` - Filter by type
- `dateFrom`, `dateTo` - Date range
- `search` - Search vendor/reference
- `page`, `limit` - Pagination

**Response:**
```json
{
  "data": [...],
  "stats": {
    "pending": 5,
    "needsReview": 12,
    "approved": 45
  },
  "pagination": { "page": 1, "limit": 20, "total": 62 }
}
```

### Get Document

```
GET /api/processing/:id
```

**Response includes:**
- Document details
- Current revision
- Extraction history
- Duplicate candidates

### Upload Document

```
POST /api/processing/upload
Content-Type: multipart/form-data

file: <PDF/image file>
companyId: "uuid"
documentType: "INVOICE" (optional)
autoExtract: true (optional)
```

**Response:**
```json
{
  "id": "uuid",
  "status": "PENDING",
  "message": "Document uploaded, extraction queued"
}
```

### Get Document Pages

```
GET /api/processing/:id/pages
```

Returns page images for document viewer.

### Update Document

```
PATCH /api/processing/:id
Content-Type: application/json

{
  "documentType": "INVOICE",
  "vendorName": "Acme Corp"
}
```

### Delete Document

```
DELETE /api/processing/:id
```

---

## Extraction

### Trigger Extraction

```
POST /api/processing/:id/extract
Content-Type: application/json

{
  "model": "gpt-4o",
  "forceReExtract": false
}
```

### Get Extraction Results

```
GET /api/processing/:id/extractions
```

Returns all extractions for document (history).

---

## Revisions

### Get Revisions

```
GET /api/processing/:id/revisions
```

### Create Revision (Edit)

```
POST /api/processing/:id/revisions
Content-Type: application/json

{
  "headerData": {
    "vendorName": "Acme Corp",
    "invoiceNumber": "INV-001",
    "invoiceDate": "2025-01-15",
    "dueDate": "2025-02-15",
    "totalAmount": 1500.00
  },
  "lineItems": [
    {
      "description": "Consulting Services",
      "quantity": 10,
      "unitPrice": 150.00,
      "amount": 1500.00,
      "accountCode": "6100"
    }
  ],
  "changeReason": "Corrected vendor name"
}
```

### Revert to Revision

```
POST /api/processing/:id/revisions/:revisionId/revert
```

Creates new revision with data from specified revision.

---

## Approval

### Approve Document

```
POST /api/processing/:id/approve
Content-Type: application/json

{
  "reason": "Verified against PO"
}
```

### Unapprove Document

```
POST /api/processing/:id/unapprove
Content-Type: application/json

{
  "reason": "Need to correct line items"
}
```

---

## Duplicate Handling

### Get Duplicate Candidates

```
GET /api/processing/:id/duplicates
```

**Response:**
```json
{
  "candidates": [
    {
      "documentId": "uuid",
      "similarityScore": 0.95,
      "matchedFields": ["invoiceNumber", "vendorName", "totalAmount"]
    }
  ]
}
```

### Make Duplicate Decision

```
POST /api/processing/:id/duplicates/:candidateId/decision
Content-Type: application/json

{
  "decision": "NOT_DUPLICATE",
  "reason": "Different invoice date"
}
```

---

## Locking

### Acquire Review Lock

```
POST /api/processing/:id/lock
```

### Release Review Lock

```
DELETE /api/processing/:id/lock
```

---

## Bulk Operations

### Bulk Approve

```
POST /api/processing/bulk/approve
Content-Type: application/json

{
  "documentIds": ["uuid1", "uuid2", "uuid3"],
  "reason": "Batch approval"
}
```

### Bulk Re-Extract

```
POST /api/processing/bulk/extract
Content-Type: application/json

{
  "documentIds": ["uuid1", "uuid2"],
  "model": "gpt-4o"
}
```

### Bulk Archive

```
POST /api/processing/bulk/archive
Content-Type: application/json

{
  "documentIds": ["uuid1", "uuid2"]
}
```

---

## Document Splitting

### Get Split Suggestions

```
GET /api/processing/:id/split-suggestions
```

AI-detected document boundaries in multi-page PDFs.

### Accept Split

```
POST /api/processing/:id/split
Content-Type: application/json

{
  "splits": [
    { "pageStart": 1, "pageEnd": 2, "documentType": "INVOICE" },
    { "pageStart": 3, "pageEnd": 3, "documentType": "RECEIPT" }
  ]
}
```

---

## Vendor Aliases

### List Aliases

```
GET /api/companies/:companyId/vendor-aliases
```

### Create Alias

```
POST /api/companies/:companyId/vendor-aliases
Content-Type: application/json

{
  "extractedName": "ACME CORPORATION PTE LTD",
  "canonicalName": "Acme Corp",
  "vendorCode": "V001"
}
```

---

## Export

### Export to Accounting

```
POST /api/processing/:id/export
Content-Type: application/json

{
  "target": "xero",
  "options": {
    "createBill": true
  }
}
```

---

## Authentication

All endpoints require authentication with appropriate permissions:
- `processing_document:read` - View documents
- `processing_document:write` - Edit documents
- `processing_document:approve` - Approve documents
- `processing_document:delete` - Delete documents
