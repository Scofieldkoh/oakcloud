'use client';

import { memo } from 'react';
import Link from 'next/link';
import { formatDate, cn } from '@/lib/utils';
import { getEntityTypeLabel } from '@/lib/constants';
import { Building2, MoreHorizontal, ExternalLink, Pencil, Trash2, Square, CheckSquare, MinusSquare } from 'lucide-react';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { PrefetchLink } from '@/components/ui/prefetch-link';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import type { Company, CompanyStatus } from '@/generated/prisma';

interface CompanyWithRelations extends Company {
  addresses?: Array<{
    id: string;
    addressType: string;
    fullAddress: string;
    isCurrent: boolean;
  }>;
  _count?: {
    documents: number;
    officers: number;
    shareholders: number;
    charges: number;
  };
}

interface CompanyTableProps {
  companies: CompanyWithRelations[];
  onDelete?: (id: string) => void;
  isLoading?: boolean;
  /** Function to check if user can edit a specific company, or boolean for all */
  canEdit?: boolean | ((companyId: string) => boolean);
  /** Function to check if user can delete a specific company, or boolean for all */
  canDelete?: boolean | ((companyId: string) => boolean);
  canCreate?: boolean;
  /** Whether to show selection checkboxes */
  selectable?: boolean;
  /** Set of currently selected company IDs */
  selectedIds?: Set<string>;
  /** Handler for toggling a single item */
  onToggleOne?: (id: string) => void;
  /** Handler for toggling all items */
  onToggleAll?: () => void;
  /** Whether all items are selected */
  isAllSelected?: boolean;
  /** Whether some but not all items are selected */
  isIndeterminate?: boolean;
}

const statusConfig: Record<CompanyStatus, { color: string; label: string }> = {
  LIVE: { color: 'badge-success', label: 'Live' },
  STRUCK_OFF: { color: 'badge-error', label: 'Struck Off' },
  WINDING_UP: { color: 'badge-warning', label: 'Winding Up' },
  DISSOLVED: { color: 'badge-neutral', label: 'Dissolved' },
  IN_LIQUIDATION: { color: 'badge-warning', label: 'In Liquidation' },
  IN_RECEIVERSHIP: { color: 'badge-warning', label: 'In Receivership' },
  AMALGAMATED: { color: 'badge-info', label: 'Amalgamated' },
  CONVERTED: { color: 'badge-info', label: 'Converted' },
  OTHER: { color: 'badge-neutral', label: 'Other' },
};


interface CompanyActionsDropdownProps {
  companyId: string;
  onDelete?: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const CompanyActionsDropdown = memo(function CompanyActionsDropdown({ companyId, onDelete, canEdit, canDelete }: CompanyActionsDropdownProps) {
  // If user can only view, don't show the dropdown at all - just provide the view link
  const hasAnyAction = canEdit || canDelete;

  if (!hasAnyAction) {
    return null;
  }

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button className="p-1 rounded hover:bg-background-elevated text-text-tertiary hover:text-text-primary transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownTrigger>
      <DropdownMenu>
        <Link href={`/companies/${companyId}`}>
          <DropdownItem icon={<ExternalLink className="w-4 h-4" />}>
            View Details
          </DropdownItem>
        </Link>
        {canEdit && (
          <Link href={`/companies/${companyId}/edit`}>
            <DropdownItem icon={<Pencil className="w-4 h-4" />}>
              Edit
            </DropdownItem>
          </Link>
        )}
        {canDelete && (
          <>
            <DropdownSeparator />
            <DropdownItem
              icon={<Trash2 className="w-4 h-4" />}
              destructive
              onClick={() => onDelete?.(companyId)}
            >
              Delete
            </DropdownItem>
          </>
        )}
      </DropdownMenu>
    </Dropdown>
  );
});

