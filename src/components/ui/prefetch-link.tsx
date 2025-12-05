'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, type ComponentProps, type ReactNode } from 'react';
import { usePrefetchCompany } from '@/hooks/use-companies';
import { usePrefetchContact } from '@/hooks/use-contacts';

type LinkProps = ComponentProps<typeof Link>;

interface PrefetchLinkProps extends LinkProps {
  children: ReactNode;
  /** Type of entity to prefetch */
  prefetchType?: 'company' | 'contact';
  /** Entity ID to prefetch (extracted from href if not provided) */
  prefetchId?: string;
}

/**
 * A Link component that prefetches data on hover for faster navigation.
 * Automatically detects company/contact URLs and prefetches the appropriate data.
 */
export function PrefetchLink({
  children,
  prefetchType,
  prefetchId,
  onMouseEnter,
  href,
  ...props
}: PrefetchLinkProps) {
  const router = useRouter();
  const prefetchCompany = usePrefetchCompany();
  const prefetchContact = usePrefetchContact();

  // Extract entity type and ID from href if not provided
  const hrefString = typeof href === 'string' ? href : href.pathname || '';

  const detectedType = prefetchType || (() => {
    if (hrefString.includes('/companies/')) return 'company';
    if (hrefString.includes('/contacts/')) return 'contact';
    return undefined;
  })();

  const detectedId = prefetchId || (() => {
    const match = hrefString.match(/\/(companies|contacts)\/([a-zA-Z0-9-]+)/);
    return match ? match[2] : undefined;
  })();

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Prefetch the route
      router.prefetch(hrefString);

      // Prefetch the data
      if (detectedId) {
        if (detectedType === 'company') {
          prefetchCompany(detectedId);
        } else if (detectedType === 'contact') {
          prefetchContact(detectedId);
        }
      }

      // Call original onMouseEnter if provided
      onMouseEnter?.(e);
    },
    [router, hrefString, detectedType, detectedId, prefetchCompany, prefetchContact, onMouseEnter]
  );

  return (
    <Link href={href} onMouseEnter={handleMouseEnter} {...props}>
      {children}
    </Link>
  );
}

export default PrefetchLink;
