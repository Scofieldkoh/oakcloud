'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useSessionWithPermissions } from '@/hooks/use-auth';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { data: session, isLoading, isFetched } = useSessionWithPermissions();
  const user = session?.user ?? null;

  useEffect(() => {
    if (isFetched && !user) {
      router.push('/login');
    }
  }, [user, isFetched, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-5 h-5 text-oak-light animate-spin" />
          <p className="text-text-tertiary text-xs">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
