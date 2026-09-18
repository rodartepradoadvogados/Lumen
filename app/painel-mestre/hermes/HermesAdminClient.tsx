"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertCircle, CheckCircle, Trash2, Activity, Database, Terminal, X } from "lucide-react";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";
import { Badge } from "@/components/ui";

type HermesProfile = {
  office: {
    id: string;
    slug: string;
    name: string;
    status: string;
  };
  profile: string;
  status: string;
  sessionCount: number;
  memorySizeKB: number;
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
    } catch (e: any) {
      setError(e.message);
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    fetchProfiles();
  }, []);

  const statusColors = {
    ready: "green",
    not_provisioned: "amber",
    unhealthy: "red",
    unknown: "slate",
  };

  const healthColors = {
    healthy: "green",
    unhealthy: "red",
    unknown: "slate",
  };

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-tx">Hermes Agent — Painel de Controle</h1>
          <p className="text-sm text-tx-2 mt-1">
            Gerenciamento dos perfis do Hermes por escritório
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm flex items-center gap-2">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-100 rounded">
            <X size={16} />
          </button>
        </div>
      )}

      <LumenPanel>
        <LumenPanelHeader
          title="Perfis do Hermes por Escritório"
          subtitle={`${profiles.length} escritório(s) monitorado(s)`}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sf-apoio/50 text-tx-2 text-left">
                <th className="p-3 font-medium">Escritório</th>
                <th className="p-3 font-medium">Perfil</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Sessões</th>
                <th className="p-3 font-medium">Memória</th>
                <th className="p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-regua">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-tx-2">
                    Carregando...
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-tx-2">
                    Nenhum escritório encontrado
                  </td>
                </tr>
              ) : (
                profiles.map((p) => (
                  <tr key={p.office.id} className="hover:bg-sf-apoio/30">
                    <td className="p-3">
                      <div className="font-medium text-tx">{p.office.name}</div>
                      <div className="text-xs text-tx-2">{p.office.slug}</div>
                      <Badge color={p.office.status === "ATIVA" ? "green" : "amber"}>
                        {p.office.status}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-xs text-tx-2">{p.profile}</td>
                    <td className="p-3">
                      <Badge color={statusColors[p.status as keyof typeof statusColors] || "slate"}>
                        {p.status === "ready" ? "Pronto" : p.status === "not_provisioned" ? "Não provisionado" : p.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-tx">{p.sessionCount}</td>
                    <td className="p-3 text-tx-2">{p.memorySizeKB} KB</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {p.status === "ready" && (
                          <>
                            <button
                              onClick={() => fetchStatus(p.office.slug)}
                              disabled={actionLoading === p.office.slug}
                              className="p-1.5 hover:bg-sf-apoio rounded text-tx-2 transition-colors"
                              title="Ver detalhes"
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
                            <button
                              onClick={() => runAction(p.office.slug, "clear_memory")}
                              disabled={actionLoading === p.office.slug}
                              className="p-1.5 hover:bg-sf-apoio rounded text-tx-2 transition-colors"
                              title="Limpar memória"
                            >
                              <Database size={16} />
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
        <LumenPanel>
          <LumenPanelHeader
            title={`Detalhes: ${selectedProfile}`}
            subtitle={`Perfil: ${status.profile} • Saúde: ${status.health}`}
          />
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge color={healthColors[status.health as keyof typeof healthColors] || "slate"}>
                {status.health === "healthy" ? "Saudável" : status.health === "unhealthy" ? "Não saudável" : "Desconhecido"}
              </Badge>
              <button
                onClick={() => fetchStatus(selectedProfile)}
                disabled={actionLoading === selectedProfile}
                className="text-sm text-acao hover:underline"
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
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded transition-colors"
                        title="Excluir sessão"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))
                )}
              )}
            </div>
          </div>
        </LumenPanel>
      )}
    </div>
  );
