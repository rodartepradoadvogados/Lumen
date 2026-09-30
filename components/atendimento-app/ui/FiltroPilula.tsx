import Link from "next/link";
import type { ReactNode } from "react";

// FILTRO EM PÍLULA (chip de fase / de filtro). Repouso: pílula com contorno fino; ATIVO: ouro SUAVE (18%)
// com texto em ouro (--atd-texto-ouro), sem contorno. Com `href` é um link (`aria-current` no ativo);
// sem `href`, um botão (`aria-pressed`). O alvo tem 44 px de altura; a pílula visível tem 36.

export type FiltroPilulaProps = {
  rotulo: string;
  ativo?: boolean;
  /** Contagem ao lado do rótulo (opcional). */
  contagem?: number;
  href?: string;
  onClick?: () => void;
};

function Miolo({ rotulo, ativo, contagem }: { rotulo: string; ativo: boolean; contagem?: number }): ReactNode {
  return (
    <span
      className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-atd-pilula px-3.5 text-corpo ${
        ativo ? "bg-atd-ouro-suave font-semibold text-atd-texto-ouro" : "border border-atd-pilula-borda font-medium text-atd-previa"
      }`}
    >
      {rotulo}
      {contagem !== undefined && <span className={`tabular-nums text-app-meta ${ativo ? "" : "text-atd-terciario"}`}>{contagem}</span>}
    </span>
  );
}

export default function FiltroPilula({ rotulo, ativo = false, contagem, href, onClick }: FiltroPilulaProps) {
  const alvo = "inline-flex min-h-11 shrink-0 items-center";
  if (href) {
    return (
      <Link href={href} aria-current={ativo ? "true" : undefined} data-filtro-pilula="" className={alvo}>
        <Miolo rotulo={rotulo} ativo={ativo} contagem={contagem} />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} data-filtro-pilula="" className={alvo}>
      <Miolo rotulo={rotulo} ativo={ativo} contagem={contagem} />
    </button>
  );
}
