import { randomUUID } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import type { Prisma } from '@/generated/prisma';
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { hashBlake3, hashPassword } from '@/lib/encryption';
import { createAuditLog } from '@/lib/audit';
import { storage, StorageKeys } from '@/lib/storage';
import { ALLOWED_FILE_TYPES, validateFileContent } from '@/lib/file-validation';
import {
  createEsigningAccessLinkToken,
  buildEsigningSigningUrl,
  createEsigningAccessToken,
  hashEsigningAccessToken,
} from '@/lib/esigning-session';
import {
  ESIGNING_LIMITS,
  type CreateEsigningEnvelopeInput,
  type EsigningListQueryInput,
  type EsigningRecipientInput,
  type UpdateEsigningEnvelopeInput,
  type UpdateEsigningRecipientInput,
  getEsigningRecipientColor,
} from '@/lib/validations/esigning';
import type {
  EsigningEnvelopeDetailDto,
  EsigningEnvelopeListItem,
  EsigningManualLinkDto,
} from '@/types/esigning';
import { generateUniqueEsigningCertificateId } from '@/services/esigning-certificate.service';
import {
  sendEsigningExpiredEmailToSender,
  sendEsigningExpiryWarningEmailToSender,
  sendEsigningReminderEmail,
  sendEsigningRequestEmail,
  sendEsigningVoidedEmailToRecipient,
} from '@/services/esigning-notification.service';
import { generateEsigningEnvelopeArtifactsNow } from '@/services/esigning-pdf.service';
import {
  buildRecipientSigningOrder,
  canDeleteEnvelope,
  canMutateEnvelope,
  canReadEnvelope,
  createEnvelopeEvent,
  ensureDuplicateSignerEmails,
  ensureCompanyBelongsToTenant,
  formatUserName,
  getEnvelopeAggregate,
  getEnvelopeOrderBy,
  getInitialActiveSignerRecipientIds,
  resolveEsigningActorScope,
  selectNextQueuedSignerRecipients,
  serializeEnvelopeDetail,
  toIsoString,
  validateEnvelopeSendReadiness,
} from '@/services/esigning-envelope.lib';

const log = createLogger('esigning-envelope');

type NotificationRecipient = {
  id: string;
  name: string;
  email: string;
  accessMode: 'EMAIL_LINK' | 'EMAIL_WITH_CODE' | 'MANUAL_LINK';
};

type PreparedRecipientNotification = {
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  accessMode: 'EMAIL_LINK' | 'EMAIL_WITH_CODE' | 'MANUAL_LINK';
  accessTokenHash: string | null;
  rawToken: string | null;
  signingUrl: string;
};

function buildConsentDisclosureSnapshot(): Prisma.InputJsonValue {
  return {
    title: 'Electronic Signature Disclosure',
    locale: 'en-SG',
    body: [
      'By signing electronically, you agree to use electronic records and signatures for this transaction.',
      'Oakcloud records your name, email address, IP address, browser information, and signing timestamps for audit and verification purposes.',
      'You may decline to sign before completion.',
    ],
    privacyNotice:
      'Your IP address, browser information, and signature image may appear on the completion certificate for verification purposes.',
  };
}

function validateSigningOrderConfiguration(input: {
  envelopeSigningOrder: 'PARALLEL' | 'SEQUENTIAL' | 'MIXED';
  recipients: Array<{
    id: string;
    name: string;
    type: 'SIGNER' | 'CC';
    signingOrder: number | null;
  }>;
}): void {
  const signers = input.recipients.filter((recipient) => recipient.type === 'SIGNER');

  if (input.envelopeSigningOrder === 'PARALLEL') {
    return;
  }

  const signerOrders = signers.map((recipient) => recipient.signingOrder);
  if (signerOrders.some((order) => typeof order !== 'number')) {
    throw new Error('Every signer must have a signing order before sending');
  }

  if (input.envelopeSigningOrder === 'SEQUENTIAL') {
    const orders = [...new Set(signerOrders as number[])].sort((left, right) => left - right);

    if (orders.length !== signers.length) {
      throw new Error('Sequential signing requires a unique order for each signer');
    }

    orders.forEach((order, index) => {
      const expected = index + 1;
      if (order !== expected) {
        throw new Error(`Signing order has a gap: missing ${expected}`);
      }
    });
    return;
  }

  const orders = [...new Set(signerOrders as number[])].sort((left, right) => left - right);
  orders.forEach((order, index) => {
    const expected = index + 1;
    if (order !== expected) {
      throw new Error(`Signing order has a gap: missing ${expected}`);
    }
  });
}

function prepareRecipientNotifications(recipients: NotificationRecipient[]): {
  updates: PreparedRecipientNotification[];
  manualLinks: EsigningManualLinkDto[];
} {
  const updates: PreparedRecipientNotification[] = [];
  const manualLinks: EsigningManualLinkDto[] = [];

  for (const recipient of recipients) {
    const rawToken = createEsigningAccessToken();
    const signingUrl = buildEsigningSigningUrl(rawToken);
    const prepared: PreparedRecipientNotification = {
      recipientId: recipient.id,
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      accessMode: recipient.accessMode,
      accessTokenHash: hashEsigningAccessToken(rawToken),
      rawToken,
      signingUrl,
    };
    updates.push(prepared);

    if (recipient.accessMode === 'MANUAL_LINK') {
      manualLinks.push({
        recipientId: recipient.id,
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        signingUrl,
      });
    }
  }

  return { updates, manualLinks };
}

async function prepareReminderNotifications(
  envelopeId: string,
  recipients: Array<
    NotificationRecipient & {
      sessionVersion: number;
    }
  >
): Promise<PreparedRecipientNotification[]> {
  return Promise.all(
    recipients.map(async (recipient) => {
      const signingToken = await createEsigningAccessLinkToken({
        recipientId: recipient.id,
        envelopeId,
        sessionVersion: recipient.sessionVersion,
      });

      return {
        recipientId: recipient.id,
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        accessMode: recipient.accessMode,
        accessTokenHash: null,
        rawToken: null,
        signingUrl: buildEsigningSigningUrl(signingToken),
      };
    })
  );
}

