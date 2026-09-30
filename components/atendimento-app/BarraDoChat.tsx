"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DialogoDaAna from "@/components/atendimento-app/DialogoDaAna";
import { definirAtendenteResponde, devolverAtendenteResponde, responderUltimaPergunta } from "@/lib/actions/attendance";
import { abrirPerguntaDeResposta, dialogoDaPilula, pilulaDaAna, textosDoDialogo } from "@/lib/anaNoTopo";
import type { EstadoDoChat } from "@/lib/estadoDoChat";

// A ANA NA LINHA DAS ABAS (33). Não há mais barra abaixo das abas: o que era a barra virou UMA PÍLULA ("Ana: Ligada",
// "Ana: Desligada", "Ana: pausada") que é desenhada, por portal, no espaço `data-slot-da-ana` da linha das abas
// (GuiasDaConversa), FORA do `tablist`. Tocar nela abre um pop-up de confirmação (DialogoDaAna) com Sim/Não; nada muda
// antes do "Sim". O texto explicativo ("Ao enviar, você assume e ela para") e o botão avulso "Responder última mensagem"
// saíram: o espaço volta para a conversa.
//
// AS AÇÕES SÃO AS DE SEMPRE, com o recorte de acesso: `definirAtendenteResponde` (ligar/desligar; vale da PRÓXIMA
// mensagem do cliente), `devolverAtendenteResponde` (uma pessoa tinha assumido; deixa rastro de quem devolveu) e
// `responderUltimaPergunta` (a mesma do site). Quem envia uma mensagem assume como antes (a regra do envio não mudou).
//
// O SEGUNDO POP-UP ("Responder à última mensagem?") abre depois de LIGAR, só se a última mensagem é do cliente. O
// caminho "Responder agora" com a Ana JÁ ligada e o cliente esperando é um item no menu "⋮" da última mensagem do
// cliente (AcoesDaMensagem), que abre este mesmo pop-up: `respostaAberta` mora na conversa para os dois chegarem nele.
// O relógio de 15 min só aparece, em letra pequena dentro da pílula, nos últimos 5 minutos ou vencido.
export default function BarraDoChat({
  idDaConversa,
  estado,
  agora,
  nomeDoAtendente,
  aoMudar,
  aoResponder,
  respostaAberta,
  aoMudarRespostaAberta,
}: {
  idDaConversa: string;
  estado: EstadoDoChat;
  agora: Date;
  nomeDoAtendente: string;
  aoMudar: (parte: Partial<EstadoDoChat>) => void;
  /** Chamado quando a Ana respondeu: a conversa busca as mensagens novas na hora, sem esperar os 15 s. */
  aoResponder?: () => void;
  /** O pop-up "Responder à última mensagem?" está aberto? (a conversa também o abre, pelo menu da mensagem). */
  respostaAberta: boolean;
  aoMudarRespostaAberta: (aberta: boolean) => void;
}) {
  const pilula = pilulaDaAna(estado, agora, nomeDoAtendente);
  const [dialogo, setDialogo] = useState<"ligar" | "desligar" | "devolver" | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [respondendo, setRespondendo] = useState(false);
  const [erroDaResposta, setErroDaResposta] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [slot, setSlot] = useState<Element | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);

  useEffect(() => {
    setSlot(document.querySelector("[data-slot-da-ana]"));
  }, []);

  // Fechou o pop-up e nada mais está aberto: o foco volta para a pílula (se o pop-up guardou outro alvo, ele já o devolveu).
  const nenhumAberto = dialogo === null && !respostaAberta;
  useEffect(() => {
    if (nenhumAberto && devolverFoco.current && !gravando) {
      devolverFoco.current = false;
      if (document.activeElement === document.body || !document.activeElement) botao.current?.focus();
    }
  }, [nenhumAberto, gravando]);

  if (!estado.temWhatsapp) return null;

  function fechar() {
    setErro(null);
    setDialogo(null);
    devolverFoco.current = true;
  }

  async function confirmar() {
    if (gravando || !dialogo) return;
    setGravando(true);
    setErro(null);
    try {
      if (dialogo === "devolver") {
        const r = await devolverAtendenteResponde(idDaConversa);
        if (r.error) return setErro(r.error);
        aoMudar({ agenteSilenciadoEm: null, agenteResponde: true });
        fechar();
        return;
      }
      const novo = dialogo === "ligar";
      aoMudar({ agenteResponde: novo });
      const r = await definirAtendenteResponde(idDaConversa, novo);
      if (r.error) {
        aoMudar({ agenteResponde: !novo });
        return setErro(r.error);
      }
      setDialogo(null);
      devolverFoco.current = true;
      if (novo && abrirPerguntaDeResposta(estado)) aoMudarRespostaAberta(true);
    } catch {
      setErro("Não foi possível concluir agora. Verifique a conexão e tente de novo.");
    } finally {
      setGravando(false);
    }
  }

  async function responderUltima() {
    if (respondendo) return;
    setRespondendo(true);
    setErroDaResposta(null);
    try {
      const r = await responderUltimaPergunta(idDaConversa);
      if (r.error) return setErroDaResposta(r.error);
      setAviso(`${nomeDoAtendente} respondeu.`);
      aoMudarRespostaAberta(false);
      devolverFoco.current = true;
      aoResponder?.();
    } catch {
      setErroDaResposta("Não foi possível responder agora. Verifique a conexão e tente de novo.");
    } finally {
      setRespondendo(false);
    }
  }

  const qual = dialogoDaPilula(pilula.modo);
  const conteudo =
    pilula.modo === "indisponivel" ? (
      <span data-pilula-da-ana="" title="O escritório não está usando o atendente automático." className="inline-flex min-h-11 shrink-0 items-center rounded-atd-pilula px-3 text-app-previa font-medium text-atd-previa">
        {pilula.rotulo}
      </span>
    ) : (
      <button
        ref={botao}
        type="button"
        data-pilula-da-ana=""
        data-modo={pilula.modo}
        aria-haspopup="dialog"
        aria-expanded={dialogo !== null || respostaAberta}
        title={pilula.relogioLongo ?? undefined}
        disabled={gravando}
        onClick={() => {
          setErro(null);
          if (qual) setDialogo(qual);
        }}
        className={`inline-flex min-h-11 max-w-full shrink-0 flex-col items-center justify-center rounded-atd-pilula border-2 px-3 text-app-previa font-semibold leading-tight disabled:opacity-60 ${
          pilula.modo === "ligada" ? "border-atd-ouro-texto bg-atd-ouro text-atd-ouro-tx" : "border-atd-campo bg-atd-pilula text-atd-tinta"
        }`}
      >
        <span>{gravando ? "…" : pilula.rotulo}</span>
        {pilula.relogioCurto && !gravando && <span data-relogio-da-pilula="" className="text-app-meta font-medium">{pilula.relogioCurto}</span>}
        <span className="sr-only">{`. Toque para alterar.${pilula.relogioLongo ? ` ${pilula.relogioLongo}.` : ""}`}</span>
      </button>
    );

  const textos = dialogo ? textosDoDialogo(dialogo, nomeDoAtendente) : null;
  const textosResposta = textosDoDialogo("responder", nomeDoAtendente);

  return (
    <>
      {slot ? createPortal(conteudo, slot) : null}
      {dialogo && textos && (
        <DialogoDaAna key={dialogo} titulo={textos.titulo} texto={textos.texto} sim={textos.sim} nao={textos.nao} ocupado={gravando} erro={erro} aoSim={() => void confirmar()} aoNao={fechar} />
      )}
      {respostaAberta && !dialogo && (
        <DialogoDaAna
          key="responder"
          titulo={textosResposta.titulo}
          sim={textosResposta.sim}
          nao={textosResposta.nao}
          ocupado={respondendo}
          ocupadoTexto={`${nomeDoAtendente} está respondendo…`}
          erro={erroDaResposta}
          aoSim={() => void responderUltima()}
          aoNao={() => {
            setErroDaResposta(null);
            aoMudarRespostaAberta(false);
            devolverFoco.current = true;
          }}
        />
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {aviso}
      </div>
    </>
  );
}
