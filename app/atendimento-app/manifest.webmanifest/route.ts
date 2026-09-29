import { NextResponse } from "next/server";

// Terceiro manifesto do PWA, exclusivo do app de Atendimento — mesmo motivo do
// app/manifest-desktop.webmanifest/route.ts: Next.js só reconhece a convenção de arquivo
// manifest.ts na RAIZ do app, um manifest.ts dentro de /atendimento-app é descoberto como
// página/rota normal (ignorado como metadado) e nunca gera /atendimento-app/manifest.webmanifest
// nem é linkado no <head>. Por isso este é uma Route Handler comum, referenciada via
// metadata.manifest só no layout do Atendimento (app/atendimento-app/layout.tsx).
//
// Sem essa referência explícita, /atendimento-app herdava o manifesto padrão (app/manifest.ts,
// mobile, start_url "/m", scope "/m/") — instalar pelo link do Atendimento instalava o mesmo
// app mobile geral, com o mesmo ícone e o mesmo start_url, e por isso sempre abria o app mobile
// no lugar do Atendimento, não importa o link usado para instalar.
export function GET() {
  return NextResponse.json(
    {
      name: "Lúmen Atendimento",
      short_name: "Atendimento",
      description: "App de triagem e atendimento do Lúmen — funil comercial, conversas e gestão de leads",
      id: "/atendimento-app",
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
          icons: [{ src: "/icons-atendimento/icon-192.png", sizes: "192x192" }],
        },
        {
          name: "Funil Comercial",
          short_name: "Funil",
          url: "/atendimento-app/funil",
          icons: [{ src: "/icons-atendimento/icon-192.png", sizes: "192x192" }],
        },
      ],
      categories: ["business", "productivity"],
      screenshots: [],
      prefer_related_applications: false,
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