async function deliverPreparedNotifications(input: {
  senderName: string;
  envelopeTitle: string;
  message?: string | null;
  expiresAt?: Date | null;
  notifications: PreparedRecipientNotification[];
  kind?: 'request' | 'reminder';
}): Promise<void> {
  for (const notification of input.notifications) {
    if (notification.accessMode === 'MANUAL_LINK') {
      continue;
    }

    const emailInput = {
      to: notification.recipientEmail,
      recipientName: notification.recipientName,
      senderName: input.senderName,
      envelopeTitle: input.envelopeTitle,
      message: input.message,
      signingUrl: notification.signingUrl,
      accessMode: notification.accessMode,
      expiresAt: input.expiresAt,
    } as const;

    if (input.kind === 'reminder') {
      await sendEsigningReminderEmail(emailInput);
      continue;
    }

    await sendEsigningRequestEmail(emailInput);
  }
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function diffInWholeDays(left: Date, right: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((startOfDay(left).getTime() - startOfDay(right).getTime()) / millisecondsPerDay);
}

function getEnvelopeSenderName(input: {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  email: string;
}): string {
  return formatUserName(input.firstName, input.lastName, input.email);
}

function getSentAtFromEvents(
  events: Array<{
    action: string;
    createdAt: Date;
  }>,
  fallback: Date
): Date {
  return events.find((event) => event.action === 'SENT')?.createdAt ?? fallback;
}

function isExpiryWarningEvent(event: {
  action: string;
  metadata: Prisma.JsonValue | null;
}, thresholdDays: number): boolean {
  if (event.action !== 'REMINDER_SENT' || !event.metadata || Array.isArray(event.metadata)) {
    return false;
  }

  const metadata = event.metadata as Record<string, unknown>;
  return metadata.kind === 'expiry_warning' && metadata.thresholdDays === thresholdDays;
}

function buildDuplicateEnvelopeTitle(title: string): string {
  const suffix = ' (Copy)';
  if (title.length + suffix.length <= 160) {
    return `${title}${suffix}`;
  }

  return `${title.slice(0, 160 - suffix.length).trimEnd()}${suffix}`;
}

export async function listEsigningEnvelopes(
  session: SessionUser,
  tenantId: string,
  query: EsigningListQueryInput
): Promise<{
  envelopes: EsigningEnvelopeListItem[];
  total: number;
  page: number;
  limit: number;
  statusCounts: Record<
    'DRAFT' | 'SENT' | 'IN_PROGRESS' | 'COMPLETED' | 'VOIDED' | 'DECLINED' | 'EXPIRED',
    number
  >;
}> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const baseWhere: Prisma.EsigningEnvelopeWhereInput = {
    tenantId,
    deletedAt: null,
  };

  if (query.companyId) {
    baseWhere.companyId = query.companyId;
  }
  if (query.query) {
    baseWhere.OR = [
      { title: { contains: query.query, mode: 'insensitive' } },
      { recipients: { some: { name: { contains: query.query, mode: 'insensitive' } } } },
      { recipients: { some: { email: { contains: query.query, mode: 'insensitive' } } } },
    ];
  }
  if (!scope.canReadAll || query.createdBy === 'me') {
    baseWhere.createdById = session.id;
  }

  const where: Prisma.EsigningEnvelopeWhereInput = { ...baseWhere };
  if (query.statuses?.length) {
    where.status = { in: query.statuses };
  } else if (query.status) {
    where.status = query.status;
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const [total, envelopes, groupedStatusCounts] = await prisma.$transaction([
    prisma.esigningEnvelope.count({ where }),
    prisma.esigningEnvelope.findMany({
      where,
      orderBy: getEnvelopeOrderBy(query),
      skip,
      take: limit,
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        recipients: {
          orderBy: [
            { signingOrder: 'asc' },
            { createdAt: 'asc' },
          ],
          select: {
            id: true,
            name: true,
            email: true,
            type: true,
            status: true,
            signingOrder: true,
          },
        },
        documents: {
          select: { id: true },
        },
      },
    }),
    prisma.esigningEnvelope.groupBy({
      by: ['status'],
      where: baseWhere,
      orderBy: {
        status: 'asc',
      },
      _count: {
        status: true,
      },
    }),
  ]);

  const statusCounts = {
    DRAFT: 0,
    SENT: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    VOIDED: 0,
    DECLINED: 0,
    EXPIRED: 0,
  };

  groupedStatusCounts.forEach((entry) => {
    const count =
      typeof entry._count === 'object' && entry._count
        ? (entry._count.status ?? 0)
        : 0;
    statusCounts[entry.status] = count;
  });

  return {
    envelopes: envelopes.map((envelope) => ({
      id: envelope.id,
      tenantId: envelope.tenantId,
      title: envelope.title,
      status: envelope.status,
      pdfGenerationStatus: envelope.pdfGenerationStatus ?? null,
      signingOrder: envelope.signingOrder,
      certificateId: envelope.certificateId,
      createdAt: envelope.createdAt.toISOString(),
      updatedAt: envelope.updatedAt.toISOString(),
      completedAt: toIsoString(envelope.completedAt),
      expiresAt: toIsoString(envelope.expiresAt),
      companyId: envelope.companyId,
      companyName: envelope.company?.name ?? null,
      createdById: envelope.createdById,
      createdByName: formatUserName(envelope.createdBy.firstName, envelope.createdBy.lastName, envelope.createdBy.email),
      canDelete: envelope.status === 'DRAFT' && canDeleteEnvelope(scope, session, envelope.createdById),
      canVoid:
        ['SENT', 'IN_PROGRESS'].includes(envelope.status) &&
        (scope.canManage || canMutateEnvelope(scope, session, envelope.createdById)),
      canDuplicate: scope.canCreate && canReadEnvelope(scope, session, envelope.createdById),
      canResend:
        ['SENT', 'IN_PROGRESS'].includes(envelope.status) &&
        (scope.canManage || canMutateEnvelope(scope, session, envelope.createdById)) &&
        envelope.recipients.some(
          (recipient) =>
            recipient.type === 'SIGNER' && ['NOTIFIED', 'VIEWED'].includes(recipient.status)
        ),
      canRetryPdf:
        envelope.status === 'COMPLETED' &&
        envelope.pdfGenerationStatus !== 'COMPLETED' &&
        (scope.canManage || canMutateEnvelope(scope, session, envelope.createdById)),
      resendableRecipientCount: envelope.recipients.filter(
        (recipient) =>
          recipient.type === 'SIGNER' && ['NOTIFIED', 'VIEWED'].includes(recipient.status)
      ).length,
      recipientCount: envelope.recipients.length,
      signerCount: envelope.recipients.filter((recipient) => recipient.type === 'SIGNER').length,
      documentCount: envelope.documents.length,
      recipients: envelope.recipients.map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        type: recipient.type,
        status: recipient.status,
        signingOrder: recipient.signingOrder,
      })),
    })),
    total,
    page,
    limit,
    statusCounts,
  };
}

export async function getEsigningEnvelopeDetail(
  session: SessionUser,
  tenantId: string,
  envelopeId: string
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const aggregate = await getEnvelopeAggregate(envelopeId, tenantId);

  if (!canReadEnvelope(scope, session, aggregate.envelope.createdById)) {
    throw new Error('Forbidden');
  }

  return serializeEnvelopeDetail({
    envelope: aggregate.envelope,
    fieldValues: aggregate.fieldValues,
    scope,
    session,
  });
}

export async function createEsigningEnvelope(
  session: SessionUser,
  tenantId: string,
  input: CreateEsigningEnvelopeInput
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  if (!scope.canCreate) {
    throw new Error('Permission denied: esigning:create');
  }

  await ensureCompanyBelongsToTenant(tenantId, input.companyId ?? null);

  const certificateId = await generateUniqueEsigningCertificateId();
  const envelope = await prisma.esigningEnvelope.create({
    data: {
      tenantId,
      createdById: session.id,
      title: input.title,
      message: input.message ?? null,
      signingOrder: input.signingOrder,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      reminderFrequencyDays: input.reminderFrequencyDays ?? null,
      reminderStartDays: input.reminderStartDays ?? null,
      expiryWarningDays: input.expiryWarningDays ?? null,
      companyId: input.companyId ?? null,
      certificateId,
    },
  });

  await createEnvelopeEvent({
    envelopeId: envelope.id,
    tenantId,
    action: 'CREATED',
    metadata: { title: envelope.title },
  });

  return getEsigningEnvelopeDetail(session, tenantId, envelope.id);
}

