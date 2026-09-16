import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Cabeçalho único do blog. Antes havia dois: o índice trazia um masthead central de `py-10` com
// marca grande, tarja "BLOG JURÍDICO", dois botões e um parágrafo de descrição; a matéria trazia
// uma barra compacta. Duas identidades para a mesma publicação, e no índice quase uma tela inteira
// de cromo antes da primeira linha de conteúdo — o oposto do que modo de leitura pede.
//
// A barra é a forma que ficou. A identidade editorial do índice (título e descrição) desceu para o
// papel, junto do conteúdo, onde ela é conteúdo e não cromo.
//
// O fundo `grafite-800` é fixo nos dois temas de propósito — é cromo de marca, mesmo raciocínio do
// rail e da barra de menus do produto (DESIGN-SYSTEM.md §3). Por isso o texto aqui usa `rail-tx`,
// `rail-marca` e `rotulo`, que são as variantes criadas para superfície que não retematiza:
// `--tx`/`--acao` trocariam de tema contra um fundo que não troca, e no Manhã sumiriam.
export default function CabecalhoBlog({
  voltarParaOBlog = false,
  // O índice tem "Blog Jurídico" como <h1> logo abaixo da barra; repeti-lo aqui seria a mesma
  // frase duas vezes em 60px de altura. Na matéria, a barra é o único lugar que nomeia a
  // publicação — lá ele fica.
  nomeDaSecao = true,
}: {
  voltarParaOBlog?: boolean;
  nomeDaSecao?: boolean;
}) {
  return (
    <header className="bg-grafite-800 px-4 sm:px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center gap-4 flex-wrap">
        <Link
          href="/blog"
          className="font-extrabold text-destaque tracking-[.16em] text-rail-marca transition-colors duration-100 ease-out hover:text-rotulo"
        >
          LÚMEN
        </Link>
        {nomeDaSecao && (
          <span className="text-etiqueta font-semibold uppercase tracking-[.16em] text-rail-tx">Blog Jurídico</span>
        )}
        {voltarParaOBlog && (
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-etiqueta font-semibold uppercase tracking-[.07em] text-rail-tx hover:text-rotulo transition-colors duration-100 ease-out"
          >
            <ArrowLeft size={13} /> Todas as matérias
          </Link>
        )}
        {/* O blog era beco sem saída: ZERO links para "/" e ZERO para /cadastro nos dois arquivos
            (auditoria de 2026-09-16). Todo tráfego orgânico chegava e não tinha para onde ir, e a
            marca do cabeçalho nem link era. */}
        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href="/"
            className="inline-flex items-center h-9 px-4 border border-gaveta-linha text-rail-tx hover:text-rotulo text-etiqueta font-semibold uppercase tracking-[.07em] rounded-sm transition-colors duration-100 ease-out"
          >
            Ir para o site
          </Link>
          <Link
            href="/cadastro"
            className="inline-flex items-center h-9 px-4 bg-acao hover:bg-acao-hover text-acao-tx text-etiqueta font-semibold uppercase tracking-[.07em] rounded-sm transition-[background-color,transform] duration-100 ease-out active:translate-y-px"
          >
            Conhecer o Lúmen
          </Link>
        </div>
      </div>
    </header>
  );
}
