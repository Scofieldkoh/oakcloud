'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { Alert } from '@/components/ui/alert';
import { useClientService } from '@/hooks/use-client-services';
import { useServicesWorkspaceSettings } from '@/hooks/use-services-workspace-settings';
import { useServiceRoster, type ServiceRosterSearchInput } from '@/hooks/use-service-roster';
import { useServiceRosterFamilies } from '@/hooks/use-service-roster-families';
import { useUpsertUserPreference, useUserPreference } from '@/hooks/use-user-preferences';
import type { ServiceRosterItem } from '@/services/service-roster';
import { FamilyFilterChips, type ServiceFamilyFilter } from '@/components/services/shared/family-filter-chips';
import { AddClientServiceDialog } from './add-client-service-dialog';
import {
  SERVICE_ROSTER_COLUMNS,
  columnLabels,
  ServiceRosterTable,
  type ServiceRosterColumnId,
  type ServiceRosterColumnWidths,
  type ServiceRosterInlineFilters,
  type ServiceRosterSortBy,
} from './service-roster-table';
import { ClientServiceEditor } from '@/components/companies/company-detail/client-service-editor';
import { ManualCycleDialog } from '@/components/services/deadlines/manual-cycle-dialog';

const TABLE_PREFERENCE_KEY = 'services.roster.table.v1';
const STATUS_VALUES = ['ACTIVE', 'PAUSED', 'ENDED'] as const;
type ServiceStatus = (typeof STATUS_VALUES)[number];
const SERVICE_ROSTER_PAGE_SIZES = [10, 20, 50, 100] as const;

export interface ServiceRosterPreference {
  version: 1;
  columnWidths: ServiceRosterColumnWidths;
  columnOrder: ServiceRosterColumnId[];
  columnVisibility: Record<ServiceRosterColumnId, boolean>;
  sortBy: ServiceRosterSortBy;
  sortOrder: 'asc' | 'desc';
  pageSize: number;
}

const defaultColumnVisibility = Object.fromEntries(
  SERVICE_ROSTER_COLUMNS.map((column) => [column, true]),
) as Record<ServiceRosterColumnId, boolean>;

