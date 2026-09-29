"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import {
  CHAVE_DAS_COLUNAS,
  alternarColuna,
  definirTodas,
  lerColunasAbertas,
  todasAbertas,
  type ColunasAbertas,
  type SuperficieDoFunil,
} from "@/lib/colunasDoFunil";

// O lado de navegador das colunas recolhíveis do funil (regra em lib/colunasDoFunil.ts). As três telas
// do funil usam isto: o quadro da Central (arrasta), a página do site e a do aplicativo de celular.

/**
 * As colunas abertas, o alternador e o "todas". O PRIMEIRO desenho é sempre "tudo recolhido" (igual ao do
 * servidor, sem divergência de hidratação); a escolha guardada entra logo depois, num efeito.
 */
export function useColunasRecolhidas(superficie: SuperficieDoFunil, estagios: readonly string[]) {
  const [abertas, setAbertas] = useState<ColunasAbertas>({});
  const chave = CHAVE_DAS_COLUNAS(superficie);
  const lista = estagios.join("|");

  useEffect(() => {
    try {
      setAbertas(lerColunasAbertas(localStorage.getItem(chave), lista.split("|")));
    } catch {
      /* sem armazenamento: tudo recolhido nesta sessão */
    }
  }, [chave, lista]);

  const gravar = useCallback(
    (proximo: ColunasAbertas) => {
      setAbertas(proximo);
      try {
        localStorage.setItem(chave, JSON.stringify(proximo));
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
    },
    [chave],
  );

  return {
    aberta: (estagio: string) => abertas[estagio] === true,
    alternar: (estagio: string) => gravar(alternarColuna(abertas, estagio)),
    todasAbertas: todasAbertas(abertas, estagios),
    definirTodas: (abrir: boolean) => gravar(definirTodas(estagios, abrir)),
  };
}

export type ColunasRecolhidas = ReturnType<typeof useColunasRecolhidas>;

/** O botão "Expandir todas" / "Recolher todas". Alvo de toque de 44 px. */
export function BotaoDeTodas({ colunas, className }: { colunas: ColunasRecolhidas; className?: string }) {
  const recolher = colunas.todasAbertas;
  return (
    <button
      type="button"
      onClick={() => colunas.definirTodas(!recolher)}
      className={clsx(
        "inline-flex min-h-11 items-center gap-1.5 rounded-[2px] border border-regua bg-sf px-3 text-etiqueta font-semibold text-tx-2 transition-colors hover:bg-sf-apoio",
        className,
      )}
    >
      <ChevronDown size={14} aria-hidden="true" className={clsx("transition-transform", recolher && "rotate-180")} />
      {recolher ? "Recolher todas" : "Expandir todas"}
    </button>
  );
}

/**
 * O cabeçalho-botão da coluna: bolinha, nome e contagem à vista, seta que vira. É o `<h3>` da coluna e o
 * botão está DENTRO dele (padrão de acordeão). O alvo é a largura inteira e tem 44 px de altura.
 */
export function TituloDaColuna({
  aberta,
  aoAlternar,
  idDoCorpo,
  cor,
  nome,
  total,
}: {
  aberta: boolean;
  aoAlternar: () => void;
  idDoCorpo: string;
  cor: string;
  nome: string;
  total: number;
}) {
  return (
    <h3 className="text-corpo font-semibold text-tx">
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={idDoCorpo}
        onClick={aoAlternar}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} aria-hidden="true" />
          <span className="truncate">{nome}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap rounded-full border border-regua bg-sf px-2 py-0.5 text-etiqueta font-semibold text-tx-2">
            <span className="sr-only">Atendimentos: </span>
            {total}
          </span>
          <ChevronDown size={16} aria-hidden="true" className={clsx("text-tx-3 transition-transform", aberta && "rotate-180")} />
        </span>
      </button>
    </h3>
  );
}

// ── Para as páginas de SERVIDOR (site e aplicativo): o contexto leva o estado até cada coluna, e os
// cartões, que são desenhados no servidor, entram como `children`.

const Contexto = createContext<ColunasRecolhidas | null>(null);

export function ColunasRecolhiveis({
  superficie,
  estagios,
  children,
}: {
  superficie: SuperficieDoFunil;
  estagios: readonly string[];
  children: ReactNode;
}) {
  const colunas = useColunasRecolhidas(superficie, estagios);
  return (
    <Contexto.Provider value={colunas}>
      <div className="mb-3 flex justify-end">
        <BotaoDeTodas colunas={colunas} />
      </div>
      {children}
    </Contexto.Provider>
  );
}

export function ColunaRecolhivel({
  estagio,
  nome,
  cor,
  total,
  resumo,
  className,
  classeDoCorpo,
  children,
}: {
  estagio: string;
  nome: string;
  cor: string;
  total: number;
  /** Linhas sob o título que ficam à vista mesmo recolhida (valor estimado). */
  resumo?: ReactNode;
  className?: string;
  classeDoCorpo?: string;
  children: ReactNode;
}) {
  const colunas = useContext(Contexto);
  if (!colunas) throw new Error("ColunaRecolhivel fora de ColunasRecolhiveis");
  const aberta = colunas.aberta(estagio);
  const idDoCorpo = `corpo-funil-${estagio}`;
  return (
    <div className={className}>
      <div className={clsx("px-4 py-1.5", aberta && "border-b border-regua")}>
        <TituloDaColuna aberta={aberta} aoAlternar={() => colunas.alternar(estagio)} idDoCorpo={idDoCorpo} cor={cor} nome={nome} total={total} />
        {resumo}
      </div>
      <div id={idDoCorpo} hidden={!aberta} className={classeDoCorpo}>
        {children}
      </div>
    </div>
  );
}
