import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const hooksMock = vi.hoisted(() => ({
  useManualClientServiceCatalogOptions: vi.fn(),
  useCreateManualClientService: vi.fn(),
  isHttpRequestError: vi.fn((error: unknown, status?: number) => Boolean(
    error && typeof error === 'object' && 'status' in error
      && (status === undefined || error.status === status),
  )),
}));
vi.mock('@/hooks/use-client-services', () => hooksMock);

import { ClientServiceCreator } from '@/components/companies/company-detail/client-service-creator';

const options = {
  variants: [
    {
      id: 'variant-1',
      name: 'Corporate Secretarial',
      family: { id: 'family-1', name: 'Corporate Services' },
      serviceCadence: 'ANNUALLY',
      customCadenceLabel: null,
      fields: [{ key: 'software', label: 'Software', type: 'text' as const, defaultValue: 'Xero' }],
      feeTemplates: [{
        description: 'Annual service fee',
        defaultAmount: '1200.00',
        currency: 'SGD',
        billingFrequency: 'ANNUALLY' as const,
        customFrequencyLabel: null,
        displayOrder: 0,
      }],
    },
    {
      id: 'variant-2',
      name: 'Payroll Bureau',
      family: { id: 'family-1', name: 'Corporate Services' },
      serviceCadence: 'MONTHLY',
      customCadenceLabel: null,
      fields: [],
      feeTemplates: [],
    },
    {
      id: 'variant-3',
      name: 'Treasury Advisory',
      family: { id: 'family-2', name: 'Advisory' },
      serviceCadence: 'AD_HOC',
      customCadenceLabel: null,
      fields: [],
      feeTemplates: [],
    },
  ],
};

const createdDto = {
  id: 'service-1',
  companyId: 'company-1',
  source: 'MANUAL',
  agreementId: null,
  agreementItemId: null,
  serviceVariantId: 'variant-1',
  familyName: 'Corporate Services',
  serviceName: 'Corporate Secretarial',
  status: 'ACTIVE',
  serviceCadence: 'ANNUALLY',
  customCadenceLabel: null,
  startDate: '2026-08-01',
  endDate: null,
  fieldValues: { software: 'Xero' },
  feeLines: [],
  agreement: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function duplicateError(overrides: Partial<Record<string, unknown>> = {}) {
  return Object.assign(new Error('A matching client service already exists.'), {
    status: 409,
    code: 'DUPLICATE_CLIENT_SERVICE',
    body: {
      duplicates: {
        total: 2,
        items: [
          { id: 'existing-2', serviceName: 'Corporate Secretarial', startDate: '2026-08-01', status: 'ENDED', source: 'AGREEMENT' },
          { id: 'existing-1', serviceName: 'Corporate Secretarial', startDate: '2026-08-01', status: 'ACTIVE', source: 'MANUAL' },
        ],
      },
    },
    ...overrides,
  });
}

async function selectVariant(name: string) {
  fireEvent.focus(screen.getByPlaceholderText('Select service'));
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(name) }));
}

