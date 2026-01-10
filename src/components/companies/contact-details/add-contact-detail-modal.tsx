'use client';

import { useState } from 'react';
import { Building2, User, Star, Loader2 } from 'lucide-react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import type { ContactDetailType } from '@/generated/prisma';
import type { CreateContactDetailInput } from '@/hooks/use-contact-details';
import { AUTOMATION_PURPOSES } from '@/lib/constants/automation-purposes';
import { detailTypeConfig, labelSuggestions } from './types';

interface AddContactDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateContactDetailInput) => Promise<void>;
  isLoading: boolean;
  targetName: string;
  targetType: 'company' | 'contact';
  contactId?: string;
}

export function AddContactDetailModal({
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
