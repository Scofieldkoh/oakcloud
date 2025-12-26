'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | '6xl' | 'full';
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
}

// Mobile-first sizing: smaller screens use more width, larger screens use fixed max-width
const sizeClasses = {
  sm: 'max-w-[calc(100vw-2rem)] sm:max-w-sm',      // Mobile: full width - padding, SM+: 384px
  md: 'max-w-[calc(100vw-2rem)] sm:max-w-md',      // Mobile: full width - padding, SM+: 448px
  lg: 'max-w-[calc(100vw-2rem)] sm:max-w-lg',      // Mobile: full width - padding, SM+: 512px
  xl: 'max-w-[calc(100vw-2rem)] sm:max-w-xl',      // Mobile: full width - padding, SM+: 576px
  '2xl': 'max-w-[calc(100vw-2rem)] sm:max-w-2xl',  // Mobile: full width - padding, SM+: 672px
  '4xl': 'max-w-[calc(100vw-2rem)] md:max-w-4xl',  // Mobile: full width - padding, MD+: 896px
  '5xl': 'max-w-[calc(100vw-2rem)] md:max-w-5xl',  // Mobile: full width - padding, MD+: 1024px
  '6xl': 'max-w-[calc(100vw-2rem)] lg:max-w-6xl',  // Mobile: full width - padding, LG+: 1152px
  full: 'max-w-[calc(100vw-2rem)] sm:max-w-[90vw]', // Always responsive
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [wasOpen, setWasOpen] = useState(false);

  // Handle escape key - use stable callback
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        onCloseRef.current();
      }
    },
    [closeOnEscape]
  );

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current && closeOnOverlayClick) {
        onCloseRef.current();
      }
    },
    [closeOnOverlayClick]
  );

  // Add/remove event listeners and body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';

      // Focus modal content only on initial open, not on re-renders
      if (!wasOpen) {
        contentRef.current?.focus();
        setWasOpen(true);
      }
    } else {
      setWasOpen(false);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape, wasOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        className={cn(
          'w-full bg-background-secondary border border-border-primary rounded-2xl shadow-elevation-3 outline-none',
          'transform transition-all duration-150',
          sizeClasses[size],
          className
        )}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between p-4 border-b border-border-primary">
            <div>
              {title && (
                <h2 id="modal-title" className="text-lg font-semibold text-text-primary">
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-description" className="text-sm text-text-secondary mt-1">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 sm:p-1 -m-1 rounded hover:bg-background-elevated text-text-muted hover:text-text-primary transition-colors min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className={cn(!title && !showCloseButton && 'pt-4')}>{children}</div>
      </div>
    </div>
  );

  // Use portal to render modal at document body level
  if (typeof window === 'undefined') return null;
  return createPortal(modalContent, document.body);
}

// Modal subcomponents for flexible composition
export function ModalBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

export function ModalFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-end gap-3 p-4 border-t border-border-primary', className)}>
      {children}
    </div>
  );
}
