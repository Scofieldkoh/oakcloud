import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpRequestError, isHttpRequestError, useUpdateClientService } from '@/hooks/use-client-services';

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
  return { wrapper };
}

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
});
