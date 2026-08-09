import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import {
  HttpRequestError,
  isHttpRequestError,
  useCreateManualClientService,
  useManualClientServiceCatalogOptions,
  useUpdateClientService,
} from '@/hooks/use-client-services';
import type { CreateManualClientServiceRequest } from '@/lib/validations/client-service';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

const variantId = '11111111-1111-4111-8111-111111111111';
const createData: CreateManualClientServiceRequest = {
  serviceVariantId: variantId,
  serviceCadence: 'ANNUALLY',
  startDate: '2026-08-01',
  feeLines: [{ description: 'Annual service fee', amount: '0.00', currency: 'SGD', billingFrequency: 'ANNUALLY' }],
};

describe('client service hook error boundary', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves stable codes, details, and duplicate bodies across the hook boundary', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      error: 'A matching client service already exists.',
      code: 'DUPLICATE_CLIENT_SERVICE',
      duplicates: { total: 1 },
    }, 409));
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUpdateClientService(), { wrapper });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'service-1', companyId: 'company-1', data: { updatedAt: '2026-07-30T00:00:00.000Z', status: 'PAUSED' } });
      } catch (error) {
        caught = error;
      }
    });

    expect(isHttpRequestError(caught, 409)).toBe(true);
    expect(caught).toMatchObject({
      status: 409,
      code: 'DUPLICATE_CLIENT_SERVICE',
      body: { duplicates: { total: 1 } },
    });
    expect(caught).toBeInstanceOf(HttpRequestError);
  });

  it('retains field-addressable validation details from the server', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      error: 'The service could not be created.',
      code: 'VALIDATION_ERROR',
      details: { fieldErrors: { 'feeLines.0.amount': 'Enter a non-negative amount with at most two decimals.' } },
    }, 400));
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUpdateClientService(), { wrapper });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'service-1', companyId: 'company-1', data: { updatedAt: '2026-07-30T00:00:00.000Z', status: 'PAUSED' } });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: { fieldErrors: { 'feeLines.0.amount': 'Enter a non-negative amount with at most two decimals.' } },
    });
  });

  it('loads company-scoped catalog options with a stable query key', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ variants: [] }));
    const { queryClient, wrapper } = createHarness();

    renderHook(() => useManualClientServiceCatalogOptions('company-1'), { wrapper });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/companies/company-1/services/catalog-options', undefined));
    expect(queryClient.getQueryCache().findAll({ queryKey: ['client-service-catalog-options', 'company-1'] })).toHaveLength(1);
  });

  it('posts the create payload and invalidates the company list and new detail', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'service-1', source: 'MANUAL' }, 201));
    const { queryClient, wrapper } = createHarness();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateManualClientService(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ companyId: 'company-1', data: createData });
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/companies/company-1/services',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: expect.stringContaining('"serviceVariantId"'),
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['client-services', 'company-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['client-service', 'service-1'] });
  });

  it('preserves duplicate bodies on creation failures', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      error: 'A matching client service already exists.',
      code: 'DUPLICATE_CLIENT_SERVICE',
      duplicates: { total: 1 },
    }, 409));
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useCreateManualClientService(), { wrapper });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ companyId: 'company-1', data: createData });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toMatchObject({ status: 409, code: 'DUPLICATE_CLIENT_SERVICE', body: { duplicates: { total: 1 } } });
  });
});
