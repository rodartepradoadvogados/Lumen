"use client";

import { useId, useRef, useState, useTransition } from "react";
import { CalendarPlus, CircleHelp, Clock, MessageCircle, Phone } from "lucide-react";
import { criarTarefaDoAtendimento } from "@/lib/actions/detalhesDoAtendimento";
import { fraseDaJanelaFechada, type JanelaDoWhatsapp } from "@/lib/janelaDe24h";
import {
  APOIO_DO_LIGAR,
  APOIO_DO_WHATSAPP_PESSOAL,
  EXPLICACAO_DA_FAIXA,
  PASSOS_PARA_REABRIR,
  TITULO_DA_FAIXA,
  amanhaEmBrasilia,
  enderecoDeLigar,
  enderecoDoWhatsappPessoal,
  tituloDaTarefaDeRetorno,
} from "@/lib/faixaDaJanela";

// A FAIXA DA JANELA FECHADA (PR 6), no lugar do campo de mensagem (só WhatsApp oficial da Meta).
// Diz o motivo, sem jargão, e dá as saídas que EXISTEM: ligar (ligação normal do celular), abrir o WhatsApp
// pessoal da pessoa, criar a tarefa de retorno e o "Como reabrir?". Nada aqui envia mensagem pelo número do
// escritório. Alvos de 44 px, sem faixa lateral colorida, tokens do sistema (Dia e Noite).
const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[2px] border border-regua-forte bg-sf px-3 text-corpo font-semibold text-tx hover:bg-sf-apoio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atd-foco)]";

export default function FaixaDaJanelaFechada({
  idDaConversa,
  janela,
  nomeDoContato,
  primeiroNome,
  nomeTemporario,
  telefone,
}: {
  idDaConversa: string;
  janela: Extract<JanelaDoWhatsapp, { aberta: false }>;
  nomeDoContato: string;
  primeiroNome: string;
  nomeTemporario: boolean;
  telefone: string | null;
}) {
  const idAjuda = useId();
  const idTarefa = useId();
  const [ajuda, setAjuda] = useState(false);
  const [tarefa, setTarefa] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [dia, setDia] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [criada, setCriada] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const botaoTarefa = useRef<HTMLButtonElement>(null);

  const ligar = enderecoDeLigar(telefone);
  const whatsapp = enderecoDoWhatsappPessoal(telefone);
  const nome = nomeTemporario ? "O cliente" : primeiroNome || "O cliente";

  function abrirTarefa() {
    setTitulo(tituloDaTarefaDeRetorno(nomeDoContato, nomeTemporario));
    setDia(amanhaEmBrasilia());
    setErro(null);
    setCriada(false);
    setTarefa(true);
  }

  function salvar() {
    setErro(null);
    if (!titulo.trim()) return setErro("Escreva o que precisa ser feito.");
    if (!dia) return setErro("A tarefa precisa de uma data.");
    iniciar(async () => {
      const r = await criarTarefaDoAtendimento(idDaConversa, { titulo, tipo: "TAREFA", prioridade: "MEDIA", dia });
      if (r.error) return setErro(r.error);
      setTarefa(false);
      setCriada(true);
      requestAnimationFrame(() => botaoTarefa.current?.focus());
    });
  }

  return (
    <div role="region" aria-label={TITULO_DA_FAIXA} className="rounded-[2px] border border-regua-forte bg-aviso-bg px-3 py-2 text-corpo text-tx">
      <p className="flex items-center gap-2 font-semibold">
        <Clock size={16} aria-hidden="true" /> {TITULO_DA_FAIXA}
      </p>
      <p className="mt-0.5">{fraseDaJanelaFechada(nome, janela)}</p>
      <p className="mt-1 text-tx-2">{EXPLICACAO_DA_FAIXA}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {ligar && (
          <a href={ligar} className={BOTAO}>
            <Phone size={16} aria-hidden="true" /> Ligar
          </a>
        )}
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={BOTAO}>
            <MessageCircle size={16} aria-hidden="true" /> Abrir no meu WhatsApp
          </a>
        )}
        <button ref={botaoTarefa} type="button" onClick={abrirTarefa} aria-expanded={tarefa} aria-controls={idTarefa} className={BOTAO}>
          <CalendarPlus size={16} aria-hidden="true" /> Criar tarefa
        </button>
        <button type="button" onClick={() => setAjuda((v) => !v)} aria-expanded={ajuda} aria-controls={idAjuda} className={BOTAO}>
          <CircleHelp size={16} aria-hidden="true" /> Como reabrir?
        </button>
      </div>

      {(ligar || whatsapp) && (
        <ul className="mt-1.5 space-y-0.5 text-etiqueta text-tx-2">
          {ligar && <li>Ligar: {APOIO_DO_LIGAR}</li>}
          {whatsapp && <li>Meu WhatsApp: {APOIO_DO_WHATSAPP_PESSOAL}</li>}
        </ul>
      )}
      {!ligar && !whatsapp && <p className="mt-1.5 text-etiqueta text-tx-2">Este número não tem dígitos suficientes para ligar. Confira o cadastro em Detalhes.</p>}

      <p role="status" className="text-etiqueta font-semibold text-tx">
        {criada ? "Tarefa criada. Aparece também na Agenda e em Detalhes." : ""}
      </p>

      <div id={idTarefa} hidden={!tarefa} className="mt-2 border-t border-regua-forte pt-2">
        {tarefa && (
          <div className="space-y-1.5">
            <label className="block text-etiqueta font-semibold text-tx-2">
              O que fazer
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={200}
                className="mt-0.5 block min-h-11 w-full rounded-[2px] border border-atd-campo bg-atd-bolha-in px-3 text-base font-normal text-tx focus:border-atd-ouro-texto focus:outline-none focus:ring-2 focus:ring-[var(--atd-foco)]"
              />
            </label>
            <label className="block text-etiqueta font-semibold text-tx-2">
              Para quando
              <input
                type="date"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                className="mt-0.5 block min-h-11 w-full rounded-[2px] border border-atd-campo bg-atd-bolha-in px-3 text-base font-normal text-tx focus:border-atd-ouro-texto focus:outline-none focus:ring-2 focus:ring-[var(--atd-foco)]"
              />
            </label>
            {erro && (
              <p role="alert" className="text-etiqueta font-semibold text-tx">
                {erro}
              </p>
            )}
            <div className="flex gap-1.5">
              <button type="button" onClick={salvar} disabled={ocupado} className="inline-flex min-h-11 items-center rounded-[2px] bg-acao px-3.5 text-corpo font-semibold text-acao-tx hover:bg-acao-hover disabled:bg-sf-apoio disabled:text-tx-3">
                {ocupado ? "Salvando…" : "Salvar tarefa"}
              </button>
              <button type="button" onClick={() => setTarefa(false)} disabled={ocupado} className={BOTAO}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div id={idAjuda} hidden={!ajuda} className="mt-2 border-t border-regua-forte pt-2">
        {ajuda && (
          <div>
            <p className="font-semibold">Como reabrir a conversa</p>
            <ol className="mt-0.5 list-decimal space-y-0.5 pl-5 text-etiqueta">
              {PASSOS_PARA_REABRIR.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
