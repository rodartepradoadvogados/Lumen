import type { MetadataRoute } from "next";

// Convenção do Next 14: gera /manifest.webmanifest e injeta a tag no <head> automaticamente.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lúmen",
    short_name: "Lúmen",
    description: "Software de gestão jurídica — versão mobile",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    background_color: "#f3f4f6",
    theme_color: "#16191d",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
