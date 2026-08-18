import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useServicesWorkspaceSettings: vi.fn(),
  useServiceRoster: vi.fn(),
  useServiceCatalog: vi.fn(),
}));

vi.mock('@/hooks/use-services-workspace-settings', () => ({
  useServicesWorkspaceSettings: mocks.useServicesWorkspaceSettings,
}));
vi.mock('@/hooks/use-service-roster', () => ({ useServiceRoster: mocks.useServiceRoster }));
vi.mock('@/hooks/use-service-catalog', () => ({ useServiceCatalog: mocks.useServiceCatalog }));
vi.mock('@/hooks/use-user-preferences', () => ({
  useUserPreference: () => ({ data: { value: null }, isLoading: false }),
  useUpsertUserPreference: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-all-company-options', () => ({
  useAllCompanyOptions: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('@/components/companies/company-detail/client-service-creator', () => ({ ClientServiceCreator: () => null }));
vi.mock('@/components/companies/company-detail/client-service-editor', () => ({ ClientServiceEditor: () => null }));

import { ServicesWorkspace } from '@/components/services/services-workspace';

describe('ServicesWorkspace', () => {
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
    mocks.useServiceCatalog.mockReturnValue({ data: { families: [], total: 0 }, isLoading: false });

    render(<ServicesWorkspace />);

    expect(screen.getByRole('heading', { name: 'Services' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Services' })).toHaveAttribute('aria-selected', 'true');
    expect(mocks.useServiceRoster).toHaveBeenCalled();
  });
});
