# API Reference

> **Last Updated**: 2025-01-12
> **Audience**: Developers

This document provides a comprehensive reference for all API endpoints in the Oakcloud application.

## Related Documents

- [RBAC Guideline](../guides/RBAC_GUIDELINE.md) - Authentication and permissions
- [Database Schema](./DATABASE_SCHEMA.md) - Tables and relationships
- [Service Patterns](../guides/SERVICE_PATTERNS.md) - Service layer conventions

## Base URL

All API endpoints are prefixed with `/api/`.

## Authentication

Most endpoints require authentication via JWT token stored in an `auth-token` httpOnly cookie. Endpoints are protected based on user roles:

- **Public** - No authentication required
- **Authenticated** - Any logged-in user
- **TENANT_ADMIN** - Tenant administrator role
- **SUPER_ADMIN** - Super administrator role (cross-tenant access)

---

## Table of Contents

1. [Authentication](#authentication-endpoints)
2. [Tenants](#tenant-endpoints)
3. [Companies](#company-endpoints)
4. [Contacts](#contact-endpoints)
5. [Documents (Uploaded)](#uploaded-document-endpoints)
6. [Processing Documents](#processing-document-endpoints)
7. [Document Tags](#document-tags-endpoints)
8. [Document Templates](#document-template-endpoints)
9. [Template Partials](#template-partial-endpoints)
10. [Generated Documents](#generated-document-endpoints)
11. [Document Sharing](#document-sharing-endpoints)
12. [Connectors (AI)](#connector-endpoints)
13. [AI Features](#ai-endpoints)
14. [Audit Logs](#audit-log-endpoints)
15. [Exchange Rates](#exchange-rate-endpoints)
16. [Admin](#admin-endpoints)

---

## Authentication Endpoints

### POST /api/auth/login
Authenticate a user and create a session.

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "tenantId": "string | null",
    "isSuperAdmin": "boolean",
    "isTenantAdmin": "boolean"
  },
  "requiresPasswordChange": "boolean"
}
```

---

### POST /api/auth/logout
Log out the current user and clear session.

**Response:** `200 OK`
```json
{
  "success": true
}
```

---

### GET /api/auth/me
Get the current authenticated user's session.

**Response:** `200 OK`
```json
{
  "user": {
    "id": "string",
    "email": "string",
    "firstName": "string",
    "lastName": "string",
    "tenantId": "string | null",
    "isSuperAdmin": "boolean",
    "isTenantAdmin": "boolean",
    "companyIds": ["string"]
  }
}
```

---

### GET /api/auth/permissions
Get the current user's permissions.

**Response:** `200 OK`
```json
{
  "permissions": ["string"],
  "role": "string"
}
```

---

### POST /api/auth/change-password
Change the authenticated user's password.

**Request Body:**
```json
{
  "currentPassword": "string",
  "newPassword": "string",
  "confirmPassword": "string"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

### POST /api/auth/forgot-password
Request a password reset email.

**Request Body:**
```json
{
  "email": "string"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "If an account exists, a reset email has been sent"
}
```

---

### POST /api/auth/reset-password
Reset password using a token.

**Request Body:**
```json
{
  "token": "string",
  "password": "string",
  "confirmPassword": "string"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

---

## Tenant Endpoints

### GET /api/tenants
List all tenants. **SUPER_ADMIN only.**

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `query` (string, optional) - Search by name or slug

**Response:** `200 OK`
```json
{
  "tenants": [...],
  "total": "number",
  "page": "number",
  "limit": "number",
  "totalPages": "number"
}
```

---

### POST /api/tenants
Create a new tenant. **SUPER_ADMIN only.**

**Request Body:**
```json
{
  "name": "string",
  "slug": "string",
  "maxUsers": "number",
  "maxCompanies": "number"
}
```

---

### GET /api/tenants/[id]
Get a specific tenant.

---

### PUT /api/tenants/[id]
Update a tenant.

---

### DELETE /api/tenants/[id]
Soft-delete a tenant.

---

### GET /api/tenants/[id]/stats
Get tenant statistics (users, companies, documents count).

---

### POST /api/tenants/[id]/setup
Initial tenant setup (create admin user).

---

### GET /api/tenants/[id]/users
List users in a tenant. **TENANT_ADMIN or SUPER_ADMIN.**

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `query` (string, optional)
- `role` (string, optional)
- `company` (string, optional)
- `sortBy` (string, optional) - One of: `firstName`, `lastName`, `email`, `isActive`, `lastLoginAt`, `createdAt` (default: `createdAt`)
- `sortOrder` ('asc' | 'desc', default: 'desc')

---

### GET /api/tenants/[id]/users/[userId]
Get a specific user.

---

### PUT /api/tenants/[id]/users/[userId]
Update a user.

---

### DELETE /api/tenants/[id]/users/[userId]
Deactivate/delete a user.

---

### GET /api/tenants/[id]/roles
List roles in a tenant.

---

### POST /api/tenants/[id]/roles
Create a new role.

---

### GET /api/tenants/[id]/roles/[roleId]
Get a specific role.

---

### PUT /api/tenants/[id]/roles/[roleId]
Update a role.

---

### DELETE /api/tenants/[id]/roles/[roleId]
Delete a role.

---

### POST /api/tenants/[id]/roles/[roleId]/duplicate
Duplicate a role.

---

### GET /api/tenants/[id]/roles/[roleId]/users
List users assigned to a role.

---

## Company Endpoints

### GET /api/companies
List companies accessible to the user.

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `query` (string, optional) - Search by name, UEN, SSIC
- `entityType` (string, optional)
- `status` (string, optional)
- `sortBy` (string, default: 'name')
- `sortOrder` ('asc' | 'desc', default: 'asc')

---

### POST /api/companies
Create a new company.

**Request Body:**
```json
{
  "uen": "string",
  "name": "string",
  "entityType": "PRIVATE_LIMITED | PUBLIC_LIMITED | ...",
  "status": "LIVE | STRUCK_OFF | ...",
  "incorporationDate": "string (ISO date)",
  ...
}
```

---

### GET /api/companies/stats
Get company statistics for the tenant.

---

### GET /api/companies/[id]
Get a specific company with relations.

---

### PUT /api/companies/[id]
Update a company.

---

### DELETE /api/companies/[id]
Soft-delete a company.

**Request Body:**
```json
{
  "reason": "string"
}
```

---

### GET /api/companies/[id]/audit
Get audit logs for a company.

---

### GET /api/companies/[id]/links
Get link information (counts of officers, shareholders, etc.).

---

### GET /api/companies/[id]/documents
List documents uploaded for a company.

---

### GET /api/companies/[id]/officers/[officerId]
Get/update an officer.

---

### PUT /api/companies/[id]/officers/[officerId]
Update officer details.

**Request Body:**
```json
{
  "appointmentDate": "string (ISO date) | null",
  "cessationDate": "string (ISO date) | null"
}
```

---

### DELETE /api/companies/[id]/officers/[officerId]
Remove an officer (mark as ceased).

---

### GET /api/companies/[id]/shareholders/[shareholderId]
Get/update a shareholder.

---

### PUT /api/companies/[id]/shareholders/[shareholderId]
Update shareholder details.

---

### DELETE /api/companies/[id]/shareholders/[shareholderId]
Remove a shareholder.

---

### GET /api/companies/[id]/notes
List internal notes for a company.

---

### POST /api/companies/[id]/notes
Create an internal note.

---

### GET /api/companies/[id]/notes/[tabId]
Get notes for a specific tab.

---

### PUT /api/companies/[id]/notes/[tabId]
Update a note.

---

### DELETE /api/companies/[id]/notes/[tabId]
Delete a note.

---

### POST /api/companies/bulk
Bulk operations on companies.

---

## Contact Endpoints

### GET /api/contacts
List contacts.

---

### POST /api/contacts
Create a new contact.

---

### GET /api/contacts/[id]
Get a specific contact.

---

### PUT /api/contacts/[id]
Update a contact.

---

### DELETE /api/contacts/[id]
Soft-delete a contact.

---

### GET /api/contacts/[id]/audit
Get audit logs for a contact.

---

### GET /api/contacts/[id]/links
Get linked companies/officers/shareholders.

---

### GET /api/contacts/[id]/notes
List internal notes for a contact.

---

### POST /api/contacts/[id]/notes
Create an internal note.

---

### POST /api/contacts/bulk
Bulk operations on contacts.

---

## Uploaded Document Endpoints

### POST /api/documents/upload
Upload a document (BizFile, etc.).

**Request:** `multipart/form-data`
- `file`: The document file
- `companyId`: Target company ID
- `documentType`: Type of document

---

### GET /api/documents/[documentId]/confirm
Confirm document upload.

---

### POST /api/documents/[documentId]/extract
Extract data from document using AI.

---

### GET /api/documents/[documentId]/preview-diff
Preview differences between extracted data and current company data.

---

### POST /api/documents/[documentId]/apply-update
Apply extracted data to company.

---

### GET /api/companies/[id]/documents/[documentId]/extract
Extract data from a specific company's document.

---

## Processing Document Endpoints

### GET /api/processing-documents
List processing documents with filters and pagination.

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `sortBy` (string, default: `createdAt`)
- `sortOrder` ('asc' | 'desc', default: 'desc')
- `pipelineStatus` (string, optional) - Filter by pipeline status
- `duplicateStatus` (string, optional) - Filter by duplicate status
- `revisionStatus` (string, optional) - Filter by revision status
- `needsReview` (boolean, optional) - Needs review (draft, suspected duplicate, or warnings/invalid)
- `isContainer` (boolean, optional) - Filter by container/child type
- `companyId` (string, optional) - Filter by company
- `tenantId` (string, optional) - SUPER_ADMIN: tenant scope
- `uploadDatePreset` ('TODAY', optional) - Uses tenant timezone
- `uploadDateFrom` (string, optional) - `YYYY-MM-DD` or ISO datetime
- `uploadDateTo` (string, optional) - `YYYY-MM-DD` or ISO datetime
- `documentDateFrom` (string, optional) - `YYYY-MM-DD` or ISO datetime
- `documentDateTo` (string, optional) - `YYYY-MM-DD` or ISO datetime
- `search` (string, optional) - General search (file name, vendor name, document number)
- `vendorName` (string, optional)
- `documentNumber` (string, optional)
- `fileName` (string, optional)
- `tagIds` (string, optional) - Comma-separated tag IDs

---

### GET /api/processing-documents/navigation
Get prev/next navigation within a filtered processing document set (used by “Review Next” and detail page navigation).

**Query Parameters:**
- `filter` ('needs-review' | 'all', default: 'needs-review')
- `start` (boolean, default: false) - When true, returns the first item in the set
- `currentDocumentId` (string, required unless `start=true`)
- `companyId` (string, optional) - Filter by company
- `tenantId` (string, required for SUPER_ADMIN)

**Response:** `200 OK`
```json
{
  "total": "number",
  "currentIndex": "number",
  "currentDocumentId": "string | null",
  "prevId": "string | null",
  "nextId": "string | null"
}
```

---

### POST /api/processing-documents
Upload document for processing.

**Request:** `multipart/form-data`
- `file`: The document file (PDF, images)
- `companyId`: Target company ID

---

### GET /api/processing-documents/[id]
Get a specific processing document with current revision.

---

### GET /api/processing-documents/[id]/download
Download the original document file.

**Response:** Binary file stream with appropriate Content-Type and Content-Disposition headers.

---

### GET /api/processing-documents/[id]/export
Export document details to Excel.

**Query Parameters:**
- `includeLinked` (boolean, default: false) - Include linked documents in export

**Response:** Excel file (.xlsx) with two worksheets:
- **Document Headers**: File name, status, category, vendor, amounts, dates, etc.
- **Line Items**: Line items with parent document reference

---

### POST /api/processing-documents/bulk-download-zip
Bulk download multiple documents as a ZIP file.

**Request Body:**
```json
{
  "documentIds": ["string"]
}
```

**Response:** Binary ZIP file stream.

**Limits:** Maximum 100 documents per request.

---

### POST /api/processing-documents/bulk-export
Bulk export multiple documents to Excel.

**Request Body:**
```json
{
  "documentIds": ["string"]
}
```

**Response:** Excel file (.xlsx) with two worksheets:
- **Document Headers**: All selected documents' header information
- **Line Items**: All line items from selected documents

**Limits:** Maximum 100 documents per request.

---

### POST /api/processing-documents/bulk
Bulk operations on multiple documents.

**Request Body:**
```json
{
  "operation": "APPROVE | TRIGGER_EXTRACTION | DELETE",
  "documentIds": ["string"]
}
```

**Response:**
```json
{
  "results": [
    { "documentId": "string", "success": true },
    { "documentId": "string", "success": false, "error": "string" }
  ],
  "summary": {
    "total": "number",
    "succeeded": "number",
    "failed": "number"
  }
}
```

---

### POST /api/processing-documents/[id]/extract
Trigger AI field extraction.

---

### POST /api/processing-documents/[id]/lock
Acquire document lock for editing.

---

### POST /api/processing-documents/[id]/unlock
Release document lock.

---

### GET /api/processing-documents/[id]/revisions
Get revision history.

---

### POST /api/processing-documents/[id]/revisions
Create a new revision (manual edit).

---

### POST /api/processing-documents/[id]/revisions/[revId]/approve
Approve a revision.

---

### POST /api/processing-documents/[id]/duplicate-decision
Record duplicate decision.

**Request Body:**
```json
{
  "decision": "CONFIRMED | REJECTED",
  "duplicateOfId": "string (optional)"
}
```

---

## Document Template Endpoints

### GET /api/document-templates
List document templates.

---

### POST /api/document-templates
Create a new template.

**Request Body:**
```json
{
  "name": "string",
  "category": "string",
  "content": "string (HTML)",
  "placeholders": [...],
  "isActive": "boolean"
}
```

---

### GET /api/document-templates/stats
Get template statistics.

---

### GET /api/document-templates/[id]
Get a specific template.

---

### PUT /api/document-templates/[id]
Update a template.

---

### DELETE /api/document-templates/[id]
Delete a template.

---

### POST /api/document-templates/[id]/duplicate
Duplicate a template.

---

### POST /api/document-templates/[id]/test
Test template with sample data.

---

## Template Partial Endpoints

### GET /api/template-partials
List template partials (reusable content blocks).

---

### POST /api/template-partials
Create a new partial.

---

### GET /api/template-partials/[id]
Get a specific partial.

---

### PUT /api/template-partials/[id]
Update a partial.

---

### DELETE /api/template-partials/[id]
Delete a partial.

---

### POST /api/template-partials/[id]/duplicate
Duplicate a partial.

---

### GET /api/template-partials/[id]/usage
Get templates using this partial.

---

## Generated Document Endpoints

### GET /api/generated-documents
List generated documents.

---

### POST /api/generated-documents
Generate a new document from template.

**Request Body:**
```json
{
  "templateId": "string",
  "companyId": "string (optional)",
  "title": "string",
  "customData": {...}
}
```

---

### GET /api/generated-documents/stats
Get generated document statistics.

---

### POST /api/generated-documents/validate
Validate data before generation.

---

### POST /api/generated-documents/preview
Preview document without saving.

---

### GET /api/generated-documents/[id]
Get a specific generated document.

---

### PUT /api/generated-documents/[id]
Update a generated document (draft only).

---

### DELETE /api/generated-documents/[id]
Delete a generated document.

---

### POST /api/generated-documents/[id]/finalize
Finalize a document (make immutable).

---

### POST /api/generated-documents/[id]/clone
Clone a document.

---

### GET /api/generated-documents/[id]/draft
Get draft data.

---

### PUT /api/generated-documents/[id]/draft
Save draft data (auto-save).

---

### GET /api/generated-documents/[id]/export/pdf
Export document as PDF.

---

### GET /api/generated-documents/[id]/export/html
Export document as HTML.

---

### GET /api/generated-documents/[id]/comments
List comments on a document.

---

### POST /api/generated-documents/[id]/comments
Add a comment.

---

### PUT /api/generated-documents/comments/[commentId]
Update a comment.

---

### DELETE /api/generated-documents/comments/[commentId]
Delete a comment.

---

### GET /api/generated-documents/[id]/share
List shares for a document.

---

### POST /api/generated-documents/[id]/share
Create a share link.

**Request Body:**
```json
{
  "password": "string (optional)",
  "expiresAt": "string (ISO date, optional)",
  "allowComments": "boolean",
  "allowedActions": ["view", "download", "comment"]
}
```

---

## Document Sharing Endpoints

### GET /api/document-shares
List all document shares.

---

### GET /api/share/[token]
Access a shared document.

---

### POST /api/share/[token]/verify
Verify password for protected share.

**Request Body:**
```json
{
  "password": "string"
}
```

---

### GET /api/share/[token]/pdf
Download shared document as PDF.

---

### GET /api/share/[token]/comments
List comments on shared document.

---

### POST /api/share/[token]/comments
Add comment to shared document.

---

### PUT /api/share/[token]/comments/[commentId]
Update comment on shared document.

---

### DELETE /api/share/[token]/comments/[commentId]
Delete comment on shared document.

---

## Connector Endpoints

### GET /api/connectors
List AI connectors (OpenAI, Google, etc.).

---

### POST /api/connectors
Create a new connector.

**Request Body:**
```json
{
  "provider": "openai | google | anthropic",
  "name": "string",
  "apiKey": "string",
  "isActive": "boolean"
}
```

---

### GET /api/connectors/[id]
Get a specific connector.

---

### PUT /api/connectors/[id]
Update a connector.

---

### DELETE /api/connectors/[id]
Delete a connector.

---

### POST /api/connectors/[id]/test
Test connector connection.

---

### GET /api/connectors/[id]/access
Check connector access permissions.

---

### GET /api/connectors/[id]/usage
Get usage statistics for a connector.

---

## AI Endpoints

### GET /api/ai/models
List available AI models.

---

### POST /api/ai/document-chat
Chat with AI about a document.

**Request Body:**
```json
{
  "documentId": "string",
  "message": "string",
  "conversationId": "string (optional)"
}
```

---

### GET /api/ai/conversations
List AI conversations.

---

## Audit Log Endpoints

### GET /api/audit-logs
List audit logs. **TENANT_ADMIN or SUPER_ADMIN.**

**Query Parameters:**
- `page` (number)
- `limit` (number)
- `entityType` (string, optional)
- `action` (string, optional)
- `userId` (string, optional)
- `companyId` (string, optional)
- `startDate` (string, optional)
- `endDate` (string, optional)

---

### GET /api/audit-logs/stats
Get audit log statistics.

---

## Exchange Rate Endpoints

### GET /api/admin/exchange-rates
List exchange rates with filters. **TENANT_ADMIN or SUPER_ADMIN.**

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 50)
- `tenantId` (string, optional) - Filter by tenant
- `sourceCurrency` (string, optional) - Filter by source currency code
- `startDate` (string, optional) - Filter from date (ISO format)
- `endDate` (string, optional) - Filter to date (ISO format)
- `source` (string, optional) - One of: `ALL`, `SYSTEM`, `MANUAL` (default: `ALL`)
- `includeSystem` (boolean, default: true) - Include system-level rates
- `sortBy` (string, optional) - One of: `sourceCurrency`, `rate`, `rateDate`, `rateType`, `createdAt` (default: `rateDate`)
- `sortOrder` ('asc' | 'desc', default: 'desc')

**Response:** `200 OK`
```json
{
  "rates": [...],
  "total": "number",
  "page": "number",
  "limit": "number",
  "totalPages": "number"
}
```

---

### POST /api/admin/exchange-rates
Create a manual rate override. **TENANT_ADMIN or SUPER_ADMIN.**

**Request Body:**
```json
{
  "sourceCurrency": "string",
  "targetCurrency": "string (default: SGD)",
  "rate": "number",
  "rateDate": "string (ISO date)",
  "tenantId": "string (optional, SUPER_ADMIN only)"
}
```

**Response:** `201 Created`

---

## Admin Endpoints

### POST /api/admin/purge
Purge soft-deleted data. **SUPER_ADMIN only.**

---

### GET /api/permissions
List all available permissions.

---

### GET /api/users/[id]/companies
List companies a user has access to.

---

### PUT /api/users/[id]/companies
Update user's company assignments.

---

## User Preference Endpoints

### GET /api/user-preferences
Get a single user preference value.

**Query Parameters:**
- `key` (string, required)

---

### PUT /api/user-preferences
Upsert a user preference value.

**Request Body:**
```json
{
  "key": "string",
  "value": "any JSON"
}
```

---

### GET /api/letterhead
Get tenant letterhead configuration.

---

### PUT /api/letterhead
Update tenant letterhead.

---

## Error Responses

All endpoints return standard error responses:

### 400 Bad Request
```json
{
  "error": "Validation error message"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "An error occurred. Please try again."
}
```

---

## Rate Limiting

Some endpoints have rate limiting:
- `/api/auth/login` - 5 attempts per minute
- `/api/auth/forgot-password` - 3 requests per hour
- `/api/share/[token]/comments` - Configurable per share

Rate limit headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)

---

## Pagination

Paginated endpoints return:

```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

---

## Document Tags Endpoints

The Document Tags API supports a hybrid scope system with tenant-level (shared) tags and company-level tags.

### GET /api/tags
Get all tenant (shared) tags.

**Auth:** Authenticated

**Response:** `200 OK`
```json
{
  "tags": [{
    "id": "string",
    "name": "string",
    "color": "GRAY|RED|ORANGE|YELLOW|GREEN|BLUE|PURPLE|PINK",
    "description": "string|null",
    "usageCount": "number",
    "lastUsedAt": "string|null",
    "createdAt": "string",
    "companyId": "null",
    "scope": "tenant"
  }]
}
```

---

### POST /api/tags
Create a tenant (shared) tag.

**Auth:** TENANT_ADMIN or SUPER_ADMIN

**Request Body:**
```json
{
  "name": "string",
  "color": "GRAY|RED|ORANGE|YELLOW|GREEN|BLUE|PURPLE|PINK",
  "description": "string (optional)"
}
```

**Response:** `201 Created`

---

### PATCH /api/tags/:tagId
Update a tenant (shared) tag.

**Auth:** TENANT_ADMIN or SUPER_ADMIN

**Request Body:**
```json
{
  "name": "string (optional)",
  "color": "TagColor (optional)",
  "description": "string|null (optional)"
}
```

**Response:** `200 OK`

---

### DELETE /api/tags/:tagId
Delete a tenant (shared) tag.

**Auth:** TENANT_ADMIN or SUPER_ADMIN

**Response:** `200 OK`

---

### GET /api/tags/available
Get combined available tags (tenant tags + company tags if companyId provided).

**Auth:** Authenticated

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| companyId | string | Optional - include company-specific tags |
| query | string | Optional - search tags by name |
| recent | boolean | Optional - get recently used tags (limit 5) |
| limit | number | Optional - max results (default: 20, max: 100) |

**Response:** `200 OK`
```json
{
  "tags": [{
    "id": "string",
    "name": "string",
    "color": "TagColor",
    "companyId": "string|null",
    "scope": "tenant|company"
  }]
}
```

---

### GET /api/companies/:id/tags
Get company-specific tags (excludes tenant tags).

**Auth:** Authenticated with company access

**Response:** `200 OK`

---

### POST /api/companies/:id/tags
Create a company-specific tag.

**Auth:** Authenticated with company access

**Request Body:**
```json
{
  "name": "string",
  "color": "TagColor (optional)",
  "description": "string (optional)"
}
```

**Response:** `201 Created`

---

### POST /api/processing-documents/:documentId/tags
Add a tag to a processing document.

**Auth:** Authenticated with company access

**Request Body:**
```json
{
  "tagId": "string"
}
```
or create and add in one call:
```json
{
  "name": "string",
  "color": "TagColor (optional)"
}
```

**Response:** `201 Created`

---

### DELETE /api/processing-documents/:documentId/tags/:tagId
Remove a tag from a processing document.

**Auth:** Authenticated with company access

**Response:** `200 OK`

---

*Last updated: December 2024*

---

**Changelog:**
- Added Document Tags endpoints with hybrid scope support (tenant + company tags)
- Added Processing Documents section with bulk download ZIP and Excel export endpoints
- Added single document export endpoint with linked documents option
- Added sorting parameters (`sortBy`, `sortOrder`) to Users endpoint
- Added Exchange Rates endpoints with sorting support
