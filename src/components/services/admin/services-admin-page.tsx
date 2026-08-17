'use client';

import { useSession } from '@/hooks/use-auth';
import { useActiveWorkspaceId } from '@/components/ui/workspace-selector';
import { ServiceCatalogPanel } from './catalog/service-catalog-panel';

export function ServicesAdminPage() {
  const { data: session, isLoading } = useSession();
  const workspaceId = useActiveWorkspaceId(
    session?.isSuperAdmin ?? false,
    session?.tenantId,
  );
  const canAdminister = Boolean(
    session && (session.isSuperAdmin || session.isWorkspaceAdmin),
  );

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="p-4 text-sm text-text-secondary sm:p-6"
      >
        Loading services administration…
      </div>
    );
  }

  if (!canAdminister) {
    return (
      <main className="p-4 sm:p-6">
        <div
          role="alert"
          className="rounded-lg border border-border-primary bg-background-secondary p-6"
        >
          <h1 className="text-lg font-semibold text-text-primary">
            Services administration
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Tenant Admin access is required.
          </p>
        </div>
      </main>
    );
  }

  if (!workspaceId) {
    return (
      <main className="p-4 sm:p-6">
        <div
          role="alert"
          className="rounded-lg border border-border-primary bg-background-secondary p-6"
        >
          <h1 className="text-lg font-semibold text-text-primary">
            Services administration
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Select a workspace to administer services.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
          Services administration
        </h1>
        <p className="text-sm text-text-secondary">
          Manage service offerings and their presentation.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Services administration sections"
        className="flex flex-wrap gap-x-2 border-b border-border-primary"
      >
        <button
          type="button"
          role="tab"
          id="service-catalog-tab"
          aria-selected="true"
          aria-controls="service-catalog-panel"
          tabIndex={0}
          className="border-b-2 border-oak-primary px-3 py-2 text-sm font-medium text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30"
        >
          Service catalog
        </button>
      </div>

      <section id="service-catalog-panel" aria-labelledby="service-catalog-tab" className="pt-1">
        <ServiceCatalogPanel
          workspaceId={workspaceId}
          canCreate
          canUpdate
          canDelete
        />
      </section>
    </main>
  );
}

export default ServicesAdminPage;
