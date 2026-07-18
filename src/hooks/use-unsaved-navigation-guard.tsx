'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type PendingNavigation =
  | { type: 'route'; destination: string }
  | { type: 'back' };

export function useUnsavedNavigationGuard(isDirty: boolean) {
  const router = useRouter();
  const armedRef = useRef(isDirty);
  const suppressNextPopStateRef = useRef(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);

  useEffect(() => {
    armedRef.current = isDirty;
    if (!isDirty) setPendingNavigation(null);
  }, [isDirty]);

  const disarm = useCallback(() => {
    armedRef.current = false;
    setPendingNavigation(null);
  }, []);

  const rearm = useCallback(() => {
    armedRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!armedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const handleNavigationClick = (event: MouseEvent) => {
      if (
        !armedRef.current
        || event.defaultPrevented
        || event.button !== 0
        || event.ctrlKey
        || event.metaKey
        || event.shiftKey
        || event.altKey
      ) {
        return;
      }

      const target = event.target;
      const anchor = target instanceof Element
        ? target.closest<HTMLAnchorElement>('a[href]')
        : null;
      if (
        !anchor
        || anchor.hasAttribute('download')
        || (anchor.target && anchor.target.toLowerCase() !== '_self')
      ) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      const current = new URL(window.location.href);
      if (
        destination.pathname === current.pathname
        && destination.search === current.search
        && destination.hash === current.hash
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      setPendingNavigation({
        type: 'route',
        destination: `${destination.pathname}${destination.search}${destination.hash}`,
      });
    };

    const handlePopState = () => {
      if (!armedRef.current) return;
      if (suppressNextPopStateRef.current) {
        suppressNextPopStateRef.current = false;
        return;
      }

      suppressNextPopStateRef.current = true;
      window.history.forward();
      setPendingNavigation({ type: 'back' });
    };

    document.addEventListener('click', handleNavigationClick, true);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('click', handleNavigationClick, true);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      suppressNextPopStateRef.current = false;
    };
  }, [isDirty]);

  const cancelNavigation = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  const confirmNavigation = useCallback(() => {
    const pending = pendingNavigation;
    if (!pending) return;

    armedRef.current = false;
    setPendingNavigation(null);
    if (pending.type === 'route') {
      router.push(pending.destination);
    } else {
      window.history.back();
    }
  }, [pendingNavigation, router]);

  const dialog = useMemo(() => (
    <ConfirmDialog
      isOpen={pendingNavigation !== null}
      onClose={cancelNavigation}
      onConfirm={confirmNavigation}
      title="Unsaved changes"
      description="You have changes that have not been saved as a draft. Leave without saving them?"
      confirmLabel="Leave without saving"
      cancelLabel="Stay"
      variant="warning"
    />
  ), [cancelNavigation, confirmNavigation, pendingNavigation]);

  return { disarm, rearm, dialog };
}
