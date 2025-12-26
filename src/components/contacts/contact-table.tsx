'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Users, MoreHorizontal, ExternalLink, Pencil, Trash2, Building2, Square, CheckSquare, MinusSquare } from 'lucide-react';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { PrefetchLink } from '@/components/ui/prefetch-link';
import { MobileCard, CardDetailsGrid, CardDetailItem } from '@/components/ui/responsive-table';
import { cn } from '@/lib/utils';
import type { Contact, ContactType, IdentificationType } from '@/generated/prisma';

interface ContactWithCount extends Contact {
  _count?: {
    companyRelations: number;
  };
}

interface ContactTableProps {
  contacts: ContactWithCount[];
  onDelete?: (id: string) => void;
  isLoading?: boolean;
  canEdit?: boolean | ((contactId: string) => boolean);
  canDelete?: boolean | ((contactId: string) => boolean);
  canCreate?: boolean;
  /** Enable selection mode */
  selectable?: boolean;
  /** Set of selected IDs */
  selectedIds?: Set<string>;
  /** Callback when selection changes */
  onToggleOne?: (id: string) => void;
  /** Callback when select all is toggled */
  onToggleAll?: () => void;
  /** Whether all items are selected */
  isAllSelected?: boolean;
  /** Whether some items are selected */
  isIndeterminate?: boolean;
}

const contactTypeConfig: Record<ContactType, { color: string; label: string }> = {
  INDIVIDUAL: { color: 'badge-info', label: 'Individual' },
  CORPORATE: { color: 'badge-neutral', label: 'Corporate' },
};

const idTypeLabels: Record<IdentificationType, string> = {
  NRIC: 'NRIC',
  FIN: 'FIN',
  PASSPORT: 'Passport',
  UEN: 'UEN',
  OTHER: 'Other',
};

interface ContactActionsDropdownProps {
  contactId: string;
  onDelete?: (id: string) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const ContactActionsDropdown = memo(function ContactActionsDropdown({
  contactId,
  onDelete,
  canEdit,
  canDelete,
}: ContactActionsDropdownProps) {
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
        <Link href={`/contacts/${contactId}`}>
          <DropdownItem icon={<ExternalLink className="w-4 h-4" />}>View Details</DropdownItem>
        </Link>
        {canEdit && (
          <Link href={`/contacts/${contactId}/edit`}>
            <DropdownItem icon={<Pencil className="w-4 h-4" />}>Edit</DropdownItem>
          </Link>
        )}
        {canDelete && (
          <>
            <DropdownSeparator />
            <DropdownItem
              icon={<Trash2 className="w-4 h-4" />}
              destructive
              onClick={() => onDelete?.(contactId)}
            >
              Delete
            </DropdownItem>
          </>
        )}
      </DropdownMenu>
    </Dropdown>
  );
});

