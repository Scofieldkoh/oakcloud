import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeadlineOccurrenceDto } from '@/services/deadline';

const hooks = vi.hoisted(() => ({
  useDeadlines: vi.fn(),
  useUpdateDeadlineOccurrence: vi.fn(),
  useServiceRosterFamilies: vi.fn(),
  useUserPreference: vi.fn(),
  useUpsertUserPreference: vi.fn(),
}));

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/services',
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));
vi.mock('@/hooks/use-deadlines', () => ({
  useDeadlines: hooks.useDeadlines,
  useUpdateDeadlineOccurrence: hooks.useUpdateDeadlineOccurrence,
}));
vi.mock('@/hooks/use-service-roster-families', () => ({ useServiceRosterFamilies: hooks.useServiceRosterFamilies }));
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreference: hooks.useUserPreference,
  useUpsertUserPreference: hooks.useUpsertUserPreference,
}));

import { DeadlineWorkspace } from '@/components/services/deadlines/deadline-workspace';

const familyId = '33333333-3333-4333-8333-333333333333';

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
  family: { id: familyId, name: 'Accounting', displayColor: '#3F6DA8' },
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

function setup() {
  navigation.searchParams = new URLSearchParams();
  navigation.replace.mockReset();
  hooks.useDeadlines.mockReturnValue({
    data: { mode: 'TABLE', items: [occurrence], total: 1, page: 1, limit: 20, totalPages: 1 },
    isLoading: false,
    isFetching: false,
    error: null,
  });
  hooks.useUpdateDeadlineOccurrence.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useServiceRosterFamilies.mockReturnValue({
    data: [{ id: familyId, name: 'Accounting', displayColor: '#3F6DA8' }],
    isLoading: false,
    error: null,
  });
  hooks.useUserPreference.mockReturnValue({ data: { value: null }, isLoading: false });
  hooks.useUpsertUserPreference.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

describe('DeadlineWorkspace', () => {
  beforeEach(setup);

  it('keeps type, open-only, and family filters in one unlabeled toolbar', () => {
    render(<DeadlineWorkspace />);

    const toolbar = screen.getByRole('group', { name: 'Deadline filters' });
    for (const name of ['Statutory', 'Client', 'Internal', 'Open only', 'Accounting']) {
      expect(within(toolbar).getByRole('button', { name })).toBeVisible();
    }
    expect(screen.queryByText('Filter families')).not.toBeInTheDocument();
  });

  it('uses the same filters after switching calendar mode', () => {
    render(<DeadlineWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: 'Calendar view' }));

    expect(screen.getByRole('button', { name: 'Statutory' })).toHaveAttribute('aria-pressed', 'true');
    expect(navigation.replace).toHaveBeenCalledWith(
      expect.stringContaining('deadlineView=CALENDAR'),
      { scroll: false },
    );
  });

  it('gives explicit URL filters precedence over versioned preferences', () => {
    navigation.searchParams = new URLSearchParams(`types=CLIENT&families=${familyId}&openOnly=true`);
    hooks.useUserPreference.mockReturnValue({
      data: {
        value: {
          version: 1,
          defaultView: 'TABLE',
          monthCount: 3,
          visibleTypes: ['STATUTORY'],
          familyIds: [],
        },
      },
      isLoading: false,
    });

    render(<DeadlineWorkspace />);

    expect(hooks.useDeadlines).toHaveBeenLastCalledWith(expect.objectContaining({
      types: ['CLIENT'],
      familyIds: [familyId],
      openOnly: true,
      mode: 'TABLE',
    }));
    expect(screen.getByRole('button', { name: 'Client' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Statutory' })).toHaveAttribute('aria-pressed', 'false');
  });
});
