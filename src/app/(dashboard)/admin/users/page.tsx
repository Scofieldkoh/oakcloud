'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/use-auth';
import {
  useCurrentTenantUsers,
  useTenantUsers,
  useTenants,
  useInviteUser,
  useUpdateUser,
  useDeleteUser,
  useUserCompanyAssignments,
  useAssignUserToCompany,
  useRemoveCompanyAssignment,
  useCurrentTenantRoles,
  useTenantRoles,
  type TenantUser,
  type UserCompanyAssignment,
  type Role,
} from '@/hooks/use-admin';
import { useCompanies } from '@/hooks/use-companies';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
  Edit,
  KeyRound,
  UserX,
  Check,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';

// System roles that are always available for selection
const SYSTEM_ROLES = [
  { value: 'TENANT_ADMIN', label: 'Tenant Admin', description: 'Full access to all tenant resources', isSystem: true },
  { value: 'COMPANY_ADMIN', label: 'Company Admin', description: 'Manage assigned companies', isSystem: true },
  { value: 'COMPANY_USER', label: 'Company User', description: 'View-only access to assigned companies', isSystem: true },
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

interface CompanyAssignment {
  companyId: string;
  isPrimary: boolean;
  companyName?: string;
}

interface RoleAssignment {
  roleId: string;
  companyId: string | null; // null = "All Companies"
  roleName?: string;
  companyName?: string;
}

export default function UsersPage() {
  const { data: session } = useSession();
  const { success, error: showError } = useToast();

  // State for list/filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modal states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [managingUser, setManagingUser] = useState<TenantUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<TenantUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<TenantUser | null>(null);

  // Company assignment state (for invite)
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  // Role assignment state (for invite and manage roles modal)
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedRoleCompanyId, setSelectedRoleCompanyId] = useState<string | null>(null); // null = "All Companies"
  const [inviteRoleAssignments, setInviteRoleAssignments] = useState<RoleAssignment[]>([]);

  // For SUPER_ADMIN: tenant selection
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const isSuperAdmin = session?.role === 'SUPER_ADMIN';

  // Get active tenant ID (either from session or selection for SUPER_ADMIN)
  const activeTenantId = isSuperAdmin ? selectedTenantId : session?.tenantId;

  // Invite form state
  const [inviteFormData, setInviteFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'COMPANY_USER',
  });
  const [inviteCompanyAssignments, setInviteCompanyAssignments] = useState<CompanyAssignment[]>([]);
  const [formError, setFormError] = useState('');

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: '',
    isActive: true,
  });

  // Fetch tenants for SUPER_ADMIN
  const { data: tenantsData } = useTenants(
    isSuperAdmin ? { status: 'ACTIVE', limit: 100 } : undefined
  );

  // Fetch roles for tenant
  const { data: currentTenantRolesData } = useCurrentTenantRoles();
  const { data: selectedTenantRolesData } = useTenantRoles(isSuperAdmin ? selectedTenantId : undefined);
  const rolesData = isSuperAdmin ? selectedTenantRolesData : currentTenantRolesData;

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
  const updateUser = useUpdateUser(activeTenantId || undefined, editingUser?.id);
  const deleteUser = useDeleteUser(activeTenantId || undefined);

  // Company management hooks
  const { data: assignmentsData, isLoading: assignmentsLoading } = useUserCompanyAssignments(
    managingUser?.id
  );
  const assignCompany = useAssignUserToCompany(managingUser?.id);
  const removeAssignment = useRemoveCompanyAssignment(managingUser?.id);

  // Initialize edit form when editing user changes
  useEffect(() => {
    if (editingUser) {
      setEditFormData({
        firstName: editingUser.firstName,
        lastName: editingUser.lastName,
        email: editingUser.email,
        role: editingUser.role,
        isActive: editingUser.isActive,
      });
    }
  }, [editingUser]);

  // Combine system roles with custom roles from API
  const availableRoles = (() => {
    const roles = [...SYSTEM_ROLES];
    if (rolesData) {
      // Add custom roles (non-system roles) from API
      const customRoles = (rolesData as Role[])
        .filter((r) => !r.isSystem)
        .map((r) => ({
          value: r.name,
          label: r.name,
          description: r.description || 'Custom role',
          isSystem: false,
        }));
      roles.push(...customRoles);
    }
    return roles;
  })();

  // Handle invite
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!inviteFormData.email || !inviteFormData.firstName || !inviteFormData.lastName) {
      setFormError('Please fill in all required fields');
      return;
    }

    // Company is required for COMPANY_ADMIN and COMPANY_USER unless they have company assignments
    const requiresCompany = inviteFormData.role === 'COMPANY_ADMIN' || inviteFormData.role === 'COMPANY_USER';
    if (requiresCompany && inviteCompanyAssignments.length === 0) {
      setFormError('Please assign at least one company for this role');
      return;
    }

    try {
      // Get primary company ID (first in list or the one marked as primary)
      const primaryAssignment = inviteCompanyAssignments.find((a) => a.isPrimary) || inviteCompanyAssignments[0];

      // Convert role assignments for API
      const roleAssignments = inviteRoleAssignments.length > 0
        ? inviteRoleAssignments.map((ra) => ({
            roleId: ra.roleId,
            companyId: ra.companyId,
          }))
        : undefined;

      await inviteUser.mutateAsync({
        email: inviteFormData.email,
        firstName: inviteFormData.firstName,
        lastName: inviteFormData.lastName,
        role: inviteFormData.role,
        companyId: primaryAssignment?.companyId,
        companyAssignments: inviteCompanyAssignments.length > 0
          ? inviteCompanyAssignments.map((ca) => ({
              companyId: ca.companyId,
              isPrimary: ca.isPrimary,
            }))
          : undefined,
        roleAssignments,
      });

      success('User invited successfully');
      setIsInviteModalOpen(false);
      setInviteFormData({
        email: '',
        firstName: '',
        lastName: '',
        role: 'COMPANY_USER',
      });
      setInviteCompanyAssignments([]);
      setInviteRoleAssignments([]);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to invite user');
    }
  };

  // Handle edit user
  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const updates: Record<string, unknown> = {};
      if (editFormData.firstName !== editingUser.firstName) updates.firstName = editFormData.firstName;
      if (editFormData.lastName !== editingUser.lastName) updates.lastName = editFormData.lastName;
      if (editFormData.email !== editingUser.email) updates.email = editFormData.email;
      if (editFormData.role !== editingUser.role) updates.role = editFormData.role;
      if (editFormData.isActive !== editingUser.isActive) updates.isActive = editFormData.isActive;

      if (Object.keys(updates).length === 0) {
        setEditingUser(null);
        return;
      }

      await updateUser.mutateAsync(updates as Parameters<typeof updateUser.mutateAsync>[0]);
      success('User updated successfully');
      setEditingUser(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  // Handle delete user
  const handleDeleteUser = async (reason?: string) => {
    if (!deletingUser) return;

    try {
      await deleteUser.mutateAsync({
        userId: deletingUser.id,
        reason: reason || 'Removed by administrator',
      });
      success('User removed successfully');
      setDeletingUser(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove user');
    }
  };

  // Handle password reset
  const handlePasswordReset = async () => {
    if (!resetPasswordUser || !activeTenantId) return;

    try {
      const res = await fetch(`/api/tenants/${activeTenantId}/users/${resetPasswordUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendPasswordReset: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send password reset');
      }

      success('Password reset email sent');
      setResetPasswordUser(null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to send password reset');
    }
  };

  // Add company assignment to invite form
  const addCompanyAssignment = () => {
    if (!selectedCompanyId) return;
    const company = companiesData?.companies.find((c) => c.id === selectedCompanyId);
    if (!company) return;

    // Check if already assigned
    if (inviteCompanyAssignments.some((a) => a.companyId === selectedCompanyId)) {
      showError('Company already assigned');
      return;
    }

    const newAssignment: CompanyAssignment = {
      companyId: selectedCompanyId,
      isPrimary: inviteCompanyAssignments.length === 0, // First one is primary by default
      companyName: company.name,
    };

    setInviteCompanyAssignments([...inviteCompanyAssignments, newAssignment]);
    setSelectedCompanyId('');
  };

  // Add role assignment to invite form
  const addRoleAssignment = () => {
    if (!selectedRoleId) return;
    const role = (rolesData as Role[] | undefined)?.find((r) => r.id === selectedRoleId);
    if (!role) return;

    const company = selectedRoleCompanyId
      ? companiesData?.companies.find((c) => c.id === selectedRoleCompanyId)
      : null;

    // Check for duplicate
    const isDuplicate = inviteRoleAssignments.some(
      (ra) => ra.roleId === selectedRoleId && ra.companyId === selectedRoleCompanyId
    );
    if (isDuplicate) {
      showError('This role assignment already exists');
      return;
    }

    const newAssignment: RoleAssignment = {
      roleId: selectedRoleId,
      companyId: selectedRoleCompanyId,
      roleName: role.name,
      companyName: company?.name || 'All Companies',
    };

    setInviteRoleAssignments([...inviteRoleAssignments, newAssignment]);
    setSelectedRoleId('');
    setSelectedRoleCompanyId(null);
  };

  // Remove role assignment from invite form
  const removeRoleAssignment = (roleId: string, companyId: string | null) => {
    setInviteRoleAssignments(
      inviteRoleAssignments.filter((ra) => !(ra.roleId === roleId && ra.companyId === companyId))
    );
  };

  // Remove company assignment from invite form
  const removeCompanyAssignmentFromInvite = (companyId: string) => {
    const newAssignments = inviteCompanyAssignments.filter((a) => a.companyId !== companyId);
    // If we removed the primary, make the first one primary
    if (newAssignments.length > 0 && !newAssignments.some((a) => a.isPrimary)) {
      newAssignments[0].isPrimary = true;
    }
    setInviteCompanyAssignments(newAssignments);
  };

  // Toggle primary company in invite form
  const togglePrimaryCompany = (companyId: string) => {
    setInviteCompanyAssignments(
      inviteCompanyAssignments.map((a) => ({
        ...a,
        isPrimary: a.companyId === companyId,
      }))
    );
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
          {availableRoles.map((role) => (
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
                            <button
                              onClick={() => setManagingUser(user)}
                              className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
                            >
                              <Building2 className="w-3.5 h-3.5" />
                              <span className="text-sm">{user.company.name}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => setManagingUser(user)}
                              className="text-text-muted text-sm hover:text-text-primary transition-colors"
                            >
                              + Assign
                            </button>
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
                                icon={<Edit className="w-4 h-4" />}
                                onClick={() => setEditingUser(user)}
                              >
                                Edit User
                              </DropdownItem>
                              <DropdownItem
                                icon={<Building2 className="w-4 h-4" />}
                                onClick={() => setManagingUser(user)}
                              >
                                Manage Companies
                              </DropdownItem>
                              <DropdownItem
                                icon={<KeyRound className="w-4 h-4" />}
                                onClick={() => setResetPasswordUser(user)}
                              >
                                Send Password Reset
                              </DropdownItem>
                              <DropdownSeparator />
                              <DropdownItem
                                icon={<UserX className="w-4 h-4" />}
                                onClick={() => setDeletingUser(user)}
                                className="text-status-error"
                              >
                                Remove User
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
        onClose={() => {
          setIsInviteModalOpen(false);
          setInviteFormData({
            email: '',
            firstName: '',
            lastName: '',
            role: 'COMPANY_USER',
          });
          setInviteCompanyAssignments([]);
          setInviteRoleAssignments([]);
          setSelectedRoleId('');
          setSelectedRoleCompanyId(null);
          setFormError('');
        }}
        title="Invite User"
        size="lg"
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
                  value={inviteFormData.firstName}
                  onChange={(e) => setInviteFormData({ ...inviteFormData, firstName: e.target.value })}
                  placeholder="John"
                  required
                  inputSize="sm"
                />
                <FormInput
                  label="Last Name"
                  value={inviteFormData.lastName}
                  onChange={(e) => setInviteFormData({ ...inviteFormData, lastName: e.target.value })}
                  placeholder="Doe"
                  required
                  inputSize="sm"
                />
              </div>

              <FormInput
                label="Email"
                type="email"
                value={inviteFormData.email}
                onChange={(e) => setInviteFormData({ ...inviteFormData, email: e.target.value })}
                placeholder="john@example.com"
                required
                inputSize="sm"
                leftIcon={<Mail className="w-4 h-4" />}
              />

              <div>
                <label className="label">Role</label>
                <select
                  value={inviteFormData.role}
                  onChange={(e) => setInviteFormData({ ...inviteFormData, role: e.target.value })}
                  className="input input-sm w-full"
                  required
                >
                  {availableRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label} {!role.isSystem && '(Custom)'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-secondary mt-1">
                  {availableRoles.find((r) => r.value === inviteFormData.role)?.description}
                </p>
              </div>

              {/* Company Assignments Section */}
              {(inviteFormData.role === 'COMPANY_ADMIN' || inviteFormData.role === 'COMPANY_USER') && (
                <div className="border-t border-border-primary pt-4">
                  <h4 className="text-sm font-medium text-text-primary mb-3">Company Access</h4>
                  <p className="text-xs text-text-muted mb-3">
                    Select which companies this user can access.
                  </p>

                  {/* Current company assignments */}
                  {inviteCompanyAssignments.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {inviteCompanyAssignments.map((assignment) => (
                        <div
                          key={assignment.companyId}
                          className="flex items-center justify-between p-2 bg-background-tertiary rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-text-muted" />
                            <span className="text-sm text-text-primary">{assignment.companyName}</span>
                            {assignment.isPrimary && (
                              <span className="badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                                <Star className="w-3 h-3 mr-1" />
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {!assignment.isPrimary && (
                              <div title="Set as primary">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => togglePrimaryCompany(assignment.companyId)}
                                >
                                  <Star className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeCompanyAssignmentFromInvite(assignment.companyId)}
                              className="text-red-500 hover:text-red-600"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new company */}
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <select
                        value={selectedCompanyId}
                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                        className="input input-sm w-full"
                      >
                        <option value="">Select a company...</option>
                        {companiesData?.companies
                          .filter((c) => !inviteCompanyAssignments.some((a) => a.companyId === c.id))
                          .map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.name} ({company.uen})
                            </option>
                          ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={addCompanyAssignment}
                      disabled={!selectedCompanyId}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Role Assignments Section (Optional - for granular control) */}
              <div className="border-t border-border-primary pt-4">
                <h4 className="text-sm font-medium text-text-primary mb-2">Role Assignments</h4>
                <p className="text-xs text-text-muted mb-3">
                  Optionally assign specific roles per company. If left empty, the system role above will be used for all companies.
                </p>

                {/* Current role assignments */}
                {inviteRoleAssignments.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {inviteRoleAssignments.map((assignment) => (
                      <div
                        key={`${assignment.roleId}-${assignment.companyId || 'all'}`}
                        className="flex items-center justify-between p-2 bg-background-tertiary rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-text-muted" />
                          <span className="text-sm font-medium text-text-primary">{assignment.roleName}</span>
                          <span className="text-xs text-text-muted">→</span>
                          <span className={cn(
                            'text-sm',
                            assignment.companyId ? 'text-text-secondary' : 'text-oak-primary font-medium'
                          )}>
                            {assignment.companyName}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRoleAssignment(assignment.roleId, assignment.companyId)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new role assignment */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <select
                      value={selectedRoleId}
                      onChange={(e) => setSelectedRoleId(e.target.value)}
                      className="input input-sm w-full"
                    >
                      <option value="">Select a role...</option>
                      {(rolesData as Role[] | undefined)?.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name} {role.isSystem ? '' : '(Custom)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <select
                      value={selectedRoleCompanyId || ''}
                      onChange={(e) => setSelectedRoleCompanyId(e.target.value || null)}
                      className="input input-sm w-full"
                    >
                      <option value="">All Companies</option>
                      {companiesData?.companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={addRoleAssignment}
                    disabled={!selectedRoleId}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-text-muted mt-2">
                  Company-specific roles override &quot;All Companies&quot; roles.
                </p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsInviteModalOpen(false);
                setInviteFormData({
                  email: '',
                  firstName: '',
                  lastName: '',
                  role: 'COMPANY_USER',
                });
                setInviteCompanyAssignments([]);
                setInviteRoleAssignments([]);
                setSelectedRoleId('');
                setSelectedRoleCompanyId(null);
                setFormError('');
              }}
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

      {/* Edit User Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={`Edit User - ${editingUser?.firstName} ${editingUser?.lastName}`}
        size="md"
      >
        <form onSubmit={handleEditUser}>
          <ModalBody>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormInput
                  label="First Name"
                  value={editFormData.firstName}
                  onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                  required
                  inputSize="sm"
                />
                <FormInput
                  label="Last Name"
                  value={editFormData.lastName}
                  onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                  required
                  inputSize="sm"
                />
              </div>

              <FormInput
                label="Email"
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                required
                inputSize="sm"
                leftIcon={<Mail className="w-4 h-4" />}
              />

              <div>
                <label className="label">Role</label>
                <select
                  value={editFormData.role}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                  className="input input-sm w-full"
                  required
                >
                  {availableRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label} {!role.isSystem && '(Custom)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <label className="label mb-0">Status</label>
                <button
                  type="button"
                  onClick={() => setEditFormData({ ...editFormData, isActive: !editFormData.isActive })}
                  className={cn(
                    'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-oak-primary focus:ring-offset-2',
                    editFormData.isActive ? 'bg-oak-primary' : 'bg-gray-200 dark:bg-gray-700'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                      editFormData.isActive ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
                <span className="text-sm text-text-secondary">
                  {editFormData.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditingUser(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={updateUser.isPending}
              leftIcon={<Check className="w-4 h-4" />}
            >
              Save Changes
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
        }}
        title={`Manage Companies - ${managingUser?.firstName} ${managingUser?.lastName}`}
        size="lg"
      >
        <ModalBody>
          <p className="text-sm text-text-secondary mb-4">
            Companies this user can access. Permissions are controlled through role assignments in the Roles &amp; Permissions page.
          </p>

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
              <Button
                variant="primary"
                size="sm"
                disabled={!selectedCompanyId}
                isLoading={assignCompany.isPending}
                onClick={async () => {
                  try {
                    await assignCompany.mutateAsync({
                      companyId: selectedCompanyId,
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
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setManagingUser(null);
              setSelectedCompanyId('');
            }}
          >
            Close
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete User Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        onConfirm={handleDeleteUser}
        title="Remove User"
        description={`Are you sure you want to remove ${deletingUser?.firstName} ${deletingUser?.lastName} (${deletingUser?.email})? This action can be undone by restoring the user.`}
        confirmLabel="Remove User"
        variant="danger"
        requireReason
        reasonLabel="Reason for removal"
        reasonPlaceholder="Please provide a reason for removing this user..."
        isLoading={deleteUser.isPending}
      />

      {/* Password Reset Confirmation */}
      <ConfirmDialog
        isOpen={!!resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
        onConfirm={handlePasswordReset}
        title="Send Password Reset"
        description={`Send a password reset email to ${resetPasswordUser?.email}? The user will receive instructions to create a new password.`}
        confirmLabel="Send Reset Email"
        variant="info"
      />
    </div>
  );
}
