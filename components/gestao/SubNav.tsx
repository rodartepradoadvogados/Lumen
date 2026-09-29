import Link from "next/link";
import clsx from "clsx";

// A navegação de SEGUNDO NÍVEL da Gestão — uma só, com um só estilo, sob o cabeçalho.
//
// Antes eram cinco linguagens (menu lateral, guia ocre em caixa-alta, botões-caixa em bordô, hub de
// cartões, mestre-detalhe) e três cores de "ativo". Aqui: texto + sublinhado de 2px na tinta (a cor
// da seção fica só no rail e o bordô só na ação — a aba não é ação). Altura fixa de 40px, rolagem
// horizontal no celular (nunca empilha), contador em tinta-3, aria-current na página atual.
export type ItemDaSubNav = {
  href: string;
  label: string;
  ativo: boolean;
  /** Número ao lado do rótulo (ex.: quantos clientes). Omitido quando não há contagem honesta. */
  contador?: number;
};

export default function SubNav({ rotulo, itens }: { rotulo: string; itens: ItemDaSubNav[] }) {
  return (
    <nav aria-label={rotulo} className="h-10 flex items-stretch gap-5 overflow-x-auto scrollbar-thin border-b border-regua">
      {itens.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.ativo ? "page" : undefined}
          className={clsx(
            "shrink-0 flex items-center gap-1.5 text-sm border-b-2 -mb-px transition-colors",
            i.ativo ? "font-bold text-tx border-tx" : "font-medium text-tx-2 border-transparent hover:text-tx"
          )}
        >
          {i.label}
          {i.contador !== undefined && <span className="text-etiqueta font-medium text-tx-3 tabular-nums">{i.contador}</span>}
        </Link>
      ))}
    </nav>
  );
}
