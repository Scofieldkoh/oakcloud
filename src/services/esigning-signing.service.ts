import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/encryption';
import {
  clearEsigningChallengeCookie,
  clearEsigningSessionCookie,
  createEsigningDownloadToken,
  getEsigningChallengeClaims,
  getEsigningSessionClaims,
  hashEsigningAccessToken,
  setEsigningChallengeCookie,
  setEsigningSessionCookie,
  verifyEsigningAccessLinkToken,
  verifyEsigningScopedToken,
} from '@/lib/esigning-session';
import type { SaveEsigningFieldValuesInput } from '@/lib/validations/esigning';
import type {
  EsigningSigningSessionDto,
  EsigningSigningSessionStatusDto,
} from '@/types/esigning';
import { storage } from '@/lib/storage';
import { createLogger } from '@/lib/logger';
import { sendEsigningDeclinedEmailToSender } from '@/services/esigning-notification.service';
import { activateNextQueuedEsigningRecipients } from '@/services/esigning-envelope.service';
import { isRequiredEsigningFieldComplete, saveRecipientFieldValues } from '@/services/esigning-field.service';

const log = createLogger('esigning-signing');

type SigningContext = Awaited<ReturnType<typeof getSigningContext>>;

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function isTerminalEnvelopeStatus(status: string): boolean {
  return ['VOIDED', 'DECLINED', 'EXPIRED'].includes(status);
}

async function getSigningContext(input: {
  recipientId: string;
  envelopeId: string;
  sessionVersion: number;
}) {
  const envelope = await prisma.esigningEnvelope.findFirst({
    where: {
      id: input.envelopeId,
      recipients: {
        some: {
          id: input.recipientId,
        },
      },
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
        },
      },
      company: {
        select: {
          id: true,
          name: true,
        },
      },
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
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
        where: { recipientId: input.recipientId },
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }

  const recipient = envelope.recipients.find((entry) => entry.id === input.recipientId);
  if (!recipient) {
    throw new Error('Recipient not found');
  }
  if (recipient.sessionVersion !== input.sessionVersion) {
    throw new Error('Signing session expired');
  }
  if (recipient.type !== 'SIGNER') {
    throw new Error('Only signer recipients can access this session');
  }
  if (envelope.expiresAt && envelope.expiresAt.getTime() < Date.now()) {
    throw new Error('This envelope has expired');
  }
  if (isTerminalEnvelopeStatus(envelope.status)) {
    throw new Error(`This envelope is ${envelope.status.toLowerCase()}`);
  }
  if (
    recipient.status === 'QUEUED' &&
    envelope.status !== 'COMPLETED'
  ) {
    throw new Error('This signing step is not active yet');
  }

  const fieldValues = await prisma.esigningDocumentFieldValue.findMany({
    where: {
      recipientId: input.recipientId,
      fieldDefinition: {
        envelopeId: input.envelopeId,
      },
    },
    orderBy: { updatedAt: 'asc' },
  });

  return {
    envelope,
    recipient,
    fieldValues,
  };
}

async function requireSigningSession(): Promise<{
  recipientId: string;
  envelopeId: string;
  sessionVersion: number;
}> {
  const claims = await getEsigningSessionClaims();
  if (!claims) {
    throw new Error('Unauthorized');
  }

  return {
    recipientId: claims.recipientId,
    envelopeId: claims.envelopeId,
    sessionVersion: claims.sessionVersion,
  };
}

