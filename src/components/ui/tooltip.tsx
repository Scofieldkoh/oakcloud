'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  disabled = false,
}: TooltipProps) {
  const [open, setOpen] = useState(false);

  if (disabled || !content) {
    return <>{children}</>;
  }

  const containerPosition = side === 'top'
    ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
    : 'top-full left-1/2 -translate-x-1/2 mt-2';

  const arrowPosition = side === 'top'
    ? 'top-full left-1/2 -translate-x-1/2 border-t-slate-900 border-l-transparent border-r-transparent border-b-0'
    : 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900 border-l-transparent border-r-transparent border-t-0';

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-elevation-2 transition-all duration-150',
          containerPosition,
          open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-0.5'
        )}
      >
        {content}
        <span
          className={cn(
            'absolute h-0 w-0 border-[6px]',
            arrowPosition
          )}
        />
      </span>
    </span>
  );
}
