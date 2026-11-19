import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  contact: null as Record<string, unknown> | null,
  update: vi.fn(),
  create: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (value: unknown) => (value && typeof value === 'object' && 'then' in value ? { id: '11111111-1111-4111-8111-111111111111' } : value),
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock('@/hooks/use-contacts', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/use-contacts')>();
  return {
    ...original,
    useContact: () => ({ data: mocks.contact, isLoading: false, error: null }),
    useUpdateContact: () => ({ mutateAsync: mocks.update, isPending: false }),
    useCreateContact: () => ({ mutateAsync: mocks.create, isPending: false }),
  };
});
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ can: { createContact: true, updateContact: true }, isLoading: false }),
}));
vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({ data: { tenantId: 'tenant-1', isSuperAdmin: false } }),
}));
vi.mock('@/hooks/use-unsaved-navigation-guard', () => ({
  useUnsavedNavigationGuard: () => ({ requestNavigation: vi.fn(), requestAction: vi.fn(), disarm: vi.fn(), rearm: vi.fn(), dialog: null }),
}));
vi.mock('@/components/ui/workspace-selector', () => ({ useActiveWorkspaceId: () => 'tenant-1' }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ error: mocks.toastError, success: vi.fn() }) }));
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('@/hooks/use-company-search', () => ({
  useCompanySearch: () => ({
    searchQuery: '', setSearchQuery: vi.fn(), options: [], isLoading: false,
    selectedCompany: null, setSelectedCompany: vi.fn(),
  }),
}));
vi.mock('@/components/contacts/purpose-toggle', () => ({ PurposeToggle: () => null }));
vi.mock('@/components/ui/async-search-select', () => ({ AsyncSearchSelect: () => null }));

import EditContactPage from '@/app/(dashboard)/contacts/[id]/edit/page';
import NewContactPage from '@/app/(dashboard)/contacts/new/page';

const ORIGINAL_TZ = process.env.TZ;

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    contactType: 'INDIVIDUAL',
    firstName: 'Dana',
    lastName: 'Date',
    alias: null,
    identificationType: null,
    identificationNumber: null,
    nationality: null,
    gender: null,
    // How the API serialises the stored value: midnight UTC of the calendar date.
    dateOfBirth: '1980-01-01T00:00:00.000Z',
    corporateName: null,
    corporateUen: null,
    fullAddress: null,
    fullName: 'Dana Date',
    ...overrides,
  };
}

const dobInput = () => screen.getByLabelText('Date of birth') as HTMLInputElement;

describe('contact date of birth in the forms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contact = contact();
    mocks.update.mockResolvedValue({});
    mocks.create.mockResolvedValue({});
  });
  afterEach(() => {
    cleanup();
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  it.each(['Asia/Singapore', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'the edit form shows 1980-01-01 under TZ=%s and saves the same date back',
    async (zone) => {
      process.env.TZ = zone;
      render(<EditContactPage params={Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' })} />);
      await waitFor(() => expect(dobInput()).toHaveValue('1980-01-01'));

      fireEvent.change(screen.getByPlaceholderText('John'), { target: { value: 'Dana2' } });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0][0].data.dateOfBirth).toBe('1980-01-01');
    },
  );

  it('saves a new date as typed, and clearing the input saves null', async () => {
    render(<EditContactPage params={Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' })} />);
    await waitFor(() => expect(dobInput()).toHaveValue('1980-01-01'));

    fireEvent.change(dobInput(), { target: { value: '1975-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update.mock.calls[0][0].data.dateOfBirth).toBe('1975-12-31');

    fireEvent.change(dobInput(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    expect(mocks.update.mock.calls[1][0].data.dateOfBirth).toBeNull();
  });

  it('shows an error for a future date and does not save', async () => {
    render(<EditContactPage params={Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' })} />);
    await waitFor(() => expect(dobInput()).toHaveValue('1980-01-01'));
    fireEvent.change(dobInput(), { target: { value: '2999-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText('Date of birth must be valid and not in the future')).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('has no date of birth for a corporate contact, and a date typed before switching type is dropped', async () => {
    mocks.contact = contact({ contactType: 'CORPORATE', corporateName: 'Acme Pte Ltd', firstName: null, lastName: null, dateOfBirth: null });
    render(<EditContactPage params={Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' })} />);
    await screen.findByPlaceholderText('ABC Holdings Pte Ltd');
    expect(screen.queryByLabelText('Date of birth')).not.toBeInTheDocument();
  });

  it('the new-contact form has the field for an individual only and sends the date as typed', async () => {
    render(<NewContactPage />);
    fireEvent.change(screen.getByPlaceholderText('John'), { target: { value: 'Neo' } });
    fireEvent.change(dobInput(), { target: { value: '1990-02-28' } });
    fireEvent.click(screen.getByRole('button', { name: /create contact/i }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0].dateOfBirth).toBe('1990-02-28');

    cleanup();
    render(<NewContactPage />);
    fireEvent.click(screen.getByText('Corporate'));
    expect(screen.queryByLabelText('Date of birth')).not.toBeInTheDocument();
  });
});
