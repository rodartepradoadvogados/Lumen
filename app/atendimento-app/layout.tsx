import type { Metadata, Viewport } from "next";

// Manifesto próprio do PWA de Atendimento (ver app/atendimento-app/manifest.webmanifest/route.ts),
// ligado em TODAS as rotas do escopo — inclusive a tela de entrada (/atendimento-app/entrar), que
// fica FORA do grupo (shell) porque é pública e não pode exigir sessão. A autenticação e a casca do
// app moram em app/atendimento-app/(shell)/layout.tsx.
//
// Sem manifesto próprio, estas rotas herdavam o do app mobile (antigo app/manifest.ts) e instalar pelo
// link do Atendimento instalava o mesmo app mobile geral. `appleWebApp.title` cobre o nome mostrado
// ao "Adicionar à Tela de Início" no Safari (que não lê o manifesto). `icons` aponta direto para os
// PNGs em public/icons-atendimento/ (públicos, ver middleware.ts) em vez da convenção
// icon.png/apple-icon.png aninhada — o Next 14 não reconhece esse arquivo estático dentro de
// /atendimento-app quando existe um segmento [id] irmão.
export const metadata: Metadata = {
  title: "Atendimento | Lúmen",
  manifest: "/atendimento-app/manifest.webmanifest",
  icons: {
    icon: "/icons-atendimento/icon-192.png",
    apple: "/icons-atendimento/icon-192.png",
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Atendimento" },
};

// `viewport-fit=cover`: sem isso o `env(safe-area-inset-*)` do iPhone vale zero e o cabeçalho e a barra
// inferior ficam sob o entalhe e o indicador de "voltar ao início".
export const viewport: Viewport = { themeColor: "#16191d", viewportFit: "cover" };

export default function AtendimentoAppRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
