'use client';

import { use, useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Copy, Sparkles, FileText, DollarSign, CalendarDays, ListChecks, ChevronDown, ChevronUp, Info, Loader2, WifiOff, RefreshCw } from 'lucide-react';
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
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { createServiceSchema, type CreateServiceInput, type DeadlineRuleInput } from '@/lib/validations/service';
import { useToast } from '@/components/ui/toast';
import {
  SERVICE_TYPES,
  SERVICE_STATUSES,
  BILLING_FREQUENCIES,
} from '@/lib/constants/contracts';
import {
  ALL_SERVICE_BUNDLES,
  type ServiceTemplateBundle,
} from '@/lib/constants/deadline-templates';
import { DeadlineBuilderTable, type CompanyData } from '@/components/services/deadline-builder';
import { convertTemplatesToRuleInputs } from '@/lib/utils/deadline-template-converter';
import { cn } from '@/lib/utils';

// Collapsible card section component
interface CardSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string;
  className?: string;
  id?: string;
}

function CardSection({ title, icon, children, defaultOpen = true, badge, className, id }: CardSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const headingId = id ? `${id}-heading` : undefined;

  return (
    <section className={cn('card overflow-hidden', className)} aria-labelledby={headingId}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between gap-3 bg-background-secondary/30 hover:bg-background-secondary/50 transition-colors border-b border-border-primary"
        aria-expanded={isOpen}
        aria-controls={id ? `${id}-content` : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md bg-oak-primary/10 text-oak-primary">
            {icon}
          </div>
          <h2 id={headingId} className="font-medium text-text-primary text-sm">{title}</h2>
          {badge && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-oak-primary/10 text-oak-primary font-medium">
              {badge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </div>
      </button>
      <div
        id={id ? `${id}-content` : undefined}
        className={cn(
          'transition-all duration-200 ease-in-out overflow-hidden',
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="p-4">{children}</div>
      </div>
    </section>
  );
}

interface PageProps {
  params: Promise<{ id: string; contractId: string }>;
}

// Map bundle category to service type and frequency
function getBundleDefaults(bundle: ServiceTemplateBundle): {
  serviceType: 'RECURRING' | 'ONE_TIME';
  frequency: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY' | 'ONE_TIME';
} {
  // Determine based on bundle code patterns
  if (bundle.code.includes('MONTHLY')) {
    return { serviceType: 'RECURRING', frequency: 'MONTHLY' };
  }
  if (bundle.code.includes('QUARTERLY')) {
    return { serviceType: 'RECURRING', frequency: 'QUARTERLY' };
  }
  // Default: annual recurring for most compliance services
  return { serviceType: 'RECURRING', frequency: 'ANNUALLY' };
}

export default function NewServicePage({ params }: PageProps) {
  const { id: companyId, contractId } = use(params);
  const router = useRouter();
  const { success: toastSuccess } = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [deadlineRules, setDeadlineRules] = useState<DeadlineRuleInput[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const templateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (templateTimeoutRef.current) {
        clearTimeout(templateTimeoutRef.current);
      }
    };
  }, []);

  // Network status awareness
  useEffect(() => {
    // Initialize with current status (only in browser)
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch company and contract data for display
  const { data: company } = useCompany(companyId);
  const { data: contractsData } = useCompanyContracts(companyId);
  const contract = contractsData?.contracts.find((c) => c.id === contractId);

  // Use the mutation hook
  const createServiceMutation = useCreateContractService(companyId, contractId);

  // Transform service bundles to select options with grouping
  const templateOptions = useMemo(() => {
    const categoryLabels: Record<string, string> = {
      CORPORATE_SECRETARY: 'Corporate Secretarial',
      TAX: 'Tax & GST',
      ACCOUNTING: 'Accounting',
      AUDIT: 'Audit',
      COMPLIANCE: 'Charity & IPC',
    };

    // Group by category
    const grouped: Record<string, typeof ALL_SERVICE_BUNDLES> = {};
    ALL_SERVICE_BUNDLES.forEach((bundle) => {
      const cat = bundle.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(bundle);
    });

    // Convert to flat options with group headers
    const options: { value: string; label: string; group?: string }[] = [];
    Object.entries(grouped).forEach(([category, bundles]) => {
      bundles.forEach((bundle) => {
        options.push({
          value: bundle.code,
          label: bundle.name,
          group: categoryLabels[category] || category,
        });
      });
    });

    return options;
  }, []);

  // Get selected bundle details
  const selectedBundle = useMemo(() => {
    if (!selectedTemplate) return null;
    return ALL_SERVICE_BUNDLES.find((b) => b.code === selectedTemplate) || null;
  }, [selectedTemplate]);

  // Prepare company data for deadline builder
  const companyData: CompanyData = useMemo(() => {
    if (!company) {
      return {
        fyeMonth: null,
        fyeDay: null,
        incorporationDate: null,
        isGstRegistered: false,
        gstFilingFrequency: null,
        entityType: 'PRIVATE_LIMITED' as const,
      };
    }
    return {
      fyeMonth: company.financialYearEndMonth,
      fyeDay: company.financialYearEndDay,
      incorporationDate: company.incorporationDate
        ? (typeof company.incorporationDate === 'string'
          ? company.incorporationDate.split('T')[0]
          : company.incorporationDate.toISOString().split('T')[0])
        : null,
      isGstRegistered: company.isGstRegistered,
      gstFilingFrequency: company.gstFilingFrequency,
      entityType: company.entityType,
    };
  }, [company]);

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
    mode: 'onBlur', // Validate on blur instead of only on submit
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

  // Brief delay for visual feedback when applying template
  const TEMPLATE_APPLY_DELAY_MS = 150;

  // Handle template selection
  const handleTemplateSelect = useCallback((templateCode: string | null) => {
    // Clear any pending template application
    if (templateTimeoutRef.current) {
      clearTimeout(templateTimeoutRef.current);
      templateTimeoutRef.current = null;
    }

    if (!templateCode) {
      // Clear template-related values but keep user-entered data
      setSelectedTemplate(null);
      setDeadlineRules([]);
      setIsApplyingTemplate(false);
      return;
    }

    const bundle = ALL_SERVICE_BUNDLES.find((b) => b.code === templateCode);
    if (!bundle) return;

    // Set loading state for visual feedback
    setIsApplyingTemplate(true);
    setSelectedTemplate(templateCode);

    // Add slight delay for visual feedback before template applies
    templateTimeoutRef.current = setTimeout(() => {
      // Pre-fill form with template data
      setValue('name', bundle.name);
      setValue('scope', bundle.description);

      // Set service type and frequency based on bundle
      const defaults = getBundleDefaults(bundle);
      setValue('serviceType', defaults.serviceType);
      setValue('frequency', defaults.frequency);

      // Default to auto-renewal for recurring services
      setValue('autoRenewal', defaults.serviceType === 'RECURRING');
      setValue('renewalPeriodMonths', '12');

      // Convert template codes to deadline rules
      const rules = convertTemplatesToRuleInputs(bundle.deadlineTemplateCodes);
      setDeadlineRules(rules);

      // Clear loading state
      setIsApplyingTemplate(false);
      templateTimeoutRef.current = null;
    }, TEMPLATE_APPLY_DELAY_MS);
  }, [setValue]);

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
    // Clear template selection when copying from existing
    setSelectedTemplate(null);

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

  // Keyboard shortcuts for common actions
  useKeyboardShortcuts([
    {
      key: 's',
      ctrl: true,
      handler: () => {
        handleSubmit(onSubmit)();
      },
      description: 'Save service',
    },
    {
      key: 'Escape',
      handler: () => {
        router.push(`/companies/${companyId}?tab=contracts`);
      },
      description: 'Cancel and go back',
    },
  ], !isSubmitting);

  // Watch fields for conditional rendering and preview
  const serviceType = watch('serviceType');
  const autoRenewal = watch('autoRenewal');
  const startDate = watch('startDate');

  // Note: Zod transforms string rate/renewalPeriodMonths to numbers
  // so data here has the transformed (output) types
  const onSubmit = useCallback(async (data: unknown) => {
    setSubmitError(null);
    const validatedData = data as CreateServiceInput;

    try {
      const result = await createServiceMutation.mutateAsync({
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
        // Always use deadline rules (converted from template or custom)
        deadlineRules: deadlineRules.length > 0 ? deadlineRules : null,
        serviceTemplateCode: selectedTemplate,
      });

      // Show success message with deadline count if applicable
      if (result.deadlinesGenerated && result.deadlinesGenerated > 0) {
        toastSuccess(`Service created with ${result.deadlinesGenerated} deadlines generated`);
      }

      router.push(`/companies/${companyId}?tab=contracts`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create service');
    }
  }, [createServiceMutation, deadlineRules, selectedTemplate, toastSuccess, router, companyId]);

  // Retry handler for failed submissions
  const handleRetry = useCallback(() => {
    setSubmitError(null);
    // Trigger form submission programmatically
    handleSubmit(onSubmit)();
  }, [handleSubmit, onSubmit]);

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

      {/* Offline Warning */}
      {!isOnline && (
        <div className="px-4 sm:px-6 pt-4">
          <Alert variant="warning">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 flex-shrink-0" />
              <span>You appear to be offline. Changes will be saved when connection is restored.</span>
            </div>
          </Alert>
        </div>
      )}

      {/* Submit Error with Retry */}
      {submitError && (
        <div className="px-4 sm:px-6 pt-4">
          <Alert variant="error">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Failed to create service</p>
                <p className="text-sm mt-1 opacity-90">{submitError}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleRetry}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                disabled={isSubmitting}
              >
                Retry
              </Button>
            </div>
          </Alert>
        </div>
      )}

      {/* Screen reader announcement for form errors */}
      <div role="alert" aria-live="polite" className="sr-only">
        {Object.keys(errors).length > 0 && (
          <span>
            Form has {Object.keys(errors).length} error{Object.keys(errors).length !== 1 ? 's' : ''}. Please review and correct the highlighted fields.
          </span>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} aria-label="Add new service form" className="flex-1 flex flex-col p-4 sm:p-6 pt-4 overflow-auto">
        <div className="max-w-5xl mx-auto w-full space-y-4">
          {/* Quick Start: Service Template */}
          <div className="card overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-oak-primary/5 to-oak-primary/10 border-b border-border-primary">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-oak-primary/10">
                  <Sparkles className="w-5 h-5 text-oak-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="font-medium text-text-primary">Quick Start with Template</h2>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Select a template to auto-fill service details and generate compliance deadlines
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4">
              <SearchableSelect
                placeholder="Search templates or start from scratch..."
                options={templateOptions}
                value={selectedTemplate || ''}
                onChange={handleTemplateSelect}
                size="sm"
                clearable
                groupBy="group"
              />
              {selectedTemplate && (
                <div
                  className={cn(
                    "mt-3 p-3 rounded-lg border transition-all duration-200",
                    isApplyingTemplate
                      ? "bg-oak-primary/10 border-oak-primary/30 animate-pulse"
                      : "bg-oak-primary/5 border-oak-primary/20"
                  )}
                >
                  <div className="flex items-center gap-2 text-xs text-oak-primary">
                    {isApplyingTemplate ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Applying template...</span>
                      </>
                    ) : (
                      <>
                        <Info className="w-3.5 h-3.5" />
                        <span>Template selected: Fields have been pre-filled. You can customize them below.</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Form Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Service Information */}
              <CardSection
                title="Service Information"
                icon={<FileText className="w-4 h-4" />}
                id="service-info"
              >
                <div className="space-y-4">
                  <FormInput
                    label="Service Name *"
                    placeholder="e.g., Monthly Bookkeeping"
                    error={errors.name?.message}
                    inputSize="sm"
                    {...register('name')}
                  />

                  <div className="grid grid-cols-2 gap-3">
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
              </CardSection>

              {/* Billing Details */}
              <CardSection
                title="Billing Details"
                icon={<DollarSign className="w-4 h-4" />}
                id="billing-details"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
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
                            { value: 'SGD', label: 'SGD - Singapore Dollar' },
                            { value: 'USD', label: 'USD - US Dollar' },
                            { value: 'EUR', label: 'EUR - Euro' },
                            { value: 'GBP', label: 'GBP - British Pound' },
                            { value: 'MYR', label: 'MYR - Malaysian Ringgit' },
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
                  )}
                </div>
              </CardSection>

              {/* Schedule */}
              <CardSection
                title="Schedule"
                icon={<CalendarDays className="w-4 h-4" />}
                id="schedule"
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
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
                          hint={serviceType === 'RECURRING' ? 'Optional for ongoing' : undefined}
                        />
                      )}
                    />
                  </div>

                  {serviceType === 'RECURRING' && (
                    <div className="pt-2 border-t border-border-primary">
                      <div className="flex items-center justify-between gap-4">
                        <Controller
                          name="autoRenewal"
                          control={control}
                          render={({ field }) => (
                            <Toggle
                              label="Auto-renewal"
                              checked={field.value || false}
                              onChange={field.onChange}
                              size="sm"
                            />
                          )}
                        />

                        {autoRenewal && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-text-muted">Every</span>
                            <FormInput
                              type="number"
                              min="1"
                              max="120"
                              placeholder="12"
                              error={errors.renewalPeriodMonths?.message}
                              inputSize="sm"
                              className="w-16"
                              {...register('renewalPeriodMonths')}
                            />
                            <span className="text-xs text-text-muted">months</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardSection>
            </div>

            {/* Right Column: Scope of Work */}
            <div className="lg:row-span-2">
              <div className="card h-full flex flex-col overflow-hidden">
                <div className="p-4 flex items-center justify-between gap-3 bg-background-secondary/30 border-b border-border-primary">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-md bg-oak-primary/10 text-oak-primary">
                      <FileText className="w-4 h-4" />
                    </div>
                    <h2 className="font-medium text-text-primary text-sm">Scope of Work</h2>
                  </div>
                  <span className="text-xs text-text-muted">Optional</span>
                </div>
                <div className="p-4 flex-1 flex flex-col min-h-[300px]">
                  <Controller
                    name="scope"
                    control={control}
                    render={({ field }) => (
                      <div className="flex-1">
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
              </div>
            </div>
          </div>

          {/* Deadline Configuration - Full Width */}
          <CardSection
            title="Deadline Configuration"
            icon={<ListChecks className="w-4 h-4" />}
            badge={deadlineRules.length > 0 ? `${deadlineRules.length} rule${deadlineRules.length !== 1 ? 's' : ''}` : undefined}
            defaultOpen={deadlineRules.length > 0}
            id="deadline-config"
          >
            <DeadlineBuilderTable
              companyId={companyId}
              companyData={companyData}
              initialRules={deadlineRules}
              onChange={setDeadlineRules}
              previewEnabled={true}
              serviceStartDate={startDate}
            />
          </CardSection>

          {/* Actions - Sticky Footer */}
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 bg-background-primary/95 backdrop-blur-sm border-t border-border-primary">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-xs text-text-muted">
                {isDirty && <span className="text-amber-600">• Unsaved changes</span>}
                <span className="hidden sm:inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-background-secondary rounded text-[10px] font-mono">Ctrl+S</kbd>
                  <span>Save</span>
                </span>
                <span className="hidden sm:inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-background-secondary rounded text-[10px] font-mono">Esc</kbd>
                  <span>Cancel</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
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
            </div>
          </div>
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
