'use client';

import { useState, createContext, useContext, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Context for sharing dropdown state
interface DropdownContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  close: () => void;
  triggerRef: React.RefObject<HTMLDivElement | null>;
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
  const triggerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside both the container and any portal-rendered menu
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !(target as Element).closest?.('[data-dropdown-menu]')
      ) {
        close();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, close]);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen, close, triggerRef }}>
      <div ref={containerRef} className={cn('relative', className)}>
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
  const { isOpen, setIsOpen, triggerRef } = useDropdownContext();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  if (asChild) {
    // Clone the child and add onClick
    return (
      <div ref={triggerRef} onClick={handleClick} className={cn('cursor-pointer inline-flex', className)}>
        {children}
      </div>
    );
  }

  return (
    <div ref={triggerRef}>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-2.5 sm:py-2 text-sm rounded-md min-h-[44px] sm:min-h-0',
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
    </div>
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
  const { isOpen, triggerRef } = useDropdownContext();
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle client-side mounting for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = 180; // min-width of the menu

      let left: number;
      if (align === 'left') {
        left = rect.left;
      } else {
        left = rect.right - menuWidth;
      }

      // Ensure menu doesn't go off-screen horizontally
      if (left < 8) {
        left = 8;
      } else if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }

      // Calculate vertical position - prefer below, but flip if not enough space
      let top = rect.bottom + sideOffset;
      const menuHeight = menuRef.current?.offsetHeight || 150; // Estimate if not yet rendered

      if (top + menuHeight > window.innerHeight - 8) {
        // Not enough space below, try above
        top = rect.top - menuHeight - sideOffset;
        if (top < 8) {
          // Not enough space above either, position at bottom of viewport
          top = window.innerHeight - menuHeight - 8;
        }
      }

      setPosition({ top, left });
    }
  }, [isOpen, triggerRef, align, sideOffset]);

  if (!isOpen || !mounted) return null;

  const menuContent = (
    <div
      ref={menuRef}
      data-dropdown-menu
      className={cn(
        'fixed z-[100] min-w-[180px] py-1.5 rounded-xl',
        'bg-background-elevated border border-border-primary shadow-elevation-2',
        'animate-fade-in',
        className
      )}
      style={{ top: position.top, left: position.left }}
    >
      {children}
    </div>
  );

  return createPortal(menuContent, document.body);
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
        'w-full flex items-center gap-2.5 px-3.5 py-2.5 sm:py-2 text-sm text-left min-h-[44px] sm:min-h-0',
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
