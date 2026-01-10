'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Mail,
  Phone,
  Plus,
  Trash2,
  Pencil,
  Building2,
  User,
  Globe,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Star,
  ExternalLink,
  Loader2,
  FileText,
  Copy,
} from 'lucide-react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import {
  useCompanyContactDetails,
  useCreateContactDetail,
  useUpdateContactDetail,
  useDeleteContactDetail,
  useCreateContactWithDetails,
  type ContactDetail,
  type ContactWithDetails,
  type CreateContactDetailInput,
  type CreateContactWithDetailsInput,
} from '@/hooks/use-contact-details';
import type { ContactDetailType } from '@/generated/prisma';
import { AUTOMATION_PURPOSES } from '@/lib/constants/automation-purposes';

interface ContactDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  canEdit: boolean;
}

// Detail type icons and labels
const detailTypeConfig: Record<ContactDetailType, { icon: typeof Mail; label: string; placeholder: string }> = {
  EMAIL: { icon: Mail, label: 'Email', placeholder: 'email@example.com' },
  PHONE: { icon: Phone, label: 'Phone', placeholder: '+65 1234 5678' },
  WEBSITE: { icon: Globe, label: 'Website', placeholder: 'https://example.com' },
  OTHER: { icon: FileText, label: 'Other', placeholder: 'Enter value' },
};

// Use centralized automation purposes from @/lib/constants/automation-purposes

// Common label suggestions
const labelSuggestions = [
  'Main Office',
  'Account Receivable',
  'Account Payable',
  'Human Resources',
  'Sales',
  'Support',
  'Personal',
  'Work',
  'Home',
  'Emergency',
];

// Relationship options
const relationshipOptions = [
  'Agent',
  'Authorized Representative',
  'Accountant',
  'Lawyer',
  'Consultant',
  'Vendor',
  'Customer',
  'Partner',
  'Other',
];

// ============================================================================
// COPY BUTTON HELPER
// ============================================================================

