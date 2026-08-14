'use client';

import { useId, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BatchSectionProps {
  title: string;
  description?: string;
  /**
   * Optional completion summary rendered in the header so a collapsed section
   * still tells the user whether it needs attention.
   */
  status?: { complete: boolean; label: string } | null;
  /** Header-aligned control, e.g. an apply-to-others menu. */
  action?: ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: ReactNode;
}

export function BatchSection({
  title,
  description,
  status = null,
  action,
  defaultOpen = true,
  collapsible = true,
  children,
}: BatchSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const headingId = `${contentId}-heading`;
  const expanded = collapsible ? open : true;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-border-primary bg-background-primary"
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {collapsible ? (
          <h3 id={headingId} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-expanded={expanded}
              aria-controls={contentId}
              className="flex min-h-9 w-full min-w-0 items-center gap-2 text-left"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text-primary">
                  {title}
                </span>
                {description && (
                  <span className="block text-xs font-normal text-text-muted">
                    {description}
                  </span>
                )}
              </span>
              <span className="ml-auto shrink-0 text-text-muted">
                {expanded
                  ? <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
              </span>
            </button>
          </h3>
        ) : (
          <div className="min-w-0 flex-1">
            <h3 id={headingId} className="text-sm font-medium text-text-primary">{title}</h3>
            {description && <p className="text-xs text-text-muted">{description}</p>}
          </div>
        )}

        {status && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              status.complete
                ? 'bg-status-success/10 text-status-success'
                : 'bg-status-warning/10 text-status-warning',
            )}
          >
            {status.complete
              ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              : <AlertCircle className="h-3 w-3" aria-hidden="true" />}
            {status.label}
          </span>
        )}

        {action && <div className="shrink-0">{action}</div>}
      </div>

      {expanded && (
        <div id={contentId} className="border-t border-border-secondary p-3">
          {children}
        </div>
      )}
    </section>
  );
}
