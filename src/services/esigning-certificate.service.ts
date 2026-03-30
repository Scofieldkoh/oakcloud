import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashSha256 } from '@/lib/encryption';

function formatCertificateDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function randomSuffix(length: number = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let output = '';

  for (let index = 0; index < length; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return output;
}

export async function generateUniqueEsigningCertificateId(): Promise<string> {
  const dateSegment = formatCertificateDate(new Date());

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const certificateId = `OAK-ES-${dateSegment}-${randomSuffix()}`;
    const existing = await prisma.esigningEnvelope.findUnique({
      where: { certificateId },
      select: { id: true },
    });

    if (!existing) {
      return certificateId;
    }
  }

  return `OAK-ES-${dateSegment}-${hashSha256(randomUUID()).slice(0, 8).toUpperCase()}`;
}

export async function getEsigningVerificationData(certificateId: string) {
  const envelope = await prisma.esigningEnvelope.findUnique({
    where: { certificateId },
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
      documents: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          fileName: true,
          signedHash: true,
          originalHash: true,
          signedStoragePath: true,
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
          signedAt: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Certificate not found');
  }

  return {
    certificateId: envelope.certificateId,
    envelopeId: envelope.id,
    title: envelope.title,
    status: envelope.status,
    completedAt: envelope.completedAt?.toISOString() ?? null,
    tenantName: envelope.tenant.name,
    companyName: envelope.company?.name ?? null,
    documents: envelope.documents.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      hash: document.signedHash ?? document.originalHash,
      hasSignedCopy: Boolean(document.signedStoragePath),
    })),
    recipients: envelope.recipients.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      emailMasked: maskEmailAddress(recipient.email),
      type: recipient.type,
      status: recipient.status,
      signingOrder: recipient.signingOrder,
      signedAt: recipient.signedAt?.toISOString() ?? null,
    })),
  };
}

function maskEmailAddress(email: string): string {
  const [localPart, domainPart] = email.split('@');
  if (!localPart || !domainPart) {
    return email;
  }

  const visibleLocal = localPart.length <= 1
    ? localPart
    : `${localPart[0]}${'*'.repeat(Math.max(1, localPart.length - 1))}`;

  return `${visibleLocal}@${domainPart}`;
}
