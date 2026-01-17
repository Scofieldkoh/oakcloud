'use client';

import { useState } from 'react';
import { Plus, Building2, User, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import {
  useCompanyContactDetails,
  useCreateContactDetail,
  useUpdateContactDetail,
  useDeleteContactDetail,
  useToggleContactPoc,
  type ContactDetail,
  type ContactWithDetails,
  type CreateContactDetailInput,
} from '@/hooks/use-contact-details';
import { useLinkContactToCompany, useUnlinkContactFromCompany } from '@/hooks/use-contacts';
import type { ContactDetailType } from '@/generated/prisma';
import {
  AddContactDetailModal,
  LinkContactModal,
  ContactDetailRow,
  ContactRow,
} from '@/components/companies/contact-details';

interface ContactDetailsTabProps {
  companyId: string;
  companyName: string;
  canEdit: boolean;
}

export function ContactDetailsTab({ companyId, companyName, canEdit }: ContactDetailsTabProps) {
  const { success } = useToast();
  // Data is prefetched in background by usePrefetchCompanyContactDetails in parent
  const { data, isLoading, error } = useCompanyContactDetails(companyId);

  const createDetailMutation = useCreateContactDetail(companyId);
  const updateDetailMutation = useUpdateContactDetail(companyId);
  const deleteDetailMutation = useDeleteContactDetail(companyId);
  const togglePocMutation = useToggleContactPoc(companyId);
  const linkContactMutation = useLinkContactToCompany();
  const unlinkContactMutation = useUnlinkContactFromCompany();

  // State for add detail modal
  const [showAddDetailModal, setShowAddDetailModal] = useState(false);
  const [addDetailTarget, setAddDetailTarget] = useState<{
    type: 'company' | 'contact';
    id?: string;
    name: string;
    existingDetails?: ContactDetail[];
  }>({
    type: 'company',
    name: companyName,
  });

  // State for add contact modal
  const [showAddContactModal, setShowAddContactModal] = useState(false);

  // State for editing
  const [editingDetailId, setEditingDetailId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    detailType: ContactDetailType;
    value: string;
    label: string;
    purposes: string[];
    isPrimary: boolean;
    isPoc: boolean;
  }>({
    detailType: 'EMAIL',
    value: '',
    label: '',
    purposes: [],
    isPrimary: false,
    isPoc: false,
  });

  // State for delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; value: string } | null>(null);
  const [deletingDetailId, setDeletingDetailId] = useState<string | null>(null);

  // State for unlink confirmation
  const [unlinkConfirm, setUnlinkConfirm] = useState<{
    contactId: string;
    contactName: string;
    relationship: string;
  } | null>(null);

  // State for POC toggle loading
  const [togglingPocContactId, setTogglingPocContactId] = useState<string | null>(null);

  const handleAddDetail = async (input: CreateContactDetailInput & { isCompanySpecific?: boolean }) => {
    try {
      // If isCompanySpecific is true, the API should use the companyId
      // We pass this as a separate flag, the hook will handle it
      const { isCompanySpecific, ...data } = input;
      await createDetailMutation.mutateAsync({
        ...data,
        // For company-specific details, we tell the API to also set companyId
        ...(isCompanySpecific ? { isCompanySpecific: true } : {}),
      } as CreateContactDetailInput);
      success('Contact detail added');
      setShowAddDetailModal(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleUpdateDetailFromModal = async (detailId: string, data: { value: string; label?: string | null; purposes?: string[] }) => {
    try {
      await updateDetailMutation.mutateAsync({
        detailId,
        data: {
          value: data.value,
          label: data.label,
          purposes: data.purposes,
        },
      });
      success('Contact detail updated');
      setShowAddDetailModal(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteDetailFromModal = async (detailId: string) => {
    try {
      await deleteDetailMutation.mutateAsync(detailId);
      success('Contact detail deleted');
      // Don't close modal - let user continue editing other field
    } catch {
      // Error handled by mutation
    }
  };

  const handleUpdateDetail = async () => {
    if (!editingDetailId || !editForm.value.trim()) return;

    try {
      await updateDetailMutation.mutateAsync({
        detailId: editingDetailId,
        data: {
          detailType: editForm.detailType,
          value: editForm.value.trim(),
          label: editForm.label.trim() || null,
          purposes: editForm.purposes,
          isPrimary: editForm.isPrimary,
          isPoc: editForm.isPoc,
        },
      });
      success('Contact detail updated');
      setEditingDetailId(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteDetail = async () => {
    if (!deleteConfirm) return;

    try {
      setDeletingDetailId(deleteConfirm.id);
      await deleteDetailMutation.mutateAsync(deleteConfirm.id);
      success('Contact detail deleted');
      setDeleteConfirm(null);
    } catch {
      // Error handled by mutation
    } finally {
      setDeletingDetailId(null);
    }
  };

  const handleLinkContact = async (contactId: string, relationship: string) => {
    try {
      await linkContactMutation.mutateAsync({
        contactId,
        companyId,
        relationship,
      });
      success('Contact linked successfully');
      setShowAddContactModal(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleUnlinkContact = async () => {
    if (!unlinkConfirm) return;

    try {
      await unlinkContactMutation.mutateAsync({
        contactId: unlinkConfirm.contactId,
        companyId,
        relationship: unlinkConfirm.relationship,
      });
      success('Contact unlinked successfully');
      setUnlinkConfirm(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleTogglePoc = async (contactId: string, isPoc: boolean) => {
    try {
      setTogglingPocContactId(contactId);
      await togglePocMutation.mutateAsync({ contactId, isPoc });
      success(isPoc ? 'Set as Point of Contact' : 'Removed Point of Contact');
    } catch {
      // Error handled by mutation
    } finally {
      setTogglingPocContactId(null);
    }
  };

  const startEdit = (detail: ContactDetail) => {
    setEditingDetailId(detail.id);
    setEditForm({
      detailType: detail.detailType,
      value: detail.value,
      label: detail.label || '',
      purposes: detail.purposes || [],
      isPrimary: detail.isPrimary,
      isPoc: detail.isPoc,
    });
  };

  const cancelEdit = () => {
    setEditingDetailId(null);
    setEditForm({ detailType: 'EMAIL', value: '', label: '', purposes: [], isPrimary: false, isPoc: false });
  };

  const updateEditForm = (field: string, value: string | string[] | boolean) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const openAddDetailForCompany = () => {
    setAddDetailTarget({ type: 'company', name: companyName });
    setShowAddDetailModal(true);
  };

  const openAddDetailForContact = (item: ContactWithDetails) => {
    setAddDetailTarget({
      type: 'contact',
      id: item.contact.id,
      name: item.contact.fullName,
      existingDetails: item.details,
    });
    setShowAddDetailModal(true);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Loading state */}
        {isLoading && (
          <div className="py-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-oak-light" />
            <p className="text-sm text-text-secondary mt-2">Loading contact details...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="py-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-status-error/10 text-status-error rounded-lg">
              <X className="w-4 h-4" />
              <span className="text-sm">
                {error instanceof Error ? error.message : 'Failed to load contact details'}
              </span>
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Company-level Contact Details */}
            <div className="card">
              <div className="px-4 py-3 border-b border-border-primary">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-text-primary flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-text-tertiary" />
                      Company Contact Details
                    </h4>
                    <p className="text-xs text-text-secondary mt-1">
                      Contact information directly associated with the company
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {canEdit && (
                      <Button variant="secondary" size="xs" onClick={openAddDetailForCompany}>
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add Detail
                      </Button>
                    )}
                    <span className="text-xs text-text-muted bg-surface-tertiary px-2.5 py-1 rounded-full">
                      {data.companyDetails.length} {data.companyDetails.length === 1 ? 'detail' : 'details'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="py-2">
                {data.companyDetails.length > 0 ? (
                  <>
                    {/* Header row - aligned with Linked Contacts */}
                    <div className="flex items-center gap-4 py-2 px-4 text-xs font-medium text-text-muted border-b border-border-secondary">
                      <div className="flex-shrink-0 w-[360px]">Label</div>
                      <div className="flex-shrink-0 w-[300px]">Type</div>
                      <div className="flex-shrink-0 w-[80px] text-center">POC</div>
                      <div className="flex-1">Value</div>
                      <div className="flex-shrink-0 w-[56px]"></div>
                    </div>
                    {/* Detail rows */}
                    <div className="divide-y divide-border-secondary">
                      {data.companyDetails.map((detail) => (
                        <ContactDetailRow
                        key={detail.id}
                        detail={detail}
                        canEdit={canEdit}
                        isEditing={editingDetailId === detail.id}
                        editForm={editForm}
                        onStartEdit={() => startEdit(detail)}
                        onCancelEdit={cancelEdit}
                        onSaveEdit={handleUpdateDetail}
                        onDelete={() => setDeleteConfirm({ id: detail.id, value: detail.value })}
                        onUpdateForm={updateEditForm}
                        isSaving={updateDetailMutation.isPending}
                        isDeleting={deletingDetailId === detail.id}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <Building2 className="w-8 h-8 text-text-muted mx-auto mb-2" />
                    <p className="text-sm text-text-muted">No company-level contact details</p>
                    {canEdit && (
                      <button
                        onClick={openAddDetailForCompany}
                        className="text-sm text-oak-light hover:text-oak-dark mt-2 inline-flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add first detail
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Linked Contacts */}
            <div className="card">
              <div className="px-4 py-3 border-b border-border-primary">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-text-primary flex items-center gap-2">
                      <User className="w-4 h-4 text-text-tertiary" />
                      Linked Contacts
                    </h4>
                    <p className="text-xs text-text-secondary mt-1">
                      Directors, officers, shareholders, and other contacts linked to this company
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {canEdit && (
                      <Button variant="secondary" size="xs" onClick={() => setShowAddContactModal(true)}>
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add Contact
                      </Button>
                    )}
                    <span className="text-xs text-text-muted bg-surface-tertiary px-2.5 py-1 rounded-full">
                      {data.contactDetails.length} {data.contactDetails.length === 1 ? 'contact' : 'contacts'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="py-2">
                {data.contactDetails.length > 0 ? (
                  <>
                    {/* Header row */}
                    <div className="flex items-center gap-4 py-2 px-4 text-xs font-medium text-text-muted border-b border-border-secondary">
                      <div className="flex-shrink-0 w-[360px]">Name</div>
                      <div className="flex-shrink-0 w-[300px]">Role</div>
                      <div className="flex-shrink-0 w-[80px] text-center">POC</div>
                      <div className="flex-shrink-0 w-[210px]">Phone</div>
                      <div className="flex-1">Email</div>
                      <div className="flex-shrink-0 w-[32px]"></div>
                    </div>
                    {/* Contact rows */}
                    <div className="divide-y divide-border-secondary">
                      {data.contactDetails.map((item) => (
                        <ContactRow
                          key={item.contact.id}
                          item={item}
                          companyId={companyId}
                          canEdit={canEdit}
                          onAddDetail={() => openAddDetailForContact(item)}
                          onUnlink={() => setUnlinkConfirm({
                            contactId: item.contact.id,
                            contactName: item.contact.fullName,
                            relationship: item.contact.relationship || '',
                          })}
                          onTogglePoc={(isPoc) => handleTogglePoc(item.contact.id, isPoc)}
                          isTogglingPoc={togglingPocContactId === item.contact.id}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <User className="w-8 h-8 text-text-muted mx-auto mb-2" />
                    <p className="text-sm text-text-muted">No linked contacts</p>
                    {canEdit && (
                      <button
                        onClick={() => setShowAddContactModal(true)}
                        className="text-sm text-oak-light hover:text-oak-dark mt-2 inline-flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add first contact
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Detail Modal */}
      <AddContactDetailModal
        isOpen={showAddDetailModal}
        onClose={() => setShowAddDetailModal(false)}
        onSubmit={handleAddDetail}
        onUpdate={handleUpdateDetailFromModal}
        onDelete={handleDeleteDetailFromModal}
        onReopen={openAddDetailForCompany}
        isLoading={createDetailMutation.isPending || updateDetailMutation.isPending}
        targetName={addDetailTarget.name}
        targetType={addDetailTarget.type}
        contactId={addDetailTarget.id}
        companyId={companyId}
        companyName={companyName}
        existingDetails={addDetailTarget.existingDetails}
      />

      {/* Link Contact Modal */}
      <LinkContactModal
        isOpen={showAddContactModal}
        onClose={() => setShowAddContactModal(false)}
        onSubmit={handleLinkContact}
        isLoading={linkContactMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteDetail}
        title="Delete Contact Detail"
        description={`Are you sure you want to delete "${deleteConfirm?.value}"? This action cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        isLoading={deleteDetailMutation.isPending}
      />

      {/* Unlink Contact Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!unlinkConfirm}
        onClose={() => setUnlinkConfirm(null)}
        onConfirm={handleUnlinkContact}
        title="Unlink Contact"
        description={`Are you sure you want to unlink "${unlinkConfirm?.contactName}" from this company? This will remove their relationship as "${unlinkConfirm?.relationship}".`}
        variant="danger"
        confirmLabel="Unlink"
        isLoading={unlinkContactMutation.isPending}
      />
    </>
  );
}
