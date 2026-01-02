import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customerAlias: {
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
import { resolveCustomer, getOrCreateCustomerContact, learnCustomerAlias } from '@/services/customer-resolution.service';

describe('Customer Resolution Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves via alias match (normalized)', async () => {
    vi.mocked(prisma.customerAlias.findMany).mockResolvedValue([
      { rawName: 'Accounting and Corporate Authority (ACCA)', normalizedContactId: 'c1', confidence: 1.0 },
    ] as never);
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      id: 'c1',
      corporateName: 'Accounting and Corporate Authority (ACCA)',
      fullName: 'Accounting and Corporate Authority (ACCA)',
    } as never);

    const result = await resolveCustomer({
      tenantId: 't1',
      companyId: 'co1',
      rawCustomerName: 'Accounting and Corporate Authority',
      createdById: 'u1',
    });

    expect(result.strategy).toBe('ALIAS');
    expect(result.customerId).toBe('c1');
    expect(result.customerName).toBe('Accounting and Corporate Authority (ACCA)');
    expect(result.confidence).toBeGreaterThanOrEqual(0.93);
  });

  it('does not merge distinct entities with extra tokens', async () => {
    vi.mocked(prisma.customerAlias.findMany).mockResolvedValue([
      { rawName: 'Nobody Business Pte Ltd', normalizedContactId: 'c1', confidence: 1.0 },
    ] as never);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([] as never);

    const result = await resolveCustomer({
      tenantId: 't1',
      companyId: 'co1',
      rawCustomerName: 'Nobody Pte Ltd',
    });

    expect(result.strategy).toBe('NONE');
    expect(result.customerId).toBeUndefined();
    expect(result.customerName).toBe('Nobody Pte Ltd');
  });

  it('creates a customer contact when no match found and learns alias', async () => {
    vi.mocked(prisma.customerAlias.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.contact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.contact.create).mockResolvedValue({
      id: 'new-contact',
      corporateName: 'New Customer',
      fullName: 'New Customer',
    } as never);
    vi.mocked(prisma.customerAlias.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.customerAlias.create).mockResolvedValue({ id: 'ca1' } as never);

    const result = await getOrCreateCustomerContact({
      tenantId: 't1',
      companyId: 'co1',
      rawCustomerName: 'New Customer',
      createdById: 'u1',
    });

    expect(result.strategy).toBe('CREATED');
    expect(result.customerId).toBe('new-contact');
    expect(prisma.customerAlias.create).toHaveBeenCalled();
  });

  it('upserts customer alias (update path)', async () => {
    vi.mocked(prisma.customerAlias.findFirst).mockResolvedValue({ id: 'ca1' } as never);
    vi.mocked(prisma.customerAlias.update).mockResolvedValue({ id: 'ca1' } as never);

    await learnCustomerAlias({
      tenantId: 't1',
      companyId: 'co1',
      rawName: 'ACME',
      customerId: 'c1',
      confidence: 0.99,
      createdById: 'u1',
    });

    expect(prisma.customerAlias.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ca1' } })
    );
  });
});
