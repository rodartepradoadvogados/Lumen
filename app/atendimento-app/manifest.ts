import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lúmen Atendimento",
    short_name: "Atendimento",
    description: "App de triagem e atendimento do Lúmen — funil comercial, conversas e gestão de leads",
    start_url: "/atendimento-app",
    scope: "/atendimento-app",
    display: "standalone",
    background_color: "#eaedf0",
    theme_color: "#c9962f",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons-atendimento/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons-atendimento/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons-atendimento/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons-atendimento/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Novo Atendimento",
        short_name: "Novo",
        url: "/atendimento-app/novo",
        icons: [{ src: "/icons-atendimento/icon-192.png", sizes: "192x192" }]
      },
      {
        name: "Funil Comercial",
        short_name: "Funil",
        url: "/atendimento-app/funil",
        icons: [{ src: "/icons-atendimento/icon-192.png", sizes: "192x192" }]
      }
    ],
    categories: ["business", "productivity"],
    screenshots: [],
    prefer_related_applications: false
  };
}