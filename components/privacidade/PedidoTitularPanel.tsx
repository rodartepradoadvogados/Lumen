"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  abrirPedidoTitular,
  avaliarPedidoTitular,
  executarPedidoTitular,
  type DataSubjectRequestRow,
} from "@/lib/actions/privacidade";
import ModalShell from "@/components/ModalShell";
import { Badge } from "@/components/ui";
import { Plus } from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  EXCLUSAO: "Exclusão",
  ANONIMIZACAO: "Anonimização",
  ACESSO: "Acesso",
  CORRECAO: "Correção",
};

const STATUS_COLOR: Record<string, "amber" | "blue" | "green" | "red"> = {
  ABERTO: "amber",
  EM_ANALISE: "blue",
  EXECUTADO: "green",
  RECUSADO: "red",
};

const STATUS_LABEL: Record<string, string> = {
  ABERTO: "Aberto",
  EM_ANALISE: "Em análise",
  EXECUTADO: "Executado",
  RECUSADO: "Recusado",
};

function prazoLabel(dueAt: string, status: string): { texto: string; atrasado: boolean } {
  if (status === "EXECUTADO" || status === "RECUSADO") return { texto: "—", atrasado: false };
  const dias = Math.ceil((new Date(dueAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (dias < 0) return { texto: `${Math.abs(dias)} dia(s) em atraso`, atrasado: true };
  if (dias === 0) return { texto: "vence hoje", atrasado: true };
  return { texto: `${dias} dia(s) restante(s)`, atrasado: dias <= 3 };
}

// Bloco "Pedido do titular" (documento 07, LGPD art. 18) — pedido com prazo legal, não botão de
// apagar direto. Fluxo: abrir → prazo de 15 dias visível → avaliação (registra a análise: há
// dever legal de guarda? processo em curso?) → execução (o admin já fez a alteração real no
// cadastro pelas telas normais — Contatos, Processo etc. — e só então marca aqui como executado,
// descrevendo o que foi substituído/excluído; ver comentário em executarPedidoTitular).
export default function PedidoTitularPanel({ requests, isAdmin }: { requests: DataSubjectRequestRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [novoOpen, setNovoOpen] = useState(false);
  const [avaliarId, setAvaliarId] = useState<string | null>(null);
  const [executarId, setExecutarId] = useState<string | null>(null);

  return (
    <div className="bg-sf-apoio p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className=" font-bold text-tx">Pedido do titular</h3>
          <p className="text-xs text-tx-2 mt-0.5">LGPD art. 18 — acesso, correção, exclusão ou anonimização dos próprios dados pessoais.</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setNovoOpen(true)}
            className="inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-1.5"
          >
            <Plus size={13} /> Abrir pedido
          </button>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-tx-3">Nenhum pedido registrado.</p>
      ) : (
        <div className="divide-y divide-regua bg-sf">
          {requests.map((r) => {
            const prazo = prazoLabel(r.dueAt, r.status);
            return (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-tx">
                      {r.subjectName} <span className="font-normal text-tx-2">— {KIND_LABEL[r.kind] ?? r.kind}</span>
                    </p>
                    <p className="text-xs text-tx-3 mt-0.5">
                      Recebido {new Date(r.receivedAt).toLocaleDateString("pt-BR")} via {r.channel}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] font-semibold ${prazo.atrasado ? "text-atencao" : "text-tx-2"}`}>{prazo.texto}</span>
                    <Badge color={STATUS_COLOR[r.status] ?? "slate"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  </div>
                </div>
                {r.decision && <p className="text-xs text-tx-2 mt-1.5">{r.decision}</p>}
                {isAdmin && r.status === "ABERTO" && (
                  <button
                    type="button"
                    onClick={() => setAvaliarId(r.id)}
                    className="text-xs font-semibold text-acao hover:text-acao-hover mt-1.5"
                  >
                    Avaliar
                  </button>
                )}
                {isAdmin && r.status === "EM_ANALISE" && (
                  <button
                    type="button"
                    onClick={() => setExecutarId(r.id)}
                    className="text-xs font-semibold text-acao hover:text-acao-hover mt-1.5"
                  >
                    Marcar como executado
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {novoOpen && <NovoPedidoModal onClose={() => setNovoOpen(false)} onDone={() => { setNovoOpen(false); router.refresh(); }} />}
      {avaliarId && <AvaliarModal id={avaliarId} onClose={() => setAvaliarId(null)} onDone={() => { setAvaliarId(null); router.refresh(); }} />}
      {executarId && <ExecutarModal id={executarId} onClose={() => setExecutarId(null)} onDone={() => { setExecutarId(null); router.refresh(); }} />}
    </div>
  );
}

function NovoPedidoModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [subjectName, setSubjectName] = useState("");
  const [subjectDoc, setSubjectDoc] = useState("");
  const [kind, setKind] = useState("EXCLUSAO");
  const [channel, setChannel] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    startTransition(async () => {
      const result = await abrirPedidoTitular({ subjectName, subjectDoc: subjectDoc || undefined, kind, channel, receivedAt });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <ModalShell size="compacto" title="Abrir pedido do titular" onClose={onClose}>
      <div className="p-5 space-y-3 overflow-y-auto flex-1">
        <div>
          <label className="text-xs font-medium text-tx-2">Nome do titular</label>
          <input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">CPF/CNPJ (opcional)</label>
          <input value={subjectDoc} onChange={(e) => setSubjectDoc(e.target.value)} className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Tipo de pedido</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx">
            {Object.entries(KIND_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Canal de origem</label>
          <input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="Ex: E-mail, telefone, presencial" className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Data de recebimento</label>
          <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx" />
        </div>
        {error && <p className="text-xs font-medium text-atencao">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="w-full bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-sm font-semibold px-4 py-2"
        >
          {pending ? "Abrindo…" : "Abrir pedido"}
        </button>
      </div>
    </ModalShell>
  );
}

function AvaliarModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function decidir(status: "EM_ANALISE" | "RECUSADO") {
    setError("");
    startTransition(async () => {
      const result = await avaliarPedidoTitular(id, status, decision);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <ModalShell size="compacto" title="Avaliar pedido" subtitle="Há dever legal de guarda? Processo em curso?" onClose={onClose}>
      <div className="p-5 space-y-3 overflow-y-auto flex-1">
        <textarea
          autoFocus
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          rows={4}
          placeholder="Registre a análise…"
          className="w-full border border-regua px-3 py-2 text-sm bg-sf text-tx"
        />
        {error && <p className="text-xs font-medium text-atencao">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => decidir("EM_ANALISE")}
            className="flex-1 bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-sm font-semibold px-4 py-2"
          >
            Seguir em análise
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => decidir("RECUSADO")}
            className="flex-1 text-sm font-semibold text-tx-2 hover:text-tx px-4 py-2 border border-regua"
          >
            Recusar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ExecutarModal({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [resumo, setResumo] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    startTransition(async () => {
      const result = await executarPedidoTitular(id, resumo);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <ModalShell size="compacto" title="Marcar como executado" onClose={onClose}>
      <div className="p-5 space-y-3 overflow-y-auto flex-1">
        <p className="text-xs text-tx-2">
          Faça a alteração no cadastro (Contatos, Processo etc.) pelas telas normais primeiro. Aqui, descreva o que foi substituído ou excluído —
          isso fica registrado na trilha de auditoria.
        </p>
        <textarea
          autoFocus
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          rows={4}
          placeholder="Ex: nome e telefone do cliente substituídos por dado anonimizado; CPF mantido por obrigação fiscal…"
          className="w-full border border-regua px-3 py-2 text-sm bg-sf text-tx"
        />
        {error && <p className="text-xs font-medium text-atencao">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="w-full bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-sm font-semibold px-4 py-2"
        >
          {pending ? "Salvando…" : "Marcar como executado"}
        </button>
      </div>
    </ModalShell>
  );
}
