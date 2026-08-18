import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ManualCycleDialog } from '@/components/services/deadlines/manual-cycle-dialog';

const preview = {
  ruleVersionId: '44444444-4444-4444-8444-444444444444',
  ruleName: 'Annual return',
  periodKey: '2024',
  milestones: [
    { milestoneKey: 'client-records', scheduleEntryKey: '', name: 'Client records', deadlineType: 'CLIENT', calculatedDueDate: '2024-01-15', operativeDueDate: '2024-01-15', explanation: ['Cycle start plus 14 days'] },
    { milestoneKey: 'statutory-filing', scheduleEntryKey: '', name: 'Statutory filing', deadlineType: 'STATUTORY', calculatedDueDate: '2024-02-01', operativeDueDate: '2024-02-01', explanation: ['Historical filing anchor'] },
  ],
  previewFingerprint: 'a'.repeat(64),
};

describe('ManualCycleDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ cycleId: 'cycle-1', occurrenceIds: ['occurrence-1'] }), { status: 200, headers: { 'content-type': 'application/json' } })));
  });

  it('keeps Apply disabled until a current preview exists and invalidates it on edits', async () => {
    render(<ManualCycleDialog isOpen clientServiceId="22222222-2222-4222-8222-222222222222" onClose={vi.fn()} />);

    const apply = screen.getByRole('button', { name: 'Apply cycle' });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Rule version ID'), { target: { value: preview.ruleVersionId } });
    fireEvent.change(screen.getByLabelText('Period key'), { target: { value: '2024' } });
    fireEvent.change(screen.getByLabelText('Period start'), { target: { value: '2024-01-01' } });
    fireEvent.change(screen.getByLabelText('Period end'), { target: { value: '2024-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview cycle' }));

    await waitFor(() => expect(screen.getByText('Client records')).toBeVisible());
    expect(apply).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Period key'), { target: { value: '2023' } });
    expect(apply).toBeDisabled();
  });
});
