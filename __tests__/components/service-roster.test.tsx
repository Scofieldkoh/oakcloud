import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceRosterItem } from '@/services/service-roster';

const hooks = vi.hoisted(() => ({
  useServiceRoster: vi.fn(),
  useUserPreference: vi.fn(),
  useUpsertUserPreference: vi.fn(),
  useServiceCatalog: vi.fn(),
  useServiceRosterFamilies: vi.fn(),
}));
const servicesSettingsMock = vi.hoisted(() => ({ useServicesWorkspaceSettings: vi.fn() }));

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/services',
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

vi.mock('@/hooks/use-service-roster', () => ({ useServiceRoster: hooks.useServiceRoster }));
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreference: hooks.useUserPreference,
  useUpsertUserPreference: hooks.useUpsertUserPreference,
}));
vi.mock('@/hooks/use-service-catalog', () => ({ useServiceCatalog: hooks.useServiceCatalog }));
vi.mock('@/hooks/use-service-roster-families', () => ({ useServiceRosterFamilies: hooks.useServiceRosterFamilies }));
vi.mock('@/hooks/use-services-workspace-settings', () => servicesSettingsMock);
vi.mock('@/hooks/use-all-company-options', () => ({
  useAllCompanyOptions: () => ({ data: [], isLoading: false, error: null }),
  useCompanyOptionsPage: () => ({ data: { options: [], hasMore: false, page: 0 }, isLoading: false, error: null }),
}));
vi.mock('@/components/companies/company-detail/client-service-creator', () => ({
  ClientServiceCreator: () => null,
}));
vi.mock('@/components/companies/company-detail/client-service-editor', () => ({
  ClientServiceEditor: () => null,
}));

import { ServiceRoster } from '@/components/services/roster/service-roster';

const family = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Accounting',
  displayColor: '#3F6DA8',
};

const rosterItem: ServiceRosterItem = {
  id: '44444444-4444-4444-8444-444444444444',
  companyId: '22222222-2222-4222-8222-222222222222',
  agreementId: null,
  agreementItemId: null,
  serviceVariantId: '55555555-5555-4555-8555-555555555555',
  company: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Oaktree Accounting & Corporate Solution Pte. Ltd.',
    displayAlias: null,
    displayLabel: 'OACS',
    uen: '202600001A',
  },
  family,
  familyName: family.name,
  familyDisplayColor: family.displayColor,
  variant: {
    id: '55555555-5555-4555-8555-555555555555',
    code: 'ACCT-001',
    name: 'Monthly accounting',
    version: 1,
    serviceCadence: 'MONTHLY',
    customCadenceLabel: null,
  },
  serviceVariant: {
    id: '55555555-5555-4555-8555-555555555555',
    code: 'ACCT-001',
    name: 'Monthly accounting',
    version: 1,
    serviceCadence: 'MONTHLY',
    customCadenceLabel: null,
  },
  service: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Monthly accounting',
    source: 'MANUAL',
    status: 'ACTIVE',
    cadence: 'MONTHLY',
    serviceCadence: 'MONTHLY',
    customCadenceLabel: null,
    startDate: '2026-01-01',
    endDate: null,
  },
  serviceName: 'Monthly accounting',
  status: 'ACTIVE',
  cadence: 'MONTHLY',
  serviceCadence: 'MONTHLY',
  customCadenceLabel: null,
  startDate: '2026-01-01',
  endDate: null,
  source: 'MANUAL',
  hasRuleWarning: false,
  nextDeadline: null,
  applicability: {
    state: null,
    applicabilityState: null,
    hasWarning: false,
    ruleCount: 0,
    applicableCount: 0,
    notApplicableCount: 0,
    missingInputCount: 0,
    reasons: [],
  },
  applicabilityState: null,
  ruleWarning: {
    state: null,
    applicabilityState: null,
    hasWarning: false,
    ruleCount: 0,
    applicableCount: 0,
    notApplicableCount: 0,
    missingInputCount: 0,
    reasons: [],
  },
  warning: {
    state: null,
    applicabilityState: null,
    hasWarning: false,
    ruleCount: 0,
    applicableCount: 0,
    notApplicableCount: 0,
    missingInputCount: 0,
    reasons: [],
  },
  billingDisposition: 'CONFIGURED',
  billingCoverageIssue: null,
  nextBilling: {
    status: 'OPEN',
    expectedDate: '2026-08-31',
    timingState: 'UPCOMING',
  },
  updatedAt: '2026-08-18T00:00:00.000Z',
};

const advisoryFamily = {
  id: '66666666-6666-4666-8666-666666666666',
  name: 'Advisory',
  displayColor: '#B85C38',
};

