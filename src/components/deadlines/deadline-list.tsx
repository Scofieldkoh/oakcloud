'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Calendar,
  Building2,
  User,
  ChevronRight,
  MoreHorizontal,
  CheckCircle,
  RotateCcw,
  Trash2,
  Edit,
  Eye,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import {
  DeadlineStatusBadge,
  DeadlineCategoryBadge,
  UrgencyIndicator,
} from './deadline-status-badge';
import type { DeadlineWithRelations } from '@/hooks/use-deadlines';
import type { DeadlineStatus } from '@/generated/prisma';

// ============================================================================
// TYPES
// ============================================================================

interface DeadlineListProps {
  deadlines: DeadlineWithRelations[];
  isLoading?: boolean;
  onView?: (deadline: DeadlineWithRelations) => void;
  onEdit?: (deadline: DeadlineWithRelations) => void;
  onComplete?: (deadline: DeadlineWithRelations) => void;
  onReopen?: (deadline: DeadlineWithRelations) => void;
  onDelete?: (deadline: DeadlineWithRelations) => void;
  showCompany?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  page?: number;
  totalPages?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  emptyMessage?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DeadlineList({
  deadlines,
  isLoading = false,
  onView,
  onEdit,
  onComplete,
  onReopen,
  onDelete,
  showCompany = true,
  selectable = false,
  selectedIds,
  onSelectionChange,
  sortBy,
  sortOrder,
  onSort,
  page = 1,
  totalPages = 1,
  total = 0,
  limit = 20,
  onPageChange,
  onLimitChange,
  emptyMessage = 'No deadlines found',
}: DeadlineListProps) {
  const columns = useMemo<DataGridColumn<DeadlineWithRelations>[]>(() => {
    const cols: DataGridColumn<DeadlineWithRelations>[] = [
      {
        id: 'title',
        label: 'Deadline',
        sortField: 'title',
        defaultWidth: 320,
        minWidth: 200,
        showOnMobile: true,
        render: (deadline) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary truncate">
                {deadline.title}
              </span>
              <UrgencyIndicator
                dueDate={deadline.statutoryDueDate}
                status={deadline.status}
                extendedDueDate={deadline.extendedDueDate}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <DeadlineCategoryBadge category={deadline.category} size="xs" />
              <span>{deadline.periodLabel}</span>
              {deadline.referenceCode && (
                <span className="text-text-muted">#{deadline.referenceCode}</span>
              )}
            </div>
          </div>
        ),
      },
      {
        id: 'dueDate',
        label: 'Due Date',
        sortField: 'statutoryDueDate',
        defaultWidth: 140,
        minWidth: 120,
        render: (deadline) => {
          const statutoryDate = new Date(deadline.statutoryDueDate);
          const extendedDate = deadline.extendedDueDate
            ? new Date(deadline.extendedDueDate)
            : null;

          return (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-text-muted" />
                <span
                  className={cn(
                    'text-sm',
                    extendedDate ? 'line-through text-text-muted' : 'text-text-primary'
                  )}
                >
                  {format(statutoryDate, 'dd MMM yyyy')}
                </span>
              </div>
              {extendedDate && (
                <span className="text-sm text-green-700 dark:text-green-400 ml-5">
                  {format(extendedDate, 'dd MMM yyyy')}
                  {deadline.eotReference && (
                    <span className="text-xs text-text-muted ml-1">
                      (EOT: {deadline.eotReference})
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'status',
        label: 'Status',
        sortField: 'status',
        defaultWidth: 120,
        minWidth: 100,
        render: (deadline) => (
          <DeadlineStatusBadge status={deadline.status} size="sm" />
        ),
      },
    ];

    // Add company column if showing
    if (showCompany) {
      cols.splice(1, 0, {
        id: 'company',
        label: 'Company',
        sortField: 'company',
        defaultWidth: 200,
        minWidth: 150,
        showOnMobile: true,
        render: (deadline) =>
          deadline.company ? (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-text-muted flex-shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-text-primary truncate">
                  {deadline.company.name}
                </span>
                <span className="text-xs text-text-muted">
                  {deadline.company.uen}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-text-muted">-</span>
          ),
      });
    }

    // Add assignee column
    cols.push({
      id: 'assignee',
      label: 'Assignee',
      defaultWidth: 150,
      minWidth: 120,
      render: (deadline) =>
        deadline.assignee ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-oak-primary/10 text-oak-primary flex items-center justify-center text-xs font-medium">
              {deadline.assignee.firstName[0]}
              {deadline.assignee.lastName[0]}
            </div>
            <span className="text-sm text-text-primary truncate">
              {deadline.assignee.firstName} {deadline.assignee.lastName}
            </span>
          </div>
        ) : (
          <span className="text-text-muted text-sm">Unassigned</span>
        ),
    });

    // Add actions column
    cols.push({
      id: 'actions',
      label: '',
      fixedWidth: 50,
      render: (deadline) => {
        const hasActions = onView || onEdit || onComplete || onReopen || onDelete;
        if (!hasActions) return null;

        return (
          <Dropdown>
            <DropdownTrigger asChild aria-label="Actions">
              <button className="p-1.5 rounded hover:bg-background-tertiary transition-colors">
                <MoreHorizontal className="w-4 h-4 text-text-muted" />
              </button>
            </DropdownTrigger>
            <DropdownMenu align="right">
              {onView && (
                <DropdownItem onClick={() => onView(deadline)} icon={<Eye className="w-4 h-4" />}>
                  View Details
                </DropdownItem>
              )}
              {onEdit && deadline.status !== 'COMPLETED' && (
                <DropdownItem onClick={() => onEdit(deadline)} icon={<Edit className="w-4 h-4" />}>
                  Edit
                </DropdownItem>
              )}
              {onComplete && !['COMPLETED', 'CANCELLED', 'WAIVED'].includes(deadline.status) && (
                <DropdownItem onClick={() => onComplete(deadline)} icon={<CheckCircle className="w-4 h-4" />}>
                  Mark Complete
                </DropdownItem>
              )}
              {onReopen && deadline.status === 'COMPLETED' && (
                <DropdownItem onClick={() => onReopen(deadline)} icon={<RotateCcw className="w-4 h-4" />}>
                  Reopen
                </DropdownItem>
              )}
              {onDelete && (
                <>
                  <DropdownSeparator />
                  <DropdownItem onClick={() => onDelete(deadline)} icon={<Trash2 className="w-4 h-4" />} destructive>
                    Delete
                  </DropdownItem>
                </>
              )}
            </DropdownMenu>
          </Dropdown>
        );
      },
    });

    return cols;
  }, [showCompany, onView, onEdit, onComplete, onReopen, onDelete]);

  return (
    <DataGrid
      data={deadlines}
      columns={columns}
      getRowKey={(d) => d.id}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSort={onSort}
      selectable={selectable}
      selectedKeys={selectedIds}
      onSelectionChange={onSelectionChange}
      page={page}
      totalPages={totalPages}
      total={total}
      limit={limit}
      onPageChange={onPageChange}
      onLimitChange={onLimitChange}
      isLoading={isLoading}
      emptyMessage={emptyMessage}
      variant="compact"
    />
  );
}

// ============================================================================
// COMPACT LIST (for sidebars/cards)
// ============================================================================

interface DeadlineCompactListProps {
  deadlines: DeadlineWithRelations[];
  onView?: (deadline: DeadlineWithRelations) => void;
  showCompany?: boolean;
  maxItems?: number;
  emptyMessage?: string;
  className?: string;
}

export function DeadlineCompactList({
  deadlines,
  onView,
  showCompany = false,
  maxItems,
  emptyMessage = 'No deadlines',
  className,
}: DeadlineCompactListProps) {
  const displayDeadlines = maxItems ? deadlines.slice(0, maxItems) : deadlines;

  if (displayDeadlines.length === 0) {
    return (
      <div className={cn('text-sm text-text-muted py-4 text-center', className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('divide-y divide-border-default', className)}>
      {displayDeadlines.map((deadline) => (
        <div
          key={deadline.id}
          className={cn(
            'py-3 px-2 flex items-center gap-3',
            onView && 'cursor-pointer hover:bg-background-secondary transition-colors'
          )}
          onClick={() => onView?.(deadline)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary truncate">
                {deadline.title}
              </span>
              <UrgencyIndicator
                dueDate={deadline.statutoryDueDate}
                status={deadline.status}
                extendedDueDate={deadline.extendedDueDate}
              />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <DeadlineCategoryBadge category={deadline.category} size="xs" />
              <span className="text-xs text-text-muted">
                Due {format(new Date(deadline.statutoryDueDate), 'dd MMM yyyy')}
              </span>
              {showCompany && deadline.company && (
                <>
                  <span className="text-text-muted">·</span>
                  <span className="text-xs text-text-muted truncate">
                    {deadline.company.name}
                  </span>
                </>
              )}
            </div>
          </div>
          <DeadlineStatusBadge status={deadline.status} size="xs" showIcon={false} />
          {onView && <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}

export default DeadlineList;
