'use client';

import { useState } from 'react';
import { Mail, Phone, Plus, X, Building2, User, Loader2 } from 'lucide-react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { ContactDetailType } from '@/generated/prisma';
import type { CreateContactWithDetailsInput } from '@/hooks/use-contact-details';
import { detailTypeConfig, labelSuggestions, relationshipOptions } from './types';

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateContactWithDetailsInput) => Promise<void>;
  isLoading: boolean;
}

export function AddContactModal({ isOpen, onClose, onSubmit, isLoading }: AddContactModalProps) {
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