export async function updateDraftEsigningEnvelope(
  session: SessionUser,
  tenantId: string,
  envelopeId: string,
  input: UpdateEsigningEnvelopeInput
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    select: {
      id: true,
      status: true,
      createdById: true,
      signingOrder: true,
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (envelope.status !== 'DRAFT') {
    throw new Error('Only draft envelopes can be edited');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }

  await ensureCompanyBelongsToTenant(tenantId, input.companyId ?? null);

  await prisma.$transaction(async (tx) => {
    await tx.esigningEnvelope.update({
      where: { id: envelopeId },
      data: {
        title: input.title,
        message: input.message,
        companyId: input.companyId,
        signingOrder: input.signingOrder,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : input.expiresAt === null ? null : undefined,
        reminderFrequencyDays: input.reminderFrequencyDays,
        reminderStartDays: input.reminderStartDays,
        expiryWarningDays: input.expiryWarningDays,
      },
    });

    if (!input.signingOrder || input.signingOrder === envelope.signingOrder) {
      return;
    }

    const recipients = await tx.esigningEnvelopeRecipient.findMany({
      where: { envelopeId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
      },
    });

    if (input.signingOrder === 'PARALLEL') {
      await tx.esigningEnvelopeRecipient.updateMany({
        where: {
          envelopeId,
          type: 'SIGNER',
        },
        data: {
          signingOrder: null,
        },
      });
      return;
    }

    const signerIds = recipients
      .filter((recipient) => recipient.type === 'SIGNER')
      .map((recipient) => recipient.id);

    for (const [index, recipientId] of signerIds.entries()) {
      await tx.esigningEnvelopeRecipient.update({
        where: { id: recipientId },
        data: {
          signingOrder: index + 1,
        },
      });
    }
  });

  return getEsigningEnvelopeDetail(session, tenantId, envelopeId);
}

export async function duplicateEsigningEnvelope(
  session: SessionUser,
  tenantId: string,
  envelopeId: string
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  if (!scope.canCreate) {
    throw new Error('Permission denied: esigning:create');
  }

  const sourceEnvelope = await prisma.esigningEnvelope.findFirst({
    where: {
      id: envelopeId,
      tenantId,
      deletedAt: null,
    },
    include: {
      documents: {
        orderBy: { sortOrder: 'asc' },
      },
      recipients: {
        orderBy: [
          { signingOrder: 'asc' },
          { createdAt: 'asc' },
        ],
      },
      fieldDefinitions: {
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    },
  });

  if (!sourceEnvelope) {
    throw new Error('Envelope not found');
  }
  if (!canReadEnvelope(scope, session, sourceEnvelope.createdById)) {
    throw new Error('Forbidden');
  }

  const duplicatedEnvelopeId = randomUUID();
  const certificateId = await generateUniqueEsigningCertificateId();
  const duplicatedDocuments = await Promise.all(
    sourceEnvelope.documents.map(async (document) => {
      const duplicatedDocumentId = randomUUID();
      const extension =
        StorageKeys.getExtension(document.fileName, 'application/pdf') || '.pdf';
      const storagePath = StorageKeys.esigningOriginalDocument(
        tenantId,
        duplicatedEnvelopeId,
        duplicatedDocumentId,
        extension
      );

      await storage.copy(document.storagePath, storagePath);

      return {
        sourceId: document.id,
        id: duplicatedDocumentId,
        storagePath,
        fileName: document.fileName,
        fileSize: document.fileSize,
        pageCount: document.pageCount,
        originalHash: document.originalHash,
        sortOrder: document.sortOrder,
      };
    })
  );

  const recipientIdMap = new Map<string, string>();
  const duplicatedRecipients = sourceEnvelope.recipients.map((recipient) => {
    const duplicatedRecipientId = randomUUID();
    recipientIdMap.set(recipient.id, duplicatedRecipientId);

    return {
      id: duplicatedRecipientId,
      name: recipient.name,
      email: recipient.email,
      type: recipient.type,
      signingOrder: recipient.signingOrder,
      accessMode: recipient.accessMode,
      accessCodeHash: recipient.accessCodeHash,
      colorTag: recipient.colorTag,
    };
  });

  const documentIdMap = new Map(
    duplicatedDocuments.map((document) => [document.sourceId, document.id])
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.esigningEnvelope.create({
        data: {
          id: duplicatedEnvelopeId,
          tenantId,
          createdById: session.id,
          title: buildDuplicateEnvelopeTitle(sourceEnvelope.title),
          message: sourceEnvelope.message,
          signingOrder: sourceEnvelope.signingOrder,
          expiresAt: sourceEnvelope.expiresAt,
          reminderFrequencyDays: sourceEnvelope.reminderFrequencyDays,
          reminderStartDays: sourceEnvelope.reminderStartDays,
          expiryWarningDays: sourceEnvelope.expiryWarningDays,
          companyId: sourceEnvelope.companyId,
          certificateId,
        },
      });

      if (duplicatedDocuments.length > 0) {
        await tx.esigningEnvelopeDocument.createMany({
          data: duplicatedDocuments.map((document) => ({
            id: document.id,
            tenantId,
            envelopeId: duplicatedEnvelopeId,
            fileName: document.fileName,
            storagePath: document.storagePath,
            fileSize: document.fileSize,
            pageCount: document.pageCount,
            originalHash: document.originalHash,
            sortOrder: document.sortOrder,
          })),
        });
      }

      if (duplicatedRecipients.length > 0) {
        await tx.esigningEnvelopeRecipient.createMany({
          data: duplicatedRecipients.map((recipient) => ({
            id: recipient.id,
            tenantId,
            envelopeId: duplicatedEnvelopeId,
            type: recipient.type,
            name: recipient.name,
            email: recipient.email,
            signingOrder: recipient.signingOrder,
            accessMode: recipient.accessMode,
            accessCodeHash: recipient.accessCodeHash,
            colorTag: recipient.colorTag,
          })),
        });
      }

      if (sourceEnvelope.fieldDefinitions.length > 0) {
        await tx.esigningDocumentFieldDefinition.createMany({
          data: sourceEnvelope.fieldDefinitions.map((field) => {
            const documentId = documentIdMap.get(field.documentId);
            const recipientId = recipientIdMap.get(field.recipientId);
            if (!documentId || !recipientId) {
              throw new Error('Failed to duplicate field mappings');
            }

            return {
              id: randomUUID(),
              tenantId,
              envelopeId: duplicatedEnvelopeId,
              documentId,
              recipientId,
              type: field.type,
              pageNumber: field.pageNumber,
              xPercent: field.xPercent,
              yPercent: field.yPercent,
              widthPercent: field.widthPercent,
              heightPercent: field.heightPercent,
              required: field.required,
              label: field.label,
              placeholder: field.placeholder,
              sortOrder: field.sortOrder,
            };
          }),
        });
      }

      await tx.esigningEnvelopeEvent.create({
        data: {
          tenantId,
          envelopeId: duplicatedEnvelopeId,
          action: 'CREATED',
          metadata: {
            duplicatedFromEnvelopeId: sourceEnvelope.id,
          },
        },
      });
    });
  } catch (error) {
    await storage
      .deletePrefix(StorageKeys.esigningEnvelopePrefix(tenantId, duplicatedEnvelopeId))
      .catch((storageError) => {
        log.warn('Failed to clean up duplicated envelope storage after error', {
          envelopeId: duplicatedEnvelopeId,
          storageError,
        });
      });
    throw error;
  }

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: sourceEnvelope.companyId ?? undefined,
    action: 'CREATE',
    entityType: 'EsigningEnvelope',
    entityId: duplicatedEnvelopeId,
    entityName: buildDuplicateEnvelopeTitle(sourceEnvelope.title),
    summary: `Duplicated e-signing envelope "${sourceEnvelope.title}"`,
    metadata: {
      duplicatedFromEnvelopeId: sourceEnvelope.id,
    },
  });

  return getEsigningEnvelopeDetail(session, tenantId, duplicatedEnvelopeId);
}

export async function deleteDraftEsigningEnvelope(
  session: SessionUser,
  tenantId: string,
  envelopeId: string
): Promise<void> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    select: {
      id: true,
      status: true,
      createdById: true,
      title: true,
      companyId: true,
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (envelope.status !== 'DRAFT') {
    throw new Error('Only draft envelopes can be deleted');
  }
  if (!canDeleteEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }

  await prisma.esigningEnvelope.delete({
    where: { id: envelopeId },
  });

  try {
    await storage.deletePrefix(StorageKeys.esigningEnvelopePrefix(tenantId, envelopeId));
  } catch (error) {
    log.warn('Failed to delete draft envelope storage prefix', { envelopeId, error });
  }

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'DELETE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `Deleted draft e-signing envelope "${envelope.title}"`,
  });
}

