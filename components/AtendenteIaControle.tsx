"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerUpLeft, Lock } from "lucide-react";
import IconeAgente from "@/components/IconeAgente";
import { definirAtendenteResponde, responderUltimaPergunta } from "@/lib/actions/attendance";

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

  if (silenciado) {
    return (
      <div className="mt-3 flex items-start gap-2 border border-regua bg-sf-apoio px-3 py-2 text-xs text-tx-2">
        <Lock size={14} className="mt-0.5 shrink-0" />
        <span>
          Uma pessoa do escritório assumiu esta conversa, então <strong className="text-tx">{nomeDoAtendente}</strong>{" "}
          não responde mais aqui. O cliente que recebe resposta de gente e depois de máquina percebe — e não tem volta.
        </span>
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
