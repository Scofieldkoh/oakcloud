'use client';

import { useState, createContext, useContext, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useClickOutside } from '@/hooks/use-click-outside';
import { cn } from '@/lib/utils';

// Context for sharing dropdown state
interface DropdownContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  close: () => void;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdownContext() {
  const context = useContext(DropdownContext);
  if (!context) {
    throw new Error('Dropdown components must be used within a Dropdown');
  }
  return context;
}

// Root Dropdown component
interface DropdownProps {
  children: ReactNode;
  className?: string;
}

export function Dropdown({ children, className }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setIsOpen(false), isOpen);

  const close = () => setIsOpen(false);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen, close }}>
      <div ref={ref} className={cn('relative', className)}>
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

// Dropdown trigger button
interface DropdownTriggerProps {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
}

export function DropdownTrigger({ children, className, asChild }: DropdownTriggerProps) {
  const { isOpen, setIsOpen } = useDropdownContext();

  const handleClick = () => setIsOpen(!isOpen);

  if (asChild) {
    // Clone the child and add onClick
    return (
      <span onClick={handleClick} className={cn('cursor-pointer', className)}>
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md',
        'bg-background-elevated border border-border-primary',
        'hover:bg-background-tertiary text-text-primary',
        'transition-colors',
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn(
          'w-4 h-4 text-text-muted transition-transform',
          isOpen && 'rotate-180'
        )}
      />
    </button>
  );
}

// Dropdown menu container
interface DropdownMenuProps {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right';
  sideOffset?: number;
}

export function DropdownMenu({
  children,
  className,
  align = 'right',
  sideOffset = 4,
}: DropdownMenuProps) {
  const { isOpen } = useDropdownContext();

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'absolute z-50 min-w-[180px] py-1.5 rounded-xl',
        'bg-background-elevated border border-border-primary shadow-elevation-2',
        'animate-fade-in',
        align === 'left' ? 'left-0' : 'right-0',
        className
      )}
      style={{ marginTop: sideOffset }}
    >
      {children}
    </div>
  );
}

// Dropdown menu item
interface DropdownItemProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: ReactNode;
}

export function DropdownItem({
  children,
  className,
  onClick,
  disabled,
  destructive,
  icon,
}: DropdownItemProps) {
  const { close } = useDropdownContext();

  const handleClick = () => {
    if (disabled) return;
    onClick?.();
    close();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left',
        'hover:bg-background-tertiary transition-colors',
        disabled && 'opacity-50 cursor-not-allowed',
        destructive ? 'text-status-error' : 'text-text-primary',
        className
      )}
    >
      {icon && <span className="w-4 h-4 flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

// Dropdown separator
export function DropdownSeparator({ className }: { className?: string }) {
  return <div className={cn('my-1 border-t border-border-primary', className)} />;
}

// Dropdown label (non-interactive)
export function DropdownLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'px-3 py-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wider',
        className
      )}
    >
      {children}
    </div>
  );
}
