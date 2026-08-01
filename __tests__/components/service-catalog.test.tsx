import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookMocks = vi.hoisted(() => ({
  useServiceCatalog: vi.fn(),
  useCreateServiceFamily: vi.fn(),
  useUpdateServiceFamily: vi.fn(),
  useArchiveServiceFamily: vi.fn(),
  useCreateServiceVariant: vi.fn(),
  useUpdateServiceVariant: vi.fn(),
  useArchiveServiceVariant: vi.fn(),
  useAllTemplatePartials: vi.fn(),
}));

vi.mock('@/hooks/use-service-catalog', () => hookMocks);
vi.mock('@/hooks/use-template-partials', () => ({
  useAllTemplatePartials: hookMocks.useAllTemplatePartials,
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { ServiceCatalogPanel } from '@/components/documents/service-catalog/service-catalog-panel';
import { ServiceVariantForm } from '@/components/documents/service-catalog/service-variant-form';

const family = {
  id: 'family-1',
  code: 'ACCOUNTING',
  name: 'Accounting',
  description: null,
  displayOrder: 0,
  isActive: true,
  variants: [{
    id: 'variant-1',
    familyId: 'family-1',
    code: 'MONTHLY_ACCOUNTING',
    name: 'Monthly Accounting',
    description: null,
    serviceCadence: 'MONTHLY' as const,
    customCadenceLabel: null,
    displayOrder: 0,
    version: 1,
    isActive: true,
    sowPartial: {
      id: 'partial-1',
      name: 'accounting-sow',
      displayName: 'Accounting SOW',
      version: 1,
      placeholders: [],
    },
    feeTemplates: [],
  }],
};

function mutation() {
  return { mutateAsync: vi.fn(), isPending: false };
}

describe('ServiceCatalogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookMocks.useServiceCatalog.mockReturnValue({
      data: { families: [family], total: 1 },
      isLoading: false,
      error: null,
    });
    hookMocks.useAllTemplatePartials.mockReturnValue({
      data: {
        partials: [
          {
            id: 'partial-1',
            name: 'accounting-sow',
            displayName: 'Accounting SOW',
          },
        ],
      },
      isLoading: false,
    });
    hookMocks.useCreateServiceFamily.mockReturnValue(mutation());
    hookMocks.useUpdateServiceFamily.mockReturnValue(mutation());
    hookMocks.useArchiveServiceFamily.mockReturnValue(mutation());
    hookMocks.useCreateServiceVariant.mockReturnValue(mutation());
    hookMocks.useUpdateServiceVariant.mockReturnValue(mutation());
    hookMocks.useArchiveServiceVariant.mockReturnValue(mutation());
  });

  it('shows catalog actions and opens the variant form', () => {
    render(
      <ServiceCatalogPanel
        workspaceId="tenant-1"
        canCreate
        canUpdate
        canDelete
      />,
    );

    expect(screen.getByRole('heading', { name: 'Service catalog' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add service family' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
    expect(screen.getByLabelText('SOW partial')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add fee row' })).toBeVisible();
  });

  it('hides mutation actions for read-only users', () => {
    render(
      <ServiceCatalogPanel
        workspaceId="tenant-1"
        canCreate={false}
        canUpdate={false}
        canDelete={false}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Add service family' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add variant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit Accounting/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit wording' })).not.toBeInTheDocument();
  });

  it('requests later pages and resets pagination when filters change', () => {
    hookMocks.useServiceCatalog.mockReturnValue({
      data: { families: [family], total: 41 },
      isLoading: false,
      error: null,
    });
    render(
      <ServiceCatalogPanel
        workspaceId="tenant-1"
        canCreate
        canUpdate
        canDelete
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    expect(hookMocks.useServiceCatalog).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ page: 2, limit: 20 }),
    );

    fireEvent.change(screen.getByLabelText('Active state'), {
      target: { value: 'inactive' },
    });
    expect(hookMocks.useServiceCatalog).toHaveBeenLastCalledWith(
      'tenant-1',
      expect.objectContaining({ page: 1, isActive: false }),
    );
  });

  it('renders loading and error states from the catalog query', () => {
    hookMocks.useServiceCatalog.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    const { rerender } = render(
      <ServiceCatalogPanel
        workspaceId="tenant-1"
        canCreate
        canUpdate
        canDelete
      />,
    );
    expect(screen.getByText('Loading service catalog…')).toBeVisible();

    hookMocks.useServiceCatalog.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Catalog unavailable'),
    });
    rerender(
      <ServiceCatalogPanel
        workspaceId="tenant-1"
        canCreate
        canUpdate
        canDelete
      />,
    );
    expect(screen.getByText('Catalog unavailable')).toBeVisible();
  });

  it('returns to the last valid page when archiving shrinks the result set', async () => {
    hookMocks.useServiceCatalog.mockImplementation(
      (_workspaceId: string, filters: { page: number }) => ({
        data: filters.page === 3
          ? { families: [], total: 40 }
          : { families: [family], total: filters.page === 1 ? 41 : 40 },
        isLoading: false,
        error: null,
      }),
    );
    render(
      <ServiceCatalogPanel
        workspaceId="tenant-1"
        canCreate
        canUpdate
        canDelete
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 3' }));

    await waitFor(() => {
      expect(hookMocks.useServiceCatalog).toHaveBeenLastCalledWith(
        'tenant-1',
        expect.objectContaining({ page: 2, limit: 20 }),
      );
    });
    expect(screen.getByText('Accounting')).toBeVisible();
    expect(screen.queryByText('No service offerings found')).not.toBeInTheDocument();
  });
});

describe('ServiceVariantForm', () => {
  it('reorders fee rows and submits their normalized display order', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ServiceVariantForm
        familyId="family-1"
        partials={[
          {
            id: 'partial-1',
            name: 'accounting-sow',
            displayName: 'Accounting SOW',
          },
        ]}
        initialValue={{
          ...family.variants[0],
          feeTemplates: [
            {
              id: 'fee-1',
              description: 'First fee',
              defaultAmount: '100',
              currency: 'SGD',
              billingFrequency: 'MONTHLY',
              customFrequencyLabel: null,
              displayOrder: 0,
            },
            {
              id: 'fee-2',
              description: 'Second fee',
              defaultAmount: '200',
              currency: 'SGD',
              billingFrequency: 'MONTHLY',
              customFrequencyLabel: null,
              displayOrder: 1,
            },
          ],
        }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move fee row 2 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save variant' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        feeTemplates: [
          expect.objectContaining({
            description: 'Second fee',
            displayOrder: 0,
          }),
          expect.objectContaining({
            description: 'First fee',
            displayOrder: 1,
          }),
        ],
      }),
    );
  });
});
