"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * True from the moment an in-app link to another page is clicked until that page renders. Next shows
 * nothing while it fetches or compiles the next route, so the shells show the loader instead.
 * Ignores new-tab clicks, downloads, external links and links to the page already open.
 */
export function useNavigationPending() {
  const pathname = usePathname();
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  // Landed: clear it, or coming Back to the page the click left (pathname === pendingFrom again) shows the loader
  // until the timeout below. Set during render, so the page never paints with the loader on.
  const [landedOn, setLandedOn] = useState(pathname);
  if (pathname !== landedOn) {
    setLandedOn(pathname);
    setPendingFrom(null);
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      setPendingFrom(location.pathname);
    };
    // Capture phase: next/link cancels the click (preventDefault) before a bubbling listener sees it.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // A navigation that never lands (cancelled, failed) mustn't leave the loader up forever.
  useEffect(() => {
    if (!pendingFrom) return;
    const t = setTimeout(() => setPendingFrom(null), 15_000);
    return () => clearTimeout(t);
  }, [pendingFrom]);

  return pendingFrom !== null && pendingFrom === pathname;
}
