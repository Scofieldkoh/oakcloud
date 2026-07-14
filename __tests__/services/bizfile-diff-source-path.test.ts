import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
vi.mock('@/lib/prisma', () => ({ prisma: { company: { findFirst } } }));

describe('BizFile diff source paths', () => {
  beforeEach(() => {
    findFirst.mockResolvedValue({
      id: 'company-1', name: 'Example', formerName: null,
      entityType: 'PRIVATE_LIMITED', status: 'LIVE', statusDate: null, incorporationDate: null,
      primarySsicCode: null, primarySsicDescription: null,
      secondarySsicCode: null, secondarySsicDescription: null,
      lastAgmDate: null, lastArFiledDate: null, accountsDueDate: null,
      financialYearEndDay: null, financialYearEndMonth: null,
      paidUpCapitalAmount: null, issuedCapitalAmount: null,
      addresses: [], officers: [], shareholders: [],
    });
  });

  it('preserves distinct source paths for duplicate officer and shareholder rows', async () => {
    const { generateBizFileDiff } = await import('@/services/bizfile/diff');
    const result = await generateBizFileDiff('company-1', {
      entityDetails: { uen: '1', name: 'Example', entityType: 'PRIVATE_LIMITED', status: 'LIVE' },
      officers: [
        { name: '王小明', role: 'DIRECTOR' },
        { name: '王小明', role: 'DIRECTOR' },
      ],
      shareholders: [
        { name: 'Same Owner', type: 'INDIVIDUAL', shareClass: 'ORDINARY', numberOfShares: 1 },
        { name: 'Same Owner', type: 'INDIVIDUAL', shareClass: 'PREFERENCE', numberOfShares: 2 },
      ],
    }, 'tenant-1');

    expect(result.officerDiffs.map((entry) => entry.sourceRecordId)).toEqual(['officers.0', 'officers.1']);
    expect(result.shareholderDiffs.map((entry) => entry.sourceRecordId)).toEqual(['shareholders.0', 'shareholders.1']);
  });
});
