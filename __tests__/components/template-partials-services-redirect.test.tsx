import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));
const pageState = vi.hoisted(() => ({
  searchParams: new URLSearchParams('tab=services'),
  activeTenantId: 'tenant-1' as string | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => pageState.searchParams,
}));

vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({
    data: { tenantId: 'tenant-1', isSuperAdmin: false },
  }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    can: {
      createDocument: true,
      updateDocument: true,
      deleteDocument: true,
    },
  }),
}));

vi.mock('@/components/ui/workspace-selector', () => ({
  useActiveWorkspaceId: () => pageState.activeTenantId,
}));

vi.mock('@/components/services/admin/catalog/service-catalog-panel', () => ({
  ServiceCatalogPanel: () => <div>Service catalog content</div>,
}));

import TemplatesPage from '@/app/(dashboard)/template-partials/page';

describe('TemplatesPage legacy Services tab redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pageState.searchParams = new URLSearchParams('tab=services');
    pageState.activeTenantId = 'tenant-1';
  });

  it('redirects legacy Services URLs without rendering a document tab', () => {
    render(<TemplatesPage />);

    expect(navigation.replace).toHaveBeenCalledWith('/admin/services');
    expect(screen.queryByRole('button', { name: 'Services' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Document Templates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Partials' })).not.toBeInTheDocument();
    expect(screen.queryByText('Service catalog content')).not.toBeInTheDocument();
  });

  it('describes only document templates and reusable partials on the normal page', () => {
    pageState.searchParams = new URLSearchParams('tab=templates');
    pageState.activeTenantId = null;

    render(<TemplatesPage />);

    expect(screen.getByText('Manage document templates and reusable partials.')).toBeVisible();
    expect(screen.queryByText(/service offerings/i)).not.toBeInTheDocument();
  });
});
