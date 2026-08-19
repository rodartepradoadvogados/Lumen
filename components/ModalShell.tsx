"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

// Casca padrão das janelas de lançamento/edição do site — extraída da tela de Lançar
// Honorários e de Contas a Pagar/Receber (Fases 1-4 do Financeiro), que virou a referência do
// sistema (ver components/honorarios/LancarHonorariosModal.tsx, components/NewPayableModal.tsx,
// components/NewReceivableModal.tsx). Fase 6 generaliza essa casca para o resto do site: quem
// tem MUITOS campos e perde conteúdo se fechar sem querer ganha `size="cheio"` (80% da tela, com
// teto de 1200px de largura); quem tem poucos campos ou não se beneficia de tanta largura usa
// `size="medio"`; `size="compacto"` é o tamanho antigo (max-w-md), aqui só para o dia em que
// outro modal pequeno precisar do mesmo chrome (header com título+X, corpo, rodapé opcional).
//
// Importante: este componente cuida só do CHROME (fundo, moldura, cabeçalho fixo, altura/largura,
// rolagem do meio). Ele NÃO envolve o conteúdo num <form> nem decide onde fica o botão de salvar
// — isso é responsabilidade de quem chama, exatamente como já era antes da extração (ver
// NewPayableModal.tsx: o próprio <form> vira `flex-1 flex flex-col min-h-0`, com um miolo
// `overflow-y-auto` e um rodapé `shrink-0` dentro dele). Motivo de não fazer o ModalShell "abraçar"
// o form: cada tela tem uma relação diferente entre form/rodapé (algumas têm barra de totais,
// outras têm um botão só, TaskDetailModal tem um feed de comentários fora do <form> mas dentro do
// rodapé de ações) — forçar todo mundo pelo mesmo molde de form arriscaria mexer em Server Action,
// o que esta fase proíbe. Então: ModalShell só garante que cabeçalho e (se usado) rodapé fiquem
// fixos e que SÓ o miolo (`children`) role — a divisão entre "miolo" e "rodapé" dentro de
// `children` é decisão de cada tela.
export type ModalShellSize = "cheio" | "medio" | "compacto";

const SIZE_CLASSES: Record<ModalShellSize, string> = {
  // 80% da tela a partir do breakpoint `md` — abaixo disso 80% não faz sentido (a tela já É
  // pequena), então cai pra quase tela cheia com margem pequena.
  cheio: "w-[94vw] h-[90vh] md:w-[80vw] md:h-[80vh] md:max-h-[900px] max-w-[1200px]",
  // Mais espaço que o modal antigo (bom pra formulário com textarea grande ou uns 6-8 campos),
  // sem virar uma caixa vazia — altura acompanha o conteúdo até um teto.
  medio: "w-[94vw] md:w-[70vw] max-w-[760px] max-h-[88vh] md:max-h-[85vh]",
  // Tamanho de antes da Fase 6 (max-w-md) — não faz parte do alargamento desta fase.
  compacto: "w-full max-w-md max-h-[90vh]",
};

export default function ModalShell({
  size,
  title,
  subtitle,
  onClose,
  children,
  className = "",
}: {
  size: ModalShellSize;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  // Sempre montado com `active=true`: quem chama ModalShell só o renderiza quando o modal está
  // aberto (`{open && <ModalShell ... />}`), então não há um "fechado" para o hook distinguir aqui.
  useEscapeToClose(true, onClose);

  return (
    <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
      <div
        className={`bg-sf shadow-pop flex flex-col overflow-hidden motion-safe:animate-fade-in ${SIZE_CLASSES[size]} ${className}`}
      >
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b-2 border-regua-forte">
          <div className="min-w-0">
            <h3 className="font-serif font-bold text-tx truncate">{title}</h3>
            {subtitle && <p className="text-xs text-tx-2 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-tx-3 hover:text-tx"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    </div>
  );
}
