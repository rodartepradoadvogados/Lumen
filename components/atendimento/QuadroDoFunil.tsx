"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Badge, formatCurrency } from "@/components/ui";
import FunnelStageSelect from "@/components/FunnelStageSelect";
import { setAttendanceStage } from "@/lib/actions/attendance";
import { stageOptions, stageLabels, stageDot, ESTAGIOS_DECIDIDOS } from "@/lib/funil";
import { somaEstimadaOuOmissao } from "@/lib/valorEstimado";
import { hrefDaConversa, type DestinoDaConversa } from "@/lib/conversaDaCentral";

// ============================================================================
// O QUADRO DO FUNIL — agora se arrasta.
//
// Mesmo gesto do Kanban da Agenda (components/KanbanBoard.tsx): pega o card, solta na coluna. O
// que muda aqui é o que a coluna significa — lá é etapa de trabalho, aqui é etapa comercial.
//
// O SELETOR DENTRO DO CARD FICA. Arrastar é atalho de quem usa mouse; quem navega por teclado não
// arrasta nada, e sem o seletor o quadro passaria a ser uma tela onde essas pessoas podem ler mas
// não podem agir. O seletor é a garantia; o arrastar é a comodidade.
//
// PERDIDO EXIGE MOTIVO, e por isso ele ACEITA O GESTO E RECUSA A GRAVAÇÃO. O motivo da perda é
// obrigatório desde a Fase 5 e é pedido numa janela (AttendanceLostReasonModal): um arrastar que
// abrisse janela no meio do gesto seria um gesto interrompido, e um que gravasse sem motivo furaria
// a regra. Para mover a Perdido usa-se o seletor, que já sabe perguntar.
//
// A primeira versão recusava o gesto — não chamava preventDefault no onDragOver dessa coluna. O
// efeito, visto no navegador, era o pior dos dois: o navegador não entregava o onDrop, o card
// voltava sozinho para a coluna de origem e NINGUÉM DIZIA POR QUÊ. A mensagem que explica a regra
// existia no código e nunca era escrita na tela. Agora a coluna se mostra fechada enquanto o card
// paira (tracejado, cursor de "não") e escreve o motivo quando a pessoa solta.
//
// A BOLINHA QUE PISCA É OUTRA COISA QUE A COLUNA. Ver a nota em lib/funil.ts: a coluna é estágio
// (alguém pôs ali), a bolinha é fato (o cliente escreveu e ninguém respondeu). Um card pode piscar
// em qualquer coluna.
//
// PARA ONDE O CARD ABRE quem diz é quem hospeda, pelo `destino` (ver lib/conversaDaCentral.ts): a
// Triagem antiga não diz nada e segue na rota /atendimento/:id; a Central de Atendimento pede
// "central" e o card abre a conversa na aba Atendimentos da própria tela, sem sair dela. O `destino`
// é um texto, e não uma função: este é um componente de cliente, e função não atravessa a fronteira
// servidor→cliente.
//
// O VALOR ESTIMADO DE UM CARD É REGISTRO; A SOMA DA COLUNA É INDICADOR (ver lib/valorEstimado.ts).
// Quem enxerga o quadro continua vendo o valor de cada card — é a negociação que está conduzindo.
// A soma por coluna é projeção de receita ainda não fechada, e só aparece para administrador; para
// os demais, a coluna diz que a soma está omitida (nunca R$ 0,00 no lugar dela).
// ============================================================================

export type CardDoFunil = {
  id: string;
  clientName: string;
  subject: string;
  stage: string;
  estimatedValue: number | null;
  leadSource: string | null;
  lostReason: string | null;
  responsavel: string | null;
  diasNoEstagio: number;
  followupAtrasado: boolean;
  /** A última mensagem é do cliente: alguém está esperando resposta AGORA. */
  esperandoResposta: boolean;
};

const RECUSA_DE_PERDIDO =
  "Para marcar como perdido use o seletor dentro do card — ele pergunta o motivo, que é obrigatório.";

const leadSourceLabels: Record<string, string> = {
  INDICACAO: "Indicação",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  SITE: "Site",
  WHATSAPP: "WhatsApp",
  OUTRO: "Outro",
};

