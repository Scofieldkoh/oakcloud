# Client Services and Signed Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert signed Service Agreement selections into editable, audited company Services records through an idempotent retryable activation workflow.

**Architecture:** Keep signed agreement selections immutable in the Service Agreement tables and copy only operational identity, cadence, dates, field values, and entity-specific fees into `ClientService`. E-sign completion queues activation without blocking signature completion; the existing scheduler claims pending agreements with a lease and retries safely under unique constraints.

**Tech Stack:** Prisma 7/PostgreSQL, TypeScript 5.7, Zod 3, existing e-signing and scheduler modules, Next.js route handlers, React 19, TanStack Query 5, Oakcloud audit/backup/RBAC services, Vitest 4, Playwright 1.61.

## Global Constraints

- Complete the catalog-foundation and agreement-generation plans first.
- Create exactly one `ClientService` for each Service Agreement item/entity pairing.
- Copy only operational data; never copy or expose the legal SOW clause as a Client Service field.
- Every `ClientServiceFeeLine` belongs to one company Service; group-total fees do not exist.
- Operational Services are fully editable after activation, with audit records for every mutation.
- Operational edits never update agreement snapshots or generated/signed document content.
- E-sign completion must succeed even if Service activation later fails.
- Activation is idempotent under duplicate completion events, process crashes, scheduler overlap, and manual retry.
- Use `company:read` to view Services and `company:update` to edit/archive them.
- Automatic activation uses system change source; manual activation records the actor, signed/effective dates, and reason.
- Soft-deleted companies remain referentially valid; their signed agreement may activate, but their Services tab is unavailable until the company is restored.
- Preserve all existing task e-signing preparation and PDF-generation scheduler behavior.

---

### Task 1: Add operational Service and activation schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260730110000_client_services_activation/migration.sql`
- Create: `__tests__/services/client-service-schema.test.ts`

**Interfaces:**
- Produces `ClientService`, `ClientServiceFeeLine`, activation enums, and claim/retry fields on `ServiceAgreement`.

- [ ] **Step 1: Write the failing schema contract test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('client service activation schema', () => {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('defines idempotent entity-level operational services', () => {
    expect(schema).toContain('enum ClientServiceStatus');
    expect(schema).toContain('enum ServiceAgreementActivationStatus');
    expect(schema).toContain('model ClientService');
    expect(schema).toContain('model ClientServiceFeeLine');
    expect(schema).toContain('@@unique([agreementItemId, companyId])');
    expect(schema).toContain('activationStatus ServiceAgreementActivationStatus');
  });
});
```

- [ ] **Step 2: Run the schema test**

```powershell
npx.cmd vitest run __tests__/services/client-service-schema.test.ts
```

Expected: FAIL because operational models and activation state are absent.

- [ ] **Step 3: Add exact Prisma contracts**

```prisma
enum ClientServiceStatus {
  ACTIVE
  PAUSED
  ENDED
}

enum ServiceAgreementActivationStatus {
  NOT_READY
  PENDING
  PROCESSING
  COMPLETED
  FAILED_RETRYABLE
  FAILED_PERMANENT
}

enum ServiceAgreementActivationSource {
  ESIGNING
  MANUAL
}

