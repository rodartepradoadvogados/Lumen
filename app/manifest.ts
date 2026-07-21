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
    background_color: "#f4efe4",
    theme_color: "#0a1128",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
