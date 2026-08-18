import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  useActiveWorkspaceId: vi.fn(),
  useServicesWorkspaceSettings: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useSession: mocks.useSession,
}));

vi.mock('@/components/ui/workspace-selector', () => ({
  useActiveWorkspaceId: mocks.useActiveWorkspaceId,
}));

vi.mock('@/hooks/use-services-workspace-settings', () => ({
  useServicesWorkspaceSettings: mocks.useServicesWorkspaceSettings,
}));

vi.mock('@/components/services/admin/catalog/service-catalog-panel', () => ({
  ServiceCatalogPanel: ({
    workspaceId,
    canCreate,
    canUpdate,
    canDelete,
  }: {
    workspaceId: string;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
  }) => (
    <section aria-labelledby="service-catalog-heading">
      <h2 id="service-catalog-heading">Service catalog</h2>
      {canCreate && canUpdate && canDelete ? (
        <button type="button">Add service family</button>
      ) : null}
      <span data-testid="catalog-workspace">{workspaceId}</span>
    </section>
  ),
}));

vi.mock('@/components/services/admin/deadline-rules-panel', () => ({
  DeadlineRulesPanel: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="deadline-rules-content">Deadline rules · {workspaceId}</div>
  ),
}));

vi.mock('@/components/services/admin/business-calendar-panel', () => ({
  BusinessCalendarPanel: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="business-calendar-content">Business calendar · {workspaceId}</div>
  ),
}));

import { ServicesAdminPage } from '@/components/services/admin/services-admin-page';

describe('ServicesAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useActiveWorkspaceId.mockReturnValue('workspace-1');
    mocks.useServicesWorkspaceSettings.mockReturnValue({
      data: { workspaceEnabled: true, deadlineWritesEnabled: true },
      isLoading: false,
      error: null,
    });
    window.history.replaceState({}, '', '/services/admin');
  });

  it('announces a loading state while the session is resolving', () => {
    mocks.useSession.mockReturnValue({ data: undefined, isLoading: true });

    render(<ServicesAdminPage />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading services administration…',
    );
  });

  it('does not render catalog controls for non-admin users', () => {
    mocks.useSession.mockReturnValue({
      data: { isSuperAdmin: false, isWorkspaceAdmin: false },
      isLoading: false,
    });

    render(<ServicesAdminPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tenant Admin access is required',
    );
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add service family' })).not.toBeInTheDocument();
  });

  it('explains when an administrator has no active workspace', () => {
    mocks.useSession.mockReturnValue({
      data: { isSuperAdmin: true, isWorkspaceAdmin: false },
      isLoading: false,
    });
    mocks.useActiveWorkspaceId.mockReturnValue(undefined);

    render(<ServicesAdminPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Select a workspace to administer services.',
    );
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it.each([
    { isSuperAdmin: false, isWorkspaceAdmin: true },
    { isSuperAdmin: true, isWorkspaceAdmin: false },
  ])('renders catalog administration for an authorized session', (roles) => {
    mocks.useSession.mockReturnValue({ data: roles, isLoading: false });

    render(<ServicesAdminPage />);

    expect(
      screen.getByRole('heading', { name: 'Services administration' }),
    ).toBeVisible();
    expect(screen.getByRole('tablist', { name: 'Services administration sections' })).toBeVisible();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    const catalogTab = screen.getByRole('tab', { name: 'Service catalog' });
    expect(catalogTab).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(catalogTab).toHaveAttribute('aria-controls', 'service-catalog-panel');
    expect(screen.getByRole('tabpanel', { name: 'Service catalog' })).toHaveAttribute(
      'id',
      'service-catalog-panel',
    );
    expect(screen.getByRole('heading', { name: 'Service catalog' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add service family' })).toBeVisible();
    expect(screen.getByTestId('catalog-workspace')).toHaveTextContent('workspace-1');
  });

  it('preserves the selected administration section in the URL', async () => {
    mocks.useSession.mockReturnValue({
      data: { isSuperAdmin: false, isWorkspaceAdmin: true },
      isLoading: false,
    });

    render(<ServicesAdminPage />);
    const rulesTab = screen.getByRole('tab', { name: 'Deadline rules' });
    expect(rulesTab).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(rulesTab);

    await waitFor(() => {
      expect(window.location.search).toContain('tab=rules');
      expect(rulesTab).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getByTestId('deadline-rules-content')).toHaveTextContent('workspace-1');
  });
});
