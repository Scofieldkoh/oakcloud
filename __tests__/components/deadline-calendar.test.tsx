import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeadlineOccurrenceDto } from '@/services/deadline';

const hooks = vi.hoisted(() => ({
  useDeadlines: vi.fn(),
  useUserPreference: vi.fn(),
  useUpsertUserPreference: vi.fn(),
}));
const media = vi.hoisted(() => ({ isLargeDesktop: vi.fn(() => true) }));

vi.mock('@/hooks/use-deadlines', () => ({ useDeadlines: hooks.useDeadlines }));
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreference: hooks.useUserPreference,
  useUpsertUserPreference: hooks.useUpsertUserPreference,
}));
vi.mock('@/hooks/use-media-query', () => ({ useIsLargeDesktop: media.isLargeDesktop }));

import { DeadlineCalendar } from '@/components/services/deadlines/deadline-calendar';
import { DeadlineEvent } from '@/components/services/deadlines/deadline-event';
import { DeadlineTable } from '@/components/services/deadlines/deadline-table';

const occurrence: DeadlineOccurrenceDto = {
  id: '44444444-4444-4444-8444-444444444444',
  tenantId: '11111111-1111-4111-8111-111111111111',
  companyId: '22222222-2222-4222-8222-222222222222',
  clientServiceId: '55555555-5555-4555-8555-555555555555',
  cycleId: '66666666-6666-4666-8666-666666666666',
  ruleVersionId: '77777777-7777-4777-8777-777777777777',
  milestoneKey: 'annual-return',
  scheduleEntryKey: '',
  deadlineType: 'STATUTORY',
  calculatedDueDate: '2026-08-28',
  operativeDueDate: '2026-08-28',
  dueDate: '2026-08-28',
  dateOverridden: false,
  dateOverride: null,
  dateOverrideReason: null,
  dateOverriddenById: null,
  dateOverriddenAt: null,
  status: 'OPEN',
  timingState: 'UPCOMING',
  completedAt: null,
  completedById: null,
  waivedAt: null,
  waivedById: null,
  waiverReason: null,
  cancelledAt: null,
  cancelledById: null,
  cancellationReason: null,
  notes: 'Bring signed accounts.',
  origin: 'RULE',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  company: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Oaktree Accounting & Corporate Solution Pte. Ltd.',
    displayAlias: null,
    displayLabel: 'OACS',
    uen: null,
  },
  family: { id: '33333333-3333-4333-8333-333333333333', name: 'Accounting', displayColor: '#3F6DA8' },
  service: {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Annual Return',
    familyName: 'Accounting',
    variantId: '55555555-5555-4555-8555-555555555555',
    variantName: 'Annual Return',
  },
  cycle: {
    id: '66666666-6666-4666-8666-666666666666',
    periodKey: '2026',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
  },
};

