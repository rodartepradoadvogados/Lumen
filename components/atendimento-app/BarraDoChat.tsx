"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bot, CornerUpLeft, Lock, PowerOff } from "lucide-react";
import InterruptorDaAna from "@/components/InterruptorDaAna";
import { definirAtendenteResponde, devolverAtendenteResponde, responderUltimaPergunta } from "@/lib/actions/attendance";
import { barraDoChat, type EstadoDoChat } from "@/lib/estadoDoChat";

// A BARRA DE ESTADO DO CHAT, UMA LINHA SÓ (48 px): ícone, título ("Ana responde aqui", "Atendimento
// humano", "Ana desligada aqui"), uma frase e o controle. O relógio de 15 minutos ocupa a frase e a
// linha fica vermelha nos últimos cinco (o texto também diz; a cor nunca fala sozinha).
//
// O INTERRUPTOR VALE DE VERDADE: grava `Attendance.agenteResponde` pela ação `definirAtendenteResponde`
// (com o recorte de acesso), a chave que `deveResponder` lê — e não mais o `metadata.anaResponde` do app
// antigo, que ninguém lia. Ligar vale da PRÓXIMA mensagem do cliente. "Devolver à Ana" (quando uma pessoa
// assumiu) pede confirmação e chama `devolverAtendenteResponde`, que deixa rastro de quem devolveu.
//
// "RESPONDER ÚLTIMA MENSAGEM" mora logo abaixo do interruptor (onde o site já tinha o botão) e só aparece quando
// a última mensagem é do cliente e a Ana pode falar (interruptor presente = escritório com o atendente ligado e
// nenhuma pessoa assumiu). Chama `responderUltimaPergunta` (a mesma ação do site, com o recorte de acesso), pede
// à conversa que busque as mensagens ao terminar e MOSTRA o motivo real quando a Ana não responde.
export default function BarraDoChat({
  idDaConversa,
  estado,
  agora,
  nomeDoAtendente,
  aoMudar,
  aoResponder,
}: {
  idDaConversa: string;
  estado: EstadoDoChat;
  agora: Date;
  nomeDoAtendente: string;
  aoMudar: (parte: Partial<EstadoDoChat>) => void;
  /** Chamado quando a Ana respondeu: a conversa busca as mensagens novas na hora, sem esperar os 15 s. */
  aoResponder?: () => void;
}) {
  const barra = barraDoChat(estado, agora, nomeDoAtendente);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, comecar] = useTransition();
  const botaoDevolver = useRef<HTMLButtonElement>(null);
  const [respondendo, setRespondendo] = useState(false);
  const [erroDaResposta, setErroDaResposta] = useState<string | null>(null);
  const [respondida, setRespondida] = useState(false);

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

  function responderUltima() {
    if (respondendo) return;
    setRespondendo(true);
    setErroDaResposta(null);
    setRespondida(false);
    void responderUltimaPergunta(idDaConversa)
      .then((r) => {
        if (r.error) setErroDaResposta(r.error);
        else {
          setRespondida(true);
          aoResponder?.();
        }
      })
      .catch(() => setErroDaResposta("Não foi possível responder agora. Verifique a conexão e tente de novo."))
      .finally(() => setRespondendo(false));
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

  const podeResponderUltima = barra.controle === "interruptor" && estado.ultimaDirecao === "IN";

  return (
    <div data-oculta-com-teclado="" className="shrink-0">
    <div
      data-barra-do-chat=""
      className={`mx-3 mt-1.5 flex min-h-11 items-center gap-2.5 rounded-atd-balao px-2.5 py-0.5 ${grave ? "bg-urgente-bg text-urgente" : "text-atd-previa"}`}
    >
      {/* Com o interruptor, ele mesmo já diz "Ana responde: Ligada/Desligada" e leva o ícone de marca: o título fica só para o
          leitor de tela, e a linha mostra a frase (o relógio de 15 min ou "Ao enviar, você assume…"). */}
      {barra.controle !== "interruptor" && <Icone size={16} aria-hidden="true" className="shrink-0" />}
      <div className="min-w-0 flex-1 leading-tight">
        <p className={barra.controle === "interruptor" ? "sr-only" : `truncate text-app-previa font-semibold ${grave ? "text-urgente" : "text-atd-tinta"}`}>{barra.titulo}</p>
        <p role={erro ? "alert" : undefined} title={erro ? undefined : barra.fraseCompleta} className={`line-clamp-2 text-app-meta ${grave ? "font-semibold" : ""}`}>
          {frase}
        </p>
      </div>
      {barra.controle === "interruptor" && (
        <InterruptorDaAna
          ligado={barra.ligada}
          desabilitado={pendente}
          nome={nomeDoAtendente}
          aoAlternar={alternar}
          bordaLigada="border-atd-ouro-texto"
          bordaDesligada="border-atd-campo"
          pilula
        />
      )}
      {barra.controle === "devolver" && (
        <button
          ref={botaoDevolver}
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={pendente}
          className="inline-flex min-h-11 shrink-0 items-center rounded-atd-pilula bg-atd-pilula-2 px-3.5 text-app-previa font-semibold text-atd-tinta disabled:opacity-60"
        >
          Devolver à {nomeDoAtendente}
        </button>
      )}
      {confirmando && <ConfirmarDevolucao nome={nomeDoAtendente} aoConfirmar={devolver} aoCancelar={() => { setConfirmando(false); botaoDevolver.current?.focus(); }} />}
    </div>
    {(podeResponderUltima || erroDaResposta || respondida) && (
      <div data-responder-ultima="" className="mx-3 mt-1 flex flex-col gap-1">
        {podeResponderUltima && (
          <button
            type="button"
            onClick={responderUltima}
            disabled={respondendo}
            aria-busy={respondendo}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-atd-pilula bg-atd-pilula px-3 text-app-previa font-semibold text-atd-tinta disabled:opacity-60"
          >
            <CornerUpLeft size={16} aria-hidden="true" className="shrink-0" />
            {respondendo ? `${nomeDoAtendente} está respondendo…` : "Responder última mensagem"}
          </button>
        )}
        {erroDaResposta && (
          <p role="alert" className="text-app-meta font-semibold text-urgente">
            {erroDaResposta}
          </p>
        )}
        {respondida && !erroDaResposta && !respondendo && (
          <p role="status" className="text-app-meta text-atd-previa">
            {nomeDoAtendente} respondeu.
          </p>
        )}
      </div>
    )}
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
      <div role="alertdialog" aria-modal="true" aria-labelledby="devolver-titulo" aria-describedby="devolver-texto" className="w-full max-w-sm rounded-atd-flutuante bg-atd-tela p-4 text-atd-tinta">
        <h2 id="devolver-titulo" className="text-destaque font-semibold">
          Devolver a conversa à {nome}?
        </h2>
        <p id="devolver-texto" className="mt-1 text-corpo text-atd-previa">
          Ela volta a responder a partir da PRÓXIMA mensagem do cliente. O que ficou sem resposta agora continua com você.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button ref={cancelar} type="button" onClick={aoCancelar} className="min-h-11 rounded-atd-pilula bg-atd-pilula-2 px-3 text-corpo font-semibold text-atd-tinta">
            Cancelar
          </button>
          <button ref={confirmar} type="button" onClick={aoConfirmar} className="min-h-11 rounded-atd-pilula bg-atd-ouro px-3 text-corpo font-semibold text-atd-ouro-tx">
            Devolver
          </button>
        </div>
      </div>
    </div>
  );
}