model ClientService {
  id                   String               @id @default(uuid())
  tenantId             String               @map("tenant_id")
  companyId            String               @map("company_id")
  agreementId          String               @map("agreement_id")
  agreementItemId      String               @map("agreement_item_id")
  serviceVariantId     String               @map("service_variant_id")
  familyName           String               @map("family_name") @db.VarChar(200)
  serviceName          String               @map("service_name") @db.VarChar(200)
  status               ClientServiceStatus  @default(ACTIVE)
  serviceCadence       ServiceCadence       @map("service_cadence")
  customCadenceLabel   String?              @map("custom_cadence_label") @db.VarChar(100)
  startDate            DateTime             @map("start_date") @db.Date
  endDate              DateTime?            @map("end_date") @db.Date
  fieldValues          Json                 @default("{}") @map("field_values")
  createdAt            DateTime             @default(now()) @map("created_at")
  updatedAt            DateTime             @updatedAt @map("updated_at")
  deletedAt            DateTime?            @map("deleted_at")
  deletedReason        String?              @map("deleted_reason")
  tenant               Workspace            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  company              Company              @relation(fields: [companyId], references: [id], onDelete: Restrict)
  agreement            ServiceAgreement     @relation(fields: [agreementId], references: [id], onDelete: Restrict)
  agreementItem        ServiceAgreementItem @relation(fields: [agreementItemId], references: [id], onDelete: Restrict)
  serviceVariant       ServiceVariant       @relation(fields: [serviceVariantId], references: [id], onDelete: Restrict)
  feeLines             ClientServiceFeeLine[]

  @@unique([agreementItemId, companyId])
  @@index([tenantId, companyId, status, deletedAt])
  @@index([tenantId, agreementId])
  @@index([serviceVariantId])
  @@map("client_services")
}

model ClientServiceFeeLine {
  id                       String                  @id @default(uuid())
  tenantId                 String                  @map("tenant_id")
  clientServiceId          String                  @map("client_service_id")
  sourceAgreementFeeLineId String?                 @map("source_agreement_fee_line_id")
  description              String                  @db.VarChar(500)
  amount                   Decimal                 @db.Decimal(18, 2)
  currency                 String                  @default("SGD") @db.VarChar(3)
  billingFrequency         BillingFrequency        @map("billing_frequency")
  customFrequencyLabel     String?                 @map("custom_frequency_label") @db.VarChar(100)
  billingStartDate         DateTime?               @map("billing_start_date") @db.Date
  displayOrder             Int                     @default(0) @map("display_order")
  createdAt                DateTime                @default(now()) @map("created_at")
  updatedAt                DateTime                @updatedAt @map("updated_at")
  tenant                   Workspace               @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  clientService            ClientService           @relation(fields: [clientServiceId], references: [id], onDelete: Cascade)
  sourceAgreementFeeLine   ServiceAgreementFeeLine? @relation(fields: [sourceAgreementFeeLineId], references: [id], onDelete: SetNull)

  @@unique([clientServiceId, sourceAgreementFeeLineId])
  @@index([tenantId, clientServiceId, displayOrder])
  @@map("client_service_fee_lines")
}
```

Extend `ServiceAgreement`:

```prisma
activationStatus       ServiceAgreementActivationStatus @default(NOT_READY) @map("activation_status")
activationSource       ServiceAgreementActivationSource? @map("activation_source")
activationAttemptCount Int                              @default(0) @map("activation_attempt_count")
activationAvailableAt  DateTime?                        @map("activation_available_at")
activationClaimedAt    DateTime?                        @map("activation_claimed_at")
activationLeaseExpiresAt DateTime?                      @map("activation_lease_expires_at")
activationLastError    String?                          @map("activation_last_error")
activationRequestedById String?                         @map("activation_requested_by_id")
activationReason       String?                          @map("activation_reason") @db.VarChar(1000)
activationRequestedBy  User?                            @relation("ServiceAgreementActivationRequester", fields: [activationRequestedById], references: [id], onDelete: SetNull)
clientServices         ClientService[]
```

Add these exact inverse relations:

```prisma
// Workspace
clientServices         ClientService[]
clientServiceFeeLines  ClientServiceFeeLine[]

// Company
clientServices ClientService[]

// ServiceVariant
clientServices ClientService[]

// ServiceAgreementItem
clientServices ClientService[]

// ServiceAgreementFeeLine
clientServiceFeeLines ClientServiceFeeLine[]

// User
requestedServiceAgreementActivations ServiceAgreement[] @relation("ServiceAgreementActivationRequester")
```

Existing draft agreements receive `NOT_READY`.

- [ ] **Step 4: Generate Prisma and rerun the schema test**

```powershell
npm.cmd run db:generate
npx.cmd vitest run __tests__/services/client-service-schema.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit schema**

