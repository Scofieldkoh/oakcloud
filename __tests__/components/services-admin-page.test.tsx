import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  useActiveWorkspaceId: vi.fn(),
}));

vi.mock('@/hooks/use-auth', () => ({
  useSession: mocks.useSession,
}));

vi.mock('@/components/ui/workspace-selector', () => ({
  useActiveWorkspaceId: mocks.useActiveWorkspaceId,
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

import { ServicesAdminPage } from '@/components/services/admin/services-admin-page';

describe('ServicesAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useActiveWorkspaceId.mockReturnValue('workspace-1');
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
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Service catalog' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Service catalog' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add service family' })).toBeVisible();
    expect(screen.getByTestId('catalog-workspace')).toHaveTextContent('workspace-1');
  });
});
