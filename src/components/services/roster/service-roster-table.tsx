'use client';

import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Pencil, ExternalLink, AlertTriangle } from 'lucide-react';
import { MobileCard, CardDetailItem, CardDetailsGrid } from '@/components/ui/responsive-table';
import { Dropdown, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';
import type { ServiceRosterItem } from '@/services/service-roster';

export const SERVICE_ROSTER_COLUMNS = [
  'company',
  'family',
  'service',
  'status',
  'cadence',
  'nextDeadline',
  'startEnd',
  'warnings',
  'actions',
] as const;

export type ServiceRosterColumnId = (typeof SERVICE_ROSTER_COLUMNS)[number];
export type ServiceRosterSortBy = 'company' | 'family' | 'service' | 'status' | 'nextDeadline' | 'startDate';

export interface ServiceRosterColumnWidths {
  [key: string]: number | undefined;
}

export interface ServiceRosterInlineFilters {
  company?: string;
  family?: string;
  service?: string;
}

interface ServiceRosterTableProps {
  items: ServiceRosterItem[];
  canEdit: boolean;
  isFetching?: boolean;
  sortBy: ServiceRosterSortBy;
  sortOrder: 'asc' | 'desc';
  onSort: (sortBy: ServiceRosterSortBy) => void;
  inlineFilters: ServiceRosterInlineFilters;
  onInlineFilterChange: (filters: Partial<ServiceRosterInlineFilters>) => void;
  columnWidths: ServiceRosterColumnWidths;
  onColumnWidthChange: (columnId: ServiceRosterColumnId, width: number) => void;
  onEdit: (item: ServiceRosterItem) => void;
}

const columnLabels: Record<ServiceRosterColumnId, string> = {
  company: 'Company',
  family: 'Family',
  service: 'Service',
  status: 'Status',
  cadence: 'Cadence',
  nextDeadline: 'Next deadline',
  startEnd: 'Start/end',
  warnings: 'Warnings',
  actions: 'Actions',
};

const defaultWidths: Record<ServiceRosterColumnId, number> = {
  company: 230,
  family: 150,
  service: 190,
  status: 100,
  cadence: 130,
  nextDeadline: 140,
  startEnd: 150,
  warnings: 120,
  actions: 82,
};

const sortFields: Partial<Record<ServiceRosterColumnId, ServiceRosterSortBy>> = {
  company: 'company',
  family: 'family',
  service: 'service',
  status: 'status',
  nextDeadline: 'nextDeadline',
  startEnd: 'startDate',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatCadence(item: ServiceRosterItem): string {
  if (item.customCadenceLabel) return item.customCadenceLabel;
  return item.cadence.replaceAll('_', ' ').toLowerCase().replace(/^./, (value) => value.toUpperCase());
}

function statusClass(status: ServiceRosterItem['status']): string {
  if (status === 'ACTIVE') return 'badge-success';
  if (status === 'PAUSED') return 'badge-warning';
  return 'badge-neutral';
}

function statusLabel(status: ServiceRosterItem['status']): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function FamilyBadge({ item }: { item: ServiceRosterItem }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-1 text-xs"
      style={{ borderColor: item.family.displayColor, color: item.family.displayColor }}
      title={item.family.name}
    >
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.family.displayColor }} />
      <span className="truncate">{item.family.name}</span>
    </span>
  );
}

function CompanyCell({ item }: { item: ServiceRosterItem }) {
  return (
    <div className="min-w-0" title={item.company.name}>
      <span className="block truncate font-medium text-text-primary">{item.company.displayLabel}</span>
      <span className="block truncate text-xs text-text-secondary">{item.company.name}</span>
    </div>
  );
}

function WarningCell({ item }: { item: ServiceRosterItem }) {
  if (!item.hasRuleWarning) return <span className="text-text-muted">—</span>;
  const reason = item.warning.reasons[0] ?? 'Review service configuration';
  return (
    <span className="inline-flex items-center gap-1 text-status-warning" title={reason}>
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="text-xs">Review</span>
    </span>
  );
}

