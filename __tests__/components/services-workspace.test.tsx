import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useServicesWorkspaceSettings: vi.fn(),
  useServiceRoster: vi.fn(),
  useServiceCatalog: vi.fn(),
  useServiceRosterFamilies: vi.fn(),
  deadlineWorkspace: vi.fn(),
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

vi.mock('@/hooks/use-services-workspace-settings', () => ({
  useServicesWorkspaceSettings: mocks.useServicesWorkspaceSettings,
}));
vi.mock('@/hooks/use-service-roster', () => ({ useServiceRoster: mocks.useServiceRoster }));
vi.mock('@/hooks/use-service-roster-families', () => ({ useServiceRosterFamilies: mocks.useServiceRosterFamilies }));
vi.mock('@/hooks/use-service-catalog', () => ({ useServiceCatalog: mocks.useServiceCatalog }));
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreference: () => ({ data: { value: null }, isLoading: false }),
  useUpsertUserPreference: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-all-company-options', () => ({
  useAllCompanyOptions: () => ({ data: [], isLoading: false, error: null }),
  useCompanyOptionsPage: () => ({ data: { options: [], hasMore: false, page: 0 }, isLoading: false, error: null }),
}));
vi.mock('@/components/companies/company-detail/client-service-creator', () => ({ ClientServiceCreator: () => null }));
vi.mock('@/components/companies/company-detail/client-service-editor', () => ({ ClientServiceEditor: () => null }));
vi.mock('@/components/services/deadlines/deadline-workspace', () => ({
  DeadlineWorkspace: (props: { deadlineWritesEnabled?: boolean }) => {
    mocks.deadlineWorkspace(props);
    return <div aria-label="Deadline workspace stub" />;
  },
}));

import { ServicesWorkspace } from '@/components/services/services-workspace';

describe('ServicesWorkspace', () => {
  beforeEach(() => {
    navigation.searchParams = new URLSearchParams();
    navigation.replace.mockReset();
    mocks.deadlineWorkspace.mockReset();
  });

  it('renders a compact unavailable state and does not query the roster when disabled', () => {
    mocks.useServicesWorkspaceSettings.mockReturnValue({
      data: { workspaceEnabled: false, deadlineWritesEnabled: false },
      isLoading: false,
      error: null,
    });

    render(<ServicesWorkspace />);

    expect(screen.getByRole('status')).toHaveTextContent(/services workspace is unavailable/i);
    expect(mocks.useServiceRoster).not.toHaveBeenCalled();
  });

  it('renders Services roster for an enabled workspace', () => {
    mocks.useServicesWorkspaceSettings.mockReturnValue({
      data: { workspaceEnabled: true, deadlineWritesEnabled: false },
      isLoading: false,
      error: null,
    });
    mocks.useServiceRoster.mockReturnValue({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, isLoading: false, isFetching: false, error: null });
    mocks.useServiceRosterFamilies.mockReturnValue({ data: [], isLoading: false, error: null });
    mocks.useServiceCatalog.mockReturnValue({ data: { families: [], total: 0 }, isLoading: false });

    render(<ServicesWorkspace />);

    expect(screen.getByRole('heading', { name: 'Services' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'true');
    expect(mocks.useServiceRoster).toHaveBeenCalled();
  });

  it('preserves unrelated query state when switching to Deadlines and passes the write flag', () => {
    navigation.searchParams = new URLSearchParams('tab=services&deadlineView=CALENDAR&from=2026-08-01&to=2026-09-30&foo=keep');
    mocks.useServicesWorkspaceSettings.mockReturnValue({
      data: { workspaceEnabled: true, deadlineWritesEnabled: false },
      isLoading: false,
      error: null,
    });
    mocks.useServiceRoster.mockReturnValue({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, isLoading: false, isFetching: false, error: null });
    mocks.useServiceRosterFamilies.mockReturnValue({ data: [], isLoading: false, error: null });
    mocks.useServiceCatalog.mockReturnValue({ data: { families: [], total: 0 }, isLoading: false });

    const view = render(<ServicesWorkspace />);
    screen.getByRole('tab', { name: 'Deadlines' }).click();

    expect(navigation.replace).toHaveBeenCalledWith(
      expect.stringContaining('tab=deadlines'),
      { scroll: false },
    );
    const destination = navigation.replace.mock.calls.at(-1)?.[0] as string;
    expect(destination).toContain('deadlineView=CALENDAR');
    expect(destination).toContain('from=2026-08-01');
    expect(destination).toContain('foo=keep');
    navigation.searchParams = new URLSearchParams(destination.split('?')[1]);
    view.rerender(<ServicesWorkspace />);
    expect(mocks.deadlineWorkspace).toHaveBeenCalledWith({ deadlineWritesEnabled: false, canEdit: true });
  });
});
