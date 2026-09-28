"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Database, Send } from "lucide-react";
import IconeAgente from "@/components/IconeAgente";
import { renderizarMarkdownSimples } from "@/lib/markdownSimples";

// ============================================================================
// O LÚMEN AGENT NO CELULAR — conversa em tela cheia.
//
// POR QUE NÃO A CAIXINHA FLUTUANTE DO COMPUTADOR. No celular ela sobra mal: cobre o conteúdo,
// o teclado come metade do que resta, e ler uma lista de processos numa janela de 320px é
// sofrimento. Aqui a conversa toma a tela inteira, como um mensageiro — sobe de baixo, e a seta
// devolve a pessoa exatamente para onde ela estava.
//
// No computador a caixa flutuante CONTINUA, e é o certo lá: sobra tela, e ninguém quer perder a
// página que está lendo para tirar uma dúvida de dez segundos.
//
// A CONVERSA É A MESMA. Mesma rota, mesma sessão, mesmo histórico gravado — começar no celular e
// continuar no computador é a mesma conversa, não duas. O id fica em `sessionStorage`, não em
// `localStorage`: duas abas abertas escreveriam na mesma conversa.
// ============================================================================

const CHAVE_SESSAO = "lumen:assistente:sessao";

const SUGESTOES = [
  "quantos processos ativos eu tenho?",
  "o que tem na agenda de amanhã?",
  "publicações de hoje",
  "atendimentos em aberto",
];

// `procedencia` é o que foi consultado para montar AQUELA resposta — ver lib/agenteProcedencia.ts.
// Ela vive na mensagem, e não na conversa, porque muda a cada pergunta. Ao retomar uma conversa
// antiga ela não volta: não é gravada por mensagem, e inventá-la na releitura seria exatamente o
// tipo de afirmação sem lastro que ela existe para evitar.
type Mensagem = {
  role: "user" | "assistant" | "error";
  text: string;
  procedencia?: string[];
};

