'use client';

import { useState, useCallback } from 'react';
import { useSession } from '@/hooks/use-auth';
import {
  useExchangeRates,
  useSyncExchangeRates,
  useCreateManualRate,
  useDeleteRate,
  type ExchangeRate,
  type ExchangeRateSearchParams,
} from '@/hooks/use-exchange-rates';
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_NAMES,
  formatRate,
  type SupportedCurrency,
} from '@/lib/validations/exchange-rate';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { DateInput } from '@/components/ui/date-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Pagination } from '@/components/companies/pagination';
import { useToast } from '@/components/ui/toast';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import {
  DollarSign,
  RefreshCw,
  Plus,
  Trash2,
  Globe,
  Building,
  Pencil,
  Filter,
  ArrowRightLeft,
  Calendar,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Helper Components
// ============================================================================

function RateTypeBadge({ rateType }: { rateType: string }) {
  const isManual = rateType === 'MANUAL_RATE';
  const isMAS = rateType === 'MAS_DAILY_RATE';
  const isIRAS = rateType === 'IRAS_MONTHLY_AVG_RATE';

  let label = 'Other';
  let colorClass = 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
  let Icon = Globe;

  if (isManual) {
    label = 'Manual';
    colorClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    Icon = Pencil;
  } else if (isMAS) {
    label = 'MAS Daily';
    colorClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    Icon = Globe;
  } else if (isIRAS) {
    label = 'IRAS Monthly';
    colorClass = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    Icon = Globe;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        colorClass
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function ScopeBadge({ isSystem }: { isSystem: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs',
        isSystem
          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      )}
    >
      {isSystem ? <Globe className="w-3 h-3" /> : <Building className="w-3 h-3" />}
      {isSystem ? 'System' : 'Tenant'}
    </span>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function ExchangeRatesPage() {
  const { data: session } = useSession();
  const { success, error } = useToast();
  const isSuperAdmin = session?.isSuperAdmin ?? false;

  // Filter state
  const [filters, setFilters] = useState<ExchangeRateSearchParams>({
    page: 1,
    limit: 50,
    source: 'ALL',
    includeSystem: true,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Queries
  const { data, isLoading, refetch } = useExchangeRates(filters);
  const syncMutation = useSyncExchangeRates();
  const createMutation = useCreateManualRate();
  const deleteMutation = useDeleteRate();

  // Handlers
  const handleSync = useCallback(async () => {
    try {
      const result = await syncMutation.mutateAsync();
      if (result.success) {
        success(
          `Synced ${result.ratesCreated + result.ratesUpdated} rates from MAS (${result.ratesCreated} new, ${result.ratesUpdated} updated)`
        );
      } else {
        error(`Sync completed with errors: ${result.errors.join(', ')}`);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to sync rates');
    }
  }, [syncMutation, success, error]);

  const handleApplyFilters = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      page: 1,
      sourceCurrency: currencyFilter || undefined,
      startDate: dateFilter || undefined,
      endDate: dateFilter || undefined,
    }));
  }, [currencyFilter, dateFilter]);

  const handleClearFilters = useCallback(() => {
    setCurrencyFilter('');
    setDateFilter('');
    setFilters({
      page: 1,
      limit: 50,
      source: 'ALL',
      includeSystem: true,
    });
  }, []);

  const handleDelete = useCallback(
    async (reason?: string) => {
      if (!deleteConfirmId || !reason) return;
      try {
        await deleteMutation.mutateAsync({ id: deleteConfirmId, reason });
        success('Exchange rate deleted');
        setDeleteConfirmId(null);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete rate');
      }
    },
    [deleteConfirmId, deleteMutation, success, error]
  );

  const rates = data?.rates ?? [];
  const rateToDelete = rates.find((r) => r.id === deleteConfirmId);

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
            Exchange Rates
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage exchange rates from MAS and manual overrides
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSync}
              disabled={syncMutation.isPending}
              leftIcon={
                syncMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )
              }
            >
              Sync from MAS
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Add Manual Rate
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            leftIcon={<Filter className="w-4 h-4" />}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </Button>
          {(currencyFilter || dateFilter) && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Clear Filters
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 bg-background-secondary border border-border-primary rounded-lg">
            <div>
              <label className="label">Currency</label>
              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
                className="input input-sm w-full"
              >
                <option value="">All Currencies</option>
                {SUPPORTED_CURRENCIES.filter((c) => c !== 'SGD').map((code) => (
                  <option key={code} value={code}>
                    {code} - {CURRENCY_NAMES[code]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Source</label>
              <select
                value={filters.source}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    source: e.target.value as 'ALL' | 'MAS_DAILY' | 'MANUAL',
                    page: 1,
                  }))
                }
                className="input input-sm w-full"
              >
                <option value="ALL">All Sources</option>
                <option value="MAS_DAILY">MAS Daily</option>
                <option value="MANUAL">Manual</option>
              </select>
            </div>
            <div>
              <DateInput
                label="Rate Date"
                value={dateFilter}
                onChange={setDateFilter}
                size="sm"
              />
            </div>
            <div className="flex items-end">
              <Button variant="primary" size="sm" onClick={handleApplyFilters}>
                Apply
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-text-muted" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && rates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-text-muted">
          <DollarSign className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">No exchange rates found</p>
          {isSuperAdmin && (
            <p className="text-xs mt-1">Click &quot;Sync from MAS&quot; to fetch the latest rates</p>
          )}
        </div>
      )}

      {/* Desktop Table View */}
      {!isLoading && rates.length > 0 && (
        <>
          <div className="hidden md:block table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th>Rate (→ SGD)</th>
                  <th>Inverse (SGD →)</th>
                  <th>Source</th>
                  <th>Scope</th>
                  <th>Rate Date</th>
                  <th className="w-16">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rate.sourceCurrency}</span>
                        <ArrowRightLeft className="w-3 h-3 text-text-muted" />
                        <span className="text-text-secondary">{rate.targetCurrency}</span>
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-sm">
                        {formatRate(rate.rate)}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono text-sm text-text-secondary">
                        {rate.inverseRate ? formatRate(rate.inverseRate) : '-'}
                      </span>
                    </td>
                    <td>
                      <RateTypeBadge rateType={rate.rateType} />
                    </td>
                    <td>
                      <ScopeBadge isSystem={rate.isSystemRate} />
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(rate.rateDate)}
                      </div>
                    </td>
                    <td>
                      {rate.isManualOverride && (
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          onClick={() => setDeleteConfirmId(rate.id)}
                          className="text-status-error hover:bg-status-error/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {rates.map((rate) => (
              <MobileCard
                key={rate.id}
                title={
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{rate.sourceCurrency}</span>
                    <ArrowRightLeft className="w-3 h-3 text-text-muted" />
                    <span>{rate.targetCurrency}</span>
                  </div>
                }
                subtitle={CURRENCY_NAMES[rate.sourceCurrency as SupportedCurrency]}
                badge={<RateTypeBadge rateType={rate.rateType} />}
                actions={
                  rate.isManualOverride ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      onClick={() => setDeleteConfirmId(rate.id)}
                      className="text-status-error hover:bg-status-error/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : undefined
                }
                details={
                  <CardDetailsGrid>
                    <CardDetailItem
                      label="Rate"
                      value={
                        <span className="font-mono">{formatRate(rate.rate)}</span>
                      }
                    />
                    <CardDetailItem
                      label="Inverse"
                      value={
                        <span className="font-mono text-text-secondary">
                          {rate.inverseRate ? formatRate(rate.inverseRate) : '-'}
                        </span>
                      }
                    />
                    <CardDetailItem
                      label="Scope"
                      value={<ScopeBadge isSystem={rate.isSystemRate} />}
                    />
                    <CardDetailItem label="Date" value={formatDate(rate.rateDate)} />
                  </CardDetailsGrid>
                }
              />
            ))}
          </div>

          {/* Pagination */}
          {data && data.totalPages > 0 && (
            <div className="mt-4">
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                limit={data.limit}
                onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
                onLimitChange={(limit) => setFilters((prev) => ({ ...prev, limit, page: 1 }))}
              />
            </div>
          )}
        </>
      )}

      {/* Create Manual Rate Modal */}
      <CreateManualRateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        isSuperAdmin={isSuperAdmin}
        tenantId={session?.tenantId ?? undefined}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleDelete}
        title="Delete Exchange Rate"
        description={
          rateToDelete
            ? `Are you sure you want to delete the manual rate for ${rateToDelete.sourceCurrency}/${rateToDelete.targetCurrency}?`
            : ''
        }
        variant="danger"
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
        requireReason
        reasonLabel="Reason for deletion"
        reasonMinLength={5}
      />
    </div>
  );
}

