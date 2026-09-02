import { describe, expect, it } from 'vitest';
import { preferredSignedDocumentFileName, signedDocumentFilenameCandidate } from '@/services/esigning-sharepoint-filing/filename';

describe('signed SharePoint filenames', () => {
  it('is deterministic and safe', () => {
    const value = preferredSignedDocumentFileName({ completedAt: '2026-09-01T00:00:00.000Z', companyName: 'Acme / SG', documentTitle: 'Agreement: Final', envelopeIdentifier: 'certificate-123' });
    expect(value).toBe('2026-09-01 - Acme SG - Agreement Final - Signed - certificate1.pdf');
    expect(value).not.toMatch(/["*:<>?|\\/]/);
  });
  it('uses controlled numbered suffixes', () => expect(signedDocumentFilenameCandidate('document.pdf', 2)).toBe('document (2).pdf'));
});