```powershell
git add prisma/schema.prisma prisma/migrations/20260730110000_client_services_activation/migration.sql src/generated/prisma __tests__/services/client-service-schema.test.ts
git commit -m "feat(services): add client service activation schema"
```

### Task 2: Define Client Service validation and DTOs

**Files:**
- Create: `src/lib/validations/client-service.ts`
- Create: `src/services/client-service/types.ts`
- Create: `src/services/client-service/index.ts`
- Test: `__tests__/lib/client-service-validation.test.ts`

**Interfaces:**
- Produces `ClientServiceDto`, list filters, update schema, archive schema, and manual activation schema.

- [ ] **Step 1: Write failing validation tests**

```ts
it('requires custom labels and valid date order', () => {
  expect(updateClientServiceSchema.safeParse({
    serviceCadence: 'CUSTOM',
    customCadenceLabel: null,
  }).success).toBe(false);

  expect(updateClientServiceSchema.safeParse({
    startDate: '2026-08-01',
    endDate: '2026-07-31',
  }).success).toBe(false);
});

it('requires an audit reason for manual activation', () => {
  expect(markServiceAgreementEffectiveSchema.safeParse({
    signedAt: '2026-07-30T00:00:00.000Z',
    effectiveDate: '2026-07-30',
    reason: 'External',
  }).success).toBe(false);
});
```

- [ ] **Step 2: Run validation tests**

```powershell
npx.cmd vitest run __tests__/lib/client-service-validation.test.ts
```

Expected: FAIL because the schemas do not exist.

- [ ] **Step 3: Implement exact validation**

```ts
export const clientServiceFeeLineInputSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(500),
  amount: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  billingFrequency: billingFrequencySchema,
  customFrequencyLabel: z.string().trim().min(1).max(100).nullable().optional(),
  billingStartDate: z.string().date().nullable().optional(),
  displayOrder: z.number().int().min(0),
});

export const updateClientServiceSchema = z.object({
  familyName: z.string().trim().min(1).max(200).optional(),
  serviceName: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ENDED']).optional(),
  serviceCadence: serviceCadenceSchema.optional(),
  customCadenceLabel: z.string().trim().min(1).max(100).nullable().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().nullable().optional(),
  fieldValues: z.record(z.string().max(10_000)).optional(),
  feeLines: z.array(clientServiceFeeLineInputSchema).min(1).max(100).optional(),
}).superRefine(validateCadenceAndDates);

export const markServiceAgreementEffectiveSchema = z.object({
  signedAt: z.string().datetime(),
  effectiveDate: z.string().date(),
  reason: z.string().trim().min(10).max(1000),
});
```

`ClientServiceDto` includes service/agreement IDs, display names, dates, status, cadence, field values, fixed-point fee strings, agreement title/status/link, created/updated timestamps, and no SOW content.

- [ ] **Step 4: Run validation tests**

```powershell
npx.cmd vitest run __tests__/lib/client-service-validation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit contracts**

```powershell
git add src/lib/validations/client-service.ts src/services/client-service/types.ts src/services/client-service/index.ts __tests__/lib/client-service-validation.test.ts
git commit -m "feat(services): define client service contracts"
```

### Task 3: Implement operational Client Service queries and editing

**Files:**
- Create: `src/services/client-service/service.ts`
- Modify: `src/services/client-service/index.ts`
- Test: `__tests__/services/client-service.service.test.ts`

**Interfaces:**
- Produces company-scoped list/get/update/archive functions.
- Does not create Services manually; activation is the only first-release creation path.

- [ ] **Step 1: Write failing service tests**

```ts
it('updates operational fees without mutating agreement fees', async () => {
  await updateClientService(service.id, {
    feeLines: [{
      id: fee.id,
      description: 'Revised annual fee',
      amount: '650.00',
      currency: 'SGD',
      billingFrequency: 'ANNUALLY',
      billingStartDate: '2026-07-30',
      displayOrder: 0,
    }],
  }, actor);

  expect(prismaMock.clientServiceFeeLine.deleteMany).toHaveBeenCalled();
  expect(prismaMock.serviceAgreementFeeLine.update).not.toHaveBeenCalled();
  expect(createAuditLogMock).toHaveBeenCalledWith(expect.objectContaining({
    entityType: 'ClientService',
    action: 'UPDATE',
  }));
});
```

Cover tenant filtering, company filtering, status/date validation against persisted values, fixed decimal serialization, soft archive reason, and no legal content in DTOs.

- [ ] **Step 2: Run service tests**

```powershell
npx.cmd vitest run __tests__/services/client-service.service.test.ts
```

Expected: FAIL because services do not exist.

- [ ] **Step 3: Implement exact service methods**

```ts
export async function listCompanyServices(
  companyId: string,
  input: SearchClientServicesInput,
  params: TenantAwareParams,
): Promise<{ services: ClientServiceDto[]; total: number }>;

