import { describe, expect, it } from 'vitest';
import {
  getCertificateDocumentTypeLabel,
  getLatestCertificateRecipientActivity,
} from '@/services/esigning-certificate-pdf.renderer';

describe('e-signing certificate renderer helpers', () => {
  it('uses the latest matching recipient activity when an event occurs more than once', () => {
    const earlier = new Date('2026-09-18T01:00:00.000Z');
    const later = new Date('2026-09-18T02:00:00.000Z');
    const latest = getLatestCertificateRecipientActivity(
      [
        { action: 'VIEWED', recipientId: 'recipient-1', createdAt: earlier, metadata: { ipAddress: '1.1.1.1' } },
        { action: 'VIEWED', recipientId: 'recipient-2', createdAt: new Date('2026-09-18T03:00:00.000Z') },
        { action: 'VIEWED', recipientId: 'recipient-1', createdAt: later, metadata: { ipAddress: '2.2.2.2' } },
      ],
      'recipient-1',
      'VIEWED',
    );

    expect(latest?.createdAt).toEqual(later);
    expect(latest?.metadata).toEqual({ ipAddress: '2.2.2.2' });
  });

  it('reports the original source document type for the document list', () => {
    expect(getCertificateDocumentTypeLabel({ fileName: 'agreement.pdf', originalFileName: 'agreement.docx' })).toBe('Word');
    expect(getCertificateDocumentTypeLabel({ fileName: 'schedule.pdf', originalFileName: 'schedule.pdf' })).toBe('PDF');
    expect(getCertificateDocumentTypeLabel({ fileName: 'supporting-file.bin' })).toBe('Document');
  });
});
