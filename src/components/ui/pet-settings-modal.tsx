'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { getAllCharacters, getCharacter } from '@/game/config/characters';
import { Modal } from '@/components/ui/modal';
import { Search, Palette, Settings2, Sparkles, RotateCcw, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CharacterConfig } from '@/game/types';

const MAX_PETS = 5;

interface PetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'characters' | 'appearance' | 'behavior';

// Group characters by series
function groupCharactersBySeries(characters: CharacterConfig[]) {
  const groups: Record<string, CharacterConfig[]> = {};
  characters.forEach((char) => {
    if (!groups[char.series]) {
      groups[char.series] = [];
    }
    groups[char.series].push(char);
  });
  return groups;
}

// Series display order
const SERIES_ORDER = [
  'Genshin Impact',
  'Pokémon',
  'Anime',
  'Touhou',
  'Fate',
  'VTuber',
  'Undertale',
  'Lobotomy Corporation',
  'Animator vs Animation',
  'Dynasty Warriors',
  'Nekotalia',
  'Misc',
];

// Component to render a single frame from sprite sheet
function SpriteFrame({
  character,
  size = 48,
  className,
}: {
  character: CharacterConfig;
  size?: number;
  className?: string;
}) {
  const frameSize = character.frameSize || 128;

  return (
    <div
      className={cn('overflow-hidden flex-shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <div
        style={{
          width: frameSize,
          height: frameSize,
          backgroundImage: `url(${character.spritePath})`,
          backgroundPosition: '0 0',
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          transform: `scale(${size / frameSize})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
}

export function PetSettingsModal({ isOpen, onClose }: PetSettingsModalProps) {
  const { selectedCharacters, toggleCharacter, removeCharacter, petSettings, updatePetSettings } = useUIStore();

  const [activeTab, setActiveTab] = useState<TabType>('characters');
  const [searchQuery, setSearchQuery] = useState('');
  // Default: all series collapsed (empty set)
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(new Set());

  // Local state for sliders
  const [scale, setScale] = useState(petSettings.scale.toString());
  const [speed, setSpeed] = useState(petSettings.speed.toString());

  const characters = getAllCharacters();
  const groupedCharacters = useMemo(() => groupCharactersBySeries(characters), [characters]);

  // Filter characters based on search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedCharacters;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, CharacterConfig[]> = {};

    Object.entries(groupedCharacters).forEach(([series, chars]) => {
      const matchingChars = chars.filter(
        (char) =>
          char.name.toLowerCase().includes(query) ||
          char.series.toLowerCase().includes(query)
      );
      if (matchingChars.length > 0) {
        filtered[series] = matchingChars;
      }
    });

    return filtered;
  }, [groupedCharacters, searchQuery]);

  // Sort series by predefined order
  const sortedSeries = useMemo(() => {
    return Object.keys(filteredGroups).sort((a, b) => {
      const indexA = SERIES_ORDER.indexOf(a);
      const indexB = SERIES_ORDER.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [filteredGroups]);

  // Get info for all selected characters
  const selectedCharactersInfo = useMemo(
    () => selectedCharacters.map((id) => getCharacter(id)).filter(Boolean) as CharacterConfig[],
    [selectedCharacters]
  );

  // Sync local state with store when modal opens
  useEffect(() => {
    if (isOpen) {
      setScale(petSettings.scale.toString());
      setSpeed(petSettings.speed.toString());
    }
  }, [isOpen, petSettings]);

  const handleSave = () => {
    updatePetSettings({
      scale: parseFloat(scale) || 1.0,
      speed: parseFloat(speed) || 1.0,
    });
    onClose();
  };

  const handleReset = () => {
    setScale('1.0');
    setSpeed('1.0');
    updatePetSettings({
      scale: 1.0,
      speed: 1.0,
      climbingEnabled: true,
      chatBubblesEnabled: true,
      cursorAwarenessEnabled: true,
      uiReactionsEnabled: true,
    });
  };

  const toggleSeries = (series: string) => {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(series)) {
        next.delete(series);
      } else {
        next.add(series);
      }
      return next;
    });
  };

  const tabs: { id: TabType; label: string; icon: typeof Palette }[] = [
    { id: 'characters', label: 'Characters', icon: Sparkles },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'behavior', label: 'Behavior', icon: Settings2 },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pet Mascot Settings" size="lg">
      <div className="flex flex-col h-[560px] p-4">
        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-background-tertiary rounded-lg mb-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150',
                  activeTab === tab.id
                    ? 'bg-background-primary text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {/* Characters Tab */}
          {activeTab === 'characters' && (
            <div className="h-full flex flex-col">
              {/* Search Bar */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search characters..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background-tertiary border border-border-primary rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-oak-primary/50 focus:border-oak-primary"
                />
              </div>

              {/* Selected Pets Bar */}
              <div className="flex items-center gap-2 p-3 bg-background-secondary border border-border-primary rounded-lg mb-3">
                <span className="text-sm text-text-secondary whitespace-nowrap">
                  Selected: {selectedCharacters.length}/{MAX_PETS}
                </span>
                <div className="flex gap-1.5 flex-1 overflow-x-auto">
                  {selectedCharactersInfo.map((char, index) => (
                    <div key={char.id} className="relative group flex-shrink-0">
                      <div className="relative">
                        <SpriteFrame character={char} size={36} className="rounded-md bg-background-tertiary" />
                        {/* Selection order badge */}
                        <div className="absolute -top-1 -left-1 w-4 h-4 bg-oak-primary rounded-full flex items-center justify-center">
                          <span className="text-2xs text-white font-bold">{index + 1}</span>
                        </div>
                      </div>
                      {/* Remove button */}
                      <button
                        onClick={() => removeCharacter(char.id)}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title={`Remove ${char.name}`}
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  ))}
                  {selectedCharacters.length === 0 && (
                    <span className="text-xs text-text-muted italic">Click characters below to add</span>
                  )}
                </div>
              </div>

              {/* Character List by Series */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {sortedSeries.map((series) => {
                  const chars = filteredGroups[series];
                  const isExpanded = expandedSeries.has(series);

                  return (
                    <div key={series} className="border border-border-primary rounded-lg overflow-hidden">
                      {/* Series Header */}
                      <button
                        onClick={() => toggleSeries(series)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-background-secondary hover:bg-background-tertiary transition-colors"
                      >
                        <span className="text-sm font-medium text-text-primary">
                          {series}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-muted">
                            {chars.length}
                          </span>
                          <ChevronDown
                            className={cn(
                              'w-4 h-4 text-text-muted transition-transform duration-200',
                              isExpanded && 'rotate-180'
                            )}
                          />
                        </div>
                      </button>

                      {/* Character Grid */}
                      {isExpanded && (
                        <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 p-3 bg-background-primary">
                          {chars.map((character) => {
                            const isSelected = selectedCharacters.includes(character.id);
                            const selectionIndex = selectedCharacters.indexOf(character.id);
                            const canSelect = isSelected || selectedCharacters.length < MAX_PETS;

                            return (
                              <button
                                key={character.id}
                                onClick={() => toggleCharacter(character.id)}
                                disabled={!canSelect}
                                className={cn(
                                  'relative p-1.5 rounded-lg border-2 transition-all duration-150 group',
                                  isSelected
                                    ? 'border-oak-primary bg-oak-primary/10'
                                    : canSelect
                                      ? 'border-transparent hover:border-border-secondary hover:bg-background-secondary'
                                      : 'border-transparent opacity-40 cursor-not-allowed'
                                )}
                                title={canSelect ? character.name : `Max ${MAX_PETS} pets selected`}
                              >
                                {/* Selection order badge */}
                                {isSelected && (
                                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-oak-primary rounded-full flex items-center justify-center z-10">
                                    <span className="text-2xs text-white font-bold">{selectionIndex + 1}</span>
                                  </div>
                                )}

                                {/* Character Sprite Frame */}
                                <SpriteFrame character={character} size={40} className="mx-auto" />

                                {/* Character Name */}
                                <div className="mt-1 text-center">
                                  <span className="text-2xs font-medium text-text-primary truncate block leading-tight">
                                    {character.name}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {sortedSeries.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                    <Search className="w-8 h-8 mb-2 text-text-muted" />
                    <p className="text-sm">No characters found</p>
                    <p className="text-xs text-text-muted mt-1">Try a different search term</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 py-2">
              {/* Size Setting */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-text-primary">Size</label>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Adjust the pet&apos;s display size
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-oak-primary w-12 text-right">
                      {parseFloat(scale).toFixed(1)}x
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted w-6">0.5x</span>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={scale}
                    onChange={(e) => setScale(e.target.value)}
                    className="flex-1 h-2 bg-background-tertiary rounded-lg appearance-none cursor-pointer
                               [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                               [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-oak-primary [&::-webkit-slider-thumb]:cursor-pointer
                               [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform
                               [&::-webkit-slider-thumb]:hover:scale-110
                               [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5
                               [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-oak-primary
                               [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                  />
                  <span className="text-xs text-text-muted w-6">2.0x</span>
                </div>
                {/* Size presets */}
                <div className="flex gap-2">
                  {['0.5', '0.75', '1.0', '1.5', '2.0'].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setScale(preset)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                        scale === preset
                          ? 'bg-oak-primary text-white'
                          : 'bg-background-tertiary text-text-secondary hover:text-text-primary'
                      )}
                    >
                      {preset}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed Setting */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-text-primary">Animation Speed</label>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Control how fast animations play
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-oak-primary w-12 text-right">
                      {parseFloat(speed).toFixed(1)}x
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted w-6">0.5x</span>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(e.target.value)}
                    className="flex-1 h-2 bg-background-tertiary rounded-lg appearance-none cursor-pointer
                               [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                               [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-oak-primary [&::-webkit-slider-thumb]:cursor-pointer
                               [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform
                               [&::-webkit-slider-thumb]:hover:scale-110
                               [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5
                               [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-oak-primary
                               [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                  />
                  <span className="text-xs text-text-muted w-6">2.0x</span>
                </div>
                {/* Speed presets */}
                <div className="flex gap-2">
                  {['0.5', '0.75', '1.0', '1.5', '2.0'].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setSpeed(preset)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                        speed === preset
                          ? 'bg-oak-primary text-white'
                          : 'bg-background-tertiary text-text-secondary hover:text-text-primary'
                      )}
                    >
                      {preset}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview Tip */}
              <div className="bg-background-secondary rounded-lg p-4 border border-border-primary">
                <p className="text-sm text-text-secondary">
                  <span className="font-medium text-text-primary">Tip:</span> You can drag your pet
                  around the screen! Changes are applied in real-time.
                </p>
              </div>
            </div>
          )}

          {/* Behavior Tab */}
          {activeTab === 'behavior' && (
            <div className="space-y-4 py-2">
              {/* Toggle Options */}
              <ToggleOption
                label="Wall Climbing"
                description="Pet can climb walls and crawl on ceiling"
                enabled={petSettings.climbingEnabled}
                onChange={(enabled) => updatePetSettings({ climbingEnabled: enabled })}
              />

              <ToggleOption
                label="Chat Bubbles"
                description="Show speech bubbles with messages"
                enabled={petSettings.chatBubblesEnabled}
                onChange={(enabled) => updatePetSettings({ chatBubblesEnabled: enabled })}
              />

              <ToggleOption
                label="Cursor Awareness"
                description="Pet faces your cursor when idle"
                enabled={petSettings.cursorAwarenessEnabled}
                onChange={(enabled) => updatePetSettings({ cursorAwarenessEnabled: enabled })}
              />

              <ToggleOption
                label="UI Reactions"
                description="React to app events like success and errors"
                enabled={petSettings.uiReactionsEnabled}
                onChange={(enabled) => updatePetSettings({ uiReactionsEnabled: enabled })}
              />

              {/* Info */}
              <div className="bg-background-secondary rounded-lg p-4 border border-border-primary mt-6">
                <p className="text-sm text-text-secondary">
                  <span className="font-medium text-text-primary">Note:</span> Behavior settings take
                  effect immediately. Some features may require the pet to be in certain states to
                  trigger.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-border-primary">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset All
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button onClick={handleSave} className="btn btn-primary btn-sm">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Toggle option component for behavior settings
function ToggleOption({
  label,
  description,
  enabled,
  onChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-background-secondary rounded-lg border border-border-primary">
      <div className="flex-1 min-w-0 mr-4">
        <label className="text-sm font-medium text-text-primary">{label}</label>
        <p className="text-xs text-text-secondary mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0',
          enabled ? 'bg-oak-primary' : 'bg-background-tertiary'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
            enabled ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}
