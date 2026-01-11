'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Building2, Contact, FileText, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type TabId = 'profile' | 'contacts' | 'contracts';

interface Tab {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const tabs: Tab[] = [
  { id: 'profile', label: 'Company Profile', icon: Building2 },
  { id: 'contacts', label: 'Contact Details', icon: Contact },
  { id: 'contracts', label: 'Contracts', icon: FileText },
];

interface CompanyTabsProps {
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
  hasPoc?: boolean;
}

export function CompanyTabs({ activeTab, onTabChange, hasPoc }: CompanyTabsProps) {
  return (
    <div className="flex items-center border-b border-border-primary mb-6">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        // Show warning for contacts tab when no POC
        const showWarning = tab.id === 'contacts' && hasPoc === false;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
              isActive
                ? 'text-text-primary border-b-2 border-oak-light -mb-px font-medium'
                : 'text-text-muted hover:bg-background-secondary hover:text-text-primary'
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
            {showWarning && (
              <span className="text-amber-500" title="POC required">
                <AlertTriangle className="w-4 h-4" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Custom hook for URL-persisted tab state
export function useTabState(): [TabId, (tabId: TabId) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get current tab from URL, default to 'profile'
  const currentTab = (searchParams.get('tab') as TabId) || 'profile';
  const validTabs: TabId[] = ['profile', 'contacts', 'contracts'];
  const validTab: TabId = validTabs.includes(currentTab) ? currentTab : 'profile';

  // Update URL when tab changes
  const setTab = useCallback((tabId: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tabId === 'profile') {
      // Remove tab param for default tab to keep URL clean
      params.delete('tab');
    } else {
      params.set('tab', tabId);
    }
    const queryString = params.toString();
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  return [validTab, setTab];
}
