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
import { sendEsigningRequestEmail } from '@/services/esigning-notification.service';
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
  accessTokenHash: string;
  rawToken: string;
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

async function deliverPreparedNotifications(input: {
  senderName: string;
  envelopeTitle: string;
  message?: string | null;
  expiresAt?: Date | null;
  notifications: PreparedRecipientNotification[];
}): Promise<void> {
  for (const notification of input.notifications) {
    if (notification.accessMode === 'MANUAL_LINK') {
      continue;
    }

    await sendEsigningRequestEmail({
      to: notification.recipientEmail,
      recipientName: notification.recipientName,
      senderName: input.senderName,
      envelopeTitle: input.envelopeTitle,
      message: input.message,
      signingUrl: notification.signingUrl,
      accessMode: notification.accessMode,
      expiresAt: input.expiresAt,
    });
  }
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
}> {
  const scope = await resolveEsigningActorScope(session, tenantId);
  const where: Prisma.EsigningEnvelopeWhereInput = {
    tenantId,
    deletedAt: null,
  };

  if (query.status) {
    where.status = query.status;
  }
  if (query.companyId) {
    where.companyId = query.companyId;
  }
  if (query.query) {
    where.OR = [
      { title: { contains: query.query, mode: 'insensitive' } },
      { recipients: { some: { name: { contains: query.query, mode: 'insensitive' } } } },
      { recipients: { some: { email: { contains: query.query, mode: 'insensitive' } } } },
    ];
  }
  if (!scope.canReadAll || query.createdBy === 'me') {
    where.createdById = session.id;
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const [total, envelopes] = await prisma.$transaction([
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
  ]);

  return {
    envelopes: envelopes.map((envelope) => ({
      id: envelope.id,
      title: envelope.title,
      status: envelope.status,
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
      recipients: {
        select: {
          id: true,
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

  await prisma.esigningEnvelopeRecipient.delete({
    where: { id: recipientId },
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

  return {
    envelope: await getEsigningEnvelopeDetail(session, tenantId, envelopeId),
    manualLinks,
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
    select: {
      id: true,
      title: true,
      status: true,
      companyId: true,
      createdById: true,
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
  if (envelope.pdfGenerationStatus !== 'FAILED') {
    throw new Error('This envelope is not waiting for a retry');
  }
  if (!scope.canManage && !canMutateEnvelope(scope, session, envelope.createdById)) {
    throw new Error('Forbidden');
  }

  await prisma.esigningEnvelope.update({
    where: { id: envelopeId },
    data: {
      pdfGenerationStatus: 'PENDING',
      pdfGenerationClaimedAt: null,
      pdfGenerationError: null,
    },
  });

  await createAuditLog({
    tenantId,
    userId: session.id,
    companyId: envelope.companyId ?? undefined,
    action: 'UPDATE',
    entityType: 'EsigningEnvelope',
    entityId: envelopeId,
    entityName: envelope.title,
    summary: `Queued signed PDF regeneration for "${envelope.title}"`,
  });

  return getEsigningEnvelopeDetail(session, tenantId, envelopeId);
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
