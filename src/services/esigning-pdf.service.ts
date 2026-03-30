import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { hashBlake3 } from '@/lib/encryption';
import { storage, StorageKeys } from '@/lib/storage';
import { createLogger } from '@/lib/logger';
import {
  sendEsigningCompletionEmail,
  sendEsigningPdfFailureEmailToSender,
} from '@/services/esigning-notification.service';

const log = createLogger('esigning-pdf');
const PROCESSING_LEASE_MS = 15 * 60 * 1000;

function toPdfBounds(input: {
  pageWidth: number;
  pageHeight: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}) {
  const width = input.pageWidth * input.widthPercent;
  const height = input.pageHeight * input.heightPercent;
  const x = input.pageWidth * input.xPercent;
  const y = input.pageHeight - input.pageHeight * input.yPercent - height;

  return { x, y, width, height };
}

function drawMultilineText(input: {
  page: PDFPage;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  size: number;
  color?: ReturnType<typeof rgb>;
  font: Awaited<ReturnType<PDFDocument['embedFont']>>;
}) {
  const words = input.text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = input.font.widthOfTextAtSize(candidate, input.size);
    if (width > input.maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  lines.forEach((line, index) => {
    input.page.drawText(line, {
      x: input.x,
      y: input.y - index * (input.size + 4),
      size: input.size,
      font: input.font,
      color: input.color ?? rgb(0.13, 0.16, 0.2),
    });
  });
}

async function buildCertificatePdf(input: {
  envelope: Awaited<ReturnType<typeof loadEnvelopeForPdf>>;
  document: Awaited<ReturnType<typeof loadEnvelopeForPdf>>['documents'][number];
}) {
  const certificatePdf = await PDFDocument.create();
  const page = certificatePdf.addPage([595.28, 841.89]);
  const headingFont = await certificatePdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await certificatePdf.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();

  page.drawRectangle({
    x: 0,
    y: height - 120,
    width: 595.28,
    height: 120,
    color: rgb(0.16, 0.3, 0.27),
  });
  page.drawText('Oakcloud E-Signing Certificate', {
    x: 40,
    y: height - 62,
    size: 24,
    font: headingFont,
    color: rgb(1, 1, 1),
  });
  page.drawText(input.envelope.certificateId, {
    x: 40,
    y: height - 92,
    size: 11,
    font: bodyFont,
    color: rgb(0.84, 0.91, 0.88),
  });

  let cursorY = height - 160;
  const sections: Array<{ title: string; lines: string[] }> = [
    {
      title: 'Envelope',
      lines: [
        `Title: ${input.envelope.title}`,
        `Tenant: ${input.envelope.tenant.name}`,
        `Company: ${input.envelope.company?.name ?? 'N/A'}`,
        `Completed: ${input.envelope.completedAt?.toISOString() ?? 'Pending'}`,
      ],
    },
    {
      title: 'Document',
      lines: [
        `File: ${input.document.fileName}`,
        `Original hash: ${input.document.originalHash}`,
      ],
    },
    {
      title: 'Recipients',
      lines: input.envelope.recipients.map((recipient) =>
        `${recipient.name} (${recipient.email}) - ${recipient.status}${recipient.signedAt ? ` at ${recipient.signedAt.toISOString()}` : ''}`
      ),
    },
    {
      title: 'Timeline',
      lines: input.envelope.events
        .slice()
        .reverse()
        .map((event) => `${event.createdAt.toISOString()} - ${event.action}`),
    },
  ];

  for (const section of sections) {
    page.drawText(section.title, {
      x: 40,
      y: cursorY,
      size: 13,
      font: headingFont,
      color: rgb(0.16, 0.3, 0.27),
    });
    cursorY -= 20;

    section.lines.forEach((line) => {
      drawMultilineText({
        page,
        text: line,
        x: 40,
        y: cursorY,
        maxWidth: 515,
        size: 10,
        font: bodyFont,
      });
      cursorY -= 18;
    });

    cursorY -= 10;
  }

  return Buffer.from(await certificatePdf.save());
}

async function loadEnvelopeForPdf(envelopeId: string) {
  const envelope = await prisma.esigningEnvelope.findUnique({
    where: { id: envelopeId },
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
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'asc' },
        ],
      },
      events: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }

  const fieldValues = await prisma.esigningDocumentFieldValue.findMany({
    where: {
      recipient: {
        envelopeId,
      },
    },
  });

  return {
    ...envelope,
    fieldValues,
  };
}

