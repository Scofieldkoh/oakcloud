'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

function filterOccurrences(items: BillingOccurrenceDto[], query: string, inlineFilters: BillingInlineFilters): BillingOccurrenceDto[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const normalizedCompany = inlineFilters.company?.trim().toLocaleLowerCase();
  const normalizedFamilyService = inlineFilters.familyService?.trim().toLocaleLowerCase();
  const normalizedFeeLine = inlineFilters.feeLinePeriod?.trim().toLocaleLowerCase();
  if (!normalizedQuery && !normalizedCompany && !normalizedFamilyService && !normalizedFeeLine) return items;

  return items.filter((item) => {
    const companyText = `${item.company.displayLabel} ${item.company.name}`.toLocaleLowerCase();
    const familyServiceText = `${item.family.name} ${item.service.familyName} ${item.service.name}`.toLocaleLowerCase();
    const feeLineText = `${item.feeLine.description} ${item.billingPeriodKey}`.toLocaleLowerCase();
    return (!normalizedQuery || `${companyText} ${familyServiceText} ${feeLineText}`.includes(normalizedQuery))
      && (!normalizedCompany || companyText.includes(normalizedCompany))
      && (!normalizedFamilyService || familyServiceText.includes(normalizedFamilyService))
      && (!normalizedFeeLine || feeLineText.includes(normalizedFeeLine));
  });
}