function ServiceActions({ item, canEdit, onEdit }: { item: ServiceRosterItem; canEdit: boolean; onEdit: (item: ServiceRosterItem) => void }) {
  const companyHref = `/companies/${item.companyId}?tab=services`;
  return (
    <Dropdown>
      <DropdownTrigger asChild aria-label={`Actions for ${item.serviceName}`}>
        <button type="button" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-tertiary hover:bg-background-tertiary hover:text-text-primary">
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownTrigger>
      <DropdownMenu>
        <Link href={companyHref}>
          <DropdownItem icon={<ExternalLink className="h-4 w-4" />}>View company Services</DropdownItem>
        </Link>
        {canEdit ? (
          <>
            <DropdownSeparator />
            <DropdownItem icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(item)}>Edit service</DropdownItem>
          </>
        ) : null}
      </DropdownMenu>
    </Dropdown>
  );
}

function SortableHeader({
  columnId,
  onSort,
  sortBy,
  sortOrder,
  onResize,
}: {
  columnId: ServiceRosterColumnId;
  onSort: (sortBy: ServiceRosterSortBy) => void;
  sortBy: ServiceRosterSortBy;
  sortOrder: 'asc' | 'desc';
  onResize: (columnId: ServiceRosterColumnId, event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const field = sortFields[columnId];
  const active = field === sortBy;
  const label = columnLabels[columnId];
  return (
    <th className="relative px-4 py-3 text-left text-xs font-medium text-text-secondary" scope="col">
      {field ? (
        <button
          type="button"
          aria-label={active ? `Sort by ${label}, currently ${sortOrder === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${label}`}
          onClick={() => onSort(field)}
          className="inline-flex min-h-11 items-center gap-1 text-left hover:text-text-primary"
        >
          <span>{label}</span>
          {active ? (sortOrder === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />) : <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />}
        </button>
      ) : <span>{label}</span>}
      {columnId !== 'actions' ? (
        <button
          type="button"
          aria-label={`Resize ${label} column`}
          onPointerDown={(event) => onResize(columnId, event)}
          className="absolute inset-y-0 -right-2 w-4 cursor-col-resize touch-none"
        />
      ) : null}
    </th>
  );
}

function InlineFilterRow({ filters, onChange }: { filters: ServiceRosterInlineFilters; onChange: (filters: Partial<ServiceRosterInlineFilters>) => void }) {
  const filter = (label: string, value: string | undefined, key: keyof ServiceRosterInlineFilters) => (
    <input
      type="search"
      aria-label={`Filter ${label}`}
      value={value ?? ''}
      onChange={(event) => onChange({ [key]: event.target.value || undefined })}
      placeholder="All"
      className="h-9 w-full min-w-0 rounded-lg border border-border-primary bg-background-secondary/50 px-2 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-oak-primary focus:ring-2 focus:ring-oak-primary/20"
    />
  );

  return (
    <tr className="border-b border-border-primary bg-background-secondary/60">
      <th className="px-4 py-2" scope="row">{filter('company', filters.company, 'company')}</th>
      <th className="px-4 py-2" scope="row">{filter('family', filters.family, 'family')}</th>
      <th className="px-4 py-2" scope="row">{filter('service', filters.service, 'service')}</th>
      <th className="px-4 py-2" scope="row"><span className="sr-only">Status filters are above</span></th>
      <th className="px-4 py-2" scope="row"><span className="sr-only">Cadence filter</span></th>
      <th className="px-4 py-2" scope="row"><span className="sr-only">Next deadline filter</span></th>
      <th className="px-4 py-2" scope="row"><span className="sr-only">Start/end filter</span></th>
      <th className="px-4 py-2" scope="row"><span className="sr-only">Warnings filter</span></th>
      <th className="px-4 py-2" scope="row"><span className="sr-only">Actions</span></th>
    </tr>
  );
}

function DesktopRow({ item, index, canEdit, onEdit }: { item: ServiceRosterItem; index: number; canEdit: boolean; onEdit: (item: ServiceRosterItem) => void }) {
  return (
    <tr className={cn('border-b border-border-primary transition-colors hover:bg-background-tertiary/60', index % 2 === 0 && 'bg-oak-row-alt')}>
      <td className="max-w-0 px-4 py-3 align-top"><CompanyCell item={item} /></td>
      <td className="px-4 py-3 align-top"><FamilyBadge item={item} /></td>
      <td className="max-w-0 px-4 py-3 align-top"><span className="block truncate text-sm text-text-primary" title={item.serviceName}>{item.serviceName}</span></td>
      <td className="px-4 py-3 align-top"><span className={cn('badge', statusClass(item.status))}>{statusLabel(item.status)}</span></td>
      <td className="px-4 py-3 align-top text-sm text-text-secondary">{formatCadence(item)}</td>
      <td className="px-4 py-3 align-top text-sm text-text-secondary">{formatDate(item.nextDeadline?.operativeDueDate ?? null)}</td>
      <td className="px-4 py-3 align-top text-sm text-text-secondary"><span className="whitespace-nowrap">{formatDate(item.startDate)}</span><span className="mx-1 text-text-muted">–</span><span className="whitespace-nowrap">{formatDate(item.endDate)}</span></td>
      <td className="px-4 py-3 align-top"><WarningCell item={item} /></td>
      <td className="px-4 py-3 align-top"><ServiceActions item={item} canEdit={canEdit} onEdit={onEdit} /></td>
    </tr>
  );
}

function MobileRosterCard({ item, canEdit, onEdit }: { item: ServiceRosterItem; canEdit: boolean; onEdit: (item: ServiceRosterItem) => void }) {
  return (
    <MobileCard
      title={<CompanyCell item={item} />}
      subtitle={<span title={item.serviceName}>{item.serviceName}</span>}
      badge={<span className={cn('badge', statusClass(item.status))}>{statusLabel(item.status)}</span>}
      actions={<ServiceActions item={item} canEdit={canEdit} onEdit={onEdit} />}
      details={(
        <CardDetailsGrid>
          <CardDetailItem label="Family" value={<FamilyBadge item={item} />} />
          <CardDetailItem label="Cadence" value={formatCadence(item)} />
          <CardDetailItem label="Next deadline" value={formatDate(item.nextDeadline?.operativeDueDate ?? null)} />
          <CardDetailItem label="Start/end" value={`${formatDate(item.startDate)} – ${formatDate(item.endDate)}`} />
          <CardDetailItem label="Warnings" value={<WarningCell item={item} />} />
        </CardDetailsGrid>
      )}
    />
  );
}

export function ServiceRosterTable({
  items,
  canEdit,
  isFetching,
  sortBy,
  sortOrder,
  onSort,
  inlineFilters,
  onInlineFilterChange,
  columnWidths,
  onColumnWidthChange,
  onEdit,
}: ServiceRosterTableProps) {
  const startResize = (columnId: ServiceRosterColumnId, event: React.PointerEvent<HTMLButtonElement>) => {
    if (columnId === 'actions') return;
    event.preventDefault();
    const startX = event.clientX;
    const initial = columnWidths[columnId] ?? defaultWidths[columnId];
    const pointerMove = (moveEvent: PointerEvent) => {
      onColumnWidthChange(columnId, Math.max(96, initial + moveEvent.clientX - startX));
    };
    const pointerUp = () => {
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
    };
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp, { once: true });
  };

  return (
    <>
      <div className="space-y-3 md:hidden" aria-label="Services roster cards">
        {items.map((item) => <MobileRosterCard key={item.id} item={item} canEdit={canEdit} onEdit={onEdit} />)}
      </div>
      <div className={cn('hidden overflow-x-auto rounded-xl border border-border-primary bg-background-secondary md:block', isFetching && 'opacity-70')}>
        <table className="min-w-[1280px] w-full table-fixed border-collapse" aria-label="Services roster table">
          <colgroup>
            {SERVICE_ROSTER_COLUMNS.map((columnId) => <col key={columnId} style={{ width: `${columnWidths[columnId] ?? defaultWidths[columnId]}px` }} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-border-primary bg-background-tertiary/70">
              {SERVICE_ROSTER_COLUMNS.map((columnId) => (
                <SortableHeader key={columnId} columnId={columnId} onSort={onSort} sortBy={sortBy} sortOrder={sortOrder} onResize={startResize} />
              ))}
            </tr>
            <InlineFilterRow filters={inlineFilters} onChange={onInlineFilterChange} />
          </thead>
          <tbody>
            {items.map((item, index) => <DesktopRow key={item.id} item={item} index={index} canEdit={canEdit} onEdit={onEdit} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}
