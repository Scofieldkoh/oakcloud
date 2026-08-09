import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const hooksMock = vi.hoisted(() => ({
  useClientServices: vi.fn(), useClientService: vi.fn(), useUpdateClientService: vi.fn(), useArchiveClientService: vi.fn(), useRetryServiceAgreementActivation: vi.fn(),
  isHttpRequestError: vi.fn((error: unknown, status?: number) => Boolean(
    error && typeof error === 'object' && 'status' in error
      && (status === undefined || error.status === status)
  )),
}));
vi.mock('@/hooks/use-client-services', () => hooksMock);

import { CompanyServicesTab } from '@/components/companies/company-detail/company-services-tab';
import { CompanyTabs } from '@/components/companies/company-detail/company-tabs';

const service = {
  id: 'service-1', companyId: 'company-1', agreementId: 'agreement-1', agreementItemId: 'item-1', serviceVariantId: 'variant-1',
  source: 'AGREEMENT', familyName: 'Corporate Services', serviceName: 'Corporate Secretarial Services', status: 'ACTIVE', serviceCadence: 'ANNUALLY', customCadenceLabel: null,
  startDate: '2026-07-30', endDate: null, fieldValues: {}, createdAt: '2026-07-30T00:00:00Z', updatedAt: '2026-07-30T00:00:00Z',
  feeLines: [{ id: 'fee-1', description: 'Annual fee', amount: '500.00', currency: 'SGD', billingFrequency: 'ANNUALLY', customFrequencyLabel: null, billingStartDate: '2026-07-30', displayOrder: 0 }],
  agreement: { title: 'Service Agreement', status: 'EFFECTIVE', activationStatus: 'COMPLETED', generatedDocumentId: 'document-1', href: '/generated-documents/document-1' },
};
const manualService = {
  ...service,
  id: 'service-manual',
  serviceName: 'Advisory Retainer',
  source: 'MANUAL',
  agreementId: null,
  agreementItemId: null,
  agreement: null,
};

