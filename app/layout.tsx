import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// As duas vozes tipográficas da marca Lúmen: Cormorant Garamond para títulos/display
// (e a palavra "Lúmen") e Inter para interface, botões e corpo de texto — carregadas
// UMA vez aqui e compartilhadas por portal, blog, landing e app mobile via as mesmas
// variáveis CSS (--font-serif/--font-sans), em vez de cada superfície carregar sua
// própria fonte (a landing antes usava Newsreader/Public Sans à parte).
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Lúmen | Sistema Interno",
  description: "Controle financeiro, processos, agenda e kanban do escritório Rodarte Prado Advogados",
  // Habilita o comportamento de app instalável (tela cheia) no iOS.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Lúmen" },
};

export const viewport: Viewport = {
  themeColor: "#0a1128",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${cormorant.variable} ${inter.variable} font-sans antialiased brand-texture`}>
        {/* Script anti-flash: decide se a classe `dark` entra no <html> antes da hidratação
            (mesmo padrão de app/m/layout.tsx, adaptado para os 3 estados dia/tarde/noite). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
