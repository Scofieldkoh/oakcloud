'use client';

import { useSession } from '@/hooks/use-auth';
import { useActiveWorkspaceId } from '@/components/ui/workspace-selector';
import { useServicesWorkspaceSettings } from '@/hooks/use-services-workspace-settings';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { ServiceCatalogPanel } from './catalog/service-catalog-panel';
import { DeadlineRulesPanel } from './deadline-rules-panel';
import { BusinessCalendarPanel } from './business-calendar-panel';

type ServicesAdminTab = 'catalog' | 'rules' | 'calendar';

const TAB_QUERY = 'tab';
const TAB_VALUES: ServicesAdminTab[] = ['catalog', 'rules', 'calendar'];

function tabFromLocation(): ServicesAdminTab {
  if (typeof window === 'undefined') return 'catalog';
  const value = new URLSearchParams(window.location.search).get(TAB_QUERY);
  if (value === 'service-catalog') return 'catalog';
  if (value === 'deadline-rules') return 'rules';
  if (value === 'business-calendar') return 'calendar';
  return TAB_VALUES.includes(value as ServicesAdminTab)
    ? (value as ServicesAdminTab)
    : 'catalog';
}

function tabId(tab: ServicesAdminTab) {
  return tab === 'catalog' ? 'service-catalog-tab' : `${tab === 'rules' ? 'deadline-rules' : 'business-calendar'}-tab`;
}

function panelId(tab: ServicesAdminTab) {
  return tab === 'catalog' ? 'service-catalog-panel' : `${tab === 'rules' ? 'deadline-rules' : 'business-calendar'}-panel`;
}

export function ServicesAdminPage() {
  const { data: session, isLoading } = useSession();
  const workspaceId = useActiveWorkspaceId(
    session?.isSuperAdmin ?? false,
    session?.tenantId,
  );
  const canAdminister = Boolean(
    session && (session.isSuperAdmin || session.isWorkspaceAdmin),
  );
  const settings = useServicesWorkspaceSettings();
  const [activeTab, setActiveTab] = useState<ServicesAdminTab>(tabFromLocation);

  useEffect(() => {
    const handlePopState = () => setActiveTab(tabFromLocation());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const selectTab = (tab: ServicesAdminTab) => {
    setActiveTab(tab);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set(TAB_QUERY, tab);
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: ServicesAdminTab) => {
    const currentIndex = TAB_VALUES.indexOf(tab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % TAB_VALUES.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + TAB_VALUES.length) % TAB_VALUES.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TAB_VALUES.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = TAB_VALUES[nextIndex];
    selectTab(nextTab);
    document.getElementById(tabId(nextTab))?.focus();
  };

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

  if (settings.isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="p-4 text-sm text-text-secondary sm:p-6"
      >
        Loading Services administration settings…
      </div>
    );
  }

  if (settings.error) {
    return (
      <main className="p-4 sm:p-6">
        <div role="alert" className="space-y-3 rounded-lg border border-status-error/30 bg-status-error/5 p-6 text-sm text-status-error">
          <p>Unable to load Services administration settings.</p>
          <button type="button" className="min-h-[44px] rounded-lg border border-status-error/40 px-4 text-sm font-medium text-status-error focus:outline-none focus-visible:ring-2 focus-visible:ring-status-error/30" onClick={() => void settings.refetch()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (settings.data?.workspaceEnabled !== true) {
    return (
      <main className="p-4 sm:p-6">
        <div role="status" className="rounded-lg border border-border-primary bg-background-secondary p-6 text-sm text-text-secondary">
          Services administration is unavailable for this workspace.
        </div>
      </main>
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
    <main className="ml-4 p-4 pl-0 sm:ml-6 sm:p-6 sm:pl-0">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
          Services administration
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Manage service offerings, deadline rules, and business calendars.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Services administration sections"
        className="mb-6 flex overflow-x-auto border-b border-border-primary"
      >
        {([
          ['catalog', 'Service catalog'],
          ['rules', 'Deadline rules'],
          ['calendar', 'Business calendar'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={tabId(tab)}
            aria-selected={activeTab === tab}
            aria-controls={panelId(tab)}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => selectTab(tab)}
            onKeyDown={(event) => handleTabKeyDown(event, tab)}
            className={`min-h-11 shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30 sm:min-h-8 ${
              activeTab === tab
                ? 'border-oak-primary text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section
        id="service-catalog-panel"
        role="tabpanel"
        aria-labelledby="service-catalog-tab"
        hidden={activeTab !== 'catalog'}
        aria-hidden={activeTab !== 'catalog'}
      >
        <ServiceCatalogPanel
          workspaceId={workspaceId}
          canCreate
          canUpdate
          canDelete
          active={activeTab === 'catalog'}
        />
      </section>

      <section
        id="deadline-rules-panel"
        role="tabpanel"
        aria-labelledby="deadline-rules-tab"
        hidden={activeTab !== 'rules'}
        aria-hidden={activeTab !== 'rules'}
      >
        <DeadlineRulesPanel workspaceId={workspaceId} featureEnabled={settings.data.workspaceEnabled} active={activeTab === 'rules'} />
      </section>

      <section
        id="business-calendar-panel"
        role="tabpanel"
        aria-labelledby="business-calendar-tab"
        hidden={activeTab !== 'calendar'}
        aria-hidden={activeTab !== 'calendar'}
      >
        <BusinessCalendarPanel workspaceId={workspaceId} featureEnabled={settings.data.workspaceEnabled} active={activeTab === 'calendar'} />
      </section>
    </main>
  );
}

export default ServicesAdminPage;
