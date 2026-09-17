import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { hashBlake3 } from '@/lib/encryption';
import { storage, StorageKeys } from '@/lib/storage';
import { markFilingJobsForTerminalSourceFailure } from '@/services/esigning-sharepoint-filing/enqueue';
import {
  getEsigningDocumentOriginalFileName,
  getEsigningDocumentVariantFileName,
} from '@/lib/esigning-document-filename';
import { Prisma } from '@/generated/prisma';
import {
  buildEsigningDeliveryDownloadUrl,
  buildEsigningVerificationUrl,
  createEsigningDeliveryToken,
  verifyEsigningDeliveryToken,
} from '@/lib/esigning-session';
import {
  buildEsigningEventLabel,
  summarizeEsigningUserAgent,
} from '@/services/esigning-evidence';
import {
  sendEsigningPdfFailureEmailToSender,
} from '@/services/esigning-notification.service';
import { recordEsigningEnvelopeEmailDeliveryResults, withEsigningDeliveryTarget } from '@/services/esigning-email-delivery.service';

const PROCESSING_LEASE_MS = 15 * 60 * 1000;
const MAX_EMAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ESIGNING_ARTIFACT_VERSION = 7;

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

export async function buildCertificatePdf(input: {
  envelope: Awaited<ReturnType<typeof loadEnvelopeForPdf>>;
  document: Awaited<ReturnType<typeof loadEnvelopeForPdf>>['documents'][number];
}) {
  const certificatePdf = await PDFDocument.create();
  const headingFont = await certificatePdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await certificatePdf.embedFont(StandardFonts.Helvetica);

  const PW = 595.28;
  const PH = 841.89;
  const ML = 48;
  const MR = 48;
  const CW = PW - ML - MR;
  const FOOTER_LIMIT = 66;

  // ── Colour palette ──────────────────────────────────────────────────────────
  const cBrand     = rgb(0.16, 0.30, 0.27);
  const cBrandSoft = rgb(0.74, 0.82, 0.79);
  const cText      = rgb(0.10, 0.13, 0.17);
  const cTextSec   = rgb(0.36, 0.42, 0.48);
  const cTextMuted = rgb(0.56, 0.62, 0.68);
  const cBorder    = rgb(0.86, 0.89, 0.92);
  const cSurface   = rgb(0.976, 0.980, 0.984);
  const cWhite     = rgb(1, 1, 1);
  const cSuccess   = rgb(0.09, 0.54, 0.33);
  const cWarning   = rgb(0.68, 0.45, 0.02);
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

  // ── Text helpers ────────────────────────────────────────────────────────────
  // StandardFonts are WinAnsi-encoded and throw on unsupported code points
  // (CJK names, emoji, ...). Replace anything outside the supported range.
  function safe(value: string | null | undefined): string {
    if (!value) return '';
    return value
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2022/g, '\u00B7')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');
  }

  function widthOf(text: string, font: typeof bodyFont, size: number): number {
    return font.widthOfTextAtSize(text, size);
  }

  function centeredTextY(
    boxY: number,
    boxHeight: number,
    font: typeof bodyFont,
    size: number,
  ): number {
    return boxY + (boxHeight - font.heightAtSize(size)) / 2 + 1;
  }

  function truncate(text: string, font: typeof bodyFont, size: number, maxWidth: number): string {
    const value = safe(text);
    if (widthOf(value, font, size) <= maxWidth) return value;
    let low = 0;
    let high = value.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (widthOf(`${value.slice(0, mid)}...`, font, size) <= maxWidth) low = mid;
      else high = mid - 1;
    }
    return `${value.slice(0, low)}...`;
  }

  function wrap(text: string, font: typeof bodyFont, size: number, maxWidth: number): string[] {
    const value = safe(text);
    if (!value) return [];
    const lines: string[] = [];
    let current = '';

    const pushToken = (token: string) => {
      // Break tokens that never fit on their own (hashes, long URLs).
      let rest = token;
      while (widthOf(rest, font, size) > maxWidth) {
        let cut = 1;
        while (cut < rest.length && widthOf(rest.slice(0, cut + 1), font, size) <= maxWidth) cut += 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    };

    for (const token of value.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${token}` : token;
      if (widthOf(candidate, font, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      pushToken(token);
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawRight(
    p: PDFPage,
    text: string,
    xRight: number,
    y: number,
    size: number,
    font: typeof bodyFont,
    color: ReturnType<typeof rgb>,
  ) {
    const value = safe(text);
    p.drawText(value, { x: xRight - widthOf(value, font, size), y, size, font, color });
  }

  // ── Date formatter ──────────────────────────────────────────────────────────
  const SGT_TIME_ZONE = 'Asia/Singapore';
  const SGT_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: SGT_TIME_ZONE,
  });

  function formatPdfDate(date: Date): string {
    const parts = SGT_DATE_FORMATTER.formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((entry) => entry.type === type)?.value ?? '';
    const day = String(Number(part('day')));
    const month = part('month').slice(0, 3);
    return `${day} ${month} ${part('year')}, ${part('hour')}:${part('minute')} SGT`;
  }

  // Compact variant for narrow summary cells.
  function formatPdfDateCompact(date: Date): string {
    return formatPdfDate(date);
  }

  // ── Evidence sub-line builder ───────────────────────────────────────────────
  function buildEvidenceSubLine(ip: string | null | undefined, userAgent: string | null | undefined): string | null {
    const device = summarizeEsigningUserAgent(userAgent);
    const parts: string[] = [];
    if (ip) parts.push(`IP ${ip}`);
    if (device) parts.push(device);
    return parts.length > 0 ? parts.join('  \u00B7  ') : null;
  }

  const status = input.envelope.status;
  const statusColor =
    status === 'COMPLETED' ? cSuccess
    : ['DECLINED', 'VOIDED', 'EXPIRED'].includes(status) ? cError
    : cWarning;

  const certificateId = input.envelope.certificateId;
  const verificationUrl = buildEsigningVerificationUrl(certificateId);

  // Certificate ID block geometry (top-right of the header band).
  const ID_SIZE = 9.5;
  const ID_BOX_H = 20;
  const TITLE_ROW_H = 22;
  const titleRowY = PH - 67;
  const idValueW = widthOf(certificateId, bodyFont, ID_SIZE);
  const idBlockW = Math.max(idValueW + 16, widthOf('CERTIFICATE ID', headingFont, 6.5));
  const idBlockX = PW - MR - idBlockW;
  const idBlockY = titleRowY - 27;
  const HEADER_H = 106;

  const pages: PDFPage[] = [];
  let page: PDFPage = null!;
  let cursorY = 0;

  // ── Page helpers ────────────────────────────────────────────────────────────
  function startPage() {
    page = certificatePdf.addPage([PW, PH]);
    pages.push(page);

    if (pages.length === 1) {
      // Full-width brand header band
      page.drawRectangle({ x: 0, y: PH - HEADER_H, width: PW, height: HEADER_H, color: cBrand });

      // Fixed certificate title aligned with the certificate ID label.
      page.drawText('CERTIFICATE OF COMPLETION', {
        x: ML,
        y: centeredTextY(titleRowY, TITLE_ROW_H, headingFont, 16),
        size: 16,
        font: headingFont,
        color: cWhite,
      });

      // Certificate ID label and value use the same Helvetica family as the rest of the certificate.
      drawRight(
        page,
        'CERTIFICATE ID',
        PW - MR,
        centeredTextY(titleRowY, TITLE_ROW_H, headingFont, 6.5),
        6.5,
        headingFont,
        cBrandSoft,
      );
      page.drawRectangle({
        x: idBlockX, y: idBlockY, width: idBlockW, height: ID_BOX_H,
        borderColor: cBrandSoft, borderWidth: 0.6,
      });
      page.drawText(certificateId, {
        x: idBlockX + (idBlockW - idValueW) / 2,
        y: centeredTextY(idBlockY, ID_BOX_H, bodyFont, ID_SIZE),
        size: ID_SIZE,
        font: bodyFont,
        color: cWhite,
      });

      // Company context only. Completion badge/timestamp and sender attribution are omitted.
      if (input.envelope.company?.name) {
        page.drawText(truncate(input.envelope.company.name, bodyFont, 8.5, idBlockX - ML - 18), {
          x: ML, y: PH - 91, size: 8.5, font: bodyFont, color: cBrandSoft,
        });
      }

      cursorY = PH - HEADER_H - 28;
    } else {
      page.drawRectangle({ x: 0, y: PH - 3, width: PW, height: 3, color: cBrand });
      page.drawText('Certificate of Completion', {
        x: ML, y: PH - 24, size: 7.5, font: bodyFont, color: cTextMuted,
      });
      drawRight(page, certificateId, PW - MR, PH - 24, 7.5, bodyFont, cTextMuted);
      page.drawLine({
        start: { x: ML, y: PH - 32 }, end: { x: PW - MR, y: PH - 32 },
        color: cBorder, thickness: 0.4,
      });
      cursorY = PH - 56;
    }
  }

  function ensureSpace(pts: number) {
    if (cursorY - pts < FOOTER_LIMIT) {
      startPage();
    }
  }

  function sectionTitle(title: string) {
    ensureSpace(44);
    const barY = cursorY - 1;
    const barH = 9.5;
    page.drawRectangle({ x: ML, y: barY, width: 2.5, height: barH, color: cBrand });
    page.drawText(safe(title).toUpperCase(), {
      x: ML + 9,
      y: centeredTextY(barY, barH, headingFont, 9),
      size: 9,
      font: headingFont,
      color: cBrand,
    });
    cursorY -= 8;
    page.drawLine({
      start: { x: ML, y: cursorY }, end: { x: PW - MR, y: cursorY },
      color: cBorder, thickness: 0.5,
    });
    cursorY -= 22;
  }

  // ── Build content ────────────────────────────────────────────────────────────
  startPage();

  const recipientById = new Map(input.envelope.recipients.map((r) => [r.id, r]));
  const sortedEvents = [...input.envelope.events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const signedCount = input.envelope.recipients.filter((r) => r.signedAt).length;

  // ── SUMMARY CARD ────────────────────────────────────────────────────────────
  {
    const cardH = 46;
    page.drawRectangle({
      x: ML, y: cursorY - cardH + 12, width: CW, height: cardH,
      color: cSurface, borderColor: cBorder, borderWidth: 0.6,
    });

    const cells: Array<[string, string, ReturnType<typeof rgb>]> = [
      ['STATUS', status.replace(/_/g, ' '), statusColor],
      [
        'COMPLETED (SGT)',
        input.envelope.completedAt ? formatPdfDateCompact(input.envelope.completedAt) : 'Pending',
        input.envelope.completedAt ? cText : cTextMuted,
      ],
      ['RECIPIENTS SIGNED', `${signedCount} of ${input.envelope.recipients.length}`, cText],
      ['AUDIT EVENTS', String(sortedEvents.length), cText],
    ];

    const cellW = CW / cells.length;
    cells.forEach(([label, value, color], index) => {
      const x = ML + index * cellW + 12;
      if (index > 0) {
        page.drawLine({
          start: { x: ML + index * cellW, y: cursorY - cardH + 20 },
          end: { x: ML + index * cellW, y: cursorY + 4 },
          color: cBorder, thickness: 0.5,
        });
      }
      page.drawText(label, { x, y: cursorY - 3, size: 6.2, font: headingFont, color: cTextMuted });
      page.drawText(truncate(value, headingFont, 9, cellW - 20), {
        x, y: cursorY - 18, size: 9, font: headingFont, color,
      });
    });

    cursorY -= cardH + 22;
  }

  // ── RECIPIENT EVIDENCE ──────────────────────────────────────────────────────
  sectionTitle('Recipient Evidence');

  input.envelope.recipients.forEach((rec, ri) => {
    const [rMain, rBg] = RECIPIENT_PALETTES[ri % RECIPIENT_PALETTES.length];

    type EvidenceRow = {
      label: string;
      value: string;
      evidence?: string | null;
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
        evidence: rec.consentedAt
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
        evidence: rec.signedAt
          ? buildEvidenceSubLine(rec.signedIp, rec.signedUserAgent)
          : null,
        filled: Boolean(rec.signedAt),
        dotColor: rec.signedAt ? rMain : rec.status === 'DECLINED' ? cError : cTextMuted,
        valueColor: rec.signedAt ? rMain : rec.status === 'DECLINED' ? cError : cTextMuted,
      },
    ];

    const rowH = 20;
    const headerH = 24;
    const contentGap = 7;
    const bottomPadding = 10;
    const accentW = 3.5;
    const cardH = headerH + contentGap + evidenceRows.length * rowH + bottomPadding;
    ensureSpace(cardH + 16);

    const cardTop = cursorY + 11;
    const cardBottom = cardTop - cardH;
    const headerY = cardTop - headerH;
    const cardRight = PW - MR;

    // Card shell + recipient accent bar. Custom border lines start after the accent
    // bar so the border never cuts through the coloured recipient marker.
    page.drawRectangle({ x: ML, y: cardBottom, width: CW, height: cardH, color: cWhite });
    page.drawRectangle({ x: ML, y: cardBottom, width: accentW, height: cardH, color: rMain });
    page.drawRectangle({ x: ML + accentW, y: headerY, width: CW - accentW, height: headerH, color: rBg });
    page.drawLine({
      start: { x: ML + accentW, y: cardTop }, end: { x: cardRight, y: cardTop },
      color: cBorder, thickness: 0.6,
    });
    page.drawLine({
      start: { x: cardRight, y: cardTop }, end: { x: cardRight, y: cardBottom },
      color: cBorder, thickness: 0.6,
    });
    page.drawLine({
      start: { x: ML + accentW, y: cardBottom }, end: { x: cardRight, y: cardBottom },
      color: cBorder, thickness: 0.6,
    });
    page.drawLine({
      start: { x: ML + accentW, y: headerY }, end: { x: cardRight, y: headerY },
      color: cBorder, thickness: 0.45,
    });

    // Header: name + email (left), signing order (right), vertically centered.
    const nameText = truncate(rec.name, headingFont, 9.5, CW * 0.45);
    const nameY = centeredTextY(headerY, headerH, headingFont, 9.5);
    page.drawText(nameText, { x: ML + 14, y: nameY, size: 9.5, font: headingFont, color: rMain });
    const emailX = ML + 14 + widthOf(nameText, headingFont, 9.5) + 8;
    page.drawText(truncate(rec.email || 'Manual link only', bodyFont, 8.5, PW - MR - emailX - 70), {
      x: emailX,
      y: centeredTextY(headerY, headerH, bodyFont, 8.5),
      size: 8.5,
      font: bodyFont,
      color: cTextSec,
    });
    drawRight(
      page,
      `#${ri + 1}`,
      PW - MR - 10,
      centeredTextY(headerY, headerH, headingFont, 8),
      8,
      headingFont,
      cTextMuted,
    );

    const valueX = ML + 26 + 62;
    const evidenceRight = PW - MR - 14;
    let rowTop = headerY - contentGap;

    evidenceRows.forEach((row) => {
      const rowY = rowTop - rowH;
      const rowCenterY = rowY + rowH / 2;

      // Each evidence trail gets a subtle background row with a small vertical
      // gutter so adjacent records remain visually distinct.
      page.drawRectangle({
        x: ML + 10,
        y: rowY + 1,
        width: CW - 20,
        height: rowH - 2,
        color: cSurface,
      });

      if (row.filled) {
        page.drawCircle({ x: ML + 18, y: rowCenterY, size: 2.8, color: row.dotColor });
      } else {
        page.drawCircle({ x: ML + 18, y: rowCenterY, size: 2.8, borderColor: row.dotColor, borderWidth: 0.8 });
      }

      page.drawText(row.label, {
        x: ML + 27,
        y: centeredTextY(rowY, rowH, headingFont, 8.5),
        size: 8.5,
        font: headingFont,
        color: cText,
      });

      const evidenceText = row.evidence
        ? truncate(row.evidence, bodyFont, 8.5, 205)
        : '';
      const evidenceWidth = evidenceText ? widthOf(evidenceText, bodyFont, 8.5) : 0;
      const valueMaxWidth = evidenceText
        ? Math.max(70, evidenceRight - evidenceWidth - 14 - valueX)
        : evidenceRight - valueX;

      page.drawText(truncate(row.value, bodyFont, 8.5, valueMaxWidth), {
        x: valueX,
        y: centeredTextY(rowY, rowH, bodyFont, 8.5),
        size: 8.5,
        font: bodyFont,
        color: row.valueColor,
      });

      if (evidenceText) {
        drawRight(
          page,
          evidenceText,
          evidenceRight,
          centeredTextY(rowY, rowH, bodyFont, 8.5),
          8.5,
          bodyFont,
          row.valueColor,
        );
      }

      rowTop = rowY;
    });

    cursorY = cardBottom - 24;
  });

  cursorY -= 2;

  // ── AUDIT TRAIL ─────────────────────────────────────────────────────────────
  sectionTitle('Audit Trail');

  const timelineX = ML + 11;
  let previousIconY: number | null = null;

  sortedEvents.forEach((event, eventIndex) => {
    const recipient = event.recipientId ? recipientById.get(event.recipientId) : null;
    const rIndex = recipient
      ? input.envelope.recipients.findIndex((r) => r.id === recipient.id)
      : -1;

    const isNegative = ['DECLINED', 'VOIDED', 'EXPIRED', 'PDF_GENERATION_FAILED'].includes(event.action);
    const isCompletion = event.action === 'COMPLETED';
    const rMain = rIndex >= 0 ? RECIPIENT_PALETTES[rIndex % RECIPIENT_PALETTES.length][0] : null;
    const iconColor =
      isNegative ? cError
      : isCompletion ? cSuccess
      : rMain ?? cBrand;

    // IP + device sub-line for CONSENTED and SIGNED
    let evidenceLine: string | null = null;
    if (recipient) {
      if (event.action === 'CONSENTED') {
        evidenceLine = buildEvidenceSubLine(recipient.consentIp, recipient.consentUserAgent);
      } else if (event.action === 'SIGNED') {
        evidenceLine = buildEvidenceSubLine(recipient.signedIp, recipient.signedUserAgent);
      }
    }

    const rowH = evidenceLine ? 28 : 18;
    const beforePageCount = pages.length;
    ensureSpace(rowH);
    if (pages.length !== beforePageCount) previousIconY = null;

    const rowTop = cursorY + 10;
    if (eventIndex % 2 === 1) {
      page.drawRectangle({ x: ML, y: rowTop - rowH, width: CW, height: rowH, color: cSurface });
    }

    const iconY = cursorY + 3;
    if (previousIconY !== null) {
      page.drawLine({
        start: { x: timelineX, y: previousIconY - 6 },
        end: { x: timelineX, y: iconY + 6 },
        color: cBorder, thickness: 0.9,
      });
    }
    drawEventIcon(page, timelineX, iconY, event.action, iconColor);
    previousIconY = iconY;

    // Label with the recipient name highlighted in their palette colour
    const fullLabel = safe(buildEsigningEventLabel({
      action: event.action,
      recipientName: recipient?.name ?? null,
    }));
    const labelX = timelineX + 14;
    const tsText = formatPdfDate(event.createdAt);
    const tsW = widthOf(tsText, bodyFont, 7.5);
    const labelMaxW = PW - MR - labelX - tsW - 16;
    const safeName = safe(recipient?.name ?? '');
    const nameIdx = safeName ? fullLabel.lastIndexOf(safeName) : -1;

    if (safeName && rMain && nameIdx > 0) {
      const before = fullLabel.slice(0, nameIdx);
      const after = fullLabel.slice(nameIdx + safeName.length);
      const beforeW = widthOf(before, bodyFont, 8.5);
      const nameW = widthOf(safeName, headingFont, 8.5);
      page.drawText(before, { x: labelX, y: cursorY, size: 8.5, font: bodyFont, color: cText });
      page.drawText(truncate(safeName, headingFont, 8.5, Math.max(20, labelMaxW - beforeW)), {
        x: labelX + beforeW, y: cursorY, size: 8.5, font: headingFont, color: rMain,
      });
      if (after) {
        page.drawText(truncate(after, bodyFont, 8.5, Math.max(0, labelMaxW - beforeW - nameW)), {
          x: labelX + beforeW + nameW, y: cursorY, size: 8.5, font: bodyFont, color: cText,
        });
      }
    } else {
      page.drawText(truncate(fullLabel, bodyFont, 8.5, labelMaxW), {
        x: labelX, y: cursorY, size: 8.5, font: bodyFont, color: cText,
      });
    }

    drawRight(page, tsText, PW - MR - 6, cursorY, 7.5, bodyFont, cTextMuted);
    cursorY -= 13;

    if (evidenceLine) {
      page.drawText(truncate(evidenceLine, bodyFont, 7.5, labelMaxW), {
        x: labelX, y: cursorY, size: 7.5, font: bodyFont, color: cTextMuted,
      });
      cursorY -= 11;
    }

    cursorY -= 5;
  });

  cursorY -= 4;

  // ── VERIFICATION NOTICE ─────────────────────────────────────────────────────
  {
    const notice =
      'This certificate is generated automatically as the tamper-evident audit record of the signing '
      + 'process. All timestamps are displayed in Singapore Standard Time (SGT, UTC+8).';
    const lines = wrap(notice, bodyFont, 7.5, CW - 24);
    const cardH = 26 + lines.length * 10 + 20;
    ensureSpace(cardH + 6);

    const cardTop = cursorY + 11;
    const headerH = 22;
    const headerY = cardTop - headerH;
    page.drawRectangle({ x: ML, y: cardTop - cardH, width: CW, height: cardH, color: cSurface });
    page.drawRectangle({ x: ML, y: cardTop - cardH, width: 3, height: cardH, color: cBrand });

    page.drawText('VERIFICATION', {
      x: ML + 12,
      y: centeredTextY(headerY, headerH, headingFont, 7),
      size: 7,
      font: headingFont,
      color: cBrand,
    });
    cursorY = headerY - 4;
    lines.forEach((line, index) => {
      page.drawText(line, { x: ML + 12, y: cursorY - index * 10, size: 7.5, font: bodyFont, color: cTextSec });
    });
    cursorY -= lines.length * 10 + 3;
    page.drawText(truncate(verificationUrl, bodyFont, 7.5, CW - 24), {
      x: ML + 12, y: cursorY, size: 7.5, font: bodyFont, color: cBrand,
    });

    cursorY = cardTop - cardH - 16;
  }

  // ── FOOTERS (needs the final page count) ────────────────────────────────────
  pages.forEach((p, index) => {
    p.drawLine({
      start: { x: ML, y: 50 }, end: { x: PW - MR, y: 50 },
      color: cBorder, thickness: 0.5,
    });
    p.drawText(truncate(`Verify at ${verificationUrl}`, bodyFont, 7, CW - 90), {
      x: ML, y: 37, size: 7, font: bodyFont, color: cTextMuted,
    });
    drawRight(p, `Page ${index + 1} of ${pages.length}`, PW - MR, 37, 7, bodyFont, cTextMuted);
  });

  certificatePdf.setTitle(safe(`Certificate of Completion - ${input.envelope.title}`));
  certificatePdf.setSubject(safe(`Signing audit record for certificate ${certificateId}`));
  // Producer is always stamped by pdf-lib itself, so only creator is set here.
  certificatePdf.setCreator('OakCloud e-Sign');
  certificatePdf.setCreationDate(input.envelope.completedAt ?? new Date());
  certificatePdf.setModificationDate(input.envelope.completedAt ?? new Date());
  if (input.envelope.company?.name) {
    certificatePdf.setAuthor(safe(input.envelope.company.name));
  }

  return Buffer.from(await certificatePdf.save());
}

