'use client';

import { FormInput } from '@/components/ui/form-input';
import { Alert } from '@/components/ui/alert';
import { Building2, Hash, Info } from 'lucide-react';
import type { SetupFirstCompanyInput } from '@/lib/validations/tenant';

const ENTITY_TYPES = [
  { value: 'PRIVATE_LIMITED', label: 'Private Limited Company' },
  { value: 'PUBLIC_LIMITED', label: 'Public Limited Company' },
  { value: 'SOLE_PROPRIETORSHIP', label: 'Sole Proprietorship' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'LIMITED_PARTNERSHIP', label: 'Limited Partnership' },
  { value: 'LIMITED_LIABILITY_PARTNERSHIP', label: 'Limited Liability Partnership (LLP)' },
  { value: 'FOREIGN_COMPANY', label: 'Foreign Company' },
  { value: 'VARIABLE_CAPITAL_COMPANY', label: 'Variable Capital Company' },
  { value: 'OTHER', label: 'Other' },
];

interface StepCreateCompanyProps {
  data: SetupFirstCompanyInput | null;
  onChange: (data: SetupFirstCompanyInput | null) => void;
  errors?: Record<string, string>;
  isSkipped: boolean;
  onSkipChange: (skipped: boolean) => void;
}

export function StepCreateCompany({
  data,
  onChange,
  errors,
  isSkipped,
  onSkipChange,
}: StepCreateCompanyProps) {
  const handleChange = (field: keyof SetupFirstCompanyInput, value: string) => {
    if (isSkipped) return;
    onChange({
      uen: data?.uen || '',
      name: data?.name || '',
      entityType: data?.entityType || 'PRIVATE_LIMITED',
      [field]: value,
    });
  };

  const handleSkipToggle = () => {
    if (!isSkipped) {
      onChange(null);
    }
    onSkipChange(!isSkipped);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-text-primary mb-1">Create First Company</h3>
        <p className="text-sm text-text-secondary">
          Optionally create the first company for this tenant. You can skip this and create companies later.
        </p>
      </div>

      {/* Skip Option */}
      <div
        className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
          isSkipped
            ? 'border-oak-primary bg-oak-primary/5'
            : 'border-border-secondary hover:border-border-primary'
        }`}
        onClick={handleSkipToggle}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              isSkipped ? 'border-oak-primary bg-oak-primary' : 'border-border-secondary'
            }`}
          >
            {isSkipped && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
          <div>
            <p className="font-medium text-text-primary">Skip this step</p>
            <p className="text-sm text-text-secondary">Create companies later from the dashboard</p>
          </div>
        </div>
      </div>

      {/* Company Form */}
      {!isSkipped && (
        <div className="space-y-4">
          <Alert variant="info" className="text-sm">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                Enter the company's Unique Entity Number (UEN) and basic details.
                Additional information can be added later.
              </p>
            </div>
          </Alert>

          <FormInput
            label="UEN (Unique Entity Number)"
            value={data?.uen || ''}
            onChange={(e) => handleChange('uen', e.target.value.toUpperCase())}
            placeholder="202312345A"
            leftIcon={<Hash className="w-4 h-4" />}
            inputSize="sm"
            error={errors?.uen}
            required
            hint="9-10 character alphanumeric identifier"
          />

          <FormInput
            label="Company Name"
            value={data?.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Acme Pte. Ltd."
            leftIcon={<Building2 className="w-4 h-4" />}
            inputSize="sm"
            error={errors?.name}
            required
          />

          <div>
            <label className="label">Entity Type</label>
            <select
              value={data?.entityType || 'PRIVATE_LIMITED'}
              onChange={(e) => handleChange('entityType', e.target.value)}
              className="input input-sm w-full"
            >
              {ENTITY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {errors?.entityType && (
              <p className="mt-1 text-sm text-status-error">{errors.entityType}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
