"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertCircle, Trash2, Activity, X } from "lucide-react";
import { LumenPanel, LumenPanelHeader, LumenBadge } from "@/components/painelMestre/LumenUi";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

type UsoDoAgente = {
  perguntas7d: number;
  perguntas30d: number;
  consultas7d: number;
  recusasFinanceiro7d: number;
  recusasTeto7d: number;
  pessoas7d: number;
  ultimaEm: string | null;
};

type HermesProfile = {
  office: {
    id: string;
    slug: string;
    name: string;
    status: string;
    isInternal?: boolean;
  };
  profile: string;
  status: string;
  sessionCount: number;
  memorySizeKB: number;
  uso: UsoDoAgente | null;
};

type HermesStatus = {
  health: string;
  sessions: { id: string; title: string }[];
  profile: string;
};

export default function HermesAdminClient() {
  const [profiles, setProfiles] = useState<HermesProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [status, setStatus] = useState<HermesStatus | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchProfiles() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hermes?action=list");
      const data = await res.json();
      if (data.profiles) setProfiles(data.profiles);
    } catch {
      setError("Falha ao carregar perfis");
    } finally {
      setLoading(false);
    }
  }

  function fecharDetalhes() {
    setSelectedProfile(null);
    setStatus(null);
  }

  // O cabeçalho do detalhe mostra o NOME do escritório, não o slug. O slug é identificador de
  // sistema; quem opera o painel pensa em "Rodarte Prado", não em "rodarte-prado-advogados".
  function nomeDoEscritorio(slug: string): string {
    return profiles.find((p) => p.office.slug === slug)?.office.name ?? slug;
  }

  async function fetchStatus(slug: string) {
    setSelectedProfile(slug);
    setStatus(null);
    try {
      const res = await fetch(`/api/admin/hermes?action=status&slug=${slug}`);
      const data = await res.json();
      setStatus(data);
    } catch {
      setError("Falha ao carregar status");
    }
  }

  async function runAction(slug: string, action: string) {
    setActionLoading(slug);
    setError(null);
    try {
      const res = await fetch("/api/admin/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na ação");
      if (action === "clear_memory" || action === "restart") {
        await fetchStatus(slug);
      }
      fetchProfiles();
    } catch (e) {
      setError(mensagemDeErro(e));
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteSession(slug: string, sessionId: string) {
    if (!confirm("Excluir esta sessão?")) return;
    setActionLoading(`${slug}-${sessionId}`);
    try {
      const res = await fetch("/api/admin/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_session", slug, sessionId }),
      });
      if (!res.ok) throw new Error("Falha ao excluir sessão");
      await fetchStatus(slug);
    } catch (e) {
      setError(mensagemDeErro(e));
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    fetchProfiles();
  }, []);

  // Cor crua do Tailwind não retematiza: fica igual no tema claro e no escuro. Trocada pelas
  // variantes do selo, que leem os tokens da casa.
  const statusColors: Record<string, "success" | "warning" | "danger" | "default"> = {
    provisioned: "success",
    ready: "success",
    not_provisioned: "warning",
    unhealthy: "danger",
    unknown: "default",
  };

  const healthColors: Record<string, "success" | "warning" | "danger" | "default"> = {
    healthy: "success",
    unhealthy: "danger",
    unknown: "default",
  };

  return (
    <div className="p-6 max-w-[1500px] mx-auto animate-fade-in space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-tx">Lúmen Agent — Painel de Controle</h1>
          <p className="text-sm text-tx-2 mt-1">
            Quanto cada escritório usa o agente, e em que estado está o perfil dele
          </p>
        </div>
        <button
          onClick={fetchProfiles}
          disabled={loading}
          className="inline-flex items-center gap-1.5 bg-sf-apoio hover:bg-sf-superficie border border-regua text-tx text-sm font-semibold px-4 py-2.5 rounded-sm disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="bg-urgente-bg border border-linha-urgente text-urgente px-4 py-3 rounded-sm flex items-center gap-2">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-urgente-bg rounded">
            <X size={16} />
          </button>
        </div>
      )}

      {/* DUAS COLUNAS QUANDO HÁ DETALHE ABERTO.
          Antes o detalhe abria EMBAIXO da tabela. Com dois escritórios funcionava; com trinta,
          clicar numa linha do meio jogaria a resposta para fora da tela, e a pessoa teria que
          rolar para baixo procurando o que acabou de pedir. Agora a tabela encolhe para a
          esquerda e o detalhe entra à direita, ao lado da linha que o abriu.
          Abaixo de 1024px eles voltam a empilhar: em tela estreita, duas colunas de 300px são
          piores que uma de 600. */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
      <LumenPanel className={`transition-all duration-300 ${selectedProfile && status ? "lg:flex-1 lg:min-w-0" : "w-full"}`}>
        <LumenPanelHeader
          title="Lúmen Agent por escritório"
          subtitle={`${profiles.length} escritório(s) monitorado(s)`}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sf-apoio/50 text-tx-2 text-left">
                <th className="p-3 font-medium">Escritório</th>
                <th className="p-3 font-medium">Perfil</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Uso (7 dias)</th>
                <th className="p-3 font-medium">Sessões</th>
                <th className="p-3 font-medium">Memória</th>
                <th className="p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-regua">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-tx-2">
                    Carregando...
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-tx-2">
                    Nenhum escritório encontrado
                  </td>
                </tr>
              ) : (
                profiles.map((p) => (
                  <tr
                    key={p.office.id}
                    // A linha que abriu o detalhe fica marcada. Sem isto, com o painel aberto ao
                    // lado, não há como saber de QUEM é o detalhe que está na tela — e com trinta
                    // escritórios isso deixa de ser detalhe e vira erro de leitura.
                    className={
                      selectedProfile === p.office.slug
                        ? "bg-sf-apoio border-l-2 border-l-marca-tx"
                        : "hover:bg-sf-apoio/30 border-l-2 border-l-transparent"
                    }
                  >
                    <td className="p-3">
                      <div className="font-medium text-tx">{p.office.name}</div>
                      <div className="text-xs text-tx-2">{p.office.slug}</div>
                      <LumenBadge variant={p.office.status === "ATIVA" ? "success" : "warning"}>
                        {p.office.status}
                      </LumenBadge>
                      {p.office.isInternal && (
                        <span className="ml-1 text-xs text-tx-3">interno</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs text-tx-2">{p.profile}</td>
                    <td className="p-3">
                      <LumenBadge variant={statusColors[p.status as keyof typeof statusColors] || "default"}>
                        {p.status === "ready" ? "Pronto" : p.status === "not_provisioned" ? "Não provisionado" : p.status}
                      </LumenBadge>
                    </td>
                    <td className="p-3">
                      {p.uso ? (
                        <div className="leading-tight">
                          <div className="text-tx tabular-nums">
                            {p.uso.perguntas7d} pergunta{p.uso.perguntas7d === 1 ? "" : "s"}
                            {p.uso.pessoas7d > 0 && (
                              <span className="text-tx-2"> · {p.uso.pessoas7d} pessoa{p.uso.pessoas7d === 1 ? "" : "s"}</span>
                            )}
                          </div>
                          <div className="text-xs text-tx-2 tabular-nums">
                            {p.uso.consultas7d} consulta{p.uso.consultas7d === 1 ? "" : "s"} aos dados
                            <span className="text-tx-3"> · {p.uso.perguntas30d} em 30 dias</span>
                          </div>
                          {p.uso.recusasFinanceiro7d > 0 && (
                            <div className="text-xs text-aviso tabular-nums">
                              {p.uso.recusasFinanceiro7d} recusa{p.uso.recusasFinanceiro7d === 1 ? "" : "s"} · sem acesso ao financeiro
                            </div>
                          )}
                          {p.uso.recusasTeto7d > 0 && (
                            <div className="text-xs text-urgente tabular-nums">
                              {p.uso.recusasTeto7d} recusa{p.uso.recusasTeto7d === 1 ? "" : "s"} · teto por minuto
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-tx-3">sem uso registrado</span>
                      )}
                    </td>
                    <td className="p-3 text-tx">{p.sessionCount}</td>
                    <td className="p-3 text-tx-2">{p.memorySizeKB} KB</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {p.status === "ready" && (
                          <>
                            <button
                              // Clicar de novo na mesma linha FECHA. É o gesto que todo mundo
                              // tenta antes de procurar o X.
                              onClick={() =>
                                selectedProfile === p.office.slug ? fecharDetalhes() : fetchStatus(p.office.slug)
                              }
                              disabled={actionLoading === p.office.slug}
                              aria-expanded={selectedProfile === p.office.slug}
                              className={`p-1.5 rounded transition-colors ${
                                selectedProfile === p.office.slug
                                  ? "bg-sf-apoio text-marca-tx"
                                  : "hover:bg-sf-apoio text-tx-2"
                              }`}
                              title={selectedProfile === p.office.slug ? "Fechar detalhes" : "Ver detalhes"}
                            >
                              <Activity size={16} />
                            </button>
                            <button
                              onClick={() => runAction(p.office.slug, "restart")}
                              disabled={actionLoading === p.office.slug}
                              className="p-1.5 hover:bg-sf-apoio rounded text-tx-2 transition-colors"
                              title="Health check"
                            >
                              <RefreshCw size={16} />
                            </button>
                          </>
                        )}
                        {p.status === "not_provisioned" && (
                          <span className="text-xs text-tx-2">Provisionar no onboarding</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </LumenPanel>

      {selectedProfile && status && (
        <LumenPanel className="w-full lg:w-[380px] lg:shrink-0 animate-fade-in">
          {/* Cabeçalho próprio em vez do LumenPanelHeader: a régua de baixo precisa atravessar
              a largura inteira, e um botão ao lado do componente pronto deixaria a régua parando
              no meio do painel. */}
          <div className="px-5 py-4 border-b border-regua flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-tx font-semibold text-base truncate">{nomeDoEscritorio(selectedProfile)}</h3>
              <p className="text-xs text-tx-2 mt-0.5 truncate">
                {selectedProfile} • perfil {status.profile}
              </p>
            </div>
            <button
              onClick={fecharDetalhes}
              aria-label="Fechar detalhes"
              className="p-1.5 hover:bg-sf-apoio rounded text-tx-2 transition-colors shrink-0"
              title="Fechar detalhes"
            >
              <X size={16} />
            </button>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <LumenBadge variant={healthColors[status.health as keyof typeof healthColors] || "default"}>
                {status.health === "healthy" ? "Saudável" : status.health === "unhealthy" ? "Não saudável" : "Desconhecido"}
              </LumenBadge>
              <button
                onClick={() => fetchStatus(selectedProfile)}
                disabled={actionLoading === selectedProfile}
                className="text-sm text-marca-tx hover:underline"
              >
                <RefreshCw size={14} className="inline mr-1" /> Atualizar
              </button>
            </div>

            <div>
              <h4 className="font-medium text-tx mb-2">Sessões ({status.sessions.length})</h4>
              {status.sessions.length === 0 ? (
                <p className="text-sm text-tx-2">Nenhuma sessão ativa</p>
              ) : (
                <ul className="space-y-2">
                  {status.sessions.map((s) => (
                    <li key={s.id} className="flex items-center justify-between p-3 bg-sf-apoio/50 rounded-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs text-tx">{s.id}</div>
                        <div className="text-sm text-tx-2 truncate">{s.title}</div>
                      </div>
                      <button
                        onClick={() => deleteSession(selectedProfile, s.id)}
                        disabled={actionLoading === `${selectedProfile}-${s.id}`}
                        className="p-1.5 hover:bg-urgente-bg text-urgente rounded transition-colors"
                        title="Excluir sessão"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </LumenPanel>
      )}
      </div>
    </div>
  );
}