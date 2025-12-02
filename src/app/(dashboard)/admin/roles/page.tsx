'use client';

import { useState } from 'react';
import { useSession } from '@/hooks/use-auth';
import { useCurrentTenantRoles, type Role } from '@/hooks/use-admin';
import { Alert } from '@/components/ui/alert';
import { Shield, Users, Check, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

// Group permissions by resource
function groupPermissionsByResource(permissions: Array<{ permission: { resource: string; action: string } }>) {
  const grouped: Record<string, string[]> = {};

  for (const { permission } of permissions) {
    if (!grouped[permission.resource]) {
      grouped[permission.resource] = [];
    }
    grouped[permission.resource].push(permission.action);
  }

  return grouped;
}

const RESOURCE_LABELS: Record<string, string> = {
  tenant: 'Tenant Settings',
  user: 'User Management',
  role: 'Role Management',
  company: 'Companies',
  contact: 'Contacts',
  document: 'Documents',
  officer: 'Officers',
  shareholder: 'Shareholders',
  audit_log: 'Audit Logs',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Create',
  read: 'Read',
  update: 'Update',
  delete: 'Delete',
  export: 'Export',
  import: 'Import',
  manage: 'Manage',
};

function RoleCard({ role }: { role: Role }) {
  const [expanded, setExpanded] = useState(false);
  const groupedPermissions = groupPermissionsByResource(role.permissions);
  const resourceCount = Object.keys(groupedPermissions).length;
  const permissionCount = role.permissions.length;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-background-tertiary/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-oak-primary/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-oak-light" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-text-primary">{role.name}</h3>
                {role.isSystem && (
                  <span className="badge bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    <Lock className="w-3 h-3 mr-1" />
                    System
                  </span>
                )}
              </div>
              {role.description && (
                <p className="text-sm text-text-secondary mt-0.5">{role.description}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {role._count.users} {role._count.users === 1 ? 'user' : 'users'}
                </span>
                <span>{permissionCount} permissions</span>
                <span>{resourceCount} resources</span>
              </div>
            </div>
          </div>
          <button className="p-1 hover:bg-background-tertiary rounded">
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-text-muted" />
            ) : (
              <ChevronDown className="w-5 h-5 text-text-muted" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Permissions */}
      {expanded && (
        <div className="border-t border-border-primary p-4 bg-background-tertiary/20">
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
            Permissions
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(groupedPermissions).map(([resource, actions]) => (
              <div key={resource} className="bg-background-secondary rounded-lg p-3 border border-border-primary">
                <div className="font-medium text-sm text-text-primary mb-2">
                  {RESOURCE_LABELS[resource] || resource}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {actions.map((action) => (
                    <span
                      key={action}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    >
                      <Check className="w-3 h-3" />
                      {ACTION_LABELS[action] || action}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RolesPage() {
  const { data: session } = useSession();
  const { data: roles, isLoading, error } = useCurrentTenantRoles();

  const canManageRoles = session?.role === 'SUPER_ADMIN' || session?.role === 'TENANT_ADMIN';

  if (!canManageRoles) {
    return (
      <div className="p-4 sm:p-6">
        <Alert variant="error">You do not have permission to access this page.</Alert>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary flex items-center gap-2">
          <Shield className="w-6 h-6" />
          Roles & Permissions
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          View and manage roles in your organization
        </p>
      </div>

      {/* Info Alert */}
      <Alert variant="info" className="mb-6">
        System roles are automatically created for each tenant and cannot be modified.
        Custom role creation is coming soon.
      </Alert>

      {/* Error State */}
      {error && (
        <Alert variant="error" className="mb-4">
          {error instanceof Error ? error.message : 'Failed to load roles'}
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12 text-text-secondary">Loading roles...</div>
      )}

      {/* Roles List */}
      {roles && (
        <div className="space-y-4">
          {roles.length === 0 ? (
            <div className="text-center py-12 text-text-secondary">
              No roles found
            </div>
          ) : (
            roles.map((role: Role) => <RoleCard key={role.id} role={role} />)
          )}
        </div>
      )}

      {/* Permission Legend */}
      <div className="mt-8 card p-4">
        <h3 className="text-sm font-medium text-text-primary mb-3">Permission Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="font-medium text-text-primary">Create:</span>
            <span className="text-text-secondary ml-1">Add new records</span>
          </div>
          <div>
            <span className="font-medium text-text-primary">Read:</span>
            <span className="text-text-secondary ml-1">View records</span>
          </div>
          <div>
            <span className="font-medium text-text-primary">Update:</span>
            <span className="text-text-secondary ml-1">Modify records</span>
          </div>
          <div>
            <span className="font-medium text-text-primary">Delete:</span>
            <span className="text-text-secondary ml-1">Remove records</span>
          </div>
          <div>
            <span className="font-medium text-text-primary">Export:</span>
            <span className="text-text-secondary ml-1">Export data</span>
          </div>
          <div>
            <span className="font-medium text-text-primary">Import:</span>
            <span className="text-text-secondary ml-1">Import data</span>
          </div>
          <div>
            <span className="font-medium text-text-primary">Manage:</span>
            <span className="text-text-secondary ml-1">Full control</span>
          </div>
        </div>
      </div>
    </div>
  );
}
