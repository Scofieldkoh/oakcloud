'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addCalendarDays,
  currentDateInSingapore,
  type DateOnly,
} from '@/services/service-schedule';
import {
  billingOccurrenceSearchSchema,
  type BillingOccurrenceSearch,
  type BillingOccurrenceSearchInput,
  type ResetBillingOverrideInput,
  type UpdateBillingOccurrenceInput,
} from '@/lib/validations/billing';
import type { BillingOccurrenceDto, BillingOccurrenceListResult } from '@/services/billing';

export interface BillingOccurrenceErrorBody {
  error?: string;
  code?: string;
  details?: unknown;
  [key: string]: unknown;
}

export class BillingOccurrenceHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | undefined,
    public readonly details: unknown,
    public readonly body: BillingOccurrenceErrorBody,
  ) {
    super(message);
    this.name = 'BillingOccurrenceHttpError';
  }
}

function uniqueStrings(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function uniqueOrdered<T extends string>(values: readonly T[] | undefined, order: Record<T, number>): T[] {
  return [...new Set(values ?? [])].sort((left, right) => order[left] - order[right]);
}

const statusOrder: Record<BillingOccurrenceSearch['statuses'][number], number> = {
  OPEN: 0,
  BILLED: 1,
  WAIVED: 2,
  CANCELLED: 3,
};
const timingOrder: Record<BillingOccurrenceSearch['timing'][number], number> = {
  UPCOMING: 0,
  DUE: 1,
  OVERDUE: 2,
};

export function normalizeBillingOccurrenceSearch(input: BillingOccurrenceSearchInput = {}): BillingOccurrenceSearch {
  const from = input.from ?? currentDateInSingapore();
  const to = input.to ?? addCalendarDays(from as DateOnly, 30);
  return billingOccurrenceSearchSchema.parse({
    from,
    to,
    query: input.query ?? '',
    companyQuery: input.companyQuery ?? '',
    serviceQuery: input.serviceQuery ?? '',
    feeQuery: input.feeQuery ?? '',
    companyIds: uniqueStrings(input.companyIds),
    familyIds: uniqueStrings(input.familyIds),
    statuses: uniqueOrdered(input.statuses, statusOrder),
    timing: uniqueOrdered(input.timing, timingOrder),
    page: Number.isSafeInteger(input.page) && input.page! >= 1 ? input.page : 1,
    limit: Number.isSafeInteger(input.limit) && input.limit! >= 1 ? Math.min(input.limit!, 100) : 50,
    sortBy: input.sortBy ?? 'expectedDate',
    sortOrder: input.sortOrder ?? 'asc',
  });
}

export const billingOccurrenceKeys = {
  all: ['billing-occurrences'] as const,
  list: (search: BillingOccurrenceSearchInput = {}) => ['billing-occurrences', normalizeBillingOccurrenceSearch(search)] as const,
  detail: (id: string) => ['billing-occurrences', 'detail', id] as const,
};

export function billingOccurrenceSearchParams(search: BillingOccurrenceSearchInput = {}): string {
  const normalized = normalizeBillingOccurrenceSearch(search);
  const params = new URLSearchParams();
  params.set('from', normalized.from);
  params.set('to', normalized.to);
  if (normalized.query) params.set('query', normalized.query);
  if (normalized.companyQuery) params.set('companyQuery', normalized.companyQuery);
  if (normalized.serviceQuery) params.set('serviceQuery', normalized.serviceQuery);
  if (normalized.feeQuery) params.set('feeQuery', normalized.feeQuery);
  if (normalized.companyIds.length > 0) params.set('companyIds', normalized.companyIds.join(','));
  if (normalized.familyIds.length > 0) params.set('familyIds', normalized.familyIds.join(','));
  if (normalized.statuses.length > 0) params.set('statuses', normalized.statuses.join(','));
  if (normalized.timing.length > 0) params.set('timing', normalized.timing.join(','));
  params.set('page', String(normalized.page));
  params.set('limit', String(normalized.limit));
  params.set('sortBy', normalized.sortBy);
  params.set('sortOrder', normalized.sortOrder);
  params.sort();
  return params.toString();
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as BillingOccurrenceErrorBody;
  if (!response.ok) {
    throw new BillingOccurrenceHttpError(body.error ?? 'Request failed', response.status, body.code, body.details, body);
  }
  return body as T;
}

function useInvalidateBillingOccurrenceQueries() {
  const queryClient = useQueryClient();
  return async (occurrence: Pick<BillingOccurrenceDto, 'id' | 'clientServiceId'>) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: billingOccurrenceKeys.all }),
      queryClient.invalidateQueries({ queryKey: billingOccurrenceKeys.detail(occurrence.id) }),
      queryClient.invalidateQueries({ queryKey: ['billing-coverage'] }),
      queryClient.invalidateQueries({ queryKey: ['service-roster'] }),
      queryClient.invalidateQueries({ queryKey: ['client-service', occurrence.clientServiceId] }),
    ]);
  };
}

export function useBillingOccurrences(search: BillingOccurrenceSearchInput = {}) {
  const normalized = normalizeBillingOccurrenceSearch(search);
  return useQuery<BillingOccurrenceListResult>({
    queryKey: billingOccurrenceKeys.list(normalized),
    queryFn: ({ signal }) => requestJson<BillingOccurrenceListResult>(`/api/billing-occurrences?${billingOccurrenceSearchParams(normalized)}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useBillingOccurrence(id: string | null) {
  return useQuery<BillingOccurrenceDto>({
    queryKey: billingOccurrenceKeys.detail(id ?? ''),
    queryFn: ({ signal }) => requestJson<BillingOccurrenceDto>(`/api/billing-occurrences/${encodeURIComponent(id!)}`, { signal }),
    enabled: Boolean(id),
  });
}

export function useUpdateBillingOccurrence() {
  const invalidate = useInvalidateBillingOccurrenceQueries();
  return useMutation<BillingOccurrenceDto, BillingOccurrenceHttpError, { id: string; data: UpdateBillingOccurrenceInput }>({
    mutationFn: ({ id, data }) => requestJson<BillingOccurrenceDto>(`/api/billing-occurrences/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }),
    onSuccess: (occurrence) => invalidate(occurrence),
  });
}

export function useResetBillingOverride() {
  const invalidate = useInvalidateBillingOccurrenceQueries();
  return useMutation<BillingOccurrenceDto, BillingOccurrenceHttpError, { id: string; data: ResetBillingOverrideInput }>({
    mutationFn: ({ id, data }) => requestJson<BillingOccurrenceDto>(`/api/billing-occurrences/${encodeURIComponent(id)}/reset-override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }),
    onSuccess: (occurrence) => invalidate(occurrence),
  });
}
