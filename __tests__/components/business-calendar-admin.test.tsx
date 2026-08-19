import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  useServiceCalendars: vi.fn(),
  useServiceCalendar: vi.fn(),
  useCreateServiceCalendar: vi.fn(),
  useUpdateServiceCalendar: vi.fn(),
  usePreviewServiceCalendarImpact: vi.fn(),
}));

vi.mock('@/hooks/use-service-calendars', () => hooks);

import { BusinessCalendarPanel } from '@/components/services/admin/business-calendar-panel';

const calendar = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Singapore public holidays · 2026',
  jurisdictionCode: 'SG',
  timeZone: 'Asia/Singapore',
  weekendDays: [0, 6],
  revision: 3,
  isActive: true,
  archivedAt: null,
  holidays: [
    { id: '22222222-2222-4222-8222-222222222222', date: '2026-01-01', name: "New Year's Day", description: null, isActive: true },
  ],
};

const mutation = (result?: unknown) => ({
  mutateAsync: vi.fn().mockResolvedValue(result),
  isPending: false,
  error: null,
});

describe('BusinessCalendarPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.useServiceCalendars.mockReturnValue({ data: { calendars: [calendar], total: 1 }, isLoading: false, error: null, refetch: vi.fn() });
    hooks.useServiceCalendar.mockReturnValue({ data: calendar, isLoading: false, error: null });
    hooks.useCreateServiceCalendar.mockReturnValue(mutation());
    hooks.useUpdateServiceCalendar.mockReturnValue(mutation());
    hooks.usePreviewServiceCalendarImpact.mockReturnValue(mutation({
      calendarId: calendar.id,
      expectedRevision: calendar.revision,
      proposedHash: 'hash-2',
      previewFingerprint: 'fingerprint-2',
      counts: { recalculated: 2, preserved: 1, warnings: 0 },
      samples: [],
    }));
  });

  it('shows weekend days, named holidays, and revision state', () => {
    render(<BusinessCalendarPanel workspaceId="33333333-3333-4333-8333-333333333333" />);

    expect(screen.getByRole('heading', { name: 'Business calendar' })).toBeVisible();
    expect(screen.getByText('Singapore public holidays · 2026')).toBeVisible();
    expect(screen.getByText("New Year's Day")).toBeVisible();
    expect(screen.getByText('Revision 3')).toBeVisible();
    expect(screen.getByLabelText('Saturday')).toBeChecked();
    expect(screen.getByLabelText('Sunday')).toBeChecked();
  });

  it('requires a current date-change impact preview before updating', async () => {
    render(<BusinessCalendarPanel workspaceId="33333333-3333-4333-8333-333333333333" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit calendar' }));
    const update = screen.getByRole('button', { name: 'Save calendar' });
    expect(update).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview date changes' }));
    const preview = hooks.usePreviewServiceCalendarImpact.mock.results[0]?.value;
    await waitFor(() => expect(preview.mutateAsync).toHaveBeenCalled());
    expect(screen.getByText('Date-change preview ready')).toBeVisible();
    expect(update).toBeEnabled();
  });

  it('completes the calendar update from the date-change preview dialog', async () => {
    const updateMutation = mutation(calendar);
    hooks.useUpdateServiceCalendar.mockReturnValue(updateMutation);
    render(<BusinessCalendarPanel workspaceId="33333333-3333-4333-8333-333333333333" />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit calendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview date changes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Date-change impact preview' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save calendar' }));

    await waitFor(() => expect(updateMutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      id: calendar.id,
      input: expect.objectContaining({ expectedRevision: calendar.revision, previewFingerprint: 'fingerprint-2' }),
    })));
  });

  it('renders every calendar and preserves the selected calendar across refreshes', async () => {
    const secondCalendar = { ...calendar, id: '99999999-9999-4999-8999-999999999999', name: 'Singapore public holidays · 2027', revision: 1 };
    hooks.useServiceCalendars.mockReturnValue({ data: { calendars: [calendar, secondCalendar], total: 2 }, isLoading: false, error: null, refetch: vi.fn() });
    hooks.useServiceCalendar.mockImplementation((_workspaceId: string, id?: string) => ({ data: id === secondCalendar.id ? secondCalendar : calendar, isLoading: false, error: null }));
    const { rerender } = render(<BusinessCalendarPanel workspaceId="33333333-3333-4333-8333-333333333333" />);

    fireEvent.click(screen.getByRole('button', { name: 'Select calendar Singapore public holidays · 2027' }));
    expect(screen.getByRole('heading', { name: 'Singapore public holidays · 2027' })).toBeVisible();
    rerender(<BusinessCalendarPanel workspaceId="33333333-3333-4333-8333-333333333333" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Singapore public holidays · 2027' })).toBeVisible());
    expect(screen.getByRole('button', { name: 'Select calendar Singapore public holidays · 2027' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps inactive holiday history visible and excludes it from active replacement input', async () => {
    const mixedCalendar = {
      ...calendar,
      holidays: [
        ...calendar.holidays,
        { id: '33333333-3333-4333-8333-333333333333', date: '2025-12-25', name: 'Archived Christmas', description: null, isActive: false },
      ],
    };
    const updateMutation = mutation(mixedCalendar);
    hooks.useServiceCalendars.mockReturnValue({ data: { calendars: [mixedCalendar], total: 1 }, isLoading: false, error: null, refetch: vi.fn() });
    hooks.useServiceCalendar.mockReturnValue({ data: mixedCalendar, isLoading: false, error: null });
    hooks.useUpdateServiceCalendar.mockReturnValue(updateMutation);
    render(<BusinessCalendarPanel workspaceId="33333333-3333-4333-8333-333333333333" />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit calendar' }));
    expect(screen.getByText('Archived')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Preview date changes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Date-change impact preview' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save calendar' }));
    await waitFor(() => expect(updateMutation.mutateAsync).toHaveBeenCalled());
    expect(updateMutation.mutateAsync.mock.calls[0][0].input.holidays).toEqual([
      { date: '2026-01-01', name: "New Year's Day", description: null },
    ]);
  });
});
