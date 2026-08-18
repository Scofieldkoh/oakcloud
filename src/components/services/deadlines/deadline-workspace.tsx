'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import {
  useDeadlines,
  useResetDeadlineDateOverride,
  useUpdateDeadlineOccurrence,
  type DeadlineSearchInput,
} from '@/hooks/use-deadlines';
import { useServiceRosterFamilies } from '@/hooks/use-service-roster-families';
import { useUpsertUserPreference, useUserPreference } from '@/hooks/use-user-preferences';
import {
  addCalendarDays,
  addMonthsClamped,
  compareDateOnly,
  currentDateInSingapore,
  parseDateOnly,
  type DateOnly,
} from '@/services/service-schedule';
import type { DeadlineOccurrenceDto } from '@/services/deadline';
import type { ResetDeadlineDateOverrideInput, UpdateDeadlineOccurrenceInput } from '@/lib/validations/deadline';
import {
  defaultDeadlineViewPreference,
  parseDeadlineViewPreference,
  type DeadlineViewPreference,
} from '@/lib/validations/services-preferences';
import { useIsLargeDesktop } from '@/hooks/use-media-query';
import {
  DeadlineFilters,
  DeadlineInlineFilters,
  type DeadlineFilterOrigin,
  type DeadlineFilterStatus,
  type DeadlineFilterType,
  type DeadlineInlineFilterValues,
} from './deadline-filters';
import {
  DEADLINE_TABLE_COLUMNS,
  DeadlineTable,
  type DeadlineSortBy,
  type DeadlineTableColumnId,
} from './deadline-table';
import { DeadlineCalendar } from './deadline-calendar';

const VIEW_PREFERENCE_KEY = 'services.deadlines.view.v1';
const TYPE_VALUES: DeadlineFilterType[] = ['STATUTORY', 'CLIENT', 'INTERNAL'];
const STATUS_VALUES: DeadlineFilterStatus[] = ['OPEN', 'COMPLETED', 'WAIVED', 'CANCELLED'];
const SORT_VALUES: DeadlineSortBy[] = ['dueDate', 'company', 'family', 'service', 'type', 'status'];
const PAGE_SIZE_VALUES = [10, 20, 50, 100] as const;
type DeadlinePageSize = (typeof PAGE_SIZE_VALUES)[number];

export interface DeadlineUrlState {
  view: 'TABLE' | 'CALENDAR';
  from: DateOnly;
  to: DateOnly;
  types: DeadlineFilterType[];
  families: string[];
  companies: string[];
  companyQuery: string;
  serviceQuery: string;
  milestoneQuery: string;
  statuses: DeadlineFilterStatus[];
  openOnly: boolean;
  origin?: DeadlineFilterOrigin;
  sortBy: DeadlineSortBy;
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: DeadlinePageSize;
}

interface DeadlineWorkspaceProps {
  canEdit?: boolean;
  deadlineWritesEnabled?: boolean;
  workspaceId?: string;
}

function readDate(value: string | null): DateOnly | null {
  if (!value) return null;
  try {
    parseDateOnly(value as DateOnly);
    return value as DateOnly;
  } catch {
    return null;
  }
}

function readUuidList(value: string | null): string[] {
  return [...new Set((value ?? '').split(',').map((part) => part.trim()).filter((part) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(part)))];
}

function readList(value: string | null): string[] {
  return [...new Set((value ?? '').split(',').map((part) => part.trim()).filter(Boolean))];
}

function readTypes(value: string | null): DeadlineFilterType[] {
  return readList(value).filter((type): type is DeadlineFilterType => TYPE_VALUES.includes(type as DeadlineFilterType));
}

function readStatuses(value: string | null): DeadlineFilterStatus[] {
  return readList(value).filter((status): status is DeadlineFilterStatus => STATUS_VALUES.includes(status as DeadlineFilterStatus));
}

