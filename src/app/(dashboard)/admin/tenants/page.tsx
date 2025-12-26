'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-auth';
import { useTenants, useCreateTenant, useUpdateTenant, type Tenant } from '@/hooks/use-admin';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Alert } from '@/components/ui/alert';
import { Pagination } from '@/components/companies/pagination';
import { useToast } from '@/components/ui/toast';
import {
  Plus,
  Search,
  Building,
  Users,
  Building2,
  HardDrive,
  Calendar,
  Mail,
  Phone,
  MoreVertical,
  Edit,
  Pause,
  Play,
  Settings,
  Trash2,
} from 'lucide-react';
import { TenantSetupWizard } from '@/components/admin/tenant-setup-wizard';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@/components/ui/dropdown';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';

const TENANT_STATUSES = [
  { value: 'ACTIVE', label: 'Active', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  { value: 'SUSPENDED', label: 'Suspended', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  { value: 'PENDING_SETUP', label: 'Pending Setup', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { value: 'DEACTIVATED', label: 'Deactivated', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300' },
];

function getStatusColor(status: string) {
  const found = TENANT_STATUSES.find((s) => s.value === status);
  return found?.color || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
}

function getStatusLabel(status: string) {
  const found = TENANT_STATUSES.find((s) => s.value === status);
  return found?.label || status;
}

export default function TenantsPage() {
  const { data: session } = useSession();
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [setupWizardTenant, setSetupWizardTenant] = useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state for create
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    contactEmail: '',
    maxUsers: '50',
    maxCompanies: '100',
  });
  const [formError, setFormError] = useState('');

  // Form state for edit
  const [editFormData, setEditFormData] = useState({
    name: '',
    slug: '',
    contactEmail: '',
    contactPhone: '',
    maxUsers: '50',
    maxCompanies: '100',
    maxStorageMb: '10240',
  });
  const [editFormError, setEditFormError] = useState('');

  const { data, isLoading, error } = useTenants({
    query: search || undefined,
    status: statusFilter || undefined,
    page,
    limit,
  });

  const createTenant = useCreateTenant();
  const updateTenantMutation = useUpdateTenant(editingTenant?.id);

  // Open edit modal and populate form
  const openEditModal = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setEditFormData({
      name: tenant.name,
      slug: tenant.slug,
      contactEmail: tenant.contactEmail || '',
      contactPhone: tenant.contactPhone || '',
      maxUsers: tenant.maxUsers.toString(),
      maxCompanies: tenant.maxCompanies.toString(),
      maxStorageMb: tenant.maxStorageMb.toString(),
    });
    setEditFormError('');
  };

  // Close edit modal
  const closeEditModal = () => {
    setEditingTenant(null);
    setEditFormData({
      name: '',
      slug: '',
      contactEmail: '',
      contactPhone: '',
      maxUsers: '50',
      maxCompanies: '100',
      maxStorageMb: '10240',
    });
    setEditFormError('');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name || !formData.slug) {
      setFormError('Name and slug are required');
      return;
    }

    try {
      const newTenant = await createTenant.mutateAsync({
        name: formData.name,
        slug: formData.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        contactEmail: formData.contactEmail || undefined,
        maxUsers: parseInt(formData.maxUsers) || 50,
        maxCompanies: parseInt(formData.maxCompanies) || 100,
      });

      success('Tenant created successfully');
      setIsCreateModalOpen(false);
      setFormData({
        name: '',
        slug: '',
        contactEmail: '',
        maxUsers: '50',
        maxCompanies: '100',
      });

      // Open setup wizard for the new tenant
      setSetupWizardTenant(newTenant);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create tenant');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditFormError('');

    if (!editFormData.name || !editFormData.slug) {
      setEditFormError('Name and slug are required');
      return;
    }

    try {
      await updateTenantMutation.mutateAsync({
        name: editFormData.name,
        slug: editFormData.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        contactEmail: editFormData.contactEmail || undefined,
        contactPhone: editFormData.contactPhone || undefined,
        maxUsers: parseInt(editFormData.maxUsers) || 50,
        maxCompanies: parseInt(editFormData.maxCompanies) || 100,
        maxStorageMb: parseInt(editFormData.maxStorageMb) || 10240,
      } as Partial<Tenant>);

      success('Tenant updated successfully');
      closeEditModal();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update tenant');
    }
  };

  const handleStatusChange = async (tenant: Tenant, newStatus: string) => {
    try {
      const res = await fetch(`/api/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update tenant');
      }
      success(`Tenant ${newStatus === 'ACTIVE' ? 'activated' : 'suspended'} successfully`);
      // Refresh the tenants list
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update tenant');
    }
  };

  const handleDelete = async (reason?: string) => {
    if (!deletingTenant || !reason) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tenants/${deletingTenant.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete tenant');
      }
      success('Tenant and all associated data deleted successfully');
      setDeletingTenant(null);
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete tenant');
    } finally {
      setIsDeleting(false);
    }
  };

  // Only SUPER_ADMIN can access this page
  if (!session?.isSuperAdmin) {
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
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary flex items-center gap-2">
            <Building className="w-6 h-6" />
            Tenants
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage organizations using Oakcloud
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateModalOpen(true)}
        >
          Create Tenant
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 max-w-md">
          <FormInput
            placeholder="Search by name or slug..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            leftIcon={<Search className="w-4 h-4" />}
            inputSize="sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="input input-sm w-full sm:w-48"
        >
          <option value="">All Statuses</option>
          {TENANT_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error State */}
      {error && (
        <Alert variant="error" className="mb-4">
          {error instanceof Error ? error.message : 'Failed to load tenants'}
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12 text-text-secondary">Loading tenants...</div>
      )}

      {/* Tenants - Mobile Card View */}
      {data && (
        <div className="md:hidden space-y-3">
          {data.tenants.length === 0 ? (
            <div className="card p-8 text-center text-text-secondary">
              No tenants found
            </div>
          ) : (
            data.tenants.map((tenant: Tenant) => {
              const userCount = tenant._count?.users || 0;
              const companyCount = tenant._count?.companies || 0;
              const userPercent = Math.min((userCount / tenant.maxUsers) * 100, 100);
              const companyPercent = Math.min((companyCount / tenant.maxCompanies) * 100, 100);

              return (
                <MobileCard
                  key={tenant.id}
                  title={tenant.name}
                  subtitle={tenant.slug}
                  badge={
                    <span className={cn('badge text-xs', getStatusColor(tenant.status))}>
                      {getStatusLabel(tenant.status)}
                    </span>
                  }
                  details={
                    <div className="space-y-3">
                      {/* Contact Info */}
                      {(tenant.contactEmail || tenant.contactPhone) && (
                        <div className="text-xs space-y-1">
                          {tenant.contactEmail && (
                            <div className="flex items-center gap-1.5 text-text-secondary">
                              <Mail className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{tenant.contactEmail}</span>
                            </div>
                          )}
                          {tenant.contactPhone && (
                            <div className="flex items-center gap-1.5 text-text-secondary">
                              <Phone className="w-3 h-3 flex-shrink-0" />
                              <span>{tenant.contactPhone}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Usage Bars */}
                      <div className="space-y-2">
                        {/* Users */}
                        <div>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="text-text-muted flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              Users
                            </span>
                            <span className="text-text-secondary font-medium">
                              {userCount}/{tenant.maxUsers}
                            </span>
                          </div>
                          <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                userPercent >= 90 ? 'bg-red-500' : userPercent >= 70 ? 'bg-amber-500' : 'bg-oak-primary'
                              )}
                              style={{ width: `${userPercent}%` }}
                            />
                          </div>
                        </div>
                        {/* Companies */}
                        <div>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="text-text-muted flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              Companies
                            </span>
                            <span className="text-text-secondary font-medium">
                              {companyCount}/{tenant.maxCompanies}
                            </span>
                          </div>
                          <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                companyPercent >= 90 ? 'bg-red-500' : companyPercent >= 70 ? 'bg-amber-500' : 'bg-oak-primary'
                              )}
                              style={{ width: `${companyPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <CardDetailsGrid>
                        <CardDetailItem
                          label="Storage"
                          value={`${Math.round(tenant.maxStorageMb / 1024)}GB`}
                          icon={<HardDrive className="w-3 h-3" />}
                        />
                        <CardDetailItem
                          label="Created"
                          value={format(new Date(tenant.createdAt), 'MMM d, yyyy')}
                          icon={<Calendar className="w-3 h-3" />}
                        />
                      </CardDetailsGrid>
                    </div>
                  }
                  actions={
                    <Dropdown>
                      <DropdownTrigger asChild className="p-2 hover:bg-background-tertiary rounded min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <MoreVertical className="w-4 h-4 text-text-muted" />
                      </DropdownTrigger>
                      <DropdownMenu>
                        <DropdownItem
                          icon={<Edit className="w-4 h-4" />}
                          onClick={() => openEditModal(tenant)}
                        >
                          Edit
                        </DropdownItem>
                        {tenant.status === 'PENDING_SETUP' && (
                          <>
                            <DropdownItem
                              icon={<Settings className="w-4 h-4" />}
                              onClick={() => setSetupWizardTenant(tenant)}
                            >
                              Complete Setup
                            </DropdownItem>
                            <DropdownItem
                              icon={<Trash2 className="w-4 h-4" />}
                              onClick={() => setDeletingTenant(tenant)}
                              destructive
                            >
                              Delete
                            </DropdownItem>
                          </>
                        )}
                        {tenant.status === 'ACTIVE' && (
                          <DropdownItem
                            icon={<Pause className="w-4 h-4" />}
                            onClick={() => handleStatusChange(tenant, 'SUSPENDED')}
                            destructive
                          >
                            Suspend
                          </DropdownItem>
                        )}
                        {tenant.status === 'SUSPENDED' && (
                          <>
                            <DropdownItem
                              icon={<Play className="w-4 h-4" />}
                              onClick={() => handleStatusChange(tenant, 'ACTIVE')}
                            >
                              Activate
                            </DropdownItem>
                            <DropdownItem
                              icon={<Trash2 className="w-4 h-4" />}
                              onClick={() => setDeletingTenant(tenant)}
                              destructive
                            >
                              Delete
                            </DropdownItem>
                          </>
                        )}
                      </DropdownMenu>
                    </Dropdown>
                  }
                />
              );
            })
          )}
        </div>
      )}

      {/* Tenants Table - Desktop */}
      {data && (
        <div className="hidden md:block">
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Status</th>
                    <th>Contact</th>
                    <th>Usage</th>
                    <th>Created</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.tenants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-text-secondary">
                        No tenants found
                      </td>
                    </tr>
                  ) : (
                    data.tenants.map((tenant: Tenant) => {
                      const userCount = tenant._count?.users || 0;
                      const companyCount = tenant._count?.companies || 0;
                      const userPercent = Math.min((userCount / tenant.maxUsers) * 100, 100);
                      const companyPercent = Math.min((companyCount / tenant.maxCompanies) * 100, 100);

                      return (
                        <tr key={tenant.id}>
                          <td>
                            <div>
                              <div className="font-medium text-text-primary">{tenant.name}</div>
                              <div className="text-xs text-text-muted font-mono">{tenant.slug}</div>
                            </div>
                          </td>
                          <td>
                            <span className={cn('badge', getStatusColor(tenant.status))}>
                              {getStatusLabel(tenant.status)}
                            </span>
                          </td>
                          <td>
                            <div className="text-xs space-y-0.5">
                              {tenant.contactEmail && (
                                <div className="flex items-center gap-1.5 text-text-secondary">
                                  <Mail className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate max-w-[160px]">{tenant.contactEmail}</span>
                                </div>
                              )}
                              {tenant.contactPhone && (
                                <div className="flex items-center gap-1.5 text-text-secondary">
                                  <Phone className="w-3 h-3 flex-shrink-0" />
                                  <span>{tenant.contactPhone}</span>
                                </div>
                              )}
                              {!tenant.contactEmail && !tenant.contactPhone && (
                                <span className="text-text-muted">—</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="space-y-2 min-w-[140px]">
                              {/* Users */}
                              <div>
                                <div className="flex items-center justify-between text-xs mb-0.5">
                                  <span className="text-text-muted flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    Users
                                  </span>
                                  <span className="text-text-secondary font-medium">
                                    {userCount}/{tenant.maxUsers}
                                  </span>
                                </div>
                                <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full rounded-full transition-all',
                                      userPercent >= 90 ? 'bg-red-500' : userPercent >= 70 ? 'bg-amber-500' : 'bg-oak-primary'
                                    )}
                                    style={{ width: `${userPercent}%` }}
                                  />
                                </div>
                              </div>
                              {/* Companies */}
                              <div>
                                <div className="flex items-center justify-between text-xs mb-0.5">
                                  <span className="text-text-muted flex items-center gap-1">
                                    <Building2 className="w-3 h-3" />
                                    Companies
                                  </span>
                                  <span className="text-text-secondary font-medium">
                                    {companyCount}/{tenant.maxCompanies}
                                  </span>
                                </div>
                                <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full rounded-full transition-all',
                                      companyPercent >= 90 ? 'bg-red-500' : companyPercent >= 70 ? 'bg-amber-500' : 'bg-oak-primary'
                                    )}
                                    style={{ width: `${companyPercent}%` }}
                                  />
                                </div>
                              </div>
                              {/* Storage */}
                              <div className="flex items-center gap-1 text-xs text-text-muted">
                                <HardDrive className="w-3 h-3" />
                                <span>{Math.round(tenant.maxStorageMb / 1024)}GB storage</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="text-sm text-text-secondary">
                              {format(new Date(tenant.createdAt), 'MMM d, yyyy')}
                            </div>
                          </td>
                          <td>
                          <Dropdown>
                            <DropdownTrigger asChild className="p-1.5 hover:bg-background-tertiary rounded">
                              <MoreVertical className="w-4 h-4 text-text-muted" />
                            </DropdownTrigger>
                            <DropdownMenu>
                              <DropdownItem
                                icon={<Edit className="w-4 h-4" />}
                                onClick={() => openEditModal(tenant)}
                              >
                                Edit
                              </DropdownItem>
                              {tenant.status === 'PENDING_SETUP' && (
                                <>
                                  <DropdownItem
                                    icon={<Settings className="w-4 h-4" />}
                                    onClick={() => setSetupWizardTenant(tenant)}
                                  >
                                    Complete Setup
                                  </DropdownItem>
                                  <DropdownItem
                                    icon={<Trash2 className="w-4 h-4" />}
                                    onClick={() => setDeletingTenant(tenant)}
                                    destructive
                                  >
                                    Delete
                                  </DropdownItem>
                                </>
                              )}
                              {tenant.status === 'ACTIVE' && (
                                <DropdownItem
                                  icon={<Pause className="w-4 h-4" />}
                                  onClick={() => handleStatusChange(tenant, 'SUSPENDED')}
                                  destructive
                                >
                                  Suspend
                                </DropdownItem>
                              )}
                              {tenant.status === 'SUSPENDED' && (
                                <>
                                  <DropdownItem
                                    icon={<Play className="w-4 h-4" />}
                                    onClick={() => handleStatusChange(tenant, 'ACTIVE')}
                                  >
                                    Activate
                                  </DropdownItem>
                                  <DropdownItem
                                    icon={<Trash2 className="w-4 h-4" />}
                                    onClick={() => setDeletingTenant(tenant)}
                                    destructive
                                  >
                                    Delete
                                  </DropdownItem>
                                </>
                              )}
                            </DropdownMenu>
                          </Dropdown>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pagination - Shared between mobile and desktop */}
      {data && data.totalPages > 0 && (
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

      {/* Create Tenant Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Tenant"
        size="md"
      >
        <form onSubmit={handleCreate}>
          <ModalBody>
            {formError && (
              <Alert variant="error" className="mb-4">
                {formError}
              </Alert>
            )}

            <div className="space-y-4">
              <FormInput
                label="Tenant Name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    name: e.target.value,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                  });
                }}
                placeholder="Acme Corporation"
                required
                inputSize="sm"
              />

              <FormInput
                label="Slug"
                value={formData.slug}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                  })
                }
                placeholder="acme-corp"
                hint="URL-friendly identifier (lowercase, no spaces)"
                required
                inputSize="sm"
              />

              <FormInput
                label="Contact Email"
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                placeholder="admin@acme.com"
                inputSize="sm"
                leftIcon={<Mail className="w-4 h-4" />}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormInput
                  label="Max Users"
                  type="number"
                  value={formData.maxUsers}
                  onChange={(e) =>
                    setFormData({ ...formData, maxUsers: e.target.value })
                  }
                  min={1}
                  inputSize="sm"
                />
                <FormInput
                  label="Max Companies"
                  type="number"
                  value={formData.maxCompanies}
                  onChange={(e) =>
                    setFormData({ ...formData, maxCompanies: e.target.value })
                  }
                  min={1}
                  inputSize="sm"
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={createTenant.isPending}
              leftIcon={<Building className="w-4 h-4" />}
            >
              Create Tenant
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Edit Tenant Modal */}
      <Modal
        isOpen={!!editingTenant}
        onClose={closeEditModal}
        title="Edit Tenant"
        size="xl"
      >
        <form onSubmit={handleEdit}>
          <ModalBody>
            {editFormError && (
              <Alert variant="error" className="mb-4">
                {editFormError}
              </Alert>
            )}

            <div className="space-y-4">
              <FormInput
                label="Tenant Name"
                value={editFormData.name}
                onChange={(e) => {
                  setEditFormData({
                    ...editFormData,
                    name: e.target.value,
                  });
                }}
                placeholder="Acme Corporation"
                required
                inputSize="sm"
              />

              <FormInput
                label="Slug"
                value={editFormData.slug}
                onChange={(e) =>
                  setEditFormData({
                    ...editFormData,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                  })
                }
                placeholder="acme-corp"
                hint="URL-friendly identifier (lowercase, no spaces)"
                required
                inputSize="sm"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormInput
                  label="Contact Email"
                  type="email"
                  value={editFormData.contactEmail}
                  onChange={(e) => setEditFormData({ ...editFormData, contactEmail: e.target.value })}
                  placeholder="admin@acme.com"
                  inputSize="sm"
                  leftIcon={<Mail className="w-4 h-4" />}
                />
                <FormInput
                  label="Contact Phone"
                  value={editFormData.contactPhone}
                  onChange={(e) => setEditFormData({ ...editFormData, contactPhone: e.target.value })}
                  placeholder="+65 6123 4567"
                  inputSize="sm"
                  leftIcon={<Phone className="w-4 h-4" />}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormInput
                  label="Max Users"
                  type="number"
                  value={editFormData.maxUsers}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, maxUsers: e.target.value })
                  }
                  min={1}
                  inputSize="sm"
                />
                <FormInput
                  label="Max Companies"
                  type="number"
                  value={editFormData.maxCompanies}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, maxCompanies: e.target.value })
                  }
                  min={1}
                  inputSize="sm"
                />
                <FormInput
                  label="Storage (MB)"
                  type="number"
                  value={editFormData.maxStorageMb}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, maxStorageMb: e.target.value })
                  }
                  min={100}
                  inputSize="sm"
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={closeEditModal}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={updateTenantMutation.isPending}
              leftIcon={<Edit className="w-4 h-4" />}
            >
              Save Changes
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Setup Wizard */}
      {setupWizardTenant && (
        <TenantSetupWizard
          isOpen={!!setupWizardTenant}
          onClose={() => setSetupWizardTenant(null)}
          tenant={setupWizardTenant}
          onComplete={() => {
            setSetupWizardTenant(null);
            queryClient.invalidateQueries({ queryKey: ['tenants'] });
            success('Tenant setup completed successfully');
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deletingTenant}
        onClose={() => setDeletingTenant(null)}
        onConfirm={handleDelete}
        title={`Delete "${deletingTenant?.name}"?`}
        description={`This will permanently soft-delete the tenant and cascade to all associated users, companies, and contacts. The data can be permanently purged later from the Data Purge page.`}
        confirmLabel="Delete Tenant"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Enter the reason for deleting this tenant..."
        reasonMinLength={10}
        isLoading={isDeleting}
      />
    </div>
  );
}
