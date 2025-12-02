'use client';

import { Alert } from '@/components/ui/alert';
import { Check, Building, User, Building2, AlertTriangle } from 'lucide-react';
import type { SetupTenantInfoInput, SetupAdminUserInput, SetupFirstCompanyInput } from '@/lib/validations/tenant';

interface StepReviewActivateProps {
  tenantName: string;
  tenantInfo: SetupTenantInfoInput;
  adminUser: SetupAdminUserInput | null;
  firstCompany: SetupFirstCompanyInput | null;
  isCompanySkipped: boolean;
}

function ReviewItem({
  icon,
  title,
  items,
  isComplete,
}: {
  icon: React.ReactNode;
  title: string;
  items: { label: string; value: string | null | undefined }[];
  isComplete: boolean;
}) {
  const filteredItems = items.filter((item) => item.value);

  return (
    <div className="p-4 rounded-lg border border-border-secondary bg-background-secondary">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-text-secondary">{icon}</div>
          <h4 className="font-medium text-text-primary">{title}</h4>
        </div>
        {isComplete && (
          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <Check className="w-4 h-4" />
            <span className="text-xs font-medium">Complete</span>
          </div>
        )}
      </div>
      {filteredItems.length > 0 ? (
        <dl className="space-y-1">
          {filteredItems.map((item) => (
            <div key={item.label} className="flex text-sm">
              <dt className="w-28 flex-shrink-0 text-text-muted">{item.label}:</dt>
              <dd className="text-text-primary">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-text-muted">No details provided</p>
      )}
    </div>
  );
}

export function StepReviewActivate({
  tenantName,
  tenantInfo,
  adminUser,
  firstCompany,
  isCompanySkipped,
}: StepReviewActivateProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-text-primary mb-1">Review & Activate</h3>
        <p className="text-sm text-text-secondary">
          Review the setup details before activating the tenant.
        </p>
      </div>

      <Alert variant="warning" className="text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Ready to Activate</p>
            <p className="mt-1 text-text-secondary">
              Once activated, the tenant will change from <strong>Pending Setup</strong> to{' '}
              <strong>Active</strong> status. The admin user will be able to log in and start using
              the system.
            </p>
          </div>
        </div>
      </Alert>

      <div className="space-y-4">
        {/* Tenant Info Review */}
        <ReviewItem
          icon={<Building className="w-4 h-4" />}
          title="Tenant Information"
          isComplete={true}
          items={[
            { label: 'Name', value: tenantInfo.name || tenantName },
            { label: 'Email', value: tenantInfo.contactEmail },
            { label: 'Phone', value: tenantInfo.contactPhone },
          ]}
        />

        {/* Admin User Review */}
        <ReviewItem
          icon={<User className="w-4 h-4" />}
          title="Tenant Administrator"
          isComplete={!!adminUser?.email}
          items={[
            { label: 'Email', value: adminUser?.email },
            { label: 'Name', value: adminUser ? `${adminUser.firstName} ${adminUser.lastName}` : null },
            { label: 'Role', value: 'TENANT_ADMIN' },
          ]}
        />

        {/* Company Review */}
        <ReviewItem
          icon={<Building2 className="w-4 h-4" />}
          title="First Company"
          isComplete={isCompanySkipped || !!firstCompany?.uen}
          items={
            isCompanySkipped
              ? [{ label: 'Status', value: 'Skipped - will create later' }]
              : [
                  { label: 'UEN', value: firstCompany?.uen },
                  { label: 'Name', value: firstCompany?.name },
                  { label: 'Type', value: firstCompany?.entityType?.replace(/_/g, ' ') },
                ]
          }
        />
      </div>

      {/* Summary */}
      <div className="p-4 rounded-lg bg-oak-primary/10 border border-oak-primary/20">
        <h4 className="font-medium text-oak-primary mb-2">What happens next?</h4>
        <ul className="text-sm text-text-secondary space-y-1.5">
          <li className="flex items-start gap-2">
            <span className="text-oak-primary mt-0.5">1.</span>
            <span>Tenant status changes to <strong>Active</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-oak-primary mt-0.5">2.</span>
            <span>Admin user is created with a temporary password</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-oak-primary mt-0.5">3.</span>
            <span>Admin can log in and must change password on first login</span>
          </li>
          {!isCompanySkipped && firstCompany && (
            <li className="flex items-start gap-2">
              <span className="text-oak-primary mt-0.5">4.</span>
              <span>First company &quot;{firstCompany.name}&quot; is created</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