export async function addEsigningEnvelopeRecipient(
  session: SessionUser,
  tenantId: string,
  envelopeId: string,
  input: EsigningRecipientInput
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    include: {
      recipients: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          email: true,
          signingOrder: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (envelope.status !== 'DRAFT') {
    throw new Error('Recipients can only be added while the envelope is a draft');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }
  if (envelope.recipients.length >= ESIGNING_LIMITS.MAX_RECIPIENTS) {
    throw new Error(`An envelope can have at most ${ESIGNING_LIMITS.MAX_RECIPIENTS} recipients`);
  }

  const signingOrder = buildRecipientSigningOrder({
    envelopeSigningOrder: envelope.signingOrder,
    requestedSigningOrder: input.signingOrder ?? null,
    recipientType: input.type,
    existingRecipients: envelope.recipients.map((recipient) => ({
      type: recipient.type,
      signingOrder: recipient.signingOrder,
    })),
  });

  ensureDuplicateSignerEmails(
    [
      ...envelope.recipients.map((recipient) => ({
        id: recipient.id,
        email: recipient.email,
        type: recipient.type,
      })),
      {
        id: input.id ?? `new:${input.email}`,
        email: input.email,
        type: input.type,
      },
    ],
  );

  const signerCount = envelope.recipients.filter((recipient) => recipient.type === 'SIGNER').length;

  await prisma.esigningEnvelopeRecipient.create({
    data: {
      tenantId,
      envelopeId,
      type: input.type,
      name: input.name,
      email: input.email,
      signingOrder,
      accessMode: input.accessMode,
      accessCodeHash: input.accessCode ? hashPassword(input.accessCode) : null,
      colorTag: input.colorTag ?? getEsigningRecipientColor(signerCount),
      status: envelope.signingOrder === 'PARALLEL' && input.type === 'SIGNER' ? 'QUEUED' : 'QUEUED',
    },
  });

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'CREATE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `Added recipient "${input.name}" to e-signing envelope "${envelope.title}"`,
    metadata: {
      recipientEmail: input.email,
      recipientType: input.type,
      accessMode: input.accessMode,
    },
  });

  return getEsigningEnvelopeDetail(session, tenantId, envelopeId);
}

export async function updateEsigningEnvelopeRecipient(
  session: SessionUser,
  tenantId: string,
  envelopeId: string,
  recipientId: string,
  input: UpdateEsigningRecipientInput
): Promise<{
  envelope: EsigningEnvelopeDetailDto;
  manualLinks: EsigningManualLinkDto[];
}> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    include: {
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      recipients: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }

  const recipient = envelope.recipients.find((entry) => entry.id === recipientId);
  if (!recipient) {
    throw new Error('Recipient not found');
  }

  const nextType = input.type ?? recipient.type;
  const nextEmail = input.email ?? recipient.email;
  const nextName = input.name ?? recipient.name;

  if (envelope.status !== 'DRAFT') {
    if (recipient.status === 'SIGNED' || recipient.status === 'DECLINED') {
      throw new Error('Completed or declined recipients cannot be corrected');
    }

    const disallowedKeys = ['type', 'signingOrder', 'accessMode', 'accessCode', 'colorTag'].filter(
      (key) => key in input
    );
    if (disallowedKeys.length > 0) {
      throw new Error('Only recipient name and email can be corrected after send');
    }
  }

  if (nextType === 'CC') {
    const assignedFieldCount = await prisma.esigningDocumentFieldDefinition.count({
      where: {
        envelopeId,
        recipientId,
      },
    });
    if (assignedFieldCount > 0) {
      throw new Error('Recipients with assigned fields cannot be converted to CC');
    }
  }

  ensureDuplicateSignerEmails(
    envelope.recipients.map((entry) => ({
      id: entry.id,
      email: entry.id === recipientId ? nextEmail : entry.email,
      type: entry.id === recipientId ? nextType : entry.type,
    })),
    envelope.status === 'DRAFT' ? undefined : undefined
  );

  const nextSigningOrder =
    envelope.status === 'DRAFT'
      ? buildRecipientSigningOrder({
          envelopeSigningOrder: envelope.signingOrder,
          requestedSigningOrder:
            input.signingOrder === undefined ? recipient.signingOrder : input.signingOrder,
          recipientType: nextType,
          existingRecipients: envelope.recipients
            .filter((entry) => entry.id !== recipientId)
            .map((entry) => ({
              type: entry.type,
              signingOrder: entry.signingOrder,
            })),
        })
      : recipient.signingOrder;

  let manualLinks: EsigningManualLinkDto[] = [];
  let notifications: PreparedRecipientNotification[] = [];

  if (envelope.status !== 'DRAFT' && (nextEmail !== recipient.email || nextName !== recipient.name)) {
    const isActiveRecipient = recipient.type === 'SIGNER' && ['NOTIFIED', 'VIEWED'].includes(recipient.status);

    if (isActiveRecipient) {
      const prepared = prepareRecipientNotifications([
        {
          id: recipient.id,
          name: nextName,
          email: nextEmail,
          accessMode: recipient.accessMode,
        },
      ]);
      manualLinks = prepared.manualLinks;
      notifications = prepared.updates;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.esigningEnvelopeRecipient.update({
      where: { id: recipientId },
      data: {
        name: nextName,
        email: nextEmail,
        type: envelope.status === 'DRAFT' ? nextType : undefined,
        signingOrder: envelope.status === 'DRAFT' ? nextSigningOrder : undefined,
        accessMode: envelope.status === 'DRAFT' ? input.accessMode ?? recipient.accessMode : undefined,
        accessCodeHash:
          envelope.status === 'DRAFT'
            ? input.accessCode === undefined
              ? recipient.accessCodeHash
              : input.accessCode
                ? hashPassword(input.accessCode)
                : null
            : undefined,
        colorTag: envelope.status === 'DRAFT' ? input.colorTag ?? recipient.colorTag : undefined,
        sessionVersion:
          envelope.status === 'DRAFT'
            ? undefined
            : { increment: 1 },
        accessTokenHash:
          envelope.status === 'DRAFT'
            ? undefined
            : notifications[0]?.accessTokenHash ?? null,
      },
    });

    if (envelope.status !== 'DRAFT' && (nextEmail !== recipient.email || nextName !== recipient.name)) {
      await tx.esigningEnvelopeEvent.create({
        data: {
          tenantId,
          envelopeId,
          recipientId,
          action: 'CORRECTED',
          metadata: {
            previousName: recipient.name,
            previousEmail: recipient.email,
            nextName,
            nextEmail,
          },
        },
      });
    }
  });

  if (notifications.length > 0) {
    const senderName = formatUserName(
      envelope.createdBy.firstName,
      envelope.createdBy.lastName,
      envelope.createdBy.email
    );
    await deliverPreparedNotifications({
      senderName,
      envelopeTitle: envelope.title,
      message: envelope.message,
      expiresAt: envelope.expiresAt,
      notifications,
    });
  }

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'UPDATE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary:
      envelope.status === 'DRAFT'
        ? `Updated recipient "${nextName}" on draft e-signing envelope "${envelope.title}"`
        : `Corrected recipient "${nextName}" on e-signing envelope "${envelope.title}"`,
    metadata: {
      recipientId,
      previousName: recipient.name,
      previousEmail: recipient.email,
      nextName,
      nextEmail,
      envelopeStatus: envelope.status,
    },
  });

  return {
    envelope: await getEsigningEnvelopeDetail(session, tenantId, envelopeId),
    manualLinks,
  };
}

export async function removeEsigningEnvelopeRecipient(
  session: SessionUser,
  tenantId: string,
  envelopeId: string,
  recipientId: string
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    include: {
      company: {
        select: {
          id: true,
        },
      },
      recipients: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (envelope.status !== 'DRAFT') {
    throw new Error('Recipients can only be removed while the envelope is a draft');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }
  if (!envelope.recipients.some((recipient) => recipient.id === recipientId)) {
    throw new Error('Recipient not found');
  }

  const recipient = envelope.recipients.find((entry) => entry.id === recipientId)!;

  await prisma.esigningEnvelopeRecipient.delete({
    where: { id: recipientId },
  });

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'DELETE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `Removed recipient "${recipient.name}" from e-signing envelope "${envelope.title}"`,
    metadata: {
      recipientId,
      recipientEmail: recipient.email,
    },
  });

  return getEsigningEnvelopeDetail(session, tenantId, envelopeId);
}

