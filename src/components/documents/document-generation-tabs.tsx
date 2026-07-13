'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Generated Documents', href: '/generated-documents' },
  { label: 'Templates', href: '/template-partials' },
] as const;

export function DocumentGenerationTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Document Generation" className="mb-6 border-b border-border-primary">
      <div className="flex gap-6">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'border-b-2 pb-3 text-sm font-medium transition-colors',
                isActive
                  ? 'border-accent-primary text-accent-primary'
                  : 'border-transparent text-text-secondary hover:border-border-secondary hover:text-text-primary'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
