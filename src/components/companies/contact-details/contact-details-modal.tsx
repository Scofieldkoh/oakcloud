'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { Modal, ModalBody } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
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

interface ContactDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  canEdit: boolean;
}

// Detail type icons and labels
const detailTypeConfig: Record<ContactDetailType, { icon: typeof Mail; label: string }> = {
  EMAIL: { icon: Mail, label: 'Email' },
  PHONE: { icon: Phone, label: 'Phone' },
  MOBILE: { icon: Phone, label: 'Mobile' },
  FAX: { icon: Phone, label: 'Fax' },
  WEBSITE: { icon: Globe, label: 'Website' },
  OTHER: { icon: Mail, label: 'Other' },
};

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

export function ContactDetailsModal({
  isOpen,
  onClose,
  companyId,
  companyName,
  canEdit,
}: ContactDetailsModalProps) {
  const { success, error: toastError } = useToast();
  const { data, isLoading, error } = useCompanyContactDetails(isOpen ? companyId : null);

  const createDetailMutation = useCreateContactDetail(companyId);
  const updateDetailMutation = useUpdateContactDetail(companyId);
  const deleteDetailMutation = useDeleteContactDetail(companyId);
  const createContactMutation = useCreateContactWithDetails(companyId);

  // State for expanded contacts
  const [expandedContacts, setExpandedContacts] = useState<Set<string>>(new Set());

  // State for add detail modal
  const [showAddDetailForm, setShowAddDetailForm] = useState(false);
  const [addDetailMode, setAddDetailMode] = useState<'company' | 'contact'>('company');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  // State for add contact modal
  const [showAddContactForm, setShowAddContactForm] = useState(false);

  // State for editing
  const [editingDetailId, setEditingDetailId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    detailType: ContactDetailType;
    value: string;
    label: string;
    isPrimary: boolean;
  }>({
    detailType: 'EMAIL',
    value: '',
    label: '',
    isPrimary: false,
  });

  // New detail form state
  const [newDetailForm, setNewDetailForm] = useState<{
    detailType: ContactDetailType;
    value: string;
    label: string;
    isPrimary: boolean;
  }>({
    detailType: 'EMAIL',
    value: '',
    label: '',
    isPrimary: false,
  });

  // New contact form state
  const [newContactForm, setNewContactForm] = useState<{
    contactType: 'INDIVIDUAL' | 'CORPORATE';
    firstName: string;
    lastName: string;
    corporateName: string;
    email: string;
    phone: string;
    relationship: string;
    details: Array<{ detailType: ContactDetailType; value: string; label: string }>;
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

  const toggleContact = (contactId: string) => {
    const newExpanded = new Set(expandedContacts);
    if (newExpanded.has(contactId)) {
      newExpanded.delete(contactId);
    } else {
      newExpanded.add(contactId);
    }
    setExpandedContacts(newExpanded);
  };

  const handleAddDetail = async () => {
    if (!newDetailForm.value.trim()) {
      toastError('Value is required');
      return;
    }

    try {
      const input: CreateContactDetailInput = {
        detailType: newDetailForm.detailType,
        value: newDetailForm.value.trim(),
        label: newDetailForm.label.trim() || undefined,
        isPrimary: newDetailForm.isPrimary,
      };

      if (addDetailMode === 'contact' && selectedContactId) {
        input.contactId = selectedContactId;
      }

      await createDetailMutation.mutateAsync(input);
      success('Contact detail added');
      setShowAddDetailForm(false);
      setNewDetailForm({ detailType: 'EMAIL', value: '', label: '', isPrimary: false });
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
          isPrimary: editForm.isPrimary,
        },
      });
      success('Contact detail updated');
      setEditingDetailId(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDeleteDetail = async (detailId: string) => {
    try {
      await deleteDetailMutation.mutateAsync(detailId);
      success('Contact detail deleted');
    } catch {
      // Error handled by mutation
    }
  };

  const handleAddContact = async () => {
    if (newContactForm.contactType === 'INDIVIDUAL') {
      if (!newContactForm.firstName.trim() && !newContactForm.lastName.trim()) {
        toastError('Name is required');
        return;
      }
    } else {
      if (!newContactForm.corporateName.trim()) {
        toastError('Company name is required');
        return;
      }
    }

    if (!newContactForm.relationship.trim()) {
      toastError('Relationship is required');
      return;
    }

    try {
      const input: CreateContactWithDetailsInput = {
        relationship: newContactForm.relationship.trim(),
        contact: {
          contactType: newContactForm.contactType,
          firstName: newContactForm.firstName.trim() || undefined,
          lastName: newContactForm.lastName.trim() || undefined,
          corporateName: newContactForm.corporateName.trim() || undefined,
          email: newContactForm.email.trim() || undefined,
          phone: newContactForm.phone.trim() || undefined,
        },
        contactDetails: newContactForm.details.filter(d => d.value.trim()),
      };

      await createContactMutation.mutateAsync(input);
      success('Contact created and linked');
      setShowAddContactForm(false);
      setNewContactForm({
        contactType: 'INDIVIDUAL',
        firstName: '',
        lastName: '',
        corporateName: '',
        email: '',
        phone: '',
        relationship: '',
        details: [],
      });
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
      isPrimary: detail.isPrimary,
    });
  };

  const cancelEdit = () => {
    setEditingDetailId(null);
    setEditForm({ detailType: 'EMAIL', value: '', label: '', isPrimary: false });
  };

  const renderDetailRow = (detail: ContactDetail, isContactLevel: boolean = false) => {
    const config = detailTypeConfig[detail.detailType];
    const Icon = config.icon;
    const isEditing = editingDetailId === detail.id;

    if (isEditing && canEdit) {
      return (
        <div key={detail.id} className="flex items-center gap-2 py-2 px-3 bg-surface-secondary rounded-lg">
          <select
            value={editForm.detailType}
            onChange={(e) => setEditForm(prev => ({ ...prev, detailType: e.target.value as ContactDetailType }))}
            className="input input-xs w-24"
          >
            {Object.entries(detailTypeConfig).map(([type, cfg]) => (
              <option key={type} value={type}>{cfg.label}</option>
            ))}
          </select>
          <input
            type="text"
            value={editForm.value}
            onChange={(e) => setEditForm(prev => ({ ...prev, value: e.target.value }))}
            className="input input-xs flex-1"
            placeholder="Value"
          />
          <input
            type="text"
            value={editForm.label}
            onChange={(e) => setEditForm(prev => ({ ...prev, label: e.target.value }))}
            className="input input-xs w-32"
            placeholder="Label"
            list="label-suggestions"
          />
          <button
            onClick={() => setEditForm(prev => ({ ...prev, isPrimary: !prev.isPrimary }))}
            className={`p-1 rounded ${editForm.isPrimary ? 'text-status-warning' : 'text-text-muted'}`}
            title={editForm.isPrimary ? 'Primary' : 'Set as primary'}
          >
            <Star className="w-3.5 h-3.5" fill={editForm.isPrimary ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={handleUpdateDetail}
            className="text-status-success hover:text-status-success/80"
            disabled={updateDetailMutation.isPending}
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={cancelEdit}
            className="text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      );
    }

    return (
      <div key={detail.id} className="flex items-center gap-2 py-1.5 group">
        <Icon className="w-4 h-4 text-text-tertiary" />
        <span className="text-sm text-text-primary flex-1">{detail.value}</span>
        {detail.label && (
          <span className="text-xs text-text-muted bg-surface-tertiary px-1.5 py-0.5 rounded">
            {detail.label}
          </span>
        )}
        {detail.isPrimary && (
          <Star className="w-3.5 h-3.5 text-status-warning" fill="currentColor" />
        )}
        {canEdit && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <button
              onClick={() => startEdit(detail)}
              className="text-text-muted hover:text-oak-light p-1"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDeleteDetail(detail.id)}
              className="text-text-muted hover:text-status-error p-1"
              title="Delete"
              disabled={deleteDetailMutation.isPending}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderContactCard = (item: ContactWithDetails) => {
    const isExpanded = expandedContacts.has(item.contact.id);
    const hasDetails = item.details.length > 0 || item.contact.email || item.contact.phone;

    return (
      <div key={item.contact.id} className="border border-border-secondary rounded-lg overflow-hidden">
        <div
          className="flex items-center gap-3 p-3 bg-surface-secondary cursor-pointer hover:bg-surface-tertiary transition-colors"
          onClick={() => toggleContact(item.contact.id)}
        >
          {hasDetails ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-text-tertiary" />
            ) : (
              <ChevronRight className="w-4 h-4 text-text-tertiary" />
            )
          ) : (
            <div className="w-4" />
          )}
          {item.contact.contactType === 'CORPORATE' ? (
            <Building2 className="w-4 h-4 text-text-tertiary" />
          ) : (
            <User className="w-4 h-4 text-text-tertiary" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary truncate">{item.contact.fullName}</span>
              {item.contact.relationship && (
                <span className="text-xs text-text-muted bg-surface-tertiary px-1.5 py-0.5 rounded">
                  {item.contact.relationship}
                </span>
              )}
            </div>
          </div>
          <span className="text-xs text-text-tertiary">
            {(item.details.length || 0) + (item.contact.email ? 1 : 0) + (item.contact.phone ? 1 : 0)} details
          </span>
        </div>

        {isExpanded && hasDetails && (
          <div className="p-3 border-t border-border-secondary space-y-1">
            {/* Primary email/phone from contact */}
            {item.contact.email && (
              <div className="flex items-center gap-2 py-1.5">
                <Mail className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm text-text-primary flex-1">{item.contact.email}</span>
                <span className="text-xs text-text-muted bg-surface-tertiary px-1.5 py-0.5 rounded">Primary</span>
                <Star className="w-3.5 h-3.5 text-status-warning" fill="currentColor" />
              </div>
            )}
            {item.contact.phone && (
              <div className="flex items-center gap-2 py-1.5">
                <Phone className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm text-text-primary flex-1">{item.contact.phone}</span>
                <span className="text-xs text-text-muted bg-surface-tertiary px-1.5 py-0.5 rounded">Primary</span>
                <Star className="w-3.5 h-3.5 text-status-warning" fill="currentColor" />
              </div>
            )}
            {/* Additional contact details */}
            {item.details.map((detail) => renderDetailRow(detail, true))}

            {/* Add detail to this contact */}
            {canEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedContactId(item.contact.id);
                  setAddDetailMode('contact');
                  setShowAddDetailForm(true);
                }}
                className="flex items-center gap-1.5 text-xs text-oak-light hover:text-oak-dark mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Add contact detail
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Contact Details"
      size="4xl"
    >
      <ModalBody className="max-h-[70vh] overflow-y-auto">
        {/* Label suggestions datalist */}
        <datalist id="label-suggestions">
          {labelSuggestions.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>

        <div className="space-y-6">
          {/* Company Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-text-primary">{companyName}</h3>
              <p className="text-sm text-text-secondary">
                Manage contact details for this company and linked contacts
              </p>
            </div>
            {canEdit && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAddDetailMode('company');
                    setSelectedContactId(null);
                    setShowAddDetailForm(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Detail
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowAddContactForm(true)}
                >
                  <User className="w-4 h-4 mr-1.5" />
                  Add Contact
                </Button>
              </div>
            )}
          </div>

          {isLoading && (
            <div className="py-8 text-center text-text-secondary">
              Loading contact details...
            </div>
          )}

          {error && (
            <div className="py-8 text-center text-status-error">
              {error instanceof Error ? error.message : 'Failed to load contact details'}
            </div>
          )}

          {data && (
            <>
              {/* Company-level Contact Details */}
              <div className="card">
                <div className="p-4 border-b border-border-primary">
                  <h4 className="font-medium text-text-primary flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-text-tertiary" />
                    Company Contact Details
                  </h4>
                  <p className="text-xs text-text-secondary mt-1">
                    Contact information directly associated with the company
                  </p>
                </div>
                <div className="p-4">
                  {data.companyDetails.length > 0 ? (
                    <div className="space-y-1">
                      {data.companyDetails.map((detail) => renderDetailRow(detail))}
                    </div>
                  ) : (
                    <p className="text-sm text-text-muted">No company-level contact details</p>
                  )}
                </div>
              </div>

              {/* Linked Contacts */}
              <div className="card">
                <div className="p-4 border-b border-border-primary">
                  <h4 className="font-medium text-text-primary flex items-center gap-2">
                    <User className="w-4 h-4 text-text-tertiary" />
                    Linked Contacts
                  </h4>
                  <p className="text-xs text-text-secondary mt-1">
                    Directors, officers, shareholders, and other contacts linked to this company
                  </p>
                </div>
                <div className="p-4 space-y-3">
                  {data.contactDetails.length > 0 ? (
                    data.contactDetails.map((item) => renderContactCard(item))
                  ) : (
                    <p className="text-sm text-text-muted">No linked contacts</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Add Detail Form Modal */}
        {showAddDetailForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-surface-primary rounded-xl shadow-xl w-full max-w-md p-6">
              <h3 className="text-lg font-medium text-text-primary mb-4">
                Add Contact Detail
                {addDetailMode === 'contact' && selectedContactId && (
                  <span className="text-sm font-normal text-text-secondary ml-2">
                    to contact
                  </span>
                )}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="label">Type</label>
                  <select
                    value={newDetailForm.detailType}
                    onChange={(e) => setNewDetailForm(prev => ({ ...prev, detailType: e.target.value as ContactDetailType }))}
                    className="input input-sm w-full"
                  >
                    {Object.entries(detailTypeConfig).map(([type, cfg]) => (
                      <option key={type} value={type}>{cfg.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Value</label>
                  <input
                    type="text"
                    value={newDetailForm.value}
                    onChange={(e) => setNewDetailForm(prev => ({ ...prev, value: e.target.value }))}
                    className="input input-sm w-full"
                    placeholder={newDetailForm.detailType === 'EMAIL' ? 'email@example.com' : '+65 1234 5678'}
                  />
                </div>
                <div>
                  <label className="label">Label (Optional)</label>
                  <input
                    type="text"
                    value={newDetailForm.label}
                    onChange={(e) => setNewDetailForm(prev => ({ ...prev, label: e.target.value }))}
                    className="input input-sm w-full"
                    placeholder="e.g., Account Receivable, Main Office"
                    list="label-suggestions"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPrimary"
                    checked={newDetailForm.isPrimary}
                    onChange={(e) => setNewDetailForm(prev => ({ ...prev, isPrimary: e.target.checked }))}
                    className="checkbox"
                  />
                  <label htmlFor="isPrimary" className="text-sm text-text-secondary cursor-pointer">
                    Set as primary for this type
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddDetailForm(false);
                    setNewDetailForm({ detailType: 'EMAIL', value: '', label: '', isPrimary: false });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAddDetail}
                  disabled={createDetailMutation.isPending}
                >
                  {createDetailMutation.isPending ? 'Adding...' : 'Add Detail'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Add Contact Form Modal */}
        {showAddContactForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-surface-primary rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-medium text-text-primary mb-4">Add New Contact</h3>
              <div className="space-y-4">
                {/* Contact Type */}
                <div>
                  <label className="label">Contact Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={newContactForm.contactType === 'INDIVIDUAL'}
                        onChange={() => setNewContactForm(prev => ({ ...prev, contactType: 'INDIVIDUAL' }))}
                        className="radio"
                      />
                      <User className="w-4 h-4 text-text-tertiary" />
                      <span className="text-sm">Individual</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={newContactForm.contactType === 'CORPORATE'}
                        onChange={() => setNewContactForm(prev => ({ ...prev, contactType: 'CORPORATE' }))}
                        className="radio"
                      />
                      <Building2 className="w-4 h-4 text-text-tertiary" />
                      <span className="text-sm">Corporate</span>
                    </label>
                  </div>
                </div>

                {/* Name fields */}
                {newContactForm.contactType === 'INDIVIDUAL' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">First Name</label>
                      <input
                        type="text"
                        value={newContactForm.firstName}
                        onChange={(e) => setNewContactForm(prev => ({ ...prev, firstName: e.target.value }))}
                        className="input input-sm w-full"
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <label className="label">Last Name</label>
                      <input
                        type="text"
                        value={newContactForm.lastName}
                        onChange={(e) => setNewContactForm(prev => ({ ...prev, lastName: e.target.value }))}
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
                      value={newContactForm.corporateName}
                      onChange={(e) => setNewContactForm(prev => ({ ...prev, corporateName: e.target.value }))}
                      className="input input-sm w-full"
                      placeholder="Company name"
                    />
                  </div>
                )}

                {/* Relationship */}
                <div>
                  <label className="label">Relationship</label>
                  <select
                    value={newContactForm.relationship}
                    onChange={(e) => setNewContactForm(prev => ({ ...prev, relationship: e.target.value }))}
                    className="input input-sm w-full"
                  >
                    <option value="">Select relationship...</option>
                    <option value="Agent">Agent</option>
                    <option value="Authorized Representative">Authorized Representative</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Lawyer">Lawyer</option>
                    <option value="Consultant">Consultant</option>
                    <option value="Vendor">Vendor</option>
                    <option value="Customer">Customer</option>
                    <option value="Partner">Partner</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Primary contact info */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Email</label>
                    <input
                      type="email"
                      value={newContactForm.email}
                      onChange={(e) => setNewContactForm(prev => ({ ...prev, email: e.target.value }))}
                      className="input input-sm w-full"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input
                      type="tel"
                      value={newContactForm.phone}
                      onChange={(e) => setNewContactForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="input input-sm w-full"
                      placeholder="+65 1234 5678"
                    />
                  </div>
                </div>

                {/* Additional contact details */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Additional Contact Details</label>
                    <button
                      type="button"
                      onClick={() => setNewContactForm(prev => ({
                        ...prev,
                        details: [...prev.details, { detailType: 'EMAIL' as ContactDetailType, value: '', label: '' }],
                      }))}
                      className="text-xs text-oak-light hover:text-oak-dark flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>
                  {newContactForm.details.map((detail, index) => (
                    <div key={index} className="flex items-center gap-2 mb-2">
                      <select
                        value={detail.detailType}
                        onChange={(e) => {
                          const newDetails = [...newContactForm.details];
                          newDetails[index].detailType = e.target.value as ContactDetailType;
                          setNewContactForm(prev => ({ ...prev, details: newDetails }));
                        }}
                        className="input input-xs w-24"
                      >
                        {Object.entries(detailTypeConfig).map(([type, cfg]) => (
                          <option key={type} value={type}>{cfg.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={detail.value}
                        onChange={(e) => {
                          const newDetails = [...newContactForm.details];
                          newDetails[index].value = e.target.value;
                          setNewContactForm(prev => ({ ...prev, details: newDetails }));
                        }}
                        className="input input-xs flex-1"
                        placeholder="Value"
                      />
                      <input
                        type="text"
                        value={detail.label}
                        onChange={(e) => {
                          const newDetails = [...newContactForm.details];
                          newDetails[index].label = e.target.value;
                          setNewContactForm(prev => ({ ...prev, details: newDetails }));
                        }}
                        className="input input-xs w-24"
                        placeholder="Label"
                        list="label-suggestions"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newDetails = newContactForm.details.filter((_, i) => i !== index);
                          setNewContactForm(prev => ({ ...prev, details: newDetails }));
                        }}
                        className="text-text-muted hover:text-status-error p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddContactForm(false);
                    setNewContactForm({
                      contactType: 'INDIVIDUAL',
                      firstName: '',
                      lastName: '',
                      corporateName: '',
                      email: '',
                      phone: '',
                      relationship: '',
                      details: [],
                    });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAddContact}
                  disabled={createContactMutation.isPending}
                >
                  {createContactMutation.isPending ? 'Creating...' : 'Create Contact'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
