'use client';

import { FormInput } from '@/components/ui/form-input';
import { Alert } from '@/components/ui/alert';
import { Mail, User, Shield } from 'lucide-react';
import type { SetupAdminUserInput } from '@/lib/validations/tenant';

interface StepCreateAdminProps {
  data: SetupAdminUserInput | null;
  onChange: (data: SetupAdminUserInput) => void;
  errors?: Record<string, string>;
}

export function StepCreateAdmin({ data, onChange, errors }: StepCreateAdminProps) {
  const handleChange = (field: keyof SetupAdminUserInput, value: string) => {
    onChange({
      email: data?.email || '',
      firstName: data?.firstName || '',
      lastName: data?.lastName || '',
      [field]: value,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-text-primary mb-1">Create Tenant Administrator</h3>
        <p className="text-sm text-text-secondary">
          Create the first admin user for this tenant. They will have full access to manage the tenant.
        </p>
      </div>

      <Alert variant="info" className="text-sm">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Tenant Administrator Role</p>
            <p className="mt-1 text-text-secondary">
              This user will be assigned the <strong>TENANT_ADMIN</strong> role with permissions to:
            </p>
            <ul className="mt-2 list-disc list-inside text-text-secondary space-y-0.5">
              <li>Manage users and invite new team members</li>
              <li>Create and manage companies</li>
              <li>Configure tenant settings</li>
              <li>View audit logs and reports</li>
            </ul>
          </div>
        </div>
      </Alert>

      <div className="space-y-4">
        <FormInput
          label="Email Address"
          type="email"
          value={data?.email || ''}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="admin@company.com"
          leftIcon={<Mail className="w-4 h-4" />}
          inputSize="sm"
          error={errors?.email}
          required
          hint="A temporary password will be generated for first login"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="First Name"
            value={data?.firstName || ''}
            onChange={(e) => handleChange('firstName', e.target.value)}
            placeholder="John"
            leftIcon={<User className="w-4 h-4" />}
            inputSize="sm"
            error={errors?.firstName}
            required
          />
          <FormInput
            label="Last Name"
            value={data?.lastName || ''}
            onChange={(e) => handleChange('lastName', e.target.value)}
            placeholder="Doe"
            leftIcon={<User className="w-4 h-4" />}
            inputSize="sm"
            error={errors?.lastName}
            required
          />
        </div>
      </div>
    </div>
  );
}