export function CompanyTable({
  companies,
  onDelete,
  isLoading,
  canEdit = true,
  canDelete = true,
  canCreate = true,
  selectable = false,
  selectedIds = new Set(),
  onToggleOne,
  onToggleAll,
  isAllSelected = false,
  isIndeterminate = false,
}: CompanyTableProps) {
  // Helper to check permission - supports both boolean and function
  const checkCanEdit = (companyId: string): boolean => {
    if (typeof canEdit === 'function') return canEdit(companyId);
    return canEdit;
  };

  const checkCanDelete = (companyId: string): boolean => {
    if (typeof canDelete === 'function') return canDelete(companyId);
    return canDelete;
  };

  if (isLoading) {
    return (
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              {selectable && <th className="w-10"></th>}
              <th>Company</th>
              <th>UEN</th>
              <th>Type</th>
              <th>Status</th>
              <th>Incorporated</th>
              <th>Officers</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                {selectable && <td><div className="skeleton h-4 w-4" /></td>}
                <td><div className="skeleton h-4 w-48" /></td>
                <td><div className="skeleton h-4 w-24" /></td>
                <td><div className="skeleton h-4 w-20" /></td>
                <td><div className="skeleton h-4 w-16" /></td>
                <td><div className="skeleton h-4 w-24" /></td>
                <td><div className="skeleton h-4 w-12" /></td>
                <td><div className="skeleton h-4 w-8" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="card p-6 sm:p-12 text-center">
        <Building2 className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-text-primary mb-2">No companies found</h3>
        <p className="text-text-secondary mb-4">
          {canCreate
            ? 'Get started by creating your first company or adjusting your filters.'
            : 'No companies available. Try adjusting your filters.'}
        </p>
        {canCreate && (
          <Link href="/companies/new" className="btn-primary btn-sm inline-flex">
            Add Company
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {selectable && (
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={onToggleAll}
              className="p-2 hover:bg-background-secondary rounded transition-colors flex items-center gap-2"
              title={isAllSelected ? 'Deselect all' : 'Select all'}
            >
              {isAllSelected ? (
                <CheckSquare className="w-5 h-5 text-oak-primary" />
              ) : isIndeterminate ? (
                <MinusSquare className="w-5 h-5 text-oak-light" />
              ) : (
                <Square className="w-5 h-5 text-text-muted" />
              )}
              <span className="text-sm text-text-secondary">
                {isAllSelected ? 'Deselect all' : 'Select all'}
              </span>
            </button>
          </div>
        )}
        {companies.map((company) => {
          const isSelected = selectedIds.has(company.id);
          return (
            <MobileCard
              key={company.id}
              isSelected={isSelected}
              selectable={selectable}
              onToggle={() => onToggleOne?.(company.id)}
              title={
                <PrefetchLink
                  href={`/companies/${company.id}`}
                  prefetchType="company"
                  prefetchId={company.id}
                  className="font-medium text-text-primary hover:text-oak-light transition-colors block truncate"
                >
                  {company.name}
                </PrefetchLink>
              }
              subtitle={company.uen}
              badge={
                <span className={`badge ${statusConfig[company.status].color}`}>
                  {statusConfig[company.status].label}
                </span>
              }
              actions={
                <CompanyActionsDropdown
                  companyId={company.id}
                  onDelete={onDelete}
                  canEdit={checkCanEdit(company.id)}
                  canDelete={checkCanDelete(company.id)}
                />
              }
              details={
                <CardDetailsGrid>
                  <CardDetailItem label="Type" value={getEntityTypeLabel(company.entityType, true)} />
                  <CardDetailItem label="Incorporated" value={formatDate(company.incorporationDate)} />
                  {company.addresses?.[0] && (
                    <CardDetailItem label="Address" value={company.addresses[0].fullAddress} fullWidth />
                  )}
                </CardDetailsGrid>
              }
            />
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block table-container">
        <table className="table">
          <thead>
            <tr>
              {selectable && (
                <th className="w-10">
                  <button
                    onClick={onToggleAll}
                    className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                    title={isAllSelected ? 'Deselect all' : 'Select all'}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-oak-primary" />
                    ) : isIndeterminate ? (
                      <MinusSquare className="w-4 h-4 text-oak-light" />
                    ) : (
                      <Square className="w-4 h-4 text-text-muted" />
                    )}
                  </button>
                </th>
              )}
              <th>Company</th>
              <th>UEN</th>
              <th>Type</th>
              <th>Status</th>
              <th>Incorporated</th>
              <th>Officers</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const isSelected = selectedIds.has(company.id);
              return (
              <tr
                key={company.id}
                className={cn(
                  'transition-colors',
                  isSelected
                    ? 'bg-oak-primary/5 hover:bg-oak-primary/10'
                    : 'hover:bg-background-tertiary/50'
                )}
              >
                {selectable && (
                  <td>
                    <button
                      onClick={() => onToggleOne?.(company.id)}
                      className="p-0.5 hover:bg-background-secondary rounded transition-colors"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-oak-primary" />
                      ) : (
                        <Square className="w-4 h-4 text-text-muted" />
                      )}
                    </button>
                  </td>
                )}
                <td>
                  <PrefetchLink
                    href={`/companies/${company.id}`}
                    prefetchType="company"
                    prefetchId={company.id}
                    className="font-medium text-text-primary hover:text-oak-light transition-colors"
                  >
                    {company.name}
                  </PrefetchLink>
                  {company.addresses?.[0] && (
                    <p className="text-xs text-text-tertiary mt-0.5 truncate max-w-xs">
                      {company.addresses[0].fullAddress}
                    </p>
                  )}
                </td>
                <td className="text-text-secondary">
                  {company.uen}
                </td>
                <td className="text-text-secondary">
                  {getEntityTypeLabel(company.entityType, true)}
                </td>
                <td>
                  <span className={`badge ${statusConfig[company.status].color}`}>
                    {statusConfig[company.status].label}
                  </span>
                </td>
                <td className="text-text-secondary">
                  {formatDate(company.incorporationDate)}
                </td>
                <td className="text-text-secondary">
                  {company._count?.officers || 0}
                </td>
                <td>
                  <CompanyActionsDropdown
                    companyId={company.id}
                    onDelete={onDelete}
                    canEdit={checkCanEdit(company.id)}
                    canDelete={checkCanDelete(company.id)}
                  />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
