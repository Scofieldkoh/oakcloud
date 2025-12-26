'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/use-auth';
import {
  useCurrentTenantUsers,
  useTenantUsers,
  useInviteUser,
  useUpdateUser,
  useDeleteUser,
  useUserCompanyAssignments,
  useAssignUserToCompany,
  useRemoveCompanyAssignment,
  useRemoveUserRoleAssignment,
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
import { useActiveTenantId, useTenantSelection } from '@/components/ui/tenant-selector';
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
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';

// System roles that are always available for selection
const SYSTEM_ROLES = [
  { value: 'TENANT_ADMIN', label: 'Tenant Admin', description: 'Full access to all tenant resources', isSystem: true },
  { value: 'COMPANY_ADMIN', label: 'Company Admin', description: 'Manage assigned companies', isSystem: true },
  { value: 'COMPANY_USER', label: 'Company User', description: 'View-only access to assigned companies', isSystem: true },
];

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
  const [companyFilter, setCompanyFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Modal states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [managingUserId, setManagingUserId] = useState<string | null>(null); // Store ID only, get fresh data from query
  const [deletingUser, setDeletingUser] = useState<TenantUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<TenantUser | null>(null);

  // Company assignment state (for invite)
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  // Role assignment state (for invite and manage roles modal)
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedRoleCompanyId, setSelectedRoleCompanyId] = useState<string | null>(null); // null = "All Companies"
  const [inviteRoleAssignments, setInviteRoleAssignments] = useState<RoleAssignment[]>([]);
  const [isTenantAdminInvite, setIsTenantAdminInvite] = useState(false); // Only for SUPER_ADMIN

  // For SUPER_ADMIN: tenant selection (from centralized store)
  const isSuperAdmin = session?.isSuperAdmin ?? false;
  const { selectedTenantId } = useTenantSelection();

  // Get active tenant ID using the centralized hook
  const activeTenantId = useActiveTenantId(isSuperAdmin, session?.tenantId);

  // Invite form state
  const [inviteFormData, setInviteFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
  });
  const [formError, setFormError] = useState('');

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    isActive: true,
  });

  // Fetch roles for tenant - use activeTenantId to ensure proper tenant scoping
  // For SUPER_ADMIN: only fetch roles when a tenant is selected
  // For others: use their session tenant
  const { data: currentTenantRolesData } = useCurrentTenantRoles();
  const { data: selectedTenantRolesData } = useTenantRoles(
    isSuperAdmin && selectedTenantId ? selectedTenantId : undefined
  );
  // SUPER_ADMIN must have a tenant selected to see roles; others use their tenant's roles
  const rolesData = isSuperAdmin
    ? (selectedTenantId ? selectedTenantRolesData : undefined)
    : currentTenantRolesData;

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
      company: companyFilter || undefined,
      page,
      limit,
    }
  );

  const {
    data: currentTenantData,
    isLoading: currentTenantLoading,
    error: currentTenantError,
  } = useCurrentTenantUsers({
    query: search || undefined,
    role: roleFilter || undefined,
    company: companyFilter || undefined,
    page,
    limit,
  });

  // Use the appropriate data based on role
  const data = isSuperAdmin ? tenantUsersData : currentTenantData;
  const isLoading = isSuperAdmin ? tenantUsersLoading : currentTenantLoading;
  const error = isSuperAdmin ? tenantUsersError : currentTenantError;

  // Get fresh user data from query results (ensures modal shows updated data after mutations)
  const managingUser = managingUserId
    ? data?.users.find((u: TenantUser) => u.id === managingUserId) || null
    : null;

  // Fetch companies scoped to selected tenant for SUPER_ADMIN
  const { data: companiesData } = useCompanies({
    limit: 100,
    tenantId: isSuperAdmin ? selectedTenantId || undefined : undefined,
  });
  const inviteUser = useInviteUser(activeTenantId || undefined);
  const updateUser = useUpdateUser(activeTenantId || undefined, editingUser?.id);
  const deleteUser = useDeleteUser(activeTenantId || undefined);

  // Company management hooks
  const { data: assignmentsData, isLoading: assignmentsLoading } = useUserCompanyAssignments(
    managingUserId || undefined
  );
  const assignCompany = useAssignUserToCompany(managingUserId || undefined);
  const removeAssignment = useRemoveCompanyAssignment(managingUserId || undefined);
  const removeUserRole = useRemoveUserRoleAssignment(activeTenantId || undefined);

  // Initialize edit form when editing user changes
  useEffect(() => {
    if (editingUser) {
      setEditFormData({
        firstName: editingUser.firstName,
        lastName: editingUser.lastName,
        email: editingUser.email,
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

  // Helper to filter role assignments based on active filters
  // When filtering by role or company, only show matching assignments in the table
  const getFilteredRoleAssignments = (user: TenantUser) => {
    if (!user.roleAssignments) return [];

    let filtered = user.roleAssignments;

    // Filter by role name if role filter is active
    if (roleFilter) {
      filtered = filtered.filter((ra) =>
        ra.role.name.toLowerCase().includes(roleFilter.toLowerCase()) ||
        ra.role.systemRoleType?.toLowerCase().includes(roleFilter.toLowerCase().replace(' ', '_'))
      );
    }

    // Filter by company name if company filter is active
    if (companyFilter) {
      filtered = filtered.filter((ra) =>
        ra.company?.name.toLowerCase().includes(companyFilter.toLowerCase()) ||
        // Also match "All Companies" assignments when searching
        (!ra.company && 'all companies'.includes(companyFilter.toLowerCase()))
      );
    }

    return filtered;
  };

  // Handle invite
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!inviteFormData.email || !inviteFormData.firstName || !inviteFormData.lastName) {
      setFormError('Please fill in all required fields');
      return;
    }

    // Validate role assignments
    if (!isTenantAdminInvite && inviteRoleAssignments.length === 0) {
      setFormError('Please assign at least one role');
      return;
    }

    try {
      let roleAssignments: Array<{ roleId: string; companyId: string | null }>;

      if (isTenantAdminInvite) {
        // Find the TENANT_ADMIN system role
        const tenantAdminRole = (rolesData as Role[] | undefined)?.find(
          (r) => r.systemRoleType === 'TENANT_ADMIN'
        );
        if (!tenantAdminRole) {
          setFormError('Tenant Admin role not found');
          return;
        }
        roleAssignments = [{ roleId: tenantAdminRole.id, companyId: null }];
      } else {
        roleAssignments = inviteRoleAssignments.map((ra) => ({
          roleId: ra.roleId,
          companyId: ra.companyId,
        }));
      }

      await inviteUser.mutateAsync({
        email: inviteFormData.email,
        firstName: inviteFormData.firstName,
        lastName: inviteFormData.lastName,
        roleAssignments,
      });

      success('User invited successfully');
      setIsInviteModalOpen(false);
      setInviteFormData({
        email: '',
        firstName: '',
        lastName: '',
      });
      setInviteRoleAssignments([]);
      setIsTenantAdminInvite(false);
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

  // Check permissions using computed flags from role assignments
  const canManageUsers = session?.isSuperAdmin || session?.isTenantAdmin;

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

      {/* Tenant context info for SUPER_ADMIN */}
      {isSuperAdmin && !selectedTenantId && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Please select a tenant from the sidebar to manage users.
          </p>
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
        <div className="w-full sm:w-48">
          <FormInput
            placeholder="Filter by company..."
            value={companyFilter}
            onChange={(e) => {
              setCompanyFilter(e.target.value);
              setPage(1);
            }}
            leftIcon={<Building2 className="w-4 h-4" />}
            inputSize="sm"
            disabled={isSuperAdmin && !selectedTenantId}
          />
        </div>
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
            As a Super Admin, please select a tenant from the sidebar to view and manage its users.
          </p>
        </div>
      )}

      {/* Users Table */}
      {data && (!isSuperAdmin || selectedTenantId) && (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {data.users.length === 0 ? (
              <div className="card p-6 text-center text-text-secondary">
                No users found
              </div>
            ) : (
              data.users.map((user: TenantUser) => {
                const filteredAssignments = getFilteredRoleAssignments(user);
                const totalAssignments = user.roleAssignments?.length || 0;

                return (
                  <MobileCard
                    key={user.id}
                    title={
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-oak-primary/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-oak-light text-xs font-medium">
                            {user.firstName[0]}{user.lastName[0]}
                          </span>
                        </div>
                        <span className="font-medium text-text-primary truncate">
                          {user.firstName} {user.lastName}
                        </span>
                      </div>
                    }
                    subtitle={
                      <div className="flex items-center gap-1 text-xs">
                        <Mail className="w-3 h-3" />
                        {user.email}
                      </div>
                    }
                    badge={
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
                    }
                    actions={
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
                            onClick={() => setManagingUserId(user.id)}
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
                    }
                    details={
                      <CardDetailsGrid>
                        <CardDetailItem
                          label="Roles"
                          value={
                            <button
                              onClick={() => setManagingUserId(user.id)}
                              className="text-left"
                            >
                              {filteredAssignments.length > 0 ? (
                                <div className="space-y-1">
                                  {filteredAssignments.slice(0, 2).map((ra) => (
                                    <div key={ra.id} className="flex items-center gap-1">
                                      <span
                                        className={cn(
                                          'badge text-xs',
                                          ra.role.systemRoleType === 'TENANT_ADMIN'
                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                            : 'bg-oak-primary/10 text-oak-primary dark:bg-oak-primary/20'
                                        )}
                                      >
                                        {ra.role.name}
                                      </span>
                                    </div>
                                  ))}
                                  {filteredAssignments.length > 2 && (
                                    <span className="text-xs text-text-muted">
                                      +{filteredAssignments.length - 2} more
                                    </span>
                                  )}
                                </div>
                              ) : totalAssignments > 0 ? (
                                <span className="text-text-muted text-sm">
                                  {totalAssignments} role{totalAssignments > 1 ? 's' : ''} (filtered)
                                </span>
                              ) : (
                                <span className="text-text-muted text-sm">No roles</span>
                              )}
                            </button>
                          }
                          fullWidth
                        />
                        <CardDetailItem
                          label="Last Login"
                          value={
                            user.lastLoginAt ? (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(user.lastLoginAt), 'MMM d, yyyy')}
                              </div>
                            ) : (
                              <span className="text-text-muted">Never</span>
                            )
                          }
                        />
                      </CardDetailsGrid>
                    }
                  />
                );
              })
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Roles & Companies</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-text-secondary">
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
                          <button
                            onClick={() => setManagingUserId(user.id)}
                            className="text-left hover:bg-background-tertiary rounded p-1 -m-1 transition-colors"
                          >
                            {(() => {
                              // Get filtered role assignments based on active filters
                              const filteredAssignments = getFilteredRoleAssignments(user);
                              const totalAssignments = user.roleAssignments?.length || 0;
                              const hasFilters = roleFilter || companyFilter;

                              if (filteredAssignments.length > 0) {
                                return (
                                  <div className="space-y-1">
                                    {filteredAssignments.slice(0, 3).map((ra) => (
                                      <div key={ra.id} className="flex items-center gap-1.5">
                                        <span
                                          className={cn(
                                            'badge text-xs',
                                            ra.role.systemRoleType === 'TENANT_ADMIN'
                                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                              : ra.role.systemRoleType === 'SUPER_ADMIN'
                                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                                                : 'bg-oak-primary/10 text-oak-primary dark:bg-oak-primary/20'
                                          )}
                                        >
                                          <Shield className="w-2.5 h-2.5 mr-0.5" />
                                          {ra.role.name}
                                        </span>
                                        <span className="text-xs text-text-muted">→</span>
                                        <span className="text-xs text-text-secondary flex items-center gap-0.5">
                                          <Building2 className="w-3 h-3" />
                                          {ra.company ? ra.company.name : 'All Companies'}
                                        </span>
                                      </div>
                                    ))}
                                    {filteredAssignments.length > 3 && (
                                      <span className="text-xs text-text-muted">
                                        +{filteredAssignments.length - 3} more matching
                                      </span>
                                    )}
                                    {hasFilters && filteredAssignments.length < totalAssignments && (
                                      <span className="text-xs text-text-tertiary italic">
                                        ({totalAssignments - filteredAssignments.length} other{totalAssignments - filteredAssignments.length > 1 ? 's' : ''} hidden)
                                      </span>
                                    )}
                                  </div>
                                );
                              } else if (totalAssignments > 0) {
                                // Has assignments but none match filter
                                return (
                                  <span className="text-text-muted text-sm flex items-center gap-1">
                                    <Shield className="w-3.5 h-3.5" />
                                    {totalAssignments} role{totalAssignments > 1 ? 's' : ''} (filtered)
                                  </span>
                                );
                              } else {
                                return (
                                  <span className="text-text-muted text-sm flex items-center gap-1">
                                    <Shield className="w-3.5 h-3.5" />
                                    No roles assigned
                                  </span>
                                );
                              }
                            })()}
                          </button>
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
                                onClick={() => setManagingUserId(user.id)}
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
          {data.totalPages > 0 && (
            <div className="mt-4">
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.totalCount}
                limit={data.limit}
                onPageChange={setPage}
                onLimitChange={(newLimit) => {
                  setLimit(newLimit);
                  setPage(1);
                }}
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
          });
          setInviteRoleAssignments([]);
          setSelectedRoleId('');
          setSelectedRoleCompanyId(null);
          setIsTenantAdminInvite(false);
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              {/* Tenant Admin Toggle - Only for SUPER_ADMIN */}
              {isSuperAdmin && (
                <div className="border-t border-border-primary pt-4">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border-primary bg-background-secondary">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-text-primary">Tenant Admin</span>
                      <span className="text-xs text-text-tertiary">
                        {isTenantAdminInvite ? 'Full administrative access to this tenant' : 'Standard user with role-based access'}
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isTenantAdminInvite}
                      onClick={() => {
                        const newValue = !isTenantAdminInvite;
                        setIsTenantAdminInvite(newValue);
                        if (newValue) {
                          setInviteRoleAssignments([]); // Clear role assignments when becoming tenant admin
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 ${
                        isTenantAdminInvite ? 'bg-status-success' : 'bg-background-tertiary'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          isTenantAdminInvite ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Role Assignments Section - Hidden when Tenant Admin is checked */}
              {!isTenantAdminInvite && (
              <>
              <div className="border-t border-border-primary pt-4">
                <h4 className="text-sm font-medium text-text-primary mb-2">Role Assignments <span className="text-red-500">*</span></h4>
                <p className="text-xs text-text-muted mb-3">
                  Assign roles to this user. Use &quot;All Companies&quot; for tenant-wide access or select a specific company.
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
                      {(rolesData as Role[] | undefined)
                        ?.filter((role) =>
                          // Exclude TENANT_ADMIN and SUPER_ADMIN (assigned separately)
                          // Keep COMPANY_ADMIN, COMPANY_USER, and custom roles
                          role.systemRoleType !== 'TENANT_ADMIN' && role.systemRoleType !== 'SUPER_ADMIN'
                        )
                        .map((role) => (
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
              </>
              )}
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
                });
                setInviteRoleAssignments([]);
                setSelectedRoleId('');
                setSelectedRoleCompanyId(null);
                setIsTenantAdminInvite(false);
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <p className="text-xs text-text-muted">
                To manage role assignments, use the &quot;Manage Companies&quot; option from the user menu.
              </p>

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

      {/* Manage Roles & Companies Modal */}
      <Modal
        isOpen={!!managingUserId}
        onClose={() => {
          setManagingUserId(null);
          setSelectedCompanyId('');
          setSelectedRoleId('');
        }}
        title={`Manage Roles & Companies - ${managingUser?.firstName} ${managingUser?.lastName}`}
        size="lg"
      >
        <ModalBody>
          <p className="text-sm text-text-secondary mb-4">
            Manage which companies this user can access and their role for each company.
          </p>

          {/* Current Role Assignments */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-text-primary mb-3">Current Role Assignments</h4>
            {managingUser?.roleAssignments && managingUser.roleAssignments.length > 0 ? (
              <div className="space-y-2">
                {managingUser.roleAssignments.map((ra) => (
                  <div
                    key={ra.id}
                    className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="w-4 h-4 text-text-muted" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'badge text-xs',
                              ra.role.systemRoleType === 'TENANT_ADMIN'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                : 'bg-oak-primary/10 text-oak-primary dark:bg-oak-primary/20'
                            )}
                          >
                            {ra.role.name}
                          </span>
                          <span className="text-xs text-text-muted">→</span>
                          <span className="text-sm text-text-secondary flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {ra.company ? ra.company.name : 'All Companies'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await removeUserRole.mutateAsync({
                            userId: managingUser.id,
                            roleId: ra.roleId,
                            companyId: ra.companyId,
                          });
                          success('Role assignment removed');
                        } catch (err) {
                          showError(err instanceof Error ? err.message : 'Failed to remove');
                        }
                      }}
                      isLoading={removeUserRole.isPending}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted py-4 text-center">No roles assigned</p>
            )}
          </div>

          {/* Add New Role Assignment */}
          <div className="border-t border-border-primary pt-4">
            <h4 className="text-sm font-medium text-text-primary mb-3">Add Role Assignment</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs mb-1">Company</label>
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    className="input input-sm w-full"
                  >
                    <option value="">Select company...</option>
                    <option value="__all__">All Companies</option>
                    {companiesData?.companies
                      .map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="label text-xs mb-1">Role</label>
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className="input input-sm w-full"
                  >
                    <option value="">Select role...</option>
                    {(rolesData as Role[] | undefined)
                      ?.filter((role) =>
                        // Exclude TENANT_ADMIN and SUPER_ADMIN (not company-scoped)
                        // Keep COMPANY_ADMIN, COMPANY_USER, and custom roles
                        role.systemRoleType !== 'TENANT_ADMIN' && role.systemRoleType !== 'SUPER_ADMIN'
                      )
                      .map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                disabled={!selectedCompanyId || !selectedRoleId}
                isLoading={assignCompany.isPending}
                onClick={async () => {
                  try {
                    // Handle "All Companies" selection (value = "__all__" means null companyId)
                    const companyIdToAssign = selectedCompanyId === '__all__' ? null : selectedCompanyId;

                    await assignCompany.mutateAsync({
                      companyId: companyIdToAssign,
                      roleId: selectedRoleId,
                      isPrimary: !assignmentsData?.assignments?.length,
                      tenantId: activeTenantId || undefined, // Pass tenantId for SUPER_ADMIN
                    });
                    setSelectedCompanyId('');
                    setSelectedRoleId('');
                    success('Role assigned successfully');
                  } catch (err) {
                    showError(err instanceof Error ? err.message : 'Failed to assign');
                  }
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Role Assignment
              </Button>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setManagingUserId(null);
              setSelectedCompanyId('');
              setSelectedRoleId('');
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
