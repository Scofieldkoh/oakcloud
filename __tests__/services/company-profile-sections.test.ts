import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
const company = {
  id: 'company-1', tenantId: 'tenant-1', uen: '202400001A', name: 'Example Pte. Ltd.',
  formerName: null, dateOfNameChange: null, entityType: 'PRIVATE_LIMITED', status: 'LIVE',
  statusDate: null, incorporationDate: new Date('2020-01-01'), registrationDate: new Date('2020-01-02'),
  primarySsicCode: null, primarySsicDescription: null, secondarySsicCode: null, secondarySsicDescription: null,
  financialYearEndDay: 31, financialYearEndMonth: 12, fyeAsAtLastAr: null, homeCurrency: 'SGD',
  lastAgmDate: null, lastArFiledDate: null, accountsDueDate: null,
  paidUpCapitalCurrency: 'SGD', paidUpCapitalAmount: 1000,
  issuedCapitalCurrency: 'SGD', issuedCapitalAmount: 1000,
  addresses: [], formerNames: [], officers: [], shareholders: [], shareCapital: [], charges: [], auditor: null,
};
const tx = {
  company: { findFirst: vi.fn(), update: vi.fn() },
  companyAddress: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction, company: tx.company } }));

describe('company profile section services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.company.findFirst.mockResolvedValue(company);
    tx.companyAddress.findFirst.mockResolvedValue(null);
    mocks.transaction.mockImplementation((callback) => callback(tx));
  });

  it('rejects a stale section version before writing', async () => {
    const { saveCompanyProfileSection } = await import('@/services/company/profile-sections');
    await expect(saveCompanyProfileSection({
      companyId: 'company-1', tenantId: 'tenant-1', userId: 'user-1',
      section: 'addresses', ifMatchVersion: 'stale',
      data: { registered: null, mailing: null },
    })).rejects.toMatchObject({ code: 'COMPANY_PROFILE_CONFLICT' });
    expect(tx.companyAddress.create).not.toHaveBeenCalled();
  });

  it('saves only the requested address section and audits it', async () => {
    const { getCompanyProfileSection, saveCompanyProfileSection } = await import('@/services/company/profile-sections');
    const current = await getCompanyProfileSection('company-1', 'tenant-1', 'addresses');
    tx.company.findFirst
      .mockResolvedValueOnce(company)
      .mockResolvedValueOnce({ ...company, addresses: [{
        id: 'address-1', addressType: 'REGISTERED_OFFICE', streetName: 'Oak Street',
        postalCode: '123456', country: 'Singapore', fullAddress: 'Oak Street, Singapore 123456',
        block: null, level: null, unit: null, buildingName: null, effectiveFrom: null, isCurrent: true,
      }] });

    const saved = await saveCompanyProfileSection({
      companyId: 'company-1', tenantId: 'tenant-1', userId: 'user-1',
      section: 'addresses', ifMatchVersion: current.version,
      data: { registered: { streetName: 'Oak Street', postalCode: '123456', country: 'Singapore' }, mailing: null },
    });

    expect(tx.companyAddress.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ addressType: 'REGISTERED_OFFICE' }) }));
    expect(tx.company.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entityId: 'company-1:addresses' }) }));
    expect(saved.section).toBe('addresses');
    expect(saved.version).not.toBe(current.version);
  });
});
