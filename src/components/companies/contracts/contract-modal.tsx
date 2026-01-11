'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import type { Contract, CreateContractInput, UpdateContractInput } from '@/hooks/use-contracts';
import { CONTRACT_TYPES, CONTRACT_STATUSES } from '@/lib/constants/contracts';
import type { ContractType, ContractStatus } from '@/generated/prisma';

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract?: Contract | null;
  companyId: string;
  onSubmit: (data: CreateContractInput | UpdateContractInput) => Promise<void>;
  isLoading?: boolean;
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
    contractType: 'OTHER',
    status: 'DRAFT',
    startDate: new Date().toISOString().split('T')[0],
    signedDate: '',
    internalNotes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        contractType: 'OTHER',
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

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: formData.title.trim(),
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Contract' : 'New Contract'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <FormInput
          label="Contract Title"
          value={formData.title}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, title: e.target.value }))
          }
          placeholder="e.g., Annual Engagement 2024"
          error={errors.title}
          required
        />

        {/* Contract Type & Status */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
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
              className="w-full px-3 py-2 border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-oak-light"
            >
              {CONTRACT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
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
              className="w-full px-3 py-2 border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-oak-light"
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
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            label="Start Date"
            type="date"
            value={formData.startDate}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, startDate: e.target.value }))
            }
            error={errors.startDate}
            required
          />

          <FormInput
            label="Signed Date"
            type="date"
            value={formData.signedDate}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, signedDate: e.target.value }))
            }
          />
        </div>

        {/* Internal Notes */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Internal Notes
          </label>
          <textarea
            value={formData.internalNotes}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, internalNotes: e.target.value }))
            }
            className="w-full px-3 py-2 border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-oak-light"
            rows={3}
            placeholder="Optional notes about this contract..."
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border-primary">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting || isLoading}
          >
            {isEditing ? 'Update Contract' : 'Create Contract'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
