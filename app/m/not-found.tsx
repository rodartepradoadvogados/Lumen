import Link from "next/link";
import { SearchX } from "lucide-react";

// Terceiro arquivo do trio error.tsx/loading.tsx/not-found.tsx — faltava este. Sem ele, as
// dezenas de notFound() espalhadas por app/m/** caíam na 404 padrão do Next ("This page could
// not be found", em inglês), renderizada FORA de app/m/layout.tsx — ou seja, sem a barra
// inferior do PWA e sem link de volta. Num app instalado em tela cheia (sem barra de endereço
// nem botão Voltar do navegador) isso é beco sem saída (achado A49 da revisão gauntlet).
export default function MobileNotFound() {
  return (
    <div className="p-4 flex items-center justify-center min-h-[40vh]">
      <div className="max-w-xs text-center space-y-3">
        <div className="mx-auto h-10 w-10 rounded-full bg-sf-apoio flex items-center justify-center">
          <SearchX size={18} className="text-tx-3" />
        </div>
        <h1 className="text-base font-bold text-tx">Página não encontrada</h1>
        <p className="text-xs text-tx-2">
          O conteúdo que você procura não existe ou você não tem acesso a ele.
        </p>
        <div className="flex flex-col items-stretch gap-2 pt-1">
          <Link
            href="/m"
            className="inline-flex items-center justify-center gap-2 bg-acao text-acao-tx text-sm font-semibold px-4 py-2.5"
          >
            Voltar ao Início
          </Link>
        </div>
      </div>
    </div>
  );
}