function setup() {
  navigation.searchParams = new URLSearchParams();
  navigation.replace.mockReset();
  hooks.useServiceRoster.mockReturnValue({
    data: { items: [rosterItem], total: 1, page: 1, limit: 20, totalPages: 1 },
    isLoading: false,
    isFetching: false,
    error: null,
  });
  hooks.useUserPreference.mockReturnValue({ data: { value: null }, isLoading: false });
  hooks.useUpsertUserPreference.mockReturnValue({ mutate: vi.fn(), isPending: false });
  hooks.useServiceCatalog.mockReturnValue({ data: { families: [{ ...family, variants: [] }], total: 1 }, isLoading: false });
  hooks.useServiceRosterFamilies.mockReturnValue({ data: [family, advisoryFamily], isLoading: false, error: null });
  servicesSettingsMock.useServicesWorkspaceSettings.mockReturnValue({ data: { workspaceEnabled: true, deadlineWritesEnabled: true }, isLoading: false, error: null });
}

describe('ServiceRoster', () => {
  it('renders billing as its own roster column without duplicating it in Warnings', () => {
    setup();
    render(<ServiceRoster workspaceId="workspace-1" />);

    const table = screen.getByRole('table', { name: 'Services roster table' });
    expect(within(table).getByRole('columnheader', { name: 'Billing' })).toBeVisible();
    const rows = within(table).getAllByRole('row');
    const cells = rows.at(-1)?.querySelectorAll('td');
    expect(cells).toBeDefined();
    expect(cells?.[7]).not.toHaveTextContent('Configured');
    expect(cells?.[8]).toHaveTextContent('Open · Upcoming');
  });

  it('hides the historical trigger when workspace writes are disabled', () => {
    setup();
    servicesSettingsMock.useServicesWorkspaceSettings.mockReturnValue({ data: { workspaceEnabled: true, deadlineWritesEnabled: false }, isLoading: false, error: null });
    render(<ServiceRoster workspaceId="workspace-1" canEdit />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Actions for Monthly accounting' })[0]);
    expect(screen.queryByText('Trigger historical cycle')).not.toBeInTheDocument();
  });

  it('keeps the historical trigger hidden while workspace settings load', () => {
    setup();
    servicesSettingsMock.useServicesWorkspaceSettings.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<ServiceRoster workspaceId="workspace-1" canEdit />);
    expect(screen.queryByText('Trigger historical cycle')).not.toBeInTheDocument();
  });

  it('places family filters beside Active, Paused, and Ended in one Service filters group', () => {
    setup();
    render(<ServiceRoster workspaceId="workspace-1" />);

    const toolbar = screen.getByRole('group', { name: 'Service filters' });
    expect(within(toolbar).getByRole('button', { name: 'Active' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Paused' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Ended' })).toBeVisible();
    expect(within(toolbar).getByRole('button', { name: 'Accounting' })).toBeVisible();
    expect(screen.queryByText('Filter families')).not.toBeInTheDocument();
  });

  it('uses alternating rows and full company names with display labels', () => {
    setup();
    render(<ServiceRoster workspaceId="workspace-1" />);

    expect(screen.getAllByText('OACS')[0]).toBeVisible();
    expect(screen.getAllByText('Oaktree Accounting & Corporate Solution Pte. Ltd.')[0]).toBeVisible();
    expect(screen.getAllByRole('row')[2]).toHaveClass('bg-oak-row-alt');
  });

  it('shows text and an accent cue for a selected family chip', () => {
    setup();
    render(<ServiceRoster workspaceId="workspace-1" />);

    const familyChip = screen.getByRole('button', { name: 'Accounting' });
    expect(familyChip).toHaveAttribute('aria-pressed', 'false');
    expect(familyChip.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(familyChip).toHaveStyle({ '--family-color': '#3F6DA8' });
    fireEvent.click(familyChip);
    expect(hooks.useServiceRoster).toHaveBeenLastCalledWith(
      expect.objectContaining({ familyIds: [family.id] }),
    );
  });

  it('keeps complete family options when the current roster page is filtered', () => {
    setup();
    render(<ServiceRoster workspaceId="workspace-1" />);

    expect(screen.getByRole('button', { name: 'Advisory' })).toBeVisible();
  });

  it('does not fall back to page-local families when facets fail and offers retry', () => {
    setup();
    const refetch = vi.fn();
    hooks.useServiceRosterFamilies.mockReturnValue({ data: undefined, isLoading: false, error: new Error('facet unavailable'), refetch });
    render(<ServiceRoster workspaceId="workspace-1" />);

    expect(screen.queryByRole('button', { name: 'Accounting' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert', { name: 'Family filters unavailable' })).toHaveTextContent('facet unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry family filters' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('routes inline filters to the canonical server query and resets the page', () => {
    setup();
    navigation.searchParams = new URLSearchParams('page=3');
    render(<ServiceRoster workspaceId="workspace-1" />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter company' }), { target: { value: 'Oaktree' } });

    expect(hooks.useServiceRoster).toHaveBeenLastCalledWith(expect.objectContaining({
      companyQuery: 'Oaktree',
      page: 1,
    }));
    expect(navigation.replace).toHaveBeenCalledWith('/services?page=1&companyQuery=Oaktree', { scroll: false });
  });

  it('synchronizes roster requests when browser navigation changes the URL', () => {
    setup();
    const view = render(<ServiceRoster workspaceId="workspace-1" />);
    navigation.searchParams = new URLSearchParams('page=2&statuses=PAUSED&familyQuery=Advisory');
    view.rerender(<ServiceRoster workspaceId="workspace-1" />);

    expect(hooks.useServiceRoster).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 2,
      statuses: ['PAUSED'],
      familyQuery: 'Advisory',
    }));
  });

  it('restores and exposes the complete table preference controls', () => {
    setup();
    hooks.useUserPreference.mockReturnValue({
      data: {
        value: {
          version: 1,
          columnWidths: { company: 340 },
          columnOrder: ['service', 'company'],
          columnVisibility: { family: false },
          sortBy: 'service',
          sortOrder: 'desc',
          pageSize: 50,
        },
      },
      isLoading: false,
    });
    render(<ServiceRoster workspaceId="workspace-1" />);

    expect(screen.getByRole('combobox', { name: 'Per page:' })).toHaveValue('50');
    expect(screen.queryByRole('option', { name: '200' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Customize columns' }));
    expect(screen.getByRole('button', { name: 'Customize columns' })).toHaveClass('min-h-11');
    const familyCheckbox = screen.getByRole('checkbox', { name: 'Show Family column' });
    expect(familyCheckbox).not.toBeChecked();
    expect(familyCheckbox.closest('label')).toHaveClass('self-stretch', 'min-h-11');
    expect(screen.getByRole('button', { name: 'Move Service column down' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Move Service column down' })).toHaveClass('min-h-11', 'min-w-11');
  });

  it('writes resized widths after pointer release instead of every pointer move', async () => {
    setup();
    const mutate = vi.fn();
    hooks.useUpsertUserPreference.mockReturnValue({ mutate, isPending: false });
    render(<ServiceRoster workspaceId="workspace-1" />);

    const resize = screen.getByRole('button', { name: 'Resize Company column' });
    fireEvent.pointerDown(resize, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 180 });
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { clientX: 180 });

    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      key: 'services.roster.table.v1',
      value: expect.objectContaining({ version: 1, columnWidths: expect.objectContaining({ company: 310 }) }),
    })));
  });

  it('merges newer table actions into a pending resize save', () => {
    vi.useFakeTimers();
    try {
      setup();
      const mutate = vi.fn();
      hooks.useUpsertUserPreference.mockReturnValue({ mutate, isPending: false });
      render(<ServiceRoster workspaceId="workspace-1" />);

      const resize = screen.getByRole('button', { name: 'Resize Company column' });
      fireEvent.pointerDown(resize, { clientX: 100 });
      fireEvent.pointerMove(window, { clientX: 180 });
      fireEvent.pointerUp(window, { clientX: 180 });

      fireEvent.click(screen.getByRole('button', { name: 'Customize columns' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Show Family column' }));
      fireEvent.click(screen.getByRole('button', { name: 'Move Company column down' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sort by Service' }));
      fireEvent.change(screen.getByRole('combobox', { name: 'Per page:' }), { target: { value: '50' } });

      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(mutate).toHaveBeenLastCalledWith(expect.objectContaining({
        value: expect.objectContaining({
          columnWidths: expect.objectContaining({ company: 310 }),
          columnVisibility: expect.objectContaining({ family: false }),
          columnOrder: expect.arrayContaining(['family', 'company']),
          sortBy: 'service',
          pageSize: 50,
        }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('persists visibility, order, sorting, and page-size changes in the versioned preference', () => {
    setup();
    const mutate = vi.fn();
    hooks.useUpsertUserPreference.mockReturnValue({ mutate, isPending: false });
    render(<ServiceRoster workspaceId="workspace-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Customize columns' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Family column' }));
    expect(mutate).toHaveBeenLastCalledWith(expect.objectContaining({
      value: expect.objectContaining({ version: 1, columnVisibility: expect.objectContaining({ family: false }) }),
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Move Company column down' }));
    expect(mutate).toHaveBeenLastCalledWith(expect.objectContaining({
      value: expect.objectContaining({ columnOrder: expect.arrayContaining(['family', 'company']) }),
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Service' }));
    expect(mutate).toHaveBeenLastCalledWith(expect.objectContaining({
      value: expect.objectContaining({ sortBy: 'service', sortOrder: 'asc' }),
    }));

    fireEvent.change(screen.getByRole('combobox', { name: 'Per page:' }), { target: { value: '50' } });
    expect(mutate).toHaveBeenLastCalledWith(expect.objectContaining({
      value: expect.objectContaining({ pageSize: 50 }),
    }));
  });
});