export async function buildEmailAttachments(input: {
  documents: Array<{
    fileName: string;
    originalFileName?: string | null;
    signedBuffer: Buffer;
    certificateBuffer?: Buffer;
  }>;
}): Promise<Array<{
  filename: string;
  content: Buffer;
  contentType: string;
}>> {
  const sourceBytes = input.documents.reduce(
    (sum, document) =>
      sum + document.signedBuffer.byteLength + (document.certificateBuffer?.byteLength ?? 0),
    0,
  );

  // Avoid loading and merging a package that is already over the provider
  // attachment limit. The links in the completion email remain available.
  if (sourceBytes > MAX_EMAIL_ATTACHMENT_BYTES) {
    return [];
  }

  const attachments = await Promise.all(
    input.documents.map(async (document) => ({
      filename: getEsigningDocumentVariantFileName(document, 'signed'),
      content: document.certificateBuffer
        ? await mergePdfBuffers([document.signedBuffer, document.certificateBuffer])
        : document.signedBuffer,
      contentType: 'application/pdf',
    })),
  );
  const totalBytes = attachments.reduce((sum, attachment) => sum + attachment.content.byteLength, 0);
  if (totalBytes > MAX_EMAIL_ATTACHMENT_BYTES) {
    return [];
  }

  return attachments;
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

export async function mergePdfBuffers(buffers: Uint8Array[]): Promise<Buffer> {
  const mergedPdf = await PDFDocument.create();

  for (const buffer of buffers) {
    // pdf-lib's Node 24 path can misread a Buffer's inherited properties as
    // load options. Normalize storage and attachment buffers to a plain view
    // before parsing so worker downloads and browser fixtures behave alike.
    const sourcePdf = await PDFDocument.load(new Uint8Array(buffer));
    const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  return Buffer.from(await mergedPdf.save());
}

export async function buildDeliveryDocumentLinks(input: {
  envelopeId: string;
  actorType: 'recipient' | 'sender';
  recipientId?: string;
  documents: Array<{
    id: string;
    fileName: string;
    originalFileName?: string | null;
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
    label: getEsigningDocumentOriginalFileName(document),
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

async function generateEnvelopeArtifacts(
  envelopeId: string
): Promise<void> {
  const envelope = await loadEnvelopeForPdf(envelopeId);

  if (envelope.status !== 'COMPLETED') {
    throw new Error('Only completed envelopes can generate signed PDFs');
  }

  const fieldValuesByDefinitionId = new Map(
    envelope.fieldValues.map((value) => [value.fieldDefinitionId, value])
  );
  const generatedDocuments: Array<{
    id: string;
    fileName: string;
    originalFileName?: string | null;
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
      originalFileName: document.originalFileName,
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
    await generateEnvelopeArtifacts(envelope.id);
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
    await markFilingJobsForTerminalSourceFailure(tx, envelopeId, 'SOURCE_GENERATION_FAILED', envelope.tenantId);
  });

  const senderName =
    [envelope.createdBy.firstName, envelope.createdBy.lastName].filter(Boolean).join(' ').trim() ||
    envelope.createdBy.email;

  const deliveryResult = await sendEsigningPdfFailureEmailToSender({
    to: envelope.createdBy.email,
    senderName,
    envelopeTitle: envelope.title,
    errorMessage: message,
  });
  await recordEsigningEnvelopeEmailDeliveryResults(envelopeId, [
    withEsigningDeliveryTarget(deliveryResult, {
      tenantId: envelope.tenantId,
      targetKey: `sender:${envelope.createdById}`,
      audience: 'SENDER',
    }),
  ]);
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
  const fileName = getEsigningDocumentVariantFileName(
    document,
    variant === 'certificate' ? 'certificate' : 'signed',
  );

  return { buffer, fileName };
}