export const defaultServiceRosterPreference: ServiceRosterPreference = {
  version: 1,
  columnWidths: {},
  columnOrder: [...SERVICE_ROSTER_COLUMNS],
  columnVisibility: defaultColumnVisibility,
  sortBy: 'company',
  sortOrder: 'asc',
  pageSize: 20,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseServiceRosterPreference(value: unknown): ServiceRosterPreference {
  if (!isRecord(value) || value.version !== 1) return defaultServiceRosterPreference;

  const rawOrder = Array.isArray(value.columnOrder) ? value.columnOrder : [];
  const columnOrder = [
    ...rawOrder.filter((column): column is ServiceRosterColumnId => typeof column === 'string' && SERVICE_ROSTER_COLUMNS.includes(column as ServiceRosterColumnId)),
    ...SERVICE_ROSTER_COLUMNS,
  ].filter((column, index, all) => all.indexOf(column) === index);
  const columnWidths: ServiceRosterColumnWidths = {};
  if (isRecord(value.columnWidths)) {
    for (const column of SERVICE_ROSTER_COLUMNS) {
      const width = value.columnWidths[column];
      if (typeof width === 'number' && Number.isFinite(width)) {
        columnWidths[column] = Math.min(800, Math.max(96, Math.round(width)));
      }
    }
  }
  const columnVisibility = { ...defaultColumnVisibility };
  if (isRecord(value.columnVisibility)) {
    for (const column of SERVICE_ROSTER_COLUMNS) {
      if (typeof value.columnVisibility[column] === 'boolean') {
        columnVisibility[column] = value.columnVisibility[column] as boolean;
      }
    }
  }
  columnVisibility.actions = true;
  const pageSize = SERVICE_ROSTER_PAGE_SIZES.includes(value.pageSize as (typeof SERVICE_ROSTER_PAGE_SIZES)[number])
    ? value.pageSize as number
    : defaultServiceRosterPreference.pageSize;
  const sortBy = typeof value.sortBy === 'string' && SORT_VALUES.includes(value.sortBy as ServiceRosterSortBy)
    ? value.sortBy as ServiceRosterSortBy
    : defaultServiceRosterPreference.sortBy;
  const sortOrder = value.sortOrder === 'desc' ? 'desc' : 'asc';

  return { version: 1, columnWidths, columnOrder, columnVisibility, sortBy, sortOrder, pageSize };
}

interface ServiceRosterProps {
  workspaceId?: string;
  canEdit?: boolean;
  canCreate?: boolean;
  families?: ServiceFamilyFilter[];
}

function readStatuses(value: string | null): ServiceStatus[] {
  if (value === null) return ['ACTIVE'];
  return value.split(',').filter((status): status is ServiceStatus => STATUS_VALUES.includes(status as ServiceStatus));
}

function readPage(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function readLimit(value: string | null): number {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
}

const SORT_VALUES: ServiceRosterSortBy[] = ['company', 'family', 'service', 'status', 'nextDeadline', 'startDate'];

function readSortBy(value: string | null): ServiceRosterSortBy {
  return value && SORT_VALUES.includes(value as ServiceRosterSortBy) ? value as ServiceRosterSortBy : 'company';
}

function readQuery(value: string | null): string {
  return value?.trim() ?? '';
}

function readIds(value: string | null): string[] {
  return [...new Set((value ?? '').split(',').map((part) => part.trim()).filter(Boolean))];
}

function ServiceEditorLauncher({ item, onClose }: { item: ServiceRosterItem; onClose: () => void }) {
  const service = useClientService(item.id);
  if (!service.data) {
    return service.isLoading ? <p role="status" className="sr-only">Loading service editor…</p> : null;
  }
  return <ClientServiceEditor service={service.data} isOpen onClose={onClose} />;
}

function ManualCycleLauncher({ item, canApply, onClose, onApplied }: { item: ServiceRosterItem; canApply: boolean; onClose: () => void; onApplied: () => void }) {
  const service = useClientService(item.id);
  if (service.isLoading) return <p role="status" className="sr-only">Loading deadline rule configuration…</p>;
  if (service.error || !service.data) {
    return <Alert variant="error" title="Historical cycle unavailable">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{service.error instanceof Error ? service.error.message : 'Unable to load the client service deadline rules.'}</span>
        <Button size="xs" variant="secondary" className="min-h-11" onClick={onClose}>Close</Button>
      </div>
    </Alert>;
  }
  return <ManualCycleDialog clientServiceId={item.id} service={service.data} isOpen canApply={canApply} onClose={onClose} onApplied={onApplied} />;
}

function activeFilterLabel(
  query: string,
  filters: ServiceRosterInlineFilters,
  statuses: ServiceStatus[],
  familyIds: string[],
  families: ServiceFamilyFilter[],
  archived: boolean,
): string[] {
  const selectedFamilies = families.filter((family) => familyIds.includes(family.id)).map((family) => family.name);
  return [
    statuses.length > 0 ? `Status: ${statuses.map((status) => status.charAt(0) + status.slice(1).toLowerCase()).join(', ')}` : 'Status: None',
    ...selectedFamilies.map((family) => `Family: ${family}`),
    archived ? 'Archived' : '',
    query.trim() ? `Search: ${query.trim()}` : '',
    filters.company ? `Company: ${filters.company}` : '',
    filters.family ? `Family: ${filters.family}` : '',
    filters.service ? `Service: ${filters.service}` : '',
  ].filter(Boolean);
}

export function ServiceRoster({ canEdit = true, canCreate = true, families: providedFamilies }: ServiceRosterProps) {
  const workspaceSettings = useServicesWorkspaceSettings();
  const canTrigger = canEdit
    && workspaceSettings.data?.workspaceEnabled === true
    && workspaceSettings.data?.deadlineWritesEnabled === true;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canonicalSearchKey = searchParams.toString();
  const preference = useUserPreference<ServiceRosterPreference>(TABLE_PREFERENCE_KEY);
  const savePreference = useUpsertUserPreference<ServiceRosterPreference>();
  const parsedPreference = useMemo(
    () => parseServiceRosterPreference(preference.data?.value),
    [preference.data?.value],
  );
  const preferenceReady = useRef(false);
  const resizeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPreferencePatch = useRef<Partial<ServiceRosterPreference>>({});
  const [columnWidths, setColumnWidths] = useState<ServiceRosterColumnWidths>({});
  const [columnOrder, setColumnOrder] = useState<ServiceRosterColumnId[]>(defaultServiceRosterPreference.columnOrder);
  const [columnVisibility, setColumnVisibility] = useState<Record<ServiceRosterColumnId, boolean>>(defaultServiceRosterPreference.columnVisibility);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [optimisticSearchKey, setOptimisticSearchKey] = useState<string | null>(null);
  const effectiveSearchKey = optimisticSearchKey ?? canonicalSearchKey;
  useEffect(() => {
    setOptimisticSearchKey(null);
  }, [canonicalSearchKey]);
  const urlState = useMemo(() => {
    const params = new URLSearchParams(effectiveSearchKey);
    return {
      query: readQuery(params.get('query')),
      companyQuery: readQuery(params.get('companyQuery')),
      familyQuery: readQuery(params.get('familyQuery')),
      serviceQuery: readQuery(params.get('serviceQuery')),
      statuses: readStatuses(params.get('statuses')),
      familyIds: readIds(params.get('familyIds')),
      archived: params.get('archived') === 'true',
      page: readPage(params.get('page')),
      limit: readLimit(params.get('limit') ?? (preference.data?.value ? String(parsedPreference.pageSize) : null)),
      sortBy: readSortBy(params.get('sortBy') ?? (preference.data?.value ? parsedPreference.sortBy : null)),
      sortOrder: params.has('sortOrder')
        ? params.get('sortOrder') === 'desc' ? 'desc' as const : 'asc' as const
        : preference.data?.value ? parsedPreference.sortOrder : 'asc' as const,
    };
  }, [effectiveSearchKey, parsedPreference, preference.data?.value]);
  const {
    query,
    companyQuery,
    familyQuery,
    serviceQuery,
    statuses,
    familyIds,
    archived,
    page,
    limit,
    sortBy,
    sortOrder,
  } = urlState;
  const inlineFilters: ServiceRosterInlineFilters = {
    company: companyQuery || undefined,
    family: familyQuery || undefined,
    service: serviceQuery || undefined,
  };
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRosterItem | null>(null);
  const [triggering, setTriggering] = useState<ServiceRosterItem | null>(null);

  const rosterSearch: ServiceRosterSearchInput = {
    query: query.trim() || undefined,
    companyQuery: companyQuery || undefined,
    familyQuery: familyQuery || undefined,
    serviceQuery: serviceQuery || undefined,
    statuses,
    familyIds,
    archived,
    page,
    limit,
    sortBy,
    sortOrder,
  };
  const roster = useServiceRoster(rosterSearch);
  const familyFacets = useServiceRosterFamilies();
  useEffect(() => {
    if (preference.isLoading || preferenceReady.current) return;
    const restored = parseServiceRosterPreference(preference.data?.value);
    setColumnWidths(restored.columnWidths);
    setColumnOrder(restored.columnOrder);
    setColumnVisibility(restored.columnVisibility);
    preferenceReady.current = true;
  }, [preference.data?.value, preference.isLoading]);

  const items = useMemo(() => roster.data?.items ?? [], [roster.data?.items]);
  const families = useMemo(
    () => providedFamilies ?? familyFacets.data ?? [],
    [familyFacets.data, providedFamilies],
  );

  const replaceUrl = useCallback((next: Partial<Record<string, string | undefined>>) => {
    const params = new URLSearchParams(effectiveSearchKey);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    setOptimisticSearchKey(params.toString());
    router.replace(nextUrl, { scroll: false });
  }, [effectiveSearchKey, pathname, router]);

  useEffect(() => {
    if (!preference.data?.value) return;
    const next: Partial<Record<string, string>> = {};
    if (!new URLSearchParams(canonicalSearchKey).has('limit')) next.limit = String(parsedPreference.pageSize);
    if (!new URLSearchParams(canonicalSearchKey).has('sortBy')) next.sortBy = parsedPreference.sortBy;
    if (!new URLSearchParams(canonicalSearchKey).has('sortOrder')) next.sortOrder = parsedPreference.sortOrder;
    if (Object.keys(next).length > 0) replaceUrl(next);
  }, [canonicalSearchKey, parsedPreference, preference.data?.value, replaceUrl]);

  const currentPreference = useMemo((): ServiceRosterPreference => ({
    version: 1,
    columnWidths,
    columnOrder,
    columnVisibility,
    sortBy,
    sortOrder,
    pageSize: limit,
  }), [columnOrder, columnVisibility, columnWidths, limit, sortBy, sortOrder]);
  const currentPreferenceRef = useRef<ServiceRosterPreference>(currentPreference);
  currentPreferenceRef.current = currentPreference;

  const persistPreference = useCallback((overrides: Partial<ServiceRosterPreference> = {}, debounce = false) => {
    if (!preferenceReady.current) return;
    if (debounce) {
      pendingPreferencePatch.current = { ...pendingPreferencePatch.current, ...overrides };
      if (resizeSaveTimer.current) clearTimeout(resizeSaveTimer.current);
      resizeSaveTimer.current = setTimeout(() => {
        const value = {
          ...currentPreferenceRef.current,
          ...pendingPreferencePatch.current,
        };
        pendingPreferencePatch.current = {};
        savePreference.mutate({ key: TABLE_PREFERENCE_KEY, value });
        resizeSaveTimer.current = null;
      }, 250);
      return;
    }
    if (resizeSaveTimer.current) {
      clearTimeout(resizeSaveTimer.current);
      resizeSaveTimer.current = null;
    }
    const value = {
      ...currentPreferenceRef.current,
      ...pendingPreferencePatch.current,
      ...overrides,
    };
    pendingPreferencePatch.current = {};
    currentPreferenceRef.current = value;
    savePreference.mutate({ key: TABLE_PREFERENCE_KEY, value });
  }, [savePreference]);

  useEffect(() => () => {
    if (resizeSaveTimer.current) clearTimeout(resizeSaveTimer.current);
    resizeSaveTimer.current = null;
    pendingPreferencePatch.current = {};
  }, []);

  const toggleStatus = (status: ServiceStatus) => {
    const nextStatuses = statuses.includes(status) ? statuses.filter((value) => value !== status) : [...statuses, status];
    replaceUrl({ statuses: nextStatuses.join(','), page: '1' });
  };

  const toggleFamily = (familyId: string) => {
    const nextFamilyIds = familyIds.includes(familyId) ? familyIds.filter((id) => id !== familyId) : [...familyIds, familyId];
    replaceUrl({ familyIds: nextFamilyIds.length > 0 ? nextFamilyIds.join(',') : undefined, page: '1' });
  };

  const updateQuery = (value: string) => {
    replaceUrl({ query: value.trim() || undefined, page: '1' });
  };

  const updateInlineFilter = (next: Partial<ServiceRosterInlineFilters>) => {
    replaceUrl({
      companyQuery: next.company === undefined ? companyQuery || undefined : next.company.trim() || undefined,
      familyQuery: next.family === undefined ? familyQuery || undefined : next.family.trim() || undefined,
      serviceQuery: next.service === undefined ? serviceQuery || undefined : next.service.trim() || undefined,
      page: '1',
    });
  };

  const updateSort = (nextSortBy: ServiceRosterSortBy) => {
    const nextOrder = sortBy === nextSortBy && sortOrder === 'asc' ? 'desc' : 'asc';
    replaceUrl({ sortBy: nextSortBy, sortOrder: nextOrder });
    persistPreference({ sortBy: nextSortBy, sortOrder: nextOrder });
  };

  const updateColumns = (columnId: ServiceRosterColumnId, width: number) => {
    setColumnWidths((current) => ({ ...current, [columnId]: Math.round(width) }));
  };

  const finishColumnResize = (columnId: ServiceRosterColumnId, width: number) => {
    const nextWidths = { ...columnWidths, [columnId]: Math.round(width) };
    setColumnWidths(nextWidths);
    persistPreference({ columnWidths: nextWidths }, true);
  };

  const toggleColumnVisibility = (columnId: ServiceRosterColumnId) => {
    if (columnId === 'actions') return;
    const nextVisibility = { ...columnVisibility, [columnId]: !columnVisibility[columnId] };
    setColumnVisibility(nextVisibility);
    persistPreference({ columnVisibility: nextVisibility });
  };

  const moveColumn = (columnId: ServiceRosterColumnId, direction: -1 | 1) => {
    const index = columnOrder.indexOf(columnId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= columnOrder.length) return;
    const nextOrder = [...columnOrder];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex]!, nextOrder[index]!];
    setColumnOrder(nextOrder);
    persistPreference({ columnOrder: nextOrder });
  };

  const filterBadges = activeFilterLabel(query, inlineFilters, statuses, familyIds, families, archived);
  const total = roster.data?.total ?? 0;
  const totalPages = roster.data?.totalPages ?? 0;

  return (
    <section aria-labelledby="services-roster-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="services-roster-heading" className="text-lg font-semibold text-text-primary">Services roster</h2>
          <p className="mt-1 text-sm text-text-secondary">Track active services across accessible companies.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={columnsOpen}
            onClick={() => setColumnsOpen((open) => !open)}
            className="min-h-11 rounded-lg border border-border-primary px-3 text-sm font-medium text-text-secondary hover:border-oak-primary/50 hover:text-text-primary"
          >
            Customize columns
          </button>
          {canCreate ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>Add service</Button> : null}
        </div>
      </div>

      {columnsOpen ? (
        <div role="dialog" aria-label="Customize columns" className="rounded-xl border border-border-primary bg-background-secondary p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text-primary">Table columns</p>
            <p className="text-xs text-text-muted">Choose visibility and order</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {columnOrder.map((column, index) => (
              <div key={column} className="flex min-h-11 items-center gap-2 rounded-lg border border-border-primary px-2">
                <label className="flex min-h-11 min-w-0 flex-1 self-stretch items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={columnVisibility[column]}
                    disabled={column === 'actions'}
                    aria-label={`Show ${columnLabels[column]} column`}
                    onChange={() => toggleColumnVisibility(column)}
                  />
                  <span className="truncate">{columnLabels[column]}</span>
                </label>
                <button type="button" aria-label={`Move ${columnLabels[column]} column up`} disabled={index === 0} onClick={() => moveColumn(column, -1)} className="min-h-11 min-w-11 rounded text-text-muted hover:bg-background-tertiary disabled:opacity-40">↑</button>
                <button type="button" aria-label={`Move ${columnLabels[column]} column down`} disabled={index === columnOrder.length - 1} onClick={() => moveColumn(column, 1)} className="min-h-11 min-w-11 rounded text-text-muted hover:bg-background-tertiary disabled:opacity-40">↓</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div role="group" aria-label="Service filters" className="space-y-3 rounded-xl border border-border-primary bg-background-secondary p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-text-muted">Status</span>
          {STATUS_VALUES.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={statuses.includes(status)}
              onClick={() => toggleStatus(status)}
              className={statuses.includes(status) ? 'min-h-11 rounded-full bg-oak-primary px-3 text-xs font-medium text-white' : 'min-h-11 rounded-full border border-border-primary px-3 text-xs font-medium text-text-secondary hover:border-oak-primary/50 hover:text-text-primary'}
            >
              {status.charAt(0) + status.slice(1).toLowerCase()}
            </button>
          ))}
          <FamilyFilterChips families={families} selectedIds={familyIds} onToggle={toggleFamily} />
          <button
            type="button"
            aria-pressed={archived}
            onClick={() => replaceUrl({ archived: String(!archived), page: '1' })}
            className={archived ? 'min-h-11 rounded-full bg-background-tertiary px-3 text-xs font-medium text-text-primary' : 'min-h-11 rounded-full border border-border-primary px-3 text-xs font-medium text-text-secondary hover:text-text-primary'}
          >
            Archived
          </button>
        </div>
        {!providedFamilies && familyFacets.error ? (
          <Alert variant="error" title="Family filters unavailable" compact>
            <div className="flex flex-wrap items-center gap-2">
              <span>{familyFacets.error instanceof Error ? familyFacets.error.message : 'Unable to load family filters.'}</span>
              <button
                type="button"
                aria-label="Retry family filters"
                onClick={() => familyFacets.refetch()}
                className="min-h-11 rounded-md border border-current px-3 text-sm font-medium hover:bg-black/10 dark:hover:bg-white/10"
              >
                Retry
              </button>
            </div>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex min-h-11 min-w-0 flex-1 items-center rounded-lg border border-border-primary bg-background-secondary/50 focus-within:border-oak-primary focus-within:ring-2 focus-within:ring-oak-primary/20">
            <Search className="ml-3 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            <span className="sr-only">Search services</span>
            <input type="search" aria-label="Search services" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search companies or services" className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm text-text-primary outline-none placeholder:text-text-muted" />
            {query ? <button type="button" aria-label="Clear search" onClick={() => updateQuery('')} className="mr-2 flex min-h-11 min-w-11 items-center justify-center rounded text-text-muted hover:bg-background-tertiary"><X className="h-4 w-4" aria-hidden="true" /></button> : null}
          </label>
          <span className="text-xs text-text-secondary">{total.toLocaleString()} services</span>
        </div>
      </div>

      {filterBadges.length > 0 ? (
        <div aria-label="Active filters" className="flex flex-wrap items-center gap-2">
          {filterBadges.map((label) => <span key={label} className="inline-flex min-h-8 items-center rounded-full bg-oak-primary/10 px-2.5 text-xs text-oak-light">{label}</span>)}
        </div>
      ) : null}

      {roster.error ? <Alert variant="error">Unable to load services. {roster.error instanceof Error ? roster.error.message : ''}</Alert> : null}
      {roster.isLoading && !roster.data ? <div role="status" className="rounded-xl border border-border-primary bg-background-secondary p-8 text-center text-sm text-text-secondary">Loading services…</div> : null}
      {!roster.isLoading && !roster.error && items.length === 0 ? <div className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-8 text-center text-sm text-text-secondary">No services match the selected filters.</div> : null}
      {items.length > 0 ? (
        <ServiceRosterTable
          items={items}
          canEdit={canEdit}
          isFetching={roster.isFetching}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={updateSort}
          inlineFilters={inlineFilters}
          onInlineFilterChange={updateInlineFilter}
          columnWidths={columnWidths}
          columnOrder={columnOrder}
          columnVisibility={columnVisibility}
          onColumnWidthChange={updateColumns}
          onColumnResizeEnd={finishColumnResize}
          onEdit={setEditing}
          onTrigger={canTrigger ? setTriggering : undefined}
        />
      ) : null}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        pageSizeOptions={SERVICE_ROSTER_PAGE_SIZES}
        onPageChange={(nextPage) => replaceUrl({ page: String(nextPage) })}
        onLimitChange={(nextLimit) => {
          const safeLimit = SERVICE_ROSTER_PAGE_SIZES.includes(nextLimit as (typeof SERVICE_ROSTER_PAGE_SIZES)[number])
            ? nextLimit
            : defaultServiceRosterPreference.pageSize;
          replaceUrl({ limit: String(safeLimit), page: '1' });
          persistPreference({ pageSize: safeLimit });
        }}
      />

      <AddClientServiceDialog isOpen={addOpen} onClose={() => setAddOpen(false)} onCreated={() => roster.refetch?.()} />
      {editing ? <ServiceEditorLauncher item={editing} onClose={() => { setEditing(null); roster.refetch?.(); }} /> : null}
      {canTrigger && triggering ? <ManualCycleLauncher item={triggering} canApply={canTrigger} onClose={() => setTriggering(null)} onApplied={() => { setTriggering(null); roster.refetch?.(); }} /> : null}
    </section>
  );
}