async function generateEnvelopeArtifacts(envelopeId: string): Promise<void> {
  const envelope = await loadEnvelopeForPdf(envelopeId);

  if (envelope.status !== 'COMPLETED') {
    throw new Error('Only completed envelopes can generate signed PDFs');
  }

  const senderName =
    [envelope.createdBy.firstName, envelope.createdBy.lastName].filter(Boolean).join(' ').trim() ||
    envelope.createdBy.email;
  const fieldValuesByDefinitionId = new Map(
    envelope.fieldValues.map((value) => [value.fieldDefinitionId, value])
  );

  for (const document of envelope.documents) {
    const originalBuffer = await storage.download(document.storagePath);
    const originalPdf = await PDFDocument.load(originalBuffer);
    const font = await originalPdf.embedFont(StandardFonts.Helvetica);

    for (let pageIndex = 0; pageIndex < originalPdf.getPageCount(); pageIndex += 1) {
      const pageNumber = pageIndex + 1;
      const page = originalPdf.getPage(pageIndex);
      const { width, height } = page.getSize();

      page.drawText(envelope.certificateId, {
        x: 24,
        y: 14,
        size: 8,
        font,
        color: rgb(0.45, 0.5, 0.56),
      });

      const pageFields = envelope.fieldDefinitions.filter(
        (field) => field.documentId === document.id && field.pageNumber === pageNumber
      );

      for (const field of pageFields) {
        const value = fieldValuesByDefinitionId.get(field.id);
        const bounds = toPdfBounds({
          pageWidth: width,
          pageHeight: height,
          xPercent: field.xPercent,
          yPercent: field.yPercent,
          widthPercent: field.widthPercent,
          heightPercent: field.heightPercent,
        });

        if ((field.type === 'SIGNATURE' || field.type === 'INITIALS') && value?.signatureStoragePath) {
          const imageBuffer = await storage.download(value.signatureStoragePath);
          const image = await originalPdf.embedPng(imageBuffer);
          page.drawImage(image, {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          });
          continue;
        }

        if (field.type === 'CHECKBOX') {
          page.drawRectangle({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            borderColor: rgb(0.1, 0.15, 0.2),
            borderWidth: 1,
          });
          if (value?.value === 'true') {
            page.drawText('X', {
              x: bounds.x + 3,
              y: bounds.y + bounds.height / 4,
              size: Math.max(10, bounds.height * 0.8),
              font,
              color: rgb(0.16, 0.3, 0.27),
            });
          }
          continue;
        }

        if (value?.value) {
          page.drawText(value.value, {
            x: bounds.x + 2,
            y: bounds.y + Math.max(2, bounds.height / 3),
            size: Math.max(9, Math.min(12, bounds.height * 0.65)),
            font,
            color: rgb(0.1, 0.15, 0.2),
            maxWidth: bounds.width - 4,
          });
        }
      }
    }

    const certificateBuffer = await buildCertificatePdf({ envelope, document });
    const certificatePdf = await PDFDocument.load(certificateBuffer);
    const certificatePages = await originalPdf.copyPages(
      certificatePdf,
      certificatePdf.getPageIndices()
    );
    certificatePages.forEach((page) => originalPdf.addPage(page));

    const signedBuffer = Buffer.from(await originalPdf.save());
    const signedHash = hashBlake3(signedBuffer);
    const signedStoragePath = StorageKeys.esigningSignedDocument(
      envelope.tenantId,
      envelope.id,
      document.id
    );
    const certificateStoragePath = StorageKeys.esigningCertificateDocument(
      envelope.tenantId,
      envelope.id,
      document.id
    );

    await storage.upload(signedStoragePath, signedBuffer, {
      contentType: 'application/pdf',
      metadata: {
        envelopeId: envelope.id,
        documentId: document.id,
        certificateId: envelope.certificateId,
      },
    });
    await storage.upload(certificateStoragePath, certificateBuffer, {
      contentType: 'application/pdf',
      metadata: {
        envelopeId: envelope.id,
        documentId: document.id,
        certificateId: envelope.certificateId,
      },
    });

    await prisma.esigningEnvelopeDocument.update({
      where: { id: document.id },
      data: {
        signedStoragePath,
        signedHash,
      },
    });
  }

  await prisma.esigningEnvelope.update({
    where: { id: envelope.id },
    data: {
      pdfGenerationStatus: 'COMPLETED',
      pdfGenerationClaimedAt: null,
      pdfGenerationError: null,
    },
  });

  for (const recipient of envelope.recipients) {
    await sendEsigningCompletionEmail({
      to: recipient.email,
      recipientName: recipient.name,
      envelopeTitle: envelope.title,
      certificateId: envelope.certificateId,
    });
  }

  await sendEsigningCompletionEmail({
    to: envelope.createdBy.email,
    recipientName: senderName,
    envelopeTitle: envelope.title,
    certificateId: envelope.certificateId,
  });
}

