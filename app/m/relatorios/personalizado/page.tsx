import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { ArrowLeft } from "lucide-react";
import RelatorioPersonalizadoView from "@/components/relatorios/RelatorioPersonalizadoView";

export const dynamic = "force-dynamic";

// Mesmo componente do site (components/relatorios/RelatorioPersonalizadoView.tsx) — ele já busca
// os próprios dados via Server Actions (lib/actions/relatorioPersonalizado.ts) e é construído só
// com classes responsivas (grade auto-fit, chips com flex-wrap, ModalShell), então roda igual no
// app sem precisar de nenhuma versão "Mobile" própria: mesmos filtros, mesmos modelos salvos,
// mesmo "Baixar em Word"/"Imprimir". Pedido explícito: "emitirmos relatórios personalizado igual
// ao site" — reaproveitar garante que os dois lados nunca divergem no que cada filtro faz.
export default async function MobileRelatorioPersonalizado() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m/relatorios" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Relatórios
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Relatório Personalizado</h1>
        <p className="text-sm text-tx-2">Monte a pergunta: período, o que contar, origem, assessoria, responsável e mais.</p>
      </div>

      <RelatorioPersonalizadoView />
    </div>
  );
}
