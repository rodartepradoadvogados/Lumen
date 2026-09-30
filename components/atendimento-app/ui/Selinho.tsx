import type { ReactNode } from "react";

// SELINHO (etiqueta): caixa alta, 11px/600, raio de 5 px. Tons:
//   fase   ouro suave + texto em ouro (a fase do funil)
//   neutro fundo de pílula + cinza (ex.: "Ana")
//   alerta vermelho suave (ex.: prazo estourado)

export type TomDoSelinho = "fase" | "neutro" | "alerta";

const TONS: Record<TomDoSelinho, string> = {
  fase: "bg-atd-etiqueta-fase text-atd-etiqueta-fase-tx",
  neutro: "bg-atd-etiqueta text-atd-etiqueta-tx",
  alerta: "bg-urgente-bg text-urgente",
};

export default function Selinho({ children, tom = "neutro", className = "" }: { children: ReactNode; tom?: TomDoSelinho; className?: string }) {
  return (
    <span data-selinho="" data-tom={tom} className={`inline-block rounded-atd-etiqueta px-[7px] py-0.5 text-app-tag font-semibold uppercase ${TONS[tom]} ${className}`}>
      {children}
    </span>
  );
}
