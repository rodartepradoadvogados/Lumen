"use client";

import { useEffect, useRef, useState } from "react";
import { renderizarMarkdownSimples } from "@/lib/markdownSimples";
import { Sparkles, X, Send, Database } from "lucide-react";
import clsx from "clsx";
import { useAnotacoesOptional } from "@/components/anotacoes/AnotacoesContext";

type ChatMessage = {
  role: "user" | "assistant" | "error";
  text: string;
  // O que foi consultado para montar ESTA resposta — ver lib/agenteProcedencia.ts. Vive na
  // mensagem porque muda a cada pergunta, e não volta ao retomar uma conversa antiga: não é
  // gravada por mensagem, e reconstruí-la de memória seria justamente a afirmação sem lastro que
  // esta linha existe para evitar.
  procedencia?: string[];
};

// Formato mínimo compatível com Anthropic.MessageParam — o histórico completo
// A CONVERSA AGORA É GRAVADA (19/09/2026). O widget deixou de carregar o histórico inteiro na
// memória para reenviá-lo a cada pergunta: ele guarda só o `sessaoId` e o servidor monta o
// contexto a partir do banco (ver lib/assistenteSessoes.ts). O que isso muda na prática: fechar a
// aba não perde mais a conversa, e uma conversa de dez turnos para de trafegar dez vezes.
//
// O id fica no `sessionStorage`, não no `localStorage`: é o escopo certo para "a conversa desta
// aba". Em `localStorage`, duas abas abertas no mesmo navegador escreveriam na mesma conversa, e
// as respostas apareceriam trocadas entre elas.
const CHAVE_SESSAO = "lumen:assistente:sessao";

