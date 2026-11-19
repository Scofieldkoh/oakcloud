'use client';

import type { ReactNode } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { Dropdown, DropdownMenu, DropdownTrigger } from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';

interface ActionsMenuProps {
  /** Menu items: `DropdownItem`, `DropdownSeparator` or `DropdownLabel`. */
  children: ReactNode;
  /** Button text. */
  label?: string;
  className?: string;
  /** Extra classes for the menu panel, such as a wider min width. */
  menuClassName?: string;
}

/**
 * A page-header "Actions" button that opens a menu of secondary actions, so a
 * detail page keeps one or two primary buttons (Edit, Delete) beside it.
 */
export function ActionsMenu({ children, label = 'Actions', className, menuClassName }: ActionsMenuProps) {
  return (
    <Dropdown className={className}>
      <DropdownTrigger asChild className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30">
        <span className="btn-secondary btn-sm flex items-center gap-2 whitespace-nowrap">
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
          <ChevronDown className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
        </span>
      </DropdownTrigger>
      <DropdownMenu align="right" className={cn('min-w-[240px]', menuClassName)}>
        {children}
      </DropdownMenu>
    </Dropdown>
  );
}
