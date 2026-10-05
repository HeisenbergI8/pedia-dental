import type { MetadataRoute } from "next";

/**
 * Lets phones add the app to the home screen as "Primoral", with the P mark, opening full-screen.
 * The icons are the tab icon's P (icon.svg) on a full white square; iOS takes apple-icon.png beside this file.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Primoral Pediatric Dental Clinic",
    short_name: "Primoral",
    description: "Clinic management for Primoral Pediatric Dental Clinic",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Extra padding, so Android's circle or squircle mask doesn't clip the P.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