export async function getClientService(
  id: string,
  params: TenantAwareParams,
): Promise<ClientServiceDto>;

export async function updateClientService(
  id: string,
  input: UpdateClientServiceInput,
  params: TenantAwareParams,
): Promise<ClientServiceDto>;

export async function archiveClientService(
  id: string,
  reason: string,
  params: TenantAwareParams,
): Promise<{ id: string; archived: true }>;
```

Use an interactive transaction to update the Service and replace submitted fee lines. Validate merged start/end and cadence/custom-label values, not only submitted fields. Audit tracked changes plus fee summaries; do not put `fieldValues` contents or signed wording in audit summaries.

- [ ] **Step 4: Run service tests**

```powershell
npx.cmd vitest run __tests__/services/client-service.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit operational services**

```powershell
git add src/services/client-service __tests__/services/client-service.service.test.ts
git commit -m "feat(services): manage operational client services"
```

### Task 4: Implement idempotent agreement activation

**Files:**
- Create: `src/services/service-agreement/activation.service.ts`
- Modify: `src/services/service-agreement/index.ts`
- Test: `__tests__/services/service-agreement-activation.service.test.ts`

**Interfaces:**
- Produces queue, claim, single-activation, batch-processing, manual request, and retry methods.

- [ ] **Step 1: Write failing activation tests**

```ts
it('creates one client service per item/entity and copies only matching fees', async () => {
  const result = await processServiceAgreementActivation(agreement.id);
  expect(result).toEqual({ status: 'completed', clientServiceCount: 2 });
  expect(prismaMock.clientService.upsert).toHaveBeenCalledTimes(2);
  expect(prismaMock.clientServiceFeeLine.createMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.arrayContaining([
      expect.objectContaining({ amount: new Prisma.Decimal('500.00') }),
    ]),
  }));
});

it('is idempotent after a repeated completion event', async () => {
  await processServiceAgreementActivation(agreement.id);
  await processServiceAgreementActivation(agreement.id);
  expect(await countClientServices()).toBe(expectedPairCount);
});
```

Cover stale lease recovery, retry backoff, max attempts, manual metadata, finalizing the generated document, and transaction rollback.

- [ ] **Step 2: Run activation tests**

```powershell
npx.cmd vitest run __tests__/services/service-agreement-activation.service.test.ts
```

Expected: FAIL because activation does not exist.

- [ ] **Step 3: Implement queue and manual request contracts**

```ts
export async function queueServiceAgreementActivationsForEnvelope(
  tx: Prisma.TransactionClient,
  envelopeId: string,
  completedAt: Date,
): Promise<number>;

export async function requestManualServiceAgreementActivation(
  agreementId: string,
  input: MarkServiceAgreementEffectiveInput,
  params: TenantAwareParams,
): Promise<ServiceAgreementActivationDto>;

export async function retryServiceAgreementActivation(
  agreementId: string,
  params: TenantAwareParams,
): Promise<ServiceAgreementActivationDto>;
```

