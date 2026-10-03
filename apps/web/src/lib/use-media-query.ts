import { useSyncExternalStore } from "react";

/** True while the media query matches. False during server render, so first paint is the wide layout. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below md (768px): phones, where data views switch to their card layouts. */
export const PHONE = "(max-width: 767px)";
