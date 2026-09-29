"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { horaDeBrasilia, dataDeBrasilia } from "@/lib/horaDeBrasilia";
import { EmptyState } from "@/components/ui";
import { descreverExecucao, ordenarFalhasPrimeiro } from "@/lib/gestao/saudeIntegracoes";

// Rota /conexoes. A página chega pronta do servidor (app/(app)/conexoes/page.tsx); o item aberto no
// detalhe é estado de cliente (trocar de item não precisa de nenhum round-trip). As guias
// (Ativas, Disponíveis, Webhooks e log) são links, e o título/trilha/guias vêm do gabarito único
// (components/gestao/ConexoesPagina.tsx). A seleção da lista se marca com fundo e aria-current, e
// não mais com um filete lateral de 4px.

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
  /** Grupo temático, mostrado como legenda pequena na lista. */
  grupo?: ConexaoGrupo;
};

const ESTADO_DOT: Record<ConexaoEstado, string> = {
  ok: "bg-concluido",
  erro: "bg-urgente",
  aviso: "bg-aviso",
  off: "bg-tx-3",
};

const ESTADO_TEXT: Record<ConexaoEstado, string> = {
  ok: "text-concluido",
  erro: "text-urgente",
  aviso: "text-aviso",
  off: "text-tx-3",
};

// Filete de TOPO — para a caixa de recado. Filete lateral grosso numa caixa é o antipadrão que a
// regra da casa já proibia; aqui ele virou régua no topo, como em todo cartão do sistema.
const ESTADO_TOPO: Record<ConexaoEstado, string> = {
  ok: "border-t-concluido",
  erro: "border-t-urgente",
  aviso: "border-t-aviso",
  off: "border-t-regua-forte",
};

function EstadoDot({ estado }: { estado: ConexaoEstado }) {
  return <span className={clsx("inline-block h-2 w-2 rounded-full shrink-0", ESTADO_DOT[estado])} />;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${dataDeBrasilia(d)} ${horaDeBrasilia(d)}`;
}

const RUN_STATUS_TEXT: Record<IntegrationRunRow["status"], string> = { OK: "text-concluido", ERRO: "text-urgente", AVISO: "text-aviso" };
const RUN_STATUS_PALAVRA: Record<IntegrationRunRow["status"], string> = { OK: "Ok", ERRO: "Falhou", AVISO: "Aviso" };
const LINHAS_INICIAIS = 8;

// Tabela de log — falhas PRIMEIRO, 8 linhas e "Ver mais" (eram ~28 linhas de "200"), o estado dito
// com palavra e a mensagem traduzida em português com a consequência. O código HTTP fica como
// detalhe pequeno, para quem precisa dele.
function RunsTable({ runs, showIntegration }: { runs: (IntegrationRunRow & { integration?: string })[]; showIntegration?: boolean }) {
  const [todas, setTodas] = useState(false);
  if (runs.length === 0) {
    return <p className="text-sm text-tx-2 px-5 py-6">Nenhuma execução registrada neste período.</p>;
  }
  const ordenadas = ordenarFalhasPrimeiro(runs);
  const mostradas = todas ? ordenadas : ordenadas.slice(0, LINHAS_INICIAIS);
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-etiqueta font-semibold uppercase tracking-[.1em] text-tx-2 border-b border-regua">
              <th scope="col" className="px-5 py-2 font-semibold w-[150px]">Quando</th>
              {showIntegration && <th scope="col" className="px-2 py-2 font-semibold">Integração</th>}
              <th scope="col" className="px-2 py-2 font-semibold w-[90px]">Estado</th>
              <th scope="col" className="px-2 py-2 font-semibold">O que aconteceu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-regua">
            {mostradas.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-2 tabular-nums text-tx-2 whitespace-nowrap">{formatDateTime(r.startedAt)}</td>
                {showIntegration && <td className="px-2 py-2 text-tx">{r.integration}</td>}
                <td className={clsx("px-2 py-2 font-semibold", RUN_STATUS_TEXT[r.status])}>{RUN_STATUS_PALAVRA[r.status]}</td>
                <td className="px-2 py-2 text-tx-2">
                  {descreverExecucao(r)}
                  {r.status !== "OK" && r.httpStatus !== null && <span className="text-etiqueta text-tx-3"> · código {r.httpStatus}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ordenadas.length > LINHAS_INICIAIS && (
        <div className="px-5 py-3 border-t border-regua">
          <button type="button" onClick={() => setTodas((v) => !v)} className="text-sm font-semibold text-marca-tx hover:underline">
            {todas ? "Mostrar só as mais importantes" : `Ver as ${ordenadas.length} execuções`}
          </button>
        </div>
      )}
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

      <div className={clsx("flex items-start gap-2 bg-sf-apoio border-t-2 px-3 py-2.5", ESTADO_TOPO[item.estado])}>
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
          <h3 className="text-etiqueta font-semibold text-tx-2 uppercase tracking-[.12em] mb-1.5">Frequência</h3>
          <p className="text-sm text-tx-2">{item.frequenciaNota}</p>
        </div>
      )}

      <div className="border-t-2 border-regua-forte">
        <div className="flex items-center justify-between px-1 py-3">
          <h3 className="text-etiqueta font-semibold text-tx-2 uppercase tracking-[.12em]">Log de execução</h3>
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
  guia,
  ativas,
  disponiveis,
  runsByIntegration,
}: {
  guia: "ativas" | "disponiveis" | "log";
  ativas: ConexaoItem[];
  disponiveis: ConexaoItem[];
  runsByIntegration: Record<string, IntegrationRunRow[]>;
}) {
  const [selectedId, setSelectedId] = useState("");

  if (guia === "log") {
    return (
      <div className="bg-sf border-t-2 border-regua-forte">
        <div className="px-5 py-4 border-b border-regua">
          <h2 className="text-destaque font-bold text-tx">Webhooks e log</h2>
          <p className="text-sm text-tx-2 mt-0.5">Todas as execuções dos últimos 30 dias, as falhas primeiro.</p>
        </div>
        <LogDetail runsByIntegration={runsByIntegration} />
      </div>
    );
  }

  const lista = guia === "disponiveis" ? disponiveis : ativas;
  if (lista.length === 0) {
    return (
      <div className="bg-sf border-t-2 border-regua-forte">
        <EmptyState
          title={guia === "ativas" ? "Nenhuma conexão ativa ainda" : "Nada mais para ligar por enquanto"}
          subtitle={guia === "ativas" ? "Veja as disponíveis na guia ao lado para ligar a primeira." : "Tudo o que funciona neste ambiente já está ativo."}
        />
      </div>
    );
  }
  const selected = lista.find((i) => i.id === selectedId) ?? lista[0];

  return (
    <div className="flex flex-col lg:flex-row lg:items-start bg-sf border-t-2 border-regua-forte animate-fade-in">
      <div className="w-full lg:w-[420px] shrink-0 border-b-2 lg:border-b-0 lg:border-r-2 border-regua-forte divide-y divide-regua">
        {lista.map((item) => {
          const active = item.id === selected.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              aria-current={active ? "true" : undefined}
              className={clsx("w-full text-left px-5 py-3 transition-colors", active ? "bg-sf-apoio" : "hover:bg-sf-apoio")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={clsx("text-sm text-tx", active ? "font-bold" : "font-semibold")}>{item.nome}</span>
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
      <div className="flex-1 min-w-0">
        <IntegrationDetail item={selected} runs={runsByIntegration[selected.id] ?? []} />
      </div>
    </div>
  );
}
