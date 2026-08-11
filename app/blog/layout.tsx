import type { ReactNode } from "react";
import { Lora } from "next/font/google";

// Voz tipográfica própria do blog público — exceção DELIBERADA ao manual v2, aprovada pelo
// dono do escritório, não um resquício a "corrigir": o produto inteiro migrou pra Archivo sem
// serifa (app/layout.tsx, DESIGN-SYSTEM.md §14 — "font-serif deixa de existir"), mas o blog é
// vitrine e leitura longa, não tela de trabalho, e pode ter voz própria. Título de matéria e
// corpo do artigo usam esta serifa (Lora); o resto do site público (landing, privacidade)
// segue o produto — só Archivo, sem serifa.
//
// A classe utilitária `font-serif` do Tailwind NÃO serve pra isso: hoje ela é só um apelido de
// Archivo (tailwind.config.ts, legado de 107 arquivos que ainda a usam), então aplicá-la aqui
// não geraria serifa nenhuma. A fonte real é carregada aqui, com sua PRÓPRIA variável CSS
// (--font-blog-serif), aplicada só dentro de /blog via a className abaixo — nunca vaza pro
// resto do site. Nos componentes de app/blog/**, use a propriedade arbitrária do Tailwind
// `[font-family:var(--font-blog-serif)]`, não `font-serif`.
const lora = Lora({
  subsets: ["latin"],
  variable: "--font-blog-serif",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export default function BlogLayout({ children }: { children: ReactNode }) {
  return <div className={lora.variable}>{children}</div>;
}
