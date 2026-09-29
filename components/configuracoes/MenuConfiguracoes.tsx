"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { GRUPOS, hrefDoItem, itemAtivo, type ItemDeConfiguracao } from "@/lib/gestao/configuracoes";

// O menu de Configurações: seis grupos, um item por destino. A partir de 900px de contêiner é um
// menu lateral; abaixo, um seletor "Ir para" (no celular um menu de 20 itens empurrava o conteúdo
// para fora da primeira tela). Os itens chegam já filtrados pelo servidor.
export default function MenuConfiguracoes({ itens }: { itens: ItemDeConfiguracao[] }) {
  const pathname = usePathname() ?? "";
  const secao = useSearchParams()?.get("secao") ?? null;
  const router = useRouter();
  const ativo = itemAtivo(pathname, secao, itens);

  return (
    <>
      <div className="lg:hidden">
        <label htmlFor="ir-para-configuracao" className="text-xs font-medium text-tx-2 block mb-1">
          Ir para
        </label>
        <select
          id="ir-para-configuracao"
          className="campo"
          value={ativo ? hrefDoItem(ativo) : ""}
          onChange={(e) => router.push(e.target.value)}
        >
          {GRUPOS.map((g) => {
            const doGrupo = itens.filter((i) => i.grupo === g.chave);
            if (doGrupo.length === 0) return null;
            return (
              <optgroup key={g.chave} label={g.rotulo}>
                {doGrupo.map((i) => (
                  <option key={i.chave} value={hrefDoItem(i)}>
                    {i.rotulo}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      <nav aria-label="Configurações" className="hidden lg:block w-56 shrink-0 sticky top-6 self-start bg-gaveta">
        <div className="p-3 space-y-4">
          {GRUPOS.map((g) => {
            const doGrupo = itens.filter((i) => i.grupo === g.chave);
            if (doGrupo.length === 0) return null;
            return (
              <div key={g.chave}>
                <p className="px-3 pb-1 text-etiqueta font-semibold uppercase tracking-[.08em] text-gaveta-tinta-2">{g.rotulo}</p>
                <ul>
                  {doGrupo.map((i) => {
                    const on = ativo?.chave === i.chave;
                    return (
                      <li key={i.chave}>
                        <Link
                          href={hrefDoItem(i)}
                          aria-current={on ? "page" : undefined}
                          className={clsx(
                            "block px-3 py-2 text-sm transition-colors",
                            on ? "bg-gaveta-fundo text-gaveta-tinta font-bold" : "text-gaveta-tinta-2 font-medium hover:bg-gaveta-fundo hover:text-gaveta-tinta"
                          )}
                        >
                          {i.rotulo}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </nav>
    </>
  );
}
