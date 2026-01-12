# Service Layer Patterns

> **Last Updated**: 2025-01-12
> **Audience**: Developers

This document describes the service layer architecture, patterns, and conventions used in Oakcloud.

## Related Documents

- [Architecture](../ARCHITECTURE.md) - System design overview
- [RBAC Guideline](./RBAC_GUIDELINE.md) - Permission patterns
- [Audit Logging](./AUDIT_LOGGING.md) - Change tracking
- [Database Schema](../reference/DATABASE_SCHEMA.md) - Tables and relationships

## Overview

The service layer (`src/services/`) contains all business logic, separated from API routes and UI components. Services handle:
- Data validation and transformation
- Database operations via Prisma
- Audit logging
- Multi-tenancy enforcement
- External integrations (AI, file storage)

## Directory Structure

```
src/services/
├── bizfile/                    # BizFile extraction module
│   ├── types.ts                # Type definitions
│   └── index.ts                # Re-exports
├── company/                    # Company management module
│   ├── types.ts                # Type definitions
│   └── index.ts                # Re-exports
├── document-generation/        # Document generation module
│   ├── types.ts                # Type definitions
│   ├── interfaces.ts           # Interface contracts
│   ├── implementations.ts      # Factory implementations
│   └── index.ts                # Re-exports
├── bizfile.service.ts          # BizFile extraction (main)
├── company.service.ts          # Company CRUD (main)
├── contact.service.ts          # Contact management
├── document-generator.service.ts # Document generation (main)
├── document-export.service.ts  # PDF/HTML export
├── document-template.service.ts # Template management
├── document-validation.service.ts # Pre-generation validation
├── document-comment.service.ts # Document comments
├── password.service.ts         # Password reset/change
├── tenant.service.ts           # Tenant management
├── user-company.service.ts     # User-company assignments
└── template-partial.service.ts # Reusable template blocks
```

## Core Patterns

### 1. Tenant-Aware Parameters

All service functions that access tenant-scoped data must accept `TenantAwareParams`:

```typescript
import type { TenantAwareParams } from '@/lib/types';

export async function createCompany(
  data: CreateCompanyInput,
  params: TenantAwareParams
): Promise<Company> {
  const { tenantId, userId } = params;
  // tenantId is used for data isolation
  // userId is used for audit logging
}
```

### 2. Audit Logging

All create/update/delete operations must be audit logged:

```typescript
import { createAuditLog, computeChanges } from '@/lib/audit';

// For updates, compute changes
const changes = computeChanges(existing, data, TRACKED_FIELDS);

await createAuditLog({
  tenantId,
  userId,
  companyId: company.id,
  action: 'UPDATE',
  entityType: 'Company',
  entityId: company.id,
  entityName: company.name,
  summary: `Updated company "${company.name}"`,
  changeSource: 'MANUAL', // or 'BIZFILE', 'API', 'SYSTEM'
  changes,
  reason, // Optional: reason for the change
});
```

### 3. Soft Deletion

Entities use soft deletion with `deletedAt` timestamp:

```typescript
export async function deleteCompany(
  id: string,
  params: TenantAwareParams,
  reason: string
): Promise<Company> {
  const company = await prisma.company.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedReason: reason,
    },
  });
  // Audit log the deletion
}
```

### 4. Error Handling

Services throw errors that are caught by API routes:

```typescript
// Service throws descriptive errors
if (!existing) {
  throw new Error('Company not found');
}

if (existing.deletedAt) {
  throw new Error('Company is already deleted');
}

// API route catches and formats response
try {
  const result = await someService(data, params);
  return NextResponse.json(result);
} catch (error) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
  }
  log.error('Operation failed:', safeErrorMessage(error));
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'An error occurred' },
    { status: 500 }
  );
}
```

### 5. Safe Logging

Use the safe logger pattern to avoid exposing sensitive data:

