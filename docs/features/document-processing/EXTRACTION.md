# Document Processing - AI Extraction

> **Last Updated**: 2025-01-12
> **Audience**: Developers

AI extraction, classification, and account code assignment.

## Related Documents

- [Overview](./OVERVIEW.md) - Module overview
- [AI Debug](../../debug/AI_DEBUG.md) - Debugging AI extraction

---

## Extraction Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │────▶│  Classify   │────▶│   Extract   │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Create    │◀────│   Assign    │◀────│  Normalize  │
│  Revision   │     │  Accounts   │     │    Data     │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## Supported Providers

| Provider | Models | Best For |
|----------|--------|----------|
| OpenAI | gpt-4o, gpt-4-turbo | General extraction |
| Anthropic | claude-3-opus, claude-3-sonnet | Complex documents |
| Google | gemini-pro-vision | Multi-language |

---

## Document Classification

### Document Types

| Type | Description |
|------|-------------|
| `INVOICE` | Sales/purchase invoice |
| `RECEIPT` | Payment receipt |
| `CREDIT_NOTE` | Credit note/return |
| `DEBIT_NOTE` | Debit note |
| `STATEMENT` | Account statement |
| `PURCHASE_ORDER` | Purchase order |
| `OTHER` | Unclassified |

### Classification Confidence

Documents with classification confidence < 0.7 are flagged for manual review.

---

## Extracted Fields

### Header Fields

| Field | Type | Description |
|-------|------|-------------|
| `documentType` | string | Classified document type |
| `vendorName` | string | Vendor/supplier name |
| `customerName` | string | Customer name (for invoices) |
| `invoiceNumber` | string | Document reference number |
| `invoiceDate` | date | Document date |
| `dueDate` | date | Payment due date |
| `totalAmount` | decimal | Total amount |
| `taxAmount` | decimal | Tax/GST amount |
| `currency` | string | ISO currency code |
| `paymentTerms` | string | Payment terms |

### Line Item Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Item description |
| `quantity` | decimal | Quantity |
| `unitPrice` | decimal | Price per unit |
| `amount` | decimal | Line total |
| `taxCode` | string | Tax code |
| `taxAmount` | decimal | Line tax |
| `accountCode` | string | GL account code |

---

## Account Code Assignment

### Overview

AI assigns GL account codes based on:
1. Line item description
2. Tenant's Chart of Accounts
3. Historical patterns (vendor aliases)

### Confidence Scoring

| Score | Meaning |
|-------|---------|
| >= 0.9 | High confidence, auto-assign |
| 0.7-0.9 | Medium confidence, suggest |
| < 0.7 | Low confidence, manual review |

### Account Code Ranges

| Range | Category |
|-------|----------|
| 4xxx | Revenue accounts |
| 5xxx | Cost of goods sold |
| 6xxx-7xxx | Operating expenses |
| 8xxx | Tax expenses |

---

## Evidence Coordinates

### Bounding Box Format

```typescript
interface EvidenceCoordinate {
  page: number;      // 1-indexed page
  x: number;         // 0-1 normalized X
  y: number;         // 0-1 normalized Y
  width: number;     // 0-1 normalized width
  height: number;    // 0-1 normalized height
  confidence: number; // 0-1 confidence
}
```

### Field Evidence

Each extracted field includes source evidence:

```json
{
  "invoiceNumber": {
    "value": "INV-2025-001",
    "confidence": 0.95,
    "evidence": {
      "page": 1,
      "x": 0.65,
      "y": 0.12,
      "width": 0.20,
      "height": 0.03
    }
  }
}
```

---

## Split Detection

### Multi-Document PDFs

AI detects document boundaries in multi-page PDFs:

```json
{
  "splitSuggestions": [
    { "pageStart": 1, "pageEnd": 2, "type": "INVOICE", "confidence": 0.92 },
    { "pageStart": 3, "pageEnd": 3, "type": "RECEIPT", "confidence": 0.88 }
  ]
}
```

### Split Indicators

- Page header/footer changes
- Document number changes
- Vendor name changes
- Significant layout changes

---

## Duplicate Detection

### Fingerprint Generation

Documents are fingerprinted using BLAKE3 hash of:
- Normalized vendor name
- Document number
- Total amount
- Document date

### Similarity Scoring

Jaro-Winkler similarity for string matching:

| Score | Action |
|-------|--------|
| >= 0.95 | Strong duplicate candidate |
| 0.85-0.95 | Review recommended |
| < 0.85 | Unlikely duplicate |

---

## Extraction Service

### Main Functions

```typescript
// Trigger extraction
extractDocument(documentId: string, options: ExtractionOptions)

// Get extraction results
getExtraction(extractionId: string)

// Re-extract with different model
reExtract(documentId: string, model: string)
```

### Extraction Options

```typescript
interface ExtractionOptions {
  model?: string;           // AI model to use
  forceReExtract?: boolean; // Override existing extraction
  includeLineItems?: boolean; // Extract line items
  chartOfAccounts?: Account[]; // COA for account assignment
}
```

---

## Error Handling

### Extraction Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `EXTRACTION_FAILED` | AI API error | Retry with exponential backoff |
| `UNSUPPORTED_FORMAT` | File type not supported | Convert to PDF |
| `PAGE_LIMIT_EXCEEDED` | Too many pages | Split document |
| `LOW_QUALITY_IMAGE` | Poor scan quality | Request better scan |

### Graceful Degradation

If primary provider fails:
1. Retry same provider (3 attempts)
2. Fallback to secondary provider
3. Mark as NEEDS_REVIEW for manual entry

---

## Debugging

### Enable Debug Logging

```bash
AI_DEBUG=true
AI_DEBUG_LOG_PROMPTS=true
AI_DEBUG_LOG_RESPONSES=true
```

### Debug Output

Logs to `docs/AI_DEBUG.md`:
- Request details (model, provider)
- Full prompt (collapsible)
- Raw response (collapsible)
- Token counts and cost
- Extraction results

See [AI Debug Guide](../../debug/AI_DEBUG.md) for details.

---

## Performance

### Typical Latencies

| Document Type | Pages | Latency |
|---------------|-------|---------|
| Simple invoice | 1 | 2-4s |
| Complex invoice | 2-3 | 5-8s |
| Statement | 5+ | 10-15s |

### Cost Optimization

- Cache extraction results
- Batch similar documents
- Use appropriate model for complexity
- Skip re-extraction when possible
