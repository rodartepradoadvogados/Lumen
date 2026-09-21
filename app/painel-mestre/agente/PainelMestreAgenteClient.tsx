"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { renderizarMarkdownSimples } from "@/lib/markdownSimples";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";

type Turno = { role: "user" | "assistant"; texto: string };
type Mensagem = Turno | { role: "error"; texto: string };

// Sem sessão gravada em banco nesta primeira entrega — a conversa vive na aba (React state) e é
// reenviada a cada pergunta como `historico`; o servidor decide o que dela cabe no pedido (ver
// lib/painelMestreOrcamento.ts). Fechar a aba perde a conversa — ver o relatório da frente.
export default function PainelMestreAgenteClient({ nomeDeQuemPergunta }: { nomeDeQuemPergunta: string }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      role: "assistant",
      texto: `Olá, ${nomeDeQuemPergunta.split(" ")[0]}. Posso responder sobre escritórios, cobrança dos escritórios, saúde do Hermes, campanhas pendentes de aprovação e a equipe da Lúmen — e, com uma sessão de suporte aberta, a atividade de um escritório específico.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        body: JSON.stringify({ mensagem: texto, historico }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setMensagens((prev) => [...prev, { role: "error", texto: data?.error || "Não foi possível falar com o agente agora." }]);
        return;
      }
      setMensagens((prev) => [...prev, { role: "assistant", texto: data.resposta || "(sem resposta)" }]);
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
    <div className="p-6 max-w-3xl mx-auto">
      <LumenPanel className="flex flex-col h-[75vh]">
        <LumenPanelHeader
          title="Agente do Painel Mestre"
          subtitle="Perguntas operacionais sobre a plataforma — herda o seu papel e o seu teto de visibilidade, nunca vê mais do que você veria pela tela."
        />
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
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
