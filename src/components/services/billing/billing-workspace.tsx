'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/ui/pagination';
import { Alert } from '@/components/ui/alert';
import { useBillingOccurrences } from '@/hooks/use-billing-occurrences';
import { useResetBillingOverride, useUpdateBillingOccurrence } from '@/hooks/use-billing-occurrences';
import { useServiceRosterFamilies } from '@/hooks/use-service-roster-families';
import { useUpsertUserPreference, useUserPreference } from '@/hooks/use-user-preferences';
import type { BillingOccurrenceDto } from '@/services/billing';
import { addCalendarDays, currentDateInSingapore, type DateOnly } from '@/services/service-schedule';
import {
  BILLING_TABLE_PREFERENCE_KEY,
  defaultBillingTablePreference,
  parseBillingTablePreference,
  type BillingColumnId,
  type BillingTablePreference,
} from '@/lib/validations/services-preferences';
import { BillingCoveragePanel } from './billing-coverage-panel';
import { BillingFilters, type BillingFilterState } from './billing-filters';
import { BillingOccurrenceDialog } from './billing-occurrence-dialog';
import { BillingTable, type BillingInlineFilters } from './billing-table';

interface BillingWorkspaceProps {
  workspaceId?: string;
  canEdit?: boolean;
}

function initialFilters(): BillingFilterState {
  const from = currentDateInSingapore();
  return {
    query: '',
    statuses: ['OPEN'],
    timing: [],
    from,
    to: addCalendarDays(from as DateOnly, 30),
    familyIds: [],
  };
}

function isDateRangeValid(from: string, to: string): boolean {
  return Boolean(from && to && from <= to);
}

const BILLING_STATUSES = ['OPEN', 'BILLED', 'WAIVED', 'CANCELLED'] as const;
const BILLING_TIMINGS = ['UPCOMING', 'DUE', 'OVERDUE'] as const;
const BILLING_SORT_FIELDS = ['expectedDate', 'company', 'family', 'service', 'status', 'amount'] as const;

function readQuery(value: string | null): string {
  return value?.trim() ?? '';
}

function readDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function readPage(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

function readList<T extends string>(value: string | null, allowed: readonly T[], fallback: T[] = []): T[] {
  if (value === null) return fallback;
  return value.split(',').filter((item, index, values): item is T => allowed.includes(item as T) && values.indexOf(item) === index);
}

export interface BillingUrlState {
  filters: BillingFilterState;
  inlineFilters: BillingInlineFilters;
  page: number;
  sortBy: BillingTablePreference['sortBy'];
  sortOrder: BillingTablePreference['sortOrder'];
}

export function parseBillingUrlState(searchKey: string, preference: BillingTablePreference = defaultBillingTablePreference, today: DateOnly = currentDateInSingapore()): BillingUrlState {
  const params = new URLSearchParams(searchKey);
  const defaultTo = addCalendarDays(today, 30);
  const sortCandidate = params.get('sortBy');
  const sortBy = BILLING_SORT_FIELDS.includes(sortCandidate as BillingTablePreference['sortBy'])
    ? sortCandidate as BillingTablePreference['sortBy']
    : preference.sortBy;
  return {
    filters: {
      query: readQuery(params.get('query')),
      statuses: readList(params.get('statuses'), BILLING_STATUSES, ['OPEN']),
      timing: readList(params.get('timing'), BILLING_TIMINGS),
      from: readDate(params.get('from')) ?? today,
      to: readDate(params.get('to')) ?? defaultTo,
      familyIds: params.get('familyIds')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [],
    },
    inlineFilters: {
      company: readQuery(params.get('companyQuery')) || undefined,
      familyService: readQuery(params.get('serviceQuery')) || undefined,
      feeLinePeriod: readQuery(params.get('feeQuery')) || undefined,
    },
    page: readPage(params.get('page')),
    sortBy,
    sortOrder: params.get('sortOrder') === 'desc' ? 'desc' : params.has('sortOrder') ? 'asc' : preference.sortOrder,
  };
}

export function BillingWorkspace({ workspaceId: _workspaceId, canEdit = true }: BillingWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canonicalSearchKey = searchParams.toString();
  const [optimisticSearchKey, setOptimisticSearchKey] = useState<string | null>(null);
  const [selectedOccurrence, setSelectedOccurrence] = useState<BillingOccurrenceDto | null>(null);
  const [tablePreference, setTablePreference] = useState<BillingTablePreference>(defaultBillingTablePreference);
  const effectiveSearchKey = optimisticSearchKey ?? canonicalSearchKey;

  const familiesQuery = useServiceRosterFamilies();
  const preferenceQuery = useUserPreference<unknown>(BILLING_TABLE_PREFERENCE_KEY);
  const preferenceMutation = useUpsertUserPreference<BillingTablePreference>();
  const occurrenceMutation = useUpdateBillingOccurrence();
  const resetMutation = useResetBillingOverride();

  useEffect(() => {
    setOptimisticSearchKey(null);
  }, [canonicalSearchKey]);

  useEffect(() => {
    if (preferenceQuery.data?.value !== undefined) {
      setTablePreference(parseBillingTablePreference(preferenceQuery.data.value));
    }
  }, [preferenceQuery.data?.value]);

  const urlState = useMemo(() => parseBillingUrlState(effectiveSearchKey, tablePreference), [effectiveSearchKey, tablePreference]);
  const { filters, inlineFilters, page } = urlState;

  const replaceUrl = useCallback((next: Partial<Record<string, string | undefined>>) => {
    const params = new URLSearchParams(effectiveSearchKey);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') params.delete(key);
      else params.set(key, value);
    }
    const nextKey = params.toString();
    setOptimisticSearchKey(nextKey);
    router.replace(nextKey ? `${pathname}?${nextKey}` : pathname, { scroll: false });
  }, [effectiveSearchKey, pathname, router]);

  const search = useMemo(() => ({
    from: filters.from as DateOnly,
    to: filters.to as DateOnly,
    query: filters.query.trim() || undefined,
    companyQuery: inlineFilters.company,
    serviceQuery: inlineFilters.familyService,
    feeQuery: inlineFilters.feeLinePeriod,
    statuses: filters.statuses,
    timing: filters.timing,
    familyIds: filters.familyIds,
    page,
    limit: tablePreference.pageSize,
    sortBy: urlState.sortBy,
    sortOrder: urlState.sortOrder,
  }), [filters.from, filters.to, filters.query, inlineFilters.company, inlineFilters.familyService, inlineFilters.feeLinePeriod, filters.statuses, filters.timing, filters.familyIds, page, tablePreference.pageSize, urlState.sortBy, urlState.sortOrder]);
  const safeSearch = useMemo(() => {
    if (isDateRangeValid(filters.from, filters.to)) return search;
    const fallback = (filters.from || currentDateInSingapore()) as DateOnly;
    return { ...search, from: fallback, to: fallback };
  }, [filters.from, filters.to, search]);
  const occurrenceQuery = useBillingOccurrences(safeSearch);
  const items = occurrenceQuery.data?.items ?? [];
  const families = familiesQuery.data ?? [];

  const savePreference = useCallback((next: BillingTablePreference) => {
    setTablePreference(next);
    preferenceMutation.mutate({ key: BILLING_TABLE_PREFERENCE_KEY, value: next });
  }, [preferenceMutation]);

  const updatePreference = useCallback((change: Partial<BillingTablePreference>) => {
    savePreference({ ...tablePreference, ...change });
  }, [savePreference, tablePreference]);

  const handleFilterChange = (next: BillingFilterState) => {
    replaceUrl({
      query: next.query.trim() || undefined,
      statuses: next.statuses.length > 0 ? next.statuses.join(',') : undefined,
      timing: next.timing.length > 0 ? next.timing.join(',') : undefined,
      from: next.from || undefined,
      to: next.to || undefined,
      familyIds: next.familyIds.length > 0 ? next.familyIds.join(',') : undefined,
      page: '1',
    });
  };

  const resetFilters = () => {
    const defaults = initialFilters();
    replaceUrl({
      query: undefined,
      companyQuery: undefined,
      serviceQuery: undefined,
      feeQuery: undefined,
      statuses: defaults.statuses.join(','),
      timing: undefined,
      from: defaults.from,
      to: defaults.to,
      familyIds: undefined,
      page: '1',
    });
  };

  const handleSort = (sortBy: NonNullable<Parameters<NonNullable<React.ComponentProps<typeof BillingTable>['onSort']>>[0]>) => {
    const sortOrder = urlState.sortBy === sortBy && urlState.sortOrder === 'asc' ? 'desc' : 'asc';
    replaceUrl({ sortBy, sortOrder });
    updatePreference({ sortBy, sortOrder });
  };

  const handleColumnWidthChange = (columnId: BillingColumnId, width: number) => {
    setTablePreference((current) => ({ ...current, columnWidths: { ...current.columnWidths, [columnId]: width } }));
  };

  const handleColumnResizeEnd = (columnId: BillingColumnId, width: number) => {
    savePreference({ ...tablePreference, columnWidths: { ...tablePreference.columnWidths, [columnId]: width } });
  };

  const toggleColumn = (columnId: BillingColumnId) => {
    updatePreference({ columnVisibility: { ...tablePreference.columnVisibility, [columnId]: !tablePreference.columnVisibility[columnId] } });
  };

  const moveColumn = (columnId: BillingColumnId, direction: -1 | 1) => {
    const currentIndex = tablePreference.columnOrder.indexOf(columnId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= tablePreference.columnOrder.length) return;
    const nextOrder = [...tablePreference.columnOrder];
    [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];
    updatePreference({ columnOrder: nextOrder });
  };

  const handleInlineFilterChange = (change: Partial<BillingInlineFilters>) => {
    replaceUrl({
      companyQuery: change.company === undefined ? inlineFilters.company : change.company.trim() || undefined,
      serviceQuery: change.familyService === undefined ? inlineFilters.familyService : change.familyService.trim() || undefined,
      feeQuery: change.feeLinePeriod === undefined ? inlineFilters.feeLinePeriod : change.feeLinePeriod.trim() || undefined,
      page: '1',
    });
  };

  const clearMutationState = () => {
    occurrenceMutation.reset?.();
    resetMutation.reset?.();
  };

  const openOccurrence = (occurrence: BillingOccurrenceDto) => {
    clearMutationState();
    setSelectedOccurrence(occurrence);
  };

  const closeOccurrence = () => {
    setSelectedOccurrence(null);
    clearMutationState();
  };

  const applyOccurrenceUpdate = (id: string, input: Parameters<NonNullable<React.ComponentProps<typeof BillingOccurrenceDialog>['onSave']>>[0]) => {
    occurrenceMutation.mutate({ id, data: input }, { onSuccess: closeOccurrence });
  };

  const resetOccurrenceOverrides = (id: string, input: Parameters<NonNullable<React.ComponentProps<typeof BillingOccurrenceDialog>['onReset']>>[0]) => {
    resetMutation.mutate({ id, data: input }, { onSuccess: closeOccurrence });
  };

  return (
    <section aria-labelledby="billing-tracking-heading" className="space-y-4">
      <header>
        <h2 id="billing-tracking-heading" className="text-lg font-semibold text-text-primary">Manual billing tracking</h2>
      </header>

      <BillingCoveragePanel />

      <div className="space-y-4">
        <BillingFilters value={filters} families={families} onChange={handleFilterChange} onReset={resetFilters} />

        <BillingTableToolbar
          preference={tablePreference}
          onToggleColumn={toggleColumn}
          onMoveColumn={moveColumn}
        />

        {occurrenceQuery.error ? <Alert variant="error">Unable to load billing tracking rows.</Alert> : null}
        <BillingTable
          items={items}
          isFetching={occurrenceQuery.isFetching}
          canEdit={canEdit}
          columnWidths={tablePreference.columnWidths}
          columnOrder={tablePreference.columnOrder}
          columnVisibility={tablePreference.columnVisibility as Record<BillingColumnId, boolean>}
          sortBy={urlState.sortBy}
          sortOrder={urlState.sortOrder}
          inlineFilters={inlineFilters}
          onInlineFilterChange={handleInlineFilterChange}
          onSort={handleSort}
          onColumnWidthChange={handleColumnWidthChange}
          onColumnResizeEnd={handleColumnResizeEnd}
          onEdit={openOccurrence}
        />
        {occurrenceQuery.data ? <Pagination page={occurrenceQuery.data.page} totalPages={occurrenceQuery.data.totalPages} total={occurrenceQuery.data.total} limit={occurrenceQuery.data.limit} onPageChange={(nextPage) => replaceUrl({ page: String(nextPage) })} onLimitChange={(limit) => { updatePreference({ pageSize: limit as BillingTablePreference['pageSize'] }); replaceUrl({ page: '1' }); }} pageSizeOptions={[10, 20, 50, 100]} /> : null}
      </div>

      <BillingOccurrenceDialog occurrence={selectedOccurrence} isOpen={Boolean(selectedOccurrence)} onClose={closeOccurrence} isSaving={occurrenceMutation.isPending} isResetting={resetMutation.isPending} errorMessage={occurrenceMutation.error?.message ?? resetMutation.error?.message ?? null} onSave={(input) => selectedOccurrence && applyOccurrenceUpdate(selectedOccurrence.id, input)} onReset={(input) => selectedOccurrence && resetOccurrenceOverrides(selectedOccurrence.id, input)} />
    </section>
  );
}

