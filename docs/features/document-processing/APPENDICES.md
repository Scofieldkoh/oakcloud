# Document Processing - Appendices

> **Last Updated**: 2025-01-12
> **Audience**: Developers

Error codes, state diagrams, validation rules, and business invariants.

## Related Documents

- [Overview](./OVERVIEW.md) - Module overview
- [Extraction](./EXTRACTION.md) - AI extraction details

---

## Appendix A: Error Codes

### Processing Errors

| Code | Message | Resolution |
|------|---------|------------|
| `PROC_001` | Document not found | Check document ID |
| `PROC_002` | Document already approved | Cannot edit approved documents |
| `PROC_003` | Document locked by another user | Wait for lock release |
| `PROC_004` | Invalid status transition | Check state diagram |
| `PROC_005` | Extraction in progress | Wait for completion |

### Extraction Errors

| Code | Message | Resolution |
|------|---------|------------|
| `EXT_001` | Extraction failed | Retry or manual entry |
| `EXT_002` | Unsupported file format | Convert to PDF |
| `EXT_003` | Page limit exceeded | Split document |
| `EXT_004` | AI provider unavailable | Try fallback provider |
| `EXT_005` | Low confidence extraction | Manual review required |

### Validation Errors

| Code | Message | Resolution |
|------|---------|------------|
| `VAL_001` | Missing required field | Fill in required field |
| `VAL_002` | Invalid date format | Use YYYY-MM-DD |
| `VAL_003` | Negative amount | Check amount sign |
| `VAL_004` | Line items don't sum | Reconcile totals |
| `VAL_005` | Invalid account code | Select valid account |

### Duplicate Errors

| Code | Message | Resolution |
|------|---------|------------|
| `DUP_001` | Potential duplicate detected | Make duplicate decision |
| `DUP_002` | Duplicate already processed | Check original document |
| `DUP_003` | Invalid duplicate decision | Choose valid decision |

---

## Appendix B: State Diagrams

### Document Status Flow

```
                    ┌──────────────┐
                    │   PENDING    │
                    └──────┬───────┘
                           │ trigger_extraction
                           ▼
                    ┌──────────────┐
              ┌─────│  PROCESSING  │─────┐
              │     └──────────────┘     │
        fail  │                          │ success
              ▼                          ▼
       ┌──────────────┐          ┌──────────────┐
       │    FAILED    │          │ NEEDS_REVIEW │
       └──────┬───────┘          └──────┬───────┘
              │ retry                   │ approve
              └─────────────────────────┼─────────┐
                                        ▼         │
                                 ┌──────────────┐ │
                          ┌──────│   APPROVED   │◀┘
                          │      └──────┬───────┘
                  unapprove            │ post
                          │             ▼
                          │      ┌──────────────┐
                          └─────▶│    POSTED    │
                                 └──────┬───────┘
                                        │ archive
                                        ▼
                                 ┌──────────────┐
                                 │   ARCHIVED   │
                                 └──────────────┘
```

### Duplicate Decision Flow

```
┌─────────────────┐
│ Document Upload │
└────────┬────────┘
         │
         ▼
┌─────────────────┐    No matches
│ Check Duplicates├────────────────▶ Continue
└────────┬────────┘
         │ Matches found
         ▼
┌─────────────────┐
│ Review Matches  │
└────────┬────────┘
         │
    ┌────┴────┬────────────┐
    ▼         ▼            ▼
┌───────┐ ┌───────┐   ┌───────────┐
│  DUP  │ │ NOT   │   │  VERSION  │
│       │ │ DUP   │   │           │
└───┬───┘ └───┬───┘   └─────┬─────┘
    │         │             │
    ▼         ▼             ▼
Archive   Continue      Replace
Current   Processing    Original
```

---

## Appendix C: Validation Issue Codes

### Field-Level Validation

