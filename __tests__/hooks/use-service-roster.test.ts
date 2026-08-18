import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpRequestError,
  normalizeServiceRosterSearch,
  serviceRosterKeys,
  useServiceRoster,
} from '@/hooks/use-service-roster';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createHarness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('useServiceRoster', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes defaults and comma-array values for a stable key', () => {
    expect(normalizeServiceRosterSearch({
      familyIds: ['b', 'a', 'b'],
      statuses: ['PAUSED', 'ACTIVE', 'PAUSED'],
      query: '  annual  ',
    })).toEqual(expect.objectContaining({
      familyIds: ['b', 'a'],
      statuses: ['PAUSED', 'ACTIVE'],
      query: 'annual',
      page: 1,
      limit: 20,
      archived: false,
    }));
  });

  it('uses exactly the normalized search key and serializes arrays as comma values', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 }));
    const { queryClient, wrapper } = createHarness();
    const input = { familyIds: ['b', 'a', 'b'], statuses: ['PAUSED', 'ACTIVE', 'PAUSED'] as const, query: '  annual  ' };

    renderHook(() => useServiceRoster(input), { wrapper });

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/client-services?archived=false&familyIds=b%2Ca&limit=20&page=1&query=annual&sortBy=company&sortOrder=asc&statuses=PAUSED%2CACTIVE',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(queryClient.getQueryCache().findAll({ queryKey: serviceRosterKeys.list(normalizeServiceRosterSearch(input)) })).toHaveLength(1);
  });

  it('keeps previous data while a normalized search changes', async () => {
    let resolveSecond: ((response: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'first' }], total: 1, page: 1, limit: 20, totalPages: 1 }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const { wrapper } = createHarness();
    const { result, rerender } = renderHook(({ query }) => useServiceRoster({ query }), {
      wrapper,
      initialProps: { query: 'first' },
    });

    await waitFor(() => expect(result.current.data?.items[0]).toMatchObject({ id: 'first' }));
    rerender({ query: 'second' });
    expect(result.current.data?.items[0]).toMatchObject({ id: 'first' });
    resolveSecond?.(jsonResponse({ items: [{ id: 'second' }], total: 1, page: 1, limit: 20, totalPages: 1 }));
  });

  it('throws structured API errors with code, details, and body', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'No access', code: 'PERMISSION_DENIED', details: { reason: 'scope' } }, 403));
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useServiceRoster(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(HttpRequestError));
    expect(result.current.error).toMatchObject({ status: 403, code: 'PERMISSION_DENIED', details: { reason: 'scope' }, body: { code: 'PERMISSION_DENIED' } });
  });
});
