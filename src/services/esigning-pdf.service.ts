import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { v5 as uuidv5 } from 'uuid';
import { prisma } from '@/lib/prisma';
import { hashBlake3 } from '@/lib/encryption';
import { storage, StorageKeys } from '@/lib/storage';
import { createLogger } from '@/lib/logger';
import { createAuditLog } from '@/lib/audit';
import { Prisma } from '@/generated/prisma';
import {
  buildEsigningDeliveryDownloadUrl,
  createEsigningDeliveryToken,
  verifyEsigningDeliveryToken,
} from '@/lib/esigning-session';
import {
  buildEsigningEventLabel,
  formatEsigningAccessModeLabel,
  summarizeEsigningUserAgent,
} from '@/services/esigning-evidence';
import {
  sendEsigningCompletionEmail,
  sendEsigningPdfFailureEmailToSender,
} from '@/services/esigning-notification.service';

const log = createLogger('esigning-pdf');
const PROCESSING_LEASE_MS = 15 * 60 * 1000;
const MAX_EMAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const AUTO_FILE_NAMESPACE = '0ab5455a-3dcf-4660-8dfe-c6bc1d495301';
const ESIGNING_ARTIFACT_VERSION = 4;

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

function drawEventIcon(
  p: PDFPage,
  cx: number,
  cy: number,
  action: string,
  bgColor: ReturnType<typeof rgb>,
) {
  const R = 5.5;
  const white = rgb(1, 1, 1);

  p.drawCircle({ x: cx, y: cy, size: R, color: bgColor });

  switch (action) {
    case 'CREATED':
      // Plus sign
      p.drawLine({ start: { x: cx, y: cy - 3 }, end: { x: cx, y: cy + 3 }, color: white, thickness: 1.3 });
      p.drawLine({ start: { x: cx - 3, y: cy }, end: { x: cx + 3, y: cy }, color: white, thickness: 1.3 });
      break;

    case 'SENT':
      // Right-pointing arrow
      p.drawLine({ start: { x: cx - 2.5, y: cy }, end: { x: cx + 1.5, y: cy }, color: white, thickness: 1.3 });
      p.drawLine({ start: { x: cx + 1.5, y: cy }, end: { x: cx - 0.2, y: cy + 1.8 }, color: white, thickness: 1.3 });
      p.drawLine({ start: { x: cx + 1.5, y: cy }, end: { x: cx - 0.2, y: cy - 1.8 }, color: white, thickness: 1.3 });
      break;

    case 'VIEWED':
      // Eye: ring + pupil
      p.drawCircle({ x: cx, y: cy, size: 2.8, borderColor: white, borderWidth: 1.1 });
      p.drawCircle({ x: cx, y: cy, size: 1, color: white });
      break;

    case 'CONSENTED':
      // Shield outline (pentagon-ish) via lines
      p.drawLine({ start: { x: cx - 2.5, y: cy + 2.5 }, end: { x: cx + 2.5, y: cy + 2.5 }, color: white, thickness: 1 });
      p.drawLine({ start: { x: cx - 2.5, y: cy + 2.5 }, end: { x: cx - 2.5, y: cy - 0.5 }, color: white, thickness: 1 });
      p.drawLine({ start: { x: cx + 2.5, y: cy + 2.5 }, end: { x: cx + 2.5, y: cy - 0.5 }, color: white, thickness: 1 });
      p.drawLine({ start: { x: cx - 2.5, y: cy - 0.5 }, end: { x: cx, y: cy - 3 }, color: white, thickness: 1 });
      p.drawLine({ start: { x: cx + 2.5, y: cy - 0.5 }, end: { x: cx, y: cy - 3 }, color: white, thickness: 1 });
      // Inner check
      p.drawLine({ start: { x: cx - 1.5, y: cy + 0.3 }, end: { x: cx - 0.2, y: cy - 1 }, color: white, thickness: 1.2 });
      p.drawLine({ start: { x: cx - 0.2, y: cy - 1 }, end: { x: cx + 1.8, y: cy + 1.5 }, color: white, thickness: 1.2 });
      break;

    case 'SIGNED':
      // Pen/nib: diagonal stroke + small tail
      p.drawLine({ start: { x: cx - 2.5, y: cy - 2 }, end: { x: cx + 2, y: cy + 2.5 }, color: white, thickness: 1.5 });
      p.drawLine({ start: { x: cx - 2.5, y: cy - 2 }, end: { x: cx - 3.5, y: cy - 0.5 }, color: white, thickness: 1 });
      p.drawLine({ start: { x: cx - 2.5, y: cy - 2 }, end: { x: cx - 1, y: cy - 3.5 }, color: white, thickness: 1 });
      break;

    case 'COMPLETED':
      // Bold checkmark
      p.drawLine({ start: { x: cx - 3, y: cy + 0.5 }, end: { x: cx - 0.8, y: cy - 2 }, color: white, thickness: 1.6 });
      p.drawLine({ start: { x: cx - 0.8, y: cy - 2 }, end: { x: cx + 3, y: cy + 2.5 }, color: white, thickness: 1.6 });
      break;

    case 'DECLINED':
    case 'VOIDED':
      // X mark
      p.drawLine({ start: { x: cx - 2.5, y: cy - 2.5 }, end: { x: cx + 2.5, y: cy + 2.5 }, color: white, thickness: 1.4 });
      p.drawLine({ start: { x: cx - 2.5, y: cy + 2.5 }, end: { x: cx + 2.5, y: cy - 2.5 }, color: white, thickness: 1.4 });
      break;

    case 'REMINDER_SENT':
      // Bell: two verticals + top arc lines + base line + clapper dot
      p.drawLine({ start: { x: cx - 2.5, y: cy - 1.5 }, end: { x: cx - 2.5, y: cy + 1 }, color: white, thickness: 1.1 });
      p.drawLine({ start: { x: cx + 2.5, y: cy - 1.5 }, end: { x: cx + 2.5, y: cy + 1 }, color: white, thickness: 1.1 });
      p.drawLine({ start: { x: cx - 2.5, y: cy + 1 }, end: { x: cx - 1.5, y: cy + 2.5 }, color: white, thickness: 1.1 });
      p.drawLine({ start: { x: cx + 2.5, y: cy + 1 }, end: { x: cx + 1.5, y: cy + 2.5 }, color: white, thickness: 1.1 });
      p.drawLine({ start: { x: cx - 1.5, y: cy + 2.5 }, end: { x: cx + 1.5, y: cy + 2.5 }, color: white, thickness: 1.1 });
      p.drawLine({ start: { x: cx - 3, y: cy - 1.5 }, end: { x: cx + 3, y: cy - 1.5 }, color: white, thickness: 1.1 });
      p.drawCircle({ x: cx, y: cy - 3, size: 0.9, color: white });
      break;

    case 'EXPIRED':
      // Clock: circle outline + two hands
      p.drawCircle({ x: cx, y: cy, size: 3.5, borderColor: white, borderWidth: 1 });
      p.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy + 2.3 }, color: white, thickness: 1.2 });
      p.drawLine({ start: { x: cx, y: cy }, end: { x: cx + 1.8, y: cy + 0.8 }, color: white, thickness: 1.2 });
      break;

    case 'CORRECTED':
      // Two arrows in a circle (refresh-like): just draw two curved lines approximated
      p.drawLine({ start: { x: cx - 1, y: cy + 3 }, end: { x: cx + 2.5, y: cy + 1.5 }, color: white, thickness: 1.2 });
      p.drawLine({ start: { x: cx + 2.5, y: cy + 1.5 }, end: { x: cx + 1.5, y: cy - 0.5 }, color: white, thickness: 1.2 });
      p.drawLine({ start: { x: cx + 1, y: cy - 3 }, end: { x: cx - 2.5, y: cy - 1.5 }, color: white, thickness: 1.2 });
      p.drawLine({ start: { x: cx - 2.5, y: cy - 1.5 }, end: { x: cx - 1.5, y: cy + 0.5 }, color: white, thickness: 1.2 });
      break;

    case 'PDF_GENERATION_FAILED':
    default:
      // Exclamation: line + dot
      p.drawLine({ start: { x: cx, y: cy + 0.5 }, end: { x: cx, y: cy + 3 }, color: white, thickness: 1.5 });
      p.drawCircle({ x: cx, y: cy - 1.5, size: 1, color: white });
      break;
  }
}

