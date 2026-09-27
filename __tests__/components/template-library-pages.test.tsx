import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
const pageState = vi.hoisted(() => ({
  activeTenantId: 'tenant-1' as string | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(),
  redirect: navigation.redirect,
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

import TemplateLibraryIndexPage from '@/app/(dashboard)/template-partials/page';
import DocumentTemplatesPage from '@/app/(dashboard)/template-partials/documents/page';
import PartialTemplatesPage from '@/app/(dashboard)/template-partials/partials/page';

async function redirectTargetFor(query: Record<string, string | string[]>) {
  await expect(TemplateLibraryIndexPage({ searchParams: Promise.resolve(query) })).rejects.toThrow('NEXT_REDIRECT');
  return navigation.redirect.mock.calls.at(-1)?.[0];
}

function renderWithProviders(page: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>{page}</ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Document Templates pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pageState.activeTenantId = 'tenant-1';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ templates: [], partials: [], total: 0 }))));
  });

  it('sends the old Document Templates URL and its tabs to the new pages', async () => {
    expect(await redirectTargetFor({})).toBe('/template-partials/documents');
    expect(await redirectTargetFor({ tab: 'templates' })).toBe('/template-partials/documents');
    expect(await redirectTargetFor({ tab: 'partials' })).toBe('/template-partials/partials');
    expect(await redirectTargetFor({ tab: 'services' })).toBe('/admin/services');
  });

  it('shows document templates on their own page without tabs', async () => {
    renderWithProviders(<DocumentTemplatesPage />);

    expect(screen.getByRole('heading', { name: 'Document Templates' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'New Word Template' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Partials' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New Word partial/i })).not.toBeInTheDocument();
  });

  it('shows partials on their own page without tabs', async () => {
    renderWithProviders(<PartialTemplatesPage />);

    expect(screen.getByRole('heading', { name: 'Partials' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'New Word partial' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Document Templates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Word Template' })).not.toBeInTheDocument();
  });
});