| Code | Field | Severity | Message |
|------|-------|----------|---------|
| `FLD_001` | vendorName | error | Vendor name is required |
| `FLD_002` | invoiceNumber | warning | Invoice number missing |
| `FLD_003` | invoiceDate | error | Invalid date format |
| `FLD_004` | totalAmount | error | Total amount required |
| `FLD_005` | currency | warning | Currency not detected |
| `FLD_006` | accountCode | warning | Account code not assigned |

### Line Item Validation

| Code | Severity | Message |
|------|----------|---------|
| `LN_001` | error | Line items required |
| `LN_002` | warning | Line item missing description |
| `LN_003` | error | Invalid line amount |
| `LN_004` | warning | Account code not assigned |
| `LN_005` | info | Low confidence account |

### Document-Level Validation

| Code | Severity | Message |
|------|----------|---------|
| `DOC_001` | error | Line items don't sum to total |
| `DOC_002` | warning | Tax amount mismatch |
| `DOC_003` | info | Duplicate candidate exists |
| `DOC_004` | warning | Document date in future |

---

## Appendix D: Business Rules

### Invariants

1. **Immutable Extractions**
   - DocumentExtraction records are never updated
   - New extractions create new records

2. **Immutable Revisions**
   - DocumentRevision records are never updated
   - Edits create new revisions
   - Only one revision is `is_current = true`

3. **Tenant Isolation**
   - All queries filtered by tenantId
   - Cross-tenant access denied

4. **Approval Lock**
   - Approved documents cannot be edited
   - Must unapprove to edit

5. **Single Lock**
   - Only one user can lock a document
   - Lock expires after 30 minutes of inactivity

### Soft Delete Rules

- Deleted documents retained for 90 days
- Can be restored during retention period
- Permanent deletion by SUPER_ADMIN only

### Audit Requirements

All these actions are logged:
- Document upload
- Extraction triggered
- Revision created
- Approval/unapproval
- Duplicate decision
- Lock acquire/release
- Export to accounting

---

## Appendix E: Evidence Coordinate Contract

### Coordinate System

```
(0,0) ───────────────────────────▶ X (1.0)
  │
  │     ┌─────────────────┐
  │     │  x: 0.1         │
  │     │  y: 0.2         │
  │     │  width: 0.3     │
  │     │  height: 0.05   │
  │     └─────────────────┘
  │
  ▼
Y (1.0)
```

### Coordinate Normalization

| Property | Range | Description |
|----------|-------|-------------|
| page | 1-N | 1-indexed page number |
| x | 0.0-1.0 | Horizontal position from left |
| y | 0.0-1.0 | Vertical position from top |
| width | 0.0-1.0 | Box width as fraction |
| height | 0.0-1.0 | Box height as fraction |

### Rendering Formula

```javascript
// Convert normalized to pixels
const pixelX = normalizedX * pageWidth;
const pixelY = normalizedY * pageHeight;
const pixelWidth = normalizedWidth * pageWidth;
const pixelHeight = normalizedHeight * pageHeight;
```

---

## Appendix F: Duplicate Scoring

### Jaro-Winkler Algorithm

Used for fuzzy string matching:

```
similarity = jaro + (prefixLength * scalingFactor * (1 - jaro))
```

### Scoring Weights

| Field | Weight |
|-------|--------|
| Invoice Number | 0.30 |
| Vendor Name | 0.25 |
| Total Amount | 0.25 |
| Invoice Date | 0.20 |

### Score Interpretation

| Score | Classification |
|-------|----------------|
| >= 0.95 | Very likely duplicate |
| 0.90-0.95 | Probable duplicate |
| 0.85-0.90 | Possible duplicate |
| < 0.85 | Unlikely duplicate |

---

## Appendix G: Rate Limits

### API Limits

| Endpoint | Limit |
|----------|-------|
| Upload | 50 files/minute/tenant |
| Extract | 20 requests/minute/tenant |
| Bulk operations | 100 documents/request |

### AI Provider Limits

| Provider | Requests/min | Tokens/min |
|----------|--------------|------------|
| OpenAI | 60 | 90,000 |
| Anthropic | 50 | 100,000 |
| Google | 60 | 120,000 |
