import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  download: vi.fn(),
}));

vi.mock('@/lib/fresh-authorization', () => ({ evaluateFreshAuthorization: mocks.authorize }));
vi.mock('@/lib/storage', () => ({ storage: { download: mocks.download } }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { hashBizFileValue, buildBizFileChangePlan } from '@/services/bizfile/change-plan';
import { prepareBizFileCorrection } from '@/services/bizfile/application/prepare-correction';
import { assistantCapabilities } from '@/services/bizfile/assistant-capabilities';
import { sha256, type CapabilityCorrectionContext } from '@/services/business-assistant/contracts';

const tenantId = 'tenant';
const userId = 'user';
const sourceRunId = 'source-run';
const documentId = 'document';
const companyId = 'company';
const sourceOperationId = 'source-operation';
const receiptId = 'receipt';
const sourceBytes = Buffer.from('retained original');
const sourceHash = 'fe9086a04f949ff5378c5f16aa3b30d7d75c2f26a3613ce46a8cc8a6421a6920';

function sourceArtifact() {
  return {
    documentId,
    storageKey: `${tenantId}/pending/${documentId}/original.pdf`,
    mimeType: 'application/pdf',
    sourceRevision: 1,
    sourceHash,
  };
}

function currentStorageKey(): string {
  return `${tenantId}/companies/${companyId}/documents/${documentId}/original-${sourceHash}.pdf`;
}

function companyRow() {
  return {
    id: companyId,
    tenantId,
    aggregateRevision: 4,
    updatedAt: new Date('2026-09-10T00:00:00.000Z'),
    name: 'Persisted Name',
    uen: '202600001A',
    entityType: 'PRIVATE_LIMITED',
    status: 'LIVE',
    addresses: [],
    formerNames: [],
    shareCapital: [],
    officers: [],
    shareholders: [],
    auditor: null,
    charges: [],
  };
}

function fixture(currentPointer = currentStorageKey(), artifactHash = hashBizFileValue(sourceArtifact())) {
  const reviewedData = {
    entityDetails: { name: 'Old Name', uen: '202600001A', entityType: 'PRIVATE_LIMITED', status: 'LIVE' },
  };
  const baseline = {
    company: companyRow(), addresses: [], formerNames: [], shareCapital: [], officers: [], shareholders: [], auditor: null, charges: [],
    aggregateRevision: 'source-baseline', expectedAggregateRevision: 3,
  };
  const plan = buildBizFileChangePlan({
    mode: 'UPDATE', tenantId, documentId, targetCompanyId: companyId, reviewedData,
    baseline, sourceVersion: 1, sourceHash,
  });
  const persistedPlan = JSON.parse(JSON.stringify(plan));
  const nameChange = plan.changes.find((change) => change.path === 'entityDetails.name');
  if (!nameChange) throw new Error('fixture did not produce the expected name change');
  const source = { ...sourceArtifact(), version: 1 };
  const sourceItem = {
    id: 'source-item', tenantId, runId: sourceRunId, operationId: sourceOperationId,
    input: { plan: persistedPlan, source },
    output: { receipt: { receiptType: 'BizFileOperationReceipt', receiptId, operationId: sourceOperationId, status: 'COMMITTED', payloadHash: plan.canonicalHash } },
    receiptRef: { receiptType: 'BizFileOperationReceipt', receiptId, operationId: sourceOperationId, status: 'COMMITTED', payloadHash: plan.canonicalHash },
  };
  const preparedItem = { itemId: sourceItem.id, itemKey: 'UPDATE:202600001A:document', input: sourceItem.input, resources: [], status: 'ELIGIBLE' as const };
  const preparedBody = { status: 'PREPARED' as const, items: [preparedItem], preparedAt: '2026-09-10T00:00:00.000Z' };
  const sourceProposal = {
    id: 'source-proposal', revision: 1, preparedArtifact: { ...preparedBody, preparedHash: hashBizFileValue(preparedBody) },
    preparedHash: sha256({ prepared: { ...preparedBody, preparedHash: hashBizFileValue(preparedBody) }, serializerVersion: '1' }),
    eligibleItems: [{ itemId: sourceItem.id, itemKey: preparedItem.itemKey, preparedHash: sha256(preparedItem) }],
  };
  const sourceReview = {
    id: 'source-review', runItemId: sourceItem.id,
    findings: [{ id: 'finding-name', code: 'SELECTED_FIELD_MISMATCH', path: 'entityDetails.name', changeId: nameChange.id, expected: 'New Name' }],
    evidence: { snapshot: { companyId, aggregateRevision: 4, baseline: {} }, observedAt: '2026-09-10T00:00:00.000Z' },
    coverage: { source: { expectedHash: sourceHash, observedHash: sourceHash, hashVerified: true }, coverage: { sourceCoverage: { sourceHash, observedSourceHash: sourceHash, hashVerified: true } } },
  };
  const receipt = {
    id: receiptId, tenantId, operationId: sourceOperationId, capabilityId: 'bizfile.import_and_review', capabilityVersion: '1.0', schemaVersion: '1',
    mode: 'UPDATE', companyId, documentId, payloadHash: plan.canonicalHash, beforeRevision: 3, afterRevision: 4, status: 'COMMITTED', effectStatus: 'PENDING',
    evidence: [{ kind: 'SOURCE', artifact: sourceArtifact(), artifactHash, sourceRef: { documentId, sourceVersion: 1, sourceRevision: 1 } }],
  };
  const tx = {
    businessAssistantProposal: { findMany: vi.fn().mockResolvedValue([sourceProposal]) },
    businessAssistantApproval: { findFirst: vi.fn().mockResolvedValue({ id: 'source-approval', selectedItems: [sourceItem.id], selectedBindings: [{ itemId: sourceItem.id, preparedHash: sha256(preparedItem) }] }) },
    bizFileOperationReceipt: { findFirst: vi.fn().mockResolvedValue(receipt) },
    document: { findFirst: vi.fn().mockResolvedValue({ id: documentId, tenantId, companyId, version: 1, sourceRevision: 2, storageKey: currentPointer, mimeType: 'application/pdf', originalFileName: 'document.pdf', fileName: 'document.pdf', isLatest: true, deletedAt: null }) },
    company: { findFirst: vi.fn().mockResolvedValue(companyRow()) },
  };
  const context: CapabilityCorrectionContext = {
    actor: { tenantId, userId, requestId: 'request', source: 'BUSINESS_ASSISTANT' }, request: { reviewId: sourceReview.id, corrections: [{ findingId: 'finding-name', value: 'New Name' }] },
    sourceRunId, sourceReview, sourceItem: { ...sourceItem, run: { schemaVersion: '1' } }, nextRunId: 'next-run', nextItemId: 'next-item', db: tx,
  };
  return { context, tx, plan, sourceItem, receipt };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ allowed: true });
  mocks.download.mockResolvedValue(sourceBytes);
});

