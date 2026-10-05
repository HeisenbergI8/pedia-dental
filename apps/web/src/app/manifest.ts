import type { MetadataRoute } from "next";

/**
 * Lets phones add the app to the home screen as "Primoral", with the P mark, opening full-screen.
 * The icons are the tab icon's P (icon.svg) on a full white square; iOS takes apple-icon.png beside this file.
 * The icon files carry the brand in their names: an installed app only refetches an icon whose URL changed,
 * so phones that installed it as Kidsmile pick up the P instead of keeping the old K.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A fixed identity, so a later change to start_url doesn't install as a second app.
    id: "/",
    name: "Primoral Pediatric Dental Clinic",
    short_name: "Primoral",
    description: "Clinic management for Primoral Pediatric Dental Clinic",
    lang: "en",
    categories: ["medical", "health", "business"],
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/primoral-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/primoral-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Extra padding, so Android's circle or squircle mask doesn't clip the P.
      { src: "/icons/primoral-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      // Android themed icons: the P as a single-colour silhouette, recoloured by the system.
      { src: "/icons/primoral-monochrome-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
    ],
  };
}
