'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, AlertCircle, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateCompanySchema, type UpdateCompanyInput } from '@/lib/validations/company';
import { useCompany, useUpdateCompany } from '@/hooks/use-companies';

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

export default function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: company, isLoading, error } = useCompany(id);
  const updateCompany = useUpdateCompany();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateCompanyInput>({
    resolver: zodResolver(updateCompanySchema),
    defaultValues: {
      id,
    },
  });

  useEffect(() => {
    if (company) {
      reset({
        id: company.id,
        uen: company.uen,
        name: company.name,
        entityType: company.entityType,
        status: company.status,
        incorporationDate: company.incorporationDate
          ? new Date(company.incorporationDate).toISOString().split('T')[0]
          : undefined,
        primarySsicCode: company.primarySsicCode || undefined,
        primarySsicDescription: company.primarySsicDescription || undefined,
        secondarySsicCode: company.secondarySsicCode || undefined,
        secondarySsicDescription: company.secondarySsicDescription || undefined,
        financialYearEndDay: company.financialYearEndDay || undefined,
        financialYearEndMonth: company.financialYearEndMonth || undefined,
        paidUpCapitalAmount: company.paidUpCapitalAmount
          ? parseFloat(company.paidUpCapitalAmount.toString())
          : undefined,
        issuedCapitalAmount: company.issuedCapitalAmount
          ? parseFloat(company.issuedCapitalAmount.toString())
          : undefined,
        isGstRegistered: company.isGstRegistered,
        gstRegistrationNumber: company.gstRegistrationNumber || undefined,
        internalNotes: company.internalNotes || undefined,
      });
    }
  }, [company, reset]);

  const onSubmit = async (data: UpdateCompanyInput) => {
    setSubmitError(null);
    try {
      await updateCompany.mutateAsync({ id, data });
      router.push(`/companies/${id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to update company');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-oak-primary animate-spin" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-8 text-center">
          <AlertCircle className="w-12 h-12 text-status-error mx-auto mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">Company not found</h2>
          <p className="text-sm text-text-secondary mb-4">
            {error instanceof Error ? error.message : 'The company you are looking for does not exist.'}
          </p>
          <Link href="/companies" className="btn-primary btn-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Companies
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
          href={`/companies/${id}`}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Company
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Edit Company</h1>
        <p className="text-sm text-text-secondary mt-1">
          Update company information for {company.name}
        </p>
      </div>

      {/* Error */}
      {submitError && (
        <div className="card p-4 border-status-error bg-status-error/5 mb-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm">{submitError}</p>
          </div>
        </div>
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
                <label className="label">UEN</label>
                <input
                  type="text"
                  {...register('uen')}
                  className={`input input-sm uppercase ${errors.uen ? 'input-error' : ''}`}
                />
                {errors.uen && (
                  <p className="text-xs text-status-error mt-1.5">{errors.uen.message}</p>
                )}
              </div>

              <div>
                <label className="label">Company Name</label>
                <input
                  type="text"
                  {...register('name')}
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
              <label className="label">Incorporation Date</label>
              <input
                type="date"
                {...register('incorporationDate')}
                className="input input-sm"
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
                  className="input input-sm"
                />
              </div>
              <div className="md:col-span-3">
                <label className="label">Primary Activity Description</label>
                <input
                  type="text"
                  {...register('primarySsicDescription')}
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
                  className="input input-sm"
                />
              </div>
              <div className="md:col-span-3">
                <label className="label">Secondary Activity Description</label>
                <input
                  type="text"
                  {...register('secondarySsicDescription')}
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

            <div>
              <label className="label">GST Registration Number</label>
              <input
                type="text"
                {...register('gstRegistrationNumber')}
                className="input input-sm"
              />
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
              className="input input-sm resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-sm text-text-tertiary order-2 sm:order-1">
            {isDirty ? 'You have unsaved changes' : 'No changes made'}
          </p>
          <div className="flex items-center gap-3 order-1 sm:order-2 w-full sm:w-auto">
            <Link href={`/companies/${id}`} className="btn-secondary btn-sm flex-1 sm:flex-none justify-center">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || !isDirty}
              className="btn-primary btn-sm flex items-center gap-2 flex-1 sm:flex-none justify-center"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
