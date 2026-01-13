'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Copy } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { FormInput } from '@/components/ui/form-input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { Toggle } from '@/components/ui/toggle';
import { CopyServiceModal } from '@/components/companies/contracts/copy-service-modal';
import { useCompany } from '@/hooks/use-companies';
import { useCompanyContracts } from '@/hooks/use-contracts';
import { useCreateContractService } from '@/hooks/use-contract-services';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes';
import { createServiceSchema, type CreateServiceInput } from '@/lib/validations/service';
import {
  SERVICE_TYPES,
  SERVICE_STATUSES,
  BILLING_FREQUENCIES,
} from '@/lib/constants/contracts';

interface PageProps {
  params: Promise<{ id: string; contractId: string }>;
}

export default function NewServicePage({ params }: PageProps) {
  const { id: companyId, contractId } = use(params);
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);

  // Fetch company and contract data for display
  const { data: company } = useCompany(companyId);
  const { data: contractsData } = useCompanyContracts(companyId);
  const contract = contractsData?.contracts.find((c) => c.id === contractId);

  // Use the mutation hook
  const createServiceMutation = useCreateContractService(companyId, contractId);

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
    setValue,
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
      autoRenewal: true,
      renewalPeriodMonths: '12',
    },
  });

  // Handle copying service data
  const handleCopyService = (service: {
    name: string;
    serviceType: string;
    status: string;
    rate: number;
    currency: string;
    frequency: string;
    scope: string | null;
    autoRenewal: boolean;
    renewalPeriodMonths: number | null;
  }) => {
    setValue('name', service.name);
    setValue('serviceType', service.serviceType as 'RECURRING' | 'ONE_TIME');
    setValue('status', service.status as 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'PENDING');
    setValue('rate', service.rate.toString());
    setValue('currency', service.currency);
    setValue('frequency', service.frequency as ServiceFormValues['frequency']);
    setValue('scope', service.scope || '');
    setValue('autoRenewal', service.autoRenewal);
    setValue('renewalPeriodMonths', service.renewalPeriodMonths?.toString() || '');
  };

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
      await createServiceMutation.mutateAsync({
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
      setSubmitError(err instanceof Error ? err.message : 'Failed to create service');
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 sm:p-6 pb-0">
        <Link
          href={`/companies/${companyId}?tab=contracts`}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Contracts
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
              Add Service
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              {company?.name} &bull; {contract?.title || 'Contract'}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Copy className="w-4 h-4" />}
            onClick={() => setShowCopyModal(true)}
            type="button"
          >
            Copy from Existing
          </Button>
        </div>
      </div>

      {/* Error */}
      {submitError && (
        <div className="px-4 sm:px-6">
          <Alert variant="error" className="mb-6">
            {submitError}
          </Alert>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col p-4 sm:p-6 pt-4">
        {/* Two-column layout: Left side sections (2/5), Right side Scope (3/5) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 flex-1">
          {/* Left column: Main form sections (2/5 width on large screens) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Section 1: Service Information */}
            <div className="card">
              <div className="p-4 border-b border-border-primary">
                <h2 className="font-medium text-text-primary">Service Information</h2>
              </div>
              <div className="p-4 space-y-4">
                <FormInput
                  label="Service Name *"
                  placeholder="e.g., Monthly Bookkeeping"
                  error={errors.name?.message}
                  inputSize="sm"
                  {...register('name')}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Controller
                    name="serviceType"
                    control={control}
                    render={({ field }) => (
                      <SearchableSelect
                        label="Service Type"
                        options={SERVICE_TYPES as unknown as { value: string; label: string }[]}
                        value={field.value || ''}
                        onChange={field.onChange}
                        size="sm"
                        clearable={false}
                      />
                    )}
                  />

                  <Controller
                    name="status"
                    control={control}
                    render={({ field }) => (
                      <SearchableSelect
                        label="Status"
                        options={SERVICE_STATUSES as unknown as { value: string; label: string }[]}
                        value={field.value || ''}
                        onChange={field.onChange}
                        size="sm"
                        clearable={false}
                      />
                    )}
                  />
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
                  <FormInput
                    label="Rate"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    error={errors.rate?.message}
                    inputSize="sm"
                    {...register('rate')}
                  />

                  <Controller
                    name="currency"
                    control={control}
                    render={({ field }) => (
                      <SearchableSelect
                        label="Currency"
                        options={[
                          { value: 'SGD', label: 'SGD' },
                          { value: 'USD', label: 'USD' },
                          { value: 'EUR', label: 'EUR' },
                          { value: 'GBP', label: 'GBP' },
                          { value: 'MYR', label: 'MYR' },
                        ]}
                        value={field.value || ''}
                        onChange={field.onChange}
                        size="sm"
                        clearable={false}
                      />
                    )}
                  />
                </div>

                {serviceType === 'RECURRING' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Controller
                      name="frequency"
                      control={control}
                      render={({ field }) => (
                        <SearchableSelect
                          label="Billing Frequency"
                          options={BILLING_FREQUENCIES.filter((f) => f.value !== 'ONE_TIME')}
                          value={field.value || ''}
                          onChange={field.onChange}
                          size="sm"
                          clearable={false}
                        />
                      )}
                    />
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
                  <Controller
                    name="startDate"
                    control={control}
                    render={({ field }) => (
                      <SingleDateInput
                        label="Start Date"
                        value={field.value}
                        onChange={field.onChange}
                        error={errors.startDate?.message}
                        required
                      />
                    )}
                  />

                  <Controller
                    name="endDate"
                    control={control}
                    render={({ field }) => (
                      <SingleDateInput
                        label="End Date"
                        value={field.value}
                        onChange={field.onChange}
                        hint={serviceType === 'RECURRING' ? 'Leave empty for ongoing services' : undefined}
                      />
                    )}
                  />
                </div>

                {serviceType === 'RECURRING' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    <Controller
                      name="autoRenewal"
                      control={control}
                      render={({ field }) => (
                        <div className="pt-2">
                          <Toggle
                            label="Auto-renewal"
                            checked={field.value || false}
                            onChange={field.onChange}
                            size="sm"
                          />
                        </div>
                      )}
                    />

                    <div className={autoRenewal ? 'opacity-100' : 'opacity-0 pointer-events-none'}>
                      <div className="flex items-center gap-2">
                        <FormInput
                          type="number"
                          min="1"
                          max="120"
                          placeholder="12"
                          error={errors.renewalPeriodMonths?.message}
                          inputSize="sm"
                          className="w-24"
                          {...register('renewalPeriodMonths')}
                          disabled={!autoRenewal}
                        />
                        <span className="text-sm text-text-muted">months</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column: Scope of Work (3/5 width on large screens) */}
          <div className="lg:col-span-3 flex flex-col min-h-0">
            <div className="card flex flex-col flex-1 min-h-0">
              <div className="p-4 border-b border-border-primary flex-shrink-0">
                <h2 className="font-medium text-text-primary">Scope of Work</h2>
              </div>
              <div className="p-4 flex flex-col flex-1 min-h-0">
                <div className="flex-1 min-h-0 flex flex-col">
                  <Controller
                    name="scope"
                    control={control}
                    render={({ field }) => (
                      <div className="h-full">
                        <RichTextEditor
                          value={field.value || ''}
                          onChange={field.onChange}
                          placeholder="Describe the scope of work for this service..."
                          className="h-full"
                        />
                      </div>
                    )}
                  />
                </div>
                <p className="text-xs text-text-muted mt-2 flex-shrink-0">
                  Optional. Detailed description of what this service includes.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-6 flex-shrink-0">
          <Link href={`/companies/${companyId}?tab=contracts`}>
            <Button variant="secondary" size="sm">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            leftIcon={<Save className="w-4 h-4" />}
          >
            {isSubmitting ? 'Creating...' : 'Add Service'}
          </Button>
        </div>
      </form>

      {/* Copy Service Modal */}
      <CopyServiceModal
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        onCopy={handleCopyService}
        currentCompanyId={companyId}
      />
    </div>
  );
}
