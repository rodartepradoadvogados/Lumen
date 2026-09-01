import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Voz tipográfica da marca Lúmen (ajuste de tema, agosto/2026): Inter do título ao número de
// processo, no lugar de Archivo — mesmo motivo que tirou a serifa antes (legibilidade em tela
// cheia de dados), mas Archivo lia como reta/mecânica demais; Inter é neutra e discreta, deixa
// o conteúdo falar.
//
// `--font-sans` continua existindo e apontando para Inter de propósito: 107 arquivos ainda
// usam `font-serif`, e mantê-la como apelido faz todos eles renderizarem na fonte nova sem
// precisar de um commit gigante. A classe é removida arquivo a arquivo na migração por área,
// e só então a variável sai daqui e do tailwind.config.ts.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Lúmen | Sistema Interno",
  description: "Controle financeiro, processos, agenda e kanban para escritórios de advocacia",
  // Habilita o comportamento de app instalável (tela cheia) no iOS.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Lúmen" },
};

export const viewport: Viewport = {
  // Grafite 800 — mesma cor do quadrado da marca e da barra de navegação (DESIGN-SYSTEM.md §1).
  themeColor: "#16191d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      {/* `brand-texture` saiu: o grid dourado de fundo competia com o texto em leitura longa
          (DESIGN-SYSTEM.md §13). O fundo agora vem de --sf-fundo, em globals.css. */}
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Script anti-flash: decide se a classe `dark` entra no <html> antes da hidratação
            (mesmo padrão de app/m/layout.tsx, adaptado para os 3 estados dia/tarde/noite). */}
        {/* eslint-disable-next-line react/no-danger -- THEME_INIT_SCRIPT é string 100% estática
            (lib/theme.ts), nenhum dado de usuário entra aqui. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