// ============================================================================
// Create Manual Rate Modal
// ============================================================================

interface CreateManualRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSuperAdmin: boolean;
  tenantId?: string;
}

function CreateManualRateModal({
  isOpen,
  onClose,
  isSuperAdmin,
  tenantId,
}: CreateManualRateModalProps) {
  const { success, error } = useToast();
  const createMutation = useCreateManualRate();

  const [formData, setFormData] = useState({
    sourceCurrency: 'USD' as SupportedCurrency,
    rate: '',
    rateDate: new Date().toISOString().split('T')[0],
    reason: '',
    isSystemRate: false,
  });

  const handleSubmit = async () => {
    try {
      const rate = parseFloat(formData.rate);
      if (isNaN(rate) || rate <= 0) {
        error('Please enter a valid rate');
        return;
      }

      await createMutation.mutateAsync({
        tenantId: formData.isSystemRate ? null : tenantId || null,
        sourceCurrency: formData.sourceCurrency,
        rate,
        rateDate: formData.rateDate,
        reason: formData.reason,
      });

      success('Manual rate created successfully');
      onClose();
      setFormData({
        sourceCurrency: 'USD',
        rate: '',
        rateDate: new Date().toISOString().split('T')[0],
        reason: '',
        isSystemRate: false,
      });
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to create rate');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Manual Rate" size="md">
      <ModalBody>
        <div className="space-y-4">
          <div>
            <label className="label">Currency</label>
            <select
              value={formData.sourceCurrency}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  sourceCurrency: e.target.value as SupportedCurrency,
                }))
              }
              className="input input-sm w-full"
            >
              {SUPPORTED_CURRENCIES.filter((c) => c !== 'SGD').map((code) => (
                <option key={code} value={code}>
                  {code} - {CURRENCY_NAMES[code]}
                </option>
              ))}
            </select>
          </div>

          <FormInput
            label="Exchange Rate"
            type="number"
            value={formData.rate}
            onChange={(e) => setFormData((prev) => ({ ...prev, rate: e.target.value }))}
            placeholder="e.g., 1.3456"
            hint={`How many SGD for 1 ${formData.sourceCurrency}`}
            inputSize="sm"
            step="0.00000001"
          />

          <DateInput
            label="Rate Date"
            value={formData.rateDate}
            onChange={(val) => setFormData((prev) => ({ ...prev, rateDate: val }))}
            size="sm"
          />

          <FormInput
            label="Reason"
            value={formData.reason}
            onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder="Why are you creating this manual rate?"
            hint="Minimum 5 characters"
            inputSize="sm"
          />

          {isSuperAdmin && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-border-primary bg-bg-tertiary">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-text-primary">System Rate</span>
                <span className="text-xs text-text-muted">
                  {formData.isSystemRate
                    ? 'This rate will be available to all tenants'
                    : 'This rate will only apply to the current tenant'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={formData.isSystemRate}
                onClick={() =>
                  setFormData((prev) => ({ ...prev, isSystemRate: !prev.isSystemRate }))
                }
                className={cn(
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-oak-primary focus:ring-offset-2',
                  formData.isSystemRate
                    ? 'bg-oak-primary border-oak-primary'
                    : 'bg-gray-300 border-gray-300 dark:bg-gray-600 dark:border-gray-600'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out',
                    formData.isSystemRate ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={
            createMutation.isPending ||
            !formData.rate ||
            !formData.rateDate ||
            formData.reason.length < 5
          }
        >
          {createMutation.isPending ? 'Creating...' : 'Create Rate'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
