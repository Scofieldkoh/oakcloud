import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  getStageDetail: vi.fn(),
  linkOutcome: vi.fn(),
  reconcileOutcome: vi.fn(),
  outcomeFindMany: vi.fn(),
  stageFindFirst: vi.fn(),
  outcomeFindFirst: vi.fn(),
}));

vi.mock('@/services/tasks/stage.service', () => ({
  getTaskStageDetail: mocks.getStageDetail,
  linkTaskStageOutcome: mocks.linkOutcome,
  reconcileTaskStageOutcome: mocks.reconcileOutcome,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    taskStage: { findFirst: mocks.stageFindFirst },
    taskStageOutcome: {
      findFirst: mocks.outcomeFindFirst,
      findMany: mocks.outcomeFindMany,
    },
  },
}));

import {
  findPreferredEsigningDocument,
  linkCompanyTaskOutcome,
  linkEsigningEnvelopeTaskOutcome,
  linkGeneratedDocumentTaskOutcome,
  parseTaskLaunchContext,
  reconcileEsigningEnvelopeTaskOutcomes,
  reconcileGeneratedDocumentTaskOutcomes,
} from '@/services/tasks/integration.service';

const context = {
  taskId: '11111111-1111-4111-8111-111111111111',
  taskStageId: '22222222-2222-4222-8222-222222222222',
  returnTo: '/tasks',
};

describe('task module integration service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStageDetail.mockResolvedValue({
      id: context.taskStageId,
      taskId: context.taskId,
    });
    mocks.linkOutcome.mockResolvedValue({ status: 'IN_PROGRESS' });
    mocks.reconcileOutcome.mockResolvedValue({ status: 'COMPLETED' });
  });

  it('accepts an absent context and validates the exact launch context shape', () => {
    expect(parseTaskLaunchContext(undefined)).toBeUndefined();
    expect(parseTaskLaunchContext(context)).toEqual(context);
    expect(() => parseTaskLaunchContext({
      ...context,
      taskId: 'not-a-uuid',
    })).toThrow();
    expect(() => parseTaskLaunchContext({
      ...context,
      unexpected: true,
    })).toThrow();
  });

  it.each([
    ['company', linkCompanyTaskOutcome, { type: 'COMPANY', companyId: '33333333-3333-4333-8333-333333333333' }],
    ['document', linkGeneratedDocumentTaskOutcome, {
      type: 'GENERATED_DOCUMENT',
      generatedDocumentId: '33333333-3333-4333-8333-333333333333',
    }],
    ['envelope', linkEsigningEnvelopeTaskOutcome, {
      type: 'ESIGNING_ENVELOPE',
      esigningEnvelopeId: '33333333-3333-4333-8333-333333333333',
    }],
  ])('links an authoritative %s only after validating the task/stage pair', async (
    _label,
    link,
    expectedOutcome,
  ) => {
    await link({
      tenantId: 'tenant-a',
      context,
      authoritativeId: '33333333-3333-4333-8333-333333333333',
      userId: 'user-1',
    });

    expect(mocks.getStageDetail).toHaveBeenCalledWith(
      'tenant-a',
      context.taskId,
      context.taskStageId,
    );
    expect(mocks.linkOutcome).toHaveBeenCalledWith(
      'tenant-a',
      context.taskStageId,
      expectedOutcome,
      'user-1',
    );
    expect(mocks.getStageDetail.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.linkOutcome.mock.invocationCallOrder[0]);
  });

  it('reconciles every linked document stage within the tenant', async () => {
    mocks.outcomeFindMany.mockResolvedValue([
      { taskStageId: 'stage-1' },
      { taskStageId: 'stage-2' },
    ]);

    await reconcileGeneratedDocumentTaskOutcomes(
      'tenant-a',
      '33333333-3333-4333-8333-333333333333',
      'user-1',
    );

    expect(mocks.outcomeFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        generatedDocumentId: '33333333-3333-4333-8333-333333333333',
      },
      select: { taskStageId: true },
    });
    expect(mocks.reconcileOutcome).toHaveBeenCalledTimes(2);
  });

  it('reconciles every linked e-signing stage within the tenant', async () => {
    mocks.outcomeFindMany.mockResolvedValue([{ taskStageId: 'stage-1' }]);

    await reconcileEsigningEnvelopeTaskOutcomes(
      'tenant-a',
      '44444444-4444-4444-8444-444444444444',
    );

    expect(mocks.outcomeFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        esigningEnvelopeId: '44444444-4444-4444-8444-444444444444',
      },
      select: { taskStageId: true },
    });
    expect(mocks.reconcileOutcome).toHaveBeenCalledWith(
      'tenant-a',
      'stage-1',
      undefined,
    );
  });

  it('defaults e-signing to the nearest preceding finalized generated document', async () => {
    mocks.stageFindFirst.mockResolvedValue({
      id: context.taskStageId,
      position: 2,
    });
    mocks.outcomeFindFirst.mockResolvedValue({
      generatedDocument: {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Engagement letter',
        companyId: '55555555-5555-4555-8555-555555555555',
      },
    });

    await expect(findPreferredEsigningDocument('tenant-a', context)).resolves.toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      title: 'Engagement letter',
      companyId: '55555555-5555-4555-8555-555555555555',
    });
    expect(mocks.outcomeFindFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        taskStage: {
          taskId: context.taskId,
          position: { lt: 2 },
          actionType: 'DOCUMENT_GENERATION',
        },
        generatedDocument: {
          tenantId: 'tenant-a',
          status: 'FINALIZED',
          deletedAt: null,
        },
      },
      orderBy: { taskStage: { position: 'desc' } },
      select: {
        generatedDocument: {
          select: { id: true, title: true, companyId: true },
        },
      },
    });
  });
});

describe('authoritative module callback contracts', () => {
  const source = (relativePath: string) => fs.readFileSync(
    path.join(process.cwd(), relativePath),
    'utf8',
  );

  it('preserves task context through manual company and BizFile creation', () => {
    const companyRoute = source('src/app/api/companies/route.ts');
    const bizfileRoute = source('src/app/api/documents/[documentId]/confirm/route.ts');

    expect(companyRoute).toContain('parseTaskLaunchContext(body.taskContext)');
    expect(companyRoute).toContain('linkCompanyTaskOutcome');
    expect(bizfileRoute).toContain('parseTaskLaunchContext');
    expect(bizfileRoute).toContain('linkCompanyTaskOutcome');
  });

  it('links document drafts and reconciles finalization changes', () => {
    const documentRoute = source('src/app/api/generated-documents/route.ts');
    const sessionRoute = source(
      'src/app/api/generated-documents/generation-sessions/route.ts',
    );
    const generator = source('src/services/document-generator.service.ts');

    expect(documentRoute).toContain('linkGeneratedDocumentTaskOutcome');
    expect(sessionRoute).toContain('linkGeneratedDocumentTaskOutcome');
    expect(generator).toContain('reconcileGeneratedDocumentTaskOutcomes');
  });

  it('links envelopes and reconciles every terminal signing lifecycle', () => {
    const envelopeRoute = source('src/app/api/esigning/envelopes/route.ts');
    const envelopeService = source('src/services/esigning-envelope.service.ts');
    const signingService = source('src/services/esigning-signing.service.ts');

    expect(envelopeRoute).toContain('linkEsigningEnvelopeTaskOutcome');
    expect(envelopeService).toContain('reconcileEsigningEnvelopeTaskOutcomes');
    expect(signingService).toContain('reconcileEsigningEnvelopeTaskOutcomes');
  });
});
