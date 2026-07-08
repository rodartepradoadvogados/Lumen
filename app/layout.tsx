import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

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
};

// TopBar consulta o banco em toda renderização (alertas) — nunca pré-renderizar estaticamente.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${playfair.variable} ${inter.variable} font-sans antialiased brand-texture`}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar />
            <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
