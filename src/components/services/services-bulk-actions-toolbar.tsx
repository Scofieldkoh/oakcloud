'use client';

import { useMemo, useState } from 'react';
import { Calculator, Calendar, Trash2, X } from 'lucide-react';
import { cn, formatCurrency, toNumber } from '@/lib/utils';
import type { ContractServiceWithRelations } from '@/hooks/use-contract-services';

interface FrequencyTotals {
  oneTime: number;
  annual: number;
  semiAnnual: number;
  quarterly: number;
  monthly: number;
}

interface CurrencySummary {
  currency: string;
  totals: FrequencyTotals;
}

interface ServicesBulkActionsToolbarProps {
  selectedIds: string[];
  selectedServices?: ContractServiceWithRelations[];
  onClearSelection: () => void;
  onAddEndDate: () => void;
  onHardDelete: () => void;
  isUpdating?: boolean;
  isDeleting?: boolean;
  className?: string;
}

const emptyTotals = (): FrequencyTotals => ({
  oneTime: 0,
  annual: 0,
  semiAnnual: 0,
  quarterly: 0,
  monthly: 0,
});

const averageMonthlyFromTotals = (totals: FrequencyTotals) => (
  totals.oneTime / 12 +
  totals.annual / 12 +
  totals.semiAnnual / 6 +
  totals.quarterly / 3 +
  totals.monthly
);

export function ServicesBulkActionsToolbar({
  selectedIds,
  selectedServices,
  onClearSelection,
  onAddEndDate,
  onHardDelete,
  isUpdating,
  isDeleting,
  className,
}: ServicesBulkActionsToolbarProps) {
  const [showSummary, setShowSummary] = useState(false);

  const summary = useMemo(() => {
    if (!selectedServices || selectedServices.length === 0) {
      return { hasAmounts: false, byCurrency: [] as CurrencySummary[] };
    }

    const map = new Map<string, FrequencyTotals>();
    let hasAmounts = false;

    selectedServices.forEach((service) => {
      const rate = toNumber(service.rate);
      if (rate == null) return;
      hasAmounts = hasAmounts || rate !== 0;
      const currency = service.currency || 'SGD';
      if (!map.has(currency)) {
        map.set(currency, emptyTotals());
      }
      const totals = map.get(currency)!;

      switch (service.frequency) {
        case 'ONE_TIME':
          totals.oneTime += rate;
          break;
        case 'ANNUALLY':
          totals.annual += rate;
          break;
        case 'SEMI_ANNUALLY':
          totals.semiAnnual += rate;
          break;
        case 'QUARTERLY':
          totals.quarterly += rate;
          break;
        case 'MONTHLY':
        default:
          totals.monthly += rate;
          break;
      }
    });

    const byCurrency = Array.from(map.entries()).map(([currency, totals]) => ({
      currency,
      totals,
    }));

    return { hasAmounts, byCurrency };
  }, [selectedServices]);

  if (selectedIds.length === 0) {
    return null;
  }

  const isAnyLoading = isUpdating || isDeleting;

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
          {summary.hasAmounts && (
            <button
              onClick={() => setShowSummary(!showSummary)}
              className={cn(
                'btn-ghost btn-xs p-1 min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0',
                showSummary && 'bg-oak-primary/10 text-oak-primary'
              )}
              title={showSummary ? 'Hide totals' : 'Show totals'}
              disabled={isAnyLoading}
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
          <button
            type="button"
            onClick={onAddEndDate}
            disabled={isAnyLoading}
            className={cn(
              'flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 rounded-md transition-colors',
              'min-h-[40px] sm:min-h-0',
              'hover:bg-oak-light/10 hover:text-oak-primary text-text-secondary',
              isAnyLoading && 'opacity-50 cursor-not-allowed'
            )}
            title="Add end date"
          >
            <Calendar className="w-4 h-4" />
            <span className="text-xs sm:text-sm hidden sm:inline">Add End Date</span>
          </button>
          <button
            type="button"
            onClick={onHardDelete}
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
        </div>
      </div>

      {showSummary && summary.byCurrency.length > 0 && (
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
            {summary.byCurrency.map(({ currency, totals }) => {
              const averageMonthly = averageMonthlyFromTotals(totals);

              return (
                <div key={currency}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-text-primary">{currency}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">One-time</div>
                      <div className="text-sm text-text-primary">
                        {formatCurrency(totals.oneTime, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">Annual</div>
                      <div className="text-sm text-text-primary">
                        {formatCurrency(totals.annual, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">Quarterly</div>
                      <div className="text-sm text-text-primary">
                        {formatCurrency(totals.quarterly, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-muted mb-0.5">Monthly</div>
                      <div className="text-sm text-text-primary">
                        {formatCurrency(totals.monthly, currency)}
                      </div>
                    </div>
                    {totals.semiAnnual !== 0 && (
                      <div>
                        <div className="text-xs text-text-muted mb-0.5">Semi-annual</div>
                        <div className="text-sm text-text-primary">
                          {formatCurrency(totals.semiAnnual, currency)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-border-primary pt-2 mt-3">
                    <div className="text-xs text-text-muted mb-0.5">Average monthly</div>
                    <div className="text-sm text-text-primary font-medium">
                      {formatCurrency(averageMonthly, currency)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export default ServicesBulkActionsToolbar;
