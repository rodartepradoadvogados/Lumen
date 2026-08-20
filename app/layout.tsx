import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Voz tipográfica única da marca Lúmen (manual v2, ver docs/DESIGN-SYSTEM.md §14): Archivo do
// título ao número de processo. A serifa (Cormorant Garamond) saiu — em tela cheia de dados ela
// reduz legibilidade e era a principal responsável pela sensação de material antigo.
//
// `--` continua existindo e apontando para Archivo de propósito: 107 arquivos ainda
// usam ``, e mantê-la como apelido faz todos eles renderizarem na fonte nova sem
// precisar de um commit gigante. A classe é removida arquivo a arquivo na migração por área,
// e só então a variável sai daqui e do tailwind.config.ts.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
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
      <body className={`${archivo.variable} font-sans antialiased`}>
        {/* Script anti-flash: decide se a classe `dark` entra no <html> antes da hidratação
            (mesmo padrão de app/m/layout.tsx, adaptado para os 3 estados dia/tarde/noite). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
