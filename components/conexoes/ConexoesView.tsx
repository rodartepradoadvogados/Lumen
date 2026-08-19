"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";

// Rota /conexoes (documento 04 do handoff do redesenho Modernist) — catálogo à esquerda (520px,
// borda direita 2px), detalhe de anatomia fixa à direita. Item selecionado é estado de cliente
// (não muda a URL): a página inteira já chega pronta do servidor (app/(app)/conexoes/page.tsx),
// então trocar o item em foco não precisa de nenhum round-trip — só decide o que mostrar.

export type ConexaoEstado = "ok" | "erro" | "aviso" | "off";
export type ConexaoGrupo = "Tribunais" | "Dinheiro" | "Arquivos" | "Mensagens" | "Chaves e automação";

export type IntegrationRunRow = {
  id: string;
  startedAt: string;
  status: "OK" | "ERRO" | "AVISO";
  httpStatus: number | null;
  itemCount: number | null;
  message: string | null;
};

export type ConexaoItem = {
  id: string;
  nome: string;
  descricao: string;
  estado: ConexaoEstado;
  estadoTexto: string;
  contexto: string;
  resultado?: string;
  acoes?: ReactNode;
  // Conteúdo específico da integração, abaixo da linha de estado e acima do log — ex.: as OABs
  // monitoradas pelo DJEN. Nem toda integração tem (a maioria não), por isso opcional.
  extra?: ReactNode;
  // Nota de "frequência configurável" (documento 04, anatomia item 5) — quando a integração
  // depende de um agendamento fora do controle desta tela (ex.: DJEN/DATAJUD, agendados no
  // serviço Python à parte), mostra essa ressalva em vez de fabricar um controle que não mudaria
  // nada de verdade.
  frequenciaNota?: string;
  // "Webhooks e log" (documento 04) não é uma integração com ciclo de vida próprio — é a visão
  // consolidada de TODAS as outras. Só este item usa o painel de detalhe alternativo (filtro +
  // exportação), em vez da anatomia fixa de 1-a-6 do documento.
  ehLog?: boolean;
};

const ESTADO_DOT: Record<ConexaoEstado, string> = {
  ok: "bg-concluido",
  erro: "bg-atencao",
  aviso: "bg-aviso",
  off: "bg-tx-3",
};

const ESTADO_TEXT: Record<ConexaoEstado, string> = {
  ok: "text-concluido",
  erro: "text-atencao",
  aviso: "text-aviso",
  off: "text-tx-3",
};

const ESTADO_BORDER: Record<ConexaoEstado, string> = {
  ok: "border-concluido",
  erro: "border-atencao",
  aviso: "border-aviso",
  off: "border-tx-3",
};