describe('DeadlineCalendar', () => {
  it('shows two desktop months and persists a three-month choice', () => {
    media.isLargeDesktop.mockReturnValue(true);
    const monthCountChange = vi.fn();
    hooks.useDeadlines.mockReturnValue({
      data: { mode: 'CALENDAR', items: [occurrence], truncated: false },
      isLoading: false,
      isFetching: false,
      error: null,
    });
    hooks.useUserPreference.mockReturnValue({ data: { value: null }, isLoading: false });
    hooks.useUpsertUserPreference.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<DeadlineCalendar items={[occurrence]} onMonthCountChange={monthCountChange} />);

    expect(screen.getAllByRole('grid', { name: /calendar/i })).toHaveLength(2);
    expect(screen.getAllByRole('gridcell')[0]?.querySelector('button')).toHaveClass('min-h-11');
    fireEvent.change(screen.getByLabelText('Visible months'), { target: { value: '3' } });
    expect(monthCountChange).toHaveBeenCalledWith(3);
  });

  it('shows company label and full name in an event popover', () => {
    media.isLargeDesktop.mockReturnValue(true);
    hooks.useDeadlines.mockReturnValue({
      data: { mode: 'CALENDAR', items: [occurrence], truncated: false },
      isLoading: false,
      isFetching: false,
      error: null,
    });
    hooks.useUserPreference.mockReturnValue({ data: { value: null }, isLoading: false });
    hooks.useUpsertUserPreference.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<DeadlineCalendar items={[occurrence]} focusMonth={new Date(2026, 7, 1)} />);

    const eventButton = screen.getByRole('button', { name: /OACS Annual Return/ });
    expect(eventButton).toBeVisible();
    fireEvent.click(eventButton);
    expect(screen.getByText('Oaktree Accounting & Corporate Solution Pte. Ltd.')).toBeVisible();
  });

  it('supports lifecycle actions with required reasons and date inputs', () => {
    const onUpdate = vi.fn();
    const onResetOverride = vi.fn();
    const { unmount } = render(<DeadlineEvent occurrence={occurrence} canEdit onUpdate={onUpdate} onResetOverride={onResetOverride} />);

    fireEvent.click(screen.getByRole('button', { name: /OACS Annual Return/ }));
    expect(screen.getByRole('button', { name: 'Mark complete' })).toHaveClass('min-h-11');
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
    expect(onUpdate).toHaveBeenCalledWith(occurrence, expect.objectContaining({ status: 'COMPLETED' }));

    fireEvent.click(screen.getByRole('button', { name: 'Waive' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Client requested waiver' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdate).toHaveBeenCalledWith(occurrence, expect.objectContaining({ status: 'WAIVED', reason: 'Client requested waiver' }));

    fireEvent.click(screen.getByRole('button', { name: 'Override date' }));
    fireEvent.change(screen.getByLabelText('New operative date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Approved extension' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdate).toHaveBeenCalledWith(occurrence, expect.objectContaining({ operativeDueDate: '2026-09-01', reason: 'Approved extension' }));

    fireEvent.click(screen.getByRole('button', { name: 'Edit notes' }));
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Updated client note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdate).toHaveBeenCalledWith(occurrence, expect.objectContaining({ notes: 'Updated client note' }));

    unmount();
    const overridden = { ...occurrence, dateOverridden: true };
    const { unmount: unmountOverridden } = render(<DeadlineEvent occurrence={overridden} canEdit onUpdate={onUpdate} onResetOverride={onResetOverride} />);
    fireEvent.click(screen.getByRole('button', { name: /OACS Annual Return/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset date' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Revert to calculated date' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onResetOverride).toHaveBeenCalledWith(overridden, 'Revert to calculated date');

    unmountOverridden();
    const completed = { ...occurrence, status: 'COMPLETED' as const };
    render(<DeadlineEvent occurrence={completed} canEdit onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: /OACS Annual Return/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Correction required' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdate).toHaveBeenCalledWith(completed, expect.objectContaining({ status: 'OPEN', reason: 'Correction required' }));
  });

  it('reports live column resize and persists the final width on pointer release', () => {
    const onLiveResize = vi.fn();
    const onResizeEnd = vi.fn();
    render(
      <DeadlineTable
        items={[occurrence]}
        page={1}
        total={1}
        totalPages={1}
        limit={20}
        onPageChange={vi.fn()}
        onColumnWidthChange={onLiveResize}
        onColumnResizeEnd={onResizeEnd}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Resize Operative due date column' }), { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 130 });
    fireEvent.pointerUp(window, { clientX: 130 });

    expect(onLiveResize).toHaveBeenCalledWith('dueDate', 180);
    expect(onResizeEnd).toHaveBeenCalledWith('dueDate', 180);
  });

  it('transfers focus and dismisses event and table action dialogs accessibly', () => {
    const { unmount } = render(<DeadlineEvent occurrence={occurrence} canEdit onUpdate={vi.fn()} />);
    const eventTrigger = screen.getByRole('button', { name: /OACS Annual Return/ });
    fireEvent.click(eventTrigger);
    expect(screen.getByRole('button', { name: 'Close deadline details' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /OACS deadline details/i })).not.toBeInTheDocument();
    expect(eventTrigger).toHaveFocus();
    fireEvent.click(eventTrigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog', { name: /OACS deadline details/i })).not.toBeInTheDocument();
    expect(eventTrigger).toHaveFocus();

    unmount();
    render(<DeadlineTable items={[occurrence]} page={1} total={1} totalPages={1} limit={20} canEdit onUpdate={vi.fn()} onPageChange={vi.fn()} onLimitChange={vi.fn()} />);
    const actionTrigger = screen.getAllByRole('button', { name: /Actions for OACS Annual Return/ })[0]!;
    fireEvent.click(actionTrigger);
    const actionDialog = screen.getByRole('dialog', { name: 'Deadline actions' });
    expect(actionDialog).toBeVisible();
    expect(within(actionDialog).getByRole('button', { name: /^OACS Annual Return$/ })).toHaveFocus();
    fireEvent.keyDown(actionDialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Deadline actions' })).not.toBeInTheDocument();
    expect(actionTrigger).toHaveFocus();
    expect(screen.getByRole('combobox')).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveClass('min-h-11', 'min-w-11');
  });

  it('uses a compact event cap and exposes the remaining agenda on smaller viewports', () => {
    media.isLargeDesktop.mockReturnValue(false);
    const denseItems = [1, 2, 3, 4].map((index) => ({ ...occurrence, id: `44444444-4444-4444-8444-44444444444${index}`, milestoneKey: `annual-return-${index}` }));
    hooks.useDeadlines.mockReturnValue({ data: { mode: 'CALENDAR', items: denseItems, truncated: false }, isLoading: false, isFetching: false, error: null });
    hooks.useUserPreference.mockReturnValue({ data: { value: null }, isLoading: false });
    hooks.useUpsertUserPreference.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<DeadlineCalendar items={denseItems} focusMonth={new Date(2026, 7, 1)} />);

    expect(screen.getByRole('button', { name: /Show 3 more deadlines on 28 August 2026/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Show 3 more deadlines on 28 August 2026/ }));
    expect(screen.getByRole('region', { name: 'Selected day agenda' })).toHaveTextContent('4 deadlines');
  });

  it('shows retryable loading and error states without a misleading empty calendar', () => {
    media.isLargeDesktop.mockReturnValue(true);
    const refetch = vi.fn();
    hooks.useDeadlines.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: new Error('network'), refetch });
    render(<DeadlineCalendar />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load deadlines');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.queryByRole('grid', { name: /calendar/i })).not.toBeInTheDocument();
  });
});
