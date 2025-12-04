'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCompanySchema, type CreateCompanyInput } from '@/lib/validations/company';
import { useCreateCompany } from '@/hooks/use-companies';
import { usePermissions } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-auth';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes';
import { DateInput } from '@/components/ui/date-input';
import { TenantSelector, useActiveTenantId } from '@/components/ui/tenant-selector';

const entityTypes = [
  { value: 'PRIVATE_LIMITED', label: 'Private Limited Company' },
  { value: 'PUBLIC_LIMITED', label: 'Public Limited Company' },
  { value: 'SOLE_PROPRIETORSHIP', label: 'Sole Proprietorship' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'LIMITED_PARTNERSHIP', label: 'Limited Partnership' },
  { value: 'LIMITED_LIABILITY_PARTNERSHIP', label: 'Limited Liability Partnership' },
  { value: 'FOREIGN_COMPANY', label: 'Foreign Company' },
  { value: 'VARIABLE_CAPITAL_COMPANY', label: 'Variable Capital Company' },
  { value: 'OTHER', label: 'Other' },
];

const statuses = [
  { value: 'LIVE', label: 'Live' },
  { value: 'STRUCK_OFF', label: 'Struck Off' },
  { value: 'WINDING_UP', label: 'Winding Up' },
  { value: 'DISSOLVED', label: 'Dissolved' },
  { value: 'IN_LIQUIDATION', label: 'In Liquidation' },
  { value: 'IN_RECEIVERSHIP', label: 'In Receivership' },
  { value: 'AMALGAMATED', label: 'Amalgamated' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'OTHER', label: 'Other' },
];

const months = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export default function NewCompanyPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const createCompany = useCreateCompany();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // SUPER_ADMIN tenant selection
  const isSuperAdmin = session?.isSuperAdmin ?? false;
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const activeTenantId = useActiveTenantId(isSuperAdmin, selectedTenantId, session?.tenantId);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CreateCompanyInput>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: {
      entityType: 'PRIVATE_LIMITED',
      status: 'LIVE',
      paidUpCapitalCurrency: 'SGD',
      issuedCapitalCurrency: 'SGD',
      isGstRegistered: false,
    },
  });

  // Warn about unsaved changes when leaving the page
  useUnsavedChangesWarning(isDirty, !isSubmitting);

  // Check permission to create
  if (permissionsLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-oak-primary animate-spin" />
      </div>
    );
  }

  if (!can.createCompany) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-status-warning mx-auto mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">Access Denied</h2>
          <p className="text-sm text-text-secondary mb-4">
            You do not have permission to create companies.
          </p>
          <Link href="/companies" className="btn-primary btn-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Companies
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (data: CreateCompanyInput) => {
    setSubmitError(null);

    // SUPER_ADMIN must select a tenant
    if (isSuperAdmin && !activeTenantId) {
      setSubmitError('Please select a tenant before creating a company');
      return;
    }

    try {
      const company = await createCompany.mutateAsync({
        ...data,
        // Include tenantId for SUPER_ADMIN
        ...(isSuperAdmin && activeTenantId ? { tenantId: activeTenantId } : {}),
      });
      router.push(`/companies/${company.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create company');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/companies"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Companies
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Add New Company</h1>
        <p className="text-sm text-text-secondary mt-1">
          Enter company details manually or upload a BizFile for automatic extraction.
        </p>
      </div>

      {/* Error */}
      {submitError && (
        <div className="card p-4 border-status-error bg-status-error/5 mb-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{submitError}</p>
          </div>
        </div>
      )}

      {/* Tenant Selector for SUPER_ADMIN */}
      {isSuperAdmin && (
        <TenantSelector
          value={selectedTenantId}
          onChange={setSelectedTenantId}
          helpText="As a Super Admin, please select a tenant to create the company under."
        />
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Basic Information</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">UEN *</label>
                <input
                  type="text"
                  {...register('uen')}
                  placeholder="e.g., 202012345A"
                  className={`input input-sm uppercase ${errors.uen ? 'input-error' : ''}`}
                />
                {errors.uen && (
                  <p className="text-xs text-status-error mt-1.5">{errors.uen.message}</p>
                )}
              </div>

              <div>
                <label className="label">Company Name *</label>
                <input
                  type="text"
                  {...register('name')}
                  placeholder="Company Name Pte Ltd"
                  className={`input input-sm ${errors.name ? 'input-error' : ''}`}
                />
                {errors.name && (
                  <p className="text-xs text-status-error mt-1.5">{errors.name.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Entity Type</label>
                <select {...register('entityType')} className="input input-sm">
                  {entityTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Status</label>
                <select {...register('status')} className="input input-sm">
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Controller
                name="incorporationDate"
                control={control}
                render={({ field }) => (
                  <DateInput
                    label="Incorporation Date"
                    value={field.value || ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* Business Activity */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Business Activity</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="label">Primary SSIC Code</label>
                <input
                  type="text"
                  {...register('primarySsicCode')}
                  placeholder="e.g., 62011"
                  className="input input-sm"
                />
              </div>
              <div className="md:col-span-3">
                <label className="label">Primary Activity Description</label>
                <input
                  type="text"
                  {...register('primarySsicDescription')}
                  placeholder="Description of primary business activity"
                  className="input input-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="label">Secondary SSIC Code</label>
                <input
                  type="text"
                  {...register('secondarySsicCode')}
                  placeholder="e.g., 62090"
                  className="input input-sm"
                />
              </div>
              <div className="md:col-span-3">
                <label className="label">Secondary Activity Description</label>
                <input
                  type="text"
                  {...register('secondarySsicDescription')}
                  placeholder="Description of secondary business activity"
                  className="input input-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Financial Information */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Financial Information</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Financial Year End Day</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  {...register('financialYearEndDay', { valueAsNumber: true })}
                  placeholder="31"
                  className="input input-sm"
                />
              </div>
              <div>
                <label className="label">Financial Year End Month</label>
                <select {...register('financialYearEndMonth', { valueAsNumber: true })} className="input input-sm">
                  <option value="">Select month</option>
                  {months.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Paid Up Capital (SGD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('paidUpCapitalAmount', { valueAsNumber: true })}
                  placeholder="0.00"
                  className="input input-sm"
                />
              </div>
              <div>
                <label className="label">Issued Capital (SGD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('issuedCapitalAmount', { valueAsNumber: true })}
                  placeholder="0.00"
                  className="input input-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isGstRegistered"
                {...register('isGstRegistered')}
                className="w-4 h-4 rounded-md border-border-primary bg-background-secondary text-oak-primary focus:ring-oak-primary"
              />
              <label htmlFor="isGstRegistered" className="text-sm text-text-primary">
                GST Registered
              </label>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Internal Notes</h2>
          </div>
          <div className="p-4">
            <textarea
              {...register('internalNotes')}
              rows={4}
              placeholder="Add any internal notes about this company..."
              className="input input-sm resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/companies" className="btn-secondary btn-sm">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary btn-sm flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Creating...' : 'Create Company'}
          </button>
        </div>
      </form>
    </div>
  );
}
