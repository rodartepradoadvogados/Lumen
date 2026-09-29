"use client";

import { usePathname } from "next/navigation";
import { guiaDaConversa } from "@/lib/navegacaoDoAtendimentoApp";

// O painel da guia aberta (Chat ou Detalhes): `tabpanel` ligado à guia por `aria-labelledby`. Fica no layout
// da conversa, em volta do que cada guia desenha.
export default function PainelDaConversa({ children }: { children: React.ReactNode }) {
  const guia = guiaDaConversa(usePathname() || "") ?? "chat";
  return (
    <div id="painel-da-conversa" role="tabpanel" aria-labelledby={`guia-${guia}`} className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
