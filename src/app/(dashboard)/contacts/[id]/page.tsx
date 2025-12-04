'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  History,
  Pencil,
  Trash2,
  AlertCircle,
  Link2,
} from 'lucide-react';
import { useContact, useDeleteContact, useLinkContactToCompany, useUnlinkContactFromCompany } from '@/hooks/use-contacts';
import { useCompanies } from '@/hooks/use-companies';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { CompanyRelationships } from '@/components/contacts/company-relationships';
import type { ContactType, IdentificationType } from '@prisma/client';

const contactTypeConfig: Record<ContactType, { color: string; label: string }> = {
  INDIVIDUAL: { color: 'badge-info', label: 'Individual' },
  CORPORATE: { color: 'badge-neutral', label: 'Corporate' },
};

const idTypeLabels: Record<IdentificationType, string> = {
  NRIC: 'NRIC',
  FIN: 'FIN',
  PASSPORT: 'Passport',
  UEN: 'UEN',
  OTHER: 'Other',
};

const relationshipOptions = [
  'Director',
  'Shareholder',
  'Secretary',
  'Auditor',
  'Nominee',
  'Beneficial Owner',
  'Authorized Representative',
  'Other',
];

export default function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: contact, isLoading, error } = useContact(id);
  const deleteContact = useDeleteContact();
  const linkContact = useLinkContactToCompany();
  const unlinkContact = useUnlinkContactFromCompany();
  const { success, error: toastError } = useToast();
  const { can } = usePermissions();

  // Fetch companies for linking modal
  const { data: companiesData } = useCompanies({ limit: 100 });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState<{
    companyId: string;
    relationship: string;
  } | null>(null);
  const [linkForm, setLinkForm] = useState({
    companyId: '',
    relationship: '',
    isPrimary: false,
  });

  const handleDeleteConfirm = async (reason?: string) => {
    if (!reason) return;

    try {
      await deleteContact.mutateAsync({ id, reason });
      success('Contact deleted successfully');
      router.push('/contacts');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete contact');
    }
  };

  const handleLinkCompany = async () => {
    if (!linkForm.companyId || !linkForm.relationship) {
      toastError('Please select a company and relationship');
      return;
    }

    try {
      await linkContact.mutateAsync({
        contactId: id,
        companyId: linkForm.companyId,
        relationship: linkForm.relationship,
        isPrimary: linkForm.isPrimary,
      });
      success('Contact linked to company successfully');
      setLinkModalOpen(false);
      setLinkForm({ companyId: '', relationship: '', isPrimary: false });
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to link contact');
    }
  };

  const handleUnlinkCompany = async () => {
    if (!selectedLink) return;

    try {
      await unlinkContact.mutateAsync({
        contactId: id,
        companyId: selectedLink.companyId,
        relationship: selectedLink.relationship,
      });
      success('Contact unlinked from company successfully');
      setUnlinkDialogOpen(false);
      setSelectedLink(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to unlink contact');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 skeleton" />
          <div className="h-4 w-48 skeleton" />
          <div className="grid grid-cols-3 gap-6">
            <div className="h-32 skeleton rounded-lg" />
            <div className="h-32 skeleton rounded-lg" />
            <div className="h-32 skeleton rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="p-6">
        <div className="card p-8 text-center">
          <AlertCircle className="w-12 h-12 text-status-error mx-auto mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">Contact not found</h2>
          <p className="text-text-secondary mb-4">
            {error instanceof Error ? error.message : 'The contact you are looking for does not exist.'}
          </p>
          <Link href="/contacts" className="btn-primary btn-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Contacts
          </Link>
        </div>
      </div>
    );
  }

  const currentTypeConfig = contactTypeConfig[contact.contactType];

  // Filter out companies that are already linked with the same relationship
  const linkedCompanyIds = new Set(
    contact.companyRelations?.map((r) => `${r.company.id}-${r.relationship}`) || []
  );

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <Link
            href="/contacts"
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Contacts
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">
              {contact.fullName}
            </h1>
            <span className={`badge ${currentTypeConfig.color}`}>{currentTypeConfig.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2 text-sm text-text-secondary">
            {contact.identificationType && contact.identificationNumber && (
              <span>
                {idTypeLabels[contact.identificationType]}: {contact.identificationNumber}
              </span>
            )}
            {contact.corporateUen && <span>UEN: {contact.corporateUen}</span>}
            {contact.nationality && <span>{contact.nationality}</span>}
          </div>
        </div>
        {(can.updateContact || can.deleteContact) && (
          <div className="flex items-center gap-2 sm:gap-3">
            {can.updateContact && (
              <Link
                href={`/contacts/${id}/edit`}
                className="btn-secondary btn-sm flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </Link>
            )}
            {can.deleteContact && (
              <button
                onClick={() => setDeleteDialogOpen(true)}
                className="btn-danger btn-sm flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Information */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <User className="w-4 h-4 text-text-tertiary" />
                Contact Information
              </h2>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {contact.contactType === 'INDIVIDUAL' ? (
                <>
                  <div>
                    <p className="text-xs text-text-tertiary uppercase mb-1">First Name</p>
                    <p className="text-text-primary">{contact.firstName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary uppercase mb-1">Last Name</p>
                    <p className="text-text-primary">{contact.lastName || '-'}</p>
                  </div>
                  {contact.dateOfBirth && (
                    <div>
                      <p className="text-xs text-text-tertiary uppercase mb-1">Date of Birth</p>
                      <p className="text-text-primary">{formatDate(contact.dateOfBirth)}</p>
                    </div>
                  )}
                  {contact.nationality && (
                    <div>
                      <p className="text-xs text-text-tertiary uppercase mb-1">Nationality</p>
                      <p className="text-text-primary">{contact.nationality}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-text-tertiary uppercase mb-1">Corporate Name</p>
                    <p className="text-text-primary">{contact.corporateName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary uppercase mb-1">UEN</p>
                    <p className="text-text-primary">{contact.corporateUen || '-'}</p>
                  </div>
                </>
              )}
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">
                  {contact.contactType === 'INDIVIDUAL' ? 'ID Type' : 'Registration Type'}
                </p>
                <p className="text-text-primary">
                  {contact.identificationType
                    ? idTypeLabels[contact.identificationType]
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">ID Number</p>
                <p className="text-text-primary">{contact.identificationNumber || '-'}</p>
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <Mail className="w-4 h-4 text-text-tertiary" />
                Contact Details
              </h2>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Email</p>
                <p className="text-text-primary">
                  {contact.email ? (
                    <a href={`mailto:${contact.email}`} className="text-oak-light hover:underline">
                      {contact.email}
                    </a>
                  ) : (
                    '-'
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Phone</p>
                <p className="text-text-primary">
                  {contact.phone ? (
                    <a href={`tel:${contact.phone}`} className="text-oak-light hover:underline">
                      {contact.phone}
                    </a>
                  ) : (
                    '-'
                  )}
                </p>
              </div>
              {contact.alternatePhone && (
                <div>
                  <p className="text-xs text-text-tertiary uppercase mb-1">Alternate Phone</p>
                  <p className="text-text-primary">
                    <a
                      href={`tel:${contact.alternatePhone}`}
                      className="text-oak-light hover:underline"
                    >
                      {contact.alternatePhone}
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Address */}
          {(contact.addressLine1 || contact.city || contact.country) && (
            <div className="card">
              <div className="p-4 border-b border-border-primary">
                <h2 className="font-medium text-text-primary flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-text-tertiary" />
                  Address
                </h2>
              </div>
              <div className="p-4">
                <p className="text-text-primary">
                  {[
                    contact.addressLine1,
                    contact.addressLine2,
                    contact.postalCode,
                    contact.city,
                    contact.country,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
            </div>
          )}

          {/* Company Relationships (Unified View) */}
          <CompanyRelationships
            companyRelations={contact.companyRelations}
            officerPositions={contact.officerPositions}
            shareholdings={contact.shareholdings}
            canUpdate={can.updateContact}
            onLinkCompany={() => setLinkModalOpen(true)}
            onUnlinkCompany={(companyId, relationship) => {
              setSelectedLink({ companyId, relationship });
              setUnlinkDialogOpen(true);
            }}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary">Summary</h2>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Linked Companies</span>
                <span className="font-medium text-text-primary">
                  {contact.companyRelations?.length || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Officer Positions</span>
                <span className="font-medium text-text-primary">
                  {contact.officerPositions?.length || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Shareholdings</span>
                <span className="font-medium text-text-primary">
                  {contact.shareholdings?.length || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Internal Notes */}
          {contact.internalNotes && (
            <div className="card">
              <div className="p-4 border-b border-border-primary">
                <h2 className="font-medium text-text-primary">Internal Notes</h2>
              </div>
              <div className="p-4">
                <p className="text-sm text-text-secondary whitespace-pre-wrap">
                  {contact.internalNotes}
                </p>
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <Calendar className="w-4 h-4 text-text-tertiary" />
                Record Info
              </h2>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Created</p>
                <p className="text-sm text-text-primary">{formatDate(contact.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Last Updated</p>
                <p className="text-sm text-text-primary">{formatDate(contact.updatedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Status</p>
                <span className={`badge ${contact.isActive ? 'badge-success' : 'badge-neutral'}`}>
                  {contact.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          {/* Audit History */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <History className="w-4 h-4 text-text-tertiary" />
                Audit History
              </h2>
            </div>
            <div className="p-4">
              <Link
                href={`/contacts/${id}/audit`}
                className="btn-secondary btn-sm w-full justify-center"
              >
                View History
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Contact"
        description={`Are you sure you want to delete "${contact?.fullName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting this contact..."
        reasonMinLength={10}
        isLoading={deleteContact.isPending}
      />

      {/* Link Company Modal */}
      <Modal
        isOpen={linkModalOpen}
        onClose={() => {
          setLinkModalOpen(false);
          setLinkForm({ companyId: '', relationship: '', isPrimary: false });
        }}
        title="Link Contact to Company"
      >
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label className="label">Company</label>
              <select
                value={linkForm.companyId}
                onChange={(e) => setLinkForm((prev) => ({ ...prev, companyId: e.target.value }))}
                className="input input-sm w-full"
              >
                <option value="">Select a company</option>
                {companiesData?.companies?.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name} ({company.uen})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Relationship</label>
              <select
                value={linkForm.relationship}
                onChange={(e) => setLinkForm((prev) => ({ ...prev, relationship: e.target.value }))}
                className="input input-sm w-full"
              >
                <option value="">Select relationship</option>
                {relationshipOptions.map((rel) => (
                  <option key={rel} value={rel}>
                    {rel}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPrimary"
                checked={linkForm.isPrimary}
                onChange={(e) => setLinkForm((prev) => ({ ...prev, isPrimary: e.target.checked }))}
                className="rounded border-border-primary"
              />
              <label htmlFor="isPrimary" className="text-sm text-text-secondary">
                Set as primary contact for this company
              </label>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <button
            onClick={() => {
              setLinkModalOpen(false);
              setLinkForm({ companyId: '', relationship: '', isPrimary: false });
            }}
            className="btn-secondary btn-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleLinkCompany}
            disabled={linkContact.isPending}
            className="btn-primary btn-sm"
          >
            {linkContact.isPending ? 'Linking...' : 'Link Company'}
          </button>
        </ModalFooter>
      </Modal>

      {/* Unlink Confirmation Dialog */}
      <ConfirmDialog
        isOpen={unlinkDialogOpen}
        onClose={() => {
          setUnlinkDialogOpen(false);
          setSelectedLink(null);
        }}
        onConfirm={handleUnlinkCompany}
        title="Unlink Company"
        description="Are you sure you want to remove this company relationship? This can be re-added later."
        confirmLabel="Unlink"
        variant="danger"
        isLoading={unlinkContact.isPending}
      />
    </div>
  );
}