export default function QuadroDoFunil({
  cards,
  isAdmin,
  destino = "classico",
}: {
  cards: CardDoFunil[];
  isAdmin: boolean;
  destino?: DestinoDaConversa;
}) {
  const router = useRouter();
  const [, comecar] = useTransition();
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Move o card na hora, antes de o servidor confirmar: arrastar e esperar meio segundo para o
  // card aparecer no lugar novo faz a pessoa arrastar de novo, achando que não pegou.
  const [otimista, setOtimista] = useState<Record<string, string>>({});

  function soltar(e: React.DragEvent, stage: string) {
    e.preventDefault();
    setColunaAlvo(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const card = cards.find((c) => c.id === id);
    if (!card || (otimista[id] ?? card.stage) === stage) return;

    if (ESTAGIOS_DECIDIDOS.includes(stage) && stage === "PERDIDO") {
      // Guarda de cinto e suspensório: o caminho normal é a mensagem do onDragOver acima, porque
      // `dropEffect = "none"` costuma cancelar o gesto antes daqui. Se um navegador entregar o
      // soltar assim mesmo, gravar PERDIDO sem motivo furaria a regra da Fase 5 — então recusa.
      setErro(RECUSA_DE_PERDIDO);
      return;
    }

    setErro(null);
    setOtimista((o) => ({ ...o, [id]: stage }));
    comecar(async () => {
      const r = await setAttendanceStage(id, stage);
      if (r?.error) {
        setErro(r.error);
        // Desfaz o movimento otimista: deixar o card na coluna nova depois de o servidor recusar
        // seria a tela mentindo sobre o que está gravado.
        setOtimista((o) => {
          const copia = { ...o };
          delete copia[id];
          return copia;
        });
      }
      router.refresh();
    });
  }

  const estagioDe = (c: CardDoFunil) => otimista[c.id] ?? c.stage;

  return (
    <div>
      {erro && <p className="mb-3 text-xs font-medium text-urgente">{erro}</p>}

      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {stageOptions.map((stage) => {
          const doEstagio = cards.filter((c) => estagioDe(c) === stage);
          // Indicador, não registro (ver o comentário de topo e lib/valorEstimado.ts): a soma da
          // coluna só é calculada para administrador; para os demais vem omitida, com o motivo.
          const somaEstimada = somaEstimadaOuOmissao(
            doEstagio.map((c) => c.estimatedValue),
            { isAdmin },
          );
          const aceitaSoltar = stage !== "PERDIDO";

          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = aceitaSoltar ? "move" : "none";
                setColunaAlvo(stage);
                // A EXPLICAÇÃO SAI AQUI, ENQUANTO O CARD AINDA PAIRA — não no soltar. Com
                // `dropEffect = "none"` o navegador cancela o gesto e NUNCA entrega o evento de
                // soltar; uma mensagem escrita lá seria escrita nunca. Dizer agora também é melhor
                // do que dizer depois: a pessoa lê antes de largar, e não descobre a regra pelo
                // card voltando sozinho.
                if (!aceitaSoltar) setErro(RECUSA_DE_PERDIDO);
              }}
              onDragLeave={() => setColunaAlvo(null)}
              onDrop={(e) => soltar(e, stage)}
              className={clsx(
                "flex w-80 shrink-0 flex-col border bg-sf-apoio transition-colors",
                colunaAlvo !== stage
                  ? "border-regua"
                  : aceitaSoltar
                    ? "border-marca-tx bg-acao-bg"
                    // Perdido sob o cursor: tracejado, sem preenchimento. A coluna precisa parecer
                    // fechada enquanto o card paira sobre ela, senão a pessoa solta acreditando.
                    : "border-dashed border-urgente"
              )}
            >
              <div className="border-b border-regua px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stageDot[stage] }} />
                    <h3 className="text-sm font-semibold text-tx">{stageLabels[stage]}</h3>
                  </div>
                  <span className="rounded-full border border-regua bg-sf px-2 py-0.5 text-xs font-semibold text-tx-2">
                    {doEstagio.length}
                  </span>
                </div>
                {!somaEstimada.omitido && somaEstimada.total > 0 && (
                  <p className="mt-1 text-xs text-tx-3">{formatCurrency(somaEstimada.total)} estimado</p>
                )}
                {somaEstimada.omitido && doEstagio.length > 0 && (
                  <p className="mt-1 text-xs italic text-tx-3" title={somaEstimada.motivo}>
                    Total estimado: só para administrador
                  </p>
                )}
                {stage === "AGUARDANDO" && (
                  <p className="mt-1 text-etiqueta leading-snug text-tx-3">
                    Quem ninguém respondeu no prazo cai aqui sozinho. Também dá para pôr à mão.
                  </p>
                )}
              </div>

              <div className="space-y-2 p-2.5">
                {doEstagio.length === 0 ? (
                  <p className="py-6 text-center text-xs text-tx-3">
                    {colunaAlvo !== stage
                      ? "Sem atendimentos neste estágio"
                      : aceitaSoltar
                        ? "Solte aqui"
                        : "Aqui não — use o seletor do card"}
                  </p>
                ) : (
                  doEstagio.map((c) => <Card key={c.id} card={c} destino={destino} aoComecar={() => setErro(null)} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-1 text-xs italic text-tx-3">
        Arraste um card entre as colunas, ou use o seletor dentro dele. Para marcar como perdido use o seletor — ele
        pergunta o motivo, que é obrigatório.
      </p>
    </div>
  );
}

function Card({ card, destino, aoComecar }: { card: CardDoFunil; destino: DestinoDaConversa; aoComecar: () => void }) {
  const [arrastando, setArrastando] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        setArrastando(true);
        // Limpa a explicação do gesto anterior: senão a recusa de um arrasto ficaria na tela
        // acusando o próximo, que talvez tenha dado certo.
        aoComecar();
      }}
      onDragEnd={() => setArrastando(false)}
      className={clsx(
        // O filete marca RISCO, e não categoria: a coluna já diz o estágio. Bordô no card cujo
        // follow-up venceu, que é o único do quadro sobre o qual há algo a fazer agora.
        "cursor-grab border-2 bg-sf transition-all duration-200 active:cursor-grabbing",
        card.followupAtrasado ? "border-urgente" : "border-regua-forte",
        arrastando ? "scale-[1.02] shadow-arrasto duration-150" : "scale-100 shadow-none"
      )}
    >
      <Link
        href={hrefDaConversa(destino, card.id)}
        className="block p-3 outline-none transition-colors hover:bg-sf-apoio focus-visible:bg-sf-apoio focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-marca-tx"
      >
        <div className="flex items-start gap-2">
          {/* A bolinha vem ANTES do nome: é a primeira coisa que o olho encontra na varredura da
              coluna, e é o que faz o card parar de ser mais um. */}
          {card.esperandoResposta && (
            <span
              className="bolinha-espera mt-1.5"
              role="img"
              aria-label="O cliente está esperando resposta"
              title="O cliente escreveu e ninguém respondeu"
            />
          )}
          <p className="min-w-0 flex-1 text-corpo font-semibold leading-snug text-tx">{card.clientName}</p>
        </div>
        <p className="mt-0.5 line-clamp-2 text-etiqueta text-tx-3">{card.subject}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.estimatedValue != null && card.estimatedValue > 0 && (
            <Badge color="green">{formatCurrency(card.estimatedValue)}</Badge>
          )}
          {card.leadSource && <Badge color="blue">{leadSourceLabels[card.leadSource] || card.leadSource}</Badge>}
        </div>

        <div className="mt-2 flex items-center justify-between text-etiqueta text-tx-3">
          <span>{card.diasNoEstagio} dia(s) no estágio</span>
          {card.responsavel && <span className="max-w-[45%] truncate">{card.responsavel}</span>}
        </div>

        {card.followupAtrasado && <p className="mt-1.5 text-etiqueta font-semibold text-urgente">follow-up atrasado</p>}
        {card.stage === "PERDIDO" && card.lostReason && (
          <p className="mt-1.5 text-etiqueta italic text-tx-3">Motivo: {card.lostReason}</p>
        )}
      </Link>
      <div className="px-3 pb-2.5">
        <FunnelStageSelect attendanceId={card.id} stage={card.stage} className="w-full text-center" />
      </div>
    </div>
  );
}
