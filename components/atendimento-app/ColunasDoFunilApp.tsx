"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { useColunasRecolhidas, type ColunasRecolhidas } from "@/components/atendimento/ColunasRecolhiveis";
import SeloContagem from "@/components/atendimento-app/ui/SeloContagem";

// COLUNAS RECOLHÍVEIS DO FUNIL NO APLICATIVO DE ATENDIMENTO (acabamento WhatsApp). A REGRA é a mesma do site e
// da Central — `useColunasRecolhidas` (lib/colunasDoFunil.ts): tudo recolhido por padrão, escolha em
// localStorage (`rp-funil-abertas-app`, em try/catch), primeiro desenho sempre recolhido. Só o VISUAL é do app:
// cada coluna é um cartão preenchido (sem contorno), o título leva o número no SeloContagem, o botão de todas
// é uma pílula. O site e a Central continuam com `ColunasRecolhiveis` (não importam nada deste arquivo).

const Contexto = createContext<ColunasRecolhidas | null>(null);

export function ColunasDoFunilApp({ estagios, resumo, children }: { estagios: readonly string[]; resumo?: ReactNode; children: ReactNode }) {
  const colunas = useColunasRecolhidas("app", estagios);
  const recolher = colunas.todasAbertas;
  return (
    <Contexto.Provider value={colunas}>
      <div className="flex items-center justify-between gap-2 px-5">
        <div className="min-w-0">{resumo}</div>
        <button type="button" onClick={() => colunas.definirTodas(!recolher)} data-botao-de-todas="" className="-mr-2 inline-flex min-h-11 shrink-0 items-center">
          <span className="inline-flex h-9 items-center gap-1.5 rounded-atd-pilula bg-atd-pilula px-3.5 text-app-meta font-semibold text-atd-previa">
            <ChevronDown size={14} aria-hidden="true" className={clsx("transition-transform", recolher && "rotate-180")} />
            {recolher ? "Recolher todas" : "Expandir todas"}
          </span>
        </button>
      </div>
      {children}
    </Contexto.Provider>
  );
}

export function ColunaDoFunilApp({
  estagio,
  nome,
  cor,
  total,
  resumo,
  children,
}: {
  estagio: string;
  nome: string;
  cor: string;
  total: number;
  /** Linha sob o título que fica à vista mesmo recolhida (valor estimado). */
  resumo?: ReactNode;
  children: ReactNode;
}) {
  const colunas = useContext(Contexto);
  if (!colunas) throw new Error("ColunaDoFunilApp fora de ColunasDoFunilApp");
  const aberta = colunas.aberta(estagio);
  const idDoCorpo = `corpo-funil-${estagio}`;
  return (
    <section data-coluna-do-funil="" className="rounded-atd-balao bg-atd-pilula">
      <div className="px-4 py-1">
        <h3 className="text-app-nome font-semibold text-tx">
          <button
            type="button"
            aria-expanded={aberta}
            aria-controls={idDoCorpo}
            onClick={() => colunas.alternar(estagio)}
            className="flex min-h-12 w-full items-center justify-between gap-2 rounded-atd-balao text-left"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} aria-hidden="true" />
              <span className="truncate">{nome}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <SeloContagem valor={total} rotulo="atendimentos" />
              <ChevronDown size={18} aria-hidden="true" className={clsx("text-atd-terciario transition-transform", aberta && "rotate-180")} />
            </span>
          </button>
        </h3>
        {resumo && <div className="-mt-1 pb-2 pl-5">{resumo}</div>}
      </div>
      <div id={idDoCorpo} hidden={!aberta} className="space-y-2 px-2 pb-2">
        {children}
      </div>
    </section>
  );
}
