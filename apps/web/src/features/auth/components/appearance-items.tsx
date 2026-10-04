"use client";
import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react";
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { useThemeStore } from "@/stores/theme-store";

const OPTION: Record<ThemePreference, { label: string; icon: LucideIcon }> = {
  light: { label: "Light", icon: SunIcon },
  dark: { label: "Dark", icon: MoonIcon },
  system: { label: "System", icon: MonitorIcon },
};

/** Light, Dark or System, for this device (it stays when someone else signs in here). Inside the account menu. */
export function AppearanceItems() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  return (
    <>
      <DropdownMenuLabel>Appearance on this device</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={preference} onValueChange={(v) => setPreference(v as ThemePreference)}>
        {THEME_PREFERENCES.map((p) => {
          const { label, icon: Icon } = OPTION[p];
          return (
            // preventDefault keeps the menu open, so the change is seen and can be undone in one tap.
            <DropdownMenuRadioItem key={p} value={p} onSelect={(e) => e.preventDefault()}>
              <Icon aria-hidden /> {label}
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </>
  );
}
