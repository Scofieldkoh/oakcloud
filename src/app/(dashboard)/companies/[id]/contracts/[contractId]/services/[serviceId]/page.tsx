'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Checkbox } from '@/components/ui/checkbox';
import { useCompany } from '@/hooks/use-companies';
import { useCompanyContracts } from '@/hooks/use-contracts';
import { useUpdateContractService } from '@/hooks/use-contract-services';
import {
  SERVICE_TYPES,
  SERVICE_STATUSES,
  BILLING_FREQUENCIES,
} from '@/lib/constants/contracts';
import type { ServiceType, ServiceStatus, BillingFrequency } from '@/generated/prisma';

interface PageProps {
  params: Promise<{ id: string; contractId: string; serviceId: string }>;
}

export default function EditServicePage({ params }: PageProps) {
  const { id: companyId, contractId, serviceId } = use(params);
  const router = useRouter();

  // Fetch company and contract data for display
  const { data: company } = useCompany(companyId);
  const { data: contractsData, isLoading: isLoadingContract } = useCompanyContracts(companyId);
  const contract = contractsData?.contracts.find((c) => c.id === contractId);
  const service = contract?.services.find((s) => s.id === serviceId);

  // Use the mutation hook
  const updateServiceMutation = useUpdateContractService(companyId, contractId, serviceId);

  const [formData, setFormData] = useState<{
    name: string;
    serviceType: ServiceType;
    status: ServiceStatus;
    rate: string;
    currency: string;
    frequency: BillingFrequency;
    startDate: string;
    endDate: string;
    scope: string;
    autoRenewal: boolean;
    renewalPeriodMonths: string;
  }>({
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
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form when service data loads
  useEffect(() => {
    if (service) {
      setFormData({
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
  }, [service]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Service name is required';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    }

    if (formData.rate && isNaN(parseFloat(formData.rate))) {
      newErrors.rate = 'Rate must be a valid number';
    }

    if (
      formData.renewalPeriodMonths &&
      isNaN(parseInt(formData.renewalPeriodMonths))
    ) {
      newErrors.renewalPeriodMonths = 'Must be a valid number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      await updateServiceMutation.mutateAsync({
        name: formData.name.trim(),
        serviceType: formData.serviceType,
        status: formData.status,
        rate: formData.rate ? parseFloat(formData.rate) : null,
        currency: formData.currency,
        frequency: formData.frequency,
        startDate: formData.startDate,
        endDate: formData.endDate || null,
        scope: formData.scope.trim() || null,
        autoRenewal: formData.autoRenewal,
        renewalPeriodMonths: formData.renewalPeriodMonths
          ? parseInt(formData.renewalPeriodMonths)
          : null,
      });
      router.push(`/companies/${companyId}?tab=contracts`);
    } catch {
      // Error handled by mutation hook
    }
  };

  const handleCancel = () => {
    router.push(`/companies/${companyId}?tab=contracts`);
  };

  if (isLoadingContract) {
    return (
      <div className="min-h-screen bg-background-secondary flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-screen bg-background-secondary flex items-center justify-center">
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
    <div className="min-h-screen bg-background-secondary">
      {/* Header */}
      <div className="bg-background-primary border-b border-border-primary">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href={`/companies/${companyId}?tab=contracts`}
              className="p-2 -ml-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-background-secondary transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-text-primary">
                Edit Service
              </h1>
              <p className="text-sm text-text-secondary mt-0.5">
                {company?.name} &bull; {contract?.title || 'Contract'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Scope of Work */}
            <div className="card p-6">
              <h2 className="text-sm font-medium text-text-primary mb-4">
                Scope of Work
              </h2>
              <RichTextEditor
                value={formData.scope}
                onChange={(value) =>
                  setFormData((prev) => ({ ...prev, scope: value }))
                }
                placeholder="Describe the scope of work for this service..."
                minHeight={400}
              />
              <p className="text-xs text-text-muted mt-2">
                Optional. Detailed description of what this service includes.
              </p>
            </div>

            {/* Right Column - Service Details */}
            <div className="space-y-6">
              <div className="card p-6">
                <h2 className="text-sm font-medium text-text-primary mb-4">
                  Service Details
                </h2>

                <div className="space-y-4">
                  {/* Service Name */}
                  <FormInput
                    label="Service Name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="e.g., Monthly Bookkeeping"
                    error={errors.name}
                    required
                  />

                  {/* Type & Status */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-text-secondary">
                        Service Type
                      </label>
                      <select
                        value={formData.serviceType}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            serviceType: e.target.value as ServiceType,
                          }))
                        }
                        className="input input-sm w-full"
                      >
                        {SERVICE_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-text-secondary">
                        Status
                      </label>
                      <select
                        value={formData.status}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            status: e.target.value as ServiceStatus,
                          }))
                        }
                        className="input input-sm w-full"
                      >
                        {SERVICE_STATUSES.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Rate & Currency & Frequency */}
                  <div className="grid grid-cols-3 gap-4">
                    <FormInput
                      label="Rate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.rate}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, rate: e.target.value }))
                      }
                      placeholder="0.00"
                      error={errors.rate}
                    />

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-text-secondary">
                        Currency
                      </label>
                      <select
                        value={formData.currency}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, currency: e.target.value }))
                        }
                        className="input input-sm w-full"
                      >
                        <option value="SGD">SGD</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="MYR">MYR</option>
                      </select>
                    </div>

                    {formData.serviceType === 'RECURRING' && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-text-secondary">
                          Frequency
                        </label>
                        <select
                          value={formData.frequency}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              frequency: e.target.value as BillingFrequency,
                            }))
                          }
                          className="input input-sm w-full"
                        >
                          {BILLING_FREQUENCIES.filter((f) => f.value !== 'ONE_TIME').map(
                            (freq) => (
                              <option key={freq.value} value={freq.value}>
                                {freq.label}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <SingleDateInput
                      label="Start Date"
                      value={formData.startDate}
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, startDate: value }))
                      }
                      error={errors.startDate}
                      required
                    />

                    <SingleDateInput
                      label="End Date"
                      value={formData.endDate}
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, endDate: value }))
                      }
                      hint={
                        formData.serviceType === 'RECURRING'
                          ? 'Leave empty for ongoing services'
                          : undefined
                      }
                    />
                  </div>

                  {/* Auto Renewal (for recurring services) */}
                  {formData.serviceType === 'RECURRING' && (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="auto-renewal"
                          checked={formData.autoRenewal}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              autoRenewal: e.target.checked,
                            }))
                          }
                          size="sm"
                        />
                        <label
                          htmlFor="auto-renewal"
                          className="text-sm text-text-primary cursor-pointer"
                        >
                          Auto-renews
                        </label>
                      </div>

                      {formData.autoRenewal && (
                        <>
                          <FormInput
                            label=""
                            type="number"
                            min="1"
                            max="120"
                            value={formData.renewalPeriodMonths}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                renewalPeriodMonths: e.target.value,
                              }))
                            }
                            placeholder="12"
                            error={errors.renewalPeriodMonths}
                            className="w-20"
                          />
                          <span className="text-sm text-text-muted">months</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancel}
                  disabled={updateServiceMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={updateServiceMutation.isPending}>
                  {updateServiceMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Update Service
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
