"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { listAuditEvents, exportarTrilha, type AuditEventRow } from "@/lib/actions/privacidade";
import { Download } from "lucide-react";

type Aba = "REVELACAO" | "EXPORTACAO" | "EXCLUSAO" | "SUPORTE";

const ABAS: { key: Aba; label: string }[] = [
  { key: "REVELACAO", label: "Revelações" },
  { key: "EXPORTACAO", label: "Exportações" },
  { key: "EXCLUSAO", label: "Exclusões" },
  { key: "SUPORTE", label: "Suporte" },
];

const KIND_LABEL: Record<string, string> = {
  REVELACAO: "revelou um campo mascarado",
  EXPORTACAO: "exportou a trilha",
  EXCLUSAO: "executou uma exclusão",
  ANONIMIZACAO: "executou uma anonimização",
};

function contexto(row: AuditEventRow): string | null {
  const partes: string[] = [];
  if (row.entityType && row.entityId) partes.push(`${row.entityType} · ${row.entityId}`);
  if (row.field) partes.push(`campo: ${row.field}`);
  if (row.reason) partes.push(row.reason);
  return partes.length ? partes.join(" — ") : null;
}

// Coluna de trilha de auditoria do documento 07 (Fase 4) — 4 abas. "Suporte" não duplica
// app/(app)/configuracoes/acessos (já existente, com política de acesso, sessão ativa, fila de
// aprovação e histórico completo de 90 dias) — só resume e linka pra lá, pra não manter duas
// fontes de verdade da mesma trilha (AccessAuditLog) em lugares diferentes.
export default function TrilhaAuditoria() {
  const [aba, setAba] = useState<Aba>("REVELACAO");
  const [rows, setRows] = useState<AuditEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, startExport] = useTransition();

  useEffect(() => {
    if (aba === "SUPORTE") return;
    setLoading(true);
    listAuditEvents(aba).then((r) => {
      setRows(r);
      setLoading(false);
    });
  }, [aba]);

  function baixarCsv() {
    if (aba === "SUPORTE") return;
    const abaLabel = ABAS.find((a) => a.key === aba)?.label ?? aba;
    startExport(async () => {
      const result = await exportarTrilha(aba, abaLabel);
      if (result.error || !result.csv) return;
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trilha-${aba.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      // Reflete o evento de EXPORTACAO que a própria action acabou de gravar, sem esperar
      // recarregar a página — só relevante quando a aba aberta É a de Exportações.
      if (aba === "EXPORTACAO") listAuditEvents("EXPORTACAO").then(setRows);
    });
  }

  return (
    <div className="border-l border-regua md:pl-6">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {ABAS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAba(a.key)}
              className={`text-xs font-semibold px-3 py-1.5 transition-colors ${
                aba === a.key ? "bg-acao text-acao-tx" : "bg-sf-apoio text-tx-2 hover:bg-regua"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        {aba !== "SUPORTE" && (
          <button
            type="button"
            disabled={exporting}
            onClick={baixarCsv}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx disabled:opacity-50"
          >
            <Download size={13} /> CSV
          </button>
        )}
      </div>

      {aba === "SUPORTE" ? (
        <div className="py-6 text-sm text-tx-2 space-y-2">
          <p>Acessos do suporte da Lúmen ao seu escritório — política, sessão ativa e histórico completo (90 dias).</p>
          <Link href="/configuracoes/acessos" className="text-xs font-semibold text-acao hover:text-acao-hover">
            Ver acessos da Lúmen →
          </Link>
        </div>
      ) : loading ? (
        <p className="py-6 text-sm text-tx-3">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-sm text-tx-3">Nada por aqui ainda.</p>
      ) : (
        <div className="divide-y divide-regua">
          {rows.map((r) => (
            <div key={r.id} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[18px] font-extrabold text-tx">
                  {r.actorName} <span className="font-medium text-tx-2">{KIND_LABEL[r.kind] ?? r.kind}</span>
                </p>
                {contexto(r) && <p className="text-[16px] text-tx-2 mt-0.5">{contexto(r)}</p>}
              </div>
              <span className="text-[15px] text-tx-3 shrink-0 whitespace-nowrap">{new Date(r.createdAt).toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
