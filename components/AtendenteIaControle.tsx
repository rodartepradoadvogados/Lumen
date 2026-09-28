"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerUpLeft, Lock, Undo2 } from "lucide-react";
import IconeAgente from "@/components/IconeAgente";
import { definirAtendenteResponde, devolverAtendenteResponde, responderUltimaPergunta } from "@/lib/actions/attendance";

// ============================================================================
// A CHAVE DO ATENDENTE, NESTA CONVERSA.
//
// Fica em cima da caixa de resposta, e não numa tela de configuração, porque é ali que a decisão
// é tomada: quem está lendo a conversa é quem sabe se aquele lead pode ser atendido por máquina.
//
// LIGAR VALE DA PRÓXIMA MENSAGEM. Marcar a chave no meio de uma conversa não faz o atendente sair
// respondendo uma pergunta que a pessoa do escritório pode estar redigindo naquele instante. Para
// a pergunta que ficou pendente existe o botão ao lado, que é um ato deliberado e não um efeito
// colateral.
//
// DEPOIS QUE UM HUMANO ASSUME, A CHAVE SOME. Não fica desligada: some, e no lugar dela fica dito
// por quê. Uma chave que aceita ser ligada e depois não faz nada é pior que nenhuma chave.
//
// ISSO ERA DEFINITIVO, E O DONO MUDOU DE IDEIA. A versão original desta tela não tinha saída
// nenhuma daqui: religar a chave era recusado (`definirAtendenteResponde` continua recusando, ver
// lib/actions/attendance.ts), de propósito, porque um cliente que recebe resposta de gente e
// depois de máquina percebe — e não tem volta. O dono decidiu que essa troca é dele para fazer, e
// não do sistema para impedir. O que muda aqui NÃO é a chave voltando a aceitar ligar: é um botão
// à parte, "Devolver", com confirmação, que existe só quando a chave já sumiu. Ele chama
// `devolverAtendenteResponde`, uma ação nomeada e auditada (prisma/schema.prisma:
// agenteDevolvidoEm / agenteDevolvidoPorId) — não um efeito colateral de marcar a chave de novo.
// E devolver segue o MESMO contrato de ligar: vale da PRÓXIMA mensagem do cliente, nunca da que
// está parada na tela — para essa existe, à parte, o botão de responder à última pergunta.
// ============================================================================

