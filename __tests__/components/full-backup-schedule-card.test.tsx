import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullBackupScheduleCard } from '@/app/(dashboard)/admin/backup/_components/full-backup-schedule-card';
import type { BackupSettings } from '@/hooks/use-full-backup';

vi.mock('@/hooks/use-full-backup', () => ({
  useUpdateBackupSchedule: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const settings: BackupSettings = {
  hasPassword: true,
  passwordUpdatedAt: '2026-09-30T04:00:00.000Z',
  scheduleEnabled: true,
  cronPattern: '0 0 * * *',
  timezone: 'Asia/Singapore',
  maxBackups: 14,
  nextRunAt: '2026-09-30T16:00:00.000Z',
  lastRunAt: null,
  lastError: null,
};

describe('FullBackupScheduleCard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the next run while it is still ahead', () => {
    vi.useFakeTimers({ now: new Date('2026-09-30T10:00:00.000Z'), toFake: ['Date'] });
    render(<FullBackupScheduleCard settings={settings} />);
    expect(screen.getByText('Next run 01 Oct 2026 00:00 (Singapore time).')).toBeInTheDocument();
  });

  it('says scheduled backups are not running when the due run never started', () => {
    vi.useFakeTimers({ now: new Date('2026-10-09T09:00:00.000Z'), toFake: ['Date'] });
    render(<FullBackupScheduleCard settings={settings} />);
    expect(
      screen.getByText(/The run due 01 Oct 2026 00:00 \(Singapore time\) has not started, so scheduled backups are not running/),
    ).toBeInTheDocument();
  });
});
