# Document Generation - Implementation Notes

> **Last Updated**: 2025-01-12
> **Audience**: Developers

Implementation phases, design decisions, and technical notes.

## Related Documents

- [Overview](./OVERVIEW.md) - Module overview
- [Service Patterns](../../guides/SERVICE_PATTERNS.md) - Service layer conventions

---

## Implementation Status

| Phase | Component | Status |
|-------|-----------|--------|
| 1A | Database schema | Complete |
| 1A | Template service | Complete |
| 1A | Document generator service | Complete |
| 1A | PDF export service | Complete |
| 1A | Template management UI | Complete |
| 1A | Document generation UI | Complete |
| 1B | Share service | Complete |
| 1B | Public share pages | Complete |
| 1B | Comments system | Complete |
| 2 | AI assistance | Complete |
| 2 | Auto-save drafts | In Progress |

---

## Service Layer

### document-template.service.ts

```typescript
// Template CRUD
createTemplate(data, params: TenantAwareParams)
updateTemplate(id, data, params)
deleteTemplate(id, params)
getTemplateById(id, tenantId)
searchTemplates(query, params)
duplicateTemplate(id, params)

// Placeholder extraction
extractPlaceholders(content: string): Placeholder[]
```

### document-generator.service.ts

```typescript
// Document generation
createDocumentFromTemplate(templateId, companyId, placeholderData, params)
updateDocument(id, data, params)
finalizeDocument(id, params)
unfinalizeDocument(id, params)
cloneDocument(id, title, params)

// Placeholder resolution
resolvePlaceholders(content, company, contact, customData)
```

### document-export.service.ts

```typescript
// Export functions
exportToPDF(documentId, options, params)
exportToHTML(documentId, params)

// Letterhead
getLetterhead(tenantId)
updateLetterhead(data, params)
```

### document-share.service.ts

```typescript
// Share management
createShare(documentId, options, params)
getShareByToken(token)
accessShare(token, password?)
revokeShare(shareId, params)
recordView(shareId, ipAddress)
```

---

## Placeholder Resolution

### Resolution Order

1. Company data (from database)
2. Contact data (linked contacts)
3. Officer/shareholder data
4. Date/time values
5. Custom values (user-provided)

### Example Resolution

```typescript
const resolved = await resolvePlaceholders(template.content, {
  company,
  officers: company.officers,
  shareholders: company.shareholders,
  contact,
  custom: {
    meetingDate: '2025-01-15',
    resolutionNumber: 'BR-001'
  }
});
```

### Error Handling

Missing placeholders are highlighted in the output:
```html
<span class="placeholder-missing" data-placeholder="company.secretary">
  [MISSING: company.secretary]
</span>
```

---

## PDF Generation

### Technology

- **pdf-lib** for PDF creation
- **html2canvas** for HTML rendering
- **puppeteer** for complex layouts (optional)

### Letterhead Integration

```typescript
async function exportToPDF(documentId: string, options: PDFOptions) {
  const doc = await getDocument(documentId);
  const letterhead = options.includeLetterhead
    ? await getLetterhead(doc.tenantId)
    : null;

  const pdf = await createPDF();

  if (letterhead?.headerHtml) {
    pdf.addHeader(letterhead.headerHtml);
  }

  pdf.addContent(doc.content);

  if (letterhead?.footerHtml) {
    pdf.addFooter(letterhead.footerHtml, { pageNumbers: true });
  }

  return pdf.save();
}
```

---

## Security Considerations

### Share Token Generation

```typescript
import { randomBytes } from 'crypto';

function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}
```

- 256-bit random tokens
- URL-safe encoding
- Unique constraint in database

### Password Protection

```typescript
import { hashPassword, verifyPassword } from '@/lib/encryption';

// Store hashed password
const hash = hashPassword(password);

// Verify on access
const { isValid } = await verifyPassword(password, share.passwordHash);
```

### Rate Limiting

External comments are rate-limited:
- 20 comments per hour per IP address
- Tracked in `document_comments.ip_address`

---

## RBAC Integration

### New Permissions

| Permission | Description |
|------------|-------------|
| `template:create` | Create templates |
| `template:read` | View templates |
| `template:update` | Edit templates |
| `template:delete` | Delete templates |
| `generated_document:create` | Generate documents |
| `generated_document:read` | View documents |
| `generated_document:update` | Edit documents |
| `generated_document:delete` | Delete documents |
| `generated_document:finalize` | Finalize documents |
| `generated_document:share` | Create share links |
| `generated_document:export` | Export to PDF |

### Permission Checks

```typescript
// In API route
await requirePermission(session, 'template', 'create');

// In service
if (!await hasPermission(userId, 'generated_document', 'finalize', companyId)) {
  throw new Error('Permission denied');
}
```

---

## Audit Log Actions

| Action | Description |
|--------|-------------|
| `TEMPLATE_CREATED` | Template created |
| `TEMPLATE_UPDATED` | Template modified |
| `TEMPLATE_DELETED` | Template deleted |
| `DOCUMENT_GENERATED` | Document created from template |
| `DOCUMENT_UPDATED` | Document content edited |
| `DOCUMENT_FINALIZED` | Document locked |
| `DOCUMENT_UNFINALIZED` | Document unlocked |
| `DOCUMENT_EXPORTED` | PDF exported |
| `SHARE_CREATED` | Share link created |
| `SHARE_ACCESSED` | Share link accessed |
| `SHARE_REVOKED` | Share link revoked |
| `COMMENT_ADDED` | Comment added |
| `COMMENT_RESOLVED` | Comment resolved |

---

## Performance Considerations

### Caching

- Template content cached after first load
- Placeholder definitions cached
- PDF exports cached for 1 hour

### Large Documents

- Lazy load sections in preview
- Paginate document list (20 per page)
- Stream PDF download for large files

### Indexing

Ensure indexes on:
- `generated_documents.tenant_id`
- `generated_documents.company_id`
- `generated_documents.status`
- `document_shares.share_token`

---

## Dependencies

| Package | Purpose |
|---------|---------|
| pdf-lib | PDF creation |
| html2canvas | HTML to image |
| sanitize-html | HTML sanitization |
| nanoid | Token generation |
| date-fns | Date formatting |

---

## Design Decisions

### Why HTML for Templates?

- Rich formatting support
- Easy placeholder insertion
- Compatible with PDF generation
- Familiar to users

### Why Separate Finalize Step?

- Clear audit trail
- Prevents accidental edits after sharing
- Allows review workflow

### Why Soft Delete for Shares?

- Audit trail preservation
- Analytics on share usage
- Potential recovery

---

## Future Enhancements

- [ ] E-signature integration
- [ ] Workflow automation
- [ ] Version history for documents
- [ ] Collaborative editing
- [ ] Template marketplace