async function buildSigningSessionDto(context: SigningContext): Promise<EsigningSigningSessionDto> {
  const senderName = [context.envelope.createdBy.firstName, context.envelope.createdBy.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || context.envelope.createdBy.email;
  const fieldTypeById = new Map(
    context.envelope.fieldDefinitions.map((field) => [field.id, field.type])
  );

  const downloadToken =
    context.envelope.status === 'COMPLETED' || context.recipient.status === 'SIGNED'
      ? await createEsigningDownloadToken({
          recipientId: context.recipient.id,
          envelopeId: context.envelope.id,
          sessionVersion: context.recipient.sessionVersion,
        })
      : null;

  return {
    envelope: {
      id: context.envelope.id,
      title: context.envelope.title,
      message: context.envelope.message,
      status: context.envelope.status,
      certificateId: context.envelope.certificateId,
      companyName: context.envelope.company?.name ?? null,
      tenantName: context.envelope.tenant.name,
      senderName,
      completedAt: toIsoString(context.envelope.completedAt),
      expiresAt: toIsoString(context.envelope.expiresAt),
    },
    recipient: {
      id: context.recipient.id,
      name: context.recipient.name,
      email: context.recipient.email,
      type: context.recipient.type,
      status: context.recipient.status,
      accessMode: context.recipient.accessMode,
      consentedAt: toIsoString(context.recipient.consentedAt),
      viewedAt: toIsoString(context.recipient.viewedAt),
      signedAt: toIsoString(context.recipient.signedAt),
      colorTag: context.recipient.colorTag,
    },
    documents: context.envelope.documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      pageCount: document.pageCount,
      sortOrder: document.sortOrder,
      fileSize: document.fileSize,
      originalHash: document.originalHash,
      signedHash: document.signedHash,
      pdfUrl: `/api/esigning/sign/session/download?documentId=${encodeURIComponent(document.id)}`,
      signedPdfUrl:
        context.envelope.status === 'COMPLETED' && downloadToken
          ? `/api/esigning/sign/session/download?documentId=${encodeURIComponent(document.id)}&token=${encodeURIComponent(downloadToken)}&variant=signed`
          : null,
    })),
    recipients: context.envelope.recipients.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      type: recipient.type,
      status: recipient.status,
      signingOrder: recipient.signingOrder,
      colorTag: recipient.colorTag,
    })),
    fields: context.envelope.fieldDefinitions.map((field) => ({
      id: field.id,
      documentId: field.documentId,
      recipientId: field.recipientId,
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
    })),
    fieldValues: await Promise.all(
      context.fieldValues.map(async (value) => ({
        id: value.id,
        fieldDefinitionId: value.fieldDefinitionId,
        recipientId: value.recipientId,
        value: value.value,
        signatureStoragePath: value.signatureStoragePath,
        signaturePreviewUrl:
          value.signatureStoragePath &&
          ['SIGNATURE', 'INITIALS'].includes(fieldTypeById.get(value.fieldDefinitionId) ?? '')
            ? await storage.getSignedUrl(value.signatureStoragePath, 3600)
            : null,
        filledAt: toIsoString(value.filledAt),
        finalizedAt: toIsoString(value.finalizedAt),
        revision: value.revision,
      }))
    ),
    downloadToken,
  };
}

function buildCompletionInputs(input: {
  context: SigningContext;
  values: SaveEsigningFieldValuesInput['values'];
}): SaveEsigningFieldValuesInput['values'] {
  const payloadByFieldId = new Map(input.values.map((entry) => [entry.fieldDefinitionId, entry]));
  const currentValues = new Map(input.context.fieldValues.map((value) => [value.fieldDefinitionId, value]));

  return input.context.envelope.fieldDefinitions.map((field) => {
    const payload = payloadByFieldId.get(field.id);
    const existing = currentValues.get(field.id);

    if (payload) {
      return payload;
    }

    if (field.type === 'NAME') {
      return {
        fieldDefinitionId: field.id,
        value: existing?.value ?? input.context.recipient.name,
      };
    }

    if (field.type === 'COMPANY') {
      return {
        fieldDefinitionId: field.id,
        value:
          existing?.value ??
          input.context.envelope.company?.name ??
          input.context.envelope.tenant.name,
      };
    }

    if (field.type === 'DATE_SIGNED') {
      return {
        fieldDefinitionId: field.id,
        value: existing?.value ?? new Date().toISOString().slice(0, 10),
      };
    }

    return {
      fieldDefinitionId: field.id,
      value: existing?.value ?? null,
    };
  });
}