async function markEnvelopePdfFailure(envelopeId: string, error: unknown): Promise<void> {
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
    },
  });

  if (!envelope) {
    return;
  }

  const message = error instanceof Error ? error.message : 'Unknown error';

  await prisma.$transaction(async (tx) => {
    await tx.esigningEnvelope.update({
      where: { id: envelopeId },
      data: {
        pdfGenerationStatus: 'FAILED',
        pdfGenerationClaimedAt: null,
        pdfGenerationAttempts: { increment: 1 },
        pdfGenerationError: message,
      },
    });

    await tx.esigningEnvelopeEvent.create({
      data: {
        tenantId: envelope.tenantId,
        envelopeId,
        action: 'PDF_GENERATION_FAILED',
        metadata: {
          message,
        },
      },
    });
  });

  const senderName =
    [envelope.createdBy.firstName, envelope.createdBy.lastName].filter(Boolean).join(' ').trim() ||
    envelope.createdBy.email;

  await sendEsigningPdfFailureEmailToSender({
    to: envelope.createdBy.email,
    senderName,
    envelopeTitle: envelope.title,
    errorMessage: message,
  });
}

export async function processQueuedEsigningPdfGeneration(input?: {
  limit?: number;
}): Promise<{
  processed: number;
  completed: number;
  failed: number;
}> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const limit = input?.limit ?? 5;

  const candidates = await prisma.esigningEnvelope.findMany({
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
    select: {
      id: true,
    },
  });

  let completed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const claim = await prisma.esigningEnvelope.updateMany({
      where: {
        id: candidate.id,
        status: 'COMPLETED',
        OR: [
          { pdfGenerationStatus: 'PENDING' },
          {
            pdfGenerationStatus: 'PROCESSING',
            pdfGenerationClaimedAt: { lt: staleBefore },
          },
        ],
      },
      data: {
        pdfGenerationStatus: 'PROCESSING',
        pdfGenerationClaimedAt: now,
      },
    });

    if (claim.count === 0) {
      continue;
    }

    try {
      await generateEnvelopeArtifacts(candidate.id);
      completed += 1;
    } catch (error) {
      failed += 1;
      log.error('Failed to generate signed e-signing PDFs', {
        envelopeId: candidate.id,
        error,
      });
      await markEnvelopePdfFailure(candidate.id, error);
    }
  }

  return {
    processed: completed + failed,
    completed,
    failed,
  };
}
