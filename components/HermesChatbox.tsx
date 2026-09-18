"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Bot, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useAnotacoesOptional } from "@/components/anotacoes/AnotacoesContext";
import { useHermesTenant } from "@/components/HermesContext";

type ChatMessage = {
  role: "user" | "assistant" | "error";
  text: string;
};

export default function HermesChatbox() {
  const { tenantSlug, tenantName } = useHermesTenant();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensagens, setMensagens] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const anotacoes = useAnotacoesOptional();
  const rightOffsetPx = 24 + (anotacoes?.panelWidth ?? 0);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mensagens, open, enviando]);

  useEffect(() => {
    if (tenantSlug) {
      const saved = localStorage.getItem(`hermes-session-${tenantSlug}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setSessionId(parsed.sessionId);
          setMensagens(parsed.mensagens || []);
        } catch {
          localStorage.removeItem(`hermes-session-${tenantSlug}`);
        }
      }
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (tenantSlug && (sessionId || mensagens.length > 0)) {
      localStorage.setItem(
        `hermes-session-${tenantSlug}`,
        JSON.stringify({ sessionId, mensagens, updatedAt: Date.now() })
      );
    }
  }, [tenantSlug, sessionId, mensagens]);

  async function enviarMensagem() {
    const texto = input.trim();
    if (!texto || enviando || !tenantSlug) return;

    setInput("");
    setMensagens((prev) => [...prev, { role: "user", text: texto }]);
    setEnviando(true);
    setError(null);

    try {
      const res = await fetch("/api/hermes/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: texto, sessionId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const erro = data?.error || "Não foi possível falar com o assistente agora.";
        setMensagens((prev) => [...prev, { role: "error", text: erro }]);
        setError(erro);
        return;
      }

      setMensagens((prev) => [...prev, { role: "assistant", text: data.response || "(sem resposta)" }]);
      if (data.sessionId) setSessionId(data.sessionId);
    } catch {
      setMensagens((prev) => [
        ...prev,
        { role: "error", text: "Falha de conexão com o assistente. Verifique sua internet e tente novamente." },
      ]);
      setError("Falha de conexão");
    } finally {
      setEnviando(false);
    }
  }

  function limparHistorico() {
    setMensagens([]);
    setSessionId(null);
    if (tenantSlug) {
      localStorage.removeItem(`hermes-session-${tenantSlug}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  }

  if (!tenantSlug) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-tip="Assistente Hermes"
        style={{ right: rightOffsetPx }}
        className="fixed bottom-5 z-40 h-14 w-14 rounded-full bg-grafite-800 text-rail-marca shadow-pop flex items-center justify-center hover:bg-grafite-700 transition-[right,background-color] duration-200"
        aria-label={open ? "Fechar assistente Hermes" : "Abrir assistente Hermes"}
      >
        {open ? <X size={22} /> : <Bot size={22} />}
      </button>

      {open && (
        <div
          style={{ right: rightOffsetPx }}
          className="fixed bottom-20 w-full max-w-md h-[70vh] shadow-pop bg-sf z-40 flex flex-col overflow-hidden border border-regua transition-[right] duration-200"
        >
          <div className="shrink-0 h-14 px-4 flex items-center justify-between bg-grafite-800 text-white">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-rail-marca" />
              <span className="font-medium text-sm">Hermes Agent</span>
              <span className="px-2 py-0.5 text-xs bg-white/10 rounded text-white/70">{tenantName}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={limparHistorico}
                title="Limpar histórico"
                className="p-1.5 rounded hover:bg-white/10 transition-colors text-white/70 hover:text-white"
                aria-label="Limpar histórico da conversa"
              >
                <Trash2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                aria-label="Fechar assistente"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3 bg-sf-apoio">
            {mensagens.length === 0 && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 text-sm bg-sf border border-regua text-tx-2 shadow-card">
                  Olá! Sou o Hermes, seu assistente jurídico com acesso a todos os dados do escritório.
                  Posso consultar processos, publicações, agenda, atendimentos, clientes, financeiro,
                  documentos e muito mais. Como posso ajudar?
                </div>
              </div>
            )}

            {mensagens.map((m, i) => (
              <div key={i} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={clsx(
                    "max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap break-words",
                    m.role === "user" && "bg-acao text-acao-tx",
                    m.role === "assistant" && "bg-sf border border-regua text-tx shadow-card",
                    m.role === "error" && "bg-urgente-bg border border-linha-urgente text-urgente"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {enviando && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 text-sm bg-sf border border-regua text-tx-2 shadow-card flex items-center gap-2">
                  <span className="animate-pulse">Hermes está pensando</span>
                  <span className="animate-bounce">…</span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="shrink-0 px-4 py-2 bg-urgente-bg border-b border-linha-urgente text-urgente text-xs flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="p-1 hover:bg-urgente-bg rounded"
                aria-label="Dispensar erro"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="shrink-0 border-t border-regua p-3 flex items-end gap-2 bg-sf">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Pergunte sobre processos, agenda, clientes, documentos..."
              rows={1}
              className="flex-1 resize-none border border-regua px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca-tx max-h-28"
              aria-label="Mensagem para o Hermes"
              disabled={enviando}
            />
            <button
              type="button"
              onClick={enviarMensagem}
              disabled={enviando || !input.trim()}
              className="h-9 w-9 shrink-0 bg-acao hover:bg-acao-hover text-acao-tx flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Enviar mensagem"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}