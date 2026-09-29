"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CornerUpLeft, Info, Lock, Phone, Send, X, Zap } from "lucide-react";
import FaixaDaJanelaFechada from "@/components/atendimento-app/FaixaDaJanelaFechada";
import RespostasRapidasDoChat from "@/components/atendimento-app/RespostasRapidasDoChat";
import { textoDepoisDeInserir } from "@/lib/respostasRapidas";
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
// - RESPOSTAS RÁPIDAS (PR 10): o botão com o raio abre a lista do escritório; um toque INSERE o texto no campo
//   (depois do que já estava escrito) e NUNCA envia. CITAÇÃO (Responder): a barra acima do campo é local — o
//   cliente não a vê (ver AcoesDaMensagem); some ao enviar ou em "Cancelar".
// - DOIS MODOS, sempre à vista: "Para <nome>" (mensagem ao cliente, pelo WhatsApp) e "Nota interna" (só a
//   equipe; NUNCA vai ao WhatsApp nem é lida pela Ana). O modo aparece em TEXTO, ícone, borda tracejada e no
//   texto do botão ("Enviar" x "Salvar nota"), não só em cor. Cada modo guarda o SEU rascunho. Ao abrir a
//   conversa o modo é sempre "ao cliente" (não fica gravado: ninguém escreve nota sem querer). A nota não
//   depende de WhatsApp nem da janela de 24 h, então o seletor existe mesmo quando o campo ao cliente não.
// - Nada de anexo ou modelo no campo: o campo só faz o que o código faz.
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
  citando = null,
  aoLimparCitacao,
}: {
  idDaConversa: string;
  estado: EstadoDoChat;
  nomeDoContato: string;
  primeiroNome: string;
  nomeTemporario: boolean;
  telefone: string | null;
  nomeDoAtendente: string;
  aoEnviar: (texto: string, nota?: boolean) => void;
  citando?: { id: string; autor: string; trecho: string } | null;
  aoLimparCitacao?: () => void;
}) {
  const [respostas, setRespostas] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const texto = useRef("");
  const [vazio, setVazio] = useState(true);
  const [nota, setNota] = useState(false);
  const alvo = nomeTemporario || !primeiroNome ? "este número" : primeiroNome;

  function crescer() {
    const c = campo.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(c.scrollHeight, MAX_LINHAS_EM_PX)}px`;
  }

  // O rascunho volta ao montar (depois da hidratação, para o servidor e o cliente coincidirem).
  // Trocar de modo troca o rascunho: o campo mostra o texto guardado DAQUELE modo (ou fica vazio).
  useLayoutEffect(() => {
    const c = campo.current;
    if (!c) return;
    const guardado = lerRascunho(idDaConversa, nota);
    c.value = guardado;
    texto.current = guardado;
    setVazio(!guardado.trim());
    crescer();
  }, [idDaConversa, estado.janela.aberta, estado.temWhatsapp, nota]);

  useEffect(() => {
    crescer();
  });

  function aoDigitar(e: React.ChangeEvent<HTMLTextAreaElement>) {
    texto.current = e.target.value;
    setVazio(!e.target.value.trim());
    gravarRascunho(idDaConversa, e.target.value, nota);
    crescer();
  }

  // Insere a resposta rápida DEPOIS do que já está escrito e deixa o cursor no fim. Não envia.
  function inserir(resposta: string) {
    const c = campo.current;
    if (!c) return;
    const novo = textoDepoisDeInserir(texto.current, resposta);
    c.value = novo;
    texto.current = novo;
    setVazio(!novo.trim());
    gravarRascunho(idDaConversa, novo);
    crescer();
    c.focus({ preventScroll: true });
    c.setSelectionRange(novo.length, novo.length);
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
    gravarRascunho(idDaConversa, "", nota);
    aoEnviar(t, nota);
    aoLimparCitacao?.();
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
  const semWhatsapp = !estado.temWhatsapp;
  const janelaFechada = !estado.janela.aberta ? estado.janela : null;
  const bloqueio: "sem-whatsapp" | "janela" | null = semWhatsapp ? "sem-whatsapp" : janelaFechada ? "janela" : null;
  const nomeNoCampo = nomeTemporario ? "este número" : nomeDoContato;

  // O SELETOR DE MODO. Dois botões de 44 px, `aria-pressed`, com texto e ícone. Selecionado: ouro (cliente) ou
  // ardósia com borda tracejada (nota). Não é `role="tab"`: não troca de painel, troca o destino do texto.
  const seletor = (
    <div role="group" aria-label="Para quem é o texto" className="mb-1.5 flex gap-1.5" data-modo-do-campo={nota ? "nota" : "cliente"}>
      <button
        type="button"
        aria-pressed={!nota}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setNota(false)}
        className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[2px] border px-2 text-corpo font-semibold ${
          !nota ? "border-ouro-acento bg-atd-bolha-out text-tx" : "border-regua-forte bg-sf text-tx-2"
        }`}
      >
        <Send size={15} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 truncate">Para {alvo}</span>
      </button>
      <button
        type="button"
        aria-pressed={nota}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setNota(true)}
        className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[2px] border px-2 text-corpo font-semibold ${
          nota ? "border-dashed border-atd-ardosia bg-atd-ardosia-bg text-atd-ardosia" : "border-regua-forte bg-sf text-tx-2"
        }`}
      >
        <Lock size={15} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 truncate">Nota interna</span>
      </button>
    </div>
  );

  // Sem WhatsApp ou com a janela fechada, o campo AO CLIENTE dá lugar ao aviso/faixa. A nota continua livre.
  if (bloqueio && !nota) {
    return (
      <div className={`${rodape} max-h-[60dvh] overflow-y-auto pt-2`} data-compositor="" data-janela-fechada={bloqueio === "janela" ? "" : undefined}>
        {seletor}
        {bloqueio === "sem-whatsapp" || !janelaFechada ? (
          <p className="flex items-start gap-2 px-1 py-1 text-corpo text-tx-2">
            <Phone size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-tx-3" />
            <span>
              <span className="font-semibold text-tx">Este atendimento não tem WhatsApp.</span> Veja os dados e o número em Detalhes. Você ainda pode deixar uma nota interna.
            </span>
          </p>
        ) : (
          <FaixaDaJanelaFechada
            idDaConversa={idDaConversa}
            janela={janelaFechada}
            nomeDoContato={nomeDoContato}
            primeiroNome={primeiroNome}
            nomeTemporario={nomeTemporario}
            telefone={telefone}
          />
        )}
      </div>
    );
  }

  const ana = estado.agenteAtivoNoEscritorio && estado.agenteResponde && !estado.agenteSilenciadoEm;
  const apoio: string[] = [];
  if (nota) {
    apoio.push("Só a equipe vê. Não é enviada ao cliente, e a Ana não lê.");
  } else {
    if (ana) apoio.push(`Ao enviar, você assume e ${nomeDoAtendente} para de responder aqui.`);
    if (nomeTemporario) apoio.push("Este número ainda não tem nome. Confira o contato antes de enviar.");
  }

  return (
    <div className={`${rodape} pt-1.5`} data-compositor="" data-modo={nota ? "nota" : "cliente"}>
      {seletor}
      {apoio.length > 0 && (
        <p className="mb-1 flex items-start gap-1.5 px-1 text-etiqueta text-tx-2">
          {nota ? <Lock size={13} aria-hidden="true" className="mt-0.5 shrink-0" /> : <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0" />}
          <span>{apoio.join(" ")}</span>
        </p>
      )}
      {citando && (
        <div role="group" aria-label="Você está respondendo a uma mensagem" className="mb-1 flex items-start gap-1.5 rounded-[2px] border border-regua bg-sf-apoio px-2 py-1" data-citacao="">
          <CornerUpLeft size={14} aria-hidden="true" className="mt-1 shrink-0 text-tx-2" />
          <div className="min-w-0 flex-1">
            <p className="text-etiqueta font-bold text-tx-2">Respondendo a {citando.autor}</p>
            <p className="line-clamp-2 break-words text-corpo text-tx [overflow-wrap:anywhere]">{citando.trecho}</p>
            <p className="text-etiqueta text-tx-2">Só você vê esta citação; o cliente recebe apenas o seu texto.</p>
          </div>
          <button type="button" onClick={aoLimparCitacao} aria-label="Cancelar a citação" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] text-tx-2 hover:bg-sf">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setRespostas(true)}
          aria-label="Respostas rápidas"
          aria-haspopup="dialog"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] border border-regua-forte bg-sf text-tx hover:bg-sf-apoio"
        >
          <Zap size={18} aria-hidden="true" />
        </button>
        <textarea
          ref={campo}
          rows={1}
          enterKeyHint="enter"
          aria-label={nota ? "Escrever nota interna, só para a equipe" : `Escrever mensagem para ${nomeNoCampo}`}
          placeholder={nota ? "Nota interna" : "Mensagem"}
          onChange={aoDigitar}
          onKeyDown={aoTeclar}
          className={`atd-campo-de-mensagem block min-h-11 min-w-0 flex-1 resize-none rounded-[2px] border px-3 py-2.5 text-tx placeholder:text-tx-3 focus:outline-none focus:ring-2 focus:ring-[var(--atd-foco)] ${
            nota ? "border-dashed border-atd-ardosia bg-atd-ardosia-bg focus:border-atd-ardosia" : "border-atd-campo bg-atd-bolha-in focus:border-atd-ouro-texto"
          }`}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={enviar}
          disabled={vazio}
          aria-label={nota ? "Salvar nota interna" : `Enviar mensagem a ${nomeNoCampo}`}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[2px] bg-acao px-3.5 text-corpo font-semibold text-acao-tx transition-colors hover:bg-acao-hover disabled:bg-sf-apoio disabled:text-tx-3 motion-reduce:transition-none"
        >
          {nota ? <Lock size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
          <span>{nota ? "Salvar nota" : "Enviar"}</span>
        </button>
      </div>
      {respostas && <RespostasRapidasDoChat aoInserir={inserir} aoFechar={() => setRespostas(false)} />}
    </div>
  );
}
