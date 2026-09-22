"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Plus, MessageSquare } from "lucide-react";
import { renderizarMarkdownSimples } from "@/lib/markdownSimples";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";

type Turno = { role: "user" | "assistant"; texto: string };
type Mensagem = Turno | { role: "error"; texto: string };
type ConversaResumo = { id: string; titulo: string | null; updatedAt: string };

const SAUDACAO_INICIAL = (primeiroNome: string): Mensagem => ({
  role: "assistant",
  texto: `Olá, ${primeiroNome}. Posso responder sobre escritórios, cobrança dos escritórios, saúde do Hermes, campanhas pendentes de aprovação e a equipe da Lúmen — e, com uma sessão de suporte aberta, a atividade de um escritório específico.`,
});

// A conversa agora É GRAVADA (PainelMestreConversa/PainelMestreTurno) e pode ser RETOMADA: a
// barra lateral lista as conversas anteriores DESTE membro (nunca de outro — o corte por dono
// mora no servidor, em lib/painelMestreConversas.ts) e abrir uma delas carrega os turnos de
// verdade. O histórico de cada troca continua indo e voltando pelo corpo da requisição
// (`historico`) como antes — o que muda é que, além de responder, o servidor GRAVA cada turno
// sob o `conversaId` da conversa atual, e uma resposta obtida com uma sessão de suporte aberta
// (Lei 2) nunca sobrevive em texto: ver o aviso fixo que volta no lugar dela ao reabrir depois.
export default function PainelMestreAgenteClient({ nomeDeQuemPergunta }: { nomeDeQuemPergunta: string }) {
  const primeiroNome = nomeDeQuemPergunta.split(" ")[0];
  const [mensagens, setMensagens] = useState<Mensagem[]>([SAUDACAO_INICIAL(primeiroNome)]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [conversas, setConversas] = useState<ConversaResumo[] | null>(null);
  const [carregandoConversa, setCarregandoConversa] = useState(false);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function carregarListaDeConversas() {
    try {
      const res = await fetch("/api/painel-mestre/agente/conversas");
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.conversas)) setConversas(data.conversas);
    } catch {
      // Barra lateral é conveniência, não a função principal da tela — uma falha aqui não deve
      // impedir a pessoa de conversar com o agente.
    }
  }

  useEffect(() => {
    carregarListaDeConversas();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem
  }, []);

  async function abrirNovaConversa() {
    setConversaId(null);
    setMensagens([SAUDACAO_INICIAL(primeiroNome)]);
  }

  async function abrirConversa(id: string) {
    if (id === conversaId) return;
    setCarregandoConversa(true);
    try {
      const res = await fetch(`/api/painel-mestre/agente/conversas/${id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.turnos)) {
        // Mesma resposta para "não existe" e "é de outro membro" (Lei 1) — a tela só sabe dizer
        // que não deu para abrir, nunca por qual dos dois motivos.
        setMensagens((prev) => [...prev, { role: "error", texto: "Não foi possível abrir esta conversa." }]);
        return;
      }
      const turnos: Turno[] = data.turnos
        .filter((t: { role?: unknown }) => t.role === "user" || t.role === "assistant")
        .map((t: { role: "user" | "assistant"; texto: string }) => ({ role: t.role, texto: t.texto }));
      setConversaId(id);
      setMensagens(turnos.length > 0 ? turnos : [SAUDACAO_INICIAL(primeiroNome)]);
    } catch {
      setMensagens((prev) => [...prev, { role: "error", texto: "Falha de conexão ao abrir a conversa." }]);
    } finally {
      setCarregandoConversa(false);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  }

  async function enviar() {
    const texto = input.trim();
    if (!texto || enviando) return;

    // Só os turnos user/assistant vão de volta como histórico — mensagens de erro não são parte
    // da conversa com o modelo, são feedback local.
    const historico: Turno[] = mensagens.filter((m): m is Turno => m.role === "user" || m.role === "assistant");

    setInput("");
    setMensagens((prev) => [...prev, { role: "user", texto }]);
    setEnviando(true);

    try {
      const res = await fetch("/api/painel-mestre/agente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: texto, historico, conversaId }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setMensagens((prev) => [...prev, { role: "error", texto: data?.error || "Não foi possível falar com o agente agora." }]);
        return;
      }
      setMensagens((prev) => [...prev, { role: "assistant", texto: data.resposta || "(sem resposta)" }]);
      if (typeof data.conversaId === "string" && data.conversaId !== conversaId) {
        setConversaId(data.conversaId);
      }
      // A pergunta que acabou de ser gravada muda a ordem/o título da lista — recarrega em
      // segundo plano, sem travar o envio da próxima mensagem.
      carregarListaDeConversas();
    } catch {
      setMensagens((prev) => [...prev, { role: "error", texto: "Falha de conexão com o agente. Verifique sua internet e tente novamente." }]);
    } finally {
      setEnviando(false);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
      <LumenPanel className="flex flex-col h-[75vh] overflow-hidden">
        <LumenPanelHeader title="Conversas" subtitle="Só as suas — nenhum outro membro da equipe vê esta lista." />
        <div className="p-2">
          <button
            type="button"
            onClick={abrirNovaConversa}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-sm border border-regua hover:bg-sf-apoio transition-colors text-tx"
          >
            <Plus size={14} /> Nova conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
          {conversas === null && <p className="px-2 py-1 text-xs text-tx-3">carregando…</p>}
          {conversas !== null && conversas.length === 0 && (
            <p className="px-2 py-1 text-xs text-tx-3">Nenhuma conversa anterior ainda.</p>
          )}
          {conversas?.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => abrirConversa(c.id)}
              className={
                "w-full flex items-start gap-2 text-left px-3 py-2 text-xs rounded-sm transition-colors " +
                (c.id === conversaId ? "bg-sf-apoio text-tx" : "text-tx-2 hover:bg-sf-apoio")
              }
            >
              <MessageSquare size={13} className="mt-0.5 shrink-0" />
              <span className="truncate">{c.titulo || "(sem título ainda)"}</span>
            </button>
          ))}
        </div>
      </LumenPanel>

      <LumenPanel className="flex flex-col h-[75vh]">
        <LumenPanelHeader
          title="Agente do Painel Mestre"
          subtitle="Perguntas operacionais sobre a plataforma — herda o seu papel e o seu teto de visibilidade, nunca vê mais do que você veria pela tela."
        />
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {carregandoConversa && (
            <div className="flex justify-start">
              <div className="max-w-[85%] px-3 py-2 text-sm bg-sf border border-regua text-tx-2 rounded-sm">abrindo conversa…</div>
            </div>
          )}
          {mensagens.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  "max-w-[85%] px-3 py-2 text-sm rounded-sm " +
                  (m.role === "user"
                    ? "bg-acao text-acao-tx"
                    : m.role === "error"
                      ? "bg-urgente-bg border border-urgente text-urgente"
                      : "bg-sf border border-regua text-tx")
                }
              >
                {m.role === "assistant" ? <div className="assistente-md">{renderizarMarkdownSimples(m.texto)}</div> : m.texto}
              </div>
            </div>
          ))}
          {enviando && (
            <div className="flex justify-start">
              <div className="max-w-[85%] px-3 py-2 text-sm bg-sf border border-regua text-tx-2 rounded-sm">consultando a plataforma…</div>
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-regua p-3 flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Pergunte sobre a plataforma…"
            rows={1}
            className="flex-1 resize-none border border-regua rounded-sm px-3 py-2 text-sm bg-sf focus:outline-none focus:ring-2 focus:ring-marca-tx max-h-28"
          />
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || !input.trim()}
            className="h-9 w-9 shrink-0 bg-acao hover:bg-acao-hover text-acao-tx flex items-center justify-center rounded-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
      </LumenPanel>
    </div>
  );
}
