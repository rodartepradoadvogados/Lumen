"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Badge, EmptyState, formatCurrency, formatDate } from "@/components/ui";
import { Plus } from "lucide-react";
import type { getAssessoriaDetail } from "@/lib/actions/assessoria";
import { TiraDeGuias, GuiaBotao } from "@/components/mobile/GuiaMobile";

type Assessoria = NonNullable<Awaited<ReturnType<typeof getAssessoriaDetail>>>;
type Licitacao = Assessoria["licitacoes"][number];

const STATUS_OPTIONS = [
  { value: "EM_ANALISE", label: "Em análise", color: "slate" as const },
  { value: "PARTICIPANDO", label: "Participando", color: "amber" as const },
  { value: "VENCEDORA", label: "Vencedora", color: "green" as const },
  { value: "PERDIDA", label: "Perdida", color: "bordo" as const },
  { value: "CANCELADA", label: "Cancelada", color: "slate" as const },
];
const statusMeta = (status: string) => STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];

type Sort = "prazo_asc" | "recente" | "valor_desc" | "nome_asc";

// Lista de Licitações da Assessoria no app — cada linha vira um cartão tocável (antes era só
// texto estático) que abre a página própria da licitação (/m/assessoria/[id]/licitacoes/[id]),
// mesmo modelo do site (AssessoriaLicitacoesTab.tsx), adaptado: chips de status em vez de um
// seletor, e "Ordenar" como seletor nativo (poucas opções, o próprio celular já resolve bem).
export default function MobileLicitacoesSection({ assessoriaId, licitacoes }: { assessoriaId: string; licitacoes: Licitacao[] }) {
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [sort, setSort] = useState<Sort>("prazo_asc");

  const exibidas = useMemo(() => {
    const base = statusFilter === "TODOS" ? licitacoes : licitacoes.filter((l) => l.status === statusFilter);
    const arr = [...base];
    if (sort === "prazo_asc") arr.sort((a, b) => (a.prazoFinal ? new Date(a.prazoFinal).getTime() : Infinity) - (b.prazoFinal ? new Date(b.prazoFinal).getTime() : Infinity));
    if (sort === "valor_desc") arr.sort((a, b) => (b.valorEstimado ?? -Infinity) - (a.valorEstimado ?? -Infinity));
    if (sort === "nome_asc") arr.sort((a, b) => (a.nome || a.objeto).localeCompare(b.nome || b.objeto, "pt-BR", { numeric: true }));
    return arr;
  }, [licitacoes, statusFilter, sort]);

  return (
    <Card>
      <div className="px-4 py-3 border-b border-regua flex items-center justify-between gap-2">
        <h2 className="font-bold text-tx text-sm">Licitações</h2>
        <Link href={`/m/assessoria/${assessoriaId}/licitacoes/nova`} className="flex items-center gap-1 text-corpo font-semibold text-marca-tx px-2.5 py-1 shrink-0">
          <Plus size={12} /> Nova licitação
        </Link>
      </div>

      {licitacoes.length === 0 ? (
        <EmptyState title="Nenhuma licitação cadastrada" />
      ) : (
        <>
          {/* Licitação vive dentro de Assessoria, que é da seção Jurídico. A
              contagem passa a ser dado da guia, não texto colado no rótulo. */}
          <TiraDeGuias className="px-4 pt-3">
            {[{ value: "TODOS", label: "Todos", n: licitacoes.length }, ...STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label, n: licitacoes.filter((l) => l.status === s.value).length }))].map((c) => (
              <GuiaBotao
                key={c.value}
                onClick={() => setStatusFilter(c.value)}
                ativa={statusFilter === c.value}
                contagem={c.n}
              >
                {c.label}
              </GuiaBotao>
            ))}
          </TiraDeGuias>
          <div className="flex justify-end px-4 pt-1 pb-2">
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="text-etiqueta border border-regua bg-sf text-tx px-1.5 py-1">
              <option value="prazo_asc">Prazo mais próximo</option>
              <option value="recente">Mais recente</option>
              <option value="valor_desc">Maior valor</option>
              <option value="nome_asc">Nome (A→Z)</option>
            </select>
          </div>
          <div className="px-4 pb-3 flex flex-col gap-2">
            {exibidas.map((l) => {
              const st = statusMeta(l.status);
              return (
                <Link key={l.id} href={`/m/assessoria/${assessoriaId}/licitacoes/${l.id}`} className="border border-regua rounded-lg p-3 block">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-tx truncate">{l.nome || l.objeto}</p>
                    <Badge color={st.color}>{st.label}</Badge>
                  </div>
                  <p className="text-corpo text-tx-2 mt-0.5 truncate">{l.orgao}</p>
                  <p className="text-corpo text-tx-2 mt-0.5">
                    {l.modalidade || "—"} · prazo {l.prazoFinal ? formatDate(l.prazoFinal) : "—"} · {l.valorEstimado ? formatCurrency(l.valorEstimado) : "—"}
                  </p>
                </Link>
              );
            })}
            {exibidas.length === 0 && <p className="text-center text-corpo text-tx-3 py-3">Nenhuma licitação com esse filtro.</p>}
          </div>
        </>
      )}
    </Card>
  );
}
