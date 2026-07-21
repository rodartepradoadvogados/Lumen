"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send } from "lucide-react";
import clsx from "clsx";

type ChatMessage = {
  role: "user" | "assistant" | "error";
  text: string;
};

// Formato mínimo compatível com Anthropic.MessageParam — o histórico completo
// (incluindo blocos de tool_use/tool_result) é mantido em memória apenas para
// reenviar ao endpoint; não é persistido no banco nem inspecionado em detalhe aqui.
type HistoricoItem = { role: "user" | "assistant"; content: unknown };

export default function ClaudeAssistantWidget({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensagens, setMensagens] = useState<ChatMessage[]>([
    { role: "assistant", text: `Olá, ${userName.split(" ")[0]}! Sou o assistente interno do escritório. Posso consultar processos, publicações, agenda, atendimento, clientes e (se você tiver acesso) o financeiro. Como posso ajudar?` },
  ]);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mensagens, open, enviando]);

  async function enviarMensagem() {
    const texto = input.trim();
    if (!texto || enviando) return;

    setInput("");
    setMensagens((prev) => [...prev, { role: "user", text: texto }]);
    setEnviando(true);

    try {
      const res = await fetch("/api/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: texto, historico }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const erro = data?.error || "Não foi possível falar com o assistente agora.";
        setMensagens((prev) => [...prev, { role: "error", text: erro }]);
        return;
      }

      setMensagens((prev) => [...prev, { role: "assistant", text: data.resposta || "(sem resposta)" }]);
      setHistorico(Array.isArray(data.historico) ? data.historico : []);
    } catch {
      setMensagens((prev) => [
        ...prev,
        { role: "error", text: "Falha de conexão com o assistente. Verifique sua internet e tente novamente." },
      ]);
    } finally {
      setEnviando(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-tip="Assistente Claude"
        className="fixed bottom-5 right-6 z-40 h-14 w-14 rounded-full bg-navy-800 text-gold-400 shadow-pop flex items-center justify-center hover:bg-navy-700 transition-colors"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 w-full max-w-md h-[70vh] rounded-xl2 shadow-pop bg-white z-40 flex flex-col overflow-hidden border border-gold-500/20">
          <div className="shrink-0 h-14 px-4 flex items-center justify-between bg-navy-800 text-white">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-gold-400" />
              <span className="font-medium text-sm">Assistente Lúmen</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3 bg-cream-50">
            {mensagens.map((m, i) => (
              <div key={i} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={clsx(
                    "max-w-[85%] rounded-xl2 px-3 py-2 text-sm whitespace-pre-wrap break-words",
                    m.role === "user" && "bg-navy-800 text-white",
                    m.role === "assistant" && "bg-white border border-gold-500/20 text-navy-900 shadow-card",
                    m.role === "error" && "bg-red-50 border border-red-200 text-red-700",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {enviando && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl2 px-3 py-2 text-sm bg-white border border-gold-500/20 text-navy-800/60 shadow-card">
                  digitando...
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-gold-500/20 p-3 flex items-end gap-2 bg-white">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Pergunte sobre processos, agenda, clientes..."
              rows={1}
              className="flex-1 resize-none rounded-lg border border-navy-800/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40 max-h-28"
            />
            <button
              type="button"
              onClick={enviarMensagem}
              disabled={enviando || !input.trim()}
              className="h-9 w-9 shrink-0 rounded-lg bg-navy-800 text-gold-400 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-navy-700 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
