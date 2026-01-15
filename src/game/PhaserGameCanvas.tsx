'use client';

import { useEffect, useRef } from 'react';
import { useUIStore } from '@/stores/ui-store';
import type { PetScene } from '@/game/scenes/PetScene';

export function PhaserGameCanvas({ characterIds }: { characterIds: string[] }) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { sidebarCollapsed, petSettings } = useUIStore();
  const characterIdsRef = useRef<string[]>(characterIds);

  // Track characterIds changes for syncing
  useEffect(() => {
    characterIdsRef.current = characterIds;
  }, [characterIds]);

  // Initialize game on mount
  useEffect(() => {
    // Lazy import Phaser only when component mounts
    import('phaser').then(async (Phaser) => {
      const { createPhaserConfig } = await import('@/game/config/phaser-config');
      const { PreloadScene } = await import('@/game/scenes/PreloadScene');
      const { PetScene } = await import('@/game/scenes/PetScene');

      if (!containerRef.current || gameRef.current) return;

      const config = createPhaserConfig(containerRef.current);

      // Add scenes to configuration
      config.scene = [PreloadScene, PetScene];

      gameRef.current = new Phaser.Game(config);

      // Store settings in game registry for scenes to access
      gameRef.current.registry.set('characterIds', characterIdsRef.current);
      gameRef.current.registry.set('sidebarCollapsed', sidebarCollapsed);
      gameRef.current.registry.set('scaleMultiplier', petSettings.scale);
      gameRef.current.registry.set('speedMultiplier', petSettings.speed);
      gameRef.current.registry.set('climbingEnabled', petSettings.climbingEnabled);
      gameRef.current.registry.set('chatBubblesEnabled', petSettings.chatBubblesEnabled);
      gameRef.current.registry.set('cursorAwarenessEnabled', petSettings.cursorAwarenessEnabled);
      gameRef.current.registry.set('uiReactionsEnabled', petSettings.uiReactionsEnabled);
    }).catch((error) => {
      console.error('Failed to load Phaser:', error);
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time settings sync - update game when settings change
  useEffect(() => {
    if (!gameRef.current) return;

    const scene = gameRef.current.scene.getScene('PetScene') as PetScene | null;
    if (scene && typeof scene.updateSettings === 'function') {
      scene.updateSettings({
        scaleMultiplier: petSettings.scale,
        speedMultiplier: petSettings.speed,
        climbingEnabled: petSettings.climbingEnabled,
        chatBubblesEnabled: petSettings.chatBubblesEnabled,
        cursorAwarenessEnabled: petSettings.cursorAwarenessEnabled,
        uiReactionsEnabled: petSettings.uiReactionsEnabled,
      });
    }
  }, [
    petSettings.scale,
    petSettings.speed,
    petSettings.climbingEnabled,
    petSettings.chatBubblesEnabled,
    petSettings.cursorAwarenessEnabled,
    petSettings.uiReactionsEnabled,
  ]);

  // Real-time sidebar sync - update bounds when sidebar changes
  useEffect(() => {
    if (!gameRef.current) return;

    const scene = gameRef.current.scene.getScene('PetScene') as PetScene | null;
    if (scene && typeof scene.updateSettings === 'function') {
      scene.updateSettings({
        sidebarCollapsed: sidebarCollapsed,
      });
    }
  }, [sidebarCollapsed]);

  // Sync characters when selection changes (add/remove pets dynamically)
  useEffect(() => {
    if (!gameRef.current) return;

    const scene = gameRef.current.scene.getScene('PetScene') as PetScene | null;
    if (scene && typeof scene.syncCharacters === 'function') {
      scene.syncCharacters(characterIds);
    }
  }, [characterIds]);

  // Full screen canvas with pointer-events:none on container
  // The canvas itself will handle click-through via CSS
  return (
    <div
      ref={containerRef}
      className="phaser-canvas-container"
      data-sidebar-collapsed={sidebarCollapsed}
      aria-hidden="true"
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 30,
      }}
    />
  );
}
