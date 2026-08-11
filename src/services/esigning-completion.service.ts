import type { Prisma } from '@/generated/prisma';

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
