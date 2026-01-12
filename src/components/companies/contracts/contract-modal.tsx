'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { SingleDateInput } from '@/components/ui/single-date-input';
import type { Contract, CreateContractInput, UpdateContractInput } from '@/hooks/use-contracts';
import { CONTRACT_TYPES, CONTRACT_STATUSES, getContractTypeLabel } from '@/lib/constants/contracts';
import type { ContractType, ContractStatus } from '@/generated/prisma';

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract?: Contract | null;
  companyId: string;
  onSubmit: (data: CreateContractInput | UpdateContractInput) => Promise<void>;
  isLoading?: boolean;
}

// Format start date for display in title: "11 January 2026"
function formatTitleDate(dateString: string): string {
  if (!dateString) return '';
  const parsed = parse(dateString, 'yyyy-MM-dd', new Date());
  return isValid(parsed) ? format(parsed, 'd MMMM yyyy') : '';
}

export function ContractModal({
  isOpen,
  onClose,
  contract,
  companyId: _companyId,
  onSubmit,
  isLoading,
}: ContractModalProps) {
  const isEditing = !!contract;

  const [formData, setFormData] = useState<{
    title: string;
    contractType: ContractType;
    status: ContractStatus;
    startDate: string;
    signedDate: string;
    internalNotes: string;
  }>({
    title: '',
    contractType: 'SERVICE_AGREEMENT',
    status: 'DRAFT',
    startDate: new Date().toISOString().split('T')[0],
    signedDate: '',
    internalNotes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate dynamic placeholder based on contract type and start date
  const titlePlaceholder = useMemo(() => {
    const typeLabel = getContractTypeLabel(formData.contractType);
    const dateLabel = formData.startDate ? formatTitleDate(formData.startDate) : '[Start Date]';
    return `${typeLabel} - ${dateLabel}`;
  }, [formData.contractType, formData.startDate]);

  // Generate auto title when saving if title is empty
  const generateAutoTitle = () => {
    const typeLabel = getContractTypeLabel(formData.contractType);
    const dateLabel = formData.startDate ? formatTitleDate(formData.startDate) : '';
    return dateLabel ? `${typeLabel} - ${dateLabel}` : typeLabel;
  };

  useEffect(() => {
    if (contract) {
      setFormData({
        title: contract.title,
        contractType: contract.contractType,
        status: contract.status,
        startDate: contract.startDate.split('T')[0],
        signedDate: contract.signedDate?.split('T')[0] || '',
        internalNotes: contract.internalNotes || '',
      });
    } else {
      setFormData({
        title: '',
        contractType: 'SERVICE_AGREEMENT',
        status: 'DRAFT',
        startDate: new Date().toISOString().split('T')[0],
        signedDate: '',
        internalNotes: '',
      });
    }
    setErrors({});
  }, [contract, isOpen]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    // Title validation removed - will auto-generate if empty

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    // Use entered title or auto-generate if empty
    const finalTitle = formData.title.trim() || generateAutoTitle();

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: finalTitle,
        contractType: formData.contractType,
        status: formData.status,
        startDate: formData.startDate,
        signedDate: formData.signedDate || null,
        internalNotes: formData.internalNotes.trim() || null,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitting = isSubmitting || isLoading;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Contract' : 'New Contract'}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-4">
          {/* Title */}
          <FormInput
            label="Contract Title"
            value={formData.title}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, title: e.target.value }))
            }
            placeholder={titlePlaceholder}
            error={errors.title}
            disabled={submitting}
            hint="Leave empty to auto-generate from contract type and start date"
          />

          {/* Contract Type & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Contract Type
              </label>
              <select
                value={formData.contractType}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    contractType: e.target.value as typeof formData.contractType,
                  }))
                }
                className="input input-sm w-full"
                disabled={submitting}
              >
                {CONTRACT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: e.target.value as typeof formData.status,
                  }))
                }
                className="input input-sm w-full"
                disabled={submitting}
              >
                {CONTRACT_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SingleDateInput
              label="Start Date"
              value={formData.startDate}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, startDate: value }))
              }
              error={errors.startDate}
              required
              disabled={submitting}
            />

            <SingleDateInput
              label="Signed Date"
              value={formData.signedDate}
              onChange={(value) =>
                setFormData((prev) => ({ ...prev, signedDate: value }))
              }
              disabled={submitting}
            />
          </div>

          {/* Internal Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">
              Internal Notes
            </label>
            <textarea
              value={formData.internalNotes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, internalNotes: e.target.value }))
              }
              className="w-full px-3 py-2 text-sm border border-border-primary rounded-lg bg-background-primary dark:bg-background-secondary text-text-primary placeholder-text-muted focus:outline-none focus:border-oak-primary focus:ring-1 focus:ring-oak-primary resize-none"
              rows={5}
              placeholder="Optional notes about this contract..."
              disabled={submitting}
            />
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? 'Update Contract' : 'Create Contract'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
