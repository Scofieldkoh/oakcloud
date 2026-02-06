'use client';

import { use, useState, useMemo, useCallback, useEffect, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Copy,
  FileText,
  ListChecks,
  Info,
  WifiOff,
  RefreshCw,
  Eraser,
  Loader2,
  BookmarkPlus,
  Pencil,
  Trash2,
  Building2,
} from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { FormInput } from '@/components/ui/form-input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { CardSection } from '@/components/ui/card-section';
import { CopyServiceModal } from '@/components/companies/contracts/copy-service-modal';
import { useCompany } from '@/hooks/use-companies';
import { useCompanyService, useUpdateCompanyService } from '@/hooks/use-contract-services';
import { useSession } from '@/hooks/use-auth';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { createServiceSchema, type CreateServiceInput, type DeadlineRuleInput } from '@/lib/validations/service';
import { useCreateServiceTemplate, useDeleteServiceTemplate, useServiceTemplates, useUpdateServiceTemplate, type ServiceTemplateRecord } from '@/hooks/use-service-templates';
import {
  SERVICE_TYPES,
  BILLING_FREQUENCIES,
} from '@/lib/constants/contracts';
import { getEntityTypeLabel } from '@/lib/constants';
import {
  ALL_SERVICE_BUNDLES,
  type ServiceTemplateBundle,
} from '@/lib/constants/deadline-templates';
import { DeadlineBuilderTable, UpcomingDeadlinesSection, type CompanyData } from '@/components/services/deadline-builder';
import { convertTemplatesToRuleInputs } from '@/lib/utils/deadline-template-converter';
import type { DeadlineCategory } from '@/generated/prisma';

interface PageProps {
  params: Promise<{ id: string; serviceId: string }>;
}

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

type TemplateSource = 'BUILT_IN' | 'CUSTOM';

interface TemplateCatalogItem {
  code: string;
  name: string;
  category: DeadlineCategory;
  description: string;
  serviceType: ServiceFormValues['serviceType'];
  status?: ServiceFormValues['status'] | null;
  rate?: number | null;
  currency?: string | null;
  frequency: ServiceFormValues['frequency'];
  autoRenewal: boolean;
  renewalPeriodMonths: number | null;
  startDate?: string | null;
  endDate?: string | null;
  scope?: string | null;
  deadlineRules: DeadlineRuleInput[];
  source: TemplateSource;
  isSystemOverridden: boolean;
  customTemplate?: ServiceTemplateRecord;
}

interface TemplateDraftForm {
  name: string;
  category: DeadlineCategory;
  description: string;
}

const TEMPLATE_CATEGORY_LABELS: Record<DeadlineCategory, string> = {
  CORPORATE_SECRETARY: 'Corporate Secretarial',
  TAX: 'Tax & GST',
  ACCOUNTING: 'Accounting',
  AUDIT: 'Audit',
  COMPLIANCE: 'Charity & IPC',
  OTHER: 'Other',
};

const TEMPLATE_CATEGORY_OPTIONS: Array<{ value: DeadlineCategory; label: string }> = Object.entries(TEMPLATE_CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as DeadlineCategory, label })
);

function getTemplateDescriptionPreview(description: string | null | undefined, maxWords = 100): string {
  if (!description) return '';
  const cleaned = description
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const words = cleaned.split(' ');
  if (words.length <= maxWords) return cleaned;
  return `${words.slice(0, maxWords).join(' ')}...`;
}

function buildBlankServiceFormValues(): ServiceFormValues {
  return {
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
  };
}

function getBundleDefaults(bundle: ServiceTemplateBundle): {
  serviceType: 'RECURRING' | 'ONE_TIME';
  frequency: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUALLY' | 'ANNUALLY' | 'ONE_TIME';
} {
  if (bundle.code.includes('MONTHLY')) {
    return { serviceType: 'RECURRING', frequency: 'MONTHLY' };
  }
  if (bundle.code.includes('QUARTERLY')) {
    return { serviceType: 'RECURRING', frequency: 'QUARTERLY' };
  }
  return { serviceType: 'RECURRING', frequency: 'ANNUALLY' };
}

