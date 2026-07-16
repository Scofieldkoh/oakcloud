import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  getDocumentPartyOptions,
  resolveDocumentPartySelections,
} from '@/services/document-party.service';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: { findFirst: vi.fn() },
  },
}));

describe('document party service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns current directors, shareholders, and the company Contacts union', async () => {
    vi.mocked(prisma.company.findFirst).mockResolvedValue({
      id: 'company-1',
      officers: [
        { id: 'officer-1', name: 'Alice', role: 'DIRECTOR', contact: null },
      ],
      shareholders: [
        {
          id: 'shareholder-1',
          name: 'Ben',
          shareClass: 'ORDINARY',
          contact: null,
        },
      ],
      contacts: [
        {
          contact: {
            id: 'contact-1',
            fullName: 'Cara',
            fullAddress: null,
            contactDetails: [],
          },
          relationship: 'Representative',
        },
      ],
    } as never);

    const result = await getDocumentPartyOptions('company-1', 'tenant-1');

    expect(result.directors.map((party) => party.id)).toEqual(['officer-1']);
    expect(result.shareholders.map((party) => party.id)).toEqual([
      'shareholder-1',
    ]);
    expect(result.contacts.map((party) => party.id)).toEqual(['contact-1']);
  });

  it('rejects a director outside the selected company', async () => {
    vi.mocked(prisma.company.findFirst).mockResolvedValue({
      id: 'company-1',
      officers: [],
      shareholders: [],
      contacts: [],
    } as never);

    await expect(
      resolveDocumentPartySelections({
        companyId: 'company-1',
        tenantId: 'tenant-1',
        selectedDirectorId: 'officer-2',
      }),
    ).rejects.toThrow(
      'Selected director is not a current director of this company',
    );
  });
});