function EstadoDot({ estado }: { estado: ConexaoEstado }) {
  return <span className={clsx("inline-block h-2 w-2 rounded-full shrink-0", ESTADO_DOT[estado])} />;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

const RUN_STATUS_TEXT: Record<IntegrationRunRow["status"], string> = { OK: "text-concluido", ERRO: "text-atencao", AVISO: "text-aviso" };

// Tabela de log — mesma estrutura tanto no detalhe de uma integração (log só dela) quanto no
// detalhe de "Webhooks e log" (log de todas, com a coluna extra de integração).
function RunsTable({ runs, showIntegration }: { runs: (IntegrationRunRow & { integration?: string })[]; showIntegration?: boolean }) {
  if (runs.length === 0) {
    return <p className="text-sm text-tx-2 px-5 py-6">Nenhuma execução registrada neste período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-[.1em] text-tx-2 border-b border-regua">
            <th className="px-5 py-2 font-semibold w-[150px]">Data/hora</th>
            {showIntegration && <th className="px-2 py-2 font-semibold">Integração</th>}
            <th className="px-2 py-2 font-semibold w-[90px]">Status</th>
            <th className="px-2 py-2 font-semibold">Resultado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-regua">
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="px-5 py-2 tabular-nums text-tx-2">{formatDateTime(r.startedAt)}</td>
              {showIntegration && <td className="px-2 py-2 text-tx">{r.integration}</td>}
              <td className={clsx("px-2 py-2 font-semibold", RUN_STATUS_TEXT[r.status])}>{r.httpStatus ?? r.status}</td>
              <td className="px-2 py-2 text-tx-2">
                {r.message ?? (r.itemCount !== null ? `${r.itemCount} item(ns)` : "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toCsv(rows: (IntegrationRunRow & { integration: string })[]): string {
  const header = ["integracao", "data_hora", "status", "http_status", "itens", "mensagem"];
  const lines = rows.map((r) =>
    [r.integration, r.startedAt, r.status, r.httpStatus ?? "", r.itemCount ?? "", (r.message ?? "").replace(/[\r\n,]+/g, " ")].join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

// Exportação em CSV, gerada e baixada no cliente (sem round-trip) — o documento 04 prevê que essa
// exportação entre na trilha de auditoria do documento 07 (privacidade/LGPD, Fase 04, ainda não
// implementada nesta fase); quando essa trilha existir, este botão passa a registrar o evento
// também, mas o download em si já funciona hoje.
function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `conexoes-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function LogDetail({ runsByIntegration }: { runsByIntegration: Record<string, IntegrationRunRow[]> }) {
  const [integracao, setIntegracao] = useState("");
  const [estado, setEstado] = useState("");

  const allRuns = useMemo(
    () =>
      Object.entries(runsByIntegration)
        .flatMap(([integration, runs]) => runs.map((r) => ({ ...r, integration })))
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    [runsByIntegration]
  );
  const integracoes = useMemo(() => Array.from(new Set(allRuns.map((r) => r.integration))).sort(), [allRuns]);
  const filtrados = allRuns.filter((r) => (!integracao || r.integration === integracao) && (!estado || r.status === estado));

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b border-regua">
        <select
          value={integracao}
          onChange={(e) => setIntegracao(e.target.value)}
          className="h-8 border-2 border-regua-forte bg-sf text-sm text-tx px-2"
        >
          <option value="">Todas as integrações</option>
          {integracoes.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="h-8 border-2 border-regua-forte bg-sf text-sm text-tx px-2">
          <option value="">Todos os estados</option>
          <option value="OK">OK</option>
          <option value="ERRO">Erro</option>
          <option value="AVISO">Aviso</option>
        </select>
        <button
          type="button"
          onClick={() => downloadCsv(toCsv(filtrados))}
          disabled={filtrados.length === 0}
          className="ml-auto inline-flex items-center justify-start h-8 border-2 border-regua-forte bg-transparent hover:bg-acao-bg disabled:opacity-50 text-tx font-semibold text-xs px-3 transition-colors"
        >
          Exportar CSV
        </button>
      </div>
      <RunsTable runs={filtrados} showIntegration />
    </div>
  );
}

function IntegrationDetail({ item, runs }: { item: ConexaoItem; runs: IntegrationRunRow[] }) {
  const [janela, setJanela] = useState<7 | 30>(7);
  const cutoff = Date.now() - janela * 86400000;
  const runsJanela = runs.filter((r) => new Date(r.startedAt).getTime() >= cutoff);

  return (
    <div className="flex flex-col gap-5 p-5">
      <div>
        <h2 className="text-xl font-bold text-tx">{item.nome}</h2>
        <p className="text-sm text-tx-2 mt-1">{item.descricao}</p>
      </div>

      {item.acoes && <div className="flex flex-wrap gap-2">{item.acoes}</div>}

      <div className={clsx("flex items-start gap-2 bg-sf-apoio border-l-4 px-3 py-2.5", ESTADO_BORDER[item.estado])}>
        <EstadoDot estado={item.estado} />
        <p className="text-sm text-tx">
          <span className={clsx("font-semibold", ESTADO_TEXT[item.estado])}>{item.estadoTexto}</span>
          {" — "}
          {item.resultado || item.contexto}
        </p>
      </div>

      {item.extra}

      {item.frequenciaNota && (
        <div>
          <h3 className="text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em] mb-1.5">Frequência</h3>
          <p className="text-sm text-tx-2">{item.frequenciaNota}</p>
        </div>
      )}

      <div className="border-t-2 border-regua-forte">
        <div className="flex items-center justify-between px-1 py-3">
          <h3 className="text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em]">Log de execução</h3>
          <div className="flex gap-1">
            {([7, 30] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setJanela(n)}
                className={clsx(
                  "h-7 px-2.5 text-xs font-semibold transition-colors",
                  janela === n ? "bg-acao text-acao-tx" : "bg-transparent text-tx-2 hover:bg-sf-apoio"
                )}
              >
                {n} dias
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-regua -mx-5">
          <RunsTable runs={runsJanela} />
        </div>
      </div>
    </div>
  );
}

export default function ConexoesView({
  grupos,
  totalIntegracoes,
  exigemAtencao,
  runsByIntegration,
}: {
  grupos: { grupo: ConexaoGrupo; itens: ConexaoItem[] }[];
  totalIntegracoes: number;
  exigemAtencao: number;
  runsByIntegration: Record<string, IntegrationRunRow[]>;
}) {
  const firstId = grupos[0]?.itens[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(firstId);
  const selected = grupos.flatMap((g) => g.itens).find((i) => i.id === selectedId) ?? grupos[0]?.itens[0];

  return (
    // Sem h-full/overflow próprio: <main> (components/AppShell.tsx) já é o único scroller da
    // página, como em todas as outras rotas — duas áreas de rolagem aninhadas (esta + a de
    // <main>) rendem inconsistente entre navegadores sem ganho real (o catálogo cabe folgado
    // numa tela comum; quem tiver uma janela baixa só rola a página inteira, como em qualquer
    // outra tela do produto).
    <div className="animate-fade-in">
      <div className="px-6 py-5 border-b-2 border-regua-forte">
        <h1 className="text-[30px] font-extrabold text-tx leading-tight">Conexões</h1>
        <p className="text-sm text-tx-2 mt-1">
          {totalIntegracoes} integrações · {exigemAtencao} exige{exigemAtencao === 1 ? "" : "m"} atenção
        </p>
      </div>

      <div className="flex flex-col md:flex-row md:items-start">
        <div className="w-full md:w-[520px] shrink-0 border-b-2 md:border-b-0 md:border-r-2 border-regua-forte">
          {grupos.map((g) => (
            <div key={g.grupo}>
              <p className="px-5 py-2 text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em] bg-sf-apoio">{g.grupo}</p>
              <div className="divide-y divide-regua">
                {g.itens.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={clsx(
                        "w-full text-left px-5 py-3 border-l-4 transition-colors",
                        active ? "bg-sf-apoio border-l-acao" : "border-l-transparent hover:bg-sf-apoio"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-tx">{item.nome}</span>
                        <span className={clsx("flex items-center gap-1.5 text-xs font-semibold shrink-0", ESTADO_TEXT[item.estado])}>
                          <EstadoDot estado={item.estado} />
                          {item.estadoTexto}
                        </span>
                      </div>
                      <p className="text-xs text-tx-2 mt-0.5 truncate">{item.contexto}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {selected &&
            (selected.ehLog ? (
              <LogDetail runsByIntegration={runsByIntegration} />
            ) : (
              <IntegrationDetail item={selected} runs={runsByIntegration[selected.id] ?? []} />
            ))}
        </div>
      </div>
    </div>
  );
}
