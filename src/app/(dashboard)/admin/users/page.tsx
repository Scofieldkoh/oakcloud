'use client';

import { useState } from 'react';
import { useSession } from '@/hooks/use-auth';
import {
  useCurrentTenantUsers,
  useTenantUsers,
  useTenants,
  useInviteUser,
  useUserCompanyAssignments,
  useAssignUserToCompany,
  useRemoveCompanyAssignment,
  type TenantUser,
  type UserCompanyAssignment,
} from '@/hooks/use-admin';
import { useCompanies } from '@/hooks/use-companies';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Alert } from '@/components/ui/alert';
import { Pagination } from '@/components/companies/pagination';
import { useToast } from '@/components/ui/toast';
import {
  Plus,
  Search,
  Mail,
  Shield,
  Building2,
  Calendar,
  User,
  MoreVertical,
  Trash2,
  Star,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@/components/ui/dropdown';

const USER_ROLES = [
  { value: 'TENANT_ADMIN', label: 'Tenant Admin', description: 'Full access to all tenant resources' },
  { value: 'COMPANY_ADMIN', label: 'Company Admin', description: 'Manage assigned company' },
  { value: 'COMPANY_USER', label: 'Company User', description: 'View-only access to assigned company' },
];

function getRoleBadgeClass(role: string) {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'TENANT_ADMIN':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'COMPANY_ADMIN':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
  }
}

