import { v5 as uuidv5 } from 'uuid';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { storage, StorageKeys } from '@/lib/storage';
import { createAuditLog } from '@/lib/audit';
import { createLogger } from '@/lib/logger';
import { sendEsigningCompletionEmail } from '@/services/esigning-notification.service';
import {
  buildDeliveryDocumentLinks,
  buildEmailAttachments,
  generateEsigningEnvelopeArtifactsNow,
} from '@/services/esigning-pdf.service';

const log = createLogger('esigning-completion');

const PROCESSING_LEASE_MS = 15 * 60 * 1000;
const AUTO_FILE_NAMESPACE = '0ab5455a-3dcf-4660-8dfe-c6bc1d495301';
const MAX_AUTO_FILE_ATTEMPTS = 5;
const MAX_DELIVERY_ATTEMPTS = 5;

function retryDelay(attemptCount: number): number {
  return Math.min(60 * 60_000, 5_000 * (2 ** Math.min(attemptCount, 8)));
}

function buildSignedPackageFileName(fileName: string): string {
  return fileName.toLowerCase().endsWith('.pdf')
    ? fileName.replace(/\.pdf$/i, '-signed.pdf')
    : `${fileName}-signed.pdf`;
}

export function isTerminalPostCompletionStatus(
  status: string | null | undefined
): boolean {
  return ['NOT_REQUIRED', 'COMPLETED', 'FAILED_PERMANENT'].includes(status ?? '');
}

export function isTerminalEsigningEmailDeliveryStatus(
  status: string | null | undefined
): boolean {
  return ['SUCCEEDED', 'FAILED_PERMANENT'].includes(status ?? '');
}

