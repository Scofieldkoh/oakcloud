import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  shortcuts: [] as Array<{ key: string; ctrl?: boolean; handler: () => void }>,
  contact: null as Record<string, unknown> | null,
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

vi.mock('@/hooks/use-contacts', () => ({
  useContact: () => ({ data: mocks.contact, isLoading: false, error: null, refetch: vi.fn(), isFetching: false }),
  useDeleteContact: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLinkContactToCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnlinkContactFromCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveOfficerPosition: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveShareholding: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateOfficerPosition: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateShareholding: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useContactLinkInfo: () => ({ data: null }),
}));

vi.mock('@/hooks/use-companies', () => ({
  useCompanies: () => ({ data: { companies: [] }, isLoading: false }),
  useCompany: () => ({ data: null, isLoading: false, error: new Error('missing'), refetch: vi.fn(), isFetching: false }),
  useCompanyBizFile: () => ({ data: null }),
  useDeleteCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetrieveAcra: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-contact-details', () => ({
  useCompanyContactDetails: () => ({ data: null, refetch: vi.fn(), isFetching: false }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    can: {
      createContact: false,
      updateContact: false,
      deleteContact: false,
      updateCompany: false,
      deleteCompany: false,
      updateDocument: false,
    },
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/components/companies/company-detail', () => ({
  CompanyProfileTab: () => null,
  ContactDetailsTab: () => null,
  CompanyTabs: () => null,
  useTabState: () => ['profile', vi.fn()],
}));

vi.mock('@/components/contacts/contact-details-section', () => ({ ContactDetailsSection: () => null }));
vi.mock('@/components/contacts/company-relationships', () => ({ CompanyRelationships: () => null }));
vi.mock('@/components/contacts/contact-aliases-modal', () => ({ ContactAliasesModal: () => null }));
vi.mock('@/components/notes/internal-notes', () => ({ InternalNotes: () => null }));

import ContactDetailPage from '@/app/(dashboard)/contacts/[id]/page';

const ORIGINAL_TZ = process.env.TZ;

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    contactType: 'INDIVIDUAL',
    firstName: 'Dana',
    lastName: 'Date',
    fullName: 'Dana Date',
    alias: null,
    identificationType: null,
    identificationNumber: null,
    nationality: 'Singaporean',
    gender: null,
    dateOfBirth: '1980-01-01T00:00:00.000Z',
    corporateName: null,
    corporateUen: null,
    fullAddress: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    companyRelations: [],
    officerPositions: [],
    shareholdings: [],
    contactDetails: [],
    ...overrides,
  };
}

async function renderDetail() {
  await act(async () => {
    render(<ContactDetailPage params={Promise.resolve({ id: 'contact-1' })} searchParams={Promise.resolve({})} />);
  });
}

describe('contact detail: date of birth', () => {
  beforeEach(() => {
    cleanup();
    mocks.contact = contact();
  });
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  it.each(['Asia/Singapore', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'shows 1 Jan 1980 under TZ=%s',
    async (zone) => {
      process.env.TZ = zone;
      await renderDetail();
      expect(await screen.findByText('Date of birth')).toBeInTheDocument();
      expect(screen.getByText('1 Jan 1980')).toBeInTheDocument();
    },
  );

  it('shows a dash when there is none', async () => {
    mocks.contact = contact({ dateOfBirth: null });
    await renderDetail();
    const label = await screen.findByText('Date of birth');
    expect(label.parentElement).toHaveTextContent('-');
    expect(screen.queryByText('1 Jan 1980')).not.toBeInTheDocument();
  });

  it('has no date of birth row for a corporate contact', async () => {
    mocks.contact = contact({ contactType: 'CORPORATE', corporateName: 'Acme Pte Ltd', fullName: 'Acme Pte Ltd', dateOfBirth: null });
    await renderDetail();
    await screen.findAllByText('Acme Pte Ltd');
    expect(screen.queryByText('Date of birth')).not.toBeInTheDocument();
  });
});
