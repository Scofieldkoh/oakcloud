'use client';

import type { ReactNode } from 'react';
import { useSession } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useActiveWorkspaceId } from '@/components/ui/workspace-selector';

export type LibraryView = 'word' | 'archived';

/**
 * A4 templates and HTML partials are archived: read-only, kept for existing
 * documents and links, and listed only when this switch asks for them.
 */
export function LibraryViewSelect({
  value,
  onChange,
  noun,
}: {
  value: LibraryView;
  onChange: (view: LibraryView) => void;
  noun: 'templates' | 'partials';
}) {
  return (
    <select
      aria-label={`Show ${noun}`}
      value={value}
      onChange={(e) => onChange(e.target.value as LibraryView)}
      className="h-9 px-3 text-sm border border-border-primary rounded-md bg-background-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50 w-full sm:w-52"
    >
      <option value="word">Word {noun}</option>
      <option value="archived">Archived A4 {noun}</option>
    </select>
  );
}

type Permissions = ReturnType<typeof usePermissions>['can'];

/** Page frame shared by the Document Templates and Partials pages. */
export function TemplateLibraryShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: (context: { activeTenantId: string; can: Permissions; isSuperAdmin: boolean }) => ReactNode;
}) {
  const { data: session } = useSession();
  const { can } = usePermissions();
  const isSuperAdmin = session?.isSuperAdmin ?? false;
  const activeTenantId = useActiveWorkspaceId(isSuperAdmin, session?.tenantId);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">{title}</h1>
        <p className="text-sm text-text-secondary mt-1">{description}</p>
      </div>
      {activeTenantId ? children({ activeTenantId, can, isSuperAdmin }) : null}
    </div>
  );
}
