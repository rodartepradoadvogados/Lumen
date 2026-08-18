import Link from "next/link";
import { SearchX } from "lucide-react";

// Mesma ideia de app/m/not-found.tsx (ver comentário lá), versão desktop — terceiro arquivo do
// trio error.tsx/loading.tsx/not-found.tsx que faltava no site (achado A49 da revisão gauntlet).
export default function NotFound() {
  return (
    <div className="p-6 flex items-center justify-center min-h-[50vh]">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-sf-apoio flex items-center justify-center">
          <SearchX size={22} className="text-tx-3" />
        </div>
        <h1 className="font-serif text-xl font-bold text-tx">Página não encontrada</h1>
        <p className="text-sm text-tx-2">
          O conteúdo que você procura não existe ou você não tem acesso a ele.
        </p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <Link
            href="/painel"
            className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2.5"
          >
            Voltar ao Painel
          </Link>
        </div>
      </div>
    </div>
  );
}
