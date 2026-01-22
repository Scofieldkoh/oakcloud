'use client';

import { memo, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Users, MoreHorizontal, ExternalLink, Pencil, Trash2, Building2, Square, CheckSquare, MinusSquare, ArrowUp, ArrowDown, ArrowUpDown, X, ArrowUpRight } from 'lucide-react';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { PrefetchLink } from '@/components/ui/prefetch-link';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CountFilter, type CountFilterValue } from '@/components/ui/count-filter';
import type { Contact, ContactType, IdentificationType } from '@/generated/prisma';

interface ContactWithCount extends Contact {
  _count?: {
    companyRelations: number;
  };
  /** Default email from ContactDetail (where companyId is null) */
  defaultEmail?: string | null;
  /** Default phone from ContactDetail (where companyId is null) */
  defaultPhone?: string | null;
}

/** Inline filter values for the table */
export interface ContactInlineFilters {
  fullName?: string;
  contactType?: ContactType;
  identificationType?: IdentificationType;
  identificationNumber?: string;
  nationality?: string;
  email?: string;
  phone?: string;
  companiesMin?: number;
  companiesMax?: number;
}

/** Filter options for the name dropdown */
export interface ContactFilterOption {
  id: string;
  name: string;
}

interface ContactTableProps {
  contacts: ContactWithCount[];
  onDelete?: (id: string) => void;
  isLoading?: boolean;
  isFetching?: boolean;
  canEdit?: boolean | ((contactId: string) => boolean);
  canDelete?: boolean | ((contactId: string) => boolean);
  canCreate?: boolean;
  /** Enable selection mode */
  selectable?: boolean;
  /** Set of selected IDs */
  selectedIds?: Set<string>;
  /** Callback when selection changes */
  onToggleOne?: (id: string) => void;
  /** Callback when select all is toggled */
  onToggleAll?: () => void;
  /** Whether all items are selected */
  isAllSelected?: boolean;
  /** Whether some items are selected */
  isIndeterminate?: boolean;
  /** Current sort field */
  sortBy?: string;
  /** Current sort direction */
  sortOrder?: 'asc' | 'desc';
  /** Handler for sorting */
  onSort?: (field: string) => void;
  /** Inline filter values */
  inlineFilters?: ContactInlineFilters;
  /** Handler for inline filter changes */
  onInlineFilterChange?: (filters: Partial<ContactInlineFilters>) => void;
  /** Options for name filter dropdown */
  contactFilterOptions?: ContactFilterOption[];
  /** Persisted column widths */
  columnWidths?: Record<string, number>;
  /** Handler for column width changes */
  onColumnWidthChange?: (columnId: string, width: number) => void;
}

// Column definitions
const COLUMN_IDS = [
  'open',
  'name',
  'type',
  'idNumber',
  'nationality',
  'email',
  'phone',
  'companies',
  'actions',
] as const;
type ColumnId = (typeof COLUMN_IDS)[number];

const COLUMN_LABELS: Record<ColumnId, string> = {
  open: '',
  name: 'Name',
  type: 'Type',
  idNumber: 'ID Number',
  nationality: 'Nationality',
  email: 'Email',
  phone: 'Phone',
  companies: 'Companies',
  actions: '',
};

const COLUMN_SORT_FIELDS: Partial<Record<ColumnId, string>> = {
  name: 'fullName',
  type: 'contactType',
  nationality: 'nationality',
  companies: 'companyRelationsCount',
};

const DEFAULT_COLUMN_WIDTHS: Partial<Record<ColumnId, number>> = {
  open: 44,
  name: 200,
  type: 100,
  idNumber: 160,
  nationality: 120,
  email: 200,
  phone: 140,
  companies: 100,
  actions: 60,
};

const contactTypeConfig: Record<ContactType, { color: string; label: string }> = {
  INDIVIDUAL: { color: 'badge-info', label: 'Individual' },
  CORPORATE: { color: 'badge-neutral', label: 'Corporate' },
};

const idTypeLabels: Record<IdentificationType, string> = {
  NRIC: 'NRIC',
  FIN: 'FIN',
  PASSPORT: 'Passport',
  UEN: 'UEN',
  OTHER: 'Other',
};