describe('ClientServiceCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 40,
      top: 10,
      left: 10,
      bottom: 50,
      right: 210,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    });
    hooksMock.useManualClientServiceCatalogOptions.mockReturnValue({ data: options, isLoading: false, error: null });
    hooksMock.useCreateManualClientService.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('shows a loading state while the catalog loads', () => {
    hooksMock.useManualClientServiceCatalogOptions.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading service catalog');
  });

  it('explains an empty catalog without a document administration link', () => {
    hooksMock.useManualClientServiceCatalogOptions.mockReturnValue({ data: { variants: [] }, isLoading: false, error: null });
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByText(/No active services are available/i)).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps cadence, field, and fee sections unavailable until a variant is selected', async () => {
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByLabelText('Cadence')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add field' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add fee' })).toBeDisabled();
    await selectVariant('Corporate Secretarial');
    expect(screen.getByLabelText('Cadence')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add field' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add fee' })).toBeEnabled();
  });

  it('applies catalog defaults with blank dates and active status', async () => {
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    await selectVariant('Corporate Secretarial');
    expect(screen.getByLabelText('Status')).toHaveValue('ACTIVE');
    expect(screen.getByLabelText('Cadence')).toHaveValue('ANNUALLY');
    expect(screen.getByLabelText('Start date')).toHaveValue('');
    expect(screen.getByLabelText('End date')).toHaveValue('');
    expect(screen.getByLabelText('Field 1 name')).toHaveValue('software');
    expect(screen.getByLabelText('Field 1 value')).toHaveValue('Xero');
    expect(screen.getByLabelText('Fee 1 description')).toHaveValue('Annual service fee');
    expect(screen.getByLabelText('Fee 1 amount')).toHaveValue('1200.00');
    expect(screen.getByLabelText('Fee 1 currency')).toHaveValue('SGD');
    expect(screen.getByLabelText('Fee 1 frequency')).toHaveValue('ANNUALLY');
  });

  it('creates one incomplete fee row for variants without fee templates', async () => {
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    await selectVariant('Payroll Bureau');
    expect(screen.getByLabelText('Fee 1 description')).toHaveValue('Payroll Bureau');
    expect(screen.getByLabelText('Fee 1 amount')).toHaveValue('');
    expect(screen.getByLabelText('Fee 1 currency')).toHaveValue('SGD');
    expect(screen.getByLabelText('Fee 1 frequency')).toHaveValue('');
  });

  it('groups options by family and searches within the catalog', async () => {
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.focus(screen.getByPlaceholderText('Select service'));
    expect(await screen.findByRole('option', { name: /Corporate Secretarial/ })).toBeVisible();
    expect(screen.getByText('Corporate Services')).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText('Select service'), { target: { value: 'Treasury' } });
    expect(screen.getByRole('option', { name: /Treasury Advisory/ })).toBeVisible();
    expect(screen.queryByRole('option', { name: /Corporate Secretarial/ })).not.toBeInTheDocument();
  });

  it('requires confirmation before discarding modified replacement values and preserves them on cancel', async () => {
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    await selectVariant('Corporate Secretarial');
    fireEvent.change(screen.getByLabelText('Field 1 value'), { target: { value: 'QuickBooks' } });
    await selectVariant('Payroll Bureau');
    const dialog = screen.getByRole('dialog', { name: 'Discard catalog changes?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Discard catalog changes?' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cadence')).toHaveValue('ANNUALLY');
    expect(screen.getByLabelText('Field 1 value')).toHaveValue('QuickBooks');
  });

  it('applies a new variant while preserving status and dates after confirmation', async () => {
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    await selectVariant('Corporate Secretarial');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'PAUSED' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Field 1 value'), { target: { value: 'QuickBooks' } });
    await selectVariant('Payroll Bureau');
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Discard catalog changes?' })).getByRole('button', { name: 'Discard changes' }));
    });
    expect(screen.getByLabelText('Status')).toHaveValue('PAUSED');
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('Cadence')).toHaveValue('MONTHLY');
  });

  it('requires confirmation for every dirty close path', async () => {
    const paths: Array<[string, (onClose: () => void) => void]> = [
      ['footer Cancel', (onClose) => { const button = screen.getAllByRole('button', { name: 'Cancel' }).at(-1)!; fireEvent.click(button); void onClose; }],
      ['header close button', () => fireEvent.click(screen.getByRole('button', { name: 'Close modal' }))],
      ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
      ['backdrop', () => fireEvent.click(screen.getByRole('dialog', { name: 'Add service' }))],
    ];
    for (const [label, trigger] of paths) {
      const onClose = vi.fn();
      const { unmount } = render(<ClientServiceCreator companyId="company-1" isOpen onClose={onClose} onCreated={vi.fn()} />);
      await selectVariant('Corporate Secretarial');
      trigger(onClose);
      const confirm = screen.getByRole('dialog', { name: 'Discard this draft?' });
      fireEvent.click(within(confirm).getByRole('button', { name: 'Discard' }));
      expect(onClose, label).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('closes an untouched form immediately', () => {
    const onClose = vi.fn();
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={onClose} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard this draft?')).not.toBeInTheDocument();
  });

  it('retains the duplicate draft, cancels the warning without resubmitting, and resubmits unchanged on Add anyway', async () => {
    const onCreated = vi.fn();
    const mutateAsync = vi.fn()
      .mockRejectedValueOnce(duplicateError())
      .mockRejectedValueOnce(duplicateError())
      .mockResolvedValueOnce(createdDto);
    hooksMock.useCreateManualClientService.mockReturnValue({ mutateAsync, isPending: false });
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={onCreated} />);
    await selectVariant('Corporate Secretarial');

    fireEvent.click(screen.getByRole('button', { name: 'Add service' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/2 matching/i));
    expect(within(screen.getByRole('alert')).getAllByText(/Corporate Secretarial ·/)).toHaveLength(2);
    expect(screen.getByLabelText('Field 1 value')).toHaveValue('Xero');

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add service' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/2 matching/i));

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Add anyway' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdDto));
    expect(mutateAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ confirmDuplicate: false, serviceVariantId: 'variant-1', fieldValues: { software: 'Xero' } }),
    }));
    expect(mutateAsync).toHaveBeenNthCalledWith(3, expect.objectContaining({
      data: expect.objectContaining({ confirmDuplicate: true, serviceVariantId: 'variant-1', fieldValues: { software: 'Xero' } }),
    }));
  });

  it('keeps the form open and disables repeated submissions while pending', async () => {
    let resolveCreate: ((value: unknown) => void) | undefined;
    const mutateAsync = vi.fn().mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    hooksMock.useCreateManualClientService.mockReturnValue({ mutateAsync, isPending: true });
    const onCreated = vi.fn();
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={onCreated} />);
    await selectVariant('Corporate Secretarial');
    fireEvent.click(screen.getByRole('button', { name: 'Add service' }));
    expect(screen.getByRole('button', { name: 'Add service' })).toBeDisabled();
    expect(screen.getByLabelText('Cadence')).toBeDisabled();
    expect(screen.getByPlaceholderText('Select service')).toBeDisabled();
    resolveCreate?.(createdDto);
  });

  it('retains the draft after a network failure', async () => {
    hooksMock.useCreateManualClientService.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('Network request failed')),
      isPending: false,
    });
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    await selectVariant('Corporate Secretarial');
    fireEvent.click(screen.getByRole('button', { name: 'Add service' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network request failed'));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByLabelText('Field 1 value')).toHaveValue('Xero');
  });

  it('shows a selector error when the selected catalog service becomes unavailable', async () => {
    const catalogError = Object.assign(new Error('This catalog service is no longer available.'), { status: 404 });
    hooksMock.useManualClientServiceCatalogOptions.mockReturnValue({ data: undefined, isLoading: false, error: catalogError });
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByText(/This catalog service is no longer available\./i)).toBeVisible();
    expect(screen.getByText(/choose another catalog service/i)).toBeVisible();
  });

  it('calls onCreated with the returned DTO after a successful submission', async () => {
    hooksMock.useCreateManualClientService.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(createdDto), isPending: false });
    const onCreated = vi.fn();
    render(<ClientServiceCreator companyId="company-1" isOpen onClose={vi.fn()} onCreated={onCreated} />);
    await selectVariant('Corporate Secretarial');
    fireEvent.click(screen.getByRole('button', { name: 'Add service' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdDto));
  });
});