export default function MobileAssistente({
  aberto,
  aoFechar,
  userName,
}: {
  aberto: boolean;
  aoFechar: () => void;
  userName: string;
}) {
  const primeiroNome = userName.split(" ")[0] || "";
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      role: "assistant",
      // "Olá" e não "Bom dia": a saudação é montada no navegador, e um "bom dia" às dez da noite
      // é a primeira coisa que faz o assistente parecer desatento.
      text: `Olá, ${primeiroNome}. Posso consultar processos, publicações, agenda, atendimentos, clientes e — se você tiver acesso — o financeiro.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sessaoId, setSessaoId] = useState("");
  const rolagemRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  // Retoma a conversa desta aba, se houver. Acessor protegido: em aba anônima ou com dados do
  // site bloqueados ele lança, e aí a conversa simplesmente começa nova.
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
        setMensagens(
          d.mensagens.map((m: { autor: string; texto: string }) => ({
            role: m.autor === "assistant" ? "assistant" : "user",
            text: m.texto,
          })),
        );
      })
      .catch(() => {
        // Conversa apagada ou indisponível — segue com a saudação.
      });
  }, []);

  // Rola para o fim a cada mensagem nova, e ao abrir.
  useEffect(() => {
    if (!rolagemRef.current) return;
    rolagemRef.current.scrollTop = rolagemRef.current.scrollHeight;
  }, [mensagens, aberto, enviando]);

  // O teclado do celular só sobe com foco disparado por gesto do usuário — e abrir a conversa É
  // o gesto. Mas focar ANTES da animação terminar faz a tela pular; daí a espera curta.
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => campoRef.current?.focus(), 360);
    return () => clearTimeout(t);
  }, [aberto]);

  // Enquanto a conversa está aberta, a página atrás não rola. Sem isto, arrastar dentro da
  // conversa "vaza" para o conteúdo de trás no iOS, e a pessoa volta para outro lugar da tela.
  useEffect(() => {
    if (!aberto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, [aberto]);

  async function enviar(texto: string) {
    const pergunta = texto.trim();
    if (!pergunta || enviando) return;

    setInput("");
    setMensagens((prev) => [...prev, { role: "user", text: pergunta }]);
    setEnviando(true);

    try {
      const res = await fetch("/api/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: pergunta, sessaoId: sessaoId || undefined }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setMensagens((prev) => [
          ...prev,
          { role: "error", text: data?.error || "Não foi possível falar com o assistente agora." },
        ]);
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
          // Sem armazenamento a conversa funciona nesta sessão de tela; só não é retomada depois.
        }
      }
    } catch {
      setMensagens((prev) => [
        ...prev,
        { role: "error", text: "Falha de conexão. Verifique sua internet e tente novamente." },
      ]);
    } finally {
      setEnviando(false);
    }
  }

  const soSaudacao = mensagens.length === 1 && mensagens[0].role === "assistant";

  return (
    <div
      // `translate-y-full` quando fechado em vez de desmontar: preserva a conversa e o rascunho
      // entre aberturas, e a animação de subida vira uma só linha.
      //
      // Acima de z-50, que é o andar dos modais, por causa do convite para instalar o app: ele é
      // `fixed z-50` e vinha depois no documento, então flutuava DENTRO da conversa em tela
      // cheia. O convite é a coisa menos importante da tela; a conversa aberta é a mais.
      className={`fixed inset-0 z-[60] flex flex-col bg-sf-fundo transition-transform duration-300 ease-out motion-reduce:transition-none ${
        aberto ? "translate-y-0" : "translate-y-full pointer-events-none"
      }`}
      aria-hidden={!aberto}
      role="dialog"
      aria-label="Antonella, assistente do escritório"
    >
      <header className="shrink-0 flex items-center gap-3 px-3 h-14 bg-sf-superficie border-b border-regua pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Voltar"
          className="h-11 w-11 -ml-1 flex items-center justify-center text-tx active:bg-sf-apoio"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <div className="text-corpo font-semibold text-tx leading-tight">Antonella</div>
          <div className="text-etiqueta text-tx-3 leading-tight">
            {enviando ? "consultando o escritório…" : "assistente do escritório"}
          </div>
        </div>
        <IconeAgente size={22} className="ml-auto text-tx-2" />
      </header>

      <div ref={rolagemRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {mensagens.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col gap-1 max-w-[85%] ${m.role === "user" ? "self-end items-end" : "self-start"}`}
          >
            <div
              className={
                m.role === "user"
                  ? "bg-acao text-acao-tx px-3 py-2 text-corpo"
                  : m.role === "error"
                    ? "bg-urgente-bg border border-linha-urgente text-tx px-3 py-2 text-corpo"
                    : "bg-sf-superficie border border-regua text-tx px-3 py-2 text-corpo"
              }
            >
              {m.role === "assistant" ? (
                // O agente responde em markdown simples (`**112 processos**`). Sem isto os
                // asteriscos aparecem crus na tela — foi o que aconteceu no primeiro uso real.
                <div className="assistente-md">{renderizarMarkdownSimples(m.text)}</div>
              ) : (
                m.text
              )}
            </div>
            {m.role === "assistant" && m.procedencia && m.procedencia.length > 0 && (
              // A linha só aparece quando houve consulta de verdade. A ausência dela é informação:
              // significa que o agente respondeu sem ler os dados do escritório.
              <div className="flex items-center gap-1 text-etiqueta text-tx-3 px-1">
                <Database size={12} aria-hidden="true" />
                <span>consultado agora · {m.procedencia.join(" · ")}</span>
              </div>
            )}
          </div>
        ))}

        {enviando && (
          <div className="self-start bg-sf-superficie border border-regua px-3 py-2 text-corpo text-tx-3">
            consultando…
          </div>
        )}
      </div>

      {/* As sugestões só aparecem na conversa vazia. Depois da primeira pergunta elas viram
          ruído: quem já está conversando sabe o que quer perguntar. */}
      {soSaudacao && !enviando && (
        // Quebram linha em vez de rolar para o lado: com rolagem horizontal a última sugestão
        // aparece cortada na borda, e texto cortado na tela parece defeito, não atalho.
        <div className="shrink-0 flex flex-wrap gap-2 px-3 pb-2">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => enviar(s)}
              className="shrink-0 min-h-11 px-3 border border-regua text-tx-2 text-corpo active:bg-sf-apoio"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="shrink-0 flex items-end gap-2 px-3 py-2 bg-sf-superficie border-t border-regua pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <textarea
          ref={campoRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar(input);
            }
          }}
          placeholder="Pergunte sobre o escritório…"
          disabled={enviando}
          className="flex-1 resize-none max-h-32 min-h-11 px-3 py-2.5 bg-sf-fundo border border-regua text-tx text-corpo placeholder:text-tx-3 focus:outline-none focus:border-linha-forte"
        />
        <button
          type="button"
          onClick={() => enviar(input)}
          disabled={enviando || !input.trim()}
          aria-label="Enviar"
          className="h-11 w-11 shrink-0 flex items-center justify-center bg-acao text-acao-tx disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
