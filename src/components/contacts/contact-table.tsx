'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Users, MoreHorizontal, ExternalLink, Pencil, Trash2, Building2 } from 'lucide-react';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { Checkbox } from '@/components/ui/checkbox';
import type { Contact, ContactType, IdentificationType } from '@prisma/client';

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

  if (contacts.length === 0) {
    return (
      <div className="card p-12 text-center">
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
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            {selectable && (
              <th className="w-10">
                <Checkbox
                  checked={isAllSelected}
                  indeterminate={isIndeterminate}
                  onChange={onToggleAll}
                  size="sm"
                />
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
          {contacts.map((contact) => (
            <tr
              key={contact.id}
              className={selectedIds.has(contact.id) ? 'bg-oak-primary/5' : ''}
            >
              {selectable && (
                <td>
                  <Checkbox
                    checked={selectedIds.has(contact.id)}
                    onChange={() => onToggleOne?.(contact.id)}
                    size="sm"
                  />
                </td>
              )}
              <td>
                <Link
                  href={`/contacts/${contact.id}`}
                  className="font-medium text-text-primary hover:text-oak-light transition-colors"
                >
                  {contact.fullName}
                </Link>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