Queue only DRAFT agreements linked through `EsigningEnvelopeDocument.generatedDocumentId`. Set `activationStatus=PENDING`, `activationSource=ESIGNING`, `signedAt=completedAt`, `activationAvailableAt=now`, and clear previous claim/error fields.

Manual request requires a DRAFT agreement, `document:update`, and update access to every included company. Save signed/effective dates and the reason, set source `MANUAL`, and queue once. If the generated document is still DRAFT and has no unresolved-template metadata, finalize it during successful activation.

- [ ] **Step 4: Implement claimed activation**

```ts
export async function processServiceAgreementActivation(
  agreementId: string,
): Promise<
  | { status: 'completed'; clientServiceCount: number }
  | { status: 'already-completed'; clientServiceCount: number }
  | { status: 'retryable-failure'; error: string }
>;

export async function processQueuedServiceAgreementActivations(options?: {
  limit?: number;
  concurrency?: number;
  leaseMs?: number;
}): Promise<{ claimed: number; completed: number; failed: number }>;
```

Follow `src/services/tasks/esigning-preparation.service.ts`:

- Claim `PENDING`, `FAILED_RETRYABLE`, or expired `PROCESSING` rows with `FOR UPDATE SKIP LOCKED`.
- Default batch limit 10, concurrency 2, lease 5 minutes.
- Backoff after failure: 1, 5, 15, 60 minutes.
- After five attempts, mark `FAILED_PERMANENT`.
- Store only sanitized error messages.

Inside the activation transaction:

1. Reload the agreement/items/entities/fee lines under tenant scope.
2. For each unique item/entity link, upsert `ClientService` by `[agreementItemId, companyId]`.
3. Copy item snapshot identity/cadence/dates/fields and only fee lines for that agreement entity.
4. Upsert or replace source fee rows without deleting user-created operational changes on an already completed activation.
5. Mark agreement `EFFECTIVE`, set `effectiveDate` if manual input supplied, `activatedAt=now`, and `activationStatus=COMPLETED`.
6. Finalize the generated document if still DRAFT; never change already finalized content.
7. Write one agreement activation audit plus one create audit per new Client Service.

If activation status is already COMPLETED, return without modifying operational rows.

- [ ] **Step 5: Run activation tests**

```powershell
npx.cmd vitest run __tests__/services/service-agreement-activation.service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit activation domain**

```powershell
git add src/services/service-agreement/activation.service.ts src/services/service-agreement/index.ts __tests__/services/service-agreement-activation.service.test.ts
git commit -m "feat(services): activate signed service agreements"
```

### Task 5: Hook e-sign completion and scheduler retries

**Files:**
- Modify: `src/services/esigning-signing.service.ts`
- Create: `src/lib/scheduler/tasks/service-agreement-activation.task.ts`
- Modify: `src/lib/scheduler/tasks/index.ts`
- Modify: `src/lib/scheduler/index.ts`
- Test: `__tests__/services/esigning-service-agreement-activation.test.ts`
- Test: `__tests__/services/service-agreement-activation-scheduler.test.ts`

**Interfaces:**
- E-sign completion queues agreements in its existing transaction.
- Scheduler runs retry processing every minute when globally enabled.

- [ ] **Step 1: Write failing e-sign integration tests**

```ts
it('queues service agreements only when the envelope transitions to completed', async () => {
  await completeEsigningSigningSession(input);
  expect(queueServiceAgreementActivationsForEnvelopeMock).toHaveBeenCalledWith(
    expect.anything(),
    envelope.id,
    expect.any(Date),
  );
});