async function buildCertificatePdf(input: {
  envelope: Awaited<ReturnType<typeof loadEnvelopeForPdf>>;
  document: Awaited<ReturnType<typeof loadEnvelopeForPdf>>['documents'][number];
}) {
  const certificatePdf = await PDFDocument.create();
  const headingFont = await certificatePdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await certificatePdf.embedFont(StandardFonts.Helvetica);

  const PW = 595.28;
  const PH = 841.89;
  const ML = 44;
  const MR = 44;
  const CW = PW - ML - MR;

  // ── Colour palette ──────────────────────────────────────────────────────────
  const cBrand     = rgb(0.16, 0.30, 0.27);
  const cText      = rgb(0.10, 0.13, 0.17);
  const cTextSec   = rgb(0.36, 0.42, 0.48);
  const cTextMuted = rgb(0.56, 0.62, 0.68);
  const cBorder    = rgb(0.86, 0.89, 0.92);
  const cSuccess   = rgb(0.09, 0.54, 0.33);
  const cError     = rgb(0.77, 0.18, 0.22);

  // Recipient palettes: [main, light-background]
  const RECIPIENT_PALETTES: Array<[ReturnType<typeof rgb>, ReturnType<typeof rgb>]> = [
    [rgb(0.00, 0.49, 0.45), rgb(0.90, 0.97, 0.96)],
    [rgb(0.29, 0.27, 0.72), rgb(0.94, 0.93, 0.99)],
    [rgb(0.65, 0.42, 0.00), rgb(0.99, 0.96, 0.87)],
    [rgb(0.77, 0.18, 0.22), rgb(0.99, 0.92, 0.92)],
    [rgb(0.48, 0.14, 0.70), rgb(0.96, 0.91, 0.99)],
    [rgb(0.00, 0.43, 0.73), rgb(0.90, 0.95, 0.99)],
  ];

  // ── Date formatter ──────────────────────────────────────────────────────────
  function formatPdfDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    }).format(date);
  }

  // ── Evidence sub-line builder ───────────────────────────────────────────────
  function buildEvidenceSubLine(ip: string | null | undefined, userAgent: string | null | undefined): string | null {
    const device = summarizeEsigningUserAgent(userAgent);
    const parts: string[] = [];
    if (ip) parts.push(`IP Address: ${ip}`);
    if (device) parts.push(device);
    return parts.length > 0 ? parts.join('  ·  ') : null;
  }

  let page: PDFPage = null!;
  let cursorY = 0;
  let pageIndex = 0;

  // ── Page helpers ────────────────────────────────────────────────────────────
  function startPage() {
    pageIndex += 1;
    page = certificatePdf.addPage([PW, PH]);

    // Thin brand accent bar at top
    page.drawRectangle({ x: 0, y: PH - 3, width: PW, height: 3, color: cBrand });

    if (pageIndex === 1) {
      page.drawText('CERTIFICATE OF COMPLETION', {
        x: ML, y: PH - 21, size: 7.5, font: headingFont, color: cBrand,
      });

      // Certificate ID block (top-right)
      const certIdValue = input.envelope.certificateId;
      const idW = bodyFont.widthOfTextAtSize(certIdValue, 8.5);
      const idLabelW = headingFont.widthOfTextAtSize('CERTIFICATE ID', 6.5);
      const idBlockX = PW - MR - Math.max(idW, idLabelW);
      page.drawText('CERTIFICATE ID', {
        x: idBlockX, y: PH - 21, size: 6.5, font: headingFont, color: cTextMuted,
      });
      page.drawText(certIdValue, {
        x: idBlockX, y: PH - 31.5, size: 8.5, font: bodyFont, color: cText,
      });

      // Envelope title
      page.drawText(input.envelope.title, {
        x: ML, y: PH - 40, size: 15, font: headingFont, color: cText,
        maxWidth: idBlockX - ML - 10,
      });

      // Company only (no tenant)
      if (input.envelope.company?.name) {
        page.drawText(input.envelope.company.name, {
          x: ML, y: PH - 58, size: 8.5, font: bodyFont, color: cTextSec,
        });
      }

      // Status · Completed
      const completedStr = input.envelope.completedAt
        ? `    Completed: ${formatPdfDate(input.envelope.completedAt)}`
        : '';
      const statusLine = `Status: ${input.envelope.status}${completedStr}`;
      page.drawText(statusLine, {
        x: ML, y: PH - 70, size: 8, font: bodyFont, color: cTextMuted,
      });

      page.drawLine({
        start: { x: ML, y: PH - 81 }, end: { x: PW - MR, y: PH - 81 },
        color: cBorder, thickness: 0.5,
      });

      cursorY = PH - 106;
    } else {
      page.drawText(input.envelope.certificateId, {
        x: ML, y: PH - 21, size: 7.5, font: bodyFont, color: cTextMuted,
      });
      page.drawLine({
        start: { x: ML, y: PH - 29 }, end: { x: PW - MR, y: PH - 29 },
        color: cBorder, thickness: 0.4,
      });
      cursorY = PH - 50;
    }
  }

  function ensureSpace(pts: number) {
    if (cursorY - pts < 52) {
      startPage();
    }
  }

  function sectionTitle(title: string) {
    ensureSpace(30);
    page.drawText(title, { x: ML, y: cursorY, size: 10, font: headingFont, color: cBrand });
    cursorY -= 5;
    page.drawLine({
      start: { x: ML, y: cursorY }, end: { x: PW - MR, y: cursorY },
      color: cBrand, thickness: 0.4,
    });
    cursorY -= 15;
  }

  // ── Build content ───────────────────────────────────────────────────────────
  startPage();

  const recipientById = new Map(input.envelope.recipients.map((r) => [r.id, r]));

  // ── RECIPIENT EVIDENCE ──────────────────────────────────────────────────────
  sectionTitle('Recipient Evidence');

  input.envelope.recipients.forEach((rec, ri) => {
    const [rMain, rBg] = RECIPIENT_PALETTES[ri % RECIPIENT_PALETTES.length];

    let blockPts = 18 + 12 * 3;
    if (rec.consentedAt) blockPts += 10;
    if (rec.signedAt) blockPts += 10;
    ensureSpace(blockPts + 12);

    // Name row with tinted background — name + email only (no role/access/sequence)
    page.drawRectangle({ x: ML, y: cursorY - 3, width: CW, height: 15, color: rBg });
    page.drawText(rec.name, {
      x: ML + 6, y: cursorY, size: 9.5, font: headingFont, color: rMain,
    });
    const nameW = headingFont.widthOfTextAtSize(rec.name, 9.5);
    page.drawText(rec.email, {
      x: ML + 6 + nameW + 7, y: cursorY, size: 8.5, font: bodyFont, color: cTextSec,
    });

    cursorY -= 18;

    // Evidence rows
    type EvidenceRow = {
      label: string;
      value: string;
      subLine?: string | null;
      filled: boolean;
      dotColor: ReturnType<typeof rgb>;
      valueColor: ReturnType<typeof rgb>;
    };

    const evidenceRows: EvidenceRow[] = [
      {
        label: 'Viewed',
        value: rec.viewedAt ? formatPdfDate(rec.viewedAt) : 'Not recorded',
        filled: Boolean(rec.viewedAt),
        dotColor: rec.viewedAt ? rMain : cTextMuted,
        valueColor: rec.viewedAt ? cTextSec : cTextMuted,
      },
      {
        label: 'Consented',
        value: rec.consentedAt ? formatPdfDate(rec.consentedAt) : 'Not recorded',
        subLine: rec.consentedAt
          ? buildEvidenceSubLine(rec.consentIp, rec.consentUserAgent)
          : null,
        filled: Boolean(rec.consentedAt),
        dotColor: rec.consentedAt ? rMain : cTextMuted,
        valueColor: rec.consentedAt ? cTextSec : cTextMuted,
      },
      {
        label: 'Signed',
        value: rec.signedAt
          ? formatPdfDate(rec.signedAt)
          : (rec.status === 'DECLINED' ? 'Declined' : 'Awaiting signature'),
        subLine: rec.signedAt
          ? buildEvidenceSubLine(rec.signedIp, rec.signedUserAgent)
          : null,
        filled: Boolean(rec.signedAt),
        dotColor: rec.signedAt ? rMain : rec.status === 'DECLINED' ? cError : cTextMuted,
        valueColor: rec.signedAt ? rMain : rec.status === 'DECLINED' ? cError : cTextMuted,
      },
    ];

    for (const row of evidenceRows) {
      ensureSpace(row.subLine ? 22 : 13);

      if (row.filled) {
        page.drawCircle({ x: ML + 8, y: cursorY + 3, size: 2.8, color: row.dotColor });
      } else {
        page.drawCircle({ x: ML + 8, y: cursorY + 3, size: 2.8, borderColor: row.dotColor, borderWidth: 0.8 });
      }

      page.drawText(`${row.label}:`, {
        x: ML + 16, y: cursorY, size: 8.5, font: headingFont, color: cText,
      });
      const lw = headingFont.widthOfTextAtSize(`${row.label}:`, 8.5);
      page.drawText(row.value, {
        x: ML + 16 + lw + 4, y: cursorY, size: 8.5, font: bodyFont, color: row.valueColor,
      });
      cursorY -= 12;

      if (row.subLine) {
        page.drawText(row.subLine, {
          x: ML + 16, y: cursorY, size: 7.5, font: bodyFont, color: cTextMuted,
        });
        cursorY -= 11;
      }
    }

    cursorY -= 10;
  });

  cursorY -= 6;

  // ── AUDIT TRAIL ─────────────────────────────────────────────────────────────
  sectionTitle('Audit Trail');

  const sortedEvents = [...input.envelope.events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  for (const event of sortedEvents) {
    const recipient = event.recipientId ? recipientById.get(event.recipientId) : null;
    const rIndex = recipient
      ? input.envelope.recipients.findIndex((r) => r.id === recipient.id)
      : -1;

    const isNegative = ['DECLINED', 'VOIDED', 'EXPIRED', 'PDF_GENERATION_FAILED'].includes(event.action);
    const isCompletion = event.action === 'COMPLETED';
    const iconColor =
      isNegative ? cError
      : isCompletion ? cSuccess
      : rIndex >= 0 ? RECIPIENT_PALETTES[rIndex % RECIPIENT_PALETTES.length][0]
      : cBrand;
    const rMain = rIndex >= 0 ? RECIPIENT_PALETTES[rIndex % RECIPIENT_PALETTES.length][0] : null;

    // IP + device sub-line for CONSENTED and SIGNED
    let evidenceLine: string | null = null;
    if (recipient) {
      if (event.action === 'CONSENTED') {
        evidenceLine = buildEvidenceSubLine(recipient.consentIp, recipient.consentUserAgent);
      } else if (event.action === 'SIGNED') {
        evidenceLine = buildEvidenceSubLine(recipient.signedIp, recipient.signedUserAgent);
      }
    }

    ensureSpace(evidenceLine ? 27 : 17);

    drawEventIcon(page, ML + 7, cursorY + 3, event.action, iconColor);

    // Draw label with recipient name coloured in their palette colour
    const fullLabel = buildEsigningEventLabel({
      action: event.action,
      recipientName: recipient?.name ?? null,
    });
    const labelX = ML + 19;
    const labelMaxW = CW - 130;

    if (recipient?.name && rMain) {
      const nameIdx = fullLabel.lastIndexOf(recipient.name);
      if (nameIdx > 0) {
        const before = fullLabel.slice(0, nameIdx);
        const after = fullLabel.slice(nameIdx + recipient.name.length);
        const beforeW = bodyFont.widthOfTextAtSize(before, 8.5);
        const nameW2 = bodyFont.widthOfTextAtSize(recipient.name, 8.5);
        page.drawText(before, { x: labelX, y: cursorY, size: 8.5, font: bodyFont, color: cText });
        page.drawText(recipient.name, { x: labelX + beforeW, y: cursorY, size: 8.5, font: headingFont, color: rMain });
        if (after) {
          page.drawText(after, { x: labelX + beforeW + nameW2, y: cursorY, size: 8.5, font: bodyFont, color: cText, maxWidth: labelMaxW - beforeW - nameW2 });
        }
      } else {
        page.drawText(fullLabel, { x: labelX, y: cursorY, size: 8.5, font: bodyFont, color: cText, maxWidth: labelMaxW });
      }
    } else {
      page.drawText(fullLabel, { x: labelX, y: cursorY, size: 8.5, font: bodyFont, color: cText, maxWidth: labelMaxW });
    }

    const tsText = formatPdfDate(event.createdAt);
    const tsW = bodyFont.widthOfTextAtSize(tsText, 7.5);
    page.drawText(tsText, {
      x: PW - MR - tsW, y: cursorY, size: 7.5, font: bodyFont, color: cTextMuted,
    });

    cursorY -= 13;

    if (evidenceLine) {
      page.drawText(evidenceLine, {
        x: labelX, y: cursorY, size: 7.5, font: bodyFont, color: cTextMuted, maxWidth: labelMaxW,
      });
      cursorY -= 12;
    }

    cursorY -= 4;
  }

  cursorY -= 6;

  // ── DOCUMENT ────────────────────────────────────────────────────────────────
  sectionTitle('Document');

  ensureSpace(14);
  page.drawText('File:', { x: ML, y: cursorY, size: 8.5, font: headingFont, color: cTextSec });
  page.drawText(input.document.fileName, {
    x: ML + headingFont.widthOfTextAtSize('File:', 8.5) + 5, y: cursorY,
    size: 8.5, font: bodyFont, color: cText,
  });
  cursorY -= 15;

  for (const [label, value, isError] of [
    ['Original SHA-256', input.document.originalHash, false],
    ['Signed SHA-256', input.document.signedHash ?? 'Not generated', !input.document.signedHash],
  ] as Array<[string, string, boolean]>) {
    ensureSpace(14);
    const lblText = `${label}:`;
    const lblW = headingFont.widthOfTextAtSize(lblText, 8.5);
    page.drawText(lblText, { x: ML, y: cursorY, size: 8.5, font: headingFont, color: cTextSec });
    page.drawText(value, {
      x: ML + lblW + 5, y: cursorY, size: 8.5, font: bodyFont,
      color: isError ? cError : cTextMuted,
      maxWidth: CW - lblW - 5,
    });
    cursorY -= Math.max(1, Math.ceil((value.length * 5.2) / (CW - lblW - 5))) * 12 + 4;
  }

  return Buffer.from(await certificatePdf.save());
}