describe('BizFile correction preparation', () => {
  it('is wired through the canonical capability and accepts a finalized source pointer after byte verification', async () => {
    const capability = assistantCapabilities[0];
    expect(capability.prepareCorrection).toBe(prepareBizFileCorrection);
    const { context } = fixture();
    const result = await capability.prepareCorrection!(context);
    expect(result.status).toBe('PREPARED');
    expect(result.preparedItem.itemId).toBe('next-item');
    expect(result.preparedItem.input).toMatchObject({ source: { storageKey: currentStorageKey(), sourceRevision: 2, sourceHash } });
    expect(result.lineage).toMatchObject({ sourceReceiptId: receiptId, sourceOperationId, correctionOfReviewId: 'source-review' });
    expect(mocks.download).toHaveBeenNthCalledWith(1, `${tenantId}/pending/${documentId}/original.pdf`);
    expect(mocks.download).toHaveBeenNthCalledWith(2, currentStorageKey());
  });

  it('fails closed when receipt source evidence hash is tampered', async () => {
    const { context } = fixture(currentStorageKey(), 'f'.repeat(64));
    await expect(prepareBizFileCorrection(context)).rejects.toMatchObject({ code: 'PROPOSAL_STALE' });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rechecks source authorization before reading retained bytes', async () => {
    mocks.authorize.mockResolvedValue({ allowed: false });
    const { context } = fixture();
    await expect(prepareBizFileCorrection(context)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rechecks target authorization before reading retained bytes', async () => {
    mocks.authorize.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false });
    const { context } = fixture();
    await expect(prepareBizFileCorrection(context)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rejects a review report whose source hash is not the committed receipt hash', async () => {
    const { context } = fixture();
    ((context.sourceReview as Record<string, unknown>).coverage as Record<string, unknown>).source = {
      expectedHash: 'f'.repeat(64), observedHash: sourceHash, hashVerified: true,
    };
    await expect(prepareBizFileCorrection(context)).rejects.toMatchObject({ code: 'PROPOSAL_STALE' });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rejects a submitted value that does not equal the immutable finding value', async () => {
    const { context } = fixture();
    (context.request as { corrections: Array<{ value: unknown }> }).corrections[0].value = 'Another Name';
    await expect(prepareBizFileCorrection(context)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rejects a finding path outside the capability allowlist', async () => {
    const { context } = fixture();
    (((context.sourceReview as Record<string, unknown>).findings as Array<Record<string, unknown>>)[0]).path = 'officers.0.name';
    await expect(prepareBizFileCorrection(context)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('rejects retained bytes whose hash differs from committed evidence', async () => {
    mocks.download.mockResolvedValue(Buffer.from('different retained bytes'));
    const { context } = fixture();
    await expect(prepareBizFileCorrection(context)).rejects.toMatchObject({ code: 'PROPOSAL_STALE' });
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it('rejects a current company baseline that advanced after the reviewed snapshot', async () => {
    const { context, tx } = fixture();
    tx.company.findFirst.mockResolvedValue({ ...companyRow(), aggregateRevision: 5 });
    await expect(prepareBizFileCorrection(context)).rejects.toMatchObject({ code: 'PROPOSAL_STALE' });
  });

  it('rejects a current pointer that is neither the retained original nor its deterministic finalized destination', async () => {
    const { context } = fixture('tenant/companies/company/documents/document/unrelated.pdf');
    await expect(prepareBizFileCorrection(context)).rejects.toMatchObject({ code: 'PROPOSAL_STALE' });
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
