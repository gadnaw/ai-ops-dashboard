import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TimeRange } from "@/lib/dashboard/queries";

interface DashboardFilterState {
  timeRange: TimeRange;
  selectedProviders: string[]; // empty = all providers
  _hasHydrated: boolean;
  setTimeRange: (range: TimeRange) => void;
  setSelectedProviders: (providers: string[]) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useDashboardFilterStore = create<DashboardFilterState>()(
  persist(
    (set) => ({
      timeRange: "7d",
      selectedProviders: [],
      _hasHydrated: false,
      setTimeRange: (timeRange) => set({ timeRange }),
      setSelectedProviders: (selectedProviders) => set({ selectedProviders }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: "dashboard-filters",
      // skipHydration: true prevents automatic hydration on mount.
      // Manual rehydrate() is called in FilterBar useEffect to avoid SSR mismatch.
      skipHydration: true,
    }
  )
);
