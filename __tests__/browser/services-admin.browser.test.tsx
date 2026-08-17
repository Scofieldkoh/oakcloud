import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { page, userEvent } from 'vitest/browser';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ServicesAdminPage } from '@/components/services/admin/services-admin-page';
import { ToastProvider } from '@/components/ui/toast';
import '@/app/globals.css';

const session = {
  user: {
    id: 'user-1',
    email: 'admin@example.com',
    firstName: 'Tenant',
    lastName: 'Admin',
    tenantId: 'workspace-1',
    workspaceId: 'workspace-1',
    internalRole: 'ADMIN',
    isAdmin: true,
    isManager: false,
    isStaff: false,
    isSuperAdmin: false,
    isWorkspaceAdmin: true,
    companyIds: [],
  },
  permissions: [],
  internalRole: 'ADMIN',
  isAdmin: true,
  isManager: false,
  isStaff: false,
  isSuperAdmin: false,
  isWorkspaceAdmin: true,
};

const family = {
  id: 'family-1',
  code: 'ACCOUNTING',
  name: 'Accounting',
  description: 'Accounting services',
  displayColor: '#2F6F5E',
  displayOrder: 0,
  isActive: true,
  variants: [],
};

const json = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json' } },
);

async function waitUntil(check: () => boolean, timeout = 4000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for Services administration UI');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

describe('Services administration browser surface', () => {
  let host: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;
  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  beforeEach(() => {
    host = document.createElement('div');
    document.body.replaceChildren(host);
    root = createRoot(host);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/session')) return json(session);
      if (url.includes('/api/service-catalog?')) return json({ families: [family], total: 1 });
      if (url.includes('/api/template-partials?')) return json({ partials: [] });
      return json({});
    }));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    host.remove();
    vi.unstubAllGlobals();
  });

  async function mount() {
    await act(async () => {
      root.render(
        <ToastProvider>
          <QueryClientProvider client={queryClient}>
            <ServicesAdminPage />
          </QueryClientProvider>
        </ToastProvider>,
      );
    });
    await waitUntil(() => Boolean(screen.queryByRole('heading', { name: 'Services administration' })));
    await waitUntil(() => Boolean(screen.queryByText('Accounting')));
  }

  it('separates the header, named tab bar, controlled catalog panel, and family color controls', async () => {
    await page.viewport(1440, 900);
    await mount();

    const heading = screen.getByRole('heading', { name: 'Services administration' });
    const tabs = screen.getByRole('tablist', { name: 'Services administration sections' });
    const catalogTab = screen.getByRole('tab', { name: 'Service catalog' });
    const catalogPanel = screen.getByRole('tabpanel', { name: 'Service catalog' });
    await expect.element(heading).toBeVisible();
    await expect.element(tabs).toBeVisible();
    await expect.element(catalogTab).toBeVisible();
    await expect.element(catalogPanel).toBeVisible();
    await expect.element(screen.getByRole('heading', { name: 'Service catalog' })).toBeVisible();
    expect(catalogTab).toHaveAttribute('aria-selected', 'true');
    expect(catalogTab).toHaveAttribute('aria-controls', 'service-catalog-panel');
    expect(catalogPanel).toHaveAttribute('aria-labelledby', 'service-catalog-tab');
    await expect.element(screen.getByText('Accounting')).toBeVisible();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Add service family' }));
    });
    await waitUntil(() => Boolean(screen.queryByRole('dialog', { name: 'Add service family' })));
    await expect.element(screen.getByRole('dialog', { name: 'Add service family' })).toBeVisible();
    const color = screen.getByLabelText('Display color');
    await expect.element(color).toBeVisible();
    expect(color).toHaveAttribute('type', 'color');
    expect(color).toHaveAccessibleDescription(
      'Used for family badges, filters, table accents, and calendar events.',
    );
    await expect.element(screen.getByText('Family color preview')).toBeVisible();
    await act(async () => {
      await userEvent.fill(screen.getByLabelText('Family name'), 'Payroll');
    });
    await expect.element(screen.getByText('Payroll')).toBeVisible();
  });

  it('keeps the administration surface readable at a mobile viewport', async () => {
    await page.viewport(390, 844);
    await mount();

    const main = screen.getByRole('main');
    const tablist = screen.getByRole('tablist', { name: 'Services administration sections' });
    expect(main.className).toContain('p-4');
    expect(main.className).toContain('sm:p-6');
    expect(tablist.className).toContain('flex-wrap');
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
    const addFamily = screen.getByRole('button', { name: 'Add service family' });
    expect(addFamily.getBoundingClientRect().height).toBeGreaterThanOrEqual(40);
  });
});
