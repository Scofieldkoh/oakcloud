'use client';

import { useRouter } from 'next/navigation';
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSeparator,
} from '@/components/ui/dropdown';
import { MoreHorizontal, Eye, Pencil, Trash2, Archive, RotateCcw } from 'lucide-react';
import type { ChartOfAccount } from '@/hooks/use-chart-of-accounts';

interface AccountActionsDropdownProps {
  account: ChartOfAccount;
  onEdit?: (account: ChartOfAccount) => void;
  onDelete?: (account: ChartOfAccount) => void;
  onArchive?: (account: ChartOfAccount) => void;
  onRestore?: (account: ChartOfAccount) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function AccountActionsDropdown({
  account,
  onEdit,
  onDelete,
  onArchive,
  onRestore,
  canEdit = true,
  canDelete = true,
}: AccountActionsDropdownProps) {
  const router = useRouter();
  const isSystem = account.isSystem;
  const isArchived = account.status === 'ARCHIVED';

  const handleViewDetails = () => {
    router.push(`/admin/chart-of-accounts/${account.id}`);
  };

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className="p-2 rounded hover:bg-background-elevated text-text-muted hover:text-text-primary transition-colors"
          aria-label="Account actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownTrigger>
      <DropdownMenu>
        {/* View Details - always available */}
        <DropdownItem
          icon={<Eye className="w-4 h-4" />}
          onClick={handleViewDetails}
        >
          View Details
        </DropdownItem>

        {/* Edit - only for non-system accounts */}
        {onEdit && canEdit && !isSystem && (
          <DropdownItem
            icon={<Pencil className="w-4 h-4" />}
            onClick={() => onEdit(account)}
          >
            Edit
          </DropdownItem>
        )}

        {onArchive && !isArchived && canEdit && !isSystem && (
          <DropdownItem
            icon={<Archive className="w-4 h-4" />}
            onClick={() => onArchive(account)}
          >
            Archive
          </DropdownItem>
        )}

        {onRestore && isArchived && canEdit && (
          <DropdownItem
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => onRestore(account)}
          >
            Restore
          </DropdownItem>
        )}

        {onDelete && canDelete && !isSystem && (
          <>
            <DropdownSeparator />
            <DropdownItem
              icon={<Trash2 className="w-4 h-4" />}
              onClick={() => onDelete(account)}
              destructive
            >
              Delete
            </DropdownItem>
          </>
        )}
      </DropdownMenu>
    </Dropdown>
  );
}
