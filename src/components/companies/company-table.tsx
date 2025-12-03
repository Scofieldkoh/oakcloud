'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { Building2, MoreHorizontal, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import type { Company, CompanyStatus, EntityType } from '@prisma/client';

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
  canEdit?: boolean;
  canDelete?: boolean;
  canCreate?: boolean;
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

const entityTypeLabels: Record<EntityType, string> = {
  PRIVATE_LIMITED: 'Private Limited',
  PUBLIC_LIMITED: 'Public Limited',
  SOLE_PROPRIETORSHIP: 'Sole Prop.',
  PARTNERSHIP: 'Partnership',
  LIMITED_PARTNERSHIP: 'LP',
  LIMITED_LIABILITY_PARTNERSHIP: 'LLP',
  FOREIGN_COMPANY: 'Foreign',
  VARIABLE_CAPITAL_COMPANY: 'VCC',
  OTHER: 'Other',
};

interface CompanyActionsDropdownProps {
  companyId: string;
  onDelete?: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

function CompanyActionsDropdown({ companyId, onDelete, canEdit, canDelete }: CompanyActionsDropdownProps) {
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
}

export function CompanyTable({ companies, onDelete, isLoading, canEdit = true, canDelete = true, canCreate = true }: CompanyTableProps) {
  if (isLoading) {
    return (
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
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
      <div className="card p-12 text-center">
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
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
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
          {companies.map((company) => (
            <tr key={company.id}>
              <td>
                <Link
                  href={`/companies/${company.id}`}
                  className="font-medium text-text-primary hover:text-oak-light transition-colors"
                >
                  {company.name}
                </Link>
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
                {entityTypeLabels[company.entityType]}
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
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
