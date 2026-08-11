"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send } from "lucide-react";
import clsx from "clsx";
import { useAnotacoesOptional } from "@/components/anotacoes/AnotacoesContext";

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

  // Painel global "Anotações" (faixa retrátil na borda direita, ver AnotacoesContext.tsx) ocupa
  // a mesma coluna direita onde este widget fica fixo — sem este ajuste, o botão/janela do
  // Claude ficaria embaixo/atrás do painel quando ele está aberto (256px) ou mesmo só com a
  // faixa fechada (34px, mais larga que o right-6/24px original). `useAnotacoesOptional` nunca
  // lança se o provider não existir na árvore (hoje sempre existe onde este widget é montado —
  // ver app/(app)/layout.tsx — mas fica defensivo para qualquer reuso futuro sem o provider).
  const anotacoes = useAnotacoesOptional();
  const rightOffsetPx = 24 + (anotacoes?.panelWidth ?? 0); // 24px = right-6 original

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
        style={{ right: rightOffsetPx }}
        // Grafite fixo nos dois temas + acento ouro, de propósito: mesmo par de cores da marca
        // (LumenMark), não um botão de ação comum — ver DESIGN-SYSTEM.md §15.
        className="fixed bottom-5 z-40 h-14 w-14 rounded-full bg-grafite-800 text-marca shadow-pop flex items-center justify-center hover:bg-grafite-700 transition-[right,background-color] duration-200"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {open && (
        <div
          style={{ right: rightOffsetPx }}
          className="fixed bottom-20 w-full max-w-md h-[70vh] rounded-xl2 shadow-pop bg-sf z-40 flex flex-col overflow-hidden border border-regua transition-[right] duration-200"
        >
          {/* Grafite fixo nos dois temas — mesmo tratamento do botão flutuante acima. */}
          <div className="shrink-0 h-14 px-4 flex items-center justify-between bg-grafite-800 text-white">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-marca" />
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

          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3 bg-sf-apoio">
            {mensagens.map((m, i) => (
              <div key={i} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={clsx(
                    "max-w-[85%] rounded-xl2 px-3 py-2 text-sm whitespace-pre-wrap break-words",
                    m.role === "user" && "bg-acao text-acao-tx",
                    m.role === "assistant" && "bg-sf border border-regua text-tx shadow-card",
                    m.role === "error" && "bg-red-50 border border-red-200 text-red-700",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {enviando && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl2 px-3 py-2 text-sm bg-sf border border-regua text-tx-2 shadow-card">
                  digitando...
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-regua p-3 flex items-end gap-2 bg-sf">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Pergunte sobre processos, agenda, clientes..."
              rows={1}
              className="flex-1 resize-none rounded-lg border border-regua px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acao/40 max-h-28"
            />
            <button
              type="button"
              onClick={enviarMensagem}
              disabled={enviando || !input.trim()}
              className="h-9 w-9 shrink-0 rounded-lg bg-acao hover:bg-acao-hover text-acao-tx flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
