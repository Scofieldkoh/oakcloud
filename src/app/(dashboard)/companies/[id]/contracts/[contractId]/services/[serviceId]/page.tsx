'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Checkbox } from '@/components/ui/checkbox';
import { useCompany } from '@/hooks/use-companies';
import { useCompanyContracts } from '@/hooks/use-contracts';
import { useUpdateContractService } from '@/hooks/use-contract-services';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes';
import { createServiceSchema, type CreateServiceInput } from '@/lib/validations/service';
import {
  SERVICE_TYPES,
  SERVICE_STATUSES,
  BILLING_FREQUENCIES,
} from '@/lib/constants/contracts';

interface PageProps {
  params: Promise<{ id: string; contractId: string; serviceId: string }>;
}

export default function EditServicePage({ params }: PageProps) {
  const { id: companyId, contractId, serviceId } = use(params);
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch company and contract data for display
  const { data: company } = useCompany(companyId);
  const { data: contractsData, isLoading: isLoadingContract } = useCompanyContracts(companyId);
  const contract = contractsData?.contracts.find((c) => c.id === contractId);
  const service = contract?.services.find((s) => s.id === serviceId);

  // Use the mutation hook
  const updateServiceMutation = useUpdateContractService(companyId, contractId, serviceId);

  // Form type uses string for rate/renewalPeriodMonths since they're inputs
  // Zod schema transforms them to numbers on validation
  type ServiceFormValues = {
    name: string;
    serviceType: 'RECURRING' | 'ONE_TIME';
    status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'PENDING';
    rate: string;
    currency: string;
    frequency: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY' | 'ONE_TIME';
    startDate: string;
    endDate: string;
    scope: string;
    autoRenewal: boolean;
    renewalPeriodMonths: string;
  };

  const {
    register,
    handleSubmit,
    watch,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ServiceFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createServiceSchema) as any,
    defaultValues: {
      name: '',
      serviceType: 'RECURRING',
      status: 'ACTIVE',
      rate: '',
      currency: 'SGD',
      frequency: 'MONTHLY',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      scope: '',
      autoRenewal: false,
      renewalPeriodMonths: '',
    },
  });

  // Populate form when service data loads
  useEffect(() => {
    if (service) {
      reset({
        name: service.name,
        serviceType: service.serviceType,
        status: service.status,
        rate: service.rate !== null ? String(service.rate) : '',
        currency: service.currency,
        frequency: service.frequency,
        startDate: service.startDate.split('T')[0],
        endDate: service.endDate?.split('T')[0] || '',
        scope: service.scope || '',
        autoRenewal: service.autoRenewal,
        renewalPeriodMonths: service.renewalPeriodMonths
          ? String(service.renewalPeriodMonths)
          : '',
      });
    }
  }, [service, reset]);

  // Warn about unsaved changes when leaving the page
  useUnsavedChangesWarning(isDirty, !isSubmitting);

  // Watch fields for conditional rendering
  const serviceType = watch('serviceType');
  const autoRenewal = watch('autoRenewal');

  // Note: Zod transforms string rate/renewalPeriodMonths to numbers
  // so data here has the transformed (output) types
  const onSubmit = async (data: unknown) => {
    setSubmitError(null);
    const validatedData = data as CreateServiceInput;

    try {
      await updateServiceMutation.mutateAsync({
        name: validatedData.name.trim(),
        serviceType: validatedData.serviceType,
        status: validatedData.status,
        rate: validatedData.rate,
        currency: validatedData.currency,
        frequency: validatedData.frequency,
        startDate: validatedData.startDate,
        endDate: validatedData.endDate,
        scope: validatedData.scope?.trim() || null,
        autoRenewal: validatedData.autoRenewal,
        renewalPeriodMonths: validatedData.renewalPeriodMonths,
      });
      router.push(`/companies/${companyId}?tab=contracts`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to update service');
    }
  };

  if (isLoadingContract) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-oak-primary animate-spin" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-text-muted mb-4">Service not found</p>
          <Link
            href={`/companies/${companyId}?tab=contracts`}
            className="text-oak-light hover:text-oak-dark"
          >
            Return to company
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/companies/${companyId}?tab=contracts`}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Contracts
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
          Edit Service
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {company?.name} &bull; {contract?.title || 'Contract'}
        </p>
      </div>

      {/* Error */}
      {submitError && (
        <div className="card border-status-error bg-status-error/5 mb-4">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{submitError}</p>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Section 1: Service Information */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Service Information</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="label">Service Name *</label>
              <input
                type="text"
                {...register('name')}
                placeholder="e.g., Monthly Bookkeeping"
                className={`input input-sm ${errors.name ? 'input-error' : ''}`}
              />
              {errors.name && (
                <p className="text-xs text-status-error mt-1.5">{errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Service Type</label>
                <select {...register('serviceType')} className="input input-sm">
                  {SERVICE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Status</label>
                <select {...register('status')} className="input input-sm">
                  {SERVICE_STATUSES.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Billing Details */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Billing Details</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('rate')}
                  placeholder="0.00"
                  className={`input input-sm ${errors.rate ? 'input-error' : ''}`}
                />
                {errors.rate && (
                  <p className="text-xs text-status-error mt-1.5">{errors.rate.message}</p>
                )}
              </div>

              <div>
                <label className="label">Currency</label>
                <select {...register('currency')} className="input input-sm">
                  <option value="SGD">SGD</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="MYR">MYR</option>
                </select>
              </div>
            </div>

            {serviceType === 'RECURRING' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Billing Frequency</label>
                  <select {...register('frequency')} className="input input-sm">
                    {BILLING_FREQUENCIES.filter((f) => f.value !== 'ONE_TIME').map(
                      (freq) => (
                        <option key={freq.value} value={freq.value}>
                          {freq.label}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Schedule */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Schedule</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Start Date *</label>
                <input
                  type="date"
                  {...register('startDate')}
                  className={`input input-sm ${errors.startDate ? 'input-error' : ''}`}
                />
                {errors.startDate && (
                  <p className="text-xs text-status-error mt-1.5">{errors.startDate.message}</p>
                )}
              </div>

              <div>
                <label className="label">End Date</label>
                <input
                  type="date"
                  {...register('endDate')}
                  className="input input-sm"
                />
                {serviceType === 'RECURRING' && (
                  <p className="text-xs text-text-muted mt-1.5">Leave empty for ongoing services</p>
                )}
              </div>
            </div>

            {serviceType === 'RECURRING' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Controller
                    name="autoRenewal"
                    control={control}
                    render={({ field }) => (
                      <Checkbox
                        id="auto-renewal"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        size="sm"
                      />
                    )}
                  />
                  <label
                    htmlFor="auto-renewal"
                    className="text-sm text-text-primary cursor-pointer"
                  >
                    Auto-renewal
                  </label>
                </div>

                {autoRenewal && (
                  <div>
                    <label className="label">Renewal Period</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="120"
                        {...register('renewalPeriodMonths')}
                        placeholder="12"
                        className={`input input-sm w-24 ${errors.renewalPeriodMonths ? 'input-error' : ''}`}
                      />
                      <span className="text-sm text-text-muted">months</span>
                    </div>
                    {errors.renewalPeriodMonths && (
                      <p className="text-xs text-status-error mt-1.5">{errors.renewalPeriodMonths.message}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Scope of Work (Optional) */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Scope of Work</h2>
          </div>
          <div className="p-4">
            <Controller
              name="scope"
              control={control}
              render={({ field }) => (
                <RichTextEditor
                  value={field.value || ''}
                  onChange={field.onChange}
                  placeholder="Describe the scope of work for this service..."
                  minHeight={200}
                />
              )}
            />
            <p className="text-xs text-text-muted mt-2">
              Optional. Detailed description of what this service includes.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href={`/companies/${companyId}?tab=contracts`}
            className="btn-secondary btn-sm"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary btn-sm flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Updating...' : 'Update Service'}
          </button>
        </div>
      </form>
    </div>
  );
}
