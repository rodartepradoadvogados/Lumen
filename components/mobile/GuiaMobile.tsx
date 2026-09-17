import Link from "next/link";
import type { ReactNode } from "react";
import { CLASSES_FAIXA, type FaixaSecao } from "@/lib/navSections";

// A guia do PWA — a peça que não existia.
//
// Até 2026-09-17, SEIS telas do app mobile desenhavam a mesma tira de abas à mão, cada uma com a
// sua medida: `px-3 py-1.5` em quatro delas, `px-2.5 py-1` em duas, quatro variantes de estado
// ativo, e `rounded-full` em todas — a pílula, num sistema cujo raio é 2px em tudo. Quatro usavam
// <Link> (filtro por rota) e duas <button> (filtro no cliente), mas o gesto é o mesmo em todas:
// escolher qual gaveta abrir.
//
// É o mesmo padrão que o diagnóstico já tinha achado no piso tipográfico do PWA — "o piso é um
// acordo tácito de quem escreveu, e todo componente novo o rompe de novo". Um acordo tácito
// aplicado seis vezes não é sistema; é sorte.
//
// Três coisas que esta peça garante e as seis cópias não garantiam:
//
//   1. ALVO DE TOQUE DE 44px. As pílulas mediam ~33px. O resto do PWA respeita 44px (`h-11 w-11`
//      na navegação de dias) — é o piso da superfície, e a barra de filtro é justamente o que o
//      polegar mais toca.
//   2. A FORMA DA CASA. A guia chanfrada, a mesma do portal, do site e da tela de processo do
//      próprio PWA.
//   3. A COR DA SEÇÃO, lida do mapa (lib/navSections.ts) em vez de `bg-acao` — que é o bordô fixo
//      da ação, e usá-lo para "aba ativa" gastava a cor da AÇÃO num estado de navegação.
//
// Sem "use client" de propósito: quatro consumidores são componentes de servidor (passam `href`) e
// dois são de cliente (passam `onClick`). Só quem passa `onClick` precisa da fronteira, e a
// fronteira é do consumidor, não desta peça.

export function TiraDeGuias({
  faixa,
  children,
  className = "",
}: {
  faixa: FaixaSecao;
  children: ReactNode;
  /** Margens negativas para a tira sangrar até a borda da tela, quando a página tem padding. */
  className?: string;
}) {
  return (
    <div
      className={`flex items-end gap-[3px] overflow-x-auto scrollbar-thin border-b-2 ${CLASSES_FAIXA[faixa].borda} ${className}`}
    >
      {children}
    </div>
  );
}

type GuiaBase = {
  ativa: boolean;
  faixa: FaixaSecao;
  children: ReactNode;
  /** Contagem ao lado do rótulo — a etiqueta da gaveta dizendo quantas fichas tem dentro. */
  contagem?: number;
};

function classes(ativa: boolean, faixa: FaixaSecao) {
  const f = CLASSES_FAIXA[faixa];
  return `guia-ficha shrink-0 min-h-[44px] text-etiqueta font-semibold uppercase tracking-[.06em] whitespace-nowrap transition-colors ${
    ativa ? `${f.fundo} text-rotulo ${f.borda}` : "bg-sf text-tx-2 border-regua-forte"
  }`;
}

function Conteudo({ children, contagem, ativa }: { children: ReactNode; contagem?: number; ativa: boolean }) {
  return (
    <>
      {children}
      {contagem !== undefined && (
        <span className={`ml-1.5 tabular-nums ${ativa ? "opacity-70" : "text-tx-3"}`}>({contagem})</span>
      )}
    </>
  );
}

export function GuiaLink({ href, ...p }: GuiaBase & { href: string }) {
  return (
    // `replace`: a aba é estado de visualização, não destino. Sem isso cada troca empilha uma
    // entrada no histórico e sair da tela exige um "voltar" por aba visitada — o mesmo defeito
    // que o P0-A3 corrigiu em /m/processos/[id].
    <Link href={href} replace aria-current={p.ativa ? "page" : undefined} className={classes(p.ativa, p.faixa)}>
      <Conteudo {...p} />
    </Link>
  );
}

export function GuiaBotao({ onClick, ...p }: GuiaBase & { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={p.ativa} className={classes(p.ativa, p.faixa)}>
      <Conteudo {...p} />
    </button>
  );
}