it('does not fail signature completion when post-commit processing fails', async () => {
  processQueuedServiceAgreementActivationsMock.mockRejectedValue(new Error('temporary'));
  await expect(completeEsigningSigningSession(input)).resolves.toBeDefined();
});
```

- [ ] **Step 2: Run integration tests**

```powershell
npx.cmd vitest run __tests__/services/esigning-service-agreement-activation.test.ts __tests__/services/service-agreement-activation-scheduler.test.ts
```

Expected: FAIL before the hook/task exists.

- [ ] **Step 3: Queue inside the existing completion transaction**

Immediately after the successful envelope `COMPLETED` update and event creation:

```ts
if (completionUpdate.count > 0) {
  await queueServiceAgreementActivationsForEnvelope(tx, context.envelope.id, now);
}
```

After commit, attempt a bounded immediate batch process inside `try/catch`; log a sanitized warning and continue returning the signing session if it fails.

- [ ] **Step 4: Register the scheduler task**

```ts
export const serviceAgreementActivationTask: TaskRegistration = {
  id: 'service-agreement-activation',
  name: 'Service agreement activation',
  cronPattern: '* * * * *',
  enabled: true,
  handler: async () => {
    const result = await processQueuedServiceAgreementActivations({
      limit: 10,
      concurrency: 2,
    });
    return { message: JSON.stringify(result) };
  },
};
```

Export and register it beside existing e-signing preparation/PDF tasks. Do not create a second scheduler instance.

- [ ] **Step 5: Run integration tests**

```powershell
npx.cmd vitest run __tests__/services/esigning-service-agreement-activation.test.ts __tests__/services/service-agreement-activation-scheduler.test.ts __tests__/services/esigning-signing.service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit e-sign/scheduler integration**

```powershell
git add src/services/esigning-signing.service.ts src/lib/scheduler/tasks/service-agreement-activation.task.ts src/lib/scheduler/tasks/index.ts src/lib/scheduler/index.ts __tests__/services/esigning-service-agreement-activation.test.ts __tests__/services/service-agreement-activation-scheduler.test.ts
git commit -m "feat(esigning): queue service activation on completion"
```

### Task 6: Expose Client Services and activation APIs

**Files:**
- Create: `src/app/api/companies/[id]/services/route.ts`
- Create: `src/app/api/client-services/[id]/route.ts`
- Create: `src/app/api/service-agreements/[id]/mark-effective/route.ts`
- Create: `src/app/api/service-agreements/[id]/retry-activation/route.ts`
- Test: `__tests__/api/client-services-routes.test.ts`

**Interfaces:**
- Company route lists Services.
- Client Service route updates/archives.
- Agreement routes request manual activation or retry.

- [ ] **Step 1: Write failing route tests**

```ts
it('uses company permissions for operational service access', async () => {
  await GET(companyRequest, { params: Promise.resolve({ id: companyId }) });
  expect(requirePermissionMock).toHaveBeenCalledWith(session, 'company', 'read', companyId);
});

it('requires document update and all-company update access for manual activation', async () => {
  await POST(markEffectiveRequest, { params: Promise.resolve({ id: agreementId }) });
  expect(requirePermissionMock).toHaveBeenCalledWith(session, 'document', 'update');
  expect(requestManualActivationMock).toHaveBeenCalled();
});
```

Cover Zod 400, permission 403, not found 404, optimistic conflict 409, and failed-permanent retry resetting to pending.

- [ ] **Step 2: Run route tests**

```powershell
npx.cmd vitest run __tests__/api/client-services-routes.test.ts
```

Expected: FAIL because routes are absent.

- [ ] **Step 3: Implement route methods**

- `GET /api/companies/:id/services?status=&query=&page=&limit=`
- `GET /api/client-services/:id`
- `PATCH /api/client-services/:id`
- `DELETE /api/client-services/:id` with `{ reason }`
- `POST /api/service-agreements/:id/mark-effective`
- `POST /api/service-agreements/:id/retry-activation`

Use `requireSessionWorkspaceId`, `requirePermission`, the validation schemas from Task 2, and `createErrorResponse`. Retry requires document update plus update access for all included companies.

- [ ] **Step 4: Run route/service tests**