function readPage(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function readLimit(value: string | null, fallback: DeadlinePageSize): DeadlinePageSize {
  const limit = Number(value);
  return PAGE_SIZE_VALUES.includes(limit as DeadlinePageSize) ? limit as DeadlinePageSize : fallback;
}

function readSortBy(value: string | null, fallback: DeadlineSortBy): DeadlineSortBy {
  return value && SORT_VALUES.includes(value as DeadlineSortBy) ? value as DeadlineSortBy : fallback;
}

function readSortOrder(value: string | null, fallback: 'asc' | 'desc'): 'asc' | 'desc' {
  return value === 'asc' || value === 'desc' ? value : fallback;
}

function dateFromMonth(value: DateOnly): Date {
  const [year, month] = value.split('-').map(Number);
  const result = new Date(0);
  result.setHours(12, 0, 0, 0);
  result.setFullYear(year, month - 1, 1);
  return result;
}

function monthRange(month: Date, count: number): { from: DateOnly; to: DateOnly } {
  const from = `${String(month.getFullYear()).padStart(4, '0')}-${String(month.getMonth() + 1).padStart(2, '0')}-01` as DateOnly;
  const next = addMonthsClamped(from, count);
  return { from, to: addCalendarDays(next, -1) };
}

function currentRange(today: DateOnly): { from: DateOnly; to: DateOnly } {
  try {
    return { from: today, to: addCalendarDays(today, 30) };
  } catch {
    return { from: today, to: today };
  }
}

function safeCalendarRange(focusMonth: Date, count: 1 | 2 | 3, fallback: DateOnly): { from: DateOnly; to: DateOnly } {
  try {
    return monthRange(focusMonth, count);
  } catch {
    try {
      return monthRange(dateFromMonth(`${fallback.slice(0, 7)}-01` as DateOnly), count);
    } catch {
      return { from: fallback, to: fallback };
    }
  }
}

function hasValidRange(from: DateOnly | null, to: DateOnly | null): from is DateOnly {
  if (!from || !to || compareDateOnly(from, to) > 0) return false;
  return (parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / 86_400_000 <= 366;
}

function effectiveCalendarMonthCount(preference: DeadlineViewPreference, isLargeDesktop: boolean): 1 | 2 | 3 {
  if (!isLargeDesktop) return 1;
  return preference.monthCount ?? 2;
}

export function parseDeadlineUrlState(
  searchKey: string,
  preference: DeadlineViewPreference = defaultDeadlineViewPreference,
  isLargeDesktop = true,
  today: DateOnly = currentDateInSingapore(),
): DeadlineUrlState {
  const params = new URLSearchParams(searchKey);
  const hasView = params.has('deadlineView');
  const view = params.get('deadlineView') === 'CALENDAR' || (!hasView && preference.defaultView === 'CALENDAR') ? 'CALENDAR' : 'TABLE';
  const monthCount = effectiveCalendarMonthCount(preference, isLargeDesktop);
  const candidateFrom = readDate(params.get('from'));
  const candidateTo = readDate(params.get('to'));
  const focusMonth = dateFromMonth(candidateFrom ?? `${today.slice(0, 7)}-01` as DateOnly);
  const range = view === 'CALENDAR'
    ? safeCalendarRange(focusMonth, monthCount, today)
    : hasValidRange(candidateFrom, candidateTo) ? { from: candidateFrom, to: candidateTo! } : currentRange(today);
  const hasTypes = params.has('types');
  const hasFamilies = params.has('families');
  const visibleTypes = preference.visibleTypes.length > 0 ? preference.visibleTypes : TYPE_VALUES;
  const requestedTypes = hasTypes ? readTypes(params.get('types')) : [];
  const familyIds = preference.familyIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
  const fallbackPageSize = PAGE_SIZE_VALUES.includes(preference.pageSize as (typeof PAGE_SIZE_VALUES)[number]) ? preference.pageSize : 20;
  return {
    view,
    from: range.from,
    to: range.to,
    types: requestedTypes.length > 0 ? requestedTypes : visibleTypes,
    families: hasFamilies ? readUuidList(params.get('families')) : familyIds,
    companies: readUuidList(params.get('companies')),
    companyQuery: params.get('companyQuery')?.trim().slice(0, 200) ?? '',
    serviceQuery: params.get('serviceQuery')?.trim().slice(0, 200) ?? '',
    milestoneQuery: params.get('milestoneQuery')?.trim().slice(0, 200) ?? '',
    statuses: readStatuses(params.get('statuses')),
    openOnly: params.has('openOnly') ? params.get('openOnly') === 'true' : false,
    origin: params.get('origin') === 'RULE' || params.get('origin') === 'MANUAL_TRIGGER' ? params.get('origin') as DeadlineFilterOrigin : undefined,
    sortBy: readSortBy(params.get('sortBy'), preference.sortBy),
    sortOrder: readSortOrder(params.get('sortOrder'), preference.sortOrder),
    page: readPage(params.get('page')),
    limit: readLimit(params.get('limit'), fallbackPageSize),
  };
}

export { defaultDeadlineViewPreference } from '@/lib/validations/services-preferences';

function formatBadgeValue(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function DeadlineWorkspace({ canEdit = false, deadlineWritesEnabled = false }: DeadlineWorkspaceProps) {
  const isLargeDesktop = useIsLargeDesktop();
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
  const preferenceReady = useRef(false);
  const resizeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPreferencePatch = useRef<Partial<DeadlineViewPreference>>({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [columnOrder, setColumnOrder] = useState<DeadlineTableColumnId[]>([...DEADLINE_TABLE_COLUMNS]);
  const [columnVisibility, setColumnVisibility] = useState<Record<DeadlineTableColumnId, boolean>>(
    Object.fromEntries(DEADLINE_TABLE_COLUMNS.map((column) => [column, true])) as Record<DeadlineTableColumnId, boolean>,
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [savedTypes, setSavedTypes] = useState<DeadlineFilterType[]>(defaultDeadlineViewPreference.visibleTypes);
  const [savedFamilies, setSavedFamilies] = useState<string[]>(defaultDeadlineViewPreference.familyIds);
  const [calendarMonthCountOverride, setCalendarMonthCountOverride] = useState<1 | 2 | 3 | null>(null);

  useEffect(() => setOptimisticSearchKey(null), [canonicalSearchKey]);
  useEffect(() => {
    if (preference.isLoading || preferenceReady.current) return;
    setColumnWidths(parsedPreference.tableColumnWidths);
    setColumnOrder(parsedPreference.tableColumnOrder.length > 0 ? parsedPreference.tableColumnOrder as DeadlineTableColumnId[] : [...DEADLINE_TABLE_COLUMNS]);
    setColumnVisibility(Object.fromEntries(DEADLINE_TABLE_COLUMNS.map((column) => [column, parsedPreference.tableColumnVisibility[column] !== false])) as Record<DeadlineTableColumnId, boolean>);
    setSavedTypes(parsedPreference.visibleTypes);
    setSavedFamilies(parsedPreference.familyIds);
    preferenceReady.current = true;
  }, [parsedPreference, preference.isLoading]);

  const urlState = useMemo(
    () => parseDeadlineUrlState(effectiveSearchKey, calendarMonthCountOverride === null ? parsedPreference : { ...parsedPreference, monthCount: calendarMonthCountOverride }, isLargeDesktop),
    [calendarMonthCountOverride, effectiveSearchKey, isLargeDesktop, parsedPreference],
  );

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

  const currentPreference = useMemo<DeadlineViewPreference>(() => ({
    ...parsedPreference,
    version: 1,
    visibleTypes: savedTypes,
    familyIds: savedFamilies,
    tableColumnWidths: columnWidths,
    tableColumnOrder: columnOrder,
    tableColumnVisibility: columnVisibility,
    pageSize: urlState.limit,
    monthCount: calendarMonthCountOverride ?? parsedPreference.monthCount,
  }), [calendarMonthCountOverride, columnOrder, columnVisibility, columnWidths, parsedPreference, savedFamilies, savedTypes, urlState.limit]);
  const currentPreferenceRef = useRef(currentPreference);
  currentPreferenceRef.current = currentPreference;

  const persistPreference = useCallback((patch: Partial<DeadlineViewPreference>, debounce = false) => {
    if (!preferenceReady.current) return;
    if (debounce) {
      pendingPreferencePatch.current = { ...pendingPreferencePatch.current, ...patch };
      if (resizeSaveTimer.current) clearTimeout(resizeSaveTimer.current);
      resizeSaveTimer.current = setTimeout(() => {
        const value = { ...currentPreferenceRef.current, ...pendingPreferencePatch.current, version: 1 as const };
        pendingPreferencePatch.current = {};
        savePreference.mutate({ key: VIEW_PREFERENCE_KEY, value });
        resizeSaveTimer.current = null;
      }, 250);
      return;
    }
    if (resizeSaveTimer.current) {
      clearTimeout(resizeSaveTimer.current);
      resizeSaveTimer.current = null;
    }
    const value = { ...currentPreferenceRef.current, ...pendingPreferencePatch.current, ...patch, version: 1 as const };
    pendingPreferencePatch.current = {};
    currentPreferenceRef.current = value;
    savePreference.mutate({ key: VIEW_PREFERENCE_KEY, value });
  }, [savePreference]);

  useEffect(() => () => {
    if (resizeSaveTimer.current) clearTimeout(resizeSaveTimer.current);
    resizeSaveTimer.current = null;
    pendingPreferencePatch.current = {};
  }, []);

  const paramsForRange = useMemo(() => {
    const params = new URLSearchParams(effectiveSearchKey);
    return { from: readDate(params.get('from')), to: readDate(params.get('to')), rawFrom: params.get('from'), rawTo: params.get('to'), rawPage: params.get('page') };
  }, [effectiveSearchKey]);

  useEffect(() => {
    const calendarRangeChanged = urlState.view === 'CALENDAR' && (paramsForRange.rawFrom !== urlState.from || paramsForRange.rawTo !== urlState.to || paramsForRange.rawPage !== '1');
    const tableRangeInvalid = urlState.view === 'TABLE' && !hasValidRange(paramsForRange.from, paramsForRange.to);
    if (!calendarRangeChanged && !tableRangeInvalid) return;
    replaceUrl({ from: urlState.from, to: urlState.to, page: '1' });
  }, [paramsForRange.from, paramsForRange.rawFrom, paramsForRange.rawPage, paramsForRange.rawTo, paramsForRange.to, replaceUrl, urlState.from, urlState.to, urlState.view]);

  const query: DeadlineSearchInput = {
    from: urlState.from,
    to: urlState.to,
    mode: urlState.view,
    types: urlState.types,
    familyIds: urlState.families,
    companyIds: urlState.companies,
    companyQuery: urlState.companyQuery,
    serviceQuery: urlState.serviceQuery,
    milestoneQuery: urlState.milestoneQuery,
    statuses: urlState.statuses,
    openOnly: urlState.openOnly,
    origin: urlState.origin,
    page: urlState.page,
    limit: urlState.limit,
    sortBy: urlState.sortBy,
    sortOrder: urlState.sortOrder,
  };
  const deadlines = useDeadlines(query);
  const updateDeadline = useUpdateDeadlineOccurrence();
  const resetDeadline = useResetDeadlineDateOverride();
  const families = familyFacets.data ?? [];
  const allFamiliesSelected = urlState.families.length === 0;
  const canWrite = canEdit && deadlineWritesEnabled;
  const calendarMonthCount = !isLargeDesktop ? 1 : (calendarMonthCountOverride ?? parsedPreference.monthCount ?? 2);
  const items = deadlines.data?.items ?? [];

  const updateTypes = (type: DeadlineFilterType) => {
    const selected = new Set(urlState.types);
    if (selected.has(type) && selected.size === 1) return;
    if (selected.has(type)) selected.delete(type);
    else selected.add(type);
    const nextTypes = [...selected].filter((value) => TYPE_VALUES.includes(value));
    setSavedTypes(nextTypes);
    replaceUrl({ types: nextTypes.join(','), page: '1' });
    persistPreference({ visibleTypes: nextTypes });
  };

  const updateFamily = (familyId: string) => {
    const allIds = families.map((family) => family.id);
    const selected = new Set(urlState.families);
    if (selected.has(familyId)) selected.delete(familyId);
    else selected.add(familyId);
    const next = [...selected].filter((id) => allIds.includes(id));
    setSavedFamilies(next);
    replaceUrl({ families: next.length === allIds.length ? undefined : next.join(','), page: '1' });
    persistPreference({ familyIds: next });
  };

  const updateInlineFilters = (next: Partial<DeadlineInlineFilterValues>) => {
    const type = next.type === undefined ? (urlState.types.length === 1 ? urlState.types[0] : '') : next.type;
    const status = next.status === undefined ? (urlState.statuses.length === 1 ? urlState.statuses[0] : '') : next.status;
    const origin = next.origin === undefined ? (urlState.origin ?? '') : next.origin;
    replaceUrl({
      companyQuery: next.companyQuery === undefined ? urlState.companyQuery || undefined : next.companyQuery.trim() || undefined,
      serviceQuery: next.serviceQuery === undefined ? urlState.serviceQuery || undefined : next.serviceQuery.trim() || undefined,
      milestoneQuery: next.milestoneQuery === undefined ? urlState.milestoneQuery || undefined : next.milestoneQuery.trim() || undefined,
      from: next.from === undefined ? urlState.from : next.from || undefined,
      to: next.to === undefined ? urlState.to : next.to || undefined,
      types: next.type === undefined ? (urlState.types.length > 0 ? urlState.types.join(',') : undefined) : type || undefined,
      statuses: next.status === undefined ? (urlState.statuses.length > 0 ? urlState.statuses.join(',') : undefined) : status || undefined,
      origin: next.origin === undefined ? urlState.origin : origin || undefined,
      page: '1',
    });
    if (next.type !== undefined) {
      const nextTypes = type ? [type] : TYPE_VALUES;
      setSavedTypes(nextTypes);
      persistPreference({ visibleTypes: nextTypes });
    }
  };

  const inlineFilters: DeadlineInlineFilterValues = {
    companyQuery: urlState.companyQuery,
    serviceQuery: urlState.serviceQuery,
    milestoneQuery: urlState.milestoneQuery,
    from: urlState.from,
    to: urlState.to,
    type: urlState.types.length === 1 ? urlState.types[0] : '',
    status: urlState.statuses.length === 1 ? urlState.statuses[0] : '',
    origin: urlState.origin ?? '',
  };

  const switchView = (view: 'TABLE' | 'CALENDAR') => {
    const range = view === 'CALENDAR' ? monthRange(dateFromMonth(urlState.from), calendarMonthCount) : { from: urlState.from, to: urlState.to };
    replaceUrl({ deadlineView: view, from: range.from, to: range.to, page: '1' });
    persistPreference({ defaultView: view });
  };

  const handleCalendarMonthChange = (month: Date) => {
    const range = monthRange(month, calendarMonthCount);
    replaceUrl({ from: range.from, to: range.to, page: '1' });
  };

  const handleCalendarMonthCountChange = (monthCount: 1 | 2 | 3) => {
    setCalendarMonthCountOverride(monthCount);
    persistPreference({ monthCount });
    const visibleCount = isLargeDesktop ? monthCount : 1;
    const range = monthRange(dateFromMonth(urlState.from), visibleCount);
    replaceUrl({ from: range.from, to: range.to, page: '1' });
  };

  const markUpdate = useCallback((occurrence: DeadlineOccurrenceDto, data: UpdateDeadlineOccurrenceInput) => {
    if (!canWrite) return;
    updateDeadline.mutate({ id: occurrence.id, data });
  }, [canWrite, updateDeadline]);
  const resetOverride = useCallback((occurrence: DeadlineOccurrenceDto, reason: string) => {
    if (!canWrite) return;
    const data: ResetDeadlineDateOverrideInput = { expectedUpdatedAt: occurrence.updatedAt, reason };
    resetDeadline.mutate({ id: occurrence.id, data });
  }, [canWrite, resetDeadline]);

  const activeBadges: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (urlState.types.length !== TYPE_VALUES.length || !TYPE_VALUES.every((type) => urlState.types.includes(type))) {
    activeBadges.push({ key: 'types', label: `Type: ${urlState.types.map(formatBadgeValue).join(', ') || 'None'}`, onRemove: () => { setSavedTypes(TYPE_VALUES); replaceUrl({ types: undefined, page: '1' }); persistPreference({ visibleTypes: TYPE_VALUES }); } });
  }
  if (urlState.openOnly) activeBadges.push({ key: 'openOnly', label: 'Open only', onRemove: () => replaceUrl({ openOnly: undefined, page: '1' }) });
  if (!allFamiliesSelected) {
    for (const family of families.filter((item) => urlState.families.includes(item.id))) activeBadges.push({ key: `family-${family.id}`, label: `Family: ${family.name}`, onRemove: () => updateFamily(family.id) });
  }
  if (urlState.companyQuery) activeBadges.push({ key: 'companyQuery', label: `Company: ${urlState.companyQuery}`, onRemove: () => updateInlineFilters({ companyQuery: '' }) });
  if (urlState.serviceQuery) activeBadges.push({ key: 'serviceQuery', label: `Service: ${urlState.serviceQuery}`, onRemove: () => updateInlineFilters({ serviceQuery: '' }) });
  if (urlState.milestoneQuery) activeBadges.push({ key: 'milestoneQuery', label: `Milestone: ${urlState.milestoneQuery}`, onRemove: () => updateInlineFilters({ milestoneQuery: '' }) });
  if (urlState.statuses.length > 0) activeBadges.push({ key: 'statuses', label: `Status: ${urlState.statuses.map(formatBadgeValue).join(', ')}`, onRemove: () => updateInlineFilters({ status: '' }) });
  if (urlState.origin) activeBadges.push({ key: 'origin', label: `Source: ${formatBadgeValue(urlState.origin)}`, onRemove: () => updateInlineFilters({ origin: '' }) });
  if (urlState.companies.length > 0) activeBadges.push({ key: 'companies', label: `Companies: ${urlState.companies.length} selected`, onRemove: () => replaceUrl({ companies: undefined, page: '1' }) });
  const hasExplicitDueRange = urlState.view === 'TABLE' && (paramsForRange.rawFrom !== null || paramsForRange.rawTo !== null);
  if (hasExplicitDueRange) activeBadges.push({ key: 'dueRange', label: `Due: ${urlState.from} – ${urlState.to}`, onRemove: () => replaceUrl({ from: undefined, to: undefined, page: '1' }) });

  const filtered = activeBadges.length > 0 || urlState.from !== currentDateInSingapore() || urlState.openOnly || urlState.companies.length > 0;
  const total = deadlines.data?.mode === 'TABLE' ? deadlines.data.total : 0;
  const totalPages = deadlines.data?.mode === 'TABLE' ? deadlines.data.totalPages : 0;
  const visibleColumns = columnOrder.filter((column) => columnVisibility[column]);
  const showTableSurface = !deadlines.error && !deadlines.isLoading && deadlines.data?.mode === 'TABLE';
  const showCalendarSurface = !deadlines.error && (!deadlines.isLoading || Boolean(deadlines.data));

  return (
    <section aria-label="Deadline workspace" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Deadlines</h2>
          <p className="text-sm text-text-secondary">Monitor statutory, client, and internal deadlines across accessible companies.</p>
        </div>
        <div role="group" aria-label="Deadline view" className="inline-flex min-h-11 items-center rounded-xl border border-border-primary bg-background-secondary p-1">
          <button type="button" aria-pressed={urlState.view === 'TABLE'} onClick={() => switchView('TABLE')} className={urlState.view === 'TABLE' ? 'min-h-11 rounded-lg bg-oak-primary px-3 text-xs font-medium text-white' : 'min-h-11 rounded-lg px-3 text-xs font-medium text-text-secondary hover:text-text-primary'}>Table view</button>
          <button type="button" aria-pressed={urlState.view === 'CALENDAR'} onClick={() => switchView('CALENDAR')} className={urlState.view === 'CALENDAR' ? 'min-h-11 rounded-lg bg-oak-primary px-3 text-xs font-medium text-white' : 'min-h-11 rounded-lg px-3 text-xs font-medium text-text-secondary hover:text-text-primary'}>Calendar view</button>
        </div>
      </div>

      <DeadlineFilters
        families={families}
        selectedTypes={urlState.types}
        selectedFamilyIds={urlState.families}
        openOnly={urlState.openOnly}
        onToggleType={updateTypes}
        onToggleFamily={updateFamily}
        onToggleOpenOnly={() => replaceUrl({ openOnly: urlState.openOnly ? undefined : 'true', page: '1' })}
      />
      <DeadlineInlineFilters values={inlineFilters} onChange={updateInlineFilters} />

      {familyFacets.error ? (
        <Alert variant="error" title="Family filters unavailable">
          <div className="flex flex-wrap items-center gap-2">
            <span>{familyFacets.error instanceof Error ? familyFacets.error.message : 'Unable to load family filters.'}</span>
            <button type="button" aria-label="Retry family filters" onClick={() => familyFacets.refetch()} className="min-h-11 rounded-md border border-current px-3 text-sm font-medium">Retry</button>
          </div>
        </Alert>
      ) : null}

      {activeBadges.length > 0 ? (
        <div aria-label="Active deadline filters" className="flex flex-wrap items-center gap-2">
          {activeBadges.map((badge) => <button key={badge.key} type="button" onClick={badge.onRemove} className="inline-flex min-h-11 items-center rounded-full bg-oak-primary/10 px-3 text-xs text-oak-light hover:bg-oak-primary/20" aria-label={`Remove ${badge.label}`}>{badge.label}<span aria-hidden="true" className="ml-1">×</span></button>)}
        </div>
      ) : null}

      {deadlines.error ? (
        <Alert variant="error" title="Unable to load deadlines">
          <div className="flex flex-wrap items-center gap-2">
            <span>{deadlines.error instanceof Error ? deadlines.error.message : 'Please retry the deadline query.'}</span>
            <button type="button" onClick={() => deadlines.refetch()} className="min-h-11 rounded-md border border-current px-3 text-sm font-medium">Retry</button>
          </div>
        </Alert>
      ) : null}
      {deadlines.isLoading && !deadlines.data ? <div role="status" className="rounded-xl border border-border-primary bg-background-secondary p-8 text-center text-sm text-text-secondary">Loading deadlines…</div> : null}
      {(updateDeadline.isPending || resetDeadline.isPending) ? <div role="status" className="rounded-xl border border-border-primary bg-background-secondary p-3 text-sm text-text-secondary">Saving deadline changes…</div> : null}
      {updateDeadline.error || resetDeadline.error ? <Alert variant="error">Unable to save deadline changes. Please retry.</Alert> : null}

      {urlState.view === 'TABLE' ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" aria-expanded={columnsOpen} onClick={() => setColumnsOpen((open) => !open)} className="min-h-11 rounded-lg border border-border-primary px-3 text-sm font-medium text-text-secondary hover:border-oak-primary/50 hover:text-text-primary">Customize columns</button>
          </div>
          {columnsOpen ? (
            <div role="dialog" aria-label="Customize columns" className="rounded-xl border border-border-primary bg-background-secondary p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-semibold text-text-primary">Table columns</p><p className="text-xs text-text-muted">Choose visibility and order</p></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {columnOrder.map((column, index) => (
                  <div key={column} className="flex min-h-11 items-center gap-2 rounded-lg border border-border-primary px-2">
                    <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm text-text-secondary"><input type="checkbox" checked={columnVisibility[column]} disabled={column === 'actions'} aria-label={`Show ${({ dueDate: 'Operative due date', timing: 'Timing', company: 'Company', familyService: 'Family / service', milestone: 'Milestone', type: 'Type', status: 'Status', cycleOrigin: 'Cycle / origin', actions: 'Actions' } as Record<DeadlineTableColumnId, string>)[column]} column`} onChange={() => { if (column === 'actions') return; const next = { ...columnVisibility, [column]: !columnVisibility[column] }; setColumnVisibility(next); persistPreference({ tableColumnVisibility: next }); }} /><span className="truncate">{({ dueDate: 'Operative due date', timing: 'Timing', company: 'Company', familyService: 'Family / service', milestone: 'Milestone', type: 'Type', status: 'Status', cycleOrigin: 'Cycle / origin', actions: 'Actions' } as Record<DeadlineTableColumnId, string>)[column]}</span></label>
                    <button type="button" aria-label={`Move ${column} column up`} disabled={index === 0} onClick={() => { if (index === 0) return; const next = [...columnOrder]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; setColumnOrder(next); persistPreference({ tableColumnOrder: next }); }} className="min-h-11 min-w-11 rounded text-text-muted hover:bg-background-tertiary disabled:opacity-40">↑</button>
                    <button type="button" aria-label={`Move ${column} column down`} disabled={index === columnOrder.length - 1} onClick={() => { if (index === columnOrder.length - 1) return; const next = [...columnOrder]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; setColumnOrder(next); persistPreference({ tableColumnOrder: next }); }} className="min-h-11 min-w-11 rounded text-text-muted hover:bg-background-tertiary disabled:opacity-40">↓</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {!deadlines.isLoading && !deadlines.error && items.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-border-primary bg-background-secondary p-8 text-center text-sm text-text-secondary">{filtered ? 'No deadlines match the selected filters.' : 'No deadlines found for this date range.'}</div> : null}
          {showTableSurface ? (
            <DeadlineTable
              items={items}
              isFetching={deadlines.isFetching}
              page={deadlines.data?.mode === 'TABLE' ? deadlines.data.page : urlState.page}
              total={total}
              limit={deadlines.data?.mode === 'TABLE' ? deadlines.data.limit : urlState.limit}
              totalPages={totalPages}
              sortBy={urlState.sortBy}
              sortOrder={urlState.sortOrder}
              columnWidths={columnWidths}
              columnOrder={visibleColumns.length > 0 ? columnOrder : ['actions']}
              columnVisibility={columnVisibility}
              canEdit={canWrite}
              isPending={updateDeadline.isPending || resetDeadline.isPending}
              mutationError={updateDeadline.error ?? resetDeadline.error}
              onUpdate={markUpdate}
              onResetOverride={resetOverride}
              onSort={(sortBy) => { const sortOrder = urlState.sortBy === sortBy && urlState.sortOrder === 'asc' ? 'desc' : 'asc'; replaceUrl({ sortBy, sortOrder, page: '1' }); persistPreference({ sortBy, sortOrder }); }}
              onPageChange={(page) => replaceUrl({ page: String(page) })}
              onLimitChange={(limit) => { const safeLimit: DeadlinePageSize = PAGE_SIZE_VALUES.includes(limit as DeadlinePageSize) ? limit as DeadlinePageSize : 20; replaceUrl({ limit: String(safeLimit), page: '1' }); persistPreference({ pageSize: safeLimit }); }}
              onColumnWidthChange={(columnId, width) => setColumnWidths((current) => ({ ...current, [columnId]: Math.round(width) }))}
              onColumnResizeEnd={(columnId, width) => { const next = { ...columnWidths, [columnId]: Math.round(width) }; setColumnWidths(next); persistPreference({ tableColumnWidths: next }, true); }}
            />
          ) : null}
        </>
      ) : showCalendarSurface ? (
        <DeadlineCalendar
          items={undefined}
          focusMonth={dateFromMonth(urlState.from)}
          monthCount={calendarMonthCount}
          preferenceValue={currentPreference}
          search={query}
          canEdit={canWrite}
          isPending={updateDeadline.isPending || resetDeadline.isPending}
          mutationError={updateDeadline.error ?? resetDeadline.error}
          onMonthChange={handleCalendarMonthChange}
          onMonthCountChange={handleCalendarMonthCountChange}
          onUpdate={markUpdate}
          onResetOverride={resetOverride}
        />
      ) : null}
    </section>
  );
}