export async function queueEsigningCompletionWork(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    envelopeId: string;
    completedAt: Date;
  }
): Promise<void> {
  const envelope = await tx.esigningEnvelope.findUnique({
    where: { id: input.envelopeId },
    select: {
      id: true,
      tenantId: true,
      title: true,
      companyId: true,
      createdById: true,
      recipients: {
        select: {
          id: true,
          email: true,
          accessMode: true,
        },
      },
      createdBy: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!envelope || envelope.tenantId !== input.tenantId) {
    throw new Error('Envelope not found for completion queueing');
  }

  const completionSubject = `Completed: ${envelope.title}`;
  const recipientDeliveries = envelope.recipients
    .filter((recipient) => recipient.accessMode !== 'MANUAL_LINK')
    .map((recipient) => ({
      tenantId: input.tenantId,
      envelopeId: input.envelopeId,
      recipientId: recipient.id,
      audience: 'RECIPIENT' as const,
      kind: 'COMPLETION' as const,
      targetKey: `recipient:${recipient.id}`,
      toEmail: recipient.email,
      subject: completionSubject,
      status: 'PENDING' as const,
      attemptCount: 0,
      availableAt: input.completedAt,
    }));

  const senderDeliveries = [{
    tenantId: input.tenantId,
    envelopeId: input.envelopeId,
    recipientId: null,
    audience: 'SENDER' as const,
    kind: 'COMPLETION' as const,
    targetKey: `sender:${envelope.createdById}`,
    toEmail: envelope.createdBy.email,
    subject: completionSubject,
    status: 'PENDING' as const,
    attemptCount: 0,
    availableAt: input.completedAt,
  }];

  await tx.esigningEmailDelivery.createMany({
    data: [...recipientDeliveries, ...senderDeliveries],
    skipDuplicates: true,
  });

  await tx.esigningEnvelope.update({
    where: { id: input.envelopeId },
    data: envelope.companyId
      ? {
          autoFilingStatus: 'PENDING',
          autoFilingAttempts: 0,
          autoFilingAvailableAt: input.completedAt,
          autoFilingError: null,
        }
      : {
          autoFilingStatus: 'NOT_REQUIRED',
        },
  });
}

export async function processEsigningAutoFileJob(
  envelopeId: string
): Promise<'completed' | 'not-claimed'> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);

  const claim = await prisma.esigningEnvelope.updateMany({
    where: {
      id: envelopeId,
      status: 'COMPLETED',
      pdfGenerationStatus: 'COMPLETED',
      OR: [
        { autoFilingStatus: 'PENDING' },
        { autoFilingStatus: 'FAILED_RETRYABLE' },
        {
          autoFilingStatus: 'PROCESSING',
          autoFilingClaimedAt: { lt: staleBefore },
        },
      ],
    },
    data: {
      autoFilingStatus: 'PROCESSING',
      autoFilingClaimedAt: now,
      autoFilingLeaseExpiresAt: new Date(now.getTime() + PROCESSING_LEASE_MS),
    },
  });

  if (claim.count === 0) {
    return 'not-claimed';
  }

  try {
    const envelope = await prisma.esigningEnvelope.findUnique({
      where: { id: envelopeId },
      select: {
        id: true,
        tenantId: true,
        title: true,
        companyId: true,
        createdById: true,
        certificateId: true,
        documents: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            fileName: true,
            signedStoragePath: true,
          },
        },
      },
    });

    if (!envelope) {
      throw new Error('Envelope not found for auto-filing');
    }

    if (!envelope.companyId) {
      await prisma.esigningEnvelope.update({
        where: { id: envelopeId },
        data: {
          autoFilingStatus: 'NOT_REQUIRED',
          autoFilingClaimedAt: null,
          autoFilingLeaseExpiresAt: null,
        },
      });
      return 'completed';
    }

    for (const document of envelope.documents) {
      if (!document.signedStoragePath) {
        throw new Error(`Signed document "${document.fileName}" is missing`);
      }

      const signedBuffer = await storage.download(document.signedStoragePath);
      const companyDocumentId = uuidv5(
        `${envelope.id}:${document.id}:signed-package`,
        AUTO_FILE_NAMESPACE
      );
      const fileName = `${companyDocumentId}.pdf`;
      const originalFileName = buildSignedPackageFileName(document.fileName);
      const storageKey = StorageKeys.documentOriginal(
        envelope.tenantId,
        envelope.companyId,
        companyDocumentId,
        '.pdf'
      );
      const fileSize = signedBuffer.byteLength;
      const filedAt = new Date();

      await storage.upload(storageKey, signedBuffer, {
        contentType: 'application/pdf',
        metadata: {
          tenantId: envelope.tenantId,
          companyId: envelope.companyId,
          envelopeId: envelope.id,
          envelopeDocumentId: document.id,
          certificateId: envelope.certificateId,
          originalFileName,
        },
      });

      await prisma.document.upsert({
        where: { id: companyDocumentId },
        update: {
          tenantId: envelope.tenantId,
          companyId: envelope.companyId,
          uploadedById: envelope.createdById,
          documentType: 'E_SIGNED_PACKAGE',
          fileName,
          originalFileName,
          storageKey,
          fileSize,
          mimeType: 'application/pdf',
          extractionStatus: 'COMPLETED',
          extractedAt: filedAt,
          isLatest: true,
          deletedAt: null,
          deletedReason: null,
        },
        create: {
          id: companyDocumentId,
          tenantId: envelope.tenantId,
          companyId: envelope.companyId,
          uploadedById: envelope.createdById,
          documentType: 'E_SIGNED_PACKAGE',
          fileName,
          originalFileName,
          storageKey,
          fileSize,
          mimeType: 'application/pdf',
          version: 1,
          isLatest: true,
          extractionStatus: 'COMPLETED',
          extractedAt: filedAt,
        },
      });

      await createAuditLog({
        tenantId: envelope.tenantId,
        userId: envelope.createdById,
        companyId: envelope.companyId,
        action: 'UPLOAD',
        entityType: 'Document',
        entityId: companyDocumentId,
        entityName: originalFileName,
        summary: `Auto-filed signed package "${originalFileName}" from e-signing envelope "${envelope.title}"`,
        changeSource: 'SYSTEM',
        metadata: {
          envelopeId: envelope.id,
          envelopeDocumentId: document.id,
          certificateId: envelope.certificateId,
        },
      });
    }

    await prisma.esigningEnvelope.update({
      where: { id: envelopeId },
      data: {
        autoFilingStatus: 'COMPLETED',
        autoFilingAttempts: 0,
        autoFilingAvailableAt: null,
        autoFilingClaimedAt: null,
        autoFilingLeaseExpiresAt: null,
        autoFilingError: null,
      },
    });
    return 'completed';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown auto-file failure';
    const current = await prisma.esigningEnvelope.findUnique({
      where: { id: envelopeId },
      select: { autoFilingAttempts: true },
    });
    const attemptCount = (current?.autoFilingAttempts ?? 0) + 1;
    const status =
      attemptCount >= MAX_AUTO_FILE_ATTEMPTS ? 'FAILED_PERMANENT' : 'FAILED_RETRYABLE';

    await prisma.esigningEnvelope.update({
      where: { id: envelopeId },
      data: {
        autoFilingStatus: status,
        autoFilingAttempts: attemptCount,
        autoFilingAvailableAt:
          status === 'FAILED_RETRYABLE'
            ? new Date(Date.now() + retryDelay(attemptCount))
            : null,
        autoFilingClaimedAt: null,
        autoFilingLeaseExpiresAt: null,
        autoFilingError: message,
      },
    });

    log.error('E-signing auto-file failed', { envelopeId, attemptCount, status, error });
    throw error;
  }
}