export function ContactTable({
  contacts,
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
}: ContactTableProps) {
  const checkCanEdit = (contactId: string): boolean => {
    if (typeof canEdit === 'function') return canEdit(contactId);
    return canEdit;
  };

  const checkCanDelete = (contactId: string): boolean => {
    if (typeof canDelete === 'function') return canDelete(contactId);
    return canDelete;
  };

  if (isLoading) {
    return (
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              {selectable && (
                <th className="w-10">
                  <div className="skeleton h-4 w-4" />
                </th>
              )}
              <th>Name</th>
              <th>Type</th>
              <th>ID Number</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Companies</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                {selectable && (
                  <td>
                    <div className="skeleton h-4 w-4" />
                  </td>
                )}
                <td>
                  <div className="skeleton h-4 w-40" />
                </td>
                <td>
                  <div className="skeleton h-4 w-20" />
                </td>
                <td>
                  <div className="skeleton h-4 w-24" />
                </td>
                <td>
                  <div className="skeleton h-4 w-32" />
                </td>
                <td>
                  <div className="skeleton h-4 w-24" />
                </td>
                <td>
                  <div className="skeleton h-4 w-12" />
                </td>
                <td>
                  <div className="skeleton h-4 w-8" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Helper function to get ID display
  const getIdDisplay = (contact: ContactWithCount) => {
    if (contact.identificationNumber) {
      const prefix = contact.identificationType ? `${idTypeLabels[contact.identificationType]}: ` : '';
      return prefix + contact.identificationNumber;
    }
    if (contact.corporateUen) {
      return `UEN: ${contact.corporateUen}`;
    }
    return '-';
  };

  if (contacts.length === 0) {
    return (
      <div className="card p-6 sm:p-12 text-center">
        <Users className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-text-primary mb-2">No contacts found</h3>
        <p className="text-text-secondary mb-4">
          {canCreate
            ? 'Get started by creating your first contact or adjusting your filters.'
            : 'No contacts available. Try adjusting your filters.'}
        </p>
        {canCreate && (
          <Link href="/contacts/new" className="btn-primary btn-sm inline-flex">
            Add Contact
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
        {contacts.map((contact) => {
          const isSelected = selectedIds.has(contact.id);
          return (
            <MobileCard
              key={contact.id}
              isSelected={isSelected}
              selectable={selectable}
              onToggle={() => onToggleOne?.(contact.id)}
              title={
                <PrefetchLink
                  href={`/contacts/${contact.id}`}
                  prefetchType="contact"
                  prefetchId={contact.id}
                  className="font-medium text-text-primary hover:text-oak-light transition-colors block truncate"
                >
                  {contact.fullName}
                </PrefetchLink>
              }
              subtitle={contact.nationality || getIdDisplay(contact)}
              badge={
                <span className={`badge ${contactTypeConfig[contact.contactType].color}`}>
                  {contactTypeConfig[contact.contactType].label}
                </span>
              }
              actions={
                <ContactActionsDropdown
                  contactId={contact.id}
                  onDelete={onDelete}
                  canEdit={checkCanEdit(contact.id)}
                  canDelete={checkCanDelete(contact.id)}
                />
              }
              details={
                <CardDetailsGrid>
                  {contact.email && <CardDetailItem label="Email" value={contact.email} fullWidth />}
                  {contact.phone && <CardDetailItem label="Phone" value={contact.phone} />}
                  <CardDetailItem
                    label="Companies"
                    value={
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{contact._count?.companyRelations || 0}</span>
                      </div>
                    }
                  />
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
              <th>Name</th>
              <th>Type</th>
              <th>ID Number</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Companies</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => {
              const isSelected = selectedIds.has(contact.id);
              return (
              <tr
                key={contact.id}
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
                      onClick={() => onToggleOne?.(contact.id)}
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
                    href={`/contacts/${contact.id}`}
                    prefetchType="contact"
                    prefetchId={contact.id}
                    className="font-medium text-text-primary hover:text-oak-light transition-colors"
                  >
                    {contact.fullName}
                  </PrefetchLink>
                  {contact.nationality && (
                    <p className="text-xs text-text-tertiary mt-0.5">{contact.nationality}</p>
                  )}
                </td>
                <td>
                  <span className={`badge ${contactTypeConfig[contact.contactType].color}`}>
                    {contactTypeConfig[contact.contactType].label}
                  </span>
                </td>
                <td className="text-text-secondary">
                  {contact.identificationNumber ? (
                    <span>
                      {contact.identificationType && (
                        <span className="text-text-tertiary text-xs mr-1">
                          {idTypeLabels[contact.identificationType]}:
                        </span>
                      )}
                      {contact.identificationNumber}
                    </span>
                  ) : contact.corporateUen ? (
                    <span>
                      <span className="text-text-tertiary text-xs mr-1">UEN:</span>
                      {contact.corporateUen}
                    </span>
                  ) : (
                    <span className="text-text-muted">-</span>
                  )}
                </td>
                <td className="text-text-secondary">
                  {contact.email || <span className="text-text-muted">-</span>}
                </td>
                <td className="text-text-secondary">
                  {contact.phone || <span className="text-text-muted">-</span>}
                </td>
                <td>
                  <div className="flex items-center gap-1.5 text-text-secondary">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>{contact._count?.companyRelations || 0}</span>
                  </div>
                </td>
                <td>
                  <ContactActionsDropdown
                    contactId={contact.id}
                    onDelete={onDelete}
                    canEdit={checkCanEdit(contact.id)}
                    canDelete={checkCanDelete(contact.id)}
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
