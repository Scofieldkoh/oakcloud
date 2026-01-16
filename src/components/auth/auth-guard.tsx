'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/use-auth';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { data: user, isLoading, isFetched } = useSession();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (isFetched && !user && !isRedirecting) {
      setIsRedirecting(true);
      router.push('/login');
    }
  }, [user, isFetched, router, isRedirecting]);

  // If we're redirecting to login, show nothing to avoid flash
  if (isRedirecting || (isFetched && !user)) {
    return null;
  }

  // Non-blocking approach: show children immediately with loading overlay
  // This allows skeleton loaders (loading.tsx) to render while auth checks
  // The overlay only shows briefly while session is being validated
  if (isLoading) {
    return (
      <div className="relative">
        {/* Render children (including skeleton loaders) */}
        <div className="opacity-70 pointer-events-none">{children}</div>
        {/* Subtle loading indicator in corner */}
        <div className="fixed top-4 right-4 z-50">
          <div className="flex items-center gap-2 bg-background-elevated/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow-sm border border-border-secondary">
            <div className="w-2 h-2 bg-oak-light rounded-full animate-pulse" />
            <span className="text-xs text-text-tertiary">Verifying session...</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