export async function uploadEsigningEnvelopeDocument(
  session: SessionUser,
  tenantId: string,
  envelopeId: string,
  file: File
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    include: {
      documents: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          pageCount: true,
          sortOrder: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (envelope.status !== 'DRAFT') {
    throw new Error('Documents can only be uploaded while the envelope is a draft');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }
  if (envelope.documents.length >= ESIGNING_LIMITS.MAX_DOCUMENTS) {
    throw new Error(`An envelope can contain at most ${ESIGNING_LIMITS.MAX_DOCUMENTS} documents`);
  }
  if (file.size > ESIGNING_LIMITS.MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds the maximum allowed size');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = validateFileContent(buffer, ALLOWED_FILE_TYPES.DOCUMENT, file.type);
  if (!validation.valid) {
    throw new Error(validation.error || 'Only PDF files are supported');
  }

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch (error) {
    throw new Error(
      `Unable to parse the PDF${error instanceof Error && error.message ? `: ${error.message}` : ''}`
    );
  }

  const pageCount = pdfDoc.getPageCount();
  if (pageCount > ESIGNING_LIMITS.MAX_PAGES_PER_DOCUMENT) {
    throw new Error(
      `A single document cannot exceed ${ESIGNING_LIMITS.MAX_PAGES_PER_DOCUMENT} pages`
    );
  }

  const totalPages = envelope.documents.reduce((sum, document) => sum + document.pageCount, 0) + pageCount;
  if (totalPages > ESIGNING_LIMITS.MAX_TOTAL_PAGES) {
    throw new Error(`An envelope cannot exceed ${ESIGNING_LIMITS.MAX_TOTAL_PAGES} pages in total`);
  }

  const documentId = randomUUID();
  const storagePath = StorageKeys.esigningOriginalDocument(tenantId, envelopeId, documentId, '.pdf');
  const sortOrder = envelope.documents.length;

  await storage.upload(storagePath, buffer, {
    contentType: 'application/pdf',
    metadata: {
      tenantId,
      envelopeId,
      documentId,
      originalFileName: file.name,
    },
  });

  await prisma.esigningEnvelopeDocument.create({
    data: {
      id: documentId,
      tenantId,
      envelopeId,
      fileName: file.name,
      storagePath,
      originalHash: hashBlake3(buffer),
      pageCount,
      sortOrder,
      fileSize: file.size,
    },
  });

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'UPLOAD',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `Uploaded document "${file.name}" to e-signing envelope "${envelope.title}"`,
    metadata: {
      documentId,
      pageCount,
      fileSize: file.size,
    },
  });

  return getEsigningEnvelopeDetail(session, tenantId, envelopeId);
}

export async function deleteEsigningEnvelopeDocument(
  session: SessionUser,
  tenantId: string,
  envelopeId: string,
  documentId: string
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    include: {
      documents: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          sortOrder: true,
          storagePath: true,
          signedStoragePath: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (envelope.status !== 'DRAFT') {
    throw new Error('Documents can only be removed while the envelope is a draft');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }

  const document = envelope.documents.find((entry) => entry.id === documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.esigningEnvelopeDocument.delete({
      where: { id: documentId },
    });

    const remaining = envelope.documents.filter((entry) => entry.id !== documentId);
    for (const [index, entry] of remaining.entries()) {
      if (entry.sortOrder === index) {
        continue;
      }
      await tx.esigningEnvelopeDocument.update({
        where: { id: entry.id },
        data: { sortOrder: index },
      });
    }
  });

  try {
    await storage.delete(document.storagePath);
    if (document.signedStoragePath) {
      await storage.delete(document.signedStoragePath);
    }
  } catch (error) {
    log.warn('Failed to remove envelope document asset', { envelopeId, documentId, error });
  }

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'DELETE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `Removed document from e-signing envelope "${envelope.title}"`,
    metadata: {
      documentId,
    },
  });

  return getEsigningEnvelopeDetail(session, tenantId, envelopeId);
}

export async function reorderEsigningEnvelopeDocument(
  session: SessionUser,
  tenantId: string,
  envelopeId: string,
  documentId: string,
  sortOrder: number
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    include: {
      documents: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          sortOrder: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (envelope.status !== 'DRAFT') {
    throw new Error('Documents can only be reordered while the envelope is a draft');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }

  const currentIndex = envelope.documents.findIndex((entry) => entry.id === documentId);
  if (currentIndex === -1) {
    throw new Error('Document not found');
  }

  const boundedIndex = Math.max(0, Math.min(sortOrder, envelope.documents.length - 1));
  const reordered = [...envelope.documents];
  const [selected] = reordered.splice(currentIndex, 1);
  reordered.splice(boundedIndex, 0, selected);

  await prisma.$transaction(
    reordered.map((entry, index) =>
      prisma.esigningEnvelopeDocument.update({
        where: { id: entry.id },
        data: { sortOrder: index },
      })
    )
  );

  return getEsigningEnvelopeDetail(session, tenantId, envelopeId);
}

export async function reorderEsigningEnvelopeRecipients(
  session: SessionUser,
  tenantId: string,
  envelopeId: string,
  input: {
    recipientIds?: string[];
    recipients?: Array<{ recipientId: string; signingOrder: number }>;
  }
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    include: {
      recipients: {
        orderBy: [
          { signingOrder: 'asc' },
          { createdAt: 'asc' },
        ],
        select: {
          id: true,
          name: true,
          type: true,
          signingOrder: true,
          createdAt: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (envelope.status !== 'DRAFT') {
    throw new Error('Recipients can only be reordered while the envelope is a draft');
  }
  if (envelope.signingOrder === 'PARALLEL') {
    throw new Error('Enable sequential signing before reordering recipients');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }

  const signerRecipients = envelope.recipients.filter((recipient) => recipient.type === 'SIGNER');
  const signerIds = signerRecipients.map((recipient) => recipient.id);
  const recipientIds = input.recipientIds ?? input.recipients?.map((recipient) => recipient.recipientId) ?? [];

  if (signerIds.length !== recipientIds.length) {
    throw new Error('Recipient reorder payload must include every signer exactly once');
  }

  const expected = new Set(signerIds);
  const provided = new Set(recipientIds);
  if (expected.size !== provided.size || signerIds.some((id) => !provided.has(id))) {
    throw new Error('Recipient reorder payload does not match the envelope signers');
  }

  const signingOrderByRecipientId = new Map<string, number>();

  if (input.recipients?.length) {
    input.recipients.forEach((recipient) => {
      signingOrderByRecipientId.set(recipient.recipientId, recipient.signingOrder);
    });

    validateSigningOrderConfiguration({
      envelopeSigningOrder: envelope.signingOrder,
      recipients: envelope.recipients.map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        type: recipient.type,
        signingOrder:
          recipient.type === 'SIGNER'
            ? signingOrderByRecipientId.get(recipient.id) ?? null
            : recipient.signingOrder,
      })),
    });
  } else {
    recipientIds.forEach((recipientId, index) => {
      signingOrderByRecipientId.set(recipientId, index + 1);
    });
  }

  await prisma.$transaction(
    signerRecipients.map((recipient) =>
      prisma.esigningEnvelopeRecipient.update({
        where: { id: recipient.id },
        data: { signingOrder: signingOrderByRecipientId.get(recipient.id) ?? null },
      })
    )
  );

  return getEsigningEnvelopeDetail(session, tenantId, envelopeId);
}

export async function sendEsigningEnvelope(
  session: SessionUser,
  tenantId: string,
  envelopeId: string
): Promise<{
  envelope: EsigningEnvelopeDetailDto;
  manualLinks: EsigningManualLinkDto[];
}> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const aggregate = await getEnvelopeAggregate(envelopeId, tenantId);
  const { envelope } = aggregate;

  if (envelope.status !== 'DRAFT') {
    throw new Error('Only draft envelopes can be sent');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }

  validateEnvelopeSendReadiness({
    maxTotalFileSizeBytes: ESIGNING_LIMITS.MAX_TOTAL_FILE_SIZE_BYTES,
    documents: envelope.documents.map((document) => ({
      fileSize: document.fileSize,
    })),
    recipients: envelope.recipients.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      type: recipient.type,
      accessMode: recipient.accessMode,
      accessCodeHash: recipient.accessCodeHash,
    })),
    fieldDefinitions: envelope.fieldDefinitions.map((field) => ({
      recipientId: field.recipientId,
      type: field.type,
    })),
  });

  const totalPages = envelope.documents.reduce((sum, document) => sum + document.pageCount, 0);
  if (totalPages > ESIGNING_LIMITS.MAX_TOTAL_PAGES) {
    throw new Error(`An envelope cannot exceed ${ESIGNING_LIMITS.MAX_TOTAL_PAGES} pages in total`);
  }

  validateSigningOrderConfiguration({
    envelopeSigningOrder: envelope.signingOrder,
    recipients: envelope.recipients.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      type: recipient.type,
      signingOrder: recipient.signingOrder,
    })),
  });

  const initialRecipientIds = getInitialActiveSignerRecipientIds({
    envelopeSigningOrder: envelope.signingOrder,
    recipients: envelope.recipients.map((recipient) => ({
      id: recipient.id,
      type: recipient.type,
      signingOrder: recipient.signingOrder,
    })),
  });

  const activeRecipients = envelope.recipients.filter(
    (recipient) => recipient.type === 'SIGNER' && initialRecipientIds.includes(recipient.id)
  );

  const preparedNotifications = prepareRecipientNotifications(
    activeRecipients.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      accessMode: recipient.accessMode,
    }))
  );

  await prisma.$transaction(async (tx) => {
    await tx.esigningEnvelope.update({
      where: { id: envelopeId },
      data: {
        status: 'SENT',
        consentVersion: '1.0',
        consentDisclosureSnapshot: buildConsentDisclosureSnapshot(),
      },
    });

    for (const recipient of envelope.recipients) {
      const prepared = preparedNotifications.updates.find((entry) => entry.recipientId === recipient.id);
      await tx.esigningEnvelopeRecipient.update({
        where: { id: recipient.id },
        data: {
          status:
            recipient.type === 'SIGNER' && initialRecipientIds.includes(recipient.id)
              ? 'NOTIFIED'
              : 'QUEUED',
          accessTokenHash: prepared?.accessTokenHash ?? null,
          viewedAt: null,
          signedAt: null,
          declinedAt: null,
          declineReason: null,
        },
      });
    }

    if (envelope.fieldDefinitions.length > 0) {
      await tx.esigningDocumentFieldValue.createMany({
        data: envelope.fieldDefinitions.map((field) => ({
          tenantId,
          fieldDefinitionId: field.id,
          recipientId: field.recipientId,
          revision: 1,
        })),
        skipDuplicates: true,
      });
    }

    await tx.esigningEnvelopeEvent.create({
      data: {
        tenantId,
        envelopeId,
        action: 'SENT',
        metadata: {
          activeRecipientIds: initialRecipientIds,
        },
      },
    });
  });

  const senderName = formatUserName(
    envelope.createdBy.firstName,
    envelope.createdBy.lastName,
    envelope.createdBy.email
  );
  await deliverPreparedNotifications({
    senderName,
    envelopeTitle: envelope.title,
    message: envelope.message,
    expiresAt: envelope.expiresAt,
    notifications: preparedNotifications.updates,
  });

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'UPDATE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `Sent e-signing envelope "${envelope.title}"`,
    metadata: {
      recipientCount: envelope.recipients.length,
      documentCount: envelope.documents.length,
    },
  });

  return {
    envelope: await getEsigningEnvelopeDetail(session, tenantId, envelopeId),
    manualLinks: preparedNotifications.manualLinks,
  };
}

