'use client';

import { useState } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { PetSettingsModal } from './pet-settings-modal';
import { Cat } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PetToggleButtonProps {
  collapsed: boolean;
}

export function PetToggleButton({ collapsed }: PetToggleButtonProps) {
  const { petEnabled, togglePet, selectedCharacters, addCharacter } = useUIStore();
  const [showSettings, setShowSettings] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleClick = () => {
    if (!petEnabled && selectedCharacters.length === 0) {
      // First time enabling - add default character and open settings
      addCharacter('genshin-nahida');
      togglePet();
      setShowSettings(true);
    } else {
      togglePet();
    }
  };

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSettings(true);
  };

  // Show different state when reduced motion is preferred
  const isDisabledByReducedMotion = petEnabled && prefersReducedMotion;

  // Generate accessible title/label
  const getTitle = () => {
    if (isDisabledByReducedMotion) {
      return 'Pet hidden (reduced motion enabled)';
    }
    return petEnabled ? 'Disable pet mascot (right-click for settings)' : 'Enable pet mascot';
  };

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          handleSettingsClick(e);
        }}
        className={cn(
          'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors w-full',
          'text-text-secondary hover:bg-background-tertiary hover:text-text-primary'
        )}
        aria-label={petEnabled ? 'Disable pet mascot' : 'Enable pet mascot'}
        title={getTitle()}
      >
        <Cat
          className={cn(
            'w-[18px] h-[18px] flex-shrink-0',
            petEnabled && 'text-oak-primary'
          )}
          aria-hidden="true"
        />
        {!collapsed && (
          <span className="flex-1 text-left">
            {petEnabled ? 'Pet Active' : 'Pet Mascot'}
          </span>
        )}
        {/* Status indicator for collapsed state */}
        {collapsed && petEnabled && (
          <span
            className={cn(
              'absolute top-1 right-1 w-2 h-2 rounded-full',
              isDisabledByReducedMotion ? 'bg-yellow-500' : 'bg-green-500'
            )}
          />
        )}
      </button>
      <PetSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </>
  );
}
