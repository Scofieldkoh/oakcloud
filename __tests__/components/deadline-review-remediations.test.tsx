import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultDeadlineViewPreference,
  parseDeadlineUrlState,
} from '@/components/services/deadlines/deadline-workspace';
import { parseDeadlineSearchParams } from '@/lib/validations/deadline';
import { parseDeadlineViewPreference } from '@/lib/validations/services-preferences';
import { addCalendarDays, addMonthsClamped, currentDateInSingapore, type DateOnly } from '@/services/service-schedule';

const hooks = vi.hoisted(() => ({
  useDeadlines: vi.fn(),
  useUpdateDeadlineOccurrence: vi.fn(),
  useResetDeadlineDateOverride: vi.fn(),
  useServiceRosterFamilies: vi.fn(),
  useUserPreference: vi.fn(),
  useUpsertUserPreference: vi.fn(),
  preferenceMutation: vi.fn(),
}));

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
}));
const media = vi.hoisted(() => ({ isLargeDesktop: vi.fn(() => true) }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/services',
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));
vi.mock('@/hooks/use-deadlines', () => ({
  useDeadlines: hooks.useDeadlines,
  useUpdateDeadlineOccurrence: hooks.useUpdateDeadlineOccurrence,
  useResetDeadlineDateOverride: hooks.useResetDeadlineDateOverride,
}));
vi.mock('@/hooks/use-service-roster-families', () => ({ useServiceRosterFamilies: hooks.useServiceRosterFamilies }));
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreference: hooks.useUserPreference,
  useUpsertUserPreference: hooks.useUpsertUserPreference,
}));
vi.mock('@/hooks/use-media-query', () => ({ useIsLargeDesktop: media.isLargeDesktop }));
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    placeholder = 'Select date',
    onChange,
  }: {
    placeholder?: string;
    onChange: (value: unknown) => void;
  }) => (
    <div>
      <button type="button" aria-label={placeholder}>{placeholder}</button>
      <button
        type="button"
        onClick={() => onChange({
          mode: 'range',
          range: {
            from: new Date('2026-08-10T00:00:00'),
            to: new Date('2026-08-20T00:00:00'),
          },
        })}
      >
        Apply complete date range
      </button>
      <button
        type="button"
        onClick={() => onChange({ mode: 'range', range: { from: new Date('2026-08-10T00:00:00') } })}
      >
        Apply incomplete date range
      </button>
      <button type="button" onClick={() => onChange(undefined)}>Clear date range</button>
    </div>
  ),
}));

import { DeadlineWorkspace } from '@/components/services/deadlines/deadline-workspace';

const familyId = '33333333-3333-4333-8333-333333333333';