export function BillingWorkspace({ workspaceId: _workspaceId, canEdit = true }: BillingWorkspaceProps) {
  const [filters, setFilters] = useState<BillingFilterState>(initialFilters);
  const [inlineFilters, setInlineFilters] = useState<BillingInlineFilters>({});
  const [page, setPage] = useState(1);
  const [selectedOccurrence, setSelectedOccurrence] = useState<BillingOccurrenceDto | null>(null);
  const [tablePreference, setTablePreference] = useState<BillingTablePreference>(defaultBillingTablePreference);

  const familiesQuery = useServiceRosterFamilies();
  const preferenceQuery = useUserPreference<unknown>(BILLING_TABLE_PREFERENCE_KEY);
  const preferenceMutation = useUpsertUserPreference<BillingTablePreference>();
  const occurrenceMutation = useUpdateBillingOccurrence();
  const resetMutation = useResetBillingOverride();

  useEffect(() => {
    if (preferenceQuery.data?.value !== undefined) {
      setTablePreference(parseBillingTablePreference(preferenceQuery.data.value));
    }
  }, [preferenceQuery.data?.value]);

  const search = useMemo(() => ({
    from: filters.from as DateOnly,
    to: filters.to as DateOnly,
    statuses: filters.statuses,
    timing: filters.timing,
    familyIds: filters.familyIds,
    page,
    limit: tablePreference.pageSize,
    sortBy: tablePreference.sortBy,
    sortOrder: tablePreference.sortOrder,
  }), [filters.from, filters.to, filters.statuses, filters.timing, filters.familyIds, page, tablePreference.pageSize, tablePreference.sortBy, tablePreference.sortOrder]);
  const safeSearch = useMemo(() => {
    if (isDateRangeValid(filters.from, filters.to)) return search;
    const fallback = (filters.from || currentDateInSingapore()) as DateOnly;
    return { ...search, from: fallback, to: fallback };
  }, [filters.from, filters.to, search]);
  const occurrenceQuery = useBillingOccurrences(safeSearch);
  const items = useMemo(() => filterOccurrences(occurrenceQuery.data?.items ?? [], filters.query, inlineFilters), [occurrenceQuery.data?.items, filters.query, inlineFilters]);
  const families = familiesQuery.data ?? [];

  const savePreference = useCallback((next: BillingTablePreference) => {
    setTablePreference(next);
    preferenceMutation.mutate({ key: BILLING_TABLE_PREFERENCE_KEY, value: next });
  }, [preferenceMutation]);

  const updatePreference = useCallback((change: Partial<BillingTablePreference>) => {
    savePreference({ ...tablePreference, ...change });
  }, [savePreference, tablePreference]);

  const handleFilterChange = (next: BillingFilterState) => {
    setFilters(next);
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(initialFilters());
    setInlineFilters({});
    setPage(1);
  };

  const handleSort = (sortBy: NonNullable<Parameters<NonNullable<React.ComponentProps<typeof BillingTable>['onSort']>>[0]>) => {
    const sortOrder = tablePreference.sortBy === sortBy && tablePreference.sortOrder === 'asc' ? 'desc' : 'asc';
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

  const applyOccurrenceUpdate = (id: string, input: Parameters<NonNullable<React.ComponentProps<typeof BillingOccurrenceDialog>['onSave']>>[0]) => {
    occurrenceMutation.mutate({ id, data: input });
    setSelectedOccurrence(null);
  };

  const resetOccurrenceOverrides = (id: string, input: Parameters<NonNullable<React.ComponentProps<typeof BillingOccurrenceDialog>['onReset']>>[0]) => {
    resetMutation.mutate({ id, data: input });
    setSelectedOccurrence(null);
  };

  return (
    <section aria-labelledby="billing-tracking-heading" className="space-y-6">
      <header className="space-y-1">
        <h2 id="billing-tracking-heading" className="text-lg font-semibold text-text-primary">Manual billing tracking</h2>
        <p className="text-sm text-text-secondary">Record expected billing, external references, and tracking notes for accessible services.</p>
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
          sortBy={tablePreference.sortBy}
          sortOrder={tablePreference.sortOrder}
          inlineFilters={inlineFilters}
          onInlineFilterChange={(change) => { setInlineFilters((current) => ({ ...current, ...change })); setPage(1); }}
          onSort={handleSort}
          onColumnWidthChange={handleColumnWidthChange}
          onColumnResizeEnd={handleColumnResizeEnd}
          onEdit={setSelectedOccurrence}
        />
        {occurrenceQuery.data ? <Pagination page={occurrenceQuery.data.page} totalPages={occurrenceQuery.data.totalPages} total={occurrenceQuery.data.total} limit={occurrenceQuery.data.limit} onPageChange={setPage} onLimitChange={(limit) => updatePreference({ pageSize: limit as BillingTablePreference['pageSize'] })} pageSizeOptions={[10, 20, 50, 100]} /> : null}
      </div>

      <BillingOccurrenceDialog occurrence={selectedOccurrence} isOpen={Boolean(selectedOccurrence)} onClose={() => setSelectedOccurrence(null)} isSaving={occurrenceMutation.isPending} isResetting={resetMutation.isPending} onSave={(input) => selectedOccurrence && applyOccurrenceUpdate(selectedOccurrence.id, input)} onReset={(input) => selectedOccurrence && resetOccurrenceOverrides(selectedOccurrence.id, input)} />
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
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" className="min-h-11 rounded-lg border border-border-primary bg-background-secondary px-3 text-xs font-medium text-text-secondary transition-colors hover:border-oak-primary hover:text-text-primary sm:min-h-9" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Columns · {Object.values(preference.columnVisibility).filter(Boolean).length}
      </button>
      {open ? (
        <div className="relative z-10 w-full rounded-xl border border-border-primary bg-background-secondary p-3 shadow-elevation-2 sm:w-80">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Customize columns</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {preference.columnOrder.map((column) => (
              <label key={column} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs text-text-secondary hover:bg-background-tertiary sm:min-h-9">
                <input type="checkbox" checked={preference.columnVisibility[column] !== false} onChange={() => onToggleColumn(column)} />
                <span className="truncate">{column}</span>
                <button type="button" aria-label={`Move ${column} column up`} className="ml-auto px-1 text-text-muted hover:text-text-primary" onClick={() => onMoveColumn(column, -1)}>↑</button>
                <button type="button" aria-label={`Move ${column} column down`} className="px-1 text-text-muted hover:text-text-primary" onClick={() => onMoveColumn(column, 1)}>↓</button>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