```typescript
import { createLogger, safeErrorMessage } from '@/lib/logger';

const log = createLogger('service-name');

// Good - only logs error message
log.error('Operation failed:', safeErrorMessage(error));

// Bad - may expose sensitive data
console.error('Operation failed:', error);
```

## Module Organization

### Module Structure

Large services are organized into modules with this structure:

```typescript
// types.ts - Type definitions
export interface CompanyWithRelations extends Company {
  addresses?: Array<{...}>;
  officers?: Array<{...}>;
  // ...
}

export interface GetCompanyOptions {
  includeDeleted?: boolean;
  skipTenantFilter?: boolean;
}

export const TRACKED_COMPANY_FIELDS: (keyof Company)[] = [
  'name', 'uen', 'status', // ...
];

// index.ts - Re-exports
export * from './types';
export {
  createCompany,
  updateCompany,
  deleteCompany,
  // ...
} from '../company.service';
```

### Interface-Based Design (Document Generation)

The document generation module uses interfaces for clean workflow integration:

```typescript
// interfaces.ts
export interface IDocumentGenerator {
  generate(params: GenerateDocumentParams): Promise<GeneratedDocument>;
  preview(params: PreviewDocumentParams): Promise<PreviewResult>;
  finalize(tenantId: string, userId: string, documentId: string): Promise<GeneratedDocument>;
  // ...
}

export interface IDocumentExporter {
  toPDF(params: ExportPDFParams): Promise<PDFResult>;
  toHTML(params: ExportHTMLParams): Promise<HTMLResult>;
}

export interface IDocumentPublisher {
  publish(params: PublishParams): Promise<DocumentShare>;
  access(token: string, password?: string): Promise<ShareAccessResult | null>;
  revoke(tenantId: string, userId: string, shareId: string): Promise<void>;
}

// implementations.ts
export function getDocumentGenerator(): IDocumentGenerator {
  // Returns singleton instance
}

export function getDocumentExporter(): IDocumentExporter {
  // Returns singleton instance
}
```

## Service Categories

### 1. Company Services

**company.service.ts** - Core company CRUD operations:
- `createCompany()` - Create a new company
- `updateCompany()` - Update company details
- `deleteCompany()` / `restoreCompany()` - Soft delete/restore
- `getCompanyById()` / `getCompanyByUen()` - Retrieve companies
- `searchCompanies()` - Search with pagination
- `getCompanyStats()` - Statistics
- `updateOfficer()` / `removeOfficer()` - Officer management
- `updateShareholder()` / `removeShareholder()` - Shareholder management

### 2. Document Services

**document-template.service.ts** - Template management:
- `createTemplate()` / `updateTemplate()` / `deleteTemplate()`
- `getTemplateById()` / `searchTemplates()`
- `duplicateTemplate()`

**document-generator.service.ts** - Document generation:
- `createDocumentFromTemplate()` - Generate document
- `finalizeDocument()` / `unfinalizeDocument()` - Lifecycle
- `cloneDocument()` - Duplicate a document

**document-export.service.ts** - Export functionality:
- `exportToPDF()` - Generate PDF with optional letterhead
- `exportToHTML()` - Generate clean HTML

**document-validation.service.ts** - Pre-generation validation:
- `validateForGeneration()` - Check if all required data is available
- `extractSections()` - Extract document sections from HTML

**document-comment.service.ts** - Comments and collaboration:
- `createComment()` / `updateComment()` / `deleteComment()`
- `getCommentsForDocument()`
- `checkCommentRateLimit()`

### 3. AI/Extraction Services

**bizfile.service.ts** - BizFile document extraction:
- `extractBizFileWithVision()` - Extract using AI vision
- `normalizeExtractedData()` - Normalize to database format
- `generateBizFileDiff()` - Compare with existing data
- `processBizFileExtraction()` - Apply changes to database

### 4. User/Auth Services

**password.service.ts** - Password management:
- `sendPasswordResetEmail()`
- `resetPasswordWithToken()`
- `changePassword()`
- `checkPasswordStrength()`

