'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { useDeadlines, useUpdateDeadlineOccurrence, type DeadlineSearchInput } from '@/hooks/use-deadlines';
import { useServiceRosterFamilies } from '@/hooks/use-service-roster-families';
import { useUpsertUserPreference, useUserPreference } from '@/hooks/use-user-preferences';
import { addCalendarDays, addMonthsClamped, currentDateInSingapore, type DateOnly } from '@/services/service-schedule';
import { parseDeadlineViewPreference, type DeadlineViewPreference } from '@/lib/validations/services-preferences';
import { DeadlineFilters, type DeadlineFilterType } from './deadline-filters';
import {
  DEADLINE_TABLE_COLUMNS,
  DeadlineTable,
  type DeadlineSortBy,
  type DeadlineTableColumnId,
} from './deadline-table';
import { DeadlineCalendar } from './deadline-calendar';

const VIEW_PREFERENCE_KEY = 'services.deadlines.view.v1';
const TYPE_VALUES: DeadlineFilterType[] = ['STATUTORY', 'CLIENT', 'INTERNAL'];
const SORT_VALUES: DeadlineSortBy[] = ['dueDate', 'company', 'family', 'service', 'type', 'status'];

interface DeadlineWorkspaceProps {
  canEdit?: boolean;
  workspaceId?: string;
}

interface UrlState {
  view: 'TABLE' | 'CALENDAR';
  from: DateOnly;
  to: DateOnly;
  types: DeadlineFilterType[];
  families: string[];
  companies: string[];
  openOnly: boolean;
  origin?: 'RULE' | 'MANUAL_TRIGGER';
  sortBy: DeadlineSortBy;
  sortOrder: 'asc' | 'desc';
  page: number;
}

function readList(value: string | null): string[] {
  return [...new Set((value ?? '').split(',').map((part) => part.trim()).filter(Boolean))];
}

function readTypes(value: string | null): DeadlineFilterType[] {
  return readList(value).filter((type): type is DeadlineFilterType => TYPE_VALUES.includes(type as DeadlineFilterType));
}

function readDate(value: string | null, fallback: DateOnly): DateOnly {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value as DateOnly : fallback;
}

