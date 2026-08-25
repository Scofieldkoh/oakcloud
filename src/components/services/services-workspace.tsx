'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useServicesWorkspaceSettings } from '@/hooks/use-services-workspace-settings';
import { ServiceRoster } from '@/components/services/roster/service-roster';
import { DeadlineWorkspace } from '@/components/services/deadlines/deadline-workspace';
import { BillingWorkspace } from '@/components/services/billing/billing-workspace';

type ServicesWorkspaceTab = 'services' | 'deadlines' | 'billing';

interface ServicesWorkspaceProps {
  workspaceId?: string;
  canEdit?: boolean;
  canCreate?: boolean;
}

function activeTab(value: string | null): ServicesWorkspaceTab {
  return value === 'deadlines' || value === 'billing' ? value : 'services';
}

export function ServicesWorkspace({ workspaceId, canEdit = true, canCreate = true }: ServicesWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const settings = useServicesWorkspaceSettings();
  const tab = activeTab(searchParams.get('tab'));

  if (settings.isLoading) {
    return <div role="status" className="p-4 text-sm text-text-secondary sm:p-6">Loading Services workspace…</div>;
  }

  if (settings.error) {
    return <div role="alert" className="m-4 rounded-xl border border-status-error/30 bg-status-error/5 p-4 text-sm text-status-error sm:m-6">Unable to load Services workspace settings.</div>;
  }

  if (settings.data?.workspaceEnabled !== true) {
    return (
      <div role="status" className="m-4 rounded-xl border border-border-primary bg-background-secondary p-4 text-sm text-text-secondary sm:m-6">
        Services workspace is unavailable for this workspace.
      </div>
    );
  }

  const selectTab = (nextTab: ServicesWorkspaceTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <main className="ml-4 p-4 pl-0 sm:ml-6 sm:p-6 sm:pl-0">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">Services</h1>
        <p className="mt-1 text-sm text-text-secondary">Manage cross-company services, deadlines, and billing tracking.</p>
      </header>

      <div role="tablist" aria-label="Services workspace sections" className="mb-6 flex items-center overflow-x-auto border-b border-border-primary">
        {(['services', 'deadlines', 'billing'] as const).map((tabId) => (
          <button
            key={tabId}
            type="button"
            role="tab"
            aria-selected={tab === tabId}
            onClick={() => selectTab(tabId)}
            className={`min-h-11 shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors sm:min-h-8 ${tab === tabId ? 'border-oak-primary text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
          >
            {tabId.charAt(0).toUpperCase() + tabId.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'services' ? (
        <ServiceRoster workspaceId={workspaceId} canEdit={canEdit} canCreate={canCreate} />
      ) : tab === 'deadlines' ? (
        <DeadlineWorkspace workspaceId={workspaceId} canEdit={canEdit} deadlineWritesEnabled={settings.data.deadlineWritesEnabled} />
      ) : (
        <BillingWorkspace workspaceId={workspaceId} canEdit={canEdit} />
      )}
    </main>
  );
}
