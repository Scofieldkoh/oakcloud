# Document Processing - UI Components

> **Last Updated**: 2025-01-12
> **Audience**: Developers

UI components and patterns for the Document Processing module.

## Related Documents

- [Overview](./OVERVIEW.md) - Module overview
- [Design Guideline](../../guides/DESIGN_GUIDELINE.md) - UI design system

---

## Page Structure

### Processing List (`/processing`)

- **Header**: Title, company selector, stats summary
- **Filters**: Status tabs, date range, document type, search
- **Table**: Multi-select, sortable columns
- **Bulk Actions**: Toolbar for selected items
- **Pagination**: Standard pagination

### Document Detail (`/processing/[id]`)

- **Left Panel**: Document page viewer (PDF/image)
- **Right Panel**: Data editor
  - Header fields
  - Line items table
  - Revision history
- **Footer**: Action buttons (Approve, Save, etc.)

---

## Key Components

### DocumentPageViewer

PDF/image viewer with zoom and navigation.

```tsx
<DocumentPageViewer
  documentId={id}
  pages={pages}
  currentPage={currentPage}
  onPageChange={setCurrentPage}
  zoom={zoom}
  highlights={evidenceHighlights}
/>
```

**Features:**
- Zoom controls (fit, 50%-200%)
- Page navigation
- Evidence bounding box highlights
- Click to link field to evidence

### LineItemEditor

Editable table for line items.

```tsx
<LineItemEditor
  items={lineItems}
  onChange={setLineItems}
  accounts={chartOfAccounts}
  validationIssues={issues}
/>
```

**Features:**
- Add/remove/reorder rows
- Auto-calculate amounts
- Account code dropdown
- Inline validation display
- Keyboard navigation

### RevisionHistory

Timeline of document revisions.

```tsx
<RevisionHistory
  revisions={revisions}
  currentRevisionId={currentId}
  onRevert={handleRevert}
/>
```

### DuplicateDecisionDialog

Modal for handling duplicate candidates.

```tsx
<DuplicateDecisionDialog
  document={document}
  candidate={candidate}
  similarityScore={score}
  onDecision={handleDecision}
/>
```

**Options:**
- Mark as duplicate (archive current)
- Mark as version (replace previous)
- Not a duplicate (keep both)

### ApprovalDialog

Confirmation dialog for approval.

```tsx
<ApprovalDialog
  document={document}
  validationIssues={issues}
  onApprove={handleApprove}
/>
```

**Shows:**
- Document summary
- Any validation warnings
- Reason input field

### BulkActionsToolbar

Toolbar for bulk operations.

```tsx
<BulkActionsToolbar
  selectedIds={selectedIds}
  onApprove={handleBulkApprove}
  onExtract={handleBulkExtract}
  onArchive={handleBulkArchive}
/>
```

---

## Evidence Highlighting

### Coordinate Contract

Evidence uses normalized coordinates (0-1 range):

```typescript
interface BoundingBox {
  page: number;      // 1-indexed page number
  x: number;         // Left position (0-1)
  y: number;         // Top position (0-1)
  width: number;     // Width (0-1)
  height: number;    // Height (0-1)
}
```

### Highlight Display

```tsx
<EvidenceHighlight
  bbox={field.evidence}
  color="blue"
  label={field.label}
  onClick={() => scrollToField(field)}
/>
```

### Field-to-Evidence Linking

Click a field to highlight its source in the document:

```tsx
<FieldInput
  label="Invoice Number"
  value={invoiceNumber}
  evidence={evidenceMap.invoiceNumber}
  onFocusEvidence={() => highlightEvidence(evidenceMap.invoiceNumber)}
/>
```

---

## Status Indicators

### Status Badge

```tsx
<StatusBadge status={document.status} />
```

| Status | Color | Icon |
|--------|-------|------|
| PENDING | Gray | Clock |
| PROCESSING | Blue | Spinner |
| NEEDS_REVIEW | Yellow | AlertCircle |
| APPROVED | Green | CheckCircle |
| POSTED | Purple | Upload |
| FAILED | Red | XCircle |

### Confidence Score

```tsx
<ConfidenceIndicator score={0.85} />
```

| Score | Display |
|-------|---------|
| >= 0.9 | Green "High" |
| 0.7-0.9 | Yellow "Medium" |
| < 0.7 | Red "Low" |

---

## Validation Display

### Field Validation

```tsx
<FieldWithValidation
  label="Total Amount"
  value={totalAmount}
  issue={issues.find(i => i.field === 'totalAmount')}
/>
```

### Validation Summary

```tsx
<ValidationSummary
  issues={issues}
  onNavigate={(issue) => scrollToField(issue.field)}
/>
```

Issue types:
- **Error**: Must fix before approval
- **Warning**: Review recommended
- **Info**: Informational

---

## Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| Desktop (>1200px) | Side-by-side viewer + editor |
| Tablet (768-1200px) | Stacked layout, collapsible viewer |
| Mobile (<768px) | Tab-based navigation between viewer/editor |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save changes |
| `Ctrl+Enter` | Approve document |
| `Tab` | Next field |
| `Shift+Tab` | Previous field |
| `Ctrl+N` | Add line item |
| `Ctrl+D` | Delete line item |
| `Page Up/Down` | Navigate pages |
| `+/-` | Zoom in/out |

---

## Loading States

```tsx
// Document loading
<DocumentSkeleton />

// Extraction in progress
<ExtractionProgress
  status="extracting"
  progress={45}
  message="Analyzing page 2 of 5..."
/>

// Bulk operation progress
<BulkProgress
  total={10}
  completed={7}
  currentItem="INV-2025-001"
/>
```

---

## Error States

```tsx
// Extraction failed
<ExtractionError
  error={error}
  onRetry={handleRetry}
/>

// Document not found
<EmptyState
  icon={FileX}
  title="Document not found"
  action={<Button onClick={goToList}>Back to List</Button>}
/>

// No documents
<EmptyState
  icon={Inbox}
  title="No documents to process"
  description="Upload documents to get started"
  action={<Button onClick={openUpload}>Upload</Button>}
/>
```