export default function AssistenteWidget({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensagens, setMensagens] = useState<ChatMessage[]>([
    // Mesma saudação do celular, palavra por palavra: é o mesmo agente, e duas saudações
    // diferentes fazem parecer que são dois.
    {
      role: "assistant",
      text: `Olá, ${userName.split(" ")[0]}. Posso consultar processos, publicações, agenda, atendimentos, clientes e — se você tiver acesso — o financeiro.`,
    },
  ]);
  const [sessaoId, setSessaoId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Painel global "Anotações" (faixa retrátil na borda direita, ver AnotacoesContext.tsx) ocupa
  // a mesma coluna direita onde este widget fica fixo — sem este ajuste, o botão/janela do
  // A caixa ficaria embaixo/atrás do painel quando ele está aberto (256px) ou mesmo só com a
  // faixa fechada (34px, mais larga que o right-6/24px original). `useAnotacoesOptional` nunca
  // lança se o provider não existir na árvore (hoje sempre existe onde este widget é montado —
  // ver app/(app)/layout.tsx — mas fica defensivo para qualquer reuso futuro sem o provider).
  const anotacoes = useAnotacoesOptional();
  const rightOffsetPx = 24 + (anotacoes?.panelWidth ?? 0); // 24px = right-6 original

  // Retoma a conversa desta aba, se houver. Acessor protegido: em aba anônima ou com dados do
  // site bloqueados ele lança, e aí o widget simplesmente começa uma conversa nova.
  useEffect(() => {
    let guardado = "";
    try {
      guardado = window.sessionStorage.getItem(CHAVE_SESSAO) ?? "";
    } catch {
      return;
    }
    if (!guardado) return;
    setSessaoId(guardado);
    fetch(`/api/assistente/sessoes/${guardado}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !Array.isArray(d.mensagens) || d.mensagens.length === 0) return;
        setMensagens(d.mensagens.map((m: { autor: string; texto: string }) => ({
          role: m.autor === "assistant" ? "assistant" : "user",
          text: m.texto,
        })));
      })
      .catch(() => {
        // Conversa apagada ou indisponível — segue com a saudação e uma sessão nova.
      });
  }, []);

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
        body: JSON.stringify({ mensagem: texto, sessaoId: sessaoId || undefined }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const erro = data?.error || "Não foi possível falar com o assistente agora.";
        setMensagens((prev) => [...prev, { role: "error", text: erro }]);
        return;
      }

      setMensagens((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.resposta || "(sem resposta)",
          procedencia: Array.isArray(data.procedencia) ? data.procedencia : [],
        },
      ]);
      if (typeof data.sessaoId === "string" && data.sessaoId && data.sessaoId !== sessaoId) {
        setSessaoId(data.sessaoId);
        try {
          window.sessionStorage.setItem(CHAVE_SESSAO, data.sessaoId);
        } catch {
          // Sem armazenamento a conversa ainda funciona nesta sessão de tela; só não é retomada
          // depois de um recarregamento.
        }
      }
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
        // Botão só de ícone: sem nome acessível ele é anunciado como "botão" e ninguém que use
        // leitor de tela descobre o que ele abre. O `data-tip` é só visual.
        aria-label={open ? "Fechar o Lúmen Agent" : "Abrir o Lúmen Agent"}
        aria-expanded={open}
        data-tip="Lúmen Agent"
        style={{ right: rightOffsetPx }}
        // Grafite fixo nos dois temas + acento ouro, de propósito: mesmo par de cores da marca
        // (LumenMark), não um botão de ação comum — ver DESIGN-SYSTEM.md §15.
        className="fixed bottom-5 z-40 h-14 w-14 rounded-full bg-grafite-800 text-rail-marca shadow-pop flex items-center justify-center hover:bg-grafite-700 transition-[right,background-color] duration-200"
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {open && (
        <div
          // O DESLOCAMENTO VIRA VARIÁVEL, e não `right` direto, porque estilo em linha não tem
          // consulta de mídia: no celular a caixa era `w-full` (100vw) com `right: 24px`, então
          // ela começava 24px FORA da tela pela esquerda e o texto ficava cortado. Agora ela se
          // prende às duas margens no celular, e só a partir de 640px volta a flutuar à direita,
          // deslocada pelo painel de anotações quando ele está aberto.
          style={{ "--deslocamento-assistente": `${rightOffsetPx}px` } as React.CSSProperties}
          className="fixed bottom-20 left-3 right-3 w-auto max-h-[70vh] h-[calc(100vh-7rem)] sm:left-auto sm:right-[var(--deslocamento-assistente)] sm:w-full sm:max-w-md sm:h-[70vh] shadow-pop bg-sf z-40 flex flex-col overflow-hidden border border-regua transition-[right] duration-200"
        >
          {/* Grafite fixo nos dois temas — mesmo tratamento do botão flutuante acima. */}
          <div className="shrink-0 h-14 px-4 flex items-center justify-between bg-grafite-800 text-white">
            <div className="flex items-center gap-2">
              {/* P0-5: text-marca-tx sobre bg-grafite-800 reprova WCAG AA (2,15:1). */}
              <Sparkles size={18} className="text-rail-marca" />
              <span className="font-medium text-sm">Lúmen Agent</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="p-1 rounded hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3 bg-sf-apoio">
            {mensagens.map((m, i) => (
              <div
                key={i}
                className={clsx(
                  "flex flex-col gap-1",
                  m.role === "user" ? "items-end" : "items-start",
                )}
              >
                <div
                  className={clsx(
                    "max-w-[85%] px-3 py-2 text-sm break-words",
                    m.role !== "assistant" && "whitespace-pre-wrap",
                    m.role === "user" && "bg-acao text-acao-tx",
                    m.role === "assistant" && "bg-sf border border-regua text-tx shadow-card",
                    m.role === "error" && "bg-urgente-bg border border-urgente text-urgente",
                  )}
                >
                  {/* O agente responde em markdown simples (`**112 processos**`). Sem
                      renderizar, os asteriscos aparecem crus — foi o que apareceu na tela do
                      advogado no primeiro uso real. `whitespace-pre-wrap` sai só do balão do
                      agente: dentro dele quem cuida das quebras é o renderizador. */}
                  {m.role === "assistant" ? (
                    <div className="assistente-md">{renderizarMarkdownSimples(m.text)}</div>
                  ) : (
                    m.text
                  )}
                </div>
                {m.role === "assistant" && m.procedencia && m.procedencia.length > 0 && (
                  // A linha só aparece quando houve consulta de verdade, e a ausência dela é
                  // informação: significa que o agente respondeu sem ler os dados do escritório.
                  <div className="flex items-center gap-1 px-1 text-etiqueta text-tx-3">
                    <Database size={12} aria-hidden="true" />
                    <span>consultado agora · {m.procedencia.join(" · ")}</span>
                  </div>
                )}
              </div>
            ))}
            {enviando && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 text-sm bg-sf border border-regua text-tx-2 shadow-card">
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
              placeholder="Pergunte sobre o escritório…"
              rows={1}
              className="flex-1 resize-none border border-regua px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-marca-tx max-h-28"
            />
            <button
              type="button"
              onClick={enviarMensagem}
              disabled={enviando || !input.trim()}
              className="h-9 w-9 shrink-0 bg-acao hover:bg-acao-hover text-acao-tx flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