function buildEmailAttachments(input: {
  documents: Array<{
    fileName: string;
    signedBuffer: Buffer;
  }>;
}): Array<{
  filename: string;
  content: Buffer;
  contentType: string;
}> {
  const totalBytes = input.documents.reduce((sum, document) => sum + document.signedBuffer.byteLength, 0);
  if (totalBytes > MAX_EMAIL_ATTACHMENT_BYTES) {
    return [];
  }

  return input.documents.map((document) => ({
    filename: document.fileName.toLowerCase().endsWith('.pdf')
      ? document.fileName.replace(/\.pdf$/i, '-signed.pdf')
      : `${document.fileName}-signed.pdf`,
    content: document.signedBuffer,
    contentType: 'application/pdf',
  }));
}

function sanitizePdfBaseName(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 120) || 'esigning-package';
}

function getEnvelopeArtifactVersion(metadata: Prisma.JsonValue | null | undefined): number | null {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
    return null;
  }

  const raw = (metadata as Record<string, unknown>).artifactVersion;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function withEnvelopeArtifactVersion(metadata: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue {
  const base =
    metadata && !Array.isArray(metadata) && typeof metadata === 'object'
      ? { ...(metadata as Record<string, unknown>) }
      : {};

  return {
    ...base,
    artifactVersion: ESIGNING_ARTIFACT_VERSION,
  } satisfies Prisma.InputJsonValue;
}

function buildSignedPackageFileName(fileName: string): string {
  return fileName.toLowerCase().endsWith('.pdf')
    ? fileName.replace(/\.pdf$/i, '-signed.pdf')
    : `${fileName}-signed.pdf`;
}

async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  const mergedPdf = await PDFDocument.create();

  for (const buffer of buffers) {
    const sourcePdf = await PDFDocument.load(buffer);
    const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return Buffer.from(await mergedPdf.save());
}

async function buildDeliveryDocumentLinks(input: {
  envelopeId: string;
  actorType: 'recipient' | 'sender';
  recipientId?: string;
  documents: Array<{
    id: string;
    fileName: string;
  }>;
}): Promise<Array<{
  label: string;
  signedUrl: string;
  certificateUrl: string;
}>> {
  const token = await createEsigningDeliveryToken({
    envelopeId: input.envelopeId,
    actorType: input.actorType,
    recipientId: input.recipientId,
  });

  return input.documents.map((document) => ({
    label: document.fileName,
    signedUrl: buildEsigningDeliveryDownloadUrl({
      token,
      documentId: document.id,
      variant: 'signed',
    }),
    certificateUrl: buildEsigningDeliveryDownloadUrl({
      token,
      documentId: document.id,
      variant: 'certificate',
    }),
  }));
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

async function autoFileCompletedEnvelopeDocuments(input: {
  envelope: Awaited<ReturnType<typeof loadEnvelopeForPdf>>;
  documents: Array<{
    id: string;
    fileName: string;
    signedBuffer: Buffer;
  }>;
}): Promise<void> {
  const { envelope } = input;
  if (!envelope.companyId) {
    return;
  }

  for (const document of input.documents) {
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
    const fileSize = document.signedBuffer.byteLength;
    const now = new Date();

    await storage.upload(storageKey, document.signedBuffer, {
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
        extractedAt: now,
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
        extractedAt: now,
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
}

async function generateEnvelopeArtifacts(
  envelopeId: string,
  options?: {
    sendNotifications?: boolean;
  }
): Promise<void> {
  const envelope = await loadEnvelopeForPdf(envelopeId);
  const sendNotifications = options?.sendNotifications ?? true;

  if (envelope.status !== 'COMPLETED') {
    throw new Error('Only completed envelopes can generate signed PDFs');
  }

  const senderName =
    [envelope.createdBy.firstName, envelope.createdBy.lastName].filter(Boolean).join(' ').trim() ||
    envelope.createdBy.email;
  const fieldValuesByDefinitionId = new Map(
    envelope.fieldValues.map((value) => [value.fieldDefinitionId, value])
  );
  const generatedDocuments: Array<{
    id: string;
    fileName: string;
    signedBuffer: Buffer;
  }> = [];

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

    generatedDocuments.push({
      id: document.id,
      fileName: document.fileName,
      signedBuffer,
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
      metadata: withEnvelopeArtifactVersion(envelope.metadata),
    },
  });

  await autoFileCompletedEnvelopeDocuments({
    envelope,
    documents: generatedDocuments,
  });

  if (sendNotifications) {
    const attachments = buildEmailAttachments({ documents: generatedDocuments });

    for (const recipient of envelope.recipients) {
      const documentLinks = await buildDeliveryDocumentLinks({
        envelopeId: envelope.id,
        actorType: 'recipient',
        recipientId: recipient.id,
        documents: generatedDocuments.map((document) => ({
          id: document.id,
          fileName: document.fileName,
        })),
      });

      await sendEsigningCompletionEmail({
        to: recipient.email,
        recipientName: recipient.name,
        envelopeTitle: envelope.title,
        certificateId: envelope.certificateId,
        documentLinks,
        attachments,
        actorType: 'recipient',
      });
    }

    const senderDocumentLinks = await buildDeliveryDocumentLinks({
      envelopeId: envelope.id,
      actorType: 'sender',
      documents: generatedDocuments.map((document) => ({
        id: document.id,
        fileName: document.fileName,
      })),
    });

    await sendEsigningCompletionEmail({
      to: envelope.createdBy.email,
      recipientName: senderName,
      envelopeTitle: envelope.title,
      certificateId: envelope.certificateId,
      documentLinks: senderDocumentLinks,
      attachments,
      actorType: 'sender',
    });
  }
}

export async function ensureEsigningEnvelopeArtifacts(input: {
  envelopeId: string;
  requireCertificates?: boolean;
}): Promise<void> {
  const envelope = await prisma.esigningEnvelope.findUnique({
    where: { id: input.envelopeId },
    include: {
      documents: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          signedStoragePath: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }

  if (envelope.status !== 'COMPLETED') {
    throw new Error('Completed package is not available yet');
  }

  let needsGeneration = false;

  if (getEnvelopeArtifactVersion(envelope.metadata) !== ESIGNING_ARTIFACT_VERSION) {
    needsGeneration = true;
  }

  if (!needsGeneration) {
    for (const document of envelope.documents) {
      if (!document.signedStoragePath || !(await storage.exists(document.signedStoragePath))) {
        needsGeneration = true;
        break;
      }

      if (input.requireCertificates) {
        const certificateStoragePath = StorageKeys.esigningCertificateDocument(
          envelope.tenantId,
          envelope.id,
          document.id
        );
        if (!(await storage.exists(certificateStoragePath))) {
          needsGeneration = true;
          break;
        }
      }
    }
  }

  if (!needsGeneration) {
    if (envelope.pdfGenerationStatus !== 'COMPLETED') {
      await prisma.esigningEnvelope.update({
        where: { id: envelope.id },
        data: {
          pdfGenerationStatus: 'COMPLETED',
          pdfGenerationClaimedAt: null,
          pdfGenerationError: null,
        },
      });
    }
    return;
  }

  await prisma.esigningEnvelope.update({
    where: { id: envelope.id },
    data: {
      pdfGenerationStatus: 'PROCESSING',
      pdfGenerationClaimedAt: new Date(),
      pdfGenerationError: null,
    },
  });

  try {
    await generateEnvelopeArtifacts(envelope.id, { sendNotifications: false });
  } catch (error) {
    await markEnvelopePdfFailure(envelope.id, error);
    throw error;
  }
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

export async function generateEsigningEnvelopeArtifactsNow(input: {
  envelopeId: string;
}): Promise<'generated' | 'already-processing' | 'already-completed'> {
  const envelope = await prisma.esigningEnvelope.findUnique({
    where: { id: input.envelopeId },
    select: {
      id: true,
      status: true,
      pdfGenerationStatus: true,
      pdfGenerationClaimedAt: true,
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }

  if (envelope.status !== 'COMPLETED') {
    throw new Error('Only completed envelopes can generate signed PDFs');
  }

  if (envelope.pdfGenerationStatus === 'COMPLETED') {
    return 'already-completed';
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const claim = await prisma.esigningEnvelope.updateMany({
    where: {
      id: input.envelopeId,
      status: 'COMPLETED',
      OR: [
        { pdfGenerationStatus: null },
        { pdfGenerationStatus: 'PENDING' },
        { pdfGenerationStatus: 'FAILED' },
        {
          pdfGenerationStatus: 'PROCESSING',
          pdfGenerationClaimedAt: { lt: staleBefore },
        },
      ],
    },
    data: {
      pdfGenerationStatus: 'PROCESSING',
      pdfGenerationClaimedAt: now,
      pdfGenerationError: null,
    },
  });

  if (claim.count === 0) {
    return 'already-processing';
  }

  try {
    await generateEnvelopeArtifacts(input.envelopeId);
    return 'generated';
  } catch (error) {
    await markEnvelopePdfFailure(input.envelopeId, error);
    throw error;
  }
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

export async function downloadEsigningEnvelopePackage(input: {
  tenantId: string;
  envelopeId: string;
  variant?: 'documents' | 'documents_with_certificates' | 'certificates';
}): Promise<{
  buffer: Buffer;
  fileName: string;
}> {
  const variant = input.variant ?? 'documents_with_certificates';
  await ensureEsigningEnvelopeArtifacts({
    envelopeId: input.envelopeId,
    requireCertificates: variant !== 'documents',
  });

  const envelope = await prisma.esigningEnvelope.findFirst({
    where: {
      id: input.envelopeId,
      tenantId: input.tenantId,
    },
    include: {
      documents: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!envelope) {
    throw new Error('Envelope not found');
  }
  if (envelope.status !== 'COMPLETED') {
    throw new Error('Completed package is not available yet');
  }
  const buffers: Buffer[] = [];

  for (const document of envelope.documents) {
    if (variant === 'certificates') {
      const certificateStoragePath = StorageKeys.esigningCertificateDocument(
        envelope.tenantId,
        envelope.id,
        document.id
      );
      buffers.push(await storage.download(certificateStoragePath));
      continue;
    }

    if (!document.signedStoragePath) {
      throw new Error('One or more generated PDFs are not available yet');
    }

    buffers.push(await storage.download(document.signedStoragePath));

    if (variant === 'documents_with_certificates') {
      const certificateStoragePath = StorageKeys.esigningCertificateDocument(
        envelope.tenantId,
        envelope.id,
        document.id
      );
      buffers.push(await storage.download(certificateStoragePath));
    }
  }

  if (buffers.length === 0) {
    throw new Error('No generated PDFs are available for download');
  }

  const fileNameBase = sanitizePdfBaseName(envelope.title);
  const fileName =
    variant === 'certificates'
      ? `${fileNameBase}-certificates.pdf`
      : variant === 'documents'
        ? `${fileNameBase}-documents.pdf`
        : `${fileNameBase}-documents-and-certificates.pdf`;

  return {
    buffer: await mergePdfBuffers(buffers),
    fileName,
  };
}

export async function downloadEsigningDeliveryDocument(input: {
  token: string;
  documentId: string;
  variant?: 'signed' | 'certificate';
}): Promise<{
  buffer: Buffer;
  fileName: string;
}> {
  const claims = await verifyEsigningDeliveryToken(input.token);
  if (!claims) {
    throw new Error('Download link is invalid or has expired');
  }

  const envelope = await prisma.esigningEnvelope.findUnique({
    where: { id: claims.envelopeId },
    include: {
      documents: {
        orderBy: { sortOrder: 'asc' },
      },
      recipients: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!envelope || envelope.status !== 'COMPLETED') {
    throw new Error('Completed package is not available');
  }

  const variant = input.variant ?? 'signed';
  await ensureEsigningEnvelopeArtifacts({
    envelopeId: envelope.id,
    requireCertificates: variant === 'certificate',
  });

  if (
    claims.actorType === 'recipient' &&
    (!claims.recipientId || !envelope.recipients.some((recipient) => recipient.id === claims.recipientId))
  ) {
    throw new Error('Download link is not valid for this recipient');
  }

  const document = envelope.documents.find((entry) => entry.id === input.documentId);
  if (!document) {
    throw new Error('Document not found');
  }

  const storagePath =
    variant === 'certificate'
      ? StorageKeys.esigningCertificateDocument(envelope.tenantId, envelope.id, document.id)
      : document.signedStoragePath;

  if (!storagePath) {
    throw new Error('Document is not available');
  }

  const buffer = await storage.download(storagePath);
  const fileName =
    variant === 'certificate'
      ? document.fileName.toLowerCase().endsWith('.pdf')
        ? document.fileName.replace(/\.pdf$/i, '-certificate.pdf')
        : `${document.fileName}-certificate.pdf`
      : document.fileName.toLowerCase().endsWith('.pdf')
        ? document.fileName.replace(/\.pdf$/i, '-signed.pdf')
        : `${document.fileName}-signed.pdf`;

  return { buffer, fileName };
}
