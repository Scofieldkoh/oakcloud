import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    vendorAlias: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    contact: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { prisma } from '@/lib/prisma';
import { resolveVendor, getOrCreateVendorContact, learnVendorAlias } from '@/services/vendor-resolution.service';

describe('Vendor Resolution Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves via alias match (normalized)', async () => {
    vi.mocked(prisma.vendorAlias.findMany).mockResolvedValue([
      {
        rawName: 'Accounting and Corporate Authority (ACCA)',
        normalizedContactId: 'c1',
        confidence: 1.0,
        companyId: 'co1',
      },
    ] as never);
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      id: 'c1',
      corporateName: 'Accounting and Corporate Authority (ACCA)',
      fullName: 'Accounting and Corporate Authority (ACCA)',
    } as never);

    const result = await resolveVendor({
      tenantId: 't1',
      companyId: 'co1',
      rawVendorName: 'Accounting and Corporate Authority',
      createdById: 'u1',
    });

    expect(result.strategy).toBe('ALIAS');
    expect(result.vendorId).toBe('c1');
    expect(result.vendorName).toBe('Accounting and Corporate Authority (ACCA)');
    expect(result.confidence).toBeGreaterThanOrEqual(0.93);
  });

  it('does not merge distinct entities with extra tokens', async () => {
    vi.mocked(prisma.vendorAlias.findMany).mockResolvedValue([
      { rawName: 'Nobody Business Pte Ltd', normalizedContactId: 'c1', confidence: 1.0, companyId: 'co1' },
    ] as never);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([] as never);

    const result = await resolveVendor({
      tenantId: 't1',
      companyId: 'co1',
      rawVendorName: 'Nobody Pte Ltd',
    });

    expect(result.strategy).toBe('NONE');
    expect(result.vendorId).toBeUndefined();
    expect(result.vendorName).toBe('Nobody Pte Ltd');
  });

  it('falls back to contact matching when no aliases exist', async () => {
    vi.mocked(prisma.vendorAlias.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([
      { id: 'c1', corporateName: 'ACME PTE LTD', fullName: 'ACME PTE LTD' },
      { id: 'c2', corporateName: 'Different Vendor', fullName: 'Different Vendor' },
    ] as never);

    const result = await resolveVendor({
      tenantId: 't1',
      companyId: 'co1',
      rawVendorName: 'Acme',
    });

    expect(result.strategy).toBe('CONTACT');
    expect(result.vendorId).toBe('c1');
    expect(result.vendorName).toBe('ACME PTE LTD');
  });

  it('creates a vendor contact when no match found and learns alias', async () => {
    vi.mocked(prisma.vendorAlias.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.contact.create).mockResolvedValue({
      id: 'new-contact',
      corporateName: 'New Vendor',
      fullName: 'New Vendor',
    } as never);
    vi.mocked(prisma.vendorAlias.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.vendorAlias.create).mockResolvedValue({ id: 'va1' } as never);

    const result = await getOrCreateVendorContact({
      tenantId: 't1',
      companyId: 'co1',
      rawVendorName: 'New Vendor',
      createdById: 'u1',
    });

    expect(result.strategy).toBe('CREATED');
    expect(result.vendorId).toBe('new-contact');
    expect(prisma.vendorAlias.create).toHaveBeenCalled();
  });

  it('upserts vendor alias (update path)', async () => {
    vi.mocked(prisma.vendorAlias.findFirst).mockResolvedValue({ id: 'va1' } as never);
    vi.mocked(prisma.vendorAlias.update).mockResolvedValue({ id: 'va1' } as never);

    await learnVendorAlias({
      tenantId: 't1',
      companyId: 'co1',
      rawName: 'ACME',
      vendorId: 'c1',
      confidence: 0.99,
      createdById: 'u1',
    });

    expect(prisma.vendorAlias.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'va1' } })
    );
  });

  it('resolves tenant-wide alias when company-specific alias is not present', async () => {
    vi.mocked(prisma.vendorAlias.findMany).mockResolvedValue([
      { rawName: 'ACCA', normalizedContactId: 'c1', confidence: 1.0, companyId: null },
    ] as never);
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      id: 'c1',
      corporateName: 'Accounting and Corporate Regulatory Authority',
      fullName: 'Accounting and Corporate Regulatory Authority',
    } as never);

    const result = await resolveVendor({
      tenantId: 't1',
      companyId: 'co1',
      rawVendorName: 'ACCA',
    });

    expect(result.strategy).toBe('ALIAS');
    expect(result.vendorId).toBe('c1');
    expect(result.vendorName).toBe('Accounting and Corporate Regulatory Authority');
  });
});
