import type { Metadata, Viewport } from "next";
import { Figtree, Fredoka } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const fredoka = Fredoka({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-fredoka" });

export const metadata: Metadata = {
  title: "Kidsmile Pediatric Dental Clinic",
  description: "Clinic management for Kidsmile Pediatric Dental Clinic",
  // The home-screen label on iOS, which otherwise truncates the full title.
  appleWebApp: { title: "Kidsmile", capable: true, statusBarStyle: "default" },
};

/**
 * viewport-fit=cover hands the whole screen to the page, so env(safe-area-inset-*) reports the home
 * indicator and rounded corners (it reads 0 otherwise). Without it, opened from the home screen, the
 * phone bottom navs sat in the rounded corners and their outer tabs were clipped. pb-safe pads them clear.
 */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${fredoka.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
