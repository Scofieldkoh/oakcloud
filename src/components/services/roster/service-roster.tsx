'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { Alert } from '@/components/ui/alert';
import { useClientService } from '@/hooks/use-client-services';
import { useServiceRoster, type ServiceRosterSearchInput } from '@/hooks/use-service-roster';
import { useUpsertUserPreference, useUserPreference } from '@/hooks/use-user-preferences';
import type { ServiceRosterItem } from '@/services/service-roster';
import { FamilyFilterChips, type ServiceFamilyFilter } from '@/components/services/shared/family-filter-chips';
import { AddClientServiceDialog } from './add-client-service-dialog';
import {
  ServiceRosterTable,
  type ServiceRosterColumnId,
  type ServiceRosterColumnWidths,
  type ServiceRosterInlineFilters,
  type ServiceRosterSortBy,
} from './service-roster-table';
import { ClientServiceEditor } from '@/components/companies/company-detail/client-service-editor';

const TABLE_PREFERENCE_KEY = 'services.roster.table.v1';
const STATUS_VALUES = ['ACTIVE', 'PAUSED', 'ENDED'] as const;
type ServiceStatus = (typeof STATUS_VALUES)[number];

interface ServiceRosterPreference {
  columnWidths?: ServiceRosterColumnWidths;
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

function ServiceEditorLauncher({ item, onClose }: { item: ServiceRosterItem; onClose: () => void }) {
  const service = useClientService(item.id);
  if (!service.data) {
    return service.isLoading ? <p role="status" className="sr-only">Loading service editor…</p> : null;
  }
  return <ClientServiceEditor service={service.data} isOpen onClose={onClose} />;
}

function familyFiltersFromItems(items: ServiceRosterItem[]): ServiceFamilyFilter[] {
  const byId = new Map<string, ServiceFamilyFilter>();
  for (const item of items) {
    if (!byId.has(item.family.id)) {
      byId.set(item.family.id, {
        id: item.family.id,
        name: item.family.name,
        displayColor: item.family.displayColor,
      });
    }
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('query') ?? '');
  const [statuses, setStatuses] = useState<ServiceStatus[]>(() => readStatuses(searchParams.get('statuses')));
  const [familyIds, setFamilyIds] = useState<string[]>(() => searchParams.get('familyIds')?.split(',').filter(Boolean) ?? []);
  const [archived, setArchived] = useState(() => searchParams.get('archived') === 'true');
  const [page, setPage] = useState(() => readPage(searchParams.get('page')));
  const [limit, setLimit] = useState(() => readLimit(searchParams.get('limit')));
  const [sortBy, setSortBy] = useState<ServiceRosterSortBy>(() => (searchParams.get('sortBy') as ServiceRosterSortBy) || 'company');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc');
  const [inlineFilters, setInlineFilters] = useState<ServiceRosterInlineFilters>({});
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRosterItem | null>(null);
  const [columnWidths, setColumnWidths] = useState<ServiceRosterColumnWidths>({});

  const rosterSearch: ServiceRosterSearchInput = {
    query: query.trim() || undefined,
    statuses,
    familyIds,
    archived,
    page,
    limit,
    sortBy,
    sortOrder,
  };
  const roster = useServiceRoster(rosterSearch);
  const preference = useUserPreference<ServiceRosterPreference>(TABLE_PREFERENCE_KEY);
  const savePreference = useUpsertUserPreference<ServiceRosterPreference>();
  useEffect(() => {
    const value = preference.data?.value?.columnWidths;
    if (!value) return;
    setColumnWidths((current) => Object.keys(current).length === 0 ? value : current);
  }, [preference.data?.value]);

  const items = useMemo(() => roster.data?.items ?? [], [roster.data?.items]);
  const families = useMemo(
    () => providedFamilies ?? familyFiltersFromItems(items),
    [items, providedFamilies],
  );

  const visibleItems = useMemo(() => items.filter((item) => {
    const companyMatches = !inlineFilters.company || item.company.name.toLowerCase().includes(inlineFilters.company.toLowerCase());
    const familyMatches = !inlineFilters.family || item.family.name.toLowerCase().includes(inlineFilters.family.toLowerCase());
    const serviceMatches = !inlineFilters.service || item.serviceName.toLowerCase().includes(inlineFilters.service.toLowerCase());
    return companyMatches && familyMatches && serviceMatches;
  }), [inlineFilters, items]);

  const replaceUrl = (next: Partial<Record<string, string | undefined>>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  };

  const toggleStatus = (status: ServiceStatus) => {
    const nextStatuses = statuses.includes(status) ? statuses.filter((value) => value !== status) : [...statuses, status];
    setStatuses(nextStatuses);
    setPage(1);
    replaceUrl({ statuses: nextStatuses.join(','), page: '1' });
  };

  const toggleFamily = (familyId: string) => {
    const nextFamilyIds = familyIds.includes(familyId) ? familyIds.filter((id) => id !== familyId) : [...familyIds, familyId];
    setFamilyIds(nextFamilyIds);
    setPage(1);
    replaceUrl({ familyIds: nextFamilyIds.join(','), page: '1' });
  };

  const updateQuery = (value: string) => {
    setQuery(value);
    setPage(1);
    replaceUrl({ query: value.trim() || undefined, page: '1' });
  };

  const updateSort = (nextSortBy: ServiceRosterSortBy) => {
    const nextOrder = sortBy === nextSortBy && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(nextSortBy);
    setSortOrder(nextOrder);
    replaceUrl({ sortBy: nextSortBy, sortOrder: nextOrder });
  };

  const updateColumns = (columnId: ServiceRosterColumnId, width: number) => {
    setColumnWidths((current) => {
      const next = { ...current, [columnId]: Math.round(width) };
      savePreference.mutate({ key: TABLE_PREFERENCE_KEY, value: { columnWidths: next } });
      return next;
    });
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
        {canCreate ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>Add service</Button> : null}
      </div>

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
            onClick={() => { setArchived((value) => !value); setPage(1); replaceUrl({ archived: String(!archived), page: '1' }); }}
            className={archived ? 'min-h-11 rounded-full bg-background-tertiary px-3 text-xs font-medium text-text-primary' : 'min-h-11 rounded-full border border-border-primary px-3 text-xs font-medium text-text-secondary hover:text-text-primary'}
          >
            Archived
          </button>
        </div>
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
      {!roster.isLoading && !roster.error && visibleItems.length === 0 ? <div className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-8 text-center text-sm text-text-secondary">No services match the selected filters.</div> : null}
      {visibleItems.length > 0 ? (
        <ServiceRosterTable
          items={visibleItems}
          canEdit={canEdit}
          isFetching={roster.isFetching}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={updateSort}
          inlineFilters={inlineFilters}
          onInlineFilterChange={(next) => setInlineFilters((current) => ({ ...current, ...next }))}
          columnWidths={columnWidths}
          onColumnWidthChange={updateColumns}
          onEdit={setEditing}
        />
      ) : null}

      <Pagination
        page={roster.data?.page ?? page}
        totalPages={totalPages}
        total={total}
        limit={roster.data?.limit ?? limit}
        onPageChange={(nextPage) => { setPage(nextPage); replaceUrl({ page: String(nextPage) }); }}
        onLimitChange={(nextLimit) => { setLimit(nextLimit); setPage(1); replaceUrl({ limit: String(nextLimit), page: '1' }); }}
      />

      <AddClientServiceDialog isOpen={addOpen} onClose={() => setAddOpen(false)} onCreated={() => roster.refetch?.()} />
      {editing ? <ServiceEditorLauncher item={editing} onClose={() => { setEditing(null); roster.refetch?.(); }} /> : null}
    </section>
  );
}