function readPage(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function readSortBy(value: string | null, fallback: DeadlineSortBy): DeadlineSortBy {
  return value && SORT_VALUES.includes(value as DeadlineSortBy) ? value as DeadlineSortBy : fallback;
}

function readSortOrder(value: string | null, fallback: 'asc' | 'desc'): 'asc' | 'desc' {
  return value === 'asc' || value === 'desc' ? value : fallback;
}

function dateFromMonth(value: string | null): Date {
  const today = currentDateInSingapore();
  const candidate = /^\d{4}-\d{2}$/.test(value ?? '') ? String(value) + '-01' : today.slice(0, 7) + '-01';
  const [year, month, day] = candidate.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function currentRange(): { from: DateOnly; to: DateOnly } {
  const from = currentDateInSingapore();
  return { from, to: addCalendarDays(from, 30) };
}

function columnsFromPreference(preference: DeadlineViewPreference): DeadlineTableColumnId[] {
  const valid = preference.tableColumnOrder.filter((column): column is DeadlineTableColumnId => DEADLINE_TABLE_COLUMNS.includes(column as DeadlineTableColumnId));
  return [...new Set([...valid, ...DEADLINE_TABLE_COLUMNS])];
}

export function DeadlineWorkspace({ canEdit = false }: DeadlineWorkspaceProps) {
  const preference = useUserPreference<DeadlineViewPreference>(VIEW_PREFERENCE_KEY);
  const savePreference = useUpsertUserPreference<DeadlineViewPreference>();
  const familyFacets = useServiceRosterFamilies();
  const parsedPreference = useMemo(
    () => parseDeadlineViewPreference(preference.data?.value),
    [preference.data?.value],
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canonicalSearchKey = searchParams.toString();
  const [optimisticSearchKey, setOptimisticSearchKey] = useState<string | null>(null);
  const effectiveSearchKey = optimisticSearchKey ?? canonicalSearchKey;

  useEffect(() => setOptimisticSearchKey(null), [canonicalSearchKey]);

  const urlState = useMemo<UrlState>(() => {
    const params = new URLSearchParams(effectiveSearchKey);
    const fallback = currentRange();
    const hasTypes = params.has('types');
    const hasFamilies = params.has('families');
    const hasView = params.has('deadlineView');
    return {
      view: params.get('deadlineView') === 'CALENDAR' || (!hasView && parsedPreference.defaultView === 'CALENDAR') ? 'CALENDAR' : 'TABLE',
      from: readDate(params.get('from'), fallback.from),
      to: readDate(params.get('to'), fallback.to),
      types: hasTypes ? readTypes(params.get('types')) : parsedPreference.visibleTypes,
      families: hasFamilies ? readList(params.get('families')) : parsedPreference.familyIds,
      companies: readList(params.get('companies')),
      openOnly: params.has('openOnly') ? params.get('openOnly') === 'true' : false,
      origin: params.get('origin') === 'RULE' || params.get('origin') === 'MANUAL_TRIGGER' ? params.get('origin') as UrlState['origin'] : undefined,
      sortBy: readSortBy(params.get('sortBy'), parsedPreference.sortBy),
      sortOrder: readSortOrder(params.get('sortOrder'), parsedPreference.sortOrder),
      page: readPage(params.get('page')),
    };
  }, [effectiveSearchKey, parsedPreference]);

  const focusMonth = useMemo(
    () => dateFromMonth(new URLSearchParams(effectiveSearchKey).get('from')?.slice(0, 7) ?? null),
    [effectiveSearchKey],
  );
  const query: DeadlineSearchInput = {
    from: urlState.from,
    to: urlState.to,
    mode: urlState.view,
    types: urlState.types,
    familyIds: urlState.families,
    companyIds: urlState.companies,
    openOnly: urlState.openOnly,
    origin: urlState.origin,
    page: urlState.page,
    limit: 20,
    sortBy: urlState.sortBy,
    sortOrder: urlState.sortOrder,
  };
  const deadlines = useDeadlines(query);
  const updateDeadline = useUpdateDeadlineOccurrence();
  const families = familyFacets.data ?? [];
  const allFamiliesSelected = urlState.families.length === 0;

  const replaceUrl = useCallback((next: Partial<Record<string, string | undefined>>) => {
    const params = new URLSearchParams(effectiveSearchKey);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    const nextKey = params.toString();
    setOptimisticSearchKey(nextKey);
    router.replace(nextKey ? pathname + '?' + nextKey : pathname, { scroll: false });
  }, [effectiveSearchKey, pathname, router]);

  const persistPreference = (patch: Partial<DeadlineViewPreference>) => {
    savePreference.mutate({
      key: VIEW_PREFERENCE_KEY,
      value: { ...parsedPreference, ...patch, version: 1 },
    });
  };

  const updateTypes = (type: DeadlineFilterType) => {
    const selected = new Set(urlState.types);
    if (selected.has(type)) selected.delete(type);
    else selected.add(type);
    replaceUrl({ types: [...selected].filter((value) => TYPE_VALUES.includes(value)).join(','), page: '1' });
  };

  const updateFamily = (familyId: string) => {
    const allIds = families.map((family) => family.id);
    const selected = new Set(allFamiliesSelected ? allIds : urlState.families);
    if (selected.has(familyId)) selected.delete(familyId);
    else selected.add(familyId);
    const next = [...selected].filter((id) => allIds.includes(id));
    replaceUrl({ families: next.length === allIds.length ? undefined : next.join(','), page: '1' });
  };

  const tablePreference = {
    widths: parsedPreference.tableColumnWidths,
    order: columnsFromPreference(parsedPreference),
    visibility: Object.fromEntries(
      DEADLINE_TABLE_COLUMNS.map((column) => [column, parsedPreference.tableColumnVisibility[column] !== false]),
    ) as Record<DeadlineTableColumnId, boolean>,
  };
  const items = deadlines.data?.items ?? [];

  const switchView = (view: 'TABLE' | 'CALENDAR') => {
    replaceUrl({ deadlineView: view, page: '1' });
    persistPreference({ defaultView: view });
  };

  const handleCalendarMonthChange = (month: Date) => {
    const from = (String(month.getFullYear()).padStart(4, '0') + '-' + String(month.getMonth() + 1).padStart(2, '0') + '-01') as DateOnly;
    const to = addCalendarDays(addMonthsClamped(from, parsedPreference.monthCount ?? 1), -1);
    replaceUrl({ from, to });
  };

  const markComplete = canEdit
    ? (occurrence: import('@/services/deadline').DeadlineOccurrenceDto) => {
      updateDeadline.mutate({
        id: occurrence.id,
        data: { expectedUpdatedAt: occurrence.updatedAt, status: 'COMPLETED' },
      });
    }
    : undefined;

  return (
    <section aria-label="Deadline workspace" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Deadlines</h2>
          <p className="text-sm text-text-secondary">Monitor statutory, client, and internal deadlines across accessible companies.</p>
        </div>
        <div role="group" aria-label="Deadline view" className="inline-flex min-h-11 items-center rounded-xl border border-border-primary bg-background-secondary p-1">
          <button type="button" aria-pressed={urlState.view === 'TABLE'} onClick={() => switchView('TABLE')} className={urlState.view === 'TABLE' ? 'min-h-9 rounded-lg bg-oak-primary px-3 text-xs font-medium text-white' : 'min-h-9 rounded-lg px-3 text-xs font-medium text-text-secondary hover:text-text-primary'}>Table view</button>
          <button type="button" aria-pressed={urlState.view === 'CALENDAR'} onClick={() => switchView('CALENDAR')} className={urlState.view === 'CALENDAR' ? 'min-h-9 rounded-lg bg-oak-primary px-3 text-xs font-medium text-white' : 'min-h-9 rounded-lg px-3 text-xs font-medium text-text-secondary hover:text-text-primary'}>Calendar view</button>
        </div>
      </div>

      <DeadlineFilters
        families={families}
        selectedTypes={urlState.types}
        selectedFamilyIds={urlState.families}
        allFamiliesSelected={allFamiliesSelected}
        openOnly={urlState.openOnly}
        onToggleType={updateTypes}
        onToggleFamily={updateFamily}
        onToggleOpenOnly={() => replaceUrl({ openOnly: String(!urlState.openOnly), page: '1' })}
      />

      <div aria-label="Active deadline filters" className="flex flex-wrap items-center gap-2">
        {urlState.types.map((type) => <span key={type} className="inline-flex min-h-8 items-center rounded-full bg-oak-primary/10 px-2.5 text-xs text-oak-light">{type.charAt(0) + type.slice(1).toLowerCase()}</span>)}
        {urlState.openOnly ? <span className="inline-flex min-h-8 items-center rounded-full bg-oak-primary/10 px-2.5 text-xs text-oak-light">Open only</span> : null}
        {!allFamiliesSelected ? families.filter((family) => urlState.families.includes(family.id)).map((family) => <span key={family.id} className="inline-flex min-h-8 items-center rounded-full bg-oak-primary/10 px-2.5 text-xs text-oak-light">{family.name}</span>) : null}
      </div>

      {deadlines.error ? <Alert variant="error">Unable to load deadlines. {deadlines.error instanceof Error ? deadlines.error.message : ''}</Alert> : null}
      {deadlines.isLoading && !deadlines.data ? <div role="status" className="rounded-xl border border-border-primary bg-background-secondary p-8 text-center text-sm text-text-secondary">Loading deadlines…</div> : null}

      {urlState.view === 'TABLE' ? (
        <DeadlineTable
          items={items}
          isFetching={deadlines.isFetching}
          page={deadlines.data?.mode === 'TABLE' ? deadlines.data.page : urlState.page}
          total={deadlines.data?.mode === 'TABLE' ? deadlines.data.total : 0}
          limit={deadlines.data?.mode === 'TABLE' ? deadlines.data.limit : 20}
          totalPages={deadlines.data?.mode === 'TABLE' ? deadlines.data.totalPages : 0}
          sortBy={urlState.sortBy}
          sortOrder={urlState.sortOrder}
          columnWidths={tablePreference.widths}
          columnOrder={tablePreference.order}
          columnVisibility={tablePreference.visibility}
          canEdit={canEdit}
          onSort={(sortBy) => {
            const sortOrder = urlState.sortBy === sortBy && urlState.sortOrder === 'asc' ? 'desc' : 'asc';
            replaceUrl({ sortBy, sortOrder, page: '1' });
            persistPreference({ sortBy, sortOrder });
          }}
          onPageChange={(page) => replaceUrl({ page: String(page) })}
          onLimitChange={() => replaceUrl({ page: '1' })}
          onColumnResizeEnd={(columnId, width) => persistPreference({ tableColumnWidths: { ...parsedPreference.tableColumnWidths, [columnId]: width } })}
          onComplete={markComplete}
        />
      ) : (
        <DeadlineCalendar
          items={undefined}
          focusMonth={focusMonth}
          monthCount={parsedPreference.monthCount}
          preferenceValue={parsedPreference}
          search={query}
          onMonthChange={handleCalendarMonthChange}
          onMonthCountChange={(monthCount) => persistPreference({ monthCount })}
          onComplete={markComplete}
        />
      )}
    </section>
  );
}
