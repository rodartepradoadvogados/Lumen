import { Loader2 } from "lucide-react";

// Fallback instantâneo do App Router para toda a área de conteúdo do site (o <Suspense>
// automático deste arquivo envolve só o page.tsx de cada rota, não o layout.tsx — a Sidebar e a
// TopBar continuam montadas normalmente, só o miolo troca por este spinner enquanto a página
// nova busca dados no servidor). Sem isso o usuário via a tela em branco/"pulando" entre o clique
// no menu e o conteúdo aparecer, em toda navegação (nenhuma rota daqui tinha loading.tsx próprio).
// Mesmo spinner (Loader2 + animate-spin) já usado em componentes.NewCaseAttachmentsField.tsx e
// SyncPublicationsButton.tsx — não inventa um padrão novo de skeleton.
export default function Loading() {
  return (
    <div className="p-6 flex items-center justify-center min-h-[50vh]">
      <div className="flex items-center gap-2.5 text-navy-800/50 dark:text-cream-50/50">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm font-medium">Carregando...</span>
      </div>
    </div>
  );
}