export default function AtendenteIaControle({
  attendanceId,
  responde,
  silenciado,
  ultimaEhDoCliente,
  nomeDoAtendente,
  compacto = false,
}: {
  attendanceId: string;
  responde: boolean;
  silenciado: boolean;
  ultimaEhDoCliente: boolean;
  nomeDoAtendente: string;
  /** No telefone, cada linha aqui é uma linha a menos de conversa. Ver a nota abaixo. */
  compacto?: boolean;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  // DEVOLVER É ATO DELIBERADO: confirmação antes de valer, e o texto diz o que vai acontecer —
  // mesmo padrão de confirmação usado no resto do Lúmen (window.confirm, ver p.ex.
  // components/BlogReviewManager.tsx), não um modal novo para uma decisão desta gravidade.
  function devolver() {
    const ok = window.confirm(
      `Devolver esta conversa para ${nomeDoAtendente}? Ela volta a responder a partir da PRÓXIMA mensagem do cliente — a que já está na tela não é respondida sozinha.`,
    );
    if (!ok) return;
    setErro(null);
    comecar(async () => {
      const r = await devolverAtendenteResponde(attendanceId);
      if (r.error) setErro(r.error);
      router.refresh();
    });
  }

  if (silenciado) {
    return (
      <div className={compacto ? "mt-0 flex flex-col gap-1.5 border border-regua bg-sf-apoio px-2.5 py-1.5" : "mt-3 flex flex-col gap-2 border border-regua bg-sf-apoio px-3 py-2"}>
        <div className="flex items-start gap-2 text-xs text-tx-2">
          <Lock size={14} className="mt-0.5 shrink-0" />
          <span>
            Uma pessoa do escritório assumiu esta conversa, então <strong className="text-tx">{nomeDoAtendente}</strong>{" "}
            não responde mais aqui. O cliente que recebe resposta de gente e depois de máquina percebe — e não tem volta.
          </span>
        </div>

        {/* A SAÍDA ao lado do aviso, não em outra tela: quem decidiu que a Ana volta é quem está
            lendo esta mesma conversa agora. Some sozinho quando a devolução vale (silenciado vira
            falso e a tela volta ao controle normal, com a chave e o "responder à última
            pergunta" — a MESMA opção que já existia, como ato separado e explícito). */}
        <div>
          <button
            type="button"
            onClick={devolver}
            disabled={pendente}
            className={`inline-flex items-center gap-1.5 border border-regua px-3 text-xs font-semibold text-tx-2 hover:bg-sf disabled:opacity-50 ${
              compacto ? "min-h-[36px]" : "min-h-11"
            }`}
          >
            <Undo2 size={13} />
            {pendente ? "Devolvendo…" : compacto ? "Devolver para a Ana" : `Devolver a conversa para ${nomeDoAtendente}`}
          </button>
        </div>

        {erro && <p className="text-xs font-medium text-urgente">{erro}</p>}
      </div>
    );
  }

  function alternar(valor: boolean) {
    setErro(null);
    comecar(async () => {
      const r = await definirAtendenteResponde(attendanceId, valor);
      if (r.error) setErro(r.error);
      router.refresh();
    });
  }

  function responderAgora() {
    setErro(null);
    comecar(async () => {
      const r = await responderUltimaPergunta(attendanceId);
      if (r.error) setErro(r.error);
      router.refresh();
    });
  }

  // NO TELEFONE ESTE BLOCO DISPUTA ESPAÇO COM A CONVERSA. Medido no navegador a 390px: em três
  // linhas ele comia a última mensagem, que é justamente a que se está lendo para responder. O
  // modo compacto encurta o rótulo, encurta o botão e reduz a frase a uma linha — sem tirar
  // nenhuma das duas decisões que moram aqui.
  return (
    <div className={compacto ? "border border-regua bg-sf-apoio px-2.5 py-1.5" : "mt-3 border border-regua bg-sf-apoio px-3 py-2"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className={`flex cursor-pointer items-center gap-2 text-xs text-tx ${compacto ? "min-h-[36px]" : "min-h-11"}`}>
          <input
            type="checkbox"
            checked={responde}
            disabled={pendente}
            onChange={(e) => alternar(e.target.checked)}
            className="h-4 w-4 accent-[var(--acao)]"
          />
          <IconeAgente size={16} className="text-tx-2" />
          <span>
            <strong className="text-tx">{nomeDoAtendente}</strong>
            {compacto ? " responde" : " responde nesta conversa"}
          </span>
        </label>

        {/* Só aparece quando há de fato uma pergunta do cliente esperando. Um botão que não tem o
            que fazer é um botão que ensina a pessoa a duvidar dos botões. */}
        {ultimaEhDoCliente && (
          <button
            type="button"
            onClick={responderAgora}
            disabled={pendente}
            className={`inline-flex items-center gap-1.5 border border-regua px-3 text-xs font-semibold text-tx-2 hover:bg-sf disabled:opacity-50 ${
              compacto ? "min-h-[36px]" : "min-h-11"
            }`}
          >
            <CornerUpLeft size={13} />
            {pendente ? "Respondendo…" : compacto ? "Responder agora" : "Responder à última pergunta"}
          </button>
        )}
      </div>

      {/* A frase diz o que ACONTECE, e não o que a chave é. Havia aqui um texto sobre "ligar" e
          "desligar"; o que a pessoa precisa saber é que enviar uma mensagem já assume a conversa —
          não existe botão de assumir, e não deve existir: quem escreveu, assumiu. */}
      <p className={`text-etiqueta leading-snug text-tx-3 ${compacto ? "" : "mt-1"}`}>
        {responde ? (
          /* Não repete o que a caixa acima já diz: a caixa diz QUEM responde, a frase diz o que
             acontece se você escrever. */
          <>Ao enviar {compacto ? "" : "uma mensagem "}você assume, e ele não fala mais aqui.</>
        ) : (
          compacto ? (
            <>Ao enviar você assume, e ele não fala mais aqui.</>
          ) : (
            <>Marcar vale da próxima mensagem do cliente. Ao enviar uma mensagem você assume, e ele não fala mais aqui.</>
          )
        )}
      </p>

      {erro && <p className="mt-2 text-xs font-medium text-urgente">{erro}</p>}
    </div>
  );
}
