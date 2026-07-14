import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
  deletePrefix: vi.fn(),
  copy: vi.fn(),
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
  contactMergeOperation: { findFirst: mocks.mergeFind },
};

vi.mock('@/lib/storage', () => ({
  storage: {
    upload: mocks.upload,
    download: mocks.download,
    deletePrefix: mocks.deletePrefix,
    copy: mocks.copy,
  },
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
    mocks.mergeFind.mockReset();
    mocks.workspaceUpdate.mockResolvedValue({});
    mocks.workspaceFind.mockResolvedValue(null);
    mocks.mergeFind.mockResolvedValue(null);
    mocks.upload.mockResolvedValue({});
    mocks.download.mockResolvedValue(gzipSync(Buffer.from('{}')));
    mocks.deletePrefix.mockResolvedValue(0);
    mocks.copy.mockResolvedValue(undefined);
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
    expect(mocks.barrier).not.toHaveBeenCalled();
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
        contactMergeOperation: { findFirst: mocks.mergeFind },
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

  it('rechecks merge safety after acquiring the restore barrier and rejects a merge that won the race', async () => {
    const service = new BackupService();
    const internals = service as unknown as {
      deleteWorkspaceData: ReturnType<typeof vi.fn>;
      restoreDatabaseData: ReturnType<typeof vi.fn>;
      restoreFiles: ReturnType<typeof vi.fn>;
    };
    internals.deleteWorkspaceData = vi.fn().mockResolvedValue(undefined);
    internals.restoreDatabaseData = vi.fn().mockResolvedValue(undefined);
    internals.restoreFiles = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(service, 'getBackupDetails').mockResolvedValue({ status: 'COMPLETED', tenantId: 'tenant-1' } as never);
    vi.spyOn(service, 'validateBackupIntegrity').mockResolvedValue(manifest());
    mocks.mergeFind
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'merge-before-restore-lock', approvedAt: new Date('2026-07-14T10:01:00.000Z') });

    await expect(service.restoreWorkspaceBackup('backup-1', 'user-1'))
      .rejects.toThrow(/predates contact merge merge-before-restore-lock/i);

    expect(mocks.mergeFind).toHaveBeenCalledTimes(2);
    expect(mocks.barrier).toHaveBeenCalledTimes(1);
    expect(mocks.barrier.mock.invocationCallOrder[0]).toBeLessThan(mocks.mergeFind.mock.invocationCallOrder[1]);
    expect(internals.restoreDatabaseData).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ timeout: 300_000 }));
  });

  it('blocks a merge behind destructive delete and import using one restore transaction client', async () => {
    let barrierHeld = false;
    const barrierWaiters: Array<() => void> = [];
    const transactionClients: typeof backupTx[] = [];
    mocks.transaction.mockImplementation(async (callback: (client: typeof backupTx) => unknown) => {
      const client = {
        $executeRaw: vi.fn(async () => {
          if (barrierHeld) await new Promise<void>((resolve) => barrierWaiters.push(resolve));
          barrierHeld = true;
          return 0;
        }),
        $queryRaw: mocks.databaseClock,
        contactMergeOperation: { findFirst: mocks.mergeFind },
      };
      transactionClients.push(client);
      try {
        return await callback(client);
      } finally {
        barrierHeld = false;
        barrierWaiters.shift()?.();
      }
    });
    mocks.workspaceFind.mockResolvedValue({ id: 'tenant-1', name: 'Tenant', deletedAt: null });
    mocks.mergeFind.mockResolvedValue(null);

    const importStarted = deferred();
    const finishImport = deferred();
    const service = new BackupService();
    const internals = service as unknown as {
      deleteWorkspaceData: ReturnType<typeof vi.fn>;
      restoreDatabaseData: ReturnType<typeof vi.fn>;
      restoreFiles: ReturnType<typeof vi.fn>;
    };
    internals.deleteWorkspaceData = vi.fn().mockResolvedValue(undefined);
    internals.restoreDatabaseData = vi.fn(async () => {
      importStarted.resolve();
      await finishImport.promise;
    });
    internals.restoreFiles = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(service, 'getBackupDetails').mockResolvedValue({ status: 'COMPLETED', tenantId: 'tenant-1' } as never);
    vi.spyOn(service, 'validateBackupIntegrity').mockResolvedValue(manifest());

    const restorePromise = service.restoreWorkspaceBackup(
      'backup-1',
      'user-1',
      { overwriteExisting: true },
    );
    await importStarted.promise;

    let mergePassedBarrier = false;
    const mergePromise = mocks.transaction(async (client: typeof backupTx) => {
      await client.$executeRaw({
        sql: 'SELECT pg_advisory_xact_lock(...)',
        values: ['contact-merge-backup:tenant-1'],
      });
      mergePassedBarrier = true;
    });
    await Promise.resolve();
    const mergeWasBlockedDuringRestore = !mergePassedBarrier;

    finishImport.resolve();
    await restorePromise;
    await mergePromise;

    expect(mergeWasBlockedDuringRestore).toBe(true);
    expect(mergePassedBarrier).toBe(true);
    expect(transactionClients[0].$executeRaw.mock.calls[0][0].values)
      .toEqual(transactionClients[1].$executeRaw.mock.calls[0][0].values);
    expect(transactionClients[0].$executeRaw.mock.calls[0][0].values)
      .toEqual(['contact-merge-backup:tenant-1']);
    expect(internals.deleteWorkspaceData).toHaveBeenCalledWith('tenant-1', transactionClients[0]);
    expect(internals.restoreDatabaseData).toHaveBeenCalledWith({}, 'tenant-1', transactionClients[0]);
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