**user-company.service.ts** - Multi-company access:
- `getUserCompanyAssignments()`
- `updateUserCompanyAssignments()`

**tenant.service.ts** - Tenant management:
- `createTenant()` / `updateTenant()` / `deleteTenant()`
- `getTenantById()` / `searchTenants()`
- `getTenantStats()`

## Database Query Patterns

### Tenant Filtering

Always include tenant filtering for data isolation:

```typescript
const company = await prisma.company.findFirst({
  where: {
    id,
    tenantId,  // Always include tenant filter
    deletedAt: null,  // Exclude soft-deleted
  },
});
```

### Skip Tenant Filter (SUPER_ADMIN Only)

For cross-tenant operations, use `skipTenantFilter`:

```typescript
export interface GetCompanyOptions {
  skipTenantFilter?: boolean;  // ONLY for SUPER_ADMIN
}

export async function getCompanyById(
  id: string,
  tenantId: string | null,
  options: GetCompanyOptions = {}
): Promise<Company | null> {
  const { skipTenantFilter = false } = options;

  // Require tenantId unless explicitly skipping
  if (!tenantId && !skipTenantFilter) {
    throw new Error('tenantId is required for company queries');
  }

  const where: Prisma.CompanyWhereInput = { id };
  if (tenantId && !skipTenantFilter) {
    where.tenantId = tenantId;
  }
  // ...
}
```

### Include Relations

Use consistent relation includes:

```typescript
const company = await prisma.company.findFirst({
  where: { id, tenantId },
  include: {
    addresses: {
      where: { isCurrent: true },
      select: { id: true, addressType: true, fullAddress: true },
    },
    officers: {
      where: { isCurrent: true },
      orderBy: { appointmentDate: 'desc' },
    },
    shareholders: {
      where: { isCurrent: true },
      orderBy: { numberOfShares: 'desc' },
    },
    _count: {
      select: { documents: true, officers: true },
    },
  },
});
```

## Validation

### Input Validation with Zod

Use Zod schemas for input validation:

```typescript
// src/lib/validations/company.ts
import { z } from 'zod';

export const createCompanySchema = z.object({
  uen: z.string().min(1).max(20),
  name: z.string().min(1).max(255),
  entityType: z.enum(['PRIVATE_LIMITED', 'PUBLIC_LIMITED', ...]),
  // ...
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
```

### Query Parameter Validation

Use reusable query param schemas:

```typescript
// src/lib/validations/query-params.ts
import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(n => Math.min(Number(n), 100)).optional().default('20'),
});

export function safeParseQueryParams<T extends z.ZodSchema>(
  searchParams: URLSearchParams,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const params = Object.fromEntries(searchParams.entries());
  return schema.safeParse(params);
}
```

## Testing

### Unit Testing Services

```typescript
import { describe, it, expect, vi } from 'vitest';
import { extractSections } from '@/services/document-validation.service';

describe('Document Validation Service', () => {
  describe('extractSections', () => {
    it('should extract h1 sections from HTML', () => {
      const html = '<h1>Title</h1><p>Content</p>';
      const sections = extractSections(html);

      expect(sections).toHaveLength(1);
      expect(sections[0].title).toBe('Title');
      expect(sections[0].level).toBe(1);
    });
  });
});
```

### Mocking Prisma

```typescript
vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
```

## Best Practices

1. **Single Responsibility** - Each service handles one domain
2. **Tenant Isolation** - Always filter by tenantId
3. **Audit Everything** - Log all data changes
4. **Safe Errors** - Never expose internal details in errors
5. **Type Safety** - Use TypeScript interfaces for all inputs/outputs
6. **Transactions** - Use `prisma.$transaction()` for multi-step operations
7. **Validation** - Validate inputs before processing
8. **Logging** - Use structured logging with `createLogger()`

---

*Last updated: December 2024*