```powershell
npx.cmd vitest run __tests__/api/client-services-routes.test.ts __tests__/services/client-service.service.test.ts __tests__/services/service-agreement-activation.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit APIs**

```powershell
git add src/app/api/companies/[id]/services src/app/api/client-services src/app/api/service-agreements/[id]/mark-effective src/app/api/service-agreements/[id]/retry-activation __tests__/api/client-services-routes.test.ts
git commit -m "feat(api): expose client services and activation"
```

### Task 7: Add the company Services tab

**Files:**
- Create: `src/components/companies/company-detail/company-services-tab.tsx`
- Create: `src/components/companies/company-detail/client-service-editor.tsx`
- Create: `src/hooks/use-client-services.ts`
- Modify: `src/components/companies/company-detail/company-tabs.tsx`
- Modify: `src/components/companies/company-detail/index.ts`
- Modify: `src/app/(dashboard)/companies/[id]/page.tsx`
- Test: `__tests__/components/company-services-tab.test.tsx`
- Test: `__tests__/browser/company-services.browser.test.tsx`

**Interfaces:**
- Adds `services` to `TabId`.
- Reads and edits APIs from Task 6.

- [ ] **Step 1: Write failing component tests**

```tsx
render(<CompanyServicesTab companyId={companyId} canEdit />);
expect(await screen.findByText('Corporate Secretarial Services')).toBeVisible();
expect(screen.getByText('S$500.00 annually')).toBeVisible();
expect(screen.getByRole('link', { name: /service agreement/i })).toHaveAttribute(
  'href',
  `/generated-documents/${generatedDocumentId}`,
);

await user.click(screen.getByRole('button', { name: 'Edit service' }));
expect(screen.queryByLabelText(/service clause/i)).not.toBeInTheDocument();
```

Also cover read-only mode, active/paused/ended filters, fee editing, archive confirmation/reason, activation pending/failed banners, and retry.

- [ ] **Step 2: Run component tests**

```powershell
npx.cmd vitest run __tests__/components/company-services-tab.test.tsx
```

Expected: FAIL before the UI exists.

- [ ] **Step 3: Implement compact Services workspace**

Add `{ id: 'services', label: 'Services', icon: BriefcaseBusiness }` to Company tabs. Remove the legacy URL remapping of `tab=services` to profile; continue remapping `contracts` and `deadlines`.

The tab provides:

- Search and status filters.
- Compact service rows/cards showing service/family, status, cadence, start/end, fee summary, and source agreement.
- Detail/editor drawer or modal with editable identity labels, status, cadence, dates, field values, and fee rows.
- No SOW/legal-clause field.
- Source agreement link and a visible note that operational edits do not change the signed agreement.
- Pending/failed activation status banner with Retry when authorized.
- Empty/loading/error states and mobile stacking.

Use query keys:

```ts
['client-services', companyId, filters]
['client-service', serviceId]
```

Invalidate both after mutation.

- [ ] **Step 4: Run component and browser tests**

```powershell
npx.cmd vitest run __tests__/components/company-services-tab.test.tsx
npx.cmd vitest run --config vitest.browser.config.ts __tests__/browser/company-services.browser.test.tsx
```

Expected: both suites pass.

- [ ] **Step 5: Commit Services UI**

```powershell
git add src/components/companies/company-detail/company-services-tab.tsx src/components/companies/company-detail/client-service-editor.tsx src/components/companies/company-detail/company-tabs.tsx src/components/companies/company-detail/index.ts src/hooks/use-client-services.ts 'src/app/(dashboard)/companies/[id]/page.tsx' __tests__/components/company-services-tab.test.tsx __tests__/browser/company-services.browser.test.tsx
git commit -m "feat(companies): add operational Services tab"
```

### Task 8: Extend backup, restore, and deletion ordering

**Files:**
- Modify: `src/services/backup.service.ts`
- Test: `__tests__/services/backup-service-agreement-data.test.ts`

**Interfaces:**
- Backup manifest data includes every Plan 1-3 service table.
- Restore order satisfies all foreign keys.

- [ ] **Step 1: Write failing backup contract tests**

```ts
for (const key of [
  'serviceFamilies',
  'serviceVariants',
  'serviceVariantFeeTemplates',
  'serviceAgreements',
  'serviceAgreementEntities',
  'serviceAgreementItems',
  'serviceAgreementItemEntities',
  'serviceAgreementFeeLines',
  'clientServices',
  'clientServiceFeeLines',
]) {
  expect(exported.data).toHaveProperty(key);
}
```

Also assert dry-run validation counts the records, restore calls parents before children, and tenant deletion removes children before parents.

- [ ] **Step 2: Run backup tests**

```powershell
npx.cmd vitest run __tests__/services/backup-service-agreement-data.test.ts
```

Expected: FAIL because the new models are not explicitly handled.

- [ ] **Step 3: Update all backup paths**

Add all new delegates to `MANUALLY_HANDLED_MODEL_DELEGATES`. Export under the exact camelCase keys in the test.

Restore order:

1. Template partials.
2. Service families.
3. Service variants.
4. Variant fee templates.
5. Generated documents.
6. Service agreements.
7. Agreement entities.
8. Agreement items.
9. Item-entity links.
10. Agreement fee lines.
11. Client Services.
12. Client Service fee lines.

Tenant deletion reverses child dependencies. Preserve current backup manifest versions unless the service’s compatibility rules require a new accepted literal; if incremented, accept older `1.1`/`1.2` backups with missing service arrays treated as empty.

- [ ] **Step 4: Run backup and safety tests**

```powershell
npx.cmd vitest run __tests__/services/backup-service-agreement-data.test.ts __tests__/services/backup-contact-merge-safety.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit backup support**

