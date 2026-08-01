import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  workspace: { findUnique: vi.fn() },
  workspaceBackup: { update: vi.fn() },
  contactMergeOperation: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}));
const storageMock = vi.hoisted(() => ({ deletePrefix: vi.fn().mockResolvedValue(0), download: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/storage', () => ({ storage: storageMock }));

import { BackupService } from '@/services/backup.service';

const serviceKeys = ['serviceFamilies','serviceVariants','serviceVariantFeeTemplates','serviceAgreements','serviceAgreementEntities','serviceAgreementItems','serviceAgreementItemEntities','serviceAgreementFeeLines','clientServices','clientServiceFeeLines'];

describe('service agreement backup data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.workspace.findUnique.mockResolvedValue(null);
    prismaMock.contactMergeOperation.findFirst.mockResolvedValue(null);
  });

  it('exports every catalog, agreement, and operational service table', async () => {
    const db = new Proxy({}, { get: (_target, key) => key === 'workspace' ? { findUnique: vi.fn().mockResolvedValue({ id: 'tenant-1' }) } : key === 'workspaceLetterhead' ? { findUnique: vi.fn().mockResolvedValue(null) } : { findMany: vi.fn().mockResolvedValue([{ source: String(key) }]) } });
    const result = await (new BackupService() as unknown as { exportTenantData: (tenantId: string, options: object, db: object) => Promise<{ data: Record<string, unknown> }> }).exportTenantData('tenant-1', {}, db);
    for (const key of serviceKeys) expect(result.data).toHaveProperty(key);
  });

  it('restores parents before children and deletes children before parents', async () => {
    const restoreCalls: string[] = [];
    const deleteCalls: string[] = [];
    const tx = new Proxy({}, { get: (_target, key) => ({
      createMany: vi.fn(async () => { restoreCalls.push(String(key)); }),
      deleteMany: vi.fn(async () => { deleteCalls.push(String(key)); }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(), upsert: vi.fn(),
    }) });
    const data = Object.fromEntries(serviceKeys.map((key) => [key, [{ id: key }]]));
    const backup = new BackupService() as unknown as {
      restoreDatabaseData: (data: Record<string, unknown>, tenantId: string, tx: object) => Promise<void>;
      deleteWorkspaceData: (tenantId: string, tx: object) => Promise<void>;
    };
    await backup.restoreDatabaseData(data, 'tenant-1', tx);
    await backup.deleteWorkspaceData('tenant-1', tx);
    expect(restoreCalls.indexOf('serviceFamily')).toBeLessThan(restoreCalls.indexOf('serviceVariant'));
    expect(restoreCalls.indexOf('serviceAgreement')).toBeLessThan(restoreCalls.indexOf('clientService'));
    expect(restoreCalls.indexOf('clientService')).toBeLessThan(restoreCalls.indexOf('clientServiceFeeLine'));
    expect(deleteCalls.indexOf('clientServiceFeeLine')).toBeLessThan(deleteCalls.indexOf('clientService'));
    expect(deleteCalls.indexOf('clientService')).toBeLessThan(deleteCalls.indexOf('serviceAgreement'));
  });

  it('validates a dry run without mutating backup or tenant data', async () => {
    const backup = new BackupService();
    vi.spyOn(backup, 'getBackupDetails').mockResolvedValue({
      id: 'backup-1', tenantId: 'tenant-1', status: 'COMPLETED',
    } as never);
    vi.spyOn(backup, 'validateBackupIntegrity').mockResolvedValue({
      version: '1.2',
      backupId: 'backup-1',
      tenantId: 'tenant-1',
      tenantName: 'Tenant',
      tenantSlug: 'tenant',
      createdAt: '2026-08-01T00:00:00.000Z',
      createdById: 'user-1',
      schemaVersion: '1',
      stats: { users: 2, companies: 3 },
      files: [],
      checksums: { dataJson: 'checksum' },
    } as never);

    await expect(backup.restoreWorkspaceBackup('backup-1', 'user-1', { dryRun: true }))
      .resolves.toEqual({ success: true, message: 'Dry run successful. Would restore: 2 users, 3 companies, 0 files.' });
    expect(prismaMock.workspaceBackup.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(storageMock.download).not.toHaveBeenCalled();
  });

  it('restores a legacy agreement backup when operational service arrays are absent', async () => {
    const calls: string[] = [];
    const tx = new Proxy({}, { get: (_target, key) => ({
      createMany: vi.fn(async () => { calls.push(String(key)); }),
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      upsert: vi.fn(async () => { calls.push(String(key)); }),
    }) });
    const backup = new BackupService() as unknown as {
      restoreDatabaseData: (data: Record<string, unknown>, tenantId: string, tx: object) => Promise<void>;
    };

    await backup.restoreDatabaseData({
      tenant: { id: 'tenant-1', name: 'Legacy tenant', slug: 'legacy-tenant' },
      serviceAgreements: [{ id: 'agreement-1', tenantId: 'tenant-1' }],
    }, 'tenant-1', tx);

    expect(calls).toContain('serviceAgreement');
    expect(calls).not.toContain('clientService');
    expect(calls).not.toContain('clientServiceFeeLine');
  });
});
