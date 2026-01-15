'use client';

import { Suspense, lazy } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';

// Lazy load the Phaser canvas to avoid loading Phaser on initial page load
const PhaserGameCanvas = lazy(() =>
  import('@/game/PhaserGameCanvas').then((mod) => ({
    default: mod.PhaserGameCanvas,
  }))
);

export function PetMascotProvider({ children }: { children: React.ReactNode }) {
  const { petEnabled, selectedCharacters } = useUIStore();
  const prefersReducedMotion = usePrefersReducedMotion();

  // Don't render if disabled, no characters selected, or user prefers reduced motion
  const shouldRender =
    petEnabled && selectedCharacters.length > 0 && !prefersReducedMotion;

  return (
    <>
      {children}
      {shouldRender && (
        <Suspense fallback={null}>
          <PhaserGameCanvas characterIds={selectedCharacters} />
        </Suspense>
      )}
    </>
  );
}
