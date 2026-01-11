'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Briefcase,
  AlertCircle,
  Building2,
  FileText,
  RefreshCw,
  Calendar,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ExternalLink,
  MoreHorizontal,
} from 'lucide-react';
import { MobileCollapsibleSection } from '@/components/ui/collapsible-section';
import { useAllServices, type ContractServiceWithRelations } from '@/hooks/use-contract-services';
import { useSession } from '@/hooks/use-auth';
import { useActiveTenantId } from '@/components/ui/tenant-selector';
import { Pagination } from '@/components/companies/pagination';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@/components/ui/dropdown';
import { ScopeModal } from '@/components/companies/contracts';
import { formatDate, cn, formatCurrency } from '@/lib/utils';
import {
  getServiceTypeLabel,
  getServiceStatusColor,
  getServiceStatusLabel,
  getBillingFrequencyLabel,
} from '@/lib/constants/contracts';
import type { ServiceStatus, ServiceType } from '@/generated/prisma';

// Filter component for Services
interface FilterValues {
  status?: ServiceStatus;
  serviceType?: ServiceType;
}

function ServiceFilters({
  onSearch,
  onFilterChange,
  initialFilters,
  initialQuery,
}: {
  onSearch: (query: string) => void;
  onFilterChange: (filters: FilterValues) => void;
  initialFilters: FilterValues;
  initialQuery: string;
}) {
  const [searchValue, setSearchValue] = useState(initialQuery);
  const [filters, setFilters] = useState<FilterValues>(initialFilters);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch(searchValue);
    }
  };

  const handleFilterChange = (key: keyof FilterValues, value: string) => {
    const newFilters = {
      ...filters,
      [key]: value || undefined,
    };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="card p-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search services..."
            value={searchValue}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            className="w-full px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-oak-light focus:border-transparent"
          />
        </div>

        {/* Status Filter */}
        <div className="w-full sm:w-40">
          <select
            value={filters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-oak-light"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {/* Service Type Filter */}
        <div className="w-full sm:w-40">
          <select
            value={filters.serviceType || ''}
            onChange={(e) => handleFilterChange('serviceType', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-oak-light"
          >
            <option value="">All Types</option>
            <option value="RECURRING">Recurring</option>
            <option value="ONE_TIME">One-time</option>
          </select>
        </div>

        {/* Search Button */}
        <button
          onClick={() => onSearch(searchValue)}
          className="btn-primary btn-sm px-4"
        >
          Search
        </button>
      </div>
    </div>
  );
}

// Sortable column header
function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  field: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
}) {
  const isActive = sortBy === field;

  if (!onSort) {
    return <th>{label}</th>;
  }

  return (
    <th className="cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-text-primary transition-colors',
          isActive ? 'text-text-primary' : ''
        )}
      >
        <span>{label}</span>
        <span className="flex-shrink-0">
          {isActive ? (
            sortOrder === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5" />
            )
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-text-muted" />
          )}
        </span>
      </button>
    </th>
  );
}

// Service actions dropdown
function ServiceActionsDropdown({
  service,
  onViewScope,
}: {
  service: ContractServiceWithRelations;
  onViewScope: () => void;
}) {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button className="p-1 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownTrigger>
      <DropdownMenu>
        {service.scope && (
          <DropdownItem icon={<FileText className="w-4 h-4" />} onClick={onViewScope}>
            View Scope
          </DropdownItem>
        )}
        {service.contract?.company && (
          <Link href={`/companies/${service.contract.company.id}?tab=contracts`}>
            <DropdownItem icon={<ExternalLink className="w-4 h-4" />}>
              View Company
            </DropdownItem>
          </Link>
        )}
      </DropdownMenu>
    </Dropdown>
  );
}