function getRoleLabel(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export default function UsersPage() {
  const { data: session } = useSession();
  const { success, error: showError } = useToast();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [managingUser, setManagingUser] = useState<TenantUser | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<'VIEW' | 'EDIT' | 'MANAGE'>('VIEW');

  // For SUPER_ADMIN: tenant selection
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const isSuperAdmin = session?.role === 'SUPER_ADMIN';

  // Get active tenant ID (either from session or selection for SUPER_ADMIN)
  const activeTenantId = isSuperAdmin ? selectedTenantId : session?.tenantId;

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'COMPANY_USER',
    companyId: '',
  });
  const [formError, setFormError] = useState('');

  // Fetch tenants for SUPER_ADMIN
  const { data: tenantsData } = useTenants(
    isSuperAdmin ? { status: 'ACTIVE', limit: 100 } : undefined
  );

  // Use tenant-specific users query for SUPER_ADMIN, otherwise current tenant users
  const {
    data: tenantUsersData,
    isLoading: tenantUsersLoading,
    error: tenantUsersError,
  } = useTenantUsers(
    isSuperAdmin ? selectedTenantId : undefined,
    {
      query: search || undefined,
      role: roleFilter || undefined,
      page,
      limit: 20,
    }
  );

  const {
    data: currentTenantData,
    isLoading: currentTenantLoading,
    error: currentTenantError,
  } = useCurrentTenantUsers({
    query: search || undefined,
    role: roleFilter || undefined,
    page,
    limit: 20,
  });

  // Use the appropriate data based on role
  const data = isSuperAdmin ? tenantUsersData : currentTenantData;
  const isLoading = isSuperAdmin ? tenantUsersLoading : currentTenantLoading;
  const error = isSuperAdmin ? tenantUsersError : currentTenantError;

  const { data: companiesData } = useCompanies({ limit: 100 });
  const inviteUser = useInviteUser(activeTenantId || undefined);

  // Company management hooks
  const { data: assignmentsData, isLoading: assignmentsLoading } = useUserCompanyAssignments(
    managingUser?.id
  );
  const assignCompany = useAssignUserToCompany(managingUser?.id);
  const removeAssignment = useRemoveCompanyAssignment(managingUser?.id);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.email || !formData.firstName || !formData.lastName) {
      setFormError('Please fill in all required fields');
      return;
    }

    // Company is required for COMPANY_ADMIN and COMPANY_USER
    if ((formData.role === 'COMPANY_ADMIN' || formData.role === 'COMPANY_USER') && !formData.companyId) {
      setFormError('Please select a company for this role');
      return;
    }

    try {
      await inviteUser.mutateAsync({
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        companyId: formData.companyId || undefined,
      });

      success('User invited successfully');
      setIsInviteModalOpen(false);
      setFormData({
        email: '',
        firstName: '',
        lastName: '',
        role: 'COMPANY_USER',
        companyId: '',
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to invite user');
    }
  };

  // Check permissions
  const canManageUsers = session?.role === 'SUPER_ADMIN' || session?.role === 'TENANT_ADMIN';

  if (!canManageUsers) {
    return (
      <div className="p-4 sm:p-6">
        <Alert variant="error">You do not have permission to access this page.</Alert>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Users</h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage users in your organization
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsInviteModalOpen(true)}
          disabled={isSuperAdmin && !selectedTenantId}
        >
          Invite User
        </Button>
      </div>

      {/* Tenant Selector for SUPER_ADMIN */}
      {isSuperAdmin && (
        <div className="mb-6">
          <label className="label mb-2">Select Tenant</label>
          <select
            value={selectedTenantId}
            onChange={(e) => {
              setSelectedTenantId(e.target.value);
              setPage(1);
            }}
            className="input input-sm w-full sm:w-80"
          >
            <option value="">Select a tenant to manage users...</option>
            {tenantsData?.tenants?.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.slug})
              </option>
            ))}
          </select>
          {!selectedTenantId && (
            <p className="text-xs text-text-muted mt-1">
              As a Super Admin, you must select a tenant to view and manage its users.
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 max-w-md">
          <FormInput
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            leftIcon={<Search className="w-4 h-4" />}
            inputSize="sm"
            disabled={isSuperAdmin && !selectedTenantId}
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="input input-sm w-full sm:w-48"
          disabled={isSuperAdmin && !selectedTenantId}
        >
          <option value="">All Roles</option>
          {USER_ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error State */}
      {error && (
        <Alert variant="error" className="mb-4">
          {error instanceof Error ? error.message : 'Failed to load users'}
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12 text-text-secondary">Loading users...</div>
      )}

      {/* No Tenant Selected (SUPER_ADMIN only) */}
      {isSuperAdmin && !selectedTenantId && !isLoading && (
        <div className="card p-8 text-center">
          <Building2 className="w-12 h-12 mx-auto text-text-muted mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">Select a Tenant</h3>
          <p className="text-sm text-text-secondary max-w-md mx-auto">
            As a Super Admin, please select a tenant from the dropdown above to view and manage its users.
          </p>
        </div>
      )}

      {/* Users Table */}
      {data && (!isSuperAdmin || selectedTenantId) && (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Companies</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-text-secondary">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    data.users.map((user: TenantUser) => (
                      <tr key={user.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-oak-primary/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-oak-light text-xs font-medium">
                                {user.firstName[0]}{user.lastName[0]}
                              </span>
                            </div>
                            <div>
                              <div className="font-medium text-text-primary">
                                {user.firstName} {user.lastName}
                              </div>
                              <div className="text-xs text-text-secondary flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {user.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={cn('badge', getRoleBadgeClass(user.role))}>
                            <Shield className="w-3 h-3 mr-1" />
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td>
                          {user.company ? (
                            <div className="flex items-center gap-1 text-text-secondary">
                              <Building2 className="w-3.5 h-3.5" />
                              <span className="text-sm">{user.company.name}</span>
                            </div>
                          ) : (
                            <span className="text-text-muted text-sm">—</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={cn(
                              'badge',
                              user.isActive
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            )}
                          >
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          {user.lastLoginAt ? (
                            <div className="flex items-center gap-1 text-text-secondary text-sm">
                              <Calendar className="w-3.5 h-3.5" />
                              {format(new Date(user.lastLoginAt), 'MMM d, yyyy')}
                            </div>
                          ) : (
                            <span className="text-text-muted text-sm">Never</span>
                          )}
                        </td>
                        <td>
                          <Dropdown>
                            <DropdownTrigger asChild className="p-1.5 hover:bg-background-tertiary rounded">
                              <MoreVertical className="w-4 h-4 text-text-muted" />
                            </DropdownTrigger>
                            <DropdownMenu>
                              <DropdownItem
                                icon={<Building2 className="w-4 h-4" />}
                                onClick={() => setManagingUser(user)}
                              >
                                Manage Companies
                              </DropdownItem>
                            </DropdownMenu>
                          </Dropdown>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.totalCount}
                limit={data.limit}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {/* Invite User Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite User"
        size="md"
      >
        <form onSubmit={handleInvite}>
          <ModalBody>
            {formError && (
              <Alert variant="error" className="mb-4">
                {formError}
              </Alert>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormInput
                  label="First Name"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="John"
                  required
                  inputSize="sm"
                />
                <FormInput
                  label="Last Name"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Doe"
                  required
                  inputSize="sm"
                />
              </div>

              <FormInput
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@example.com"
                required
                inputSize="sm"
                leftIcon={<Mail className="w-4 h-4" />}
              />

              <div>
                <label className="label">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="input input-sm w-full"
                  required
                >
                  {USER_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-secondary mt-1">
                  {USER_ROLES.find((r) => r.value === formData.role)?.description}
                </p>
              </div>

              {(formData.role === 'COMPANY_ADMIN' || formData.role === 'COMPANY_USER') && (
                <div>
                  <label className="label">Company</label>
                  <select
                    value={formData.companyId}
                    onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                    className="input input-sm w-full"
                    required
                  >
                    <option value="">Select a company...</option>
                    {companiesData?.companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name} ({company.uen})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsInviteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={inviteUser.isPending}
              leftIcon={<User className="w-4 h-4" />}
            >
              Invite User
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Manage Companies Modal */}
      <Modal
        isOpen={!!managingUser}
        onClose={() => {
          setManagingUser(null);
          setSelectedCompanyId('');
          setSelectedAccessLevel('VIEW');
        }}
        title={`Manage Companies - ${managingUser?.firstName} ${managingUser?.lastName}`}
        size="lg"
      >
        <ModalBody>
          {/* Current Assignments */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-text-primary mb-3">Assigned Companies</h4>
            {assignmentsLoading ? (
              <p className="text-sm text-text-secondary">Loading...</p>
            ) : assignmentsData?.assignments && assignmentsData.assignments.length > 0 ? (
              <div className="space-y-2">
                {assignmentsData.assignments.map((assignment: UserCompanyAssignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="w-4 h-4 text-text-muted" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">
                            {assignment.company.name}
                          </span>
                          {assignment.isPrimary && (
                            <span className="badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                              <Star className="w-3 h-3 mr-1" />
                              Primary
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-text-muted">{assignment.company.uen}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'badge',
                          assignment.accessLevel === 'MANAGE'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                            : assignment.accessLevel === 'EDIT'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                        )}
                      >
                        {assignment.accessLevel}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await removeAssignment.mutateAsync(assignment.id);
                            success('Company removed');
                          } catch (err) {
                            showError(err instanceof Error ? err.message : 'Failed to remove');
                          }
                        }}
                        isLoading={removeAssignment.isPending}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted py-4 text-center">No companies assigned</p>
            )}
          </div>

          {/* Add New Assignment */}
          <div className="border-t border-border-primary pt-4">
            <h4 className="text-sm font-medium text-text-primary mb-3">Add Company</h4>
            <div className="flex gap-3">
              <div className="flex-1">
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="input input-sm w-full"
                >
                  <option value="">Select a company...</option>
                  {companiesData?.companies
                    .filter(
                      (c) =>
                        !assignmentsData?.assignments?.some(
                          (a: UserCompanyAssignment) => a.companyId === c.id
                        )
                    )
                    .map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name} ({company.uen})
                      </option>
                    ))}
                </select>
              </div>
              <div className="w-32">
                <select
                  value={selectedAccessLevel}
                  onChange={(e) =>
                    setSelectedAccessLevel(e.target.value as 'VIEW' | 'EDIT' | 'MANAGE')
                  }
                  className="input input-sm w-full"
                >
                  <option value="VIEW">View</option>
                  <option value="EDIT">Edit</option>
                  <option value="MANAGE">Manage</option>
                </select>
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={!selectedCompanyId}
                isLoading={assignCompany.isPending}
                onClick={async () => {
                  try {
                    await assignCompany.mutateAsync({
                      companyId: selectedCompanyId,
                      accessLevel: selectedAccessLevel,
                      isPrimary: !assignmentsData?.assignments?.length,
                    });
                    setSelectedCompanyId('');
                    success('Company assigned');
                  } catch (err) {
                    showError(err instanceof Error ? err.message : 'Failed to assign');
                  }
                }}
              >
                Add
              </Button>
            </div>
            <p className="text-xs text-text-muted mt-2">
              Access levels: View (read-only), Edit (modify data), Manage (full control)
            </p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setManagingUser(null);
              setSelectedCompanyId('');
              setSelectedAccessLevel('VIEW');
            }}
          >
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
