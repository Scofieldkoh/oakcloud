import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { candidatesResponse, jsonResponse } from '../helpers/sentroweb-ui-fixtures';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  shortcuts: [] as Array<{ key: string; ctrl?: boolean; handler: () => void; description: string }>,
  can: { updateCompany: true, updateDocument: true, deleteCompany: false } as Record<string, boolean>,
  activeTab: 'profile',
  setActiveTab: vi.fn(),
  success: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({
  useKeyboardShortcuts: (shortcuts: typeof mocks.shortcuts) => {
    mocks.shortcuts = shortcuts;
  },
}));
vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({ data: { isSuperAdmin: false, tenantId: 'tenant-1' } }),
}));
vi.mock('@/hooks/use-companies', () => ({
  useCompany: () => ({
    data: { id: 'company-1', name: 'Acme Pte Ltd', uen: '201900001A', status: 'LIVE', entityType: 'PRIVATE_COMPANY_LIMITED_BY_SHARES', financialYearEndMonth: 12, _count: {} },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCompanyBizFile: () => ({ data: null }),
  useDeleteCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetrieveAcra: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-contact-details', () => ({
  useCompanyContactDetails: () => ({ data: { hasPoc: true }, refetch: vi.fn() }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ can: mocks.can }),
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: mocks.success, error: vi.fn() }),
}));
vi.mock('@/components/notes/internal-notes', () => ({ InternalNotes: () => null }));
vi.mock('@/components/companies/company-detail', async () => {
  const action = await import('@/components/companies/company-detail/sentroweb-check-action');
  return {
    SentrowebCheckAction: action.SentrowebCheckAction,
    CompanyProfileTab: () => <div>profile tab</div>,
    ContactDetailsTab: () => null,
    CompanyServicesTab: () => null,
    CompanyScreeningTab: ({ initialRunId }: { initialRunId?: string | null }) => <div>screening tab {initialRunId}</div>,
    CompanyTabs: () => null,
    useTabState: () => [mocks.activeTab, mocks.setActiveTab],
  };
});

import CompanyDetailPage from '@/app/(dashboard)/companies/[id]/page';

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <CompanyDetailPage params={Promise.resolve({ id: 'company-1' })} />
      </QueryClientProvider>,
    );
  });
}

describe('company detail page: Sentroweb check action', () => {
  beforeEach(() => {
    mocks.can = { updateCompany: true, updateDocument: true, deleteCompany: false };
    mocks.activeTab = 'profile';
    mocks.shortcuts = [];
    mocks.setActiveTab.mockReset();
    mocks.success.mockReset();
    mocks.searchParams = new URLSearchParams();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('is hidden, and has no F4 shortcut, without updateCompany', async () => {
    mocks.can = { updateCompany: false, updateDocument: true, deleteCompany: false };
    await renderPage();

    expect(await screen.findByRole('link', { name: 'Back to Companies' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sentroweb check' })).not.toBeInTheDocument();
    expect(mocks.shortcuts.find((shortcut) => shortcut.key === 'F4')).toBeUndefined();
  });

  it('shows the action with updateCompany and opens the dialog from the button and from F4', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(candidatesResponse(2))));
    await renderPage();

    const button = await screen.findByRole('button', { name: 'Sentroweb check' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(await screen.findByRole('dialog', { name: 'Sentroweb check' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const f4 = mocks.shortcuts.find((shortcut) => shortcut.key === 'F4');
    expect(f4?.description).toBe('Sentroweb check');
    act(() => f4?.handler());
    expect(await screen.findByRole('dialog', { name: 'Sentroweb check' })).toBeInTheDocument();
  });

  it('closes the dialog, toasts and switches to the Screening tab after the check starts', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? jsonResponse({ runId: 'run-77' }, 202) : jsonResponse(candidatesResponse(2)),
    );
    vi.stubGlobal('fetch', fetchMock);
    await renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Sentroweb check' }));
    await screen.findByRole('checkbox', { name: 'Person 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Run check' }));

    await waitFor(() => expect(mocks.setActiveTab).toHaveBeenCalledWith('screening'));
    expect(mocks.success).toHaveBeenCalledWith('Sentroweb check started');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('renders the Screening tab when it is the active tab', async () => {
    mocks.activeTab = 'screening';
    await renderPage();
    expect(await screen.findByText('screening tab')).toBeInTheDocument();
  });
});
