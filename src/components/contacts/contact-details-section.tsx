'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Mail, Plus, Building2, User, Loader2, Pencil, Trash2, Star, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { LoadingState } from '@/components/ui/loading-state';
import { ErrorState } from '@/components/ui/error-state';
import { CopyButton } from '@/components/companies/contact-details/copy-button';
import { PurposeToggle, PurposeBadges } from '@/components/contacts/purpose-toggle';
import { AddContactDetailModal } from '@/components/companies/contact-details/add-contact-detail-modal';
import {
  useContactDetailsGrouped,
  useContactDetails,
  useCreateContactLevelDetail,
  useUpdateContactLevelDetail,
  useDeleteContactLevelDetail,
  type ContactDetail,
  type CreateContactDetailInput,
} from '@/hooks/use-contact-details';
import type { ContactDetailType } from '@/generated/prisma';
import {
  DETAIL_TYPE_CONFIG,
  LABEL_SUGGESTIONS,
  createInitialFormState,
  type ContactDetailFormState,
} from '@/lib/constants/contact-details';

interface ContactDetailsSectionProps {
  contactId: string;
  contactName: string;
  canEdit: boolean;
}

export function ContactDetailsSection({ contactId, contactName, canEdit }: ContactDetailsSectionProps) {
  const { success } = useToast();
  const { data, isLoading, error } = useContactDetailsGrouped(contactId);

  // Get flat list of all contact details for the modal (for validation)
  const { data: allDetails } = useContactDetails(contactId);

  const createMutation = useCreateContactLevelDetail(contactId);
  const updateMutation = useUpdateContactLevelDetail(contactId);
  const deleteMutation = useDeleteContactLevelDetail(contactId);

  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ContactDetailFormState>(createInitialFormState());

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; value: string } | null>(null);

  // Get list of company IDs that already have company-specific details
  const linkedCompanyIds = useMemo(() => {
    if (!data?.companyDetails) return [];
    return data.companyDetails.map(c => c.companyId);
  }, [data?.companyDetails]);

  // Handle add submit from modal
  const handleAddSubmit = async (input: CreateContactDetailInput) => {
    try {
      // Pass all fields including selectedCompanyId for company-specific details
      await createMutation.mutateAsync({
        detailType: input.detailType,
        value: input.value,
        label: input.label,
        purposes: input.purposes,
        isPrimary: input.isPrimary,
        isCompanySpecific: input.isCompanySpecific,
        selectedCompanyId: input.selectedCompanyId,
      });
      success('Contact detail added');
      setShowAddModal(false);
    } catch {
      // Error handled by mutation
    }
  };

  // Handle update from modal
  const handleUpdateFromModal = async (
    detailId: string,
    data: { value: string; label?: string | null; purposes?: string[] }
  ) => {
    try {
      await updateMutation.mutateAsync({
        detailId,
        data: {
          value: data.value,
          label: data.label,
          purposes: data.purposes,
        },
      });
      success('Contact detail updated');
    } catch {
      // Error handled by mutation
    }
  };

  // Handle delete from modal
  const handleDeleteFromModal = async (detailId: string) => {
    try {
      await deleteMutation.mutateAsync(detailId);
      success('Contact detail deleted');
    } catch {
      // Error handled by mutation
    }
  };

  const startEdit = (detail: ContactDetail) => {
    setEditingId(detail.id);
    setEditForm({
      detailType: detail.detailType,
      value: detail.value,
      label: detail.label || '',
      purposes: detail.purposes || [],
      isPrimary: detail.isPrimary,
      isPoc: detail.isPoc,
    });
  };

  const handleUpdate = async () => {
    if (!editingId) return;

    try {
      await updateMutation.mutateAsync({
        detailId: editingId,
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
      setEditingId(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteMutation.mutateAsync(deleteConfirm.id);
      success('Contact detail deleted');
      setDeleteConfirm(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleEditPurposesChange = (purposes: string[]) => {
    setEditForm(prev => ({ ...prev, purposes }));
  };

  const renderDetailRow = (detail: ContactDetail, isEditing: boolean) => {
    const config = DETAIL_TYPE_CONFIG[detail.detailType];
    const Icon = config.icon;

    if (isEditing && canEdit) {
      return (
        <div key={detail.id} className="flex flex-col gap-2 p-3 bg-surface-secondary rounded-lg border border-oak-light/30">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={editForm.detailType}
              onChange={(e) => {
                const newType = e.target.value as ContactDetailType;
                setEditForm(prev => ({
                  ...prev,
                  detailType: newType,
                  purposes: newType === 'EMAIL' ? prev.purposes : [],
                }));
              }}
              className="input input-xs w-24"
            >
              {Object.entries(DETAIL_TYPE_CONFIG).map(([type, cfg]) => (
                <option key={type} value={type}>{cfg.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={editForm.value}
              onChange={(e) => setEditForm(prev => ({ ...prev, value: e.target.value }))}
              className="input input-xs flex-1 min-w-[150px]"
              placeholder="Value"
            />
            <input
              type="text"
              value={editForm.label}
              onChange={(e) => setEditForm(prev => ({ ...prev, label: e.target.value }))}
              className="input input-xs w-28"
              placeholder="Label"
              list="label-suggestions-edit"
            />
            <button
              onClick={() => setEditForm(prev => ({ ...prev, isPrimary: !prev.isPrimary }))}
              className={`p-1.5 rounded ${editForm.isPrimary ? 'text-status-warning bg-status-warning/10' : 'text-text-muted hover:text-text-secondary'}`}
              title={editForm.isPrimary ? 'Primary' : 'Set as primary'}
            >
              <Star className="w-4 h-4" fill={editForm.isPrimary ? 'currentColor' : 'none'} />
            </button>
          </div>
          {editForm.detailType === 'EMAIL' && (
            <PurposeToggle
              selectedPurposes={editForm.purposes}
              onChange={handleEditPurposesChange}
              size="sm"
            />
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="xs" onClick={() => setEditingId(null)} disabled={updateMutation.isPending}>
              <X className="w-3.5 h-3.5 mr-1" />
              Cancel
            </Button>
            <Button variant="primary" size="xs" onClick={handleUpdate} disabled={updateMutation.isPending || !editForm.value.trim()}>
              {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
              Save
            </Button>
          </div>
          <datalist id="label-suggestions-edit">
            {LABEL_SUGGESTIONS.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>
      );
    }

    return (
      <div key={detail.id} className="flex items-center gap-3 py-2 px-3 hover:bg-surface-secondary rounded-lg transition-colors group">
        <Icon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-primary truncate">{detail.value}</span>
            <CopyButton value={detail.value} />
            {detail.isPrimary && (
              <Star className="w-3.5 h-3.5 text-status-warning flex-shrink-0" fill="currentColor" />
            )}
          </div>
          {detail.label && (
            <span className="text-xs text-text-muted">{detail.label}</span>
          )}
        </div>
        {detail.detailType === 'EMAIL' && detail.purposes && detail.purposes.length > 0 && (
          <PurposeBadges purposes={detail.purposes} className="hidden sm:flex flex-shrink-0" />
        )}
        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => startEdit(detail)}
              className="text-text-muted hover:text-oak-light p-1 rounded hover:bg-surface-tertiary"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setDeleteConfirm({ id: detail.id, value: detail.value })}
              className="text-text-muted hover:text-status-error p-1 rounded hover:bg-surface-tertiary"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="card">
        <div className="p-4 border-b border-border-primary">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-text-primary flex items-center gap-2">
              <Mail className="w-4 h-4 text-text-tertiary" />
              Contact Details
            </h2>
            {canEdit && (
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setShowAddModal(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Detail
              </Button>
            )}
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <LoadingState message="Loading contact details..." />
        )}

        {/* Error state */}
        {error && (
          <ErrorState error={error} inline className="p-4" />
        )}

        {/* Content */}
        {data && (
          <div className="divide-y divide-border-secondary">
            {/* Default Details Section */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-text-tertiary" />
                <h3 className="text-sm font-medium text-text-primary">Default</h3>
                <span className="text-xs text-text-muted">
                  ({data.defaultDetails.length} {data.defaultDetails.length === 1 ? 'detail' : 'details'})
                </span>
              </div>
              {data.defaultDetails.length > 0 ? (
                <div className="space-y-1">
                  {data.defaultDetails.map((detail) => renderDetailRow(detail, editingId === detail.id))}
                </div>
              ) : (
                <p className="text-sm text-text-muted italic">No default contact details</p>
              )}
            </div>

            {/* Company-Specific Details Sections */}
            {data.companyDetails.map((company) => (
              <div key={company.companyId} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-text-tertiary" />
                    <Link
                      href={`/companies/${company.companyId}`}
                      className="text-sm font-medium text-oak-light hover:text-oak-dark"
                    >
                      {company.companyName}
                    </Link>
                    <span className="text-xs text-text-muted">({company.companyUen})</span>
                  </div>
                  <span className="text-xs text-text-muted">
                    {company.details.length} {company.details.length === 1 ? 'detail' : 'details'}
                  </span>
                </div>
                {company.details.length > 0 ? (
                  <div className="space-y-1">
                    {company.details.map((detail) => renderDetailRow(detail, editingId === detail.id))}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted italic">No company-specific details</p>
                )}
              </div>
            ))}

            {/* Empty state when no details at all */}
            {data.defaultDetails.length === 0 && data.companyDetails.length === 0 && (
              <div className="p-8 text-center">
                <Mail className="w-8 h-8 text-text-muted mx-auto mb-2" />
                <p className="text-sm text-text-muted">No contact details</p>
                {canEdit && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="text-sm text-oak-light hover:text-oak-dark mt-2 inline-flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Add first detail
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Contact Detail Modal - uses shared modal with company search */}
      <AddContactDetailModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddSubmit}
        onUpdate={handleUpdateFromModal}
        onDelete={handleDeleteFromModal}
        isLoading={createMutation.isPending}
        targetName={contactName}
        targetType="contact"
        contactId={contactId}
        // No companyId means standalone mode - user can search for companies
        existingDetails={allDetails || []}
        linkedCompanyIds={linkedCompanyIds}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title="Delete Contact Detail"
        description={`Are you sure you want to delete "${deleteConfirm?.value}"? This action cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
