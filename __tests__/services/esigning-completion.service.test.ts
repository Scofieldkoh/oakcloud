import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  processEsigningAutoFileJob,
  processEsigningCompletionDelivery,
  processQueuedEsigningCompletionWork,
} from '@/services/esigning-completion.service';
import { ensureEsigningEnvelopeArtifacts } from '@/services/esigning-pdf.service';

const mocks = vi.hoisted(() => ({
  findManyEnvelope: vi.fn(),
  updateManyEnvelope: vi.fn(),
  findUniqueEnvelope: vi.fn(),
  updateEnvelope: vi.fn(),
  updateManyDelivery: vi.fn(),
  findUniqueDelivery: vi.fn(),
  updateDelivery: vi.fn(),
  createDelivery: vi.fn(),
  createDeliveryAttempt: vi.fn(),
  documentUpsert: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  exists: vi.fn(),
  sendCompletion: vi.fn(),
  createAuditLog: vi.fn(),
  generateArtifactsNow: vi.fn(),
  buildLinks: vi.fn(),
  buildAttachments: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    esigningEnvelope: {
      findMany: mocks.findManyEnvelope,
      updateMany: mocks.updateManyEnvelope,
      findUnique: mocks.findUniqueEnvelope,
      update: mocks.updateEnvelope,
    },
    esigningEmailDelivery: {
      updateMany: mocks.updateManyDelivery,
      findUnique: mocks.findUniqueDelivery,
      update: mocks.updateDelivery,
      create: mocks.createDelivery,
    },
    esigningEmailDeliveryAttempt: {
      create: mocks.createDeliveryAttempt,
    },
    document: {
      upsert: mocks.documentUpsert,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/storage', () => ({
  storage: {
    download: mocks.download,
    upload: mocks.upload,
    exists: mocks.exists,
  },
  StorageKeys: {
    documentOriginal: (tenantId: string, companyId: string, id: string, ext: string) =>
      `original/${tenantId}/${companyId}/${id}${ext}`,
    esigningSignedDocument: (tenantId: string, envelopeId: string, id: string) =>
      `signed/${tenantId}/${envelopeId}/${id}.pdf`,
    esigningCertificateDocument: (tenantId: string, envelopeId: string, id: string) =>
      `certificate/${tenantId}/${envelopeId}/${id}.pdf`,
  },
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: mocks.createAuditLog,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/services/esigning-notification.service', () => ({
  sendEsigningCompletionEmail: mocks.sendCompletion,
  sendEsigningPdfFailureEmailToSender: vi.fn(),
}));

vi.mock('@/services/esigning-pdf.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/esigning-pdf.service')>();
  return {
    ...actual,
    generateEsigningEnvelopeArtifactsNow: mocks.generateArtifactsNow,
    buildDeliveryDocumentLinks: mocks.buildLinks,
    buildEmailAttachments: mocks.buildAttachments,
  };
});

function makeAutoFileEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    id: 'envelope-1',
    tenantId: 'tenant-1',
    title: 'NDA',
    companyId: 'company-1',
    createdById: 'user-1',
    certificateId: 'certificate-1',
    documents: [
      {
        id: 'document-1',
        fileName: 'nda.pdf',
        signedStoragePath: 'signed/tenant-1/envelope-1/document-1.pdf',
      },
    ],
    ...overrides,
  };
}

function makeDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delivery-1',
    tenantId: 'tenant-1',
    envelopeId: 'envelope-1',
    recipientId: 'recipient-1',
    audience: 'RECIPIENT',
    kind: 'COMPLETION',
    targetKey: 'recipient:recipient-1',
    toEmail: 'signer@example.com',
    subject: 'Completed: NDA',
    envelope: {
      id: 'envelope-1',
      tenantId: 'tenant-1',
      title: 'NDA',
      certificateId: 'certificate-1',
      createdById: 'user-1',
      createdBy: { firstName: 'Sender', lastName: null, email: 'sender@example.com' },
      recipients: [{ id: 'recipient-1', name: 'Signer', email: 'signer@example.com' }],
      documents: [
        {
          id: 'document-1',
          fileName: 'nda.pdf',
          signedStoragePath: 'signed/tenant-1/envelope-1/document-1.pdf',
        },
      ],
    },
    ...overrides,
  };
}

