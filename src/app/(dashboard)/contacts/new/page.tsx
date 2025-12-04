'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import { useForm, Controller, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createContactSchema, type CreateContactInput } from '@/lib/validations/contact';
import { useCreateContact } from '@/hooks/use-contacts';
import { usePermissions } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-auth';
import { DateInput } from '@/components/ui/date-input';
import { TenantSelector, useActiveTenantId } from '@/components/ui/tenant-selector';
import { useToast } from '@/components/ui/toast';

const contactTypes = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'CORPORATE', label: 'Corporate' },
];

// Separate ID types for Individual and Corporate contacts
const individualIdTypes = [
  { value: 'NRIC', label: 'NRIC' },
  { value: 'FIN', label: 'FIN' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'OTHER', label: 'Other' },
];

const corporateIdTypes = [
  { value: 'UEN', label: 'UEN' },
  { value: 'OTHER', label: 'Other' },
];

export default function NewContactPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const createContact = useCreateContact();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const toast = useToast();

  // SUPER_ADMIN tenant selection
  const isSuperAdmin = session?.isSuperAdmin ?? false;
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const activeTenantId = useActiveTenantId(isSuperAdmin, selectedTenantId, session?.tenantId);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateContactInput>({
    resolver: zodResolver(createContactSchema),
    defaultValues: {
      contactType: 'INDIVIDUAL',
      country: 'SINGAPORE',
    },
  });

  const contactType = watch('contactType');

  // Get the appropriate ID types based on contact type
  const availableIdTypes = contactType === 'CORPORATE' ? corporateIdTypes : individualIdTypes;

  // Handle validation errors - show toast for root/refine errors
  const onInvalid = (formErrors: FieldErrors<CreateContactInput>) => {
    // Check for root-level errors (from .refine())
    if (formErrors.root?.message) {
      toast.error(formErrors.root.message);
      return;
    }
    // Show first field error if any
    const firstError = Object.values(formErrors).find(err => err?.message);
    if (firstError?.message) {
      toast.error(firstError.message);
    }
  };

  // Check permission to create
  if (permissionsLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-oak-primary animate-spin" />
      </div>
    );
  }

  if (!can.createContact) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-status-warning mx-auto mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">Access Denied</h2>
          <p className="text-sm text-text-secondary mb-4">
            You do not have permission to create contacts.
          </p>
          <Link href="/contacts" className="btn-primary btn-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Contacts
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (data: CreateContactInput) => {
    setSubmitError(null);

    // SUPER_ADMIN must select a tenant
    if (isSuperAdmin && !activeTenantId) {
      setSubmitError('Please select a tenant before creating a contact');
      return;
    }

    try {
      const contact = await createContact.mutateAsync({
        ...data,
        ...(isSuperAdmin && activeTenantId ? { tenantId: activeTenantId } : {}),
      });
      router.push(`/contacts/${contact.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create contact');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/contacts"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Contacts
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Add New Contact</h1>
        <p className="text-sm text-text-secondary mt-1">
          Create a new individual or corporate contact.
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
          helpText="As a Super Admin, please select a tenant to create the contact under."
        />
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6">
        {/* Contact Type */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Contact Type</h2>
          </div>
          <div className="p-4">
            <div className="flex gap-4">
              {contactTypes.map((type) => (
                <label
                  key={type.value}
                  className={`flex-1 p-4 rounded-lg border cursor-pointer transition-colors ${
                    contactType === type.value
                      ? 'border-oak-primary bg-oak-primary/5'
                      : 'border-border-primary hover:border-border-secondary'
                  }`}
                >
                  <input
                    type="radio"
                    {...register('contactType')}
                    value={type.value}
                    className="sr-only"
                  />
                  <p className="font-medium text-text-primary">{type.label}</p>
                  <p className="text-xs text-text-secondary mt-1">
                    {type.value === 'INDIVIDUAL'
                      ? 'A person (director, shareholder, etc.)'
                      : 'A company or organization'}
                  </p>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Personal/Corporate Information */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">
              {contactType === 'INDIVIDUAL' ? 'Personal Information' : 'Corporate Information'}
            </h2>
          </div>
          <div className="p-4 space-y-4">
            {contactType === 'INDIVIDUAL' ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">First Name *</label>
                    <input
                      type="text"
                      {...register('firstName')}
                      placeholder="John"
                      className={`input input-sm ${errors.firstName ? 'input-error' : ''}`}
                    />
                    {errors.firstName && (
                      <p className="text-xs text-status-error mt-1.5">{errors.firstName.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="label">Last Name *</label>
                    <input
                      type="text"
                      {...register('lastName')}
                      placeholder="Doe"
                      className={`input input-sm ${errors.lastName ? 'input-error' : ''}`}
                    />
                    {errors.lastName && (
                      <p className="text-xs text-status-error mt-1.5">{errors.lastName.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Nationality</label>
                    <input
                      type="text"
                      {...register('nationality')}
                      placeholder="SINGAPOREAN"
                      className="input input-sm"
                    />
                  </div>
                  <Controller
                    name="dateOfBirth"
                    control={control}
                    render={({ field }) => (
                      <DateInput
                        label="Date of Birth"
                        value={field.value || ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    )}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label">Corporate Name *</label>
                  <input
                    type="text"
                    {...register('corporateName')}
                    placeholder="ABC Holdings Pte Ltd"
                    className={`input input-sm ${errors.corporateName ? 'input-error' : ''}`}
                  />
                  {errors.corporateName && (
                    <p className="text-xs text-status-error mt-1.5">{errors.corporateName.message}</p>
                  )}
                </div>
                <div>
                  <label className="label">Corporate UEN</label>
                  <input
                    type="text"
                    {...register('corporateUen')}
                    placeholder="202012345A"
                    className="input input-sm uppercase"
                  />
                </div>
              </>
            )}

            {/* Identification */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">
                  {contactType === 'INDIVIDUAL' ? 'ID Type' : 'Registration Type'}
                </label>
                <select {...register('identificationType')} className="input input-sm">
                  <option value="">Select type</option>
                  {availableIdTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">
                  {contactType === 'INDIVIDUAL' ? 'ID Number' : 'Registration Number'}
                </label>
                <input
                  type="text"
                  {...register('identificationNumber')}
                  placeholder={contactType === 'INDIVIDUAL' ? 'S1234567A' : 'Registration number'}
                  className="input input-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Contact Details */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Contact Details</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  {...register('email')}
                  placeholder="john@example.com"
                  className={`input input-sm ${errors.email ? 'input-error' : ''}`}
                />
                {errors.email && (
                  <p className="text-xs text-status-error mt-1.5">{errors.email.message}</p>
                )}
              </div>
              <div>
                <label className="label">Phone</label>
                <input
                  type="tel"
                  {...register('phone')}
                  placeholder="+65 9123 4567"
                  className="input input-sm"
                />
              </div>
            </div>
            <div>
              <label className="label">Alternate Phone</label>
              <input
                type="tel"
                {...register('alternatePhone')}
                placeholder="+65 6123 4567"
                className="input input-sm"
              />
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Address</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="label">Address Line 1</label>
              <input
                type="text"
                {...register('addressLine1')}
                placeholder="123 Main Street"
                className="input input-sm"
              />
            </div>
            <div>
              <label className="label">Address Line 2</label>
              <input
                type="text"
                {...register('addressLine2')}
                placeholder="Unit 01-02"
                className="input input-sm"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Postal Code</label>
                <input
                  type="text"
                  {...register('postalCode')}
                  placeholder="123456"
                  className="input input-sm"
                />
              </div>
              <div>
                <label className="label">City</label>
                <input
                  type="text"
                  {...register('city')}
                  placeholder="Singapore"
                  className="input input-sm"
                />
              </div>
              <div>
                <label className="label">Country</label>
                <input
                  type="text"
                  {...register('country')}
                  placeholder="SINGAPORE"
                  className="input input-sm"
                />
              </div>
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
              placeholder="Add any internal notes about this contact..."
              className="input input-sm resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/contacts" className="btn-secondary btn-sm">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary btn-sm flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Creating...' : 'Create Contact'}
          </button>
        </div>
      </form>
    </div>
  );
}
