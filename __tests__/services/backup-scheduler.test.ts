import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cleanupStaleFullBackups = vi.fn();
const processScheduledFullBackup = vi.fn();

vi.mock('@/services/backup/full/full-backup.service', () => ({
  cleanupStaleFullBackups: (...args: unknown[]) => cleanupStaleFullBackups(...args),
  processScheduledFullBackup: (...args: unknown[]) => processScheduledFullBackup(...args),
}));

async function backupTaskEnabled(): Promise<boolean> {
  vi.resetModules();
  const { scheduler } = await import('@/lib/scheduler/scheduler');
  const { backupTask } = await import('@/lib/scheduler/tasks/backup.task');
  scheduler.registerTask(backupTask);
  return scheduler.getStatus().tasks.find((task) => task.id === 'backup')!.enabled;
}

describe('scheduled full backup task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs whenever the scheduler is on, without SCHEDULER_BACKUP_ENABLED', async () => {
    vi.stubEnv('SCHEDULER_BACKUP_ENABLED', undefined as unknown as string);
    expect(await backupTaskEnabled()).toBe(true);
  });

  it('can still be turned off with SCHEDULER_BACKUP_ENABLED=false', async () => {
    vi.stubEnv('SCHEDULER_BACKUP_ENABLED', 'false');
    expect(await backupTaskEnabled()).toBe(false);
  });

  it('starts the due backup even when stale cleanup fails', async () => {
    cleanupStaleFullBackups.mockRejectedValue(new Error('cleanup failed'));
    processScheduledFullBackup.mockResolvedValue({ backupId: 'backup-1' });
    const { backupTask } = await import('@/lib/scheduler/tasks/backup.task');

    const result = await backupTask.execute();

    expect(processScheduledFullBackup).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true, data: { fullBackup: { backupId: 'backup-1' } } });
  });
});
