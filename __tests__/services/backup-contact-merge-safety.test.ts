import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  workspaceUpdate: vi.fn(),
  workspaceFind: vi.fn(),
  mergeFind: vi.fn(),
  transaction: vi.fn(),
  barrier: vi.fn(),
  databaseClock: vi.fn(),
  audit: vi.fn(),
}));

const backupTx = {
  $executeRaw: mocks.barrier,
  $queryRaw: mocks.databaseClock,
};

vi.mock('@/lib/storage', () => ({
  storage: { upload: mocks.upload },
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspaceBackup: { update: mocks.workspaceUpdate },
    workspace: { findUnique: mocks.workspaceFind },
    contactMergeOperation: { findFirst: mocks.mergeFind },
    $transaction: mocks.transaction,
    $queryRaw: mocks.databaseClock,
  },
}));
vi.mock('@/lib/audit', () => ({ createAuditLog: mocks.audit }));
vi.mock('@/lib/encryption', () => ({ hashBlake3: () => 'checksum' }));

import { BackupService, type BackupManifest } from '@/services/backup.service';

function manifest(overrides: Partial<BackupManifest> = {}): BackupManifest {
  return {
    version: '1.2',
    backupId: 'backup-1',
    tenantId: 'tenant-1',
    tenantName: 'Tenant',
    tenantSlug: 'tenant',
    createdAt: '2026-07-14T10:05:00.000Z',
    snapshotCutoff: '2026-07-14T10:00:00.000Z',
    createdById: 'user-1',
    schemaVersion: '1.0.0',
    stats: {},
    compression: { algorithm: 'gzip', level: 6, uncompressedSize: 2, compressedSize: 2, ratio: 1 },
    files: [],
    checksums: { dataJson: 'checksum' },
    ...overrides,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('contact merge backup restore safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T10:10:00.000Z'));
    vi.clearAllMocks();
    mocks.workspaceUpdate.mockResolvedValue({});
    mocks.workspaceFind.mockResolvedValue(null);
    mocks.mergeFind.mockResolvedValue(null);
    mocks.upload.mockResolvedValue({});
    mocks.barrier.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (callback: (client: typeof backupTx) => unknown) => callback(backupTx));
    mocks.databaseClock.mockResolvedValue([{ cutoff: new Date('2026-07-14T10:00:00.000Z') }]);
  });

  afterEach(() => vi.useRealTimers());

  it('captures the snapshot cutoff before database export even when manifest creation is later', async () => {
    const service = new BackupService();
    const internals = service as unknown as {
      updateBackupProgress: ReturnType<typeof vi.fn>;
      exportTenantData: ReturnType<typeof vi.fn>;
      copyTenantFiles: ReturnType<typeof vi.fn>;
      markBackupFailed: ReturnType<typeof vi.fn>;
      executeBackup(...args: unknown[]): Promise<void>;
    };
    internals.updateBackupProgress = vi.fn().mockResolvedValue(undefined);
    internals.exportTenantData = vi.fn().mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-07-14T10:15:00.000Z'));
      return { data: {}, stats: {} };
    });
    internals.copyTenantFiles = vi.fn().mockResolvedValue([]);
    internals.markBackupFailed = vi.fn().mockResolvedValue(undefined);

    await internals.executeBackup('backup-1', 'tenant-1', 'Tenant', 'tenant', 'user-1', {});

    const manifestUpload = mocks.upload.mock.calls.find(([key]) => String(key).includes('manifest'));
    const written = JSON.parse((manifestUpload?.[1] as Buffer).toString('utf8')) as BackupManifest;
    expect(written).toMatchObject({
      version: '1.2',
      snapshotCutoff: '2026-07-14T10:00:00.000Z',
      createdAt: '2026-07-14T10:15:00.000Z',
    });
    const barrier = mocks.barrier.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(barrier.sql).toMatch(/pg_advisory_xact_lock/);
    expect(barrier.values).toEqual(['contact-merge-backup:tenant-1']);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ timeout: 300_000 }));
    expect(internals.exportTenantData).toHaveBeenCalledWith('tenant-1', {}, backupTx);
    expect(mocks.barrier.mock.invocationCallOrder[0]).toBeLessThan(mocks.databaseClock.mock.invocationCallOrder[0]);
    expect(mocks.databaseClock.mock.invocationCallOrder[0]).toBeLessThan(internals.exportTenantData.mock.invocationCallOrder[0]);
  });

  it('rejects a merge interleaved after cutoff but before the later manifest timestamp', async () => {
    const service = new BackupService();
    vi.spyOn(service, 'getBackupDetails').mockResolvedValue({ status: 'COMPLETED', tenantId: 'tenant-1' } as never);
    vi.spyOn(service, 'validateBackupIntegrity').mockResolvedValue(manifest());
    mocks.mergeFind.mockResolvedValue({ id: 'merge-interleaved', approvedAt: new Date('2026-07-14T10:01:00.000Z') });

    await expect(service.restoreWorkspaceBackup('backup-1', 'user-1', { dryRun: true }))
      .rejects.toThrow(/predates contact merge merge-interleaved/i);
    expect(mocks.mergeFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', approvedAt: { gte: new Date('2026-07-14T10:00:00.000Z') } },
    }));
  });

  it('holds the export barrier until the snapshot finishes and makes a pre-cutoff-started merge restore-unsafe', async () => {
    let barrierHeld = false;
    const barrierWaiters: Array<() => void> = [];
    const transactionClients: typeof backupTx[] = [];
    mocks.databaseClock
      .mockResolvedValueOnce([{ cutoff: new Date('2026-07-14T10:00:00.000Z') }])
      .mockResolvedValueOnce([{ cutoff: new Date('2026-07-14T10:01:00.000Z') }]);
    mocks.transaction.mockImplementation(async (callback: (client: typeof backupTx) => unknown) => {
      const client = {
        $executeRaw: vi.fn(async () => {
          if (barrierHeld) await new Promise<void>((resolve) => barrierWaiters.push(resolve));
          barrierHeld = true;
          return 0;
        }),
        $queryRaw: mocks.databaseClock,
      };
      transactionClients.push(client);
      try {
        return await callback(client);
      } finally {
        barrierHeld = false;
        barrierWaiters.shift()?.();
      }
    });

    const exportStarted = deferred();
    const finishExport = deferred();
    const service = new BackupService();
    const internals = service as unknown as {
      updateBackupProgress: ReturnType<typeof vi.fn>;
      exportTenantData: ReturnType<typeof vi.fn>;
      copyTenantFiles: ReturnType<typeof vi.fn>;
      markBackupFailed: ReturnType<typeof vi.fn>;
      executeBackup(...args: unknown[]): Promise<void>;
    };
    internals.updateBackupProgress = vi.fn().mockResolvedValue(undefined);
    internals.exportTenantData = vi.fn(async () => {
      exportStarted.resolve();
      await finishExport.promise;
      return { data: { contacts: [{ id: 'source-1' }] }, stats: { contacts: 1 } };
    });
    internals.copyTenantFiles = vi.fn().mockResolvedValue([]);
    internals.markBackupFailed = vi.fn().mockResolvedValue(undefined);

    const backupPromise = internals.executeBackup('backup-1', 'tenant-1', 'Tenant', 'tenant', 'user-1', {});
    await exportStarted.promise;

    const mergeTransactionStartedAt = new Date('2026-07-14T09:59:59.000Z');
    let mergePassedBarrier = false;
    let mergeApprovedAt: Date | undefined;
    const mergePromise = mocks.transaction(async (client: typeof backupTx) => {
      await client.$executeRaw({ sql: 'SELECT pg_advisory_xact_lock(...)', values: ['contact-merge-backup:tenant-1'] });
      mergePassedBarrier = true;
      const [clock] = await client.$queryRaw({ sql: 'SELECT clock_timestamp() AS cutoff' });
      mergeApprovedAt = clock.cutoff;
    });
    await Promise.resolve();
    expect(mergeTransactionStartedAt.getTime()).toBeLessThan(new Date('2026-07-14T10:00:00.000Z').getTime());
    const mergeWasBlockedDuringExport = !mergePassedBarrier;

    finishExport.resolve();
    await backupPromise;
    await mergePromise;
    expect(mergeWasBlockedDuringExport).toBe(true);
    expect(mergePassedBarrier).toBe(true);
    expect(mergeApprovedAt).toEqual(new Date('2026-07-14T10:01:00.000Z'));
    expect(transactionClients[0].$executeRaw.mock.calls[0][0].values)
      .toEqual(transactionClients[1].$executeRaw.mock.calls[0][0].values);

    vi.spyOn(service, 'getBackupDetails').mockResolvedValue({ status: 'COMPLETED', tenantId: 'tenant-1' } as never);
    vi.spyOn(service, 'validateBackupIntegrity').mockResolvedValue(manifest());
    mocks.mergeFind.mockResolvedValue({ id: 'merge-after-export', approvedAt: mergeApprovedAt });
    await expect(service.restoreWorkspaceBackup('backup-1', 'user-1', { dryRun: true }))
      .rejects.toThrow(/predates contact merge merge-after-export/i);
  });

  it('fails legacy manifests safely whenever an immutable merge ledger exists', async () => {
    const service = new BackupService();
    vi.spyOn(service, 'getBackupDetails').mockResolvedValue({ status: 'COMPLETED', tenantId: 'tenant-1' } as never);
    vi.spyOn(service, 'validateBackupIntegrity').mockResolvedValue(manifest({ version: '1.1', snapshotCutoff: undefined }));
    mocks.mergeFind.mockResolvedValue({ id: 'merge-existing', approvedAt: new Date('2026-07-14T09:00:00.000Z') });

    await expect(service.restoreWorkspaceBackup('backup-1', 'user-1', { dryRun: true }))
      .rejects.toThrow(/legacy backup.*choose a new backup/i);
    expect(mocks.mergeFind).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
  });
});
