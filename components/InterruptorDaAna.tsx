"use client";

import { Check, X } from "lucide-react";

// O INTERRUPTOR "ANA RESPONDE", UM SÓ para o site e para o aplicativo.
//
// ANTES era uma caixinha de 16 px (site) e uma trilha sem palavra (app): ninguém reconhecia como botão.
// Agora é um BOTÃO retangular de 44 px com o estado ESCRITO ("Ana responde: Ligada / Desligada" — a cor e
// a posição nunca falam sozinhas), `role="switch"` + `aria-checked`, borda de 2 px com contraste >= 3:1
// (as classes de borda vêm de quem usa, porque cada tema tem o seu token: `atd-campo` no aplicativo,
// `tx-3` no site), foco visível (o contorno de 2 px com afastamento vem do `:focus-visible` global: `--atd-foco` no aplicativo, `--acao` no site; o botão não o apaga),
// radius 2 px (DESIGN.md) e nenhuma faixa lateral colorida.
//
// O nome acessível é só "Ana responde:"; o "Ligada/Desligada" é `aria-hidden` porque o leitor de tela já
// anuncia o estado por `aria-checked` (senão leria duas vezes). O texto visível continua contido no nome.
export default function InterruptorDaAna({
  ligado,
  desabilitado = false,
  nome,
  aoAlternar,
  bordaLigada,
  bordaDesligada,
  classe = "",
  pilula = false,
}: {
  ligado: boolean;
  desabilitado?: boolean;
  nome: string;
  aoAlternar: () => void;
  bordaLigada: string;
  bordaDesligada: string;
  classe?: string;
  /** Só no aplicativo de Atendimento (acabamento WhatsApp): canto em pílula. A borda de 2 px e os 44 px ficam. */
  pilula?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      data-interruptor-da-ana=""
      onClick={aoAlternar}
      disabled={desabilitado}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 ${pilula ? "rounded-atd-pilula" : "rounded-[2px]"} border-2 px-3 text-corpo font-semibold transition-colors disabled:opacity-60 motion-reduce:transition-none ${
        ligado ? `bg-acao text-acao-tx ${bordaLigada}` : `bg-sf text-tx ${bordaDesligada}`
      } ${classe}`}
    >
      {ligado ? <Check size={16} aria-hidden="true" className="shrink-0" /> : <X size={16} aria-hidden="true" className="shrink-0" />}
      <span>{nome} responde:</span>
      <span aria-hidden="true" data-estado-do-interruptor="">
        {ligado ? "Ligada" : "Desligada"}
      </span>
    </button>
  );
}