export async function resendEsigningEnvelopeRecipient(
  session: SessionUser,
  tenantId: string,
  envelopeId: string,
  recipientId: string
): Promise<{
  envelope: EsigningEnvelopeDetailDto;
  manualLinks: EsigningManualLinkDto[];
}> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    include: {
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      recipients: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (!['SENT', 'IN_PROGRESS'].includes(envelope.status)) {
    throw new Error('Only sent or in-progress envelopes can be resent');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById) && !scope.canManage) {
    throw new Error('Forbidden');
  }

  const recipient = envelope.recipients.find((entry) => entry.id === recipientId);
  if (!recipient) {
    throw new Error('Recipient not found');
  }
  if (recipient.type !== 'SIGNER') {
    throw new Error('Only signer recipients can receive signing links');
  }
  if (recipient.status === 'SIGNED' || recipient.status === 'DECLINED') {
    throw new Error('Completed or declined recipients cannot be resent');
  }

  const isActiveRecipient = ['NOTIFIED', 'VIEWED'].includes(recipient.status);
  let manualLinks: EsigningManualLinkDto[] = [];
  let notifications: PreparedRecipientNotification[] = [];

  if (isActiveRecipient) {
    const prepared = prepareRecipientNotifications([
      {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        accessMode: recipient.accessMode,
      },
    ]);
    manualLinks = prepared.manualLinks;
    notifications = prepared.updates;
  }

  await prisma.$transaction(async (tx) => {
    await tx.esigningEnvelopeRecipient.update({
      where: { id: recipientId },
      data: {
        sessionVersion: { increment: 1 },
        accessTokenHash: notifications[0]?.accessTokenHash ?? null,
      },
    });

    await tx.esigningEnvelopeEvent.create({
      data: {
        tenantId,
        envelopeId,
        recipientId,
        action: 'REMINDER_SENT',
        metadata: {
          resent: true,
          activeRecipient: isActiveRecipient,
        },
      },
    });
  });

  if (notifications.length > 0) {
    const senderName = formatUserName(
      envelope.createdBy.firstName,
      envelope.createdBy.lastName,
      envelope.createdBy.email
    );
    await deliverPreparedNotifications({
      senderName,
      envelopeTitle: envelope.title,
      message: envelope.message,
      expiresAt: envelope.expiresAt,
      notifications,
    });
  }

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'UPDATE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `Resent signing request for "${recipient.name}" on e-signing envelope "${envelope.title}"`,
    metadata: {
      recipientId,
      recipientEmail: recipient.email,
      activeRecipient: isActiveRecipient,
    },
  });

  return {
    envelope: await getEsigningEnvelopeDetail(session, tenantId, envelopeId),
    manualLinks,
  };
}

export async function getEsigningEnvelopeRecipientManualLink(
  session: SessionUser,
  tenantId: string,
  envelopeId: string,
  recipientId: string,
  appBaseUrl?: string
): Promise<EsigningManualLinkDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    include: {
      recipients: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (!['SENT', 'IN_PROGRESS'].includes(envelope.status)) {
    throw new Error('Signer links are available only after the envelope has been sent');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById) && !scope.canManage) {
    throw new Error('Forbidden');
  }

  const recipient = envelope.recipients.find((entry) => entry.id === recipientId);
  if (!recipient) {
    throw new Error('Recipient not found');
  }
  if (recipient.type !== 'SIGNER') {
    throw new Error('Only signer recipients have signing links');
  }
  if (recipient.status === 'SIGNED' || recipient.status === 'DECLINED') {
    throw new Error('Completed or declined recipients do not have an active signing link');
  }
  if (!['NOTIFIED', 'VIEWED'].includes(recipient.status)) {
    throw new Error('This signer link will be available once their signing step becomes active');
  }

  const signingToken = await createEsigningAccessLinkToken({
    recipientId: recipient.id,
    envelopeId,
    sessionVersion: recipient.sessionVersion,
  });

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'UPDATE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `Copied signer link for "${recipient.name}"`,
    metadata: {
      recipientId: recipient.id,
      recipientEmail: recipient.email,
    },
  });

  return {
    recipientId: recipient.id,
    recipientName: recipient.name,
    recipientEmail: recipient.email,
    signingUrl: buildEsigningSigningUrl(signingToken, appBaseUrl),
  };
}