function CopyButton({ value, className = '' }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Failed to copy
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1 rounded hover:bg-surface-tertiary transition-colors ${className}`}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <Check className="w-3 h-3 text-status-success" />
      ) : (
        <Copy className="w-3 h-3 text-text-muted hover:text-text-secondary" />
      )}
    </button>
  );
}

// ============================================================================
// ADD CONTACT DETAIL MODAL
// ============================================================================

interface AddContactDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateContactDetailInput) => Promise<void>;
  isLoading: boolean;
  targetName: string;
  targetType: 'company' | 'contact';
  contactId?: string;
}

function AddContactDetailModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  targetName,
  targetType,
  contactId,
}: AddContactDetailModalProps) {
  const [form, setForm] = useState<{
    detailType: ContactDetailType;
    value: string;
    label: string;
    purposes: string[];
    isPrimary: boolean;
  }>({
    detailType: 'EMAIL',
    value: '',
    label: '',
    purposes: [],
    isPrimary: false,
  });

  const handleSubmit = async () => {
    const input: CreateContactDetailInput = {
      detailType: form.detailType,
      value: form.value.trim(),
      label: form.label.trim() || undefined,
      purposes: form.purposes,
      isPrimary: form.isPrimary,
    };
    if (contactId) {
      input.contactId = contactId;
    }
    await onSubmit(input);
    // Reset form on success
    setForm({ detailType: 'EMAIL', value: '', label: '', purposes: [], isPrimary: false });
  };

  const handleClose = () => {
    setForm({ detailType: 'EMAIL', value: '', label: '', purposes: [], isPrimary: false });
    onClose();
  };

  const togglePurpose = (purpose: string) => {
    setForm(prev => ({
      ...prev,
      purposes: prev.purposes.includes(purpose)
        ? prev.purposes.filter(p => p !== purpose)
        : [...prev.purposes, purpose],
    }));
  };

  const config = detailTypeConfig[form.detailType];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Contact Detail" size="md">
      <ModalBody className="space-y-4">
        {/* Target indicator */}
        <div className="flex items-center gap-2 p-3 bg-surface-tertiary rounded-lg">
          {targetType === 'company' ? (
            <Building2 className="w-4 h-4 text-text-tertiary" />
          ) : (
            <User className="w-4 h-4 text-text-tertiary" />
          )}
          <span className="text-sm text-text-secondary">Adding to:</span>
          <span className="text-sm font-medium text-text-primary">{targetName}</span>
        </div>

        {/* Type selection */}
        <div>
          <label className="label">Type</label>
          <select
            value={form.detailType}
            onChange={(e) => {
              const newType = e.target.value as ContactDetailType;
              setForm(prev => ({
                ...prev,
                detailType: newType,
                // Clear purposes when switching away from EMAIL
                purposes: newType === 'EMAIL' ? prev.purposes : [],
              }));
            }}
            className="input input-sm w-full"
          >
            {Object.entries(detailTypeConfig).map(([type, cfg]) => (
              <option key={type} value={type}>{cfg.label}</option>
            ))}
          </select>
        </div>

        {/* Value input */}
        <div>
          <label className="label">Value</label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
              <config.icon className="w-4 h-4" />
            </div>
            <input
              type={form.detailType === 'EMAIL' ? 'email' : form.detailType === 'WEBSITE' ? 'url' : 'text'}
              value={form.value}
              onChange={(e) => setForm(prev => ({ ...prev, value: e.target.value }))}
              className="input input-sm w-full pl-10"
              placeholder={config.placeholder}
            />
          </div>
        </div>

        {/* Label input */}
        <div>
          <label className="label">Label (Optional)</label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm(prev => ({ ...prev, label: e.target.value }))}
            className="input input-sm w-full"
            placeholder="e.g., Account Receivable, Main Office"
            list="label-suggestions-add"
          />
          <datalist id="label-suggestions-add">
            {labelSuggestions.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>

        {/* Purposes selection - only for EMAIL type */}
        {form.detailType === 'EMAIL' && (
          <div>
            <label className="label">Purposes (for automation)</label>
            <div className="flex flex-wrap gap-2">
              {AUTOMATION_PURPOSES.map((purpose) => (
                <button
                  key={purpose.value}
                  type="button"
                  onClick={() => togglePurpose(purpose.value)}
                  title={purpose.description}
                  className={`text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                    form.purposes.includes(purpose.value)
                      ? 'bg-oak-light text-white'
                      : 'bg-surface-tertiary text-text-secondary hover:bg-surface-secondary border border-border-primary'
                  }`}
                >
                  {purpose.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-2">
              Select which automations should use this contact detail
            </p>
          </div>
        )}

        {/* Primary toggle */}
        <div className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg border border-border-primary">
          <input
            type="checkbox"
            id="isPrimary-add"
            checked={form.isPrimary}
            onChange={(e) => setForm(prev => ({ ...prev, isPrimary: e.target.checked }))}
            className="checkbox"
          />
          <label htmlFor="isPrimary-add" className="flex-1 cursor-pointer">
            <span className="text-sm font-medium text-text-primary">Set as primary</span>
            <p className="text-xs text-text-secondary">
              Primary contact details are used by default for this type
            </p>
          </label>
          <Star className={`w-4 h-4 ${form.isPrimary ? 'text-status-warning' : 'text-text-muted'}`} fill={form.isPrimary ? 'currentColor' : 'none'} />
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={isLoading || !form.value.trim()}
        >
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Add Detail
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ============================================================================
// ADD CONTACT MODAL
// ============================================================================

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateContactWithDetailsInput) => Promise<void>;
  isLoading: boolean;
}

function AddContactModal({ isOpen, onClose, onSubmit, isLoading }: AddContactModalProps) {
  const [form, setForm] = useState<{
    contactType: 'INDIVIDUAL' | 'CORPORATE';
    firstName: string;
    lastName: string;
    corporateName: string;
    email: string;
    phone: string;
    relationship: string;
    details: Array<{ detailType: ContactDetailType; value: string; label: string; purposes: string[] }>;
  }>({
    contactType: 'INDIVIDUAL',
    firstName: '',
    lastName: '',
    corporateName: '',
    email: '',
    phone: '',
    relationship: '',
    details: [],
  });

  const handleSubmit = async () => {
    const input: CreateContactWithDetailsInput = {
      relationship: form.relationship.trim(),
      contact: {
        contactType: form.contactType,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        corporateName: form.corporateName.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
      },
      contactDetails: form.details.filter(d => d.value.trim()),
    };
    await onSubmit(input);
    resetForm();
  };

  const resetForm = () => {
    setForm({
      contactType: 'INDIVIDUAL',
      firstName: '',
      lastName: '',
      corporateName: '',
      email: '',
      phone: '',
      relationship: '',
      details: [],
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const addDetail = () => {
    setForm(prev => ({
      ...prev,
      details: [...prev.details, { detailType: 'EMAIL' as ContactDetailType, value: '', label: '', purposes: [] }],
    }));
  };

  const updateDetail = (index: number, field: string, value: string | string[]) => {
    const newDetails = [...form.details];
    newDetails[index] = { ...newDetails[index], [field]: value };
    setForm(prev => ({ ...prev, details: newDetails }));
  };

  const removeDetail = (index: number) => {
    setForm(prev => ({ ...prev, details: prev.details.filter((_, i) => i !== index) }));
  };

  const isValid = form.contactType === 'INDIVIDUAL'
    ? (form.firstName.trim() || form.lastName.trim()) && form.relationship.trim()
    : form.corporateName.trim() && form.relationship.trim();

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New Contact" size="lg">
      <ModalBody className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* Contact Type */}
        <div>
          <label className="label">Contact Type</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={form.contactType === 'INDIVIDUAL'}
                onChange={() => setForm(prev => ({ ...prev, contactType: 'INDIVIDUAL' }))}
                className="radio"
              />
              <User className="w-4 h-4 text-text-tertiary" />
              <span className="text-sm">Individual</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={form.contactType === 'CORPORATE'}
                onChange={() => setForm(prev => ({ ...prev, contactType: 'CORPORATE' }))}
                className="radio"
              />
              <Building2 className="w-4 h-4 text-text-tertiary" />
              <span className="text-sm">Corporate</span>
            </label>
          </div>
        </div>

        {/* Name fields */}
        {form.contactType === 'INDIVIDUAL' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">First Name</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                className="input input-sm w-full"
                placeholder="First name"
              />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                className="input input-sm w-full"
                placeholder="Last name"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="label">Company Name</label>
            <input
              type="text"
              value={form.corporateName}
              onChange={(e) => setForm(prev => ({ ...prev, corporateName: e.target.value }))}
              className="input input-sm w-full"
              placeholder="Company name"
            />
          </div>
        )}

        {/* Relationship */}
        <div>
          <label className="label">Relationship</label>
          <select
            value={form.relationship}
            onChange={(e) => setForm(prev => ({ ...prev, relationship: e.target.value }))}
            className="input input-sm w-full"
          >
            <option value="">Select relationship...</option>
            {relationshipOptions.map((rel) => (
              <option key={rel} value={rel}>{rel}</option>
            ))}
          </select>
        </div>

        {/* Primary contact info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                className="input input-sm w-full pl-10"
                placeholder="email@example.com"
              />
            </div>
          </div>
          <div>
            <label className="label">Phone</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                className="input input-sm w-full pl-10"
                placeholder="+65 1234 5678"
              />
            </div>
          </div>
        </div>

        {/* Additional contact details */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="label mb-0">Additional Contact Details</label>
            <button
              type="button"
              onClick={addDetail}
              className="text-xs text-oak-light hover:text-oak-dark flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
          {form.details.length === 0 ? (
            <p className="text-sm text-text-muted py-2">No additional details added</p>
          ) : (
            <div className="space-y-2">
              {form.details.map((detail, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-surface-secondary rounded-lg">
                  <select
                    value={detail.detailType}
                    onChange={(e) => updateDetail(index, 'detailType', e.target.value)}
                    className="input input-xs w-24"
                  >
                    {Object.entries(detailTypeConfig).map(([type, cfg]) => (
                      <option key={type} value={type}>{cfg.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={detail.value}
                    onChange={(e) => updateDetail(index, 'value', e.target.value)}
                    className="input input-xs flex-1"
                    placeholder={detailTypeConfig[detail.detailType].placeholder}
                  />
                  <input
                    type="text"
                    value={detail.label}
                    onChange={(e) => updateDetail(index, 'label', e.target.value)}
                    className="input input-xs w-28"
                    placeholder="Label"
                    list="label-suggestions-contact"
                  />
                  <button
                    type="button"
                    onClick={() => removeDetail(index)}
                    className="text-text-muted hover:text-status-error p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <datalist id="label-suggestions-contact">
            {labelSuggestions.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={isLoading || !isValid}>
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Create Contact
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ============================================================================
// CONTACT DETAIL ROW
// ============================================================================

interface ContactDetailRowProps {
  detail: ContactDetail;
  canEdit: boolean;
  isEditing: boolean;
  editForm: {
    detailType: ContactDetailType;
    value: string;
    label: string;
    purposes: string[];
    isPrimary: boolean;
  };
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onUpdateForm: (field: string, value: string | string[] | boolean) => void;
  isSaving: boolean;
  isDeleting: boolean;
}

function ContactDetailRow({
  detail,
  canEdit,
  isEditing,
  editForm,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onUpdateForm,
  isSaving,
  isDeleting,
}: ContactDetailRowProps) {
  const config = detailTypeConfig[detail.detailType];
  const Icon = config.icon;

  if (isEditing && canEdit) {
    return (
      <div className="flex flex-col gap-2 p-3 bg-surface-secondary rounded-lg border border-oak-light/30">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={editForm.detailType}
            onChange={(e) => {
              const newType = e.target.value;
              onUpdateForm('detailType', newType);
              // Clear purposes when switching away from EMAIL
              if (newType !== 'EMAIL') {
                onUpdateForm('purposes', []);
              }
            }}
            className="input input-xs w-24"
          >
            {Object.entries(detailTypeConfig).map(([type, cfg]) => (
              <option key={type} value={type}>{cfg.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={editForm.value}
            onChange={(e) => onUpdateForm('value', e.target.value)}
            className="input input-xs flex-1 min-w-[150px]"
            placeholder="Value"
          />
          <input
            type="text"
            value={editForm.label}
            onChange={(e) => onUpdateForm('label', e.target.value)}
            className="input input-xs w-28"
            placeholder="Label"
            list="label-suggestions-edit"
          />
          <button
            onClick={() => onUpdateForm('isPrimary', !editForm.isPrimary)}
            className={`p-1.5 rounded ${editForm.isPrimary ? 'text-status-warning bg-status-warning/10' : 'text-text-muted hover:text-text-secondary'}`}
            title={editForm.isPrimary ? 'Primary' : 'Set as primary'}
          >
            <Star className="w-4 h-4" fill={editForm.isPrimary ? 'currentColor' : 'none'} />
          </button>
        </div>
        {/* Purposes in edit mode - only for EMAIL type */}
        {editForm.detailType === 'EMAIL' && (
          <div className="flex flex-wrap gap-1.5">
            {AUTOMATION_PURPOSES.map((purpose) => (
              <button
                key={purpose.value}
                type="button"
                onClick={() => {
                  const newPurposes = editForm.purposes.includes(purpose.value)
                    ? editForm.purposes.filter(p => p !== purpose.value)
                    : [...editForm.purposes, purpose.value];
                  onUpdateForm('purposes', newPurposes);
                }}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  editForm.purposes.includes(purpose.value)
                    ? 'bg-oak-light text-white'
                    : 'bg-surface-tertiary text-text-secondary hover:bg-surface-secondary'
                }`}
              >
                {purpose.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="xs" onClick={onCancelEdit} disabled={isSaving}>
            <X className="w-3.5 h-3.5 mr-1" />
            Cancel
          </Button>
          <Button variant="primary" size="xs" onClick={onSaveEdit} disabled={isSaving || !editForm.value.trim()}>
            {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
            Save
          </Button>
        </div>
        <datalist id="label-suggestions-edit">
          {labelSuggestions.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-surface-secondary transition-colors group">
      <Icon className="w-4 h-4 text-text-tertiary flex-shrink-0" />
      <span className="text-sm text-text-primary flex-1 truncate">{detail.value}</span>
      {detail.label && (
        <span className="text-xs text-text-muted bg-surface-tertiary px-1.5 py-0.5 rounded flex-shrink-0">
          {detail.label}
        </span>
      )}
      {/* Only show purposes for EMAIL type */}
      {detail.detailType === 'EMAIL' && detail.purposes && detail.purposes.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
          {detail.purposes.slice(0, 2).map((purpose) => (
            <span key={purpose} className="text-xs text-oak-light bg-oak-light/10 px-1.5 py-0.5 rounded">
              {purpose}
            </span>
          ))}
          {detail.purposes.length > 2 && (
            <span className="text-xs text-text-muted">+{detail.purposes.length - 2}</span>
          )}
        </div>
      )}
      {detail.isPrimary && (
        <Star className="w-3.5 h-3.5 text-status-warning flex-shrink-0" fill="currentColor" />
      )}
      {canEdit && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onStartEdit}
            className="text-text-muted hover:text-oak-light p-1 rounded hover:bg-surface-tertiary"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="text-text-muted hover:text-status-error p-1 rounded hover:bg-surface-tertiary"
            title="Delete"
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CONTACT CARD
// ============================================================================

interface ContactCardProps {
  item: ContactWithDetails;
  isExpanded: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onAddDetail: () => void;
  editingDetailId: string | null;
  editForm: {
    detailType: ContactDetailType;
    value: string;
    label: string;
    purposes: string[];
    isPrimary: boolean;
  };
  onStartEdit: (detail: ContactDetail) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDeleteDetail: (detailId: string) => void;
  onUpdateEditForm: (field: string, value: string | string[] | boolean) => void;
  isSaving: boolean;
  deletingDetailId: string | null;
}

// Helper to convert UPPERCASE to Title Case
function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Helper to deduplicate and clean up relationships
// Removes generic "Shareholder" if there's a more specific one like "Ordinary Shareholder"
function cleanRelationships(relationshipStr: string | undefined): string[] {
  if (!relationshipStr) return [];

  const rawRoles = [...new Set(relationshipStr.split(', ').filter(Boolean))].map(toTitleCase);

  // Check if there's a specific shareholder type (e.g., "Ordinary Shareholder", "Preference Shareholder")
  const hasSpecificShareholder = rawRoles.some(r => r.includes('Shareholder') && r !== 'Shareholder');

  // Filter out generic "Shareholder" if there's a more specific one
  return rawRoles.filter(r => !(r === 'Shareholder' && hasSpecificShareholder));
}

function ContactRow({
  item,
  canEdit,
  onAddDetail,
}: {
  item: ContactWithDetails;
  canEdit: boolean;
  onAddDetail: () => void;
}) {
  // Parse relationship to show badges (deduplicated, cleaned, and in title case)
  const relationships = cleanRelationships(item.contact.relationship);

  // Find email ContactDetail that matches the displayed email
  // Only show purposes if there's a matching ContactDetail record
  const displayedEmail = item.contact.email;
  const matchingEmailDetail = item.details.find(
    d => d.detailType === 'EMAIL' && d.value === displayedEmail
  );
  const emailPurposes = matchingEmailDetail?.purposes || [];

  return (
    <div className="flex items-center gap-4 py-3 px-4 hover:bg-surface-secondary rounded-lg transition-colors group">
      {/* Name with link - 320px to fit ~40 characters */}
      <div className="flex-shrink-0 w-[320px] min-w-0">
        <Link
          href={`/contacts/${item.contact.id}`}
          className="font-medium text-text-primary hover:text-oak-light flex items-center gap-1.5 truncate"
        >
          {item.contact.contactType === 'CORPORATE' ? (
            <Building2 className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          ) : (
            <User className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          )}
          <span className="truncate">{item.contact.fullName}</span>
        </Link>
      </div>

      {/* Relationship badges */}
      <div className="flex-shrink-0 w-[180px]">
        <div className="flex flex-wrap gap-1 items-center">
          {relationships.length > 0 ? (
            <>
              {relationships.slice(0, 2).map((rel, idx) => (
                <span key={idx} className="text-xs font-medium text-white bg-oak-light px-2 py-0.5 rounded">
                  {rel}
                </span>
              ))}
              {relationships.length > 2 && (
                <span
                  className="text-xs text-text-muted cursor-help relative group"
                  title={relationships.slice(2).join(', ')}
                >
                  +{relationships.length - 2}
                  {/* Tooltip */}
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    {relationships.slice(2).join(', ')}
                  </span>
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-text-muted italic">No role</span>
          )}
        </div>
      </div>

      {/* Email */}
      <div className="flex-1 min-w-0">
        {item.contact.email ? (
          <div className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
            <span className="text-sm text-text-secondary truncate">{item.contact.email}</span>
            <CopyButton value={item.contact.email} />
            {emailPurposes.length > 0 && (
              <div className="flex gap-1 flex-shrink-0">
                {emailPurposes.slice(0, 2).map((purpose) => (
                  <span key={purpose} className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    {purpose}
                  </span>
                ))}
                {emailPurposes.length > 2 && (
                  <span className="text-[10px] text-text-muted">+{emailPurposes.length - 2}</span>
                )}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-text-muted italic">No email</span>
        )}
      </div>

      {/* Phone */}
      <div className="flex-shrink-0 w-[120px]">
        {item.contact.phone ? (
          <div className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-text-tertiary" />
            <span className="text-sm text-text-secondary">{item.contact.phone}</span>
            <CopyButton value={item.contact.phone} />
          </div>
        ) : (
          <span className="text-xs text-text-muted italic">No phone</span>
        )}
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onAddDetail}
            className="text-oak-light hover:text-oak-dark p-1.5 rounded hover:bg-surface-tertiary"
            title="Add contact detail"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN MODAL
// ============================================================================

export function ContactDetailsModal({
  isOpen,
  onClose,
  companyId,
  companyName,
  canEdit,
}: ContactDetailsModalProps) {
  const { success } = useToast();
  const { data, isLoading, error } = useCompanyContactDetails(isOpen ? companyId : null);

  const createDetailMutation = useCreateContactDetail(companyId);
  const updateDetailMutation = useUpdateContactDetail(companyId);
  const deleteDetailMutation = useDeleteContactDetail(companyId);
  const createContactMutation = useCreateContactWithDetails(companyId);

  // State for expanded contacts
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set());

  // State for add detail modal
  const [showAddDetailModal, setShowAddDetailModal] = useState(false);
  const [addDetailTarget, setAddDetailTarget] = useState<{ type: 'company' | 'contact'; id?: string; name: string }>({
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
  }>({
    detailType: 'EMAIL',
    value: '',
    label: '',
    purposes: [],
    isPrimary: false,
  });

  // State for delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; value: string } | null>(null);
  const [deletingDetailId, setDeletingDetailId] = useState<string | null>(null);

  const toggleContact = useCallback((contactId: string) => {
    setExpandedContacts(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(contactId)) {
        newExpanded.delete(contactId);
      } else {
        newExpanded.add(contactId);
      }
      return newExpanded;
    });
  }, []);

  const handleAddDetail = async (input: CreateContactDetailInput) => {
    try {
      await createDetailMutation.mutateAsync(input);
      success('Contact detail added');
      setShowAddDetailModal(false);
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

  const handleAddContact = async (input: CreateContactWithDetailsInput) => {
    try {
      await createContactMutation.mutateAsync(input);
      success('Contact created and linked');
      setShowAddContactModal(false);
    } catch {
      // Error handled by mutation
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
    });
  };

  const cancelEdit = () => {
    setEditingDetailId(null);
    setEditForm({ detailType: 'EMAIL', value: '', label: '', purposes: [], isPrimary: false });
  };

  const updateEditForm = (field: string, value: string | string[] | boolean) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const openAddDetailForCompany = () => {
    setAddDetailTarget({ type: 'company', name: companyName });
    setShowAddDetailModal(true);
  };

  const openAddDetailForContact = (contact: ContactWithDetails['contact']) => {
    setAddDetailTarget({ type: 'contact', id: contact.id, name: contact.fullName });
    setShowAddDetailModal(true);
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Contact Details" size="6xl">
        <ModalBody className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            {/* Company Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">{companyName}</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Manage contact details for this company and linked contacts
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={openAddDetailForCompany}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Add Detail
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setShowAddContactModal(true)}>
                    <User className="w-4 h-4 mr-1.5" />
                    Add Contact
                  </Button>
                </div>
              )}
            </div>

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
                      <span className="text-xs text-text-muted bg-surface-tertiary px-2.5 py-1 rounded-full">
                        {data.companyDetails.length} {data.companyDetails.length === 1 ? 'detail' : 'details'}
                      </span>
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    {data.companyDetails.length > 0 ? (
                      <div className="space-y-1">
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
                      <span className="text-xs text-text-muted bg-surface-tertiary px-2.5 py-1 rounded-full">
                        {data.contactDetails.length} {data.contactDetails.length === 1 ? 'contact' : 'contacts'}
                      </span>
                    </div>
                  </div>
                  <div className="py-2">
                    {data.contactDetails.length > 0 ? (
                      <>
                        {/* Header row */}
                        <div className="flex items-center gap-4 py-2 px-4 text-xs font-medium text-text-muted border-b border-border-secondary">
                          <div className="flex-shrink-0 w-[320px]">Name</div>
                          <div className="flex-shrink-0 w-[180px]">Role</div>
                          <div className="flex-1">Email</div>
                          <div className="flex-shrink-0 w-[120px]">Phone</div>
                          <div className="flex-shrink-0 w-[32px]"></div>
                        </div>
                        {/* Contact rows */}
                        <div className="divide-y divide-border-secondary">
                          {data.contactDetails.map((item) => (
                            <ContactRow
                              key={item.contact.id}
                              item={item}
                              canEdit={canEdit}
                              onAddDetail={() => openAddDetailForContact(item.contact)}
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
        </ModalBody>
      </Modal>

      {/* Add Detail Modal */}
      <AddContactDetailModal
        isOpen={showAddDetailModal}
        onClose={() => setShowAddDetailModal(false)}
        onSubmit={handleAddDetail}
        isLoading={createDetailMutation.isPending}
        targetName={addDetailTarget.name}
        targetType={addDetailTarget.type}
        contactId={addDetailTarget.id}
      />

      {/* Add Contact Modal */}
      <AddContactModal
        isOpen={showAddContactModal}
        onClose={() => setShowAddContactModal(false)}
        onSubmit={handleAddContact}
        isLoading={createContactMutation.isPending}
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
    </>
  );
}
