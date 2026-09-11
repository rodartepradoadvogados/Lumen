"use client";

import { useState } from "react";
import MobilePublicationCard from "@/components/mobile/MobilePublicationCard";
import type { PublicationGroup } from "@/lib/publicationGrouping";

type Pub = {
  id: string;
  kind: string;
  source: string;
  content: string;
  publishedAt: string;
  read: boolean;
  caseId: string | null;
  caseTitle: string | null;
  clientId?: string | null;
  clientName?: string | null;
  processNumberRaw: string | null;
  assignedToId?: string | null;
};

// Borda à esquerda por fonte (source do item principal do grupo) — mesmo mapeamento usado no
// desktop (ver components/PublicationsList.tsx) pra manter consistência visual entre as telas.
// Chaves batem com Publication.source de verdade (DJE/PJE/ESAJ/PROJUDI/MANUAL/JUSBRASIL_EMAIL,
// ver prisma/schema.prisma) — a versão anterior usava "DJEN"/"DATAJUD", que não existem, então
// a borda nunca aparecia; achado testando ao vivo, corrigido junto com o desktop.
// DJE = --acao, ESAJ = --aviso, PROJUDI = --tx-2, MANUAL = --vinho (via alias --atencao, é o
// único lançamento feito por pessoa), JUSBRASIL_EMAIL = --concluido — todos tokens semânticos
// já existentes. PJE tem token próprio (--fonte-pje, DESIGN-SYSTEM.md §9), separado do azul de
// ação para não se confundir com o filete do DJE — ver `fonte.pje` em tailwind.config.ts.
// (Movido de app/m/publicacoes/page.tsx pra cá junto com a paginação — P2-7.)
const SOURCE_BORDER_COLORS: Record<string, string> = {
  DJE: "border-l-acao",
  PJE: "border-l-fonte-pje",
  ESAJ: "border-l-aviso",
  PROJUDI: "border-l-tx-2",
  MANUAL: "border-l-atencao",
  JUSBRASIL_EMAIL: "border-l-concluido",
};
const DEFAULT_SOURCE_BORDER_COLOR = "border-l-regua-forte";

function sourceBorderColor(source: string): string {
  return SOURCE_BORDER_COLORS[source] ?? DEFAULT_SOURCE_BORDER_COLOR;
}

// P2-7 do roteiro de adequação: com até 3000 publicações por escritório (take de segurança em
// app/m/publicacoes/page.tsx), renderizar todo grupo de uma vez sem janelamento sobrecarrega o
// DOM num aparelho móvel. Em vez de instalar uma lib de virtualização (react-window/
// react-virtual, nenhuma instalada hoje), mostra só os primeiros PAGE_SIZE grupos e revela mais
// sob demanda — os dados já vieram do servidor numa carga só, isto só limita quanto vira nó de
// DOM de cada vez.
const PAGE_SIZE = 50;

export default function MobilePublicationsList({
  groups,
  users,
}: {
  groups: PublicationGroup<Pub>[];
  users: { id: string; name: string }[];
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = groups.slice(0, visibleCount);
  const remaining = groups.length - visibleCount;

  return (
    <>
      <div className="divide-y divide-regua">
        {visible.map((g) => (
          <div key={g.key} className={`border-l-4 ${sourceBorderColor(g.primary.source)} bg-sf`}>
            <MobilePublicationCard group={g} users={users} />
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
          className="w-full py-3 text-sm font-semibold text-acao hover:bg-sf-apoio transition-colors"
        >
          Carregar mais ({remaining} restante{remaining === 1 ? "" : "s"})
        </button>
      )}
    </>
  );
}
