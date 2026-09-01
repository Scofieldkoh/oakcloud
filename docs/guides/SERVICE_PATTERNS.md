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

// implementations.ts
export function getDocumentGenerator(): IDocumentGenerator {
  // Returns singleton instance
}

export function getDocumentExporter(): IDocumentExporter {
  // Returns singleton instance
}
```

## Service administration ownership

- Catalog mutations live at `/admin/services` and require Tenant Admin/Super Admin.
- Company-scoped client-service selection continues through the Company Services APIs.
- `ServiceFamily.displayColor` is the shared table/calendar/filter color.
- Company service labels use `getCompanyDisplayLabel`; callers must not reimplement initials.
- Deadline and billing schedules reuse the shared schedule engine introduced by the later plans.

## Deadline reconciliation operations

- `Workspace.settings.servicesWorkspace.enabled` controls the operational page.
- `Workspace.settings.servicesWorkspace.deadlineWritesEnabled` or
  `DEADLINE_OCCURRENCE_WRITES_ENABLED=true` enables materialization; these
  controls use boolean-OR semantics, so an explicit tenant `false` does not
  override the environment rollout flag.
- Observation mode computes impact summaries without writing cycles or deadlines.
- The scheduler task ID is `service-schedule-reconciliation` and runs each minute.
- Failed requests retain only stable public error codes/messages and retry
  according to the 1/5/15/60/240-minute schedule; arbitrary dependency text is
  discarded rather than persisted.
- A daily `ROLLING_HORIZON` request extends materialization to 12 months from the Singapore date.
- Reconciliation requests are tenant-scoped and lease-owned. Operators recover
  abandoned work by allowing expired leases to be reclaimed by the next minute's
  scheduler pass; persistent safe error codes and warning counts remain on the
  request for administrator follow-up.
- Roster and deadline list responses include `Server-Timing: app;dur=...` and
  `X-Response-Time-Ms` headers without changing their DTOs, status codes, cache,
  or authorization behavior.
- Emit exactly one structured, redacted reconciliation event per request with
  tenant/request/correlation IDs, duration, counts, warnings, attempt, and write
  mode. Never include uploaded company documents, notes, rule wording, secrets,
  or other free-text content in that event.

## Billing tracking and reconciliation

Billing is tracking-only. A `BillingOccurrence` records an expected or
externally recorded billing item; Oakcloud does not issue invoices, collect
payments, or post to an accounting ledger. `BILLED` means that a user recorded
external billing and does not assert that an Oakcloud invoice exists.

- Existing client services migrate to `UNREVIEWED`. Coverage reconciliation
  keeps them visible as an actionable issue until the service is explicitly
  `CONFIGURED` (with valid active fee lines) or `NOT_REQUIRED` (with a reason).
  `Configured` services with missing fee lines, start dates, schedule
  parameters, amount/currency, or rolling occurrences remain issues rather
  than receiving guessed values.
- The billed date is optional. `markedBilledAt` and `markedBilledById` are the
  immutable lifecycle audit timestamps/actor for a Billed transition; the
  optional external billed date may remain null.
- Amount and currency edits require an explicit `THIS_OCCURRENCE` or
  `THIS_AND_FUTURE` scope. Current-and-future propagation updates the selected
  occurrence plus matching future `OPEN` rows only. Historical, Billed,
  Waived, Cancelled, overridden, and unrelated fee-line rows are preserved.
- Persisted fee-line removal is archival, not destructive deletion. The
  occurrence keeps its fee-line lineage; reconciliation cancels eligible
  future Open occurrences for removed/archived lines and preserves historical
  and non-Open records. Re-enabling a configuration uses a new generation key.
- Repeatable billing schedules use the shared schedule-entry language for every
  service family, not only Payroll. Multiple stable entries—including relative
  dates, business-day offsets, and multiple entries in a `ONE_TIME` schedule—
  each materialize once per applicable period. Entry keys are stable across
  reorder and are part of occurrence identity.
- Creation and service-agreement activation reconciliation also materialize the
  first configured billing period when its start date is already historical.
  This is a bounded initial catch-up for the new service; ordinary rolling
  reconciliation still evaluates only from the current date through the
  12-month horizon and does not backfill unlimited history.
- Manual historical deadline cycles have origin `MANUAL_TRIGGER` and never
  enqueue billing reconciliation or create billing occurrences. The shared
  worker processes only durable schedule-reconciliation requests, so a manual
  cycle can be applied without a billing side effect.
- The Billing tab keeps reconciliation collapsed by default. It renders issue
  cards only for unresolved configuration gaps and a single compact healthy
  summary when no issues exist; it does not render a success card per service.

### Billing recovery runbook

Reconciliation requests are tenant-scoped, idempotent, leased, and retried with
the shared bounded backoff. Each request emits one structured, redacted event
with billing created/recalculated/cancelled/preserved counts, coverage
opened/resolved counts, missing-disposition services, invalid schedules,
occurrence gaps, duration, attempt, tenant, request/correlation IDs, and
`OBSERVE`/`APPLY` mode. Logs contain identifiers and safe codes only; notes,
external references, uploaded files, and other customer free text are never
included.

For a safe rerun:

1. Inspect the request status, attempt count, lease expiry, safe error code,
   coverage issue totals, and the oldest pending request. Do not edit or delete
   occurrence history to make a request pass.
2. Let an expired lease be reclaimed by the scheduler, or use the existing
   tenant/service reconcile action to enqueue a deduplicated request. Run in
   `OBSERVE` mode first when reviewing a configuration change.
3. Correct the reported disposition, fee-line, schedule, amount/currency, or
   access-scope issue. Re-run `APPLY` after the configuration is valid; stable
   identities and uniqueness constraints make retries safe and prevent duplicate
   occurrences.
4. Confirm created/recalculated/cancelled/preserved counts, coverage opened/
   resolved counts, and that future Open cancellation/propagation did not alter
   historical, Billed, Waived, Cancelled, or overridden rows.

The two billing migrations are additive. On a clean rollout, apply the full
migration chain, verify legacy fee amounts/currencies, confirm deterministic
frequencies have no invented dates, inspect explicit Custom/missing-start
coverage issues, and verify one deduplicated `BILLING_BACKFILL` request per
active tenant. Backfill/reconciliation may be rerun against the same isolated
tenant because schedule and request identities are deterministic.

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

**service-catalog/service.ts** - Service offering setup:
- `listServiceCatalog()` / `getSelectableServiceVariants()`
- Family and variant create/update/archive operations
- Same-tenant active SOW partial validation
- Transactional fee-template replacement
- `ServiceFamily` and `ServiceVariant` audit records

Generation-facing selectable reads continue to derive the workspace from the
authenticated session and never accept a caller-supplied tenant ID.

Catalog codes are normalized before service calls and uniqueness is enforced
inside tenant scope. All catalog lookups include both `tenantId` and
`deletedAt: null`, including nested variants and linked partials; fee reads are
also tenant-filtered. Archives set `deletedAt` rather than removing records.
Partial deletion checks both textual template use and non-deleted
service-variant links. Partial deletion, service-variant creation, and variant
relinking use the same retryable serializable transaction protocol. Each retry
revalidates the partial's non-deleted state and usage predicates, so a
concurrent operation cannot leave a non-deleted variant linked to a
soft-deleted partial. The partial soft delete and its audit record are written
through the same transaction client.

Material version rules are deliberately narrower than normal metadata updates:

- `TemplatePartial.version` increments only for normalized content or serialized
  placeholder changes.
- `ServiceVariant.version` increments once when name, SOW partial link,
  cadence/custom label, or the complete fee-template set changes.
- Audit metadata records old/new versions for material updates.
- Catalog mutations and their audit records share one transaction. Material
  version updates use retryable serializable transactions and record the
  transaction's actual returned version.

The public `ServiceVariantDto` serializes decimals as strings and includes the
linked partial version/placeholders plus ordered fee defaults. Stage 2 treats
this DTO as the catalog snapshot input, resolves `service.*` placeholders, and
copies fee templates into entity-specific agreement rows.

The PostgreSQL lifecycle concurrency suite is
`__tests__/integration/service-partial-lifecycle.postgres.test.ts`. Set
`TEST_DATABASE_URL` to an isolated database with the current Prisma schema
before running it; the suite creates and removes only its own tenant-scoped
fixtures.

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

## Service Agreement draft and generation patterns

- Store one `ServiceAgreement` beside the active generated-document draft.
  Store entity name/UEN and authorised-representative snapshots so later
  source-record edits do not rewrite saved agreements.
- Pin the selected variant version, linked partial version, recursively
  expanded partial content, placeholder definitions, and dependency versions
  on every item. Do not query current catalog wording while previewing or
  generating a saved draft.
- Every fee line references both one agreement item and one agreement entity.
  Group-total fees are not supported. Serialize database decimals as
  fixed-point strings at the service boundary.
- Assemble `serviceSections`, `feeTable`, and `entityAppendix` exactly once,
  in that order, before normal template partial and placeholder resolution.
  A SOW receives only its local `service` context.
- Normalize inline typography in pinned SOW wording when assembling
  `serviceSections`: always drop `font-family` and `line-height`, and drop
  `font-size` only when it matches the partial editor's default (11pt,
  including pixel equivalents) so the wording inherits the master template's
  global font settings. Preserve deliberate per-text sizes (e.g. footnotes),
  list structure and indentation (margins/padding), numbering classes,
  bold/italic/underline tags, colors, and alignment.
- Mirror the selected template's `contentJson` layout (font family/size, line
  spacing, page margins) onto generation-session drafts on create and update,
  so previews, edits, and exports respect the template's global settings even
  before final generation.
- Refresh wording only through the optimistic version-checked refresh route.
  Preserve dates, entity assignments, fields, and fees during refresh.
- Full-editor changes affect document HTML only. Display the divergence warning
  and direct operational-data changes back to the Services stage.

## Client Service activation and editing patterns

- Create operational Services through signed agreement activation or manual
  company-scoped creation. Agreement activation upserts exactly one
  `ClientService` per agreement-item/company pair and copies only the fee lines
  owned by that agreement entity. Manual creation requires `company:update`,
  never `document:read`, and accepts only the server-owned catalog identity.
- Treat `source`, `serviceVariantId`, `agreementId`, and `agreementItemId` as
  immutable; exclude them from update schemas and update data. A later
  agreement activation that matches a manual service creates a separate
  `AGREEMENT` row without converting or updating the manual record.
- Treat the signed agreement and pinned SOW snapshots as legal authority.
  Client Service DTOs and editors may expose identity labels, status, cadence,
  dates, field values, and fee rows, but never legal clause content.
- Apply `company:read` to list/detail access and `company:update` to editing and
  archiving. Retry and manual activation additionally require `document:update`
  plus `company:update` for every agreement entity; return this complete retry
  capability to the UI instead of inferring it from the current company.
- Serve manual catalog options from a minimal company-scoped projection that
  includes only active, non-archived variants, families, linked SOW partials,
  operational `service.fields.*` definitions, and fee templates. SOW `required`
  metadata is advisory for manual creation: missing catalog fields and
  additional operational fields are accepted within shared limits.
- Warn on likely duplicates using a non-archived
  `(tenant, company, serviceVariantId, exact startDate)` predicate inside the
  serializable creation transaction, and require an explicit
  `confirmDuplicate: true` override to proceed. Return at most five newest
  summaries with the full total; rejected requests create no service, fee, or
  audit rows, and no reason is required for an override.
- Queue E-sign activation in the envelope completion transaction, then process
  after commit without allowing worker failure to fail signature completion.
- Claim work with `FOR UPDATE SKIP LOCKED`, a unique claim token, a five-minute
  lease, 1/5/15/60 minute backoff, and a five-attempt limit. Success, failure,
  retry, and manual queue transitions compare the observed state and claim;
  stale workers exit without overwriting newer state. Explicit retry resets a
  failed draft agreement to pending.
- The activation task inherits `SCHEDULER_ENABLED` and polls every minute by
  default. `SCHEDULER_SERVICE_AGREEMENT_ACTIVATION_CRON` may override cadence.
- Preserve an existing automatic effective date. When absent, derive it from
  envelope completion in `Asia/Singapore`, never from worker execution time.
- Operational PATCH requests include `updatedAt`; stale editors receive HTTP
  409 before fee replacement. Mutation and audit writes share one transaction.
- Audit every operational mutation. Use `SYSTEM` for automatic activation and
  retain actor, dates, and reason for manual activation. Never include field
  values or signed wording in audit summaries.
- Persist only stable public activation errors with correlation references;
  detailed exceptions remain in restricted server logs.
- Restore catalog parents before agreements and Client Services; delete Client
  Service fee children first during tenant cleanup.
- Render source-aware cards and editor copy: manual services never reference a
  nonexistent agreement, and agreement services keep their generated-document
  link. Do not add a source filter.
- Use stable error codes for the create workflow: `VALIDATION_ERROR` with
  field-addressable details, `DUPLICATE_CLIENT_SERVICE` with the top-level
  `duplicates` body, and `CLIENT_SERVICE_WRITE_CONFLICT` with
  `details: { retriable: true }` after exhausted serialization retries. Never
  infer duplicates from message text.

The controlled initial content is installed explicitly and remains inactive:

```powershell
npm.cmd run db:seed-service-agreement -- --tenantId <uuid> --userId <uuid>
```

The command is idempotent, verifies tenant membership, and does not print legal
wording or personal data. A content owner must review the wording and rendered
PDF before activating the template, families, or variants.

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

---

## Deadline Occurrence Repair Runbook

Incorrect deadline occurrences produced before the canonical projection fix
(see \docs/superpowers/plans/2026-08-27-deadline-preview-reconciliation-repair.md\)
are corrected with the fingerprint-gated maintenance command
\
pm run repair:deadlines\. It is dry-run by default and only bypasses
Historical preservation for explicitly selected client services on
\OPEN\, \RULE\, non-overridden occurrences.

### Prerequisites

1. Confirm the deployed application version contains the projection fix
   before repairing any data.
2. Take a database backup using the repository's existing backup procedure.
3. Identify the exact tenant and client-service IDs with read-only queries,
   e.g.:

\\\sql
-- Tenant ID for a workspace slug
SELECT id FROM workspaces WHERE slug = :workspaceSlug;

-- Client services for a company (parameterized)
SELECT cs.id, cs.service_name, cs.status
FROM client_services cs
WHERE cs.tenant_id = :tenantId AND cs.company_id = :companyId;
\\\

### Dry run

\\\powershell
npm.cmd run repair:deadlines -- --tenant-id <uuid> --client-service-id <uuid> --client-service-id <uuid> --reason "Correct 2026 annual source alignment"
\\\

The command prints JSON containing every \CREATE\, \RECALCULATE\,
\CANCEL\, and \PRESERVE\ action plus the fingerprint. Archive this output
securely and review every action before applying. A dry run performs no
writes.

### Apply

\\\powershell
npm.cmd run repair:deadlines -- --tenant-id <uuid> --client-service-id <uuid> --apply --expected-fingerprint <sha256> --actor-id <uuid> --reason "Correct 2026 annual source alignment"
\\\

Rules:

- \--tenant-id\, at least one \--client-service-id\, and a reason of at
  least 10 characters are mandatory.
- \--apply\ additionally requires \--expected-fingerprint\ (the exact
  dry-run fingerprint) and \--actor-id\.
- At most 25 service IDs per invocation; duplicate IDs are rejected.
- A changed preview aborts the apply with \IMPACT_CHANGED\ before any write.
- One audit entry per client service records the operator, reason, counts, and
  occurrence before/after snapshots.

### Verification

1. Query open rule-generated occurrences for the repaired service and confirm
   one row per canonical identity:

\\\sql
SELECT sc.period_key, do.milestone_key, do.operative_due_date, do.status
FROM deadline_occurrences do
JOIN service_cycles sc ON sc.id = do.cycle_id
WHERE do.tenant_id = :tenantId
  AND do.client_service_id = :clientServiceId
  AND do.origin = 'RULE'
  AND do.status = 'OPEN'
ORDER BY do.operative_due_date;
\\\

2. Confirm protected rows (Completed, Waived, Cancelled, Manual Trigger,
   overridden) are unchanged.
3. Confirm audit rows exist for the repair:

\\\sql
SELECT id, entity_id, action, reason, metadata, created_at
FROM audit_logs
WHERE tenant_id = :tenantId AND entity_type = 'ClientService'
ORDER BY created_at DESC LIMIT 10;
\\\

4. Rerun the dry run and require zero \CREATE\, \RECALCULATE\, and
   \CANCEL\ actions (idempotency).

### Rollback

If verification fails, restore the database backup taken before the repair.
Do not hand-edit protected lifecycle rows.

### Canary rollout order

1. Deploy code with canonical projection and editor preview.
2. Keep the deadline worker enabled; no data repair yet.
3. Verify a new/edited test service produces exact preview/apply parity.
4. Run the remediation dry run for the selected services.
5. Obtain human review of the dry-run actions.
6. Apply one service first as a canary.
7. Verify UI, database tuples, audit, and idempotent second dry run.
8. Apply the remaining selected services.
9. Monitor reconciliation errors and unexpected preserve/cancel counts for at
   least one scheduler interval.

---

*Last updated: December 2024*
