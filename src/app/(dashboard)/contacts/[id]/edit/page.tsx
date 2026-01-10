'use client';

import { use, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, AlertCircle, Loader2, ShieldAlert, Info } from 'lucide-react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateContactSchema, type UpdateContactInput } from '@/lib/validations/contact';
import { useContact, useUpdateContact } from '@/hooks/use-contacts';
import { useContactDetails, useCreateContactLevelDetail, useUpdateContactLevelDetail } from '@/hooks/use-contact-details';
import { usePermissions } from '@/hooks/use-permissions';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes';
import { useToast } from '@/components/ui/toast';
import { AUTOMATION_PURPOSES } from '@/lib/constants/automation-purposes';

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

export default function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: contact, isLoading: contactLoading, error: contactError } = useContact(id, false);
  const { data: contactDetails, isLoading: detailsLoading } = useContactDetails(id);
  const updateContact = useUpdateContact();
  const createDetail = useCreateContactLevelDetail(id);
  const updateDetail = useUpdateContactLevelDetail(id);
  const { can, isLoading: permissionsLoading } = usePermissions();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailPurposes, setEmailPurposes] = useState<string[]>([]);
  const toast = useToast();

  // Find existing email detail to get its purposes
  const existingEmailDetail = useMemo(() => {
    if (!contactDetails || !contact?.email) return null;
    return contactDetails.find(
      (d) => d.detailType === 'EMAIL' && d.value === contact.email
    );
  }, [contactDetails, contact?.email]);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateContactInput>({
    resolver: zodResolver(updateContactSchema),
    defaultValues: {
      id,
    },
  });

  // Populate form when contact data loads
  useEffect(() => {
    if (contact) {
      reset({
        id: contact.id,
        contactType: contact.contactType,
        firstName: contact.firstName || undefined,
        lastName: contact.lastName || undefined,
        identificationType: contact.identificationType || undefined,
        identificationNumber: contact.identificationNumber || undefined,
        nationality: contact.nationality || undefined,
        dateOfBirth: contact.dateOfBirth
          ? new Date(contact.dateOfBirth).toISOString()
          : undefined,
        corporateName: contact.corporateName || undefined,
        corporateUen: contact.corporateUen || undefined,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        fullAddress: contact.fullAddress || undefined,
      });
    }
  }, [contact, reset]);

  // Initialize email purposes from existing detail
  useEffect(() => {
    if (existingEmailDetail) {
      setEmailPurposes(existingEmailDetail.purposes || []);
    }
  }, [existingEmailDetail]);

  // Warn about unsaved changes when leaving the page
  useUnsavedChangesWarning(isDirty, !isSubmitting);

  const contactType = watch('contactType');

  // Get the appropriate ID types based on contact type
  const availableIdTypes = contactType === 'CORPORATE' ? corporateIdTypes : individualIdTypes;

  // Handle validation errors - show toast for root/refine errors
  const onInvalid = (formErrors: FieldErrors<UpdateContactInput>) => {
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

  // Loading state
  if (contactLoading || permissionsLoading || detailsLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-oak-primary animate-spin" />
      </div>
    );
  }

  // Error state
  if (contactError || !contact) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-8 text-center">
          <AlertCircle className="w-12 h-12 text-status-error mx-auto mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">Contact not found</h2>
          <p className="text-sm text-text-secondary mb-4">
            {contactError instanceof Error ? contactError.message : 'The contact you are looking for does not exist.'}
          </p>
          <Link href="/contacts" className="btn-primary btn-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Contacts
          </Link>
        </div>
      </div>
    );
  }

  // Permission check
  if (!can.updateContact) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-status-warning mx-auto mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">Access Denied</h2>
          <p className="text-sm text-text-secondary mb-4">
            You do not have permission to edit contacts.
          </p>
          <Link href={`/contacts/${id}`} className="btn-primary btn-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Contact
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (data: UpdateContactInput) => {
    setSubmitError(null);

    try {
      await updateContact.mutateAsync({ id, data });

      // Handle email purposes if email is provided
      if (data.email && emailPurposes.length > 0) {
        // Find if there's an existing email ContactDetail that matches
        const existingDetail = contactDetails?.find(
          (d) => d.detailType === 'EMAIL' && d.value === data.email
        );

        if (existingDetail) {
          // Update existing detail with new purposes
          await updateDetail.mutateAsync({
            detailId: existingDetail.id,
            data: { purposes: emailPurposes },
          });
        } else {
          // Create new detail with purposes
          await createDetail.mutateAsync({
            detailType: 'EMAIL',
            value: data.email,
            purposes: emailPurposes,
            isPrimary: true,
          });
        }
      }

      router.push(`/contacts/${id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to update contact');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/contacts/${id}`}
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Contact
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Edit Contact</h1>
        <p className="text-sm text-text-secondary mt-1">
          Update the details for {contact.fullName}
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
                    <label className="label">First Name</label>
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
                    <label className="label">Last Name</label>
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
                  <div>
                    <label className="label">Date of Birth</label>
                    <input
                      type="date"
                      {...register('dateOfBirth')}
                      className="input input-sm"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="label">Corporate Name</label>
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

            {/* Email Automation Purposes */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="label mb-0">Email Automation Purposes</label>
                <div className="group relative">
                  <Info className="w-3.5 h-3.5 text-text-muted cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    Select which automated emails should be sent to this address
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {AUTOMATION_PURPOSES.map((purpose) => {
                  const isSelected = emailPurposes.includes(purpose.value);
                  return (
                    <button
                      key={purpose.value}
                      type="button"
                      onClick={() => {
                        setEmailPurposes((prev) =>
                          isSelected
                            ? prev.filter((p) => p !== purpose.value)
                            : [...prev, purpose.value]
                        );
                      }}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        isSelected
                          ? 'bg-oak-light/10 border-oak-light text-oak-light'
                          : 'bg-surface-secondary border-border-primary text-text-secondary hover:border-border-secondary'
                      }`}
                      title={purpose.description}
                    >
                      {purpose.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-text-muted mt-2">
                These tags determine which automated communications this email address will receive.
              </p>
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="font-medium text-text-primary">Address</h2>
          </div>
          <div className="p-4">
            <div>
              <label className="label">Full Address</label>
              <input
                type="text"
                {...register('fullAddress')}
                placeholder="123 Main Street, #01-02, Singapore 123456"
                className="input input-sm"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href={`/contacts/${id}`} className="btn-secondary btn-sm">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="btn-primary btn-sm flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
