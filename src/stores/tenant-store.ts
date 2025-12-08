import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Centralized tenant selection store for SUPER_ADMIN users.
 * This store manages the selected tenant context across the application,
 * allowing SUPER_ADMIN to switch between tenants from a single location.
 */
interface TenantSelectionState {
  // Selected tenant ID (only used by SUPER_ADMIN)
  selectedTenantId: string;
  // Selected tenant name for display
  selectedTenantName: string | null;

  // Actions
  setSelectedTenant: (tenantId: string, tenantName?: string) => void;
  clearSelectedTenant: () => void;
}

export const useTenantStore = create<TenantSelectionState>()(
  persist(
    (set) => ({
      // Initial state
      selectedTenantId: '',
      selectedTenantName: null,

      // Actions
      setSelectedTenant: (tenantId, tenantName) =>
        set({ selectedTenantId: tenantId, selectedTenantName: tenantName || null }),

      clearSelectedTenant: () =>
        set({ selectedTenantId: '', selectedTenantName: null }),
    }),
    {
      name: 'oakcloud-tenant-selection',
      // Persist tenant selection for SUPER_ADMIN convenience
      partialize: (state) => ({
        selectedTenantId: state.selectedTenantId,
        selectedTenantName: state.selectedTenantName,
      }),
    }
  )
);
