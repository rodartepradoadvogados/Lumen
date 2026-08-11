"use client";

import { useEffect, useRef, useState } from "react";
import PublicationRow from "@/components/PublicationRow";
import type { PublicationGroup } from "@/lib/publicationGrouping";

type Pub = {
  id: string;
  kind: string;
  source: string;
  content: string;
  publishedAt: string;
  read: boolean;
  deadlineGenerated: boolean;
  lawyerTag: string | null;
  processNumberRaw: string | null;
  case: { id: string; title: string; processNumber: string | null } | null;
  client: { id: string; name: string } | null;
  taskCount?: number;
  assignedToId: string | null;
  triageStatus: string;
};

const STORAGE_KEY = "rp_seen_publications";

// Borda à esquerda por fonte (source do item principal do grupo, ver lib/publicationGrouping.ts)
// — pistas rápidas de origem sem precisar ler o rótulo. Tabela exata em DESIGN-SYSTEM.md §9.
// Chaves batem com Publication.source de verdade (ver prisma/schema.prisma: "DJE | PJE | ESAJ |
// PROJUDI | MANUAL | JUSBRASIL_EMAIL") — a versão anterior usava "DJEN"/"DATAJUD", que não
// existem nesse campo, então a borda nunca aparecia (sempre caía no cinza padrão); achado
// testando ao vivo. Continuam certas nesta rodada.
// DJE = --acao, ESAJ = --aviso, PROJUDI = --tx-2, MANUAL = --vinho (via alias --atencao, é o
// único lançamento feito por pessoa), JUSBRASIL_EMAIL = --concluido — todos tokens semânticos
// já existentes. PJE é a única fonte sem token próprio no design system (#2f6fb0 / #93c0f0 no
// manual); fica em valor cravado até existir `--fonte-pje` em app/globals.css.
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

export default function PublicationsList({
  groups,
  highlightNew = true,
  users = [],
}: {
  groups: PublicationGroup<Pub>[];
  highlightNew?: boolean;
  users?: { id: string; name: string }[];
}) {
  // Starts empty so the very first client render matches the server-rendered
  // HTML exactly (the server has no localStorage) — avoids a hydration
  // mismatch. The real "seen" set is computed client-side after mount.
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const hasRun = useRef(false);

  useEffect(() => {
    if (!highlightNew) return;
    if (hasRun.current) return; // guards against Strict Mode's double effect invocation in dev
    hasRun.current = true;

    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      seen = [];
    }
    const seenSet = new Set(seen);
    // "Novo" é decidido pelo grupo (chave = id do item principal), não por publicação
    // individual — senão um grupo que ganhou uma nova fonte pra um card já visto piscaria
    // inteiro de novo mesmo sem o usuário nunca ter visto aquele card.
    const fresh = new Set(groups.filter((g) => !seenSet.has(g.key)).map((g) => g.key));
    setNewIds(fresh);

    const updated = Array.from(new Set([...seen, ...groups.map((g) => g.key)])).slice(-500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.map((g) => g.key).join(",")]);

  return (
    <div className="divide-y divide-regua bg-sf">
      {groups.map((g) => (
        <div
          key={g.key}
          className={`border-l-[3px] ${sourceBorderColor(g.primary.source)} ${newIds.has(g.key) ? "bg-marca-bg" : ""}`}
        >
          <PublicationRow group={g} users={users} />
        </div>
      ))}
    </div>
  );
}
