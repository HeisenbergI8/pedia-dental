"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme";

type ThemeState = { preference: ThemePreference; setPreference: (preference: ThemePreference) => void };

/** Light, Dark or System, for this device. Light by default. Applied by ThemeSync in providers.tsx. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({ preference: "light", setPreference: (preference) => set({ preference }) }),
    { name: THEME_STORAGE_KEY, partialize: ({ preference }) => ({ preference }) },
  ),
);
