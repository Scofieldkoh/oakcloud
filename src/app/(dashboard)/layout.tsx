'use client';

import { Sidebar } from '@/components/ui/sidebar';
import { AuthGuard } from '@/components/auth/auth-guard';
import { ErrorBoundary } from '@/components/error-boundary';
import { useUIStore } from '@/stores/ui-store';
import { useIsMobile } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarCollapsed } = useUIStore();
  const isMobile = useIsMobile();

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background-primary">
        <Sidebar />
        <main
          className={cn(
            'min-h-screen transition-all duration-200',
            isMobile ? 'pt-12' : sidebarCollapsed ? 'lg:ml-14' : 'lg:ml-56'
          )}
        >
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </AuthGuard>
  );
}
