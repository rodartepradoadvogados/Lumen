import { Loader2 } from "lucide-react";

// Mesma ideia de app/(app)/loading.tsx (ver comentário lá): fallback instantâneo do App Router
// para o conteúdo de cada rota /m, sem mexer no cabeçalho/nav inferior (que ficam em app/m/layout.tsx,
// fora do <Suspense> automático deste arquivo). Nenhuma rota mobile tinha loading.tsx próprio, então
// toda navegação ficava "pulando" o conteúdo em branco até os dados chegarem do servidor.
export default function Loading() {
  return (
    <div className="p-4 flex items-center justify-center min-h-[40vh]">
      <div className="flex items-center gap-2 text-navy-800/50 dark:text-cream-50/50">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm font-medium">Carregando...</span>
      </div>
    </div>
  );
}
