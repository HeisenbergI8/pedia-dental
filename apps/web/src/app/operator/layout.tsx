import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Primolar's console never shows up in search results (its own address also sends X-Robots-Tag, src/middleware.ts). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
