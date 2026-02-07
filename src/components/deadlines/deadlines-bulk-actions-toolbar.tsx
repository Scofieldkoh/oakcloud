'use client';

import { useMemo, useState } from 'react';
import {
  Calculator,
  CheckCircle,
  DollarSign,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { Dropdown, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { cn, formatCurrency } from '@/lib/utils';
import type { DeadlineWithRelations } from '@/hooks/use-deadlines';
import type { DeadlineBillingStatus, DeadlineCategory, DeadlineStatus } from '@/generated/prisma';

interface AssigneeOption {
  id: string;
  label: string;
}

interface CategoryTotals {
  total: number;
  count: number;
}

interface CurrencySummary {
  currency: string;
  categories: Record<DeadlineCategory, CategoryTotals>;
  total: number;
}

interface DeadlinesBulkActionsToolbarProps {
  selectedIds: string[];
  selectedDeadlines?: DeadlineWithRelations[];
  onClearSelection: () => void;
  onUpdateStatus: (status: DeadlineStatus) => void;
  onUpdateBillingStatus: (status: DeadlineBillingStatus) => void;
  onAssign: (assigneeId: string | null) => void;
  onDelete?: () => void;
  assigneeOptions: AssigneeOption[];
  isUpdatingStatus?: boolean;
  isUpdatingBilling?: boolean;
  isAssigning?: boolean;
  isDeleting?: boolean;
  className?: string;
}

const CATEGORY_LABELS: Record<DeadlineCategory, string> = {
  CORPORATE_SECRETARY: 'Corporate Secretary',
  TAX: 'Tax',
  ACCOUNTING: 'Accounting',
  AUDIT: 'Audit',
  COMPLIANCE: 'Compliance',
  OTHER: 'Other',
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as DeadlineCategory[];

function buildEmptyCategoryTotals(): Record<DeadlineCategory, CategoryTotals> {
  return CATEGORY_KEYS.reduce((acc, key) => {
    acc[key] = { total: 0, count: 0 };
    return acc;
  }, {} as Record<DeadlineCategory, CategoryTotals>);
}

export function DeadlinesBulkActionsToolbar({
  selectedIds,
  selectedDeadlines,
  onClearSelection,
  onUpdateStatus,
  onUpdateBillingStatus,
  onAssign,
  onDelete,
  assigneeOptions,
  isUpdatingStatus,
  isUpdatingBilling,
  isAssigning,
  isDeleting,
  className,
}: DeadlinesBulkActionsToolbarProps) {
  const [showSummary, setShowSummary] = useState(false);

  const summary = useMemo(() => {
    if (!selectedDeadlines || selectedDeadlines.length === 0) {
      return { hasSelection: false, hasAmounts: false, byCurrency: [] as CurrencySummary[] };
    }

    const currencyMap = new Map<string, CurrencySummary>();
    let hasAmounts = false;

    selectedDeadlines.forEach((deadline) => {
      const effectiveBillable = deadline.overrideBillable ?? deadline.isBillable;
      const amount = deadline.overrideAmount ?? deadline.amount;
      if (!effectiveBillable || amount == null) return;

      hasAmounts = hasAmounts || amount !== 0;

      const currency = deadline.currency || 'SGD';
      if (!currencyMap.has(currency)) {
        currencyMap.set(currency, {
          currency,
          categories: buildEmptyCategoryTotals(),
          total: 0,
        });
      }

      const summaryForCurrency = currencyMap.get(currency)!;
      summaryForCurrency.categories[deadline.category].total += amount;
      summaryForCurrency.categories[deadline.category].count += 1;
      summaryForCurrency.total += amount;
    });

    const byCurrency = Array.from(currencyMap.values()).sort((a, b) => b.total - a.total);
    return { hasSelection: true, hasAmounts, byCurrency };
  }, [selectedDeadlines]);

  if (selectedIds.length === 0) {
    return null;
  }

  const isAnyLoading = isUpdatingStatus || isUpdatingBilling || isAssigning || isDeleting;

  return (
    <>
      <div
        className={cn(
          'fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40',
          'bg-background-primary border border-border-primary rounded-lg shadow-xl',
          'flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3',
          'max-w-[calc(100%-2rem)] sm:max-w-none',
          'animate-in slide-in-from-bottom-4',
          className
        )}
      >
        <div className="flex items-center gap-1 sm:gap-2 pr-2 sm:pr-3 border-r border-border-primary">
          <span className="text-xs sm:text-sm text-text-secondary whitespace-nowrap">
            <span className="font-medium text-text-primary">{selectedIds.length}</span>
            <span className="hidden xs:inline"> selected</span>
          </span>
          {summary.hasSelection && (
            <button
              onClick={() => setShowSummary(!showSummary)}
              className={cn(
                'btn-ghost btn-xs p-1 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0',
                showSummary && 'bg-oak-primary/10 text-oak-primary'
              )}
              title={showSummary ? 'Hide totals' : 'Show totals'}
            >
              <Calculator className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClearSelection}
            className="btn-ghost btn-xs p-1 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0"
            title="Clear selection"
            disabled={isAnyLoading}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <Dropdown>
            <DropdownTrigger asChild className={isAnyLoading ? 'pointer-events-none' : undefined}>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 rounded-md transition-colors',
                  'min-h-[40px] sm:min-h-0',
                  'hover:bg-oak-light/10 hover:text-oak-primary text-text-secondary',
                  isAnyLoading && 'opacity-50 cursor-not-allowed'
                )}
                disabled={isAnyLoading}
              >
                <CheckCircle className="w-4 h-4" />
                <span className="text-xs sm:text-sm hidden sm:inline">Status</span>
              </button>
            </DropdownTrigger>
            <DropdownMenu align="left">
              <DropdownLabel>Internal Status</DropdownLabel>
              <DropdownItem onClick={() => onUpdateStatus('PENDING')}>
                Mark Pending
              </DropdownItem>
              <DropdownItem onClick={() => onUpdateStatus('PENDING_CLIENT')}>
                Mark Pending Client
              </DropdownItem>
              <DropdownItem onClick={() => onUpdateStatus('COMPLETED')}>
                Mark Completed
              </DropdownItem>
              <DropdownItem onClick={() => onUpdateStatus('IN_PROGRESS')}>
                Mark In Progress
              </DropdownItem>
              <DropdownItem onClick={() => onUpdateStatus('PENDING_REVIEW')}>
                Mark Pending Review
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem onClick={() => onUpdateStatus('CANCELLED')}>
                Mark Cancelled
              </DropdownItem>
              <DropdownItem onClick={() => onUpdateStatus('WAIVED')}>
                Mark Waived
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>

          <Dropdown>
            <DropdownTrigger asChild className={isAnyLoading ? 'pointer-events-none' : undefined}>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 rounded-md transition-colors',
                  'min-h-[40px] sm:min-h-0',
                  'hover:bg-oak-light/10 hover:text-oak-primary text-text-secondary',
                  isAnyLoading && 'opacity-50 cursor-not-allowed'
                )}
                disabled={isAnyLoading}
              >
                <DollarSign className="w-4 h-4" />
                <span className="text-xs sm:text-sm hidden sm:inline">Billing</span>
              </button>
            </DropdownTrigger>
            <DropdownMenu align="left">
              <DropdownLabel>Billing Status</DropdownLabel>
              <DropdownItem onClick={() => onUpdateBillingStatus('PENDING')}>
                Pending
              </DropdownItem>
              <DropdownItem onClick={() => onUpdateBillingStatus('TO_BE_BILLED')}>
                To be billed
              </DropdownItem>
              <DropdownItem onClick={() => onUpdateBillingStatus('INVOICED')}>
                Invoiced
              </DropdownItem>
              <DropdownItem onClick={() => onUpdateBillingStatus('PAID')}>
                Paid
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem onClick={() => onUpdateBillingStatus('NOT_APPLICABLE')}>
                Not Applicable
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>

          <Dropdown>
            <DropdownTrigger asChild className={isAnyLoading ? 'pointer-events-none' : undefined}>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 rounded-md transition-colors',
                  'min-h-[40px] sm:min-h-0',
                  'hover:bg-oak-light/10 hover:text-oak-primary text-text-secondary',
                  isAnyLoading && 'opacity-50 cursor-not-allowed'
                )}
                disabled={isAnyLoading}
              >
                <UserPlus className="w-4 h-4" />
                <span className="text-xs sm:text-sm hidden sm:inline">Assign</span>
              </button>
            </DropdownTrigger>
            <DropdownMenu align="left">
              <DropdownLabel>Assignee</DropdownLabel>
              <DropdownItem onClick={() => onAssign(null)}>
                Unassign
              </DropdownItem>
              {assigneeOptions.length > 0 && <DropdownSeparator />}
              {assigneeOptions.map((assignee) => (
                <DropdownItem key={assignee.id} onClick={() => onAssign(assignee.id)}>
                  {assignee.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>

          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isAnyLoading}
              className={cn(
                'flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 rounded-md transition-colors',
                'min-h-[40px] sm:min-h-0',
                'hover:bg-status-error/10 hover:text-status-error text-text-secondary',
                isAnyLoading && 'opacity-50 cursor-not-allowed'
              )}
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-xs sm:text-sm hidden sm:inline">Delete</span>
            </button>
          )}
        </div>
      </div>

      {showSummary && summary.hasSelection && (
        <div
          className={cn(
            'fixed bottom-20 sm:bottom-24 left-1/2 -translate-x-1/2 z-40',
            'bg-background-primary border border-border-primary rounded-lg shadow-xl',
            'px-4 py-3 min-w-[340px] max-w-[90vw]',
            'animate-in slide-in-from-bottom-2 fade-in-0'
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
              <Calculator className="w-4 h-4 text-oak-primary" />
              Selection Summary
            </h4>
            <button
              onClick={() => setShowSummary(false)}
              className="btn-ghost btn-xs p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            {summary.byCurrency.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No billable amounts in the current selection.
              </p>
            ) : (
              summary.byCurrency.map((currencySummary) => (
                <div key={currencySummary.currency}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-text-primary">
                      {currencySummary.currency}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {CATEGORY_KEYS.map((category) => (
                      <div key={category}>
                        <div className="text-xs text-text-muted mb-0.5">
                          {CATEGORY_LABELS[category]}
                          {currencySummary.categories[category].count > 0 && (
                            <span className="ml-1 text-[10px] text-text-tertiary">
                              ({currencySummary.categories[category].count})
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-text-primary">
                          {formatCurrency(currencySummary.categories[category].total, currencySummary.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default DeadlinesBulkActionsToolbar;
