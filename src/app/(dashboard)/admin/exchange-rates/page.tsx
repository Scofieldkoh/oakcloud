'use client';

import { useState, useCallback } from 'react';
import { useSession } from '@/hooks/use-auth';
import {
  useExchangeRates,
  useSyncMASDaily,
  useSyncMASMonthly,
  useCreateManualRate,
  useDeleteRate,
  useTenantRatePreference,
  useUpdateTenantRatePreference,
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
  Settings,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { isMASApiKeyExpiringSoon, getDaysUntilMASApiKeyExpiry } from '@/lib/external/mas-api';
import { cn } from '@/lib/utils';

// ============================================================================
// Helper Components
// ============================================================================

function RateTypeBadge({ rateType }: { rateType: string }) {
  const isManual = rateType === 'MANUAL_RATE';
  const isMASDaily = rateType === 'MAS_DAILY_RATE';
  const isMASMonthly = rateType === 'MAS_MONTHLY_RATE';

  let label = 'Other';
  let colorClass = 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
  let Icon = Globe;

  if (isManual) {
    label = 'Manual';
    colorClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    Icon = Pencil;
  } else if (isMASDaily) {
    label = 'MAS Daily';
    colorClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    Icon = Globe;
  } else if (isMASMonthly) {
    label = 'MAS Monthly';
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
// API Key Expiry Warning Banner
// ============================================================================

function APIKeyExpiryWarning({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  if (!isSuperAdmin || !isMASApiKeyExpiringSoon()) {
    return null;
  }

  const daysUntil = getDaysUntilMASApiKeyExpiry();
  const isExpired = daysUntil <= 0;

  return (
    <div
      className={cn(
        'mb-6 p-4 rounded-lg border flex items-start gap-3',
        isExpired
          ? 'bg-status-error/10 border-status-error/30'
          : 'bg-status-warning/10 border-status-warning/30'
      )}
    >
      <AlertTriangle
        className={cn(
          'w-5 h-5 flex-shrink-0 mt-0.5',
          isExpired ? 'text-status-error' : 'text-status-warning'
        )}
      />
      <div className="flex-1">
        <div className={cn('font-medium text-sm', isExpired ? 'text-status-error' : 'text-status-warning')}>
          {isExpired ? 'MAS API Keys Have Expired' : 'MAS API Keys Expiring Soon'}
        </div>
        <p className="text-sm text-text-secondary mt-1">
          {isExpired ? (
            <>
              The MAS APIMG Gateway API keys have expired. Exchange rate sync will fail until new keys are configured.
              Please renew your API keys from the{' '}
              <a
                href="https://eservices.mas.gov.sg/apimg-gw"
                target="_blank"
                rel="noopener noreferrer"
                className="text-oak-light hover:underline"
              >
                MAS APIMG Gateway portal
              </a>{' '}
              and update the environment variables.
            </>
          ) : (
            <>
              The MAS APIMG Gateway API keys will expire in <strong>{daysUntil} days</strong>. Please renew your API
              keys from the{' '}
              <a
                href="https://eservices.mas.gov.sg/apimg-gw"
                target="_blank"
                rel="noopener noreferrer"
                className="text-oak-light hover:underline"
              >
                MAS APIMG Gateway portal
              </a>{' '}
              before expiry to avoid sync failures.
            </>
          )}
        </p>
        <p className="text-xs text-text-muted mt-2">
          Environment variables: <code className="bg-background-tertiary px-1 py-0.5 rounded">MAS_MONTHLY_API_KEY</code>{' '}
          and <code className="bg-background-tertiary px-1 py-0.5 rounded">MAS_DAILY_API_KEY</code>
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Rate Preference Card
// ============================================================================

function RatePreferenceCard({
  isTenantAdmin,
  tenantId,
}: {
  isTenantAdmin: boolean;
  tenantId?: string;
}) {
  const { success, error } = useToast();
  const { data: preference, isLoading } = useTenantRatePreference();
  const updateMutation = useUpdateTenantRatePreference();

  const handlePreferenceChange = async (newPref: 'MONTHLY' | 'DAILY') => {
    try {
      await updateMutation.mutateAsync(newPref);
      success(`Rate preference updated to ${newPref === 'MONTHLY' ? 'MAS Monthly' : 'MAS Daily'}`);
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to update preference');
    }
  };

  if (!isTenantAdmin || !tenantId) {
    return null;
  }

  const currentPref = preference?.preferredRateType || 'MONTHLY';

  return (
    <div className="mb-6 p-4 bg-background-secondary border border-border-primary rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <Settings className="w-5 h-5 text-text-secondary" />
        <h2 className="text-sm font-semibold text-text-primary">Exchange Rate Preference</h2>
      </div>
      <p className="text-xs text-text-muted mb-4">
        Choose the default exchange rate source used for home currency conversion
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => handlePreferenceChange('MONTHLY')}
            disabled={updateMutation.isPending}
            className={cn(
              'flex-1 flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left',
              currentPref === 'MONTHLY'
                ? 'border-oak-primary bg-oak-primary/5'
                : 'border-border-primary hover:border-oak-primary/50'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                currentPref === 'MONTHLY'
                  ? 'border-oak-primary bg-oak-primary'
                  : 'border-border-secondary'
              )}
            >
              {currentPref === 'MONTHLY' && <Check className="w-3 h-3 text-white" />}
            </div>
            <div>
              <div className="font-medium text-sm text-text-primary">MAS Monthly End-of-Period</div>
              <div className="text-xs text-text-muted mt-0.5">
                Uses end-of-month rates from MAS
              </div>
            </div>
          </button>

          <button
            onClick={() => handlePreferenceChange('DAILY')}
            disabled={updateMutation.isPending}
            className={cn(
              'flex-1 flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left',
              currentPref === 'DAILY'
                ? 'border-oak-primary bg-oak-primary/5'
                : 'border-border-primary hover:border-oak-primary/50'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                currentPref === 'DAILY'
                  ? 'border-oak-primary bg-oak-primary'
                  : 'border-border-secondary'
              )}
            >
              {currentPref === 'DAILY' && <Check className="w-3 h-3 text-white" />}
            </div>
            <div>
              <div className="font-medium text-sm text-text-primary">MAS Daily Rate</div>
              <div className="text-xs text-text-muted mt-0.5">
                Uses daily exchange rates from MAS. More precise for specific dates.
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function ExchangeRatesPage() {
  const { data: session } = useSession();
  const { success, error } = useToast();
  const isSuperAdmin = session?.isSuperAdmin ?? false;
  const isTenantAdmin = session?.isTenantAdmin ?? false;

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
  const [isMasSyncModalOpen, setIsMasSyncModalOpen] = useState(false);
  const [isMasMonthlySyncModalOpen, setIsMasMonthlySyncModalOpen] = useState(false);

  // Queries
  const { data, isLoading, refetch } = useExchangeRates(filters);
  const syncMASMutation = useSyncMASDaily();
  const syncMASMonthlyMutation = useSyncMASMonthly();
  const createMutation = useCreateManualRate();
  const deleteMutation = useDeleteRate();

  // Handlers - now open modals instead of syncing directly
  const openMasSyncModal = useCallback(() => setIsMasSyncModalOpen(true), []);
  const openMasMonthlySyncModal = useCallback(() => setIsMasMonthlySyncModalOpen(true), []);

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
            Manage exchange rates from MAS (daily and monthly) and manual overrides
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={openMasSyncModal}
                disabled={syncMASMutation.isPending || syncMASMonthlyMutation.isPending}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Sync MAS Daily
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={openMasMonthlySyncModal}
                disabled={syncMASMutation.isPending || syncMASMonthlyMutation.isPending}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Sync MAS Monthly
              </Button>
            </>
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

      {/* API Key Expiry Warning (for super admins) */}
      <APIKeyExpiryWarning isSuperAdmin={isSuperAdmin} />

      {/* Rate Preference Card (for tenant admins) */}
      <RatePreferenceCard
        isTenantAdmin={isTenantAdmin || isSuperAdmin}
        tenantId={session?.tenantId ?? undefined}
      />

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
                    source: e.target.value as 'ALL' | 'MAS_DAILY' | 'MAS_MONTHLY' | 'MANUAL',
                    page: 1,
                  }))
                }
                className="input input-sm w-full"
              >
                <option value="ALL">All Sources</option>
                <option value="MAS_MONTHLY">MAS Monthly</option>
                <option value="MAS_DAILY">MAS Daily</option>
                <option value="MANUAL">Manual</option>
              </select>
            </div>
            <div>
              <label className="label">Rate Date</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="input input-sm w-full"
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
            <p className="text-xs mt-1">Click &quot;Sync MAS Daily&quot; or &quot;Sync MAS Monthly&quot; to fetch rates</p>
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

      {/* MAS Sync Modal */}
      <MASSyncModal
        isOpen={isMasSyncModalOpen}
        onClose={() => setIsMasSyncModalOpen(false)}
        syncMutation={syncMASMutation}
      />

      {/* MAS Monthly Sync Modal */}
      <MASMonthlySyncModal
        isOpen={isMasMonthlySyncModalOpen}
        onClose={() => setIsMasMonthlySyncModalOpen(false)}
        syncMutation={syncMASMonthlyMutation}
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

          <div>
            <label className="label">Rate Date</label>
            <input
              type="date"
              value={formData.rateDate}
              onChange={(e) => setFormData((prev) => ({ ...prev, rateDate: e.target.value }))}
              className="input input-sm w-full"
            />
          </div>

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

// ============================================================================
// MAS Sync Modal
// ============================================================================

interface MASSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncMutation: ReturnType<typeof useSyncMASDaily>;
}

function MASSyncModal({ isOpen, onClose, syncMutation }: MASSyncModalProps) {
  const { success, error } = useToast();
  const [syncMode, setSyncMode] = useState<'latest' | 'range'>('latest');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleSync = async () => {
    try {
      const params = syncMode === 'range' && startDate && endDate
        ? { startDate, endDate }
        : undefined;

      const result = await syncMutation.mutateAsync(params);

      if (result.success) {
        success(
          `Synced ${result.ratesCreated + result.ratesUpdated} daily rates from MAS (${result.ratesCreated} new, ${result.ratesUpdated} updated)`
        );
        onClose();
        // Reset form
        setSyncMode('latest');
        setStartDate('');
        setEndDate('');
      } else {
        error(`Sync completed with errors: ${result.errors.join(', ')}`);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to sync MAS rates');
    }
  };

  const handleClose = () => {
    if (!syncMutation.isPending) {
      onClose();
      setSyncMode('latest');
      setStartDate('');
      setEndDate('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Sync MAS Daily Rates" size="md">
      <ModalBody>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Fetch daily exchange rates from MAS (Monetary Authority of Singapore).
          </p>

          {/* Sync Mode Selection */}
          <div className="space-y-3">
            <label className="label">Sync Mode</label>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setSyncMode('latest')}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left',
                  syncMode === 'latest'
                    ? 'border-oak-primary bg-oak-primary/5'
                    : 'border-border-primary hover:border-oak-primary/50'
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                    syncMode === 'latest'
                      ? 'border-oak-primary bg-oak-primary'
                      : 'border-border-secondary'
                  )}
                >
                  {syncMode === 'latest' && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <div className="font-medium text-sm text-text-primary">Latest Available</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Fetches the most recent rates from MAS (typically yesterday&apos;s rates)
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSyncMode('range')}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left',
                  syncMode === 'range'
                    ? 'border-oak-primary bg-oak-primary/5'
                    : 'border-border-primary hover:border-oak-primary/50'
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                    syncMode === 'range'
                      ? 'border-oak-primary bg-oak-primary'
                      : 'border-border-secondary'
                  )}
                >
                  {syncMode === 'range' && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <div className="font-medium text-sm text-text-primary">Date Range</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Fetch rates for a specific date range (for backfilling historical data)
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Date Range Inputs */}
          {syncMode === 'range' && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="label">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input input-sm w-full"
                />
              </div>
              <div>
                <label className="label">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input input-sm w-full"
                />
              </div>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={handleClose} disabled={syncMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSync}
          disabled={syncMutation.isPending || (syncMode === 'range' && (!startDate || !endDate))}
          leftIcon={
            syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )
          }
        >
          {syncMutation.isPending ? 'Syncing...' : 'Sync Rates'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ============================================================================
// MAS Monthly Sync Modal
// ============================================================================

interface MASMonthlySyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncMutation: ReturnType<typeof useSyncMASMonthly>;
}

function MASMonthlySyncModal({ isOpen, onClose, syncMutation }: MASMonthlySyncModalProps) {
  const { success, error } = useToast();
  const [syncMode, setSyncMode] = useState<'latest' | 'specific'>('latest');
  const [targetMonth, setTargetMonth] = useState('');

  // Generate month options for the last 24 months
  const monthOptions = (() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 1; i <= 24; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-SG', { year: 'numeric', month: 'long' });
      options.push({ value, label });
    }
    return options;
  })();

  const handleSync = async () => {
    try {
      const month = syncMode === 'specific' && targetMonth ? targetMonth : undefined;
      const result = await syncMutation.mutateAsync(month);

      if (result.success) {
        success(
          `Synced ${result.ratesCreated + result.ratesUpdated} monthly rates from MAS (${result.ratesCreated} new, ${result.ratesUpdated} updated)`
        );
        onClose();
        // Reset form
        setSyncMode('latest');
        setTargetMonth('');
      } else {
        error(`Sync completed with errors: ${result.errors.join(', ')}`);
      }
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to sync MAS monthly rates');
    }
  };

  const handleClose = () => {
    if (!syncMutation.isPending) {
      onClose();
      setSyncMode('latest');
      setTargetMonth('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Sync MAS Monthly Rates" size="md">
      <ModalBody>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Fetch monthly end-of-period exchange rates from MAS (Monetary Authority of Singapore).
          </p>

          {/* Sync Mode Selection */}
          <div className="space-y-3">
            <label className="label">Sync Mode</label>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setSyncMode('latest')}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left',
                  syncMode === 'latest'
                    ? 'border-oak-primary bg-oak-primary/5'
                    : 'border-border-primary hover:border-oak-primary/50'
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                    syncMode === 'latest'
                      ? 'border-oak-primary bg-oak-primary'
                      : 'border-border-secondary'
                  )}
                >
                  {syncMode === 'latest' && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <div className="font-medium text-sm text-text-primary">Latest Available</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Fetches the most recent monthly rates (typically previous month)
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSyncMode('specific')}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left',
                  syncMode === 'specific'
                    ? 'border-oak-primary bg-oak-primary/5'
                    : 'border-border-primary hover:border-oak-primary/50'
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
                    syncMode === 'specific'
                      ? 'border-oak-primary bg-oak-primary'
                      : 'border-border-secondary'
                  )}
                >
                  {syncMode === 'specific' && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <div className="font-medium text-sm text-text-primary">Specific Month</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Fetch rates for a specific month (for backfilling historical data)
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Month Selection */}
          {syncMode === 'specific' && (
            <div className="pt-2">
              <label className="label">Select Month</label>
              <select
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="input input-sm w-full"
              >
                <option value="">Select a month...</option>
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={handleClose} disabled={syncMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSync}
          disabled={syncMutation.isPending || (syncMode === 'specific' && !targetMonth)}
          leftIcon={
            syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )
          }
        >
          {syncMutation.isPending ? 'Syncing...' : 'Sync Rates'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
