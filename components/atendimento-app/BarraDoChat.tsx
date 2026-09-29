"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, Lock, PowerOff } from "lucide-react";
import { definirAtendenteResponde, devolverAtendenteResponde } from "@/lib/actions/attendance";
import { barraDoChat, type EstadoDoChat } from "@/lib/estadoDoChat";

// A BARRA DE ESTADO DO CHAT, UMA LINHA SÓ (48 px): ícone, título ("Ana responde aqui", "Atendimento
// humano", "Ana desligada aqui"), uma frase e o controle. O relógio de 15 minutos ocupa a frase e a
// linha fica vermelha nos últimos cinco (o texto também diz; a cor nunca fala sozinha).
//
// O INTERRUPTOR VALE DE VERDADE: grava `Attendance.agenteResponde` pela ação `definirAtendenteResponde`
// (com o recorte de acesso), a chave que `deveResponder` lê — e não mais o `metadata.anaResponde` do app
// antigo, que ninguém lia. Ligar vale da PRÓXIMA mensagem do cliente. "Devolver à Ana" (quando uma pessoa
// assumiu) pede confirmação e chama `devolverAtendenteResponde`, que deixa rastro de quem devolveu.
export default function BarraDoChat({
  idDaConversa,
  estado,
  agora,
  nomeDoAtendente,
  aoMudar,
}: {
  idDaConversa: string;
  estado: EstadoDoChat;
  agora: Date;
  nomeDoAtendente: string;
  aoMudar: (parte: Partial<EstadoDoChat>) => void;
}) {
  const barra = barraDoChat(estado, agora, nomeDoAtendente);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, comecar] = useTransition();
  const botaoDevolver = useRef<HTMLButtonElement>(null);

  if (!estado.temWhatsapp) return null;

  function alternar() {
    if (pendente) return;
    const novo = !barra.ligada;
    setErro(null);
    aoMudar({ agenteResponde: novo });
    comecar(async () => {
      const r = await definirAtendenteResponde(idDaConversa, novo);
      if (r.error) {
        aoMudar({ agenteResponde: !novo });
        setErro(r.error);
      }
    });
  }

  function devolver() {
    setConfirmando(false);
    setErro(null);
    comecar(async () => {
      const r = await devolverAtendenteResponde(idDaConversa);
      if (r.error) setErro(r.error);
      else aoMudar({ agenteSilenciadoEm: null, agenteResponde: true });
      botaoDevolver.current?.focus();
    });
  }

  const Icone = barra.icone === "pessoa" ? Lock : barra.icone === "desligada" ? PowerOff : Bot;
  const frase = erro ?? barra.frase;
  const grave = erro ? true : barra.grave;

  return (
    <div
      data-oculta-com-teclado=""
      data-barra-do-chat=""
      className={`flex min-h-12 shrink-0 items-center gap-2.5 border-b border-regua px-3 py-0.5 ${grave ? "bg-urgente-bg text-urgente" : "bg-sf-apoio text-tx-2"}`}
    >
      <Icone size={18} aria-hidden="true" className="shrink-0" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className={`truncate text-corpo font-semibold ${grave ? "text-urgente" : "text-tx"}`}>{barra.titulo}</p>
        <p role={erro ? "alert" : undefined} title={erro ? undefined : barra.fraseCompleta} className={`line-clamp-2 text-etiqueta ${grave ? "font-semibold" : ""}`}>
          {frase}
        </p>
      </div>
      {barra.controle === "interruptor" && (
        <button
          type="button"
          role="switch"
          aria-checked={barra.ligada}
          aria-label={`${nomeDoAtendente} responde nesta conversa`}
          onClick={alternar}
          disabled={pendente}
          className="relative h-11 w-[52px] shrink-0 disabled:opacity-60"
        >
          <span aria-hidden="true" className={`absolute left-0 top-2.5 h-6 w-[52px] rounded-[2px] border transition-colors motion-reduce:transition-none ${barra.ligada ? "border-atd-ouro-texto bg-acao" : "border-atd-campo bg-sf"}`} />
          <span
            aria-hidden="true"
            className={`absolute top-[13px] h-[18px] w-[18px] rounded-[2px] border border-regua-forte bg-sf-fundo transition-transform motion-reduce:transition-none ${barra.ligada ? "translate-x-[31px]" : "translate-x-[3px]"}`}
          />
        </button>
      )}
      {barra.controle === "devolver" && (
        <button
          ref={botaoDevolver}
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={pendente}
          className="inline-flex min-h-11 shrink-0 items-center rounded-[2px] border border-regua-forte bg-sf px-3 text-corpo font-semibold text-tx disabled:opacity-60"
        >
          Devolver à {nomeDoAtendente}
        </button>
      )}
      {confirmando && <ConfirmarDevolucao nome={nomeDoAtendente} aoConfirmar={devolver} aoCancelar={() => { setConfirmando(false); botaoDevolver.current?.focus(); }} />}
    </div>
  );
}

// A confirmação de "Devolver à Ana": prende o foco no diálogo, Esc cancela. A conversa volta a ser da
// Ana só a partir da PRÓXIMA mensagem do cliente — dizer isso evita a pessoa achar que a Ana vai
// responder agora ao que ficou pendente.
function ConfirmarDevolucao({ nome, aoConfirmar, aoCancelar }: { nome: string; aoConfirmar: () => void; aoCancelar: () => void }) {
  const cancelar = useRef<HTMLButtonElement>(null);
  const confirmar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelar.current?.focus();
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          aoCancelar();
        }
        if (e.key === "Tab") {
          const primeiro = cancelar.current;
          const ultimo = confirmar.current;
          if (e.shiftKey && document.activeElement === primeiro) {
            e.preventDefault();
            ultimo?.focus();
          } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault();
            primeiro?.focus();
          }
        }
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="devolver-titulo" aria-describedby="devolver-texto" className="w-full max-w-sm border border-regua-forte bg-sf p-4 text-tx">
        <h2 id="devolver-titulo" className="text-destaque font-semibold">
          Devolver a conversa à {nome}?
        </h2>
        <p id="devolver-texto" className="mt-1 text-corpo text-tx-2">
          Ela volta a responder a partir da PRÓXIMA mensagem do cliente. O que ficou sem resposta agora continua com você.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button ref={cancelar} type="button" onClick={aoCancelar} className="min-h-11 rounded-[2px] border border-regua-forte bg-sf px-3 text-corpo font-semibold text-tx">
            Cancelar
          </button>
          <button ref={confirmar} type="button" onClick={aoConfirmar} className="min-h-11 rounded-[2px] bg-acao px-3 text-corpo font-semibold text-acao-tx hover:bg-acao-hover">
            Devolver
          </button>
        </div>
      </div>
    </div>
  );
}
