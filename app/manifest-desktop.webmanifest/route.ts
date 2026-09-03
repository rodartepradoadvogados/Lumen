import { NextResponse } from "next/server";

// Segundo manifesto do PWA, para o site completo (desktop) — mesmo ícone e mesmo app do
// app/manifest.ts (mobile), mas com start_url "/" em vez de "/m". Next.js só permite UM
// manifest.ts por app (convenção de arquivo único, sem versão por segmento), por isso este é
// uma Route Handler comum, referenciada via metadata.manifest só no layout desktop
// (app/(app)/layout.tsx). As rotas /m continuam herdando o manifest.ts padrão sem nenhuma
// mudança — quem já instalou o app mobile não é afetado.
export function GET() {
  return NextResponse.json(
    {
      name: "Lúmen",
      short_name: "Lúmen",
      description: "Software de gestão jurídica",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#f3f4f6",
      theme_color: "#16191d",
      icons: [
        { src: "/icon-192", sizes: "192x192", type: "image/png" },
        { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