async function claimCompletionDeliveries(input: {
  limit: number;
  leaseMs: number;
}): Promise<string[]> {
  const now = new Date();
  const leaseExpiry = new Date(now.getTime() + input.leaseMs);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT d."id"
      FROM "esigning_email_deliveries" d
      WHERE d."kind" = 'COMPLETION'
        AND (
          d."status" = 'PENDING'
          OR d."status" = 'FAILED_RETRYABLE'
          OR (d."status" = 'PROCESSING' AND d."leaseExpiresAt" < ${now})
        )
      ORDER BY d."availableAt" ASC
      LIMIT ${input.limit}
      FOR UPDATE SKIP LOCKED
    `);

    for (const row of rows) {
      await tx.esigningEmailDelivery.update({
        where: { id: row.id },
        data: {
          status: 'PROCESSING',
          claimedAt: now,
          leaseExpiresAt: leaseExpiry,
        },
      });
    }

    return rows.map((row) => row.id);
  });
}

export async function processEsigningCompletionDelivery(
  deliveryId: string
): Promise<'sent' | 'not-claimed'> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);

  const claim = await prisma.esigningEmailDelivery.updateMany({
    where: {
      id: deliveryId,
      kind: 'COMPLETION',
      OR: [
        { status: 'PENDING' },
        { status: 'FAILED_RETRYABLE' },
        {
          status: 'PROCESSING',
          leaseExpiresAt: { lt: staleBefore },
        },
      ],
    },
    data: {
      status: 'PROCESSING',
      claimedAt: now,
      leaseExpiresAt: new Date(now.getTime() + PROCESSING_LEASE_MS),
    },
  });

  if (claim.count === 0) {
    return 'not-claimed';
  }

  try {
    const delivery = await prisma.esigningEmailDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        envelope: {
          select: {
            id: true,
            tenantId: true,
            title: true,
            certificateId: true,
            createdById: true,
            createdBy: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            recipients: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            documents: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                fileName: true,
                signedStoragePath: true,
              },
            },
          },
        },
      },
    });

    if (!delivery) {
      throw new Error('Completion delivery not found');
    }
    if (delivery.envelope.documents.length === 0) {
      throw new Error('Completed envelope has no signed documents to deliver');
    }
    if (delivery.envelope.documents.some((document) => !document.signedStoragePath)) {
      throw new Error('Signed artifacts are not ready for delivery');
    }

    const signedBuffers = await Promise.all(
      delivery.envelope.documents.map(async (document) => ({
        id: document.id,
        fileName: document.fileName,
        signedBuffer: await storage.download(document.signedStoragePath as string),
      }))
    );
    const attachments = buildEmailAttachments({ documents: signedBuffers });
    const actorType = delivery.audience === 'SENDER' ? 'sender' : 'recipient';
    const recipientId =
      delivery.audience === 'RECIPIENT' ? delivery.recipientId ?? undefined : undefined;
    const documentLinks = await buildDeliveryDocumentLinks({
      envelopeId: delivery.envelope.id,
      actorType,
      recipientId,
      documents: delivery.envelope.documents.map((document) => ({
        id: document.id,
        fileName: document.fileName,
      })),
    });
    const recipientName =
      delivery.audience === 'SENDER'
        ? [delivery.envelope.createdBy.firstName, delivery.envelope.createdBy.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() || delivery.envelope.createdBy.email
        : delivery.envelope.recipients.find((recipient) => recipient.id === delivery.recipientId)?.name
          ?? 'there';

    const result = await sendEsigningCompletionEmail({
      to: delivery.toEmail,
      recipientName,
      envelopeTitle: delivery.envelope.title,
      certificateId: delivery.envelope.certificateId,
      documentLinks,
      attachments,
      actorType,
    });

    await prisma.esigningEmailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'SUCCEEDED',
        attemptCount: { increment: 1 },
        availableAt: null,
        claimedAt: null,
        leaseExpiresAt: null,
        lastAttemptedAt: now,
        sentAt: now,
        lastError: null,
      },
    });
    await prisma.esigningEmailDeliveryAttempt.create({
      data: {
        deliveryId,
        toEmail: delivery.toEmail,
        subject: delivery.subject,
        succeeded: true,
        providerMessageId: result.providerMessageId ?? null,
        attemptedAt: now,
      },
    });
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown delivery failure';
    const current = await prisma.esigningEmailDelivery.findUnique({
      where: { id: deliveryId },
      select: { attemptCount: true, toEmail: true, subject: true },
    });
    const attemptCount = (current?.attemptCount ?? 0) + 1;
    const status =
      attemptCount >= MAX_DELIVERY_ATTEMPTS ? 'FAILED_PERMANENT' : 'FAILED_RETRYABLE';

    await prisma.esigningEmailDelivery.update({
      where: { id: deliveryId },
      data: {
        status,
        attemptCount,
        availableAt:
          status === 'FAILED_RETRYABLE'
            ? new Date(Date.now() + retryDelay(attemptCount))
            : null,
        claimedAt: null,
        leaseExpiresAt: null,
        lastAttemptedAt: now,
        lastError: message,
      },
    });
    await prisma.esigningEmailDeliveryAttempt.create({
      data: {
        deliveryId,
        toEmail: current?.toEmail ?? '',
        subject: current?.subject ?? '',
        succeeded: false,
        error: message,
        attemptedAt: now,
      },
    });

    log.error('E-signing completion delivery failed', {
      deliveryId,
      attemptCount,
      status,
      error,
    });
    throw error;
  }
}

export async function processQueuedEsigningCompletionWork(input?: {
  limit?: number;
  concurrency?: number;
  leaseMs?: number;
}): Promise<{
  processed: number;
  artifactsCompleted: number;
  artifactsFailed: number;
  autoFiled: number;
  autoFileFailed: number;
  deliveriesSent: number;
  deliveryFailed: number;
}> {
  const limit = input?.limit ?? 5;
  const concurrency = Math.max(1, input?.concurrency ?? 1);
  const leaseMs = input?.leaseMs ?? PROCESSING_LEASE_MS;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);

  let artifactsCompleted = 0;
  let artifactsFailed = 0;
  let autoFiled = 0;
  let autoFileFailed = 0;
  let deliveriesSent = 0;
  let deliveryFailed = 0;

  const artifactCandidates = await prisma.esigningEnvelope.findMany({
    where: {
      status: 'COMPLETED',
      OR: [
        { pdfGenerationStatus: 'PENDING' },
        {
          pdfGenerationStatus: 'PROCESSING',
          pdfGenerationClaimedAt: { lt: staleBefore },
        },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  for (let index = 0; index < artifactCandidates.length; index += concurrency) {
    const batch = artifactCandidates.slice(index, index + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (candidate) => {
        const outcome = await generateEsigningEnvelopeArtifactsNow({ envelopeId: candidate.id });
        return outcome;
      })
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        artifactsCompleted += 1;
      } else {
        artifactsFailed += 1;
      }
    }
  }

  const autoFileCandidates = await prisma.esigningEnvelope.findMany({
    where: {
      status: 'COMPLETED',
      pdfGenerationStatus: 'COMPLETED',
      OR: [
        { autoFilingStatus: 'PENDING' },
        { autoFilingStatus: 'FAILED_RETRYABLE' },
        {
          autoFilingStatus: 'PROCESSING',
          autoFilingClaimedAt: { lt: staleBefore },
        },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  for (let index = 0; index < autoFileCandidates.length; index += concurrency) {
    const batch = autoFileCandidates.slice(index, index + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (candidate) => processEsigningAutoFileJob(candidate.id))
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        autoFiled += 1;
      } else {
        autoFileFailed += 1;
      }
    }
  }

  const deliveryIds = await claimCompletionDeliveries({ limit, leaseMs });
  for (let index = 0; index < deliveryIds.length; index += concurrency) {
    const batch = deliveryIds.slice(index, index + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (deliveryId) => processEsigningCompletionDelivery(deliveryId))
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        deliveriesSent += 1;
      } else {
        deliveryFailed += 1;
      }
    }
  }

  return {
    processed:
      artifactsCompleted + artifactsFailed + autoFiled + autoFileFailed + deliveriesSent + deliveryFailed,
    artifactsCompleted,
    artifactsFailed,
    autoFiled,
    autoFileFailed,
    deliveriesSent,
    deliveryFailed,
  };
}
