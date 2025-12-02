'use client';

import { FormInput } from '@/components/ui/form-input';
import { Mail, Phone, Building } from 'lucide-react';
import type { SetupTenantInfoInput } from '@/lib/validations/tenant';

interface StepTenantInfoProps {
  data: SetupTenantInfoInput;
  onChange: (data: SetupTenantInfoInput) => void;
  errors?: Record<string, string>;
}

export function StepTenantInfo({ data, onChange, errors }: StepTenantInfoProps) {
  const handleChange = (field: keyof SetupTenantInfoInput, value: string) => {
    onChange({ ...data, [field]: value || null });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-text-primary mb-1">Tenant Information</h3>
        <p className="text-sm text-text-secondary">
          Review and update the tenant details. These can be changed later.
        </p>
      </div>

      <div className="space-y-4">
        {/* Tenant Name */}
        <FormInput
          label="Tenant Name"
          value={data.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="Acme Accounting Services"
          leftIcon={<Building className="w-4 h-4" />}
          inputSize="sm"
          error={errors?.name}
        />

        {/* Contact Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="Contact Email"
            type="email"
            value={data.contactEmail || ''}
            onChange={(e) => handleChange('contactEmail', e.target.value)}
            placeholder="admin@company.com"
            leftIcon={<Mail className="w-4 h-4" />}
            inputSize="sm"
            error={errors?.contactEmail}
          />
          <FormInput
            label="Contact Phone"
            value={data.contactPhone || ''}
            onChange={(e) => handleChange('contactPhone', e.target.value)}
            placeholder="+65 6123 4567"
            leftIcon={<Phone className="w-4 h-4" />}
            inputSize="sm"
            error={errors?.contactPhone}
          />
        </div>
      </div>
    </div>
  );
}