describe('e-signing completion worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateManyEnvelope.mockResolvedValue({ count: 1 });
    mocks.updateEnvelope.mockResolvedValue({});
    mocks.updateManyDelivery.mockResolvedValue({ count: 1 });
    mocks.updateDelivery.mockResolvedValue({});
    mocks.createDeliveryAttempt.mockResolvedValue({});
    mocks.documentUpsert.mockResolvedValue({});
    mocks.upload.mockResolvedValue(undefined);
    mocks.download.mockResolvedValue(Buffer.from('signed-pdf'));
    mocks.exists.mockResolvedValue(true);
    mocks.sendCompletion.mockResolvedValue({
      ok: true,
      kind: 'completion',
      to: 'signer@example.com',
      subject: 'Completed: NDA',
      attemptedAt: '2026-08-11T00:00:00.000Z',
      providerMessageId: 'graph-1',
    });
    mocks.createAuditLog.mockResolvedValue(undefined);
    mocks.generateArtifactsNow.mockResolvedValue('generated');
    mocks.buildLinks.mockResolvedValue([{
      label: 'nda.pdf',
      signedUrl: '/signed',
      certificateUrl: '/certificate',
    }]);
    mocks.buildAttachments.mockReturnValue([]);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback({
        $queryRaw: mocks.queryRaw,
        esigningEmailDelivery: { update: mocks.updateDelivery },
      });
    });
    mocks.queryRaw.mockResolvedValue([{ id: 'delivery-1' }]);
  });

  it('continues downstream work when the artifact is already complete', async () => {
    mocks.findManyEnvelope
      .mockResolvedValueOnce([]) // artifact stage
      .mockResolvedValueOnce([{ id: 'envelope-1' }]); // auto-file stage
    mocks.findUniqueEnvelope.mockResolvedValue(makeAutoFileEnvelope());
    mocks.findUniqueDelivery.mockResolvedValue(makeDelivery());

    const result = await processQueuedEsigningCompletionWork({ limit: 5, concurrency: 2 });

    expect(mocks.generateArtifactsNow).not.toHaveBeenCalled();
    expect(mocks.documentUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.sendCompletion).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      autoFiled: 1,
      deliveriesSent: 1,
      artifactsCompleted: 0,
      artifactsFailed: 0,
    });
  });

  it('artifact repair never marks delivery complete or sends email', async () => {
    mocks.findUniqueEnvelope.mockResolvedValue({
      id: 'envelope-1',
      tenantId: 'tenant-1',
      status: 'COMPLETED',
      pdfGenerationStatus: 'PENDING',
      metadata: { artifactVersion: 4 },
      documents: [
        {
          id: 'document-1',
          signedStoragePath: 'signed/tenant-1/envelope-1/document-1.pdf',
        },
      ],
    });

    await ensureEsigningEnvelopeArtifacts({
      envelopeId: 'envelope-1',
      requireCertificates: true,
    });

    expect(mocks.sendCompletion).not.toHaveBeenCalled();
    expect(mocks.documentUpsert).not.toHaveBeenCalled();
    expect(mocks.updateDelivery).not.toHaveBeenCalled();
    expect(mocks.createDeliveryAttempt).not.toHaveBeenCalled();
  });

  it('reclaims stale auto-file leases and never claims fresh delivery leases', async () => {
    mocks.findUniqueEnvelope.mockResolvedValue(makeAutoFileEnvelope({ companyId: null }));

    await processEsigningAutoFileJob('envelope-1');

    expect(mocks.updateManyEnvelope).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { autoFilingStatus: 'PENDING' },
          { autoFilingStatus: 'FAILED_RETRYABLE' },
          expect.objectContaining({ autoFilingStatus: 'PROCESSING' }),
        ]),
      }),
      data: expect.objectContaining({ autoFilingStatus: 'PROCESSING' }),
    }));

    mocks.updateManyDelivery.mockResolvedValue({ count: 0 });
    await expect(processEsigningCompletionDelivery('delivery-1')).resolves.toBe('not-claimed');
    expect(mocks.updateManyDelivery).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { status: 'PENDING' },
          { status: 'FAILED_RETRYABLE' },
          expect.objectContaining({ status: 'PROCESSING' }),
        ]),
      }),
    }));
  });

  it('deterministic auto-file reruns do not create a second company document', async () => {
    mocks.findUniqueEnvelope.mockResolvedValue(makeAutoFileEnvelope());

    await processEsigningAutoFileJob('envelope-1');
    await processEsigningAutoFileJob('envelope-1');

    expect(mocks.documentUpsert).toHaveBeenCalledTimes(2);
    const firstCall = mocks.documentUpsert.mock.calls[0][0] as { where: { id: string }; create: { id: string } };
    const secondCall = mocks.documentUpsert.mock.calls[1][0] as { where: { id: string }; create: { id: string } };
    expect(secondCall.where.id).toBe(firstCall.where.id);
    expect(secondCall.create.id).toBe(firstCall.create.id);
  });

  it('moves auto-filing to FAILED_PERMANENT after attempt exhaustion', async () => {
    mocks.findUniqueEnvelope
      .mockResolvedValueOnce(makeAutoFileEnvelope())
      .mockResolvedValueOnce({ autoFilingAttempts: 4 });
    mocks.download.mockRejectedValue(new Error('storage unavailable'));

    await expect(processEsigningAutoFileJob('envelope-1')).rejects.toThrow('storage unavailable');

    expect(mocks.updateEnvelope).toHaveBeenCalledWith({
      where: { id: 'envelope-1' },
      data: expect.objectContaining({
        autoFilingStatus: 'FAILED_PERMANENT',
        autoFilingAttempts: 5,
        autoFilingAvailableAt: null,
        autoFilingError: 'storage unavailable',
      }),
    });
  });

  it('moves delivery to FAILED_PERMANENT after attempt exhaustion', async () => {
    mocks.findUniqueDelivery
      .mockResolvedValueOnce(makeDelivery({
        envelope: {
          ...makeDelivery().envelope,
          documents: [
            { id: 'document-1', fileName: 'nda.pdf', signedStoragePath: null },
          ],
        },
      }))
      .mockResolvedValueOnce({
        attemptCount: 4,
        toEmail: 'signer@example.com',
        subject: 'Completed: NDA',
      });

    await expect(processEsigningCompletionDelivery('delivery-1')).rejects.toThrow(
      'Signed artifacts are not ready for delivery'
    );

    expect(mocks.updateDelivery).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({
        status: 'FAILED_PERMANENT',
        attemptCount: 5,
        availableAt: null,
      }),
    });
    expect(mocks.createDeliveryAttempt).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        deliveryId: 'delivery-1',
        succeeded: false,
      }),
    }));
  });
});