export async function resendEsigningEnvelopeActiveRecipients(
  session: SessionUser,
  tenantId: string,
  envelopeId: string
): Promise<{
  envelope: EsigningEnvelopeDetailDto;
  manualLinks: EsigningManualLinkDto[];
}> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    include: {
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      recipients: {
        orderBy: [
          { signingOrder: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (!['SENT', 'IN_PROGRESS'].includes(envelope.status)) {
    throw new Error('Only sent or in-progress envelopes can be resent');
  }
  if (!canMutateEnvelope(scope, session, envelope.createdById) && !scope.canManage) {
    throw new Error('Forbidden');
  }

  const activeRecipients = envelope.recipients.filter(
    (recipient) =>
      recipient.type === 'SIGNER' && ['NOTIFIED', 'VIEWED'].includes(recipient.status)
  );

  if (activeRecipients.length === 0) {
    throw new Error('No active signer is available to resend');
  }

  const preparedNotifications = prepareRecipientNotifications(
    activeRecipients.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      accessMode: recipient.accessMode,
    }))
  );

  await prisma.$transaction(async (tx) => {
    for (const notification of preparedNotifications.updates) {
      await tx.esigningEnvelopeRecipient.update({
        where: { id: notification.recipientId },
        data: {
          sessionVersion: { increment: 1 },
          accessTokenHash: notification.accessTokenHash,
        },
      });

      await tx.esigningEnvelopeEvent.create({
        data: {
          tenantId,
          envelopeId,
          recipientId: notification.recipientId,
          action: 'REMINDER_SENT',
          metadata: {
            resent: true,
            source: 'list_row_action',
          },
        },
      });
    }
  });

  const senderName = formatUserName(
    envelope.createdBy.firstName,
    envelope.createdBy.lastName,
    envelope.createdBy.email
  );

  await deliverPreparedNotifications({
    senderName,
    envelopeTitle: envelope.title,
    message: envelope.message,
    expiresAt: envelope.expiresAt,
    notifications: preparedNotifications.updates,
  });

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'UPDATE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `Resent active signing requests for e-signing envelope "${envelope.title}"`,
    metadata: {
      recipientCount: activeRecipients.length,
      recipientIds: activeRecipients.map((recipient) => recipient.id),
    },
  });

  return {
    envelope: await getEsigningEnvelopeDetail(session, tenantId, envelopeId),
    manualLinks: preparedNotifications.manualLinks,
  };
}

export async function voidEsigningEnvelope(
  session: SessionUser,
  tenantId: string,
  envelopeId: string,
  reason?: string | null
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    include: {
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
          status: true,
          type: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (!['SENT', 'IN_PROGRESS'].includes(envelope.status)) {
    throw new Error('Only sent or in-progress envelopes can be voided');
  }
  if (!scope.canManage && !canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }

  await prisma.$transaction(async (tx) => {
    await tx.esigningEnvelope.update({
      where: { id: envelopeId },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidReason: reason ?? null,
      },
    });

    await tx.esigningEnvelopeRecipient.updateMany({
      where: { envelopeId },
      data: {
        accessTokenHash: null,
        sessionVersion: { increment: 1 },
      },
    });

    await tx.esigningEnvelopeEvent.create({
      data: {
        tenantId,
        envelopeId,
        action: 'VOIDED',
        metadata: reason ? { reason } : undefined,
      },
    });
  });

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'UPDATE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `Voided e-signing envelope "${envelope.title}"`,
    reason: reason ?? undefined,
  });

  const senderName = formatUserName(
    envelope.createdBy.firstName,
    envelope.createdBy.lastName,
    envelope.createdBy.email
  );

  const recipientsToNotify = envelope.recipients.filter((recipient) =>
    ['QUEUED', 'NOTIFIED', 'VIEWED'].includes(recipient.status)
  );

  for (const recipient of recipientsToNotify) {
    await sendEsigningVoidedEmailToRecipient({
      to: recipient.email,
      recipientName: recipient.name,
      envelopeTitle: envelope.title,
      senderName,
      reason,
    });
  }

  return getEsigningEnvelopeDetail(session, tenantId, envelopeId);
}

export async function retryEsigningEnvelopePdfGeneration(
  session: SessionUser,
  tenantId: string,
  envelopeId: string
): Promise<EsigningEnvelopeDetailDto> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: { id: envelopeId, tenantId },
    select: {
      id: true,
      status: true,
      title: true,
      companyId: true,
      createdById: true,
      pdfGenerationStatus: true,
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (envelope.status !== 'COMPLETED') {
    throw new Error('Only completed envelopes can retry signed PDF generation');
  }
  if (envelope.pdfGenerationStatus === 'COMPLETED') {
    throw new Error('This envelope already has a completed signed package');
  }
  if (!scope.canManage && !canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }

  const actionLabel =
    envelope.pdfGenerationStatus === 'FAILED' ? 'Retried' : 'Triggered';

  await generateEsigningEnvelopeArtifactsNow({
    envelopeId,
  });

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'UPDATE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `${actionLabel} signed PDF generation for "${envelope.title}"`,
  });

  return getEsigningEnvelopeDetail(session, tenantId, envelopeId);
}

