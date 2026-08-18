import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeadlineOccurrenceDto } from '@/services/deadline';

const hooks = vi.hoisted(() => ({
  useDeadlines: vi.fn(),
  useUserPreference: vi.fn(),
  useUpsertUserPreference: vi.fn(),
}));

vi.mock('@/hooks/use-deadlines', () => ({ useDeadlines: hooks.useDeadlines }));
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreference: hooks.useUserPreference,
  useUpsertUserPreference: hooks.useUpsertUserPreference,
}));
vi.mock('@/hooks/use-media-query', () => ({ useIsLargeDesktop: () => true }));

import { DeadlineCalendar } from '@/components/services/deadlines/deadline-calendar';

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
    const preferenceMutation = vi.fn();
    hooks.useDeadlines.mockReturnValue({
      data: { mode: 'CALENDAR', items: [occurrence], truncated: false },
      isLoading: false,
      isFetching: false,
      error: null,
    });
    hooks.useUserPreference.mockReturnValue({ data: { value: null }, isLoading: false });
    hooks.useUpsertUserPreference.mockReturnValue({ mutate: preferenceMutation, isPending: false });

    render(<DeadlineCalendar />);

    expect(screen.getAllByRole('grid', { name: /calendar/i })).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Visible months'), { target: { value: '3' } });
    expect(preferenceMutation).toHaveBeenCalledWith(expect.objectContaining({
      key: 'services.deadlines.view.v1',
      value: expect.objectContaining({ monthCount: 3 }),
    }));
  });

  it('shows company label and full name in an event popover', () => {
    hooks.useDeadlines.mockReturnValue({
      data: { mode: 'CALENDAR', items: [occurrence], truncated: false },
      isLoading: false,
      isFetching: false,
      error: null,
    });
    hooks.useUserPreference.mockReturnValue({ data: { value: null }, isLoading: false });
    hooks.useUpsertUserPreference.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<DeadlineCalendar />);

    expect(screen.getAllByText('OACS').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /OACS Annual Return/ }));
    expect(screen.getByText('Oaktree Accounting & Corporate Solution Pte. Ltd.')).toBeVisible();
  });
});