const CONTACT_TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'CORPORATE', label: 'Corporate' },
];

interface ContactActionsDropdownProps {
  contactId: string;
  contactName?: string;
  onDelete?: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const ContactActionsDropdown = memo(function ContactActionsDropdown({
  contactId,
  contactName,
  onDelete,
  canEdit,
  canDelete,
}: ContactActionsDropdownProps) {
  const hasAnyAction = canEdit || canDelete;

  if (!hasAnyAction) {
    return null;
  }

  return (
    <Dropdown>
      <DropdownTrigger asChild aria-label={`Actions for ${contactName || 'contact'}`}>
        <button className="p-1 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors">
          <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
        </button>
      </DropdownTrigger>
      <DropdownMenu>
        <Link href={`/contacts/${contactId}`}>
          <DropdownItem icon={<ExternalLink className="w-4 h-4" />}>View Details</DropdownItem>
        </Link>
        {canEdit && (
          <Link href={`/contacts/${contactId}/edit`}>
            <DropdownItem icon={<Pencil className="w-4 h-4" />}>Edit</DropdownItem>
          </Link>
        )}
        {canDelete && (
          <>
            <DropdownSeparator />
            <DropdownItem
              icon={<Trash2 className="w-4 h-4" />}
              destructive
              onClick={() => onDelete?.(contactId)}
            >
              Delete
            </DropdownItem>
          </>
        )}
      </DropdownMenu>
    </Dropdown>
  );
});

export function ContactTable({
  contacts,
  onDelete,
  isLoading,
  isFetching,
  canEdit = true,
  canDelete = true,
  canCreate = true,
  selectable = false,
  selectedIds = new Set(),
  onToggleOne,
  onToggleAll,
  isAllSelected = false,
  isIndeterminate = false,
  sortBy,
  sortOrder,
  onSort,
  inlineFilters = {},
  onInlineFilterChange,
  contactFilterOptions = [],
  columnWidths = {},
  onColumnWidthChange,
}: ContactTableProps) {
  const checkCanEdit = (contactId: string): boolean => {
    if (typeof canEdit === 'function') return canEdit(contactId);
    return canEdit;
  };

  const checkCanDelete = (contactId: string): boolean => {
    if (typeof canDelete === 'function') return canDelete(contactId);
    return canDelete;
  };

  // Internal column widths state (used if external not provided)
  const [internalColumnWidths, setInternalColumnWidths] = useState<Partial<Record<ColumnId, number>>>({});
  const effectiveColumnWidths = columnWidths ?? internalColumnWidths;
  const isResizingRef = useRef(false);

  // Helper function to get column width
  const getColumnWidth = useCallback(
    (columnId: ColumnId): number => {
      return effectiveColumnWidths[columnId] ?? DEFAULT_COLUMN_WIDTHS[columnId] ?? 100;
    },
    [effectiveColumnWidths]
  );

  // Column resize handler (matches company-table pattern)
  const startResize = useCallback((e: React.PointerEvent, columnId: ColumnId) => {
    e.preventDefault();
    e.stopPropagation();

    const handle = e.currentTarget as HTMLElement | null;
    const th = handle?.closest('th') as HTMLTableCellElement | null;
    const startWidth = effectiveColumnWidths[columnId] ?? th?.getBoundingClientRect().width ?? DEFAULT_COLUMN_WIDTHS[columnId] ?? 120;
    const startX = e.clientX;
    const pointerId = e.pointerId;

    isResizingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    let latestWidth = startWidth;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      latestWidth = Math.max(30, startWidth + delta);
      if (th) {
        th.style.width = `${latestWidth}px`;
      }
    };

    const onUp = () => {
      (handle as HTMLElement | null)?.releasePointerCapture(pointerId);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      isResizingRef.current = false;

      if (onColumnWidthChange) {
        onColumnWidthChange(columnId, latestWidth);
      } else {
        setInternalColumnWidths(prev => ({ ...prev, [columnId]: latestWidth }));
      }

      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [effectiveColumnWidths, onColumnWidthChange]);

  // Helper function to get ID display
  const getIdDisplay = (contact: ContactWithCount) => {
    if (contact.identificationNumber) {
      const prefix = contact.identificationType ? `${idTypeLabels[contact.identificationType]}: ` : '';
      return prefix + contact.identificationNumber;
    }
    if (contact.corporateUen) {
      return `UEN: ${contact.corporateUen}`;
    }
    return '-';
  };

  // Sortable header component with resize handle (matches company-table)
  const renderHeaderCell = (columnId: ColumnId) => {
    const label = COLUMN_LABELS[columnId];
    const sortField = COLUMN_SORT_FIELDS[columnId];
    const isActive = sortBy === sortField;
    const width = getColumnWidth(columnId);
    const isSortable = sortField && onSort;
    const isResizable = !['open', 'actions'].includes(columnId);

    const sortLabel = isActive
      ? `Sort by ${label}, currently ${sortOrder === 'asc' ? 'ascending' : 'descending'}`
      : `Sort by ${label}`;

    return (
      <th
        key={columnId}
        style={{ width: `${width}px` }}
        className={cn(
          'relative text-xs font-medium text-text-secondary py-2.5 whitespace-nowrap text-left',
          columnId === 'actions' ? 'px-2' : 'px-4'
        )}
      >
        {isSortable ? (
          <button
            type="button"
            onClick={() => onSort(sortField)}
            aria-label={sortLabel}
            className={cn(
              'inline-flex items-center gap-1 hover:text-text-primary transition-colors cursor-pointer select-none',
              isActive ? 'text-text-primary' : ''
            )}
          >
            <span>{label}</span>
            <span className="flex-shrink-0" aria-hidden="true">
              {isActive ? (
                sortOrder === 'asc' ? (
                  <ArrowUp className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDown className="w-3.5 h-3.5" />
                )
              ) : (
                <ArrowUpDown className="w-3.5 h-3.5 text-text-muted" />
              )}
            </span>
          </button>
        ) : (
          <span>{label}</span>
        )}
        {/* Resize handle */}
        {isResizable && (
          <div
            onPointerDown={(e) => startResize(e, columnId)}
            className="absolute top-0 -right-2 h-full w-4 cursor-col-resize hover:bg-border-secondary/60 z-10 touch-none"
            title="Drag to resize"
          />
        )}
      </th>
    );
  };

  // Render filter cell for a column
  const renderFilterCell = (columnId: ColumnId) => {
    if (!onInlineFilterChange) return null;

    switch (columnId) {
      case 'open':
        return null;

      case 'name':
        return (
          <SearchableSelect
            options={[
              { value: '', label: 'All' },
              ...contactFilterOptions.map(c => ({ value: c.name, label: c.name }))
            ]}
            value={inlineFilters.fullName || ''}
            onChange={(value) => onInlineFilterChange({ fullName: value || undefined })}
            placeholder="All"
            className="text-xs w-full min-w-0"
            showChevron={false}
            showKeyboardHints={false}
          />
        );

      case 'type':
        return (
          <SearchableSelect
            options={CONTACT_TYPE_OPTIONS}
            value={inlineFilters.contactType || ''}
            onChange={(value) => onInlineFilterChange({ contactType: value as ContactType || undefined })}
            placeholder="All"
            className="text-xs w-full min-w-0"
            showChevron={false}
            showKeyboardHints={false}
          />
        );

      case 'idNumber':
        return (
          <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
            <input
              type="text"
              value={inlineFilters.identificationNumber || ''}
              onChange={(e) => onInlineFilterChange({ identificationNumber: e.target.value || undefined })}
              placeholder="All"
              className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
            />
            {inlineFilters.identificationNumber && (
              <button
                type="button"
                onClick={() => onInlineFilterChange({ identificationNumber: undefined })}
                className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
              >
                <X className="w-3.5 h-3.5 text-text-muted" />
              </button>
            )}
          </div>
        );

      case 'nationality':
        return (
          <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
            <input
              type="text"
              value={inlineFilters.nationality || ''}
              onChange={(e) => onInlineFilterChange({ nationality: e.target.value || undefined })}
              placeholder="All"
              className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
            />
            {inlineFilters.nationality && (
              <button
                type="button"
                onClick={() => onInlineFilterChange({ nationality: undefined })}
                className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
              >
                <X className="w-3.5 h-3.5 text-text-muted" />
              </button>
            )}
          </div>
        );

      case 'email':
        return (
          <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
            <input
              type="text"
              value={inlineFilters.email || ''}
              onChange={(e) => onInlineFilterChange({ email: e.target.value || undefined })}
              placeholder="All"
              className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
            />
            {inlineFilters.email && (
              <button
                type="button"
                onClick={() => onInlineFilterChange({ email: undefined })}
                className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
              >
                <X className="w-3.5 h-3.5 text-text-muted" />
              </button>
            )}
          </div>
        );

      case 'phone':
        return (
          <div className="w-full flex items-center gap-2 h-9 rounded-lg border bg-background-secondary/30 border-border-primary hover:border-oak-primary/50 focus-within:ring-2 focus-within:ring-oak-primary/30 transition-colors">
            <input
              type="text"
              value={inlineFilters.phone || ''}
              onChange={(e) => onInlineFilterChange({ phone: e.target.value || undefined })}
              placeholder="All"
              className="flex-1 bg-transparent outline-none px-3 min-w-0 text-xs text-text-primary placeholder:text-text-secondary"
            />
            {inlineFilters.phone && (
              <button
                type="button"
                onClick={() => onInlineFilterChange({ phone: undefined })}
                className="p-0.5 hover:bg-background-tertiary rounded transition-colors mr-1"
              >
                <X className="w-3.5 h-3.5 text-text-muted" />
              </button>
            )}
          </div>
        );

      case 'companies':
        return (
          <CountFilter
            value={{
              min: inlineFilters.companiesMin,
              max: inlineFilters.companiesMax,
            }}
            onChange={(value: CountFilterValue) =>
              onInlineFilterChange({ companiesMin: value.min, companiesMax: value.max })
            }
            placeholder="All"
            label="companies"
            size="sm"
            className="text-xs w-full min-w-0"
          />
        );

      case 'actions':
        return null;

      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              {selectable && (
                <th className="w-10">
                  <div className="skeleton h-4 w-4" />
                </th>
              )}
              <th></th>
              <th>Name</th>
              <th>Type</th>
              <th>ID Number</th>
              <th>Nationality</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Companies</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                {selectable && (
                  <td>
                    <div className="skeleton h-4 w-4" />
                  </td>
                )}
                <td><div className="skeleton h-4 w-8" /></td>
                <td><div className="skeleton h-4 w-40" /></td>
                <td><div className="skeleton h-4 w-20" /></td>
                <td><div className="skeleton h-4 w-24" /></td>
                <td><div className="skeleton h-4 w-20" /></td>
                <td><div className="skeleton h-4 w-32" /></td>
                <td><div className="skeleton h-4 w-24" /></td>
                <td><div className="skeleton h-4 w-12" /></td>
                <td><div className="skeleton h-4 w-8" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {selectable && contacts.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={onToggleAll}
              className="p-2 hover:bg-background-secondary rounded transition-colors flex items-center gap-2"
              aria-label={isAllSelected ? 'Deselect all contacts' : 'Select all contacts'}
              aria-pressed={isAllSelected}
            >
              {isAllSelected ? (
                <CheckSquare className="w-5 h-5 text-oak-primary" aria-hidden="true" />
              ) : isIndeterminate ? (
                <MinusSquare className="w-5 h-5 text-oak-light" aria-hidden="true" />
              ) : (
                <Square className="w-5 h-5 text-text-muted" aria-hidden="true" />
              )}
              <span className="text-sm text-text-secondary">
                {isAllSelected ? 'Deselect all' : 'Select all'}
              </span>
            </button>
          </div>
        )}
        {contacts.length === 0 ? (
          <div className="card p-6 sm:p-12 text-center">
            <Users className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">No contacts found</h3>
            <p className="text-text-secondary mb-4">
              {canCreate
                ? 'Get started by creating your first contact or adjusting your filters.'
                : 'No contacts available. Try adjusting your filters.'}
            </p>
            {canCreate && (
              <Link href="/contacts/new" className="btn-primary btn-sm inline-flex">
                Add Contact
              </Link>
            )}
          </div>
        ) : (
          contacts.map((contact) => {
          const isSelected = selectedIds.has(contact.id);
          return (
            <MobileCard
              key={contact.id}
              isSelected={isSelected}
              selectable={selectable}
              onToggle={() => onToggleOne?.(contact.id)}
              title={
                <PrefetchLink
                  href={`/contacts/${contact.id}`}
                  prefetchType="contact"
                  prefetchId={contact.id}
                  className="font-medium text-text-primary hover:text-oak-light transition-colors block truncate"
                >
                  {contact.fullName}{contact.alias && `, ${contact.alias}`}
                </PrefetchLink>
              }
              subtitle={contact.nationality || getIdDisplay(contact)}
              badge={
                <span className={`badge ${contactTypeConfig[contact.contactType].color}`}>
                  {contactTypeConfig[contact.contactType].label}
                </span>
              }
              selectionLabel={isSelected ? `Deselect ${contact.fullName}` : `Select ${contact.fullName}`}
              actions={
                <ContactActionsDropdown
                  contactId={contact.id}
                  contactName={contact.fullName}
                  onDelete={onDelete}
                  canEdit={checkCanEdit(contact.id)}
                  canDelete={checkCanDelete(contact.id)}
                />
              }
              details={
                <CardDetailsGrid>
                  {contact.defaultEmail && (
                    <CardDetailItem
                      label="Email"
                      value={<span className="truncate">{contact.defaultEmail}</span>}
                    />
                  )}
                  {contact.defaultPhone && (
                    <CardDetailItem
                      label="Phone"
                      value={contact.defaultPhone}
                    />
                  )}
                  <CardDetailItem
                    label="Companies"
                    value={
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{contact._count?.companyRelations || 0}</span>
                      </div>
                    }
                  />
                </CardDetailsGrid>
              }
            />
          );
        })
        )}
      </div>

      {/* Desktop Table View */}
      <div className={cn('hidden md:block table-container overflow-hidden', isFetching && 'opacity-60')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <colgroup>
              {selectable && <col style={{ width: '40px' }} />}
              {COLUMN_IDS.map((id) => (
                <col
                  key={id}
                  style={
                    id === 'open'
                      ? { width: '44px' }
                      : effectiveColumnWidths[id]
                        ? { width: `${effectiveColumnWidths[id]}px` }
                        : undefined
                  }
                />
              ))}
            </colgroup>
            <thead className="bg-background-tertiary border-b border-border-primary">
              {/* Inline filter row (above header) */}
              {onInlineFilterChange && (
                <tr className="bg-background-secondary/50">
                  {selectable && <th className="w-10 px-4 py-2"></th>}
                  {COLUMN_IDS.map((columnId) => (
                    <th
                      key={columnId}
                      className={cn(
                        'py-2',
                        columnId === 'open' ? 'w-[44px] px-2' : columnId === 'actions' ? 'px-2' : 'px-4'
                      )}
                    >
                      {renderFilterCell(columnId)}
                    </th>
                  ))}
                </tr>
              )}
              {/* Column header row */}
              <tr className={onInlineFilterChange ? 'border-t border-border-primary' : ''}>
                {selectable && (
                  <th className="w-10 px-4 py-2.5">
                    <button
                      onClick={onToggleAll}
                      className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                      aria-label={isAllSelected ? 'Deselect all contacts' : 'Select all contacts'}
                      aria-pressed={isAllSelected}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-oak-primary" aria-hidden="true" />
                      ) : isIndeterminate ? (
                        <MinusSquare className="w-4 h-4 text-oak-light" aria-hidden="true" />
                      ) : (
                        <Square className="w-4 h-4 text-text-muted" aria-hidden="true" />
                      )}
                    </button>
                  </th>
                )}
                {COLUMN_IDS.map((columnId) =>
                  columnId === 'open' ? (
                    <th
                      key={columnId}
                      className="w-[44px] text-center text-xs font-medium text-text-secondary px-2 py-2.5 whitespace-nowrap"
                      title="Open in new tab"
                    >
                      <ArrowUpRight className="w-4 h-4 inline-block text-text-muted" />
                    </th>
                  ) : (
                    renderHeaderCell(columnId)
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_IDS.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center">
                    <p className="text-sm text-text-secondary">No contacts found</p>
                  </td>
                </tr>
              ) : (
                contacts.map((contact, index) => {
                  const isSelected = selectedIds.has(contact.id);
                  const isAlternate = index % 2 === 1;
                  return (
                    <tr
                      key={contact.id}
                      className={cn(
                        'border-b border-border-primary transition-colors',
                        isSelected
                          ? 'bg-oak-row-selected hover:bg-oak-row-selected-hover'
                          : isAlternate
                            ? 'bg-oak-row-alt hover:bg-oak-row-alt-hover'
                            : 'hover:bg-background-tertiary/50'
                      )}
                    >
                      {selectable && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() => onToggleOne?.(contact.id)}
                            className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                            aria-label={isSelected ? `Deselect ${contact.fullName}` : `Select ${contact.fullName}`}
                            aria-pressed={isSelected}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-oak-primary" aria-hidden="true" />
                            ) : (
                              <Square className="w-4 h-4 text-text-muted" aria-hidden="true" />
                            )}
                          </button>
                        </td>
                      )}
                      {/* Open in new tab */}
                      <td className="px-2 py-3">
                        <Link
                          href={`/contacts/${contact.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
                          aria-label={`Open "${contact.fullName}" in new tab`}
                          title={`Open "${contact.fullName}" in new tab`}
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </td>
                    {/* Name */}
                    <td className="px-4 py-3 max-w-0">
                      <PrefetchLink
                        href={`/contacts/${contact.id}`}
                        prefetchType="contact"
                        prefetchId={contact.id}
                        className="font-medium text-text-primary hover:text-oak-light transition-colors block truncate"
                      >
                        {contact.fullName}{contact.alias && `, ${contact.alias}`}
                      </PrefetchLink>
                    </td>
                    {/* Type */}
                    <td className="px-4 py-3 max-w-0">
                      <span className={`badge ${contactTypeConfig[contact.contactType].color}`}>
                        {contactTypeConfig[contact.contactType].label}
                      </span>
                    </td>
                    {/* ID Number */}
                    <td className="px-4 py-3 text-text-secondary max-w-0">
                      {contact.identificationNumber ? (
                        <span className="block truncate">
                          {contact.identificationType && (
                            <span className="text-text-tertiary text-xs mr-1">
                              {idTypeLabels[contact.identificationType]}:
                            </span>
                          )}
                          {contact.identificationNumber}
                        </span>
                      ) : contact.corporateUen ? (
                        <span className="block truncate">
                          <span className="text-text-tertiary text-xs mr-1">UEN:</span>
                          {contact.corporateUen}
                        </span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    {/* Nationality */}
                    <td className="px-4 py-3 text-text-secondary max-w-0">
                      <span className="block truncate">{contact.nationality || '-'}</span>
                    </td>
                    {/* Email */}
                    <td className="px-4 py-3 text-text-secondary max-w-0">
                      {contact.defaultEmail ? (
                        <span className="truncate block" title={contact.defaultEmail}>
                          {contact.defaultEmail}
                        </span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    {/* Phone */}
                    <td className="px-4 py-3 text-text-secondary max-w-0">
                      {contact.defaultPhone ? (
                        <span className="block truncate">{contact.defaultPhone}</span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    {/* Companies */}
                    <td className="px-4 py-3 max-w-0">
                      <div className="flex items-center gap-1.5 text-text-secondary">
                        <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{contact._count?.companyRelations || 0}</span>
                      </div>
                    </td>
                    {/* Actions */}
                    <td className="px-2 py-3">
                      <ContactActionsDropdown
                        contactId={contact.id}
                        contactName={contact.fullName}
                        onDelete={onDelete}
                        canEdit={checkCanEdit(contact.id)}
                        canDelete={checkCanDelete(contact.id)}
                      />
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
