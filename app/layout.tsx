import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["600", "700", "800"],
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Rodarte Prado Advogados | Sistema Interno",
  description: "Controle financeiro, processos, agenda e kanban do escritório Rodarte Prado Advogados",
  // Habilita o comportamento de app instalável (tela cheia) no iOS.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Gestão Jurídica" },
};

export const viewport: Viewport = {
  themeColor: "#0b1730",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${playfair.variable} ${inter.variable} font-sans antialiased brand-texture`}>
        {/* Script anti-flash: decide se a classe `dark` entra no <html> antes da hidratação
            (mesmo padrão de app/m/layout.tsx, adaptado para os 3 estados dia/tarde/noite). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
