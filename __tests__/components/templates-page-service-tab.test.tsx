import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tab=services'),
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
  useActiveWorkspaceId: () => 'tenant-1',
}));
vi.mock('@/components/documents/service-catalog/service-catalog-panel', () => ({
  ServiceCatalogPanel: () => <div>Service catalog content</div>,
}));

import TemplatesPage from '@/app/(dashboard)/template-partials/page';

describe('TemplatesPage service tab', () => {
  it('restores the Services tab from the URL', () => {
    render(<TemplatesPage />);

    expect(screen.getByRole('button', { name: /Services/ })).toHaveClass(
      'text-accent-primary',
    );
    expect(screen.getByText('Service catalog content')).toBeVisible();
  });
});