export default function EditServicePage({ params }: PageProps) {
  const { id: companyId, serviceId } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const canManageTemplates = session?.isSuperAdmin || session?.isTenantAdmin || false;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [pendingTemplateCode, setPendingTemplateCode] = useState<string | null>(null);
  const [showTemplateOverwriteConfirm, setShowTemplateOverwriteConfirm] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateEditorMode, setTemplateEditorMode] = useState<'create' | 'update'>('create');
  const [templateDraft, setTemplateDraft] = useState<TemplateDraftForm>({
    name: '',
    category: 'OTHER',
    description: '',
  });
  const [showDeleteTemplateConfirm, setShowDeleteTemplateConfirm] = useState(false);
  const [deadlineRules, setDeadlineRules] = useState<DeadlineRuleInput[]>([]);
  const [selectedRuleIndex, setSelectedRuleIndex] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const currentYear = new Date().getFullYear();
  const [fyeYearInput, setFyeYearInput] = useState<string>(String(currentYear));
  const fyeYear = useMemo(() => {
    const parsed = Number.parseInt(fyeYearInput, 10);
    return Number.isNaN(parsed) ? currentYear : parsed;
  }, [currentYear, fyeYearInput]);

  const { data: company } = useCompany(companyId);
  const { data: service, isLoading: isLoadingService } = useCompanyService(companyId, serviceId);
  const updateServiceMutation = useUpdateCompanyService(companyId, serviceId);
  const createTemplateMutation = useCreateServiceTemplate();
  const updateTemplateMutation = useUpdateServiceTemplate();
  const deleteTemplateMutation = useDeleteServiceTemplate();
  const { data: customTemplates = [] } = useServiceTemplates({
    enabled: canManageTemplates,
  });

  useEffect(() => {
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

  const templateCatalog = useMemo<TemplateCatalogItem[]>(() => {
    const systemOverridesByCode = new Map(
      customTemplates
        .filter((template) => template.isSystemOverride)
        .map((template) => [template.code, template] as const)
    );

    const builtInTemplates: TemplateCatalogItem[] = ALL_SERVICE_BUNDLES.map((bundle) => {
      const defaults = getBundleDefaults(bundle);
      const override = systemOverridesByCode.get(bundle.code);
      return {
        code: bundle.code,
        name: override?.name ?? bundle.name,
        category: override?.category ?? bundle.category,
        description: override ? (override.description || '') : bundle.description,
        serviceType: override?.serviceType ?? defaults.serviceType,
        status: override?.status,
        rate: override?.rate,
        currency: override?.currency,
        frequency: override?.frequency ?? defaults.frequency,
        autoRenewal: override?.autoRenewal ?? (defaults.serviceType === 'RECURRING'),
        renewalPeriodMonths: override?.renewalPeriodMonths ?? (defaults.serviceType === 'RECURRING' ? 12 : null),
        startDate: override?.startDate,
        endDate: override?.endDate,
        scope: override?.scope,
        deadlineRules: override
          ? (override.deadlineRules || [])
          : convertTemplatesToRuleInputs(bundle.deadlineTemplateCodes),
        source: 'BUILT_IN',
        isSystemOverridden: Boolean(override),
      };
    });

    const customTemplateItems: TemplateCatalogItem[] = customTemplates
      .filter((template) => !template.isSystemOverride)
      .map((template) => ({
        code: template.code,
        name: template.name,
        category: template.category,
        description: template.description || '',
        serviceType: template.serviceType,
        status: template.status,
        rate: template.rate,
        currency: template.currency,
        frequency: template.frequency,
        autoRenewal: template.autoRenewal,
        renewalPeriodMonths: template.renewalPeriodMonths,
        startDate: template.startDate,
        endDate: template.endDate,
        scope: template.scope,
        deadlineRules: template.deadlineRules || [],
        source: 'CUSTOM',
        isSystemOverridden: false,
        customTemplate: template,
      }));

    return [...builtInTemplates, ...customTemplateItems];
  }, [customTemplates]);

  const templateByCode = useMemo(
    () => new Map(templateCatalog.map((template) => [template.code, template])),
    [templateCatalog]
  );

  const templateOptions = useMemo(() => {
    return templateCatalog.map((template) => ({
      value: template.code,
      label: template.name,
      description: getTemplateDescriptionPreview(template.description, 100),
      group: template.source === 'CUSTOM'
        ? 'Custom Templates'
        : TEMPLATE_CATEGORY_LABELS[template.category] || template.category,
    }));
  }, [templateCatalog]);

  const selectedTemplateItem = useMemo(
    () => (selectedTemplate ? templateByCode.get(selectedTemplate) || null : null),
    [selectedTemplate, templateByCode]
  );

  const selectedCustomTemplate = useMemo(
    () => (selectedTemplateItem?.source === 'CUSTOM' ? selectedTemplateItem.customTemplate || null : null),
    [selectedTemplateItem]
  );

  const fyeLabel = useMemo(() => {
    if (!company?.financialYearEndMonth || !company?.financialYearEndDay) {
      return 'Not set';
    }
    return new Date(
      2000,
      company.financialYearEndMonth - 1,
      company.financialYearEndDay
    ).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [company?.financialYearEndDay, company?.financialYearEndMonth]);

  const handleFyeYearChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (!/^\d*$/.test(raw)) return;
    setFyeYearInput(raw);
  }, []);

  const handleFyeYearBlur = useCallback(() => {
    if (!fyeYearInput) {
      setFyeYearInput(String(currentYear));
      return;
    }
    const parsed = Number.parseInt(fyeYearInput, 10);
    if (Number.isNaN(parsed)) {
      setFyeYearInput(String(currentYear));
      return;
    }
    const clamped = Math.min(2100, Math.max(1900, parsed));
    setFyeYearInput(String(clamped));
  }, [currentYear, fyeYearInput]);

  const companyData: CompanyData = useMemo(() => {
    if (!company) {
      return {
        fyeMonth: null,
        fyeDay: null,
        fyeYear,
        incorporationDate: null,
        isGstRegistered: false,
        gstFilingFrequency: null,
        entityType: 'PRIVATE_LIMITED' as const,
      };
    }

    const incDate = company.incorporationDate as unknown as Date | string | null;
    let incorporationDateStr: string | null = null;
    if (incDate) {
      if (typeof incDate === 'string') {
        incorporationDateStr = incDate.split('T')[0];
      } else if (incDate instanceof Date) {
        incorporationDateStr = incDate.toISOString().split('T')[0];
      }
    }

    return {
      fyeMonth: company.financialYearEndMonth,
      fyeDay: company.financialYearEndDay,
      fyeYear,
      incorporationDate: incorporationDateStr,
      isGstRegistered: company.isGstRegistered,
      gstFilingFrequency: company.gstFilingFrequency,
      entityType: company.entityType,
    };
  }, [company, fyeYear]);

  const selectedRuleName = useMemo(() => {
    if (selectedRuleIndex == null) return null;
    const name = deadlineRules[selectedRuleIndex]?.taskName?.trim();
    return name || null;
  }, [deadlineRules, selectedRuleIndex]);

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    reset,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ServiceFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createServiceSchema) as any,
    mode: 'onBlur',
    defaultValues: buildBlankServiceFormValues(),
  });

  useEffect(() => {
    if (!service) return;

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

    setDeadlineRules(service.deadlineRules || []);
    setSelectedTemplate(service.serviceTemplateCode || null);
    setFyeYearInput(String(service.fyeYearOverride ?? currentYear));
  }, [currentYear, reset, service]);

  const applyTemplate = useCallback((templateCode: string) => {
    const template = templateByCode.get(templateCode);
    if (!template) return;

    setSelectedTemplate(templateCode);
    setValue('name', template.name);
    setValue('serviceType', template.serviceType);
    setValue('frequency', template.frequency);
    setValue('autoRenewal', template.autoRenewal);
    setValue(
      'renewalPeriodMonths',
      template.renewalPeriodMonths != null ? String(template.renewalPeriodMonths) : ''
    );

    const shouldApplyFullTemplate = template.source === 'CUSTOM' || template.isSystemOverridden;
    if (shouldApplyFullTemplate) {
      if (template.status !== undefined) {
        setValue('status', template.status ?? 'ACTIVE');
      }
      if (template.rate !== undefined) {
        setValue('rate', template.rate != null ? String(template.rate) : '');
      }
      if (template.currency !== undefined) {
        setValue('currency', template.currency ?? 'SGD');
      }
      if (template.startDate !== undefined) {
        setValue('startDate', template.startDate ?? '');
      }
      if (template.endDate !== undefined) {
        setValue('endDate', template.endDate ?? '');
      }
      if (template.scope !== undefined) {
        setValue('scope', template.scope ?? '');
      }
    }

    setDeadlineRules(template.deadlineRules.map((rule, index) => ({
      ...rule,
      displayOrder: index,
    })));
  }, [setValue, templateByCode]);

  const handleTemplateSelect = useCallback((templateCode: string) => {
    if (!templateCode) {
      setSelectedTemplate(null);
      return;
    }

    const hasDraftContent =
      !!getValues('name')?.trim() ||
      !!getValues('scope')?.trim() ||
      deadlineRules.length > 0;

    if (hasDraftContent && templateCode !== selectedTemplate) {
      setPendingTemplateCode(templateCode);
      setShowTemplateOverwriteConfirm(true);
      return;
    }

    applyTemplate(templateCode);
  }, [applyTemplate, deadlineRules.length, getValues, selectedTemplate]);

  const handleStartBlank = useCallback(() => {
    reset(buildBlankServiceFormValues());
    setSelectedTemplate(null);
    setPendingTemplateCode(null);
    setDeadlineRules([]);
    setSubmitError(null);
  }, [reset]);

  const buildTemplatePayload = useCallback((draft: TemplateDraftForm) => {
    const values = getValues();
    const serviceType = values.serviceType;
    const frequency = serviceType === 'ONE_TIME'
      ? 'ONE_TIME'
      : values.frequency;
    const autoRenewal = serviceType === 'ONE_TIME'
      ? false
      : values.autoRenewal;
    const renewalPeriodMonths = serviceType === 'ONE_TIME' || !autoRenewal
      ? null
      : Number.parseInt(values.renewalPeriodMonths || '12', 10) || 12;
    const rateValue = values.rate?.trim();
    const parsedRate = rateValue ? Number.parseFloat(rateValue) : null;
    const rate = parsedRate !== null && Number.isNaN(parsedRate) ? null : parsedRate;

    return {
      name: draft.name.trim(),
      category: draft.category,
      description: draft.description.trim() || null,
      serviceType,
      status: values.status,
      rate,
      currency: values.currency,
      frequency,
      autoRenewal,
      renewalPeriodMonths,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      scope: values.scope || null,
      deadlineRules: deadlineRules.map((rule, index) => ({
        ...rule,
        displayOrder: index,
      })),
    };
  }, [deadlineRules, getValues]);

  const openCreateTemplateEditor = useCallback(() => {
    const values = getValues();
    setTemplateEditorMode('create');
    setTemplateDraft({
      name: values.name?.trim() || 'New Service Template',
      category: selectedTemplateItem?.category || 'OTHER',
      description: '',
    });
    setShowTemplateEditor(true);
  }, [getValues, selectedTemplateItem?.category]);

  const openUpdateTemplateEditor = useCallback(() => {
    if (!selectedTemplateItem) return;
    setTemplateEditorMode('update');
    if (selectedTemplateItem.source === 'CUSTOM' && selectedCustomTemplate) {
      setTemplateDraft({
        name: selectedCustomTemplate.name,
        category: selectedCustomTemplate.category,
        description: selectedCustomTemplate.description || '',
      });
    } else {
      setTemplateDraft({
        name: selectedTemplateItem.name,
        category: selectedTemplateItem.category,
        description: selectedTemplateItem.description || '',
      });
    }
    setShowTemplateEditor(true);
  }, [selectedCustomTemplate, selectedTemplateItem]);

  const handleSaveTemplate = useCallback(async () => {
    const templateName = templateDraft.name.trim();
    if (!templateName) return;

    const payload = buildTemplatePayload({
      ...templateDraft,
      name: templateName,
    });
    try {
      if (templateEditorMode === 'create') {
        const created = await createTemplateMutation.mutateAsync(payload);
        setSelectedTemplate(created.code);
      } else if (selectedTemplateItem?.source === 'CUSTOM' && selectedCustomTemplate) {
        const updated = await updateTemplateMutation.mutateAsync({
          code: selectedCustomTemplate.code,
          payload,
        });
        setSelectedTemplate(updated.code);
      } else if (selectedTemplateItem?.source === 'BUILT_IN') {
        const overridden = await updateTemplateMutation.mutateAsync({
          code: selectedTemplateItem.code,
          payload,
          systemOverride: true,
        });
        setSelectedTemplate(overridden.code);
      }

      setShowTemplateEditor(false);
    } catch {
      // Toast is handled in mutation hooks.
    }
  }, [
    buildTemplatePayload,
    createTemplateMutation,
    selectedTemplateItem,
    selectedCustomTemplate,
    templateDraft,
    templateEditorMode,
    updateTemplateMutation,
  ]);

  const handleDeleteTemplate = useCallback(async () => {
    if (!selectedCustomTemplate) return;
    try {
      await deleteTemplateMutation.mutateAsync(selectedCustomTemplate.code);
      setShowDeleteTemplateConfirm(false);
      setSelectedTemplate(null);
    } catch {
      // Toast is handled in mutation hooks.
    }
  }, [deleteTemplateMutation, selectedCustomTemplate]);

  const handleCopyService = (copiedService: {
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
    setSelectedTemplate(null);
    setPendingTemplateCode(null);
    setDeadlineRules([]);

    setValue('name', copiedService.name);
    setValue('serviceType', copiedService.serviceType as 'RECURRING' | 'ONE_TIME');
    setValue('status', copiedService.status as 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'PENDING');
    setValue('rate', copiedService.rate.toString());
    setValue('currency', copiedService.currency);
    setValue('frequency', copiedService.frequency as ServiceFormValues['frequency']);
    setValue('scope', copiedService.scope || '');
    setValue('autoRenewal', copiedService.autoRenewal);
    setValue('renewalPeriodMonths', copiedService.renewalPeriodMonths?.toString() || '');
  };

  useUnsavedChangesWarning(isDirty, !isSubmitting);

  const serviceType = watch('serviceType');
  const startDate = watch('startDate');
  const frequencyOptions = useMemo(
    () => (serviceType === 'ONE_TIME'
      ? BILLING_FREQUENCIES.filter((f) => f.value === 'ONE_TIME')
      : BILLING_FREQUENCIES.filter((f) => f.value !== 'ONE_TIME')),
    [serviceType]
  );

  useEffect(() => {
    if (serviceType === 'ONE_TIME') {
      setValue('frequency', 'ONE_TIME');
    } else if (serviceType === 'RECURRING') {
      const currentFrequency = getValues('frequency');
      if (currentFrequency === 'ONE_TIME') {
        setValue('frequency', 'ANNUALLY');
      }
    }
  }, [getValues, serviceType, setValue]);

  const onSubmit = useCallback(async (data: unknown) => {
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
        serviceTemplateCode: selectedTemplate,
        deadlineRules,
        regenerateDeadlines: true,
        fyeYearOverride: company?.financialYearEndMonth && company?.financialYearEndDay ? fyeYear : null,
      });

      router.push(`/companies/${companyId}?tab=services&refresh=1`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to update service');
    }
  }, [
    companyId,
    deadlineRules,
    router,
    selectedTemplate,
    updateServiceMutation,
    company?.financialYearEndMonth,
    company?.financialYearEndDay,
    fyeYear,
  ]);

  const handleRetry = useCallback(() => {
    setSubmitError(null);
    handleSubmit(onSubmit)();
  }, [handleSubmit, onSubmit]);

  const handleCancel = useCallback(() => {
    router.push(`/companies/${companyId}?tab=services`);
  }, [companyId, router]);

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
      key: 'Backspace',
      ctrl: true,
      handler: handleCancel,
      description: 'Cancel and go back',
    },
  ], !isSubmitting);

  if (isLoadingService) {
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
            href={`/companies/${companyId}?tab=services`}
            className="text-oak-light hover:text-oak-dark"
          >
            Return to company
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 sm:p-6 pb-0">
        <div className="max-w-screen-2xl">
          <Link
            href={`/companies/${companyId}?tab=services`}
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Services
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Edit Service</h1>
          </div>
        </div>
      </div>

      {!isOnline && (
        <div className="px-4 sm:px-6 pt-4">
          <div className="max-w-screen-2xl">
            <Alert variant="warning">
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 flex-shrink-0" />
                <span>You appear to be offline. Changes will be saved when connection is restored.</span>
              </div>
            </Alert>
          </div>
        </div>
      )}

      {submitError && (
        <div className="px-4 sm:px-6 pt-4">
          <div className="max-w-screen-2xl">
            <Alert variant="error">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Failed to update service</p>
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
        </div>
      )}

      <div role="alert" aria-live="polite" className="sr-only">
        {Object.keys(errors).length > 0 && (
          <span>
            Form has {Object.keys(errors).length} error{Object.keys(errors).length !== 1 ? 's' : ''}. Please review and correct the highlighted fields.
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} aria-label="Edit service form" className="flex-1 flex flex-col px-4 sm:px-6 pb-4 sm:pb-6 pt-0 overflow-auto">
        <div className="w-full max-w-screen-2xl space-y-6">
          {/* Quick Start: Service Template */}
          <div className="card overflow-hidden">
            <div className="p-4">
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_auto] gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    placeholder="Choose a template when you want to prefill details and deadlines"
                    options={templateOptions}
                    value={selectedTemplate || ''}
                    onChange={handleTemplateSelect}
                    size="sm"
                    clearable
                    groupBy="group"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Copy className="w-4 h-4" />}
                    onClick={() => setShowCopyModal(true)}
                    type="button"
                  >
                    Copy from Existing
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Eraser className="w-4 h-4" />}
                    onClick={handleStartBlank}
                    type="button"
                  >
                    Start Blank
                  </Button>
                </div>
              </div>

              {!selectedTemplateItem && (
                <div className="mt-3 text-xs text-text-muted flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    Tip: pick a template when you want prebuilt deadlines, then adjust rules below.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Main Form Stack */}
          <div className="space-y-5">
            {/* Company Information */}
            <CardSection
              title="Company Information"
              icon={<Building2 className="w-4 h-4" />}
              id="company-info"
            >
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-5">
                  <FormInput
                    label="Company Name"
                    value={company?.name || ''}
                    inputSize="sm"
                    disabled
                  />
                </div>
                <div className="col-span-12 md:col-span-5">
                  <FormInput
                    label="Company Structure"
                    value={company ? getEntityTypeLabel(company.entityType, true) : ''}
                    inputSize="sm"
                    disabled
                  />
                </div>
                <div className="col-span-12 md:col-span-2">
                  <label className="text-xs font-medium text-text-secondary block mb-2">FYE</label>
                  <div className="grid grid-cols-[1fr_90px] gap-2">
                    <FormInput
                      value={fyeLabel}
                      inputSize="sm"
                      disabled
                    />
                    <FormInput
                      inputMode="numeric"
                      value={fyeYearInput}
                      onChange={handleFyeYearChange}
                      onBlur={handleFyeYearBlur}
                      inputSize="sm"
                      placeholder="Year"
                      disabled={!company?.financialYearEndMonth || !company?.financialYearEndDay}
                    />
                  </div>
                </div>
              </div>
            </CardSection>

            {/* Service Information */}
            <CardSection
              title="Service Information"
              icon={<FileText className="w-4 h-4" />}
              id="service-info"
            >
              <div className="space-y-4">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-6">
                    <FormInput
                      label="Service Name"
                      placeholder="e.g., Monthly Bookkeeping"
                      error={errors.name?.message}
                      inputSize="sm"
                      {...register('name')}
                    />
                  </div>
                  <div className="col-span-12 md:col-span-3">
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
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <Controller
                      name="frequency"
                      control={control}
                      render={({ field }) => (
                        <SearchableSelect
                          label="Frequency"
                          options={frequencyOptions}
                          value={field.value || ''}
                          onChange={field.onChange}
                          size="sm"
                          clearable={false}
                        />
                      )}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-3">
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
                  </div>
                  <div className="col-span-12 md:col-span-3">
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
                  <div className="col-span-12 md:col-span-3">
                    <Controller
                      name="startDate"
                      control={control}
                      render={({ field }) => (
                        <SingleDateInput
                          label="Service Start Date"
                          value={field.value}
                          onChange={field.onChange}
                          error={errors.startDate?.message}
                          required
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            </CardSection>

            {/* Scope of Work */}
            <CardSection
              title="Scope of Work"
              icon={<FileText className="w-4 h-4" />}
              id="scope-of-work"
            >
              <Controller
                name="scope"
                control={control}
                render={({ field }) => (
                  <RichTextEditor
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder="Describe the scope of work for this service..."
                    minHeight={320}
                    autoGrow
                  />
                )}
              />
            </CardSection>
          </div>

          {/* Deadline Configuration - Full Width */}
          <CardSection
            title="Deadline Configuration"
            icon={<ListChecks className="w-4 h-4" />}
            badge={deadlineRules.length > 0 ? `${deadlineRules.length} rule${deadlineRules.length !== 1 ? 's' : ''}` : undefined}
            defaultOpen
            id="deadline-config"
          >
            <DeadlineBuilderTable
              companyId={companyId}
              companyData={companyData}
              initialRules={deadlineRules}
              onChange={setDeadlineRules}
              serviceStartDate={startDate}
              selectedRuleIndex={selectedRuleIndex}
              onSelectRule={setSelectedRuleIndex}
            />
          </CardSection>

          <UpcomingDeadlinesSection
            companyId={companyId}
            companyData={companyData}
            rules={deadlineRules}
            serviceStartDate={startDate}
            highlightTaskName={selectedRuleName}
          />

          {/* Actions - Sticky Footer */}
          <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 sm:py-4 bg-background-primary/95 backdrop-blur-sm border-t border-border-primary shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
            <div className="max-w-screen-2xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-text-muted">
                  {isDirty && <span className="text-amber-600">Unsaved changes</span>}
                  <span className="hidden sm:inline-flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-background-secondary rounded text-[10px] font-mono">Ctrl+S</kbd>
                    <span>Save</span>
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-background-secondary rounded text-[10px] font-mono">Ctrl+Backspace</kbd>
                    <span>Cancel</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                  {canManageTemplates && (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        leftIcon={<BookmarkPlus className="w-4 h-4" />}
                        onClick={openCreateTemplateEditor}
                      >
                        Save as Template
                      </Button>
                      {selectedTemplateItem && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          leftIcon={<Pencil className="w-4 h-4" />}
                          onClick={openUpdateTemplateEditor}
                        >
                          {selectedTemplateItem.source === 'BUILT_IN'
                            ? selectedTemplateItem.isSystemOverridden
                              ? 'Update Template'
                              : 'Overwrite Template'
                            : 'Update Template'}
                        </Button>
                      )}
                      {selectedCustomTemplate && (
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          leftIcon={<Trash2 className="w-4 h-4" />}
                          onClick={() => setShowDeleteTemplateConfirm(true)}
                        >
                          Delete Template
                        </Button>
                      )}
                    </>
                  )}
                  <Link href={`/companies/${companyId}?tab=services`}>
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
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      <Modal
        isOpen={showTemplateEditor}
        onClose={() => setShowTemplateEditor(false)}
        title={
          templateEditorMode === 'create'
            ? 'Save Service Template'
            : selectedTemplateItem?.source === 'BUILT_IN'
              ? selectedTemplateItem?.isSystemOverridden
                ? 'Update Template'
                : 'Overwrite Template'
              : 'Update Service Template'
        }
        size="md"
      >
        <ModalBody className="space-y-5">
          <FormInput
            label="Template Name"
            value={templateDraft.name}
            onChange={(event) =>
              setTemplateDraft((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="e.g., Tax Compliance - Monthly"
            inputSize="sm"
          />

          <div>
            <label className="label">Category</label>
            <select
              value={templateDraft.category}
              onChange={(event) =>
                setTemplateDraft((prev) => ({
                  ...prev,
                  category: event.target.value as DeadlineCategory,
                }))
              }
              className="input input-sm"
            >
              {TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Template Description</label>
            <textarea
              value={templateDraft.description}
              onChange={(event) =>
                setTemplateDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={4}
              placeholder="Short summary shown in template selection"
              className="input px-3 py-2 h-auto min-h-[110px] resize-y"
            />
          </div>

          <p className="text-xs text-text-muted">
            Saves the full service details (scope, billing, schedule) and {deadlineRules.length} deadline rule{deadlineRules.length !== 1 ? 's' : ''}. The description is just the short summary text.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowTemplateEditor(false)}
            disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              void handleSaveTemplate();
            }}
            isLoading={createTemplateMutation.isPending || updateTemplateMutation.isPending}
            disabled={!templateDraft.name.trim()}
          >
            {templateEditorMode === 'create'
              ? 'Save Template'
              : selectedTemplateItem?.source === 'BUILT_IN'
                ? selectedTemplateItem?.isSystemOverridden
                  ? 'Update Template'
                  : 'Overwrite Template'
                : 'Update Template'}
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmDialog
        isOpen={showDeleteTemplateConfirm}
        onClose={() => setShowDeleteTemplateConfirm(false)}
        onConfirm={async () => {
          await handleDeleteTemplate();
        }}
        title="Delete Template"
        description={
          selectedCustomTemplate
            ? `Delete "${selectedCustomTemplate.name}"? This removes it from your custom template list.`
            : 'Delete this template?'
        }
        confirmLabel="Delete Template"
        variant="danger"
        isLoading={deleteTemplateMutation.isPending}
      />

      <ConfirmDialog
        isOpen={showTemplateOverwriteConfirm}
        onClose={() => {
          setShowTemplateOverwriteConfirm(false);
          setPendingTemplateCode(null);
        }}
        onConfirm={() => {
          if (pendingTemplateCode) {
            applyTemplate(pendingTemplateCode);
          }
          setShowTemplateOverwriteConfirm(false);
          setPendingTemplateCode(null);
        }}
        title="Apply New Template?"
        description="This will replace your current service details and deadline rules with the selected template."
        confirmLabel="Replace with Template"
        variant="warning"
      />

      <CopyServiceModal
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        onCopy={handleCopyService}
        currentCompanyId={companyId}
      />
    </div>
  );
}
