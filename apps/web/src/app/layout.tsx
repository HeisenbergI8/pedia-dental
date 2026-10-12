import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, Fredoka, Outfit } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import { Providers } from "./providers";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const fredoka = Fredoka({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-fredoka" });
// Variable font: weight plus optical size, so 600 titles tighten at display sizes.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-bricolage" });
// The Primolar name in the logo (components/brand.tsx).
// Variable font, so the logo can use its exact weight (560).
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "Primolar Pediatric Dental Clinic",
  description: "Clinic management for Primolar Pediatric Dental Clinic",
  // The installed app's name on desktop (application-name), alongside the manifest's.
  applicationName: "Primolar",
  // The home-screen label on iOS, which otherwise truncates the full title.
  appleWebApp: { title: "Primolar", capable: true, statusBarStyle: "default" },
};

/**
 * viewport-fit=cover hands the whole screen to the page, so env(safe-area-inset-*) reports the home
 * indicator and rounded corners (it reads 0 otherwise). Without it, opened from the home screen, the
 * phone bottom navs sat in the rounded corners and their outer tabs were clipped. pb-safe pads them clear.
 */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_SCRIPT sets data-theme before React hydrates, and the server can't know it.
    <html lang="en" className={`${figtree.variable} ${fredoka.variable} ${bricolage.variable} ${outfit.variable}`} suppressHydrationWarning>
      <head>
        {/* The saved theme, applied before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
