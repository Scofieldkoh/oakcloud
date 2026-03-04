'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function useNavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track current URL to detect actual changes
  const currentUrl = useRef(pathname + (searchParams?.toString() || ''));

  const startNavigation = useCallback(() => {
    setIsNavigating(true);
  }, []);

  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Stop navigation when pathname/searchParams change (route completed)
  useEffect(() => {
    const newUrl = pathname + (searchParams?.toString() || '');
    if (newUrl !== currentUrl.current) {
      currentUrl.current = newUrl;
      stopNavigation();
    }
  }, [pathname, searchParams, stopNavigation]);

  // Intercept link clicks
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Find closest anchor element
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // Skip external links, hash links, download links, new-tab links
      if (
        href.startsWith('http') ||
        href.startsWith('#') ||
        anchor.hasAttribute('download') ||
        anchor.target === '_blank' ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey
      ) {
        return;
      }

      // Skip if navigating to the same page
      const currentPath = currentUrl.current;
      if (href === currentPath || href === pathname) return;

      startNavigation();
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [pathname, startNavigation]);

  // Patch router.push and router.replace via history API
  useEffect(() => {
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = function (...args) {
      // Defer to avoid setState inside useInsertionEffect (Next.js internals)
      setTimeout(startNavigation, 0);
      return originalPushState(...args);
    };

    history.replaceState = function (...args) {
      // Only trigger for actual navigation, not for search param updates from state
      if (args[2] && typeof args[2] === 'string') {
        const newPath = new URL(args[2], window.location.origin).pathname;
        if (newPath !== pathname) {
          setTimeout(startNavigation, 0);
        }
      }
      return originalReplaceState(...args);
    };

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, [pathname, startNavigation]);

  // Safety timeout: stop after 10s to prevent stuck state
  useEffect(() => {
    if (isNavigating) {
      timeoutRef.current = setTimeout(() => {
        stopNavigation();
      }, 10000);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isNavigating, stopNavigation]);

  return { isNavigating };
}
