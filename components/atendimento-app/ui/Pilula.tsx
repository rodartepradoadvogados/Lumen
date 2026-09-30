"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";

// PÍLULA do app de Atendimento: preenchimento arredondado (--atd-pilula-bg) no lugar de contorno.
// `CampoPilula` é o campo (busca, mensagem); `Pilula` é só a cápsula, para quem monta o conteúdo.
// Altura mínima de 44 px (alvo de toque).

export function Pilula({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div data-pilula="" className={`flex min-h-11 items-center gap-2.5 rounded-atd-pilula bg-atd-pilula px-4 text-app-previa text-atd-terciario ${className}`}>
      {children}
    </div>
  );
}

export type CampoPilulaProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  /** Texto para leitor de tela (o placeholder não substitui rótulo). */
  rotulo: string;
  id: string;
  /** Ícone à esquerda (decorativo). */
  icone?: ReactNode;
  /** Quando há texto, mostra o "x" que limpa. */
  aoLimpar?: () => void;
  rotuloDoLimpar?: string;
};

export function CampoPilula({ rotulo, id, icone, aoLimpar, rotuloDoLimpar = "Limpar", value, ...resto }: CampoPilulaProps) {
  const temTexto = typeof value === "string" ? value.length > 0 : false;
  return (
    <div data-campo-pilula="" className="relative flex min-h-11 items-center rounded-atd-pilula bg-atd-pilula">
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      {icone && (
        <span aria-hidden="true" className="pointer-events-none absolute left-4 flex text-atd-terciario">
          {icone}
        </span>
      )}
      <input
        id={id}
        value={value}
        {...resto}
        className={`min-h-11 w-full rounded-atd-pilula bg-transparent py-2 text-corpo text-tx placeholder:text-atd-terciario ${temTexto && aoLimpar ? "pr-11" : "pr-4"} ${icone ? "pl-12" : "pl-4"}`}
      />
      {temTexto && aoLimpar && (
        <button type="button" onClick={aoLimpar} aria-label={rotuloDoLimpar} className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-full text-atd-previa hover:text-tx">
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
