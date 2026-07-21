import type { MetadataRoute } from "next";

// Convenção do Next 14: gera /manifest.webmanifest e injeta a tag no <head> automaticamente.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestão Jurídica",
    short_name: "Gestão Jurídica",
    description: "Software de gestão jurídica — versão mobile",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    background_color: "#f3efe6",
    theme_color: "#0b1730",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
