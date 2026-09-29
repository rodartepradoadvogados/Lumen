import { NextResponse } from "next/server";

// Manifesto do app MOBILE (Lúmen, escopo /m), servido em /manifest.webmanifest — mesma URL de
// sempre, para não quebrar a atualização de quem já instalou o app.
//
// Era app/manifest.ts (convenção de arquivo do Next). Trocado por Route Handler porque o manifesto
// de convenção SEMPRE vence `metadata.manifest` das rotas aninhadas: medido em `next dev` (Next
// 14.2.35), /painel, /atendimento-app e /atendimento-app/entrar continuavam com
// <link rel="manifest" href="/manifest.webmanifest"> mesmo com `manifest:` próprio nos layouts.
// Ou seja, o Atendimento e o site desktop NUNCA tiveram o próprio manifesto ligado no <head> —
// instalar pelo Atendimento instalava o app mobile. Como Route Handler, o manifesto passa a ser
// só o valor padrão de `metadata.manifest` no layout raiz (app/layout.tsx), e cada escopo o
// sobrescreve normalmente. Mesmo padrão já usado por manifest-desktop e atendimento-app.
export function GET() {
  return NextResponse.json(
    {
      name: "Lúmen",
      short_name: "Lúmen",
      description: "Software de gestão jurídica — versão mobile",
      // Identidade e escopo explícitos. `scope` SEM barra final: com "/m/" o start_url "/m" ficava
      // FORA do escopo, e o Chrome descarta o scope inválido e usa o padrão (o diretório do
      // start_url, "/") — o app mobile passava a "possuir" o site inteiro, inclusive
      // /atendimento-app.
      id: "/m",
      start_url: "/m",
      scope: "/m",
      display: "standalone",
      background_color: "#f3f4f6",
      theme_color: "#16191d",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
