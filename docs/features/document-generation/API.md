# Document Generation - API Reference

> **Last Updated**: 2025-01-12
> **Audience**: Developers

API endpoints for the Document Generation module.

## Related Documents

- [Overview](./OVERVIEW.md) - Module overview
- [API Reference (Full)](../../reference/API_REFERENCE.md) - Complete API reference

---

## Templates

### List Templates

```
GET /api/templates
```

**Query Parameters:**
- `category` - Filter by category
- `search` - Search by name
- `page`, `limit` - Pagination

**Response:**
```json
{
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 50 }
}
```

### Get Template

```
GET /api/templates/:id
```

### Create Template

```
POST /api/templates
Content-Type: application/json

{
  "name": "Board Resolution",
  "category": "RESOLUTION",
  "content": "<h1>{{company.name}}</h1>...",
  "description": "Standard board resolution template"
}
```

### Update Template

```
PATCH /api/templates/:id
```

### Delete Template

```
DELETE /api/templates/:id
```

---

## Template Partials

### List Partials

```
GET /api/template-partials
```

### Create Partial

```
POST /api/template-partials
```

### Update Partial

```
PATCH /api/template-partials/:id
```

### Delete Partial

```
DELETE /api/template-partials/:id
```

---

## Generated Documents

### List Documents

```
GET /api/generated-documents
```

**Query Parameters:**
- `status` - Filter by status (DRAFT, FINALIZED, ARCHIVED)
- `companyId` - Filter by company
- `templateId` - Filter by template
- `search` - Search by title

### Get Document

```
GET /api/generated-documents/:id
```

### Create Document

```
POST /api/generated-documents
Content-Type: application/json

{
  "templateId": "uuid",
  "companyId": "uuid",
  "title": "Board Resolution - AGM 2025",
  "placeholderData": {
    "meetingDate": "2025-01-15",
    "resolutionNumber": "BR-001"
  }
}
```

### Update Document

```
PATCH /api/generated-documents/:id
Content-Type: application/json

{
  "content": "<h1>Updated content...</h1>",
  "title": "New Title"
}
```

### Finalize Document

```
POST /api/generated-documents/:id/finalize
```

Locks the document for sharing/export. Returns error if already finalized.

### Unfinalize Document

```
POST /api/generated-documents/:id/unfinalize
```

Unlocks a finalized document for editing. Creates audit trail.

### Delete Document

```
DELETE /api/generated-documents/:id
```

### Clone Document

```
POST /api/generated-documents/:id/clone
Content-Type: application/json

{
  "title": "Copy of Board Resolution"
}
```

---

## Document Validation

### Validate for Generation

```
POST /api/generated-documents/validate
Content-Type: application/json

{
  "templateId": "uuid",
  "companyId": "uuid"
}
```

**Response:**
```json
{
  "isValid": false,
  "missingData": [
    { "field": "company.registeredAddress", "label": "Registered Address" }
  ],
  "warnings": [
    { "field": "company.officers", "message": "No directors found" }
  ]
}
```

---

## Export

### Export to PDF

```
POST /api/generated-documents/:id/export/pdf
Content-Type: application/json

{
  "includeLetterhead": true,
  "pageSize": "A4"
}
```

**Response:** PDF file download

### Export to HTML

```
GET /api/generated-documents/:id/export/html
```

**Response:** Clean HTML content

---

## Sharing

### Create Share Link

```
POST /api/generated-documents/:id/shares
Content-Type: application/json

{
  "expiresInHours": 72,
  "password": "optional-password",
  "allowedActions": ["view", "download"],
  "allowComments": true
}
```

**Response:**
```json
{
  "id": "uuid",
  "shareToken": "abc123...",
  "shareUrl": "https://app.example.com/share/abc123...",
  "expiresAt": "2025-01-15T00:00:00Z"
}
```

### List Shares

```
GET /api/generated-documents/:id/shares
```

### Revoke Share

```
DELETE /api/shares/:shareId
```

### Access Shared Document (Public)

```
GET /api/share/:token
```

**Query Parameters:**
- `password` - If password-protected

---

## Comments

### List Comments

```
GET /api/generated-documents/:id/comments
```

### Create Comment (Internal)

```
POST /api/generated-documents/:id/comments
Content-Type: application/json

{
  "content": "Please review section 3",
  "selectionStart": 150,
  "selectionEnd": 200,
  "selectedText": "the resolution was passed"
}
```

### Create Comment (External via Share)

```
POST /api/share/:token/comments
Content-Type: application/json

{
  "guestName": "John Doe",
  "guestEmail": "john@example.com",
  "content": "Looks good to me"
}
```

### Resolve Comment

```
POST /api/comments/:id/resolve
```

### Delete Comment

```
DELETE /api/comments/:id
```

---

## Letterhead

### Get Tenant Letterhead

```
GET /api/letterhead
```

### Update Tenant Letterhead

```
PUT /api/letterhead
Content-Type: application/json

{
  "headerHtml": "<div>...</div>",
  "footerHtml": "<div>Page {{page}}</div>",
  "pageMargins": { "top": 25, "right": 20, "bottom": 25, "left": 20 },
  "isEnabled": true
}
```

### Upload Letterhead Image

```
POST /api/letterhead/upload
Content-Type: multipart/form-data

file: <image file>
type: "header" | "footer" | "logo"
```

---

## Authentication

All endpoints require authentication except:
- `GET /api/share/:token` - Public access to shared documents
- `POST /api/share/:token/comments` - External comments

**Required Role**: Authenticated user with appropriate permissions.