interface BillingTableToolbarProps {
  preference: BillingTablePreference;
  onToggleColumn: (columnId: BillingColumnId) => void;
  onMoveColumn: (columnId: BillingColumnId, direction: -1 | 1) => void;
}

function BillingTableToolbar({ preference, onToggleColumn, onMoveColumn }: BillingTableToolbarProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" className="min-h-11 rounded-lg border border-border-primary bg-background-secondary px-3 text-xs font-medium text-text-secondary transition-colors hover:border-oak-primary hover:text-text-primary sm:min-h-8" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Columns · {Object.values(preference.columnVisibility).filter(Boolean).length}
      </button>
      {open ? (
        <div className="relative z-10 w-full rounded-xl border border-border-primary bg-background-secondary p-3 shadow-elevation-2 sm:w-80">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Customize columns</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {preference.columnOrder.map((column) => (
              <label key={column} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-text-secondary hover:bg-background-tertiary sm:min-h-8">
                <input type="checkbox" checked={preference.columnVisibility[column] !== false} onChange={() => onToggleColumn(column)} />
                <span className="truncate">{column}</span>
                <button type="button" aria-label={`Move ${column} column up`} className="ml-auto min-h-11 min-w-11 px-1 text-text-muted hover:text-text-primary sm:min-h-8 sm:min-w-8" onClick={() => onMoveColumn(column, -1)}>↑</button>
                <button type="button" aria-label={`Move ${column} column down`} className="min-h-11 min-w-11 px-1 text-text-muted hover:text-text-primary sm:min-h-8 sm:min-w-8" onClick={() => onMoveColumn(column, 1)}>↓</button>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
