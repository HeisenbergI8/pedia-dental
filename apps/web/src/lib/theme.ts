export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export const THEME_PREFERENCES: ThemePreference[] = ["light", "dark", "system"];

/** Per device, not per user: a shared front-desk screen keeps its setting through sign-ins and staff switches. */
export const THEME_STORAGE_KEY = "pedia-dental:theme:v1";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export const resolveTheme = (preference: ThemePreference): ResolvedTheme =>
  preference === "system" ? (window.matchMedia(DARK_QUERY).matches ? "dark" : "light") : preference;

/**
 * Runs in <head> before first paint (layout.tsx), so a dark device never flashes light. Reads what the store
 * persists ({"state":{"preference":…}}). Any failure (blocked storage, bad JSON) leaves the light default.
 * No "use client" in this file: the server layout imports the string itself.
 */
export const THEME_SCRIPT = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||"{}").state||{};var p=s.preference;if(p==="system")p=matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light";document.documentElement.dataset.theme=p==="dark"?"dark":"light"}catch(e){}`;