function setup() {
  navigation.searchParams = new URLSearchParams();
  navigation.replace.mockReset();
  hooks.useDeadlines.mockImplementation((query: { mode?: string }) => ({
    data: query.mode === 'CALENDAR'
      ? { mode: 'CALENDAR', items: [], truncated: false }
      : { mode: 'TABLE', items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }));
  hooks.useUpdateDeadlineOccurrence.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
  hooks.useResetDeadlineDateOverride.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
  hooks.useServiceRosterFamilies.mockReturnValue({
    data: [{ id: familyId, name: 'Accounting', displayColor: '#3F6DA8' }],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  hooks.useUserPreference.mockReturnValue({ data: { value: null }, isLoading: false });
  hooks.preferenceMutation.mockReset();
  hooks.useUpsertUserPreference.mockReturnValue({ mutate: hooks.preferenceMutation, isPending: false });
}

describe('Task 12 review remediations', () => {
  beforeEach(() => {
    media.isLargeDesktop.mockReturnValue(true);
    setup();
  });

  it('canonicalizes malformed, partial, reversed, and oversized URL ranges before querying', () => {
    const parsed = parseDeadlineUrlState(
      'deadlineView=CALENDAR&from=2026-02-31&to=2025-01-01&companies=bad&families=bad',
      defaultDeadlineViewPreference,
      true,
      '2026-08-19',
    );

    expect(parsed.from).toBe('2026-08-01');
    expect(parsed.to).toBe('2026-09-30');
    expect(parsed.companies).toEqual([]);
    expect(parsed.families).toEqual([]);

    const boundary = parseDeadlineUrlState(
      'deadlineView=CALENDAR&from=9999-12-31',
      defaultDeadlineViewPreference,
      true,
      '2026-08-19',
    );
    expect(boundary.from).toBe('2026-08-01');
    expect(boundary.to).toBe('2026-09-30');

    const partial = parseDeadlineUrlState(
      'deadlineView=CALENDAR&from=2026-08-15&to=2026-09-20&page=4',
      defaultDeadlineViewPreference,
      true,
      '2026-08-19',
    );
    expect(partial.from).toBe('2026-08-01');
    expect(partial.to).toBe('2026-09-30');
    expect(partial.page).toBe(4);
  });

  it('validates inline transport filters and repairs malformed saved columns', () => {
    expect(parseDeadlineSearchParams(new URLSearchParams({
      from: '2026-08-01',
      to: '2026-08-31',
      companyQuery: ' Oaktree ',
      serviceQuery: ' Annual Return ',
      milestoneQuery: ' annual-return ',
    }))).toEqual(expect.objectContaining({ companyQuery: 'Oaktree', serviceQuery: 'Annual Return', milestoneQuery: 'annual-return' }));

    const parsed = parseDeadlineViewPreference({
      version: 1,
      defaultView: 'TABLE',
      monthCount: 2,
      visibleTypes: ['CLIENT'],
      familyIds: [],
      tableColumnOrder: ['actions', 'unknown', 'company'],
      tableColumnWidths: { dueDate: 40, company: 901, unknown: 220, timing: 'wide' },
      tableColumnVisibility: { actions: false, company: false, unknown: false },
      sortBy: 'dueDate',
      sortOrder: 'asc',
      pageSize: 20,
    });
    expect(parsed.tableColumnOrder).toEqual(['actions', 'company', 'dueDate', 'timing', 'familyService', 'milestone', 'type', 'status', 'cycleOrigin']);
    expect(parsed.tableColumnWidths).toEqual({ dueDate: 96, company: 800 });
    expect(parsed.tableColumnVisibility).toEqual(expect.objectContaining({ actions: true, company: false }));
    expect(parsed.tableColumnVisibility).not.toHaveProperty('unknown');
  });

  it('canonicalizes calendar history after async preferences and viewport transitions without loops', () => {
    navigation.searchParams = new URLSearchParams('deadlineView=CALENDAR&from=2026-08-01&to=2026-09-30&page=4');
    const view = render(<DeadlineWorkspace />);
    const initialCalls = navigation.replace.mock.calls.length;
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('page=1'), { scroll: false });

    hooks.useUserPreference.mockReturnValue({
      data: { value: { ...defaultDeadlineViewPreference, monthCount: 3 } },
      isLoading: false,
    });
    view.rerender(<DeadlineWorkspace />);
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('from=2026-08-01'), { scroll: false });
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('to=2026-10-31'), { scroll: false });
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('page=1'), { scroll: false });

    media.isLargeDesktop.mockReturnValue(false);
    view.rerender(<DeadlineWorkspace />);
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('from=2026-08-01'), { scroll: false });
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('to=2026-08-31'), { scroll: false });
    const stableCalls = navigation.replace.mock.calls.length;
    view.rerender(<DeadlineWorkspace />);
    expect(navigation.replace.mock.calls.length).toBe(stableCalls);
    expect(hooks.useDeadlines).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-08-01', to: '2026-08-31', mode: 'CALENDAR', page: 1 }));
    expect(initialCalls).toBeGreaterThan(0);
  });

  it('renders server-backed inline deadline filters and resets the page', () => {
    navigation.searchParams = new URLSearchParams('tab=deadlines&page=4&statuses=COMPLETED&origin=MANUAL_TRIGGER');
    render(<DeadlineWorkspace />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter Company' }), { target: { value: 'Oaktree' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter Service' }), { target: { value: 'Annual' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter Milestone' }), { target: { value: 'return' } });

    expect(navigation.replace).toHaveBeenLastCalledWith(
      expect.stringContaining('page=1'),
      { scroll: false },
    );
    expect(hooks.useDeadlines).toHaveBeenLastCalledWith(expect.objectContaining({
      companyQuery: 'Oaktree',
      serviceQuery: 'Annual',
      milestoneQuery: 'return',
      statuses: ['COMPLETED'],
      origin: 'MANUAL_TRIGGER',
      page: 1,
    }));

    const clearButtons = screen.getAllByRole('button', { name: 'Clear selection' });
    expect(clearButtons).toHaveLength(2);
    fireEvent.click(clearButtons[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(hooks.useDeadlines).toHaveBeenLastCalledWith(expect.objectContaining({ statuses: [], origin: undefined, page: 1 }));
  });

  it('uses shared clearable selects and a Date Range picker beside Families', () => {
    navigation.searchParams = new URLSearchParams('tab=deadlines');
    render(<DeadlineWorkspace />);

    expect(screen.getByRole('combobox', { name: 'All types' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'All statuses' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'All sources' })).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Filter Type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Filter Status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Filter Source' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date Range' })).toBeVisible();
  });

  it('maps complete deadline ranges, ignores incomplete ranges, and sends both keys when clearing', () => {
    navigation.searchParams = new URLSearchParams('tab=deadlines');
    render(<DeadlineWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: 'Apply complete date range' }));
    expect(navigation.replace).toHaveBeenCalledWith(expect.stringContaining('from=2026-08-10'), { scroll: false });
    expect(navigation.replace).toHaveBeenCalledWith(expect.stringContaining('to=2026-08-20'), { scroll: false });

    const callsAfterComplete = navigation.replace.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Apply incomplete date range' }));
    expect(navigation.replace).toHaveBeenCalledTimes(callsAfterComplete);

    fireEvent.click(screen.getByRole('button', { name: 'Clear date range' }));
    expect(navigation.replace.mock.calls).toContainEqual([
      expect.not.stringContaining('from='),
      { scroll: false },
    ]);
    expect(navigation.replace.mock.calls).toContainEqual([
      expect.not.stringContaining('to='),
      { scroll: false },
    ]);
  });

  it('keeps calendar navigation, visible-month changes, and Today ranges canonical', () => {
    navigation.searchParams = new URLSearchParams('deadlineView=CALENDAR&from=2026-08-01&to=2026-09-30&page=4');
    render(<DeadlineWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      expect.stringContaining('from=2026-10-01'),
      { scroll: false },
    );
    expect(navigation.replace).toHaveBeenLastCalledWith(
      expect.stringContaining('to=2026-11-30'),
      { scroll: false },
    );
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('page=1'), { scroll: false });

    fireEvent.change(screen.getByRole('combobox', { name: 'Visible months' }), { target: { value: '3' } });
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('from=2026-10-01'), { scroll: false });
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('to=2026-12-31'), { scroll: false });
    expect(hooks.preferenceMutation).toHaveBeenCalledWith(expect.objectContaining({ value: expect.objectContaining({ monthCount: 3 }) }));

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    const today = currentDateInSingapore();
    const todayMonth = `${today.slice(0, 7)}-01` as DateOnly;
    const expectedTo = addCalendarDays(addMonthsClamped(todayMonth, 3), -1);
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining(`from=${todayMonth}`), { scroll: false });
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining(`to=${expectedTo}`), { scroll: false });
    expect(navigation.replace).toHaveBeenLastCalledWith(expect.stringContaining('page=1'), { scroll: false });
  });

  it('persists visible type/family defaults and selected page size', async () => {
    render(<DeadlineWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: 'Internal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Families' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accounting' }));
    fireEvent.change(screen.getByRole('combobox', { name: /per page/i }), { target: { value: '50' } });

    const mutations = hooks.preferenceMutation.mock.calls.map(([input]) => input.value);
    expect(mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({ visibleTypes: ['INTERNAL'] }),
      expect.objectContaining({ familyIds: [familyId] }),
      expect.objectContaining({ pageSize: 50 }),
    ]));
    await waitFor(() => expect(hooks.useDeadlines).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 50 })));
  });

  it('allows clearing the last deadline type so the query becomes unfiltered', () => {
    navigation.searchParams = new URLSearchParams('types=CLIENT');
    hooks.useUserPreference.mockReturnValue({
      data: { value: { ...defaultDeadlineViewPreference, visibleTypes: ['STATUTORY'] } },
      isLoading: false,
    });
    render(<DeadlineWorkspace />);

    const client = screen.getByRole('button', { name: 'Client' });
    expect(client).toHaveAttribute('aria-pressed', 'true');
    expect(client).not.toBeDisabled();
    navigation.replace.mockReset();
    hooks.preferenceMutation.mockReset();
    fireEvent.click(client);
    expect(navigation.replace).toHaveBeenCalledWith(expect.not.stringContaining('types='), { scroll: false });
    expect(hooks.preferenceMutation).toHaveBeenCalledWith(expect.objectContaining({ value: expect.objectContaining({ visibleTypes: [] }) }));
  });

  it('shows actionable company-id and due-range deviation badges', () => {
    navigation.searchParams = new URLSearchParams('companies=22222222-2222-4222-8222-222222222222&from=2026-09-01&to=2026-09-30');
    const view = render(<DeadlineWorkspace />);

    expect(screen.getByRole('button', { name: /Remove Companies:/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Remove Due:/ })).toBeVisible();

    const today = currentDateInSingapore();
    const defaultTo = addCalendarDays(today, 30);
    fireEvent.click(screen.getByRole('button', { name: /Remove Due:/ }));
    expect(navigation.replace).toHaveBeenLastCalledWith(
      expect.stringContaining(`from=${today}`),
      { scroll: false },
    );
    expect(navigation.replace).toHaveBeenLastCalledWith(
      expect.stringContaining(`to=${defaultTo}`),
      { scroll: false },
    );

    navigation.searchParams = new URLSearchParams(`from=${today}&to=${defaultTo}`);
    view.rerender(<DeadlineWorkspace />);
    expect(screen.queryByRole('button', { name: /Remove Due:/ })).not.toBeInTheDocument();
  });

  it('exposes a saved table column chooser', () => {
    render(<DeadlineWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    const chooser = screen.getByRole('dialog', { name: 'Adjust columns' });
    const milestoneCheckbox = within(chooser).getByRole('checkbox', { name: 'Show Milestone column' });
    expect(milestoneCheckbox).toBeVisible();
    expect(milestoneCheckbox.closest('label')?.parentElement).toHaveClass('min-h-11', 'sm:min-h-9');
    fireEvent.click(within(chooser).getByRole('checkbox', { name: 'Show Milestone column' }));
    expect(hooks.preferenceMutation).toHaveBeenCalledWith(expect.objectContaining({
      value: expect.objectContaining({ tableColumnVisibility: expect.objectContaining({ milestone: false }) }),
    }));
  });
});