// Service table component
function ServiceTable({
  services,
  isLoading,
  sortBy,
  sortOrder,
  onSort,
  onViewScope,
}: {
  services: ContractServiceWithRelations[];
  isLoading?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  onViewScope: (service: ContractServiceWithRelations) => void;
}) {
  if (isLoading) {
    return (
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Service Name</th>
              <th>Company</th>
              <th>Contract</th>
              <th>Type</th>
              <th>Rate</th>
              <th>Status</th>
              <th>End Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td><div className="skeleton h-4 w-40" /></td>
                <td><div className="skeleton h-4 w-32" /></td>
                <td><div className="skeleton h-4 w-28" /></td>
                <td><div className="skeleton h-4 w-20" /></td>
                <td><div className="skeleton h-4 w-24" /></td>
                <td><div className="skeleton h-4 w-16" /></td>
                <td><div className="skeleton h-4 w-24" /></td>
                <td><div className="skeleton h-4 w-8" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="card p-6 sm:p-12 text-center">
        <Briefcase className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-text-primary mb-2">No services found</h3>
        <p className="text-text-secondary mb-4">
          Services are managed under contracts. Create a contract first to add services.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {services.map((service) => (
          <MobileCard
            key={service.id}
            title={
              <span className="font-medium text-text-primary">{service.name}</span>
            }
            subtitle={service.contract?.company?.name || 'Unknown Company'}
            badge={
              <span className={`badge ${getServiceStatusColor(service.status)}`}>
                {getServiceStatusLabel(service.status)}
              </span>
            }
            actions={
              <ServiceActionsDropdown
                service={service}
                onViewScope={() => onViewScope(service)}
              />
            }
            details={
              <CardDetailsGrid>
                <CardDetailItem
                  label="Contract"
                  value={service.contract?.title || '-'}
                />
                <CardDetailItem
                  label="Type"
                  value={getServiceTypeLabel(service.serviceType)}
                />
                <CardDetailItem
                  label="Rate"
                  value={
                    service.rate
                      ? `${formatCurrency(Number(service.rate), service.currency)} ${service.frequency !== 'ONE_TIME' ? `/ ${getBillingFrequencyLabel(service.frequency).toLowerCase()}` : ''}`
                      : '-'
                  }
                />
                {service.endDate && (
                  <CardDetailItem
                    label="End Date"
                    value={formatDate(service.endDate)}
                  />
                )}
                {service.autoRenewal && (
                  <CardDetailItem
                    label="Auto Renewal"
                    value={
                      <div className="flex items-center gap-1 text-status-success">
                        <RefreshCw className="w-3 h-3" />
                        Yes
                      </div>
                    }
                  />
                )}
              </CardDetailsGrid>
            }
          />
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block table-container">
        <table className="table">
          <thead>
            <tr>
              <SortableHeader label="Service Name" field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
              <th>Company</th>
              <th>Contract</th>
              <th>Type</th>
              <SortableHeader label="Rate" field="rate" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="Status" field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="End Date" field="endDate" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id} className="hover:bg-background-tertiary/50 transition-colors">
                <td>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{service.name}</span>
                    {service.autoRenewal && (
                      <span title="Auto-renewal enabled">
                        <RefreshCw className="w-3.5 h-3.5 text-status-success" />
                      </span>
                    )}
                  </div>
                  {service.scope && (
                    <button
                      onClick={() => onViewScope(service)}
                      className="text-xs text-oak-light hover:underline mt-0.5"
                    >
                      View scope
                    </button>
                  )}
                </td>
                <td>
                  {service.contract?.company ? (
                    <Link
                      href={`/companies/${service.contract.company.id}`}
                      className="text-text-primary hover:text-oak-light transition-colors"
                    >
                      {service.contract.company.name}
                    </Link>
                  ) : (
                    <span className="text-text-muted">-</span>
                  )}
                </td>
                <td>
                  {service.contract ? (
                    <Link
                      href={`/companies/${service.contract.companyId}?tab=contracts`}
                      className="text-text-secondary hover:text-oak-light transition-colors"
                    >
                      {service.contract.title}
                    </Link>
                  ) : (
                    <span className="text-text-muted">-</span>
                  )}
                </td>
                <td>
                  <span className="text-text-secondary">
                    {getServiceTypeLabel(service.serviceType)}
                  </span>
                </td>
                <td>
                  {service.rate ? (
                    <div className="text-text-primary">
                      <span className="font-medium">
                        {formatCurrency(Number(service.rate), service.currency)}
                      </span>
                      {service.frequency !== 'ONE_TIME' && (
                        <span className="text-xs text-text-muted ml-1">
                          / {getBillingFrequencyLabel(service.frequency).toLowerCase()}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-text-muted">-</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${getServiceStatusColor(service.status)}`}>
                    {getServiceStatusLabel(service.status)}
                  </span>
                </td>
                <td>
                  {service.endDate ? (
                    <div className="flex items-center gap-1.5 text-text-secondary">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(service.endDate)}
                    </div>
                  ) : (
                    <span className="text-text-muted">-</span>
                  )}
                </td>
                <td>
                  <ServiceActionsDropdown
                    service={service}
                    onViewScope={() => onViewScope(service)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function ServicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  // Get active tenant ID
  const activeTenantId = useActiveTenantId(
    session?.isSuperAdmin ?? false,
    session?.tenantId
  );

  // Parse URL params
  const getParamsFromUrl = useCallback(() => {
    return {
      query: searchParams.get('q') || '',
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: parseInt(searchParams.get('limit') || '20', 10),
      sortBy: (searchParams.get('sortBy') || 'updatedAt') as 'name' | 'startDate' | 'endDate' | 'status' | 'rate' | 'updatedAt' | 'createdAt',
      sortOrder: (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc',
      status: (searchParams.get('status') || undefined) as ServiceStatus | undefined,
      serviceType: (searchParams.get('serviceType') || undefined) as ServiceType | undefined,
    };
  }, [searchParams]);

  const [params, setParams] = useState(getParamsFromUrl);

  // Scope modal state
  const [scopeModal, setScopeModal] = useState<{
    serviceName: string;
    scope: string;
  } | null>(null);

  // Fetch services
  const { data, isLoading, error } = useAllServices({
    ...params,
  });

  // Calculate stats from current data
  const stats = useMemo(() => {
    if (!data) return null;
    const services = data.services || [];
    const active = services.filter((s) => s.status === 'ACTIVE').length;
    const recurring = services.filter((s) => s.serviceType === 'RECURRING').length;
    const oneTime = services.filter((s) => s.serviceType === 'ONE_TIME').length;
    return {
      total: data.total,
      active,
      recurring,
      oneTime,
    };
  }, [data]);

  // Memoize URL construction
  const targetUrl = useMemo(() => {
    const urlParams = new URLSearchParams();

    if (params.query) urlParams.set('q', params.query);
    if (params.page > 1) urlParams.set('page', params.page.toString());
    if (params.limit !== 20) urlParams.set('limit', params.limit.toString());
    if (params.sortBy !== 'updatedAt') urlParams.set('sortBy', params.sortBy);
    if (params.sortOrder !== 'desc') urlParams.set('sortOrder', params.sortOrder);
    if (params.status) urlParams.set('status', params.status);
    if (params.serviceType) urlParams.set('serviceType', params.serviceType);

    const queryString = urlParams.toString();
    return queryString ? `/services?${queryString}` : '/services';
  }, [params]);

  // Reset page when tenant changes
  useEffect(() => {
    setParams((prev) => ({ ...prev, page: 1 }));
  }, [activeTenantId]);

  // Sync URL when params change
  useEffect(() => {
    if (window.location.pathname + window.location.search !== targetUrl) {
      router.replace(targetUrl, { scroll: false });
    }
  }, [targetUrl, router]);

  const handleSearch = (query: string) => {
    setParams((prev) => ({ ...prev, query, page: 1 }));
  };

  const handleFilterChange = (newFilters: FilterValues) => {
    setParams((prev) => ({
      ...prev,
      ...newFilters,
      page: 1,
    }));
  };

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }));
  };

  const handleLimitChange = (limit: number) => {
    setParams((prev) => ({ ...prev, limit, page: 1 }));
  };

  const handleSort = (field: string) => {
    setParams((prev) => {
      if (prev.sortBy === field) {
        return { ...prev, sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' };
      }
      return { ...prev, sortBy: field as typeof prev.sortBy, sortOrder: 'asc' };
    });
  };

  const handleViewScope = (service: ContractServiceWithRelations) => {
    if (service.scope) {
      setScopeModal({
        serviceName: service.name,
        scope: service.scope,
      });
    }
  };

  // Calculate pagination
  const totalPages = data ? Math.ceil(data.total / params.limit) : 0;

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Services Overview</h1>
          <p className="text-text-secondary text-sm mt-1">
            View and manage all services across your companies
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <MobileCollapsibleSection title="Statistics" count={4} className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-oak-primary/10">
                  <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-oak-light" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">{stats.total}</p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Total Services</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-success/10">
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-status-success" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.active}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Active</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-info/10">
                  <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-status-info" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.recurring}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">Recurring</p>
                </div>
              </div>
            </div>

            <div className="card p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-status-warning/10">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-status-warning" />
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold text-text-primary">
                    {stats.oneTime}
                  </p>
                  <p className="text-xs sm:text-sm text-text-tertiary">One-time</p>
                </div>
              </div>
            </div>
          </div>
        </MobileCollapsibleSection>
      )}

      {/* Filters */}
      <div className="mb-6">
        <ServiceFilters
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          initialFilters={{
            status: params.status,
            serviceType: params.serviceType,
          }}
          initialQuery={params.query}
        />
      </div>

      {/* Error State */}
      {error && (
        <div className="card p-4 border-status-error bg-status-error/5 mb-6">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{error instanceof Error ? error.message : 'Failed to load services'}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="mb-6">
        <ServiceTable
          services={data?.services || []}
          isLoading={isLoading}
          sortBy={params.sortBy}
          sortOrder={params.sortOrder}
          onSort={handleSort}
          onViewScope={handleViewScope}
        />
      </div>

      {/* Pagination */}
      {data && totalPages > 0 && (
        <Pagination
          page={params.page}
          totalPages={totalPages}
          total={data.total}
          limit={params.limit}
          onPageChange={handlePageChange}
          onLimitChange={handleLimitChange}
        />
      )}

      {/* Scope Modal */}
      {scopeModal && (
        <ScopeModal
          isOpen={true}
          onClose={() => setScopeModal(null)}
          serviceName={scopeModal.serviceName}
          scope={scopeModal.scope}
        />
      )}
    </div>
  );
}