```powershell
git add src/services/backup.service.ts __tests__/services/backup-service-agreement-data.test.ts
git commit -m "feat(backup): preserve service agreement data"
```

### Task 9: Document and verify the first release

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/reference/DATABASE_SCHEMA.md`
- Modify: `docs/guides/SERVICE_PATTERNS.md`

**Interfaces:**
- Documents operational-versus-legal authority and activation recovery.

- [ ] **Step 1: Update existing documentation**

Document:

- One Client Service per agreement-item/entity.
- Entity-specific fee ownership.
- Full operational edit policy and immutable signed content.
- Activation status state machine, lease, backoff, max attempts, and retry.
- Automatic versus manual activation permissions and audit source.
- Backup/restore ordering.

- [ ] **Step 2: Run focused Plan 3 verification**

```powershell
npm.cmd run db:generate
npx.cmd vitest run __tests__/services/client-service-schema.test.ts __tests__/lib/client-service-validation.test.ts __tests__/services/client-service.service.test.ts __tests__/services/service-agreement-activation.service.test.ts __tests__/services/esigning-service-agreement-activation.test.ts __tests__/services/service-agreement-activation-scheduler.test.ts __tests__/services/backup-service-agreement-data.test.ts __tests__/api/client-services-routes.test.ts __tests__/components/company-services-tab.test.tsx
npx.cmd vitest run --config vitest.browser.config.ts __tests__/browser/company-services.browser.test.tsx
```

Expected: Prisma generation and all listed tests exit 0.

- [ ] **Step 3: Run regression and production checks**

```powershell
npm.cmd run test:run
npm.cmd run build
```

Expected: full tests and production build exit 0. Record exact unrelated pre-existing failures instead of weakening focused acceptance tests.

- [ ] **Step 4: Exercise activation manually**

In a development tenant:

1. Complete an Oakcloud e-sign envelope containing a generated Service Agreement.
2. Confirm signature completion returns even if the immediate worker is disabled.
3. Run the scheduler task and confirm one Service per item/entity with matching fees.
4. Re-run the task and confirm no duplicates.
5. Edit an operational fee and confirm the agreement HTML and agreement fee snapshot remain unchanged.
6. Use an externally signed draft with Mark effective and confirm reason/date audit data.
7. Force a retryable activation error, confirm banner/retry state, restore the dependency, retry, and confirm completion.

- [ ] **Step 5: Commit documentation**

```powershell
git add docs/ARCHITECTURE.md docs/reference/DATABASE_SCHEMA.md docs/guides/SERVICE_PATTERNS.md
git commit -m "docs(services): document client service activation"
```