describe('CompanyServicesTab', () => {
  beforeEach(() => {
    hooksMock.useClientServices.mockReturnValue({ data: { services: [service], total: 1 }, isLoading: false, error: null });
    hooksMock.useClientService.mockReturnValue({ refetch: vi.fn(), isFetching: false });
    hooksMock.useUpdateClientService.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooksMock.useArchiveClientService.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooksMock.useRetryServiceAgreementActivation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it('shows compact service identity, fee, and signed agreement source', async () => {
    render(<CompanyServicesTab companyId="company-1" canEdit />);
    expect(await screen.findByText('Corporate Secretarial Services')).toBeVisible();
    expect(screen.getByText('S$500.00 annually')).toBeVisible();
    expect(screen.getByRole('link', { name: /service agreement/i })).toHaveAttribute('href', '/generated-documents/document-1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit service' }));
    expect(screen.queryByLabelText(/service clause/i)).not.toBeInTheDocument();
    expect(screen.getByText(/do not change the signed agreement/i)).toBeVisible();
  });

  it('labels manual services as metadata and keeps the agreement link only for agreement services', () => {
    hooksMock.useClientServices.mockReturnValue({ data: { services: [manualService, service], total: 2, activations: [] }, isLoading: false, error: null });
    render(<CompanyServicesTab companyId="company-1" canEdit />);
    expect(screen.getByText('Added manually')).toBeVisible();
    expect(screen.getByText('Added manually').tagName).toBe('SPAN');
    expect(screen.getByText('Advisory Retainer')).toBeVisible();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /service agreement/i })).toHaveAttribute('href', '/generated-documents/document-1');
  });

  it('uses source-aware edit and archive copy for manual services', () => {
    hooksMock.useClientServices.mockReturnValue({ data: { services: [manualService], total: 1, activations: [] }, isLoading: false, error: null });
    render(<CompanyServicesTab companyId="company-1" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit service' }));
    expect(screen.getByText(/This service was added manually\. Operational changes are recorded in the audit history\./i)).toBeVisible();
    expect(screen.getByText(/Archiving removes this manually added service from the active company view\./i)).toBeVisible();
  });

  it('does not expose edit controls in read-only mode', () => {
    render(<CompanyServicesTab companyId="company-1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: 'Edit service' })).not.toBeInTheDocument();
  });

  it('shows failed activation recovery to authorized editors', () => {
    hooksMock.useClientServices.mockReturnValue({ data: { services: [service], total: 1, activations: [{ agreementId: 'agreement-2', title: 'External Service Agreement', activationStatus: 'FAILED_PERMANENT', activationLastError: 'Company dependency unavailable', canRetry: true }] }, isLoading: false, error: null });
    render(<CompanyServicesTab companyId="company-1" canEdit />);
    expect(screen.getByRole('alert')).toHaveTextContent('Company dependency unavailable');
    expect(screen.getByRole('button', { name: 'Retry activation' })).toBeVisible();
  });

  it('hides retry when the complete activation capability is unavailable', () => {
    hooksMock.useClientServices.mockReturnValue({ data: { services: [service], total: 1, activations: [{ agreementId: 'agreement-2', title: 'External Service Agreement', activationStatus: 'FAILED_PERMANENT', activationLastError: 'Activation failed', canRetry: false }] }, isLoading: false, error: null });
    render(<CompanyServicesTab companyId="company-1" canEdit />);
    expect(screen.queryByRole('button', { name: 'Retry activation' })).not.toBeInTheDocument();
  });

  it('shows additional fees and exposes pagination beyond the first page', () => {
    hooksMock.useClientServices.mockReturnValue({ data: { services: [{ ...service, feeLines: [...service.feeLines, { ...service.feeLines[0], id: 'fee-2', amount: '9007199254740993.00' }] }], total: 55, activations: [] }, isLoading: false, error: null });
    render(<CompanyServicesTab companyId="company-1" canEdit />);
    expect(screen.getByText(/1 additional fee/i)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(hooksMock.useClientServices).toHaveBeenLastCalledWith('company-1', expect.objectContaining({ page: 2 }));
  });

  it('keeps editor data visible after a failed save and supports all fee fields', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Save rejected'));
    hooksMock.useUpdateClientService.mockReturnValue({ mutateAsync, isPending: false });
    render(<CompanyServicesTab companyId="company-1" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit service' }));
    expect(screen.getByLabelText('Fee 1 currency')).toBeVisible();
    expect(screen.getByLabelText('Fee 1 billing start date')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Fee 1 frequency'), { target: { value: 'CUSTOM' } });
    expect(screen.getByLabelText('Fee 1 custom frequency')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Fee 1 custom frequency'), { target: { value: 'Every 18 months' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Save rejected'));
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('requires an explicit reload before retrying a stale edit with the current version', async () => {
    const refreshed = {
      ...service,
      serviceName: 'Server-updated service',
      updatedAt: '2026-08-01T01:00:00.000Z',
    };
    const conflict = Object.assign(new Error('This service was updated by someone else.'), { status: 409 });
    const mutateAsync = vi.fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(refreshed);
    const refetch = vi.fn().mockResolvedValue({ data: refreshed });
    hooksMock.useClientService.mockReturnValue({ refetch, isFetching: false });
    hooksMock.useUpdateClientService.mockReturnValue({ mutateAsync, isPending: false });

    render(<CompanyServicesTab companyId="company-1" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit service' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const reload = await screen.findByRole('button', { name: 'Reload latest service' });
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(reload);
    await waitFor(() => expect(screen.getByLabelText('Service name')).toHaveValue('Server-updated service'));

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ updatedAt: refreshed.updatedAt }),
    }));
  });

  it('associates a required-field validation error with the invalid control', async () => {
    render(<CompanyServicesTab companyId="company-1" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit service' }));
    const serviceName = screen.getByLabelText('Service name');
    fireEvent.change(serviceName, { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(serviceName).toHaveAttribute('aria-invalid', 'true'));
    const errorId = serviceName.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent('Service name is required.');
  });

  it('keeps focus while a service-field key changes', () => {
    render(<CompanyServicesTab companyId="company-1" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit service' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    const name = screen.getByLabelText('Field 1 name');
    name.focus();
    fireEvent.change(name, { target: { value: 'filingMonth' } });
    expect(document.activeElement).toBe(name);
  });

  it('keeps archive confirmation recoverable after a mutation failure', async () => {
    hooksMock.useArchiveClientService.mockReturnValue({ mutateAsync: vi.fn().mockRejectedValue(new Error('Archive rejected')), isPending: false });
    render(<CompanyServicesTab companyId="company-1" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit service' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive service' }));
    fireEvent.change(screen.getByLabelText('Archive reason'), { target: { value: 'Client ended the engagement' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Archive service' }).at(-1)!);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Archive rejected'));
    expect(screen.getByText('Archive service?')).toBeVisible();
  });

  it('renders company tabs as horizontally scrollable mobile touch targets', () => {
    const onTabChange = vi.fn();
    render(<CompanyTabs activeTab="services" onTabChange={onTabChange} />);

    const tablist = screen.getByRole('tablist', { name: 'Company sections' });
    expect(tablist).toHaveClass('overflow-x-auto', 'overflow-y-hidden');
    const servicesTab = screen.getByRole('tab', { name: 'Services' });
    expect(servicesTab).toHaveAttribute('aria-selected', 'true');
    expect(servicesTab).toHaveClass('min-h-11', 'shrink-0', 'sm:min-h-0');
  });
});