export async function exchangeEsigningLinkToken(rawToken: string): Promise<{
  requiresAccessCode: boolean;
  envelopeId: string;
  recipientId: string;
  envelopeTitle: string;
  recipientName: string;
}> {
  const accessLinkClaims = await verifyEsigningAccessLinkToken(rawToken);
  if (accessLinkClaims) {
    const recipient = await prisma.esigningEnvelopeRecipient.findFirst({
      where: {
        id: accessLinkClaims.recipientId,
        envelopeId: accessLinkClaims.envelopeId,
      },
      include: {
        envelope: {
          select: {
            id: true,
            title: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!recipient || recipient.sessionVersion !== accessLinkClaims.sessionVersion) {
      throw new Error('Signing link is invalid or has expired');
    }
    if (recipient.envelope.expiresAt && recipient.envelope.expiresAt.getTime() < Date.now()) {
      throw new Error('This envelope has expired');
    }
    if (isTerminalEnvelopeStatus(recipient.envelope.status)) {
      throw new Error(`This envelope is ${recipient.envelope.status.toLowerCase()}`);
    }

    await clearEsigningSessionCookie();

    if (recipient.accessMode === 'EMAIL_WITH_CODE') {
      await setEsigningChallengeCookie({
        recipientId: recipient.id,
        envelopeId: recipient.envelopeId,
        sessionVersion: recipient.sessionVersion,
      });

      return {
        requiresAccessCode: true,
        envelopeId: recipient.envelopeId,
        recipientId: recipient.id,
        envelopeTitle: recipient.envelope.title,
        recipientName: recipient.name,
      };
    }

    await clearEsigningChallengeCookie();
    await setEsigningSessionCookie({
      recipientId: recipient.id,
      envelopeId: recipient.envelopeId,
      sessionVersion: recipient.sessionVersion,
    });

    return {
      requiresAccessCode: false,
      envelopeId: recipient.envelopeId,
      recipientId: recipient.id,
      envelopeTitle: recipient.envelope.title,
      recipientName: recipient.name,
    };
  }

  const recipient = await prisma.esigningEnvelopeRecipient.findFirst({
    where: {
      accessTokenHash: hashEsigningAccessToken(rawToken),
    },
    include: {
      envelope: {
        select: {
          id: true,
          title: true,
          status: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!recipient) {
    throw new Error('Signing link is invalid or has expired');
  }
  if (recipient.envelope.expiresAt && recipient.envelope.expiresAt.getTime() < Date.now()) {
    throw new Error('This envelope has expired');
  }
  if (isTerminalEnvelopeStatus(recipient.envelope.status)) {
    throw new Error(`This envelope is ${recipient.envelope.status.toLowerCase()}`);
  }

  await clearEsigningSessionCookie();

  if (recipient.accessMode === 'EMAIL_WITH_CODE') {
    await setEsigningChallengeCookie({
      recipientId: recipient.id,
      envelopeId: recipient.envelopeId,
      sessionVersion: recipient.sessionVersion,
    });

    return {
      requiresAccessCode: true,
      envelopeId: recipient.envelopeId,
      recipientId: recipient.id,
      envelopeTitle: recipient.envelope.title,
      recipientName: recipient.name,
    };
  }

  await clearEsigningChallengeCookie();
  await setEsigningSessionCookie({
    recipientId: recipient.id,
    envelopeId: recipient.envelopeId,
    sessionVersion: recipient.sessionVersion,
  });

  return {
    requiresAccessCode: false,
    envelopeId: recipient.envelopeId,
    recipientId: recipient.id,
    envelopeTitle: recipient.envelope.title,
    recipientName: recipient.name,
  };
}

export async function verifyEsigningAccessCode(accessCode: string): Promise<void> {
  const claims = await getEsigningChallengeClaims();
  if (!claims) {
    throw new Error('Unauthorized');
  }

  const recipient = await prisma.esigningEnvelopeRecipient.findFirst({
    where: {
      id: claims.recipientId,
      envelopeId: claims.envelopeId,
    },
    select: {
      id: true,
      sessionVersion: true,
      accessCodeHash: true,
    },
  });

  if (!recipient || recipient.sessionVersion !== claims.sessionVersion) {
    throw new Error('Signing challenge expired');
  }
  if (!recipient.accessCodeHash) {
    throw new Error('This recipient does not require an access code');
  }

  const verification = await verifyPassword(accessCode, recipient.accessCodeHash);
  if (!verification.isValid) {
    throw new Error('Access code is incorrect');
  }

  await clearEsigningChallengeCookie();
  await setEsigningSessionCookie({
    recipientId: recipient.id,
    envelopeId: claims.envelopeId,
    sessionVersion: recipient.sessionVersion,
  });
}

export async function loadEsigningSigningSession(): Promise<EsigningSigningSessionDto> {
  const claims = await requireSigningSession();
  const context = await getSigningContext(claims);
  return buildSigningSessionDto(context);
}

export async function getEsigningSigningSessionStatus(): Promise<EsigningSigningSessionStatusDto> {
  const claims = await requireSigningSession();

  const recipient = await prisma.esigningEnvelopeRecipient.findFirst({
    where: {
      id: claims.recipientId,
      envelopeId: claims.envelopeId,
    },
    select: {
      id: true,
      status: true,
      signedAt: true,
      sessionVersion: true,
      envelope: {
        select: {
          id: true,
          status: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!recipient || recipient.sessionVersion !== claims.sessionVersion) {
    throw new Error('Signing session expired');
  }
  if (recipient.envelope.expiresAt && recipient.envelope.expiresAt.getTime() < Date.now()) {
    throw new Error('This envelope has expired');
  }
  if (isTerminalEnvelopeStatus(recipient.envelope.status)) {
    throw new Error(`This envelope is ${recipient.envelope.status.toLowerCase()}`);
  }

  return {
    envelope: {
      id: recipient.envelope.id,
      status: recipient.envelope.status,
      expiresAt: toIsoString(recipient.envelope.expiresAt),
    },
    recipient: {
      id: recipient.id,
      status: recipient.status,
      signedAt: toIsoString(recipient.signedAt),
    },
  };
}

export async function recordEsigningSigningView(): Promise<EsigningSigningSessionDto> {
  const claims = await requireSigningSession();
  const context = await getSigningContext(claims);

  if (context.recipient.status === 'NOTIFIED') {
    await prisma.$transaction(async (tx) => {
      await tx.esigningEnvelopeRecipient.update({
        where: { id: context.recipient.id },
        data: {
          status: 'VIEWED',
          viewedAt: context.recipient.viewedAt ?? new Date(),
        },
      });

      if (context.envelope.status === 'SENT') {
        await tx.esigningEnvelope.update({
          where: { id: context.envelope.id },
          data: { status: 'IN_PROGRESS' },
        });
      }

      await tx.esigningEnvelopeEvent.create({
        data: {
          tenantId: context.envelope.tenantId,
          envelopeId: context.envelope.id,
          recipientId: context.recipient.id,
          action: 'VIEWED',
        },
      });
    });
  }

  return loadEsigningSigningSession();
}

export async function recordEsigningSigningConsent(input: {
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<EsigningSigningSessionDto> {
  const claims = await requireSigningSession();
  const context = await getSigningContext(claims);

  if (!context.recipient.consentedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.esigningEnvelopeRecipient.update({
        where: { id: context.recipient.id },
        data: {
          consentedAt: new Date(),
          consentIp: input.ipAddress ?? null,
          consentUserAgent: input.userAgent ?? null,
        },
      });

      await tx.esigningEnvelopeEvent.create({
        data: {
          tenantId: context.envelope.tenantId,
          envelopeId: context.envelope.id,
          recipientId: context.recipient.id,
          action: 'CONSENTED',
          metadata: {
            consentVersion: context.envelope.consentVersion,
          },
        },
      });
    });
  }

  return loadEsigningSigningSession();
}

export async function saveEsigningSigningFieldValues(
  values: SaveEsigningFieldValuesInput['values']
): Promise<EsigningSigningSessionDto> {
  const claims = await requireSigningSession();
  const context = await getSigningContext(claims);

  if (context.recipient.status === 'SIGNED' || context.recipient.status === 'DECLINED') {
    throw new Error('This signing session is already complete');
  }

  await saveRecipientFieldValues({
    tenantId: context.envelope.tenantId,
    envelopeId: context.envelope.id,
    recipientId: context.recipient.id,
    values,
  });

  return loadEsigningSigningSession();
}

export async function completeEsigningSigningSession(input: {
  values: SaveEsigningFieldValuesInput['values'];
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<EsigningSigningSessionDto> {
  const claims = await requireSigningSession();
  const context = await getSigningContext(claims);

  if (context.recipient.status === 'SIGNED') {
    return loadEsigningSigningSession();
  }
  if (context.recipient.status === 'DECLINED') {
    throw new Error('This signing session has been declined');
  }
  if (!context.recipient.consentedAt) {
    throw new Error('Consent is required before signing');
  }

  const completionInputs = buildCompletionInputs({
    context,
    values: input.values,
  });

  await prisma.$transaction(async (tx) => {
    await saveRecipientFieldValues(
      {
        tenantId: context.envelope.tenantId,
        envelopeId: context.envelope.id,
        recipientId: context.recipient.id,
        values: completionInputs,
        finalize: true,
      },
      tx
    );

    const finalizedValues = await tx.esigningDocumentFieldValue.findMany({
      where: {
        recipientId: context.recipient.id,
        fieldDefinition: {
          envelopeId: context.envelope.id,
        },
      },
    });
    const finalizedValueMap = new Map(
      finalizedValues.map((value) => [value.fieldDefinitionId, value])
    );

    for (const field of context.envelope.fieldDefinitions) {
      const value = finalizedValueMap.get(field.id);
      if (
        !isRequiredEsigningFieldComplete({
          fieldType: field.type,
          required: field.required,
          value: value?.value,
          signatureStoragePath: value?.signatureStoragePath,
        })
      ) {
        throw new Error(`Required field "${field.label || field.type}" is incomplete`);
      }
    }

    const now = new Date();
    await tx.esigningEnvelopeRecipient.update({
      where: { id: context.recipient.id },
      data: {
        status: 'SIGNED',
        signedAt: now,
        signedIp: input.ipAddress ?? null,
        signedUserAgent: input.userAgent ?? null,
      },
    });

    await tx.esigningEnvelopeEvent.create({
      data: {
        tenantId: context.envelope.tenantId,
        envelopeId: context.envelope.id,
        recipientId: context.recipient.id,
        action: 'SIGNED',
      },
    });

    const remainingSignerCount = await tx.esigningEnvelopeRecipient.count({
      where: {
        envelopeId: context.envelope.id,
        type: 'SIGNER',
        status: {
          not: 'SIGNED',
        },
      },
    });

    if (remainingSignerCount === 0) {
      const completionUpdate = await tx.esigningEnvelope.updateMany({
        where: {
          id: context.envelope.id,
          status: {
            in: ['SENT', 'IN_PROGRESS'],
          },
        },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          pdfGenerationStatus: 'PENDING',
          pdfGenerationClaimedAt: null,
          pdfGenerationError: null,
        },
      });

      if (completionUpdate.count > 0) {
        await tx.esigningEnvelopeEvent.create({
          data: {
            tenantId: context.envelope.tenantId,
            envelopeId: context.envelope.id,
            action: 'COMPLETED',
          },
        });
      }
    } else if (context.envelope.status === 'SENT') {
      await tx.esigningEnvelope.updateMany({
        where: { id: context.envelope.id, status: 'SENT' },
        data: { status: 'IN_PROGRESS' },
      });
    }
  });

  try {
    await activateNextQueuedEsigningRecipients(context.envelope.id);
  } catch (error) {
    log.warn('Failed to activate queued signer recipients after completion', {
      envelopeId: context.envelope.id,
      error,
    });
  }

  return loadEsigningSigningSession();
}

export async function declineEsigningSigningSession(input: {
  reason: string;
}): Promise<void> {
  const claims = await requireSigningSession();
  const context = await getSigningContext(claims);

  if (context.recipient.status === 'SIGNED') {
    throw new Error('A completed signer cannot decline');
  }
  if (context.recipient.status === 'DECLINED') {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.esigningEnvelopeRecipient.update({
      where: { id: context.recipient.id },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
        declineReason: input.reason,
      },
    });

    await tx.esigningEnvelope.update({
      where: { id: context.envelope.id },
      data: {
        status: 'DECLINED',
      },
    });

    await tx.esigningEnvelopeRecipient.updateMany({
      where: {
        envelopeId: context.envelope.id,
      },
      data: {
        accessTokenHash: null,
        sessionVersion: { increment: 1 },
      },
    });

    await tx.esigningEnvelopeEvent.create({
      data: {
        tenantId: context.envelope.tenantId,
        envelopeId: context.envelope.id,
        recipientId: context.recipient.id,
        action: 'DECLINED',
        metadata: {
          reason: input.reason,
        },
      },
    });
  });

  await clearEsigningSessionCookie();

  await sendEsigningDeclinedEmailToSender({
    to: context.envelope.createdBy.email,
    senderName:
      [context.envelope.createdBy.firstName, context.envelope.createdBy.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || context.envelope.createdBy.email,
    envelopeTitle: context.envelope.title,
    recipientName: context.recipient.name,
    declineReason: input.reason,
  });
}

export async function downloadEsigningSessionDocument(input: {
  documentId: string;
  variant?: 'original' | 'signed';
  token?: string | null;
}): Promise<{
  buffer: Buffer;
  fileName: string;
}> {
  let claims = await getEsigningSessionClaims();

  if (!claims && input.token) {
    claims = await verifyEsigningScopedToken(input.token, 'esigning_download');
  }

  if (!claims) {
    throw new Error('Unauthorized');
  }

  const context = await getSigningContext({
    recipientId: claims.recipientId,
    envelopeId: claims.envelopeId,
    sessionVersion: claims.sessionVersion,
  });

  const document = context.envelope.documents.find((entry) => entry.id === input.documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  const storagePath =
    input.variant === 'signed'
      ? document.signedStoragePath
      : document.storagePath;

  if (!storagePath) {
    throw new Error('Document is not available');
  }

  const buffer = await storage.download(storagePath);
  const fileName =
    input.variant === 'signed'
      ? document.fileName.replace(/\.pdf$/i, '-signed.pdf')
      : document.fileName;

  return { buffer, fileName };
}