export async function processExpiredEsigningEnvelopes(input?: {
  limit?: number;
}): Promise<{
  processed: number;
  expired: number;
}> {
  const now = new Date();
  const limit = input?.limit ?? 50;
  const candidates = await prisma.esigningEnvelope.findMany({
    where: {
      status: { in: ['SENT', 'IN_PROGRESS'] },
      expiresAt: { lte: now },
    },
    orderBy: { expiresAt: 'asc' },
    take: limit,
    include: {
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      recipients: {
        orderBy: [
          { signingOrder: 'asc' },
          { createdAt: 'asc' },
        ],
        select: {
          id: true,
          name: true,
          email: true,
          type: true,
          status: true,
        },
      },
    },
  });

  let expired = 0;

  for (const envelope of candidates) {
    const expiredEnvelope = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.esigningEnvelope.updateMany({
        where: {
          id: envelope.id,
          status: { in: ['SENT', 'IN_PROGRESS'] },
          expiresAt: { lte: now },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      if (updateResult.count === 0) {
        return false;
      }

      await tx.esigningEnvelopeRecipient.updateMany({
        where: { envelopeId: envelope.id },
        data: {
          accessTokenHash: null,
          sessionVersion: { increment: 1 },
        },
      });

      await tx.esigningEnvelopeEvent.create({
        data: {
          tenantId: envelope.tenantId,
          envelopeId: envelope.id,
          action: 'EXPIRED',
        },
      });

      await createAuditLog(
        {
          tenantId: envelope.tenantId,
          companyId: envelope.companyId ?? undefined,
          action: 'UPDATE',
          entityType: 'EsigningEnvelope',
          entityId: envelope.id,
          entityName: envelope.title,
          summary: `Envelope "${envelope.title}" expired automatically`,
          changeSource: 'SYSTEM',
          metadata: {
            expiredAt: now.toISOString(),
          },
        },
        tx
      );

      return true;
    });

    if (!expiredEnvelope) {
      continue;
    }

    expired += 1;

    const senderName = getEnvelopeSenderName(envelope.createdBy);
    const pendingRecipients = envelope.recipients
      .filter((recipient) => recipient.type === 'SIGNER' && recipient.status !== 'SIGNED')
      .map((recipient) => ({
        name: recipient.name,
        email: recipient.email,
      }));

    await sendEsigningExpiredEmailToSender({
      to: envelope.createdBy.email,
      senderName,
      envelopeTitle: envelope.title,
      expiredAt: envelope.expiresAt ?? now,
      pendingRecipients,
      envelopeId: envelope.id,
    });
  }

  return {
    processed: candidates.length,
    expired,
  };
}

export async function processEsigningReminderNotifications(input?: {
  limit?: number;
}): Promise<{
  processed: number;
  remindersSent: number;
  expiryWarningsSent: number;
}> {
  const now = new Date();
  const limit = input?.limit ?? 100;
  const candidates = await prisma.esigningEnvelope.findMany({
    where: {
      status: { in: ['SENT', 'IN_PROGRESS'] },
      OR: [
        { reminderFrequencyDays: { not: null } },
        { expiryWarningDays: { not: null } },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    include: {
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      recipients: {
        orderBy: [
          { signingOrder: 'asc' },
          { createdAt: 'asc' },
        ],
        select: {
          id: true,
          name: true,
          email: true,
          type: true,
          status: true,
          accessMode: true,
          lastReminderAt: true,
          sessionVersion: true,
        },
      },
      events: {
        where: {
          action: {
            in: ['SENT', 'REMINDER_SENT'],
          },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          action: true,
          createdAt: true,
          metadata: true,
        },
      },
    },
  });

  let remindersSent = 0;
  let expiryWarningsSent = 0;

  for (const envelope of candidates) {
    if (envelope.expiresAt && envelope.expiresAt <= now) {
      continue;
    }

    const senderName = getEnvelopeSenderName(envelope.createdBy);
    const sentAt = getSentAtFromEvents(envelope.events, envelope.updatedAt);

    if (
      envelope.expiresAt &&
      typeof envelope.expiryWarningDays === 'number' &&
      envelope.expiryWarningDays > 0
    ) {
      const daysUntilExpiry = diffInWholeDays(envelope.expiresAt, now);
      const hasWarningBeenSent = envelope.events.some((event) =>
        isExpiryWarningEvent(event, envelope.expiryWarningDays ?? 0)
      );

      if (
        daysUntilExpiry > 0 &&
        daysUntilExpiry <= envelope.expiryWarningDays &&
        !hasWarningBeenSent
      ) {
        const pendingRecipients = envelope.recipients
          .filter((recipient) => recipient.type === 'SIGNER' && recipient.status !== 'SIGNED')
          .map((recipient) => ({
            name: recipient.name,
            email: recipient.email,
          }));

        await sendEsigningExpiryWarningEmailToSender({
          to: envelope.createdBy.email,
          senderName,
          envelopeTitle: envelope.title,
          daysUntilExpiry,
          pendingRecipients,
          envelopeId: envelope.id,
        });

        await createEnvelopeEvent({
          envelopeId: envelope.id,
          tenantId: envelope.tenantId,
          action: 'REMINDER_SENT',
          metadata: {
            kind: 'expiry_warning',
            thresholdDays: envelope.expiryWarningDays,
            daysUntilExpiry,
          },
        });

        expiryWarningsSent += 1;
      }
    }

    if (typeof envelope.reminderFrequencyDays !== 'number' || envelope.reminderFrequencyDays <= 0) {
      continue;
    }

    const reminderStartDays = envelope.reminderStartDays ?? 0;
    if (diffInWholeDays(now, sentAt) < reminderStartDays) {
      continue;
    }

    const recipientsToRemind = envelope.recipients.filter((recipient) => {
      if (recipient.type !== 'SIGNER') {
        return false;
      }
      if (!['NOTIFIED', 'VIEWED'].includes(recipient.status)) {
        return false;
      }
      if (recipient.accessMode === 'MANUAL_LINK') {
        return false;
      }

      if (!recipient.lastReminderAt) {
        return true;
      }

      return diffInWholeDays(now, recipient.lastReminderAt) >= envelope.reminderFrequencyDays!;
    });

    if (recipientsToRemind.length === 0) {
      continue;
    }

    const prepared = await prepareReminderNotifications(
      envelope.id,
      recipientsToRemind.map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        accessMode: recipient.accessMode,
        sessionVersion: recipient.sessionVersion,
      }))
    );

    await prisma.$transaction(async (tx) => {
      for (const notification of prepared) {
        await tx.esigningEnvelopeRecipient.update({
          where: { id: notification.recipientId },
          data: {
            lastReminderAt: now,
          },
        });

        await tx.esigningEnvelopeEvent.create({
          data: {
            tenantId: envelope.tenantId,
            envelopeId: envelope.id,
            recipientId: notification.recipientId,
            action: 'REMINDER_SENT',
            metadata: {
              kind: 'recipient_reminder',
              automated: true,
            },
          },
        });
      }
    });

    await deliverPreparedNotifications({
      senderName,
      envelopeTitle: envelope.title,
      message: envelope.message,
      expiresAt: envelope.expiresAt,
      notifications: prepared,
      kind: 'reminder',
    });

    remindersSent += prepared.length;
  }

  return {
    processed: candidates.length,
    remindersSent,
    expiryWarningsSent,
  };
}

export async function cleanupEsigningOrphanedStorage(input?: {
  maxKeysPerTenant?: number;
}): Promise<{
  tenantsScanned: number;
  orphanedPrefixes: number;
  deletedPrefixes: number;
  failedPrefixes: string[];
}> {
  const tenants = await prisma.tenant.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });
  const maxKeysPerTenant = input?.maxKeysPerTenant ?? 10_000;
  const failedPrefixes: string[] = [];
  let orphanedPrefixes = 0;
  let deletedPrefixes = 0;

  for (const tenant of tenants) {
    const files = await storage.list(`${tenant.id}/esigning/`, maxKeysPerTenant);
    if (files.length === 0) {
      continue;
    }

    const envelopeIds = new Set<string>();
    const envelopeKeyRegex = new RegExp(`^${tenant.id}/esigning/([^/]+)/`);
    for (const file of files) {
      const match = file.key.match(envelopeKeyRegex);
      if (match?.[1]) {
        envelopeIds.add(match[1]);
      }
    }

    if (envelopeIds.size === 0) {
      continue;
    }

    const existingEnvelopes = await prisma.esigningEnvelope.findMany({
      where: {
        tenantId: tenant.id,
        id: {
          in: [...envelopeIds],
        },
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    const existingEnvelopeIds = new Set(existingEnvelopes.map((envelope) => envelope.id));

    for (const envelopeId of envelopeIds) {
      if (existingEnvelopeIds.has(envelopeId)) {
        continue;
      }

      orphanedPrefixes += 1;
      const prefix = StorageKeys.esigningEnvelopePrefix(tenant.id, envelopeId);

      try {
        const deletedCount = await storage.deletePrefix(prefix);
        if (deletedCount > 0) {
          deletedPrefixes += 1;
        }
      } catch (error) {
        failedPrefixes.push(prefix);
        log.warn('Failed to delete orphaned e-signing storage prefix', {
          tenantId: tenant.id,
          envelopeId,
          prefix,
          error,
        });
      }
    }
  }

  return {
    tenantsScanned: tenants.length,
    orphanedPrefixes,
    deletedPrefixes,
    failedPrefixes,
  };
}

export async function activateNextQueuedEsigningRecipients(
  envelopeId: string
): Promise<EsigningManualLinkDto[]> {
  const envelope = await prisma.esigningEnvelope.findUnique({
    where: { id: envelopeId },
    include: {
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      recipients: {
        orderBy: [
          { signingOrder: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    },
  });

  if (!envelope || !['SENT', 'IN_PROGRESS'].includes(envelope.status)) {
    return [];
  }

  const activeSignerCount = envelope.recipients.filter(
    (recipient) => recipient.type === 'SIGNER' && ['NOTIFIED', 'VIEWED'].includes(recipient.status)
  ).length;

  if (activeSignerCount > 0) {
    return [];
  }

  const nextRecipientIds = selectNextQueuedSignerRecipients(
    envelope.recipients.map((recipient) => ({
      id: recipient.id,
      type: recipient.type,
      status: recipient.status,
      signingOrder: recipient.signingOrder,
    }))
  );

  if (nextRecipientIds.length === 0) {
    return [];
  }

  const nextRecipients = envelope.recipients.filter((recipient) => nextRecipientIds.includes(recipient.id));
  const preparedNotifications = prepareRecipientNotifications(
    nextRecipients.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      accessMode: recipient.accessMode,
    }))
  );

  await prisma.$transaction(async (tx) => {
    for (const recipient of nextRecipients) {
      const prepared = preparedNotifications.updates.find((entry) => entry.recipientId === recipient.id);
      await tx.esigningEnvelopeRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'NOTIFIED',
          accessTokenHash: prepared?.accessTokenHash ?? null,
        },
      });
    }
  });

  const senderName = formatUserName(
    envelope.createdBy.firstName,
    envelope.createdBy.lastName,
    envelope.createdBy.email
  );
  await deliverPreparedNotifications({
    senderName,
    envelopeTitle: envelope.title,
    message: envelope.message,
    expiresAt: envelope.expiresAt,
    notifications: preparedNotifications.updates,
  });

  return preparedNotifications.manualLinks;
}
