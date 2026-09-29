"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Info, Phone, Send } from "lucide-react";
import FaixaDaJanelaFechada from "@/components/atendimento-app/FaixaDaJanelaFechada";
import { gravarRascunho, lerRascunho } from "@/lib/filaDoChat";
import type { EstadoDoChat } from "@/lib/estadoDoChat";

// O CAMPO DE MENSAGEM, FIXO NO PÉ (estilo WhatsApp).
//
// - CRESCE conforme se digita, até 5 linhas; depois rola por dentro. Fonte de 16 px (abaixo disso o iOS dá
//   zoom ao focar) e alvo de 44 px. Respeita a área segura do aparelho (`env(safe-area-inset-bottom)`).
// - ENTER: no celular (toque) quebra linha; com mouse e teclado físico envia, e Shift+Enter quebra. Ctrl ou
//   Cmd+Enter envia em qualquer caso. Composição de IME (acento, chinês) nunca envia.
// - O BOTÃO NÃO PERDE O FOCO: tocar em "Enviar" não fecha o teclado virtual (a pessoa costuma mandar
//   mais de uma mensagem seguida).
// - O ENVIO É SÍNCRONO NO ESTADO: o texto sai do campo (e do `ref`) na mesma hora, então um segundo toque
//   encontra o campo vazio. É a primeira camada contra a duplicata; a garantia real é a reserva do servidor.
// - RASCUNHO POR CONVERSA em `sessionStorage`: trocar de guia (Detalhes) e voltar, ou a atualização a cada
//   15 s, não perde o que estava sendo escrito.
// - JANELA FECHADA: em vez do campo, a faixa (FaixaDaJanelaFechada: Ligar, meu WhatsApp, Criar tarefa,
//   Como reabrir). SEM WHATSAPP: o campo dá lugar a uma frase.
// - Nada de anexo, modelo ou nota interna nesta etapa: o campo só faz o que o código faz.
const MAX_LINHAS_EM_PX = 132;

export default function CompositorDoChat({
  idDaConversa,
  estado,
  nomeDoContato,
  primeiroNome,
  nomeTemporario,
  telefone,
  nomeDoAtendente,
  aoEnviar,
}: {
  idDaConversa: string;
  estado: EstadoDoChat;
  nomeDoContato: string;
  primeiroNome: string;
  nomeTemporario: boolean;
  telefone: string | null;
  nomeDoAtendente: string;
  aoEnviar: (texto: string) => void;
}) {
  const campo = useRef<HTMLTextAreaElement>(null);
  const texto = useRef("");
  const [vazio, setVazio] = useState(true);
  const alvo = nomeTemporario || !primeiroNome ? "este número" : primeiroNome;

  function crescer() {
    const c = campo.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(c.scrollHeight, MAX_LINHAS_EM_PX)}px`;
  }

  // O rascunho volta ao montar (depois da hidratação, para o servidor e o cliente coincidirem).
  useLayoutEffect(() => {
    const c = campo.current;
    const guardado = lerRascunho(idDaConversa);
    if (c && guardado) {
      c.value = guardado;
      texto.current = guardado;
      setVazio(!guardado.trim());
      crescer();
    }
  }, [idDaConversa, estado.janela.aberta, estado.temWhatsapp]);

  useEffect(() => {
    crescer();
  });

  function aoDigitar(e: React.ChangeEvent<HTMLTextAreaElement>) {
    texto.current = e.target.value;
    setVazio(!e.target.value.trim());
    gravarRascunho(idDaConversa, e.target.value);
    crescer();
  }

  function enviar() {
    const t = texto.current.trim();
    if (!t) return;
    // Esvazia ANTES de qualquer outra coisa: um segundo toque (ou Enter repetido) encontra o campo vazio.
    texto.current = "";
    if (campo.current) {
      campo.current.value = "";
      campo.current.style.height = "auto";
    }
    setVazio(true);
    gravarRascunho(idDaConversa, "");
    aoEnviar(t);
    campo.current?.focus({ preventScroll: true });
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    const toque = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (e.ctrlKey || e.metaKey || (!toque && !e.shiftKey)) {
      e.preventDefault();
      enviar();
    }
  }

  const rodape = "shrink-0 border-t-2 border-regua-forte bg-sf px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))]";

  if (!estado.temWhatsapp) {
    return (
      <div className={`${rodape} pt-2`} data-compositor="">
        <p className="flex items-start gap-2 px-1 py-1 text-corpo text-tx-2">
          <Phone size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-tx-3" />
          <span>
            <span className="font-semibold text-tx">Este atendimento não tem WhatsApp.</span> Veja os dados e o número em Detalhes.
          </span>
        </p>
      </div>
    );
  }

  if (!estado.janela.aberta) {
    return (
      <div className={`${rodape} max-h-[60dvh] overflow-y-auto pt-2`} data-compositor="" data-janela-fechada="">
        <FaixaDaJanelaFechada
          idDaConversa={idDaConversa}
          janela={estado.janela}
          nomeDoContato={nomeDoContato}
          primeiroNome={primeiroNome}
          nomeTemporario={nomeTemporario}
          telefone={telefone}
        />
      </div>
    );
  }

  const ana = estado.agenteAtivoNoEscritorio && estado.agenteResponde && !estado.agenteSilenciadoEm;
  const apoio: string[] = [];
  if (ana) apoio.push(`Ao enviar, você assume e ${nomeDoAtendente} para de responder aqui.`);
  if (nomeTemporario) apoio.push("Este número ainda não tem nome. Confira o contato antes de enviar.");

  return (
    <div className={`${rodape} pt-1.5`} data-compositor="">
      <p className="flex items-center gap-1.5 px-1 pb-1 text-etiqueta font-semibold text-tx-2">
        <Send size={12} aria-hidden="true" />
        <span className="min-w-0 truncate">
          Para {alvo} · pelo WhatsApp
        </span>
      </p>
      {apoio.length > 0 && (
        <p className="mb-1 flex items-start gap-1.5 px-1 text-etiqueta text-tx-2">
          <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{apoio.join(" ")}</span>
        </p>
      )}
      <div className="flex items-end gap-1.5">
        <textarea
          ref={campo}
          rows={1}
          enterKeyHint="enter"
          aria-label={`Escrever mensagem para ${nomeTemporario ? "este número" : nomeDoContato}`}
          placeholder="Mensagem"
          onChange={aoDigitar}
          onKeyDown={aoTeclar}
          className="atd-campo-de-mensagem block min-h-11 min-w-0 flex-1 resize-none rounded-[2px] border border-atd-campo bg-atd-bolha-in px-3 py-2.5 text-tx placeholder:text-tx-3 focus:border-atd-ouro-texto focus:outline-none focus:ring-2 focus:ring-[var(--atd-foco)]"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={enviar}
          disabled={vazio}
          aria-label={`Enviar mensagem a ${nomeTemporario ? "este número" : nomeDoContato}`}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[2px] bg-acao px-3.5 text-corpo font-semibold text-acao-tx transition-colors hover:bg-acao-hover disabled:bg-sf-apoio disabled:text-tx-3 motion-reduce:transition-none"
        >
          <Send size={16} aria-hidden="true" />
          <span>Enviar</span>
        </button>
      </div>
    </div>
  );
}
