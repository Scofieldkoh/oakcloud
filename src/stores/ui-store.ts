import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface PetSettings {
  scale: number; // 0.5 - 2.0
  speed: number; // 0.5 - 2.0
  soundEnabled: boolean;
  climbingEnabled: boolean; // Allow wall climbing and ceiling crawling
  chatBubblesEnabled: boolean; // Show chat bubbles
  cursorAwarenessEnabled: boolean; // Pet faces cursor when idle
  uiReactionsEnabled: boolean; // React to app events (success, error, etc.)
}

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;

  // Theme
  theme: Theme;

  // Pet Mascot
  petEnabled: boolean;
  selectedCharacters: string[]; // Array of character IDs (max 5)
  petSettings: PetSettings;

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleMobileSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  // Pet Actions
  setPetEnabled: (enabled: boolean) => void;
  togglePet: () => void;
  addCharacter: (characterId: string) => void;
  removeCharacter: (characterId: string) => void;
  setCharacters: (characterIds: string[]) => void;
  toggleCharacter: (characterId: string) => void;
  updatePetSettings: (settings: Partial<PetSettings>) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Initial state
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      theme: 'light',

      // Pet initial state
      petEnabled: false,
      selectedCharacters: [],
      petSettings: {
        scale: 1.0,
        speed: 1.0,
        soundEnabled: false,
        climbingEnabled: true,
        chatBubblesEnabled: true,
        cursorAwarenessEnabled: true,
        uiReactionsEnabled: true,
      },

      // Actions
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),

      toggleMobileSidebar: () =>
        set((state) => ({ sidebarMobileOpen: !state.sidebarMobileOpen })),

      setMobileSidebarOpen: (open) =>
        set({ sidebarMobileOpen: open }),

      setTheme: (theme) => set({ theme }),

      toggleTheme: () => {
        const current = get().theme;
        const next = current === 'light' ? 'dark' : 'light';
        set({ theme: next });
      },

      // Pet actions
      setPetEnabled: (enabled) => set({ petEnabled: enabled }),

      togglePet: () =>
        set((state) => ({ petEnabled: !state.petEnabled })),

      addCharacter: (characterId) =>
        set((state) => {
          const MAX_PETS = 5;
          if (state.selectedCharacters.includes(characterId)) return state;
          if (state.selectedCharacters.length >= MAX_PETS) return state;
          return { selectedCharacters: [...state.selectedCharacters, characterId] };
        }),

      removeCharacter: (characterId) =>
        set((state) => ({
          selectedCharacters: state.selectedCharacters.filter((id) => id !== characterId),
        })),

      setCharacters: (characterIds) =>
        set({ selectedCharacters: characterIds.slice(0, 5) }),

      toggleCharacter: (characterId) =>
        set((state) => {
          const MAX_PETS = 5;
          if (state.selectedCharacters.includes(characterId)) {
            return { selectedCharacters: state.selectedCharacters.filter((id) => id !== characterId) };
          }
          if (state.selectedCharacters.length >= MAX_PETS) return state;
          return { selectedCharacters: [...state.selectedCharacters, characterId] };
        }),

      updatePetSettings: (settings) =>
        set((state) => ({
          petSettings: { ...state.petSettings, ...settings },
        })),
    }),
    {
      name: 'oakcloud-ui-preferences',
      // Only persist certain keys
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        petEnabled: state.petEnabled,
        selectedCharacters: state.selectedCharacters,
        petSettings: state.petSettings,
      }),
    }
  )
);
