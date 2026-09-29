"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { ordenarCarga, type LinhaDeCarga } from "@/lib/gestao/cargaCalculo";

type Chave = "abertas" | "vencemEm7" | "atrasadas" | "semTriagem" | "feitasNoMes";

const COLUNAS: { chave: Chave; rotulo: string }[] = [
  { chave: "abertas", rotulo: "Abertas" },
  { chave: "vencemEm7", rotulo: "Vencem em 7 dias" },
  { chave: "atrasadas", rotulo: "Atrasadas" },
  { chave: "semTriagem", rotulo: "Sem triagem" },
  { chave: "feitasNoMes", rotulo: "Feitas no mês" },
];

function iniciais(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Carga por pessoa — ordenável. Abaixo de 700px a tabela vira cartões e o cabeçalho ordenável some,
// por isso o seletor "Ordenar por" (achado do mockup: a ordenação sumia junto com o cabeçalho).
// Anuncia a ordem escolhida numa região aria-live.
export default function CargaPorAdvogado({
  linhas,
  totais,
  soAPropria,
  semDono,
}: {
  linhas: LinhaDeCarga[];
  totais: Record<Chave, number>;
  soAPropria: boolean;
  semDono: { tarefas: number; publicacoes: number };
}) {
  const [chave, setChave] = useState<Chave>("atrasadas");
  const [aviso, setAviso] = useState("");
  const ordenadas = ordenarCarga(linhas, chave);

  function escolher(nova: Chave) {
    setChave(nova);
    setAviso(`Ordenado por ${COLUNAS.find((c) => c.chave === nova)?.rotulo.toLowerCase()}, maior primeiro`);
  }

  return (
    <Card>
      <CardHeader
        title="Carga por advogado"
        subtitle={soAPropria ? "Sua carga. A equipe inteira aparece para os sócios." : "Ordene pela coluna. Tarefas e prazos abertos, de qualquer tipo."}
      />
      <div className="md:hidden px-5 pt-4">
        <label htmlFor="ordenar-carga" className="text-xs font-medium text-tx-2 block mb-1">
          Ordenar por
        </label>
        <select
          id="ordenar-carga"
          value={chave}
          onChange={(e) => escolher(e.target.value as Chave)}
          className="campo"
        >
          {COLUNAS.map((c) => (
            <option key={c.chave} value={c.chave}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {aviso}
      </p>
      {linhas.length === 0 ? (
        <p className="px-5 py-8 text-sm text-tx-2">Nenhuma pessoa ativa para mostrar.</p>
      ) : (
        <div className="p-2 md:p-3">
          <table className="w-full text-sm block md:table">
            <thead className="hidden md:table-header-group">
              <tr className="text-left text-etiqueta font-semibold text-tx-2 border-b border-regua">
                <th scope="col" className="px-3 py-2 font-semibold">
                  Pessoa
                </th>
                {COLUNAS.map((c) => (
                  <th key={c.chave} scope="col" className="px-3 py-2 text-right font-semibold" aria-sort={chave === c.chave ? "descending" : undefined}>
                    <button type="button" onClick={() => escolher(c.chave)} className="inline-flex items-center gap-1 hover:text-tx">
                      {c.rotulo}
                      {chave === c.chave && <ArrowDown size={12} aria-hidden="true" />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="block md:table-row-group divide-y divide-regua">
              {ordenadas.map((l) => (
                <tr key={l.userId} className="block md:table-row py-2 md:py-0">
                  <td className="block md:table-cell px-3 py-1.5 md:py-2.5">
                    <span className="flex items-center gap-2.5 font-medium text-tx">
                      <span aria-hidden="true" className="h-7 w-7 rounded-full bg-sf-apoio border border-regua-forte text-tx text-etiqueta font-bold flex items-center justify-center shrink-0">
                        {iniciais(l.nome)}
                      </span>
                      {l.nome}
                    </span>
                  </td>
                  {COLUNAS.map((c) => (
                    <td key={c.chave} className="flex md:table-cell justify-between md:text-right px-3 py-1 md:py-2.5 tabular-nums">
                      <span className="md:hidden text-tx-2">{c.rotulo}</span>
                      {c.chave === "atrasadas" && l.atrasadas > 0 ? (
                        <span className="inline-flex items-center gap-1 font-bold text-urgente">
                          <AlertTriangle size={14} aria-hidden="true" />
                          {l.atrasadas}
                        </span>
                      ) : (
                        <span>{l[c.chave]}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {!soAPropria && (
              <tfoot className="block md:table-footer-group border-t-2 border-regua-forte">
                <tr className="block md:table-row py-2 md:py-0 font-semibold text-tx">
                  <td className="block md:table-cell px-3 py-1.5 md:py-2.5">Escritório</td>
                  {COLUNAS.map((c) => (
                    <td key={c.chave} className="flex md:table-cell justify-between md:text-right px-3 py-1 md:py-2.5 tabular-nums">
                      <span className="md:hidden font-normal text-tx-2">{c.rotulo}</span>
                      <span className={c.chave === "atrasadas" && totais.atrasadas > 0 ? "text-urgente" : ""}>{totais[c.chave]}</span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {!soAPropria && (semDono.tarefas > 0 || semDono.publicacoes > 0) && (
        <p className="px-5 pb-4 text-sm text-tx-2">
          Sem dono:{" "}
          {[semDono.tarefas > 0 ? `${semDono.tarefas} ${semDono.tarefas === 1 ? "tarefa aberta" : "tarefas abertas"}` : null, semDono.publicacoes > 0 ? `${semDono.publicacoes} ${semDono.publicacoes === 1 ? "publicação" : "publicações"} sem triagem` : null]
            .filter(Boolean)
            .join(" e ")}
          . Não entram na linha de ninguém.
        </p>
      )}
    </Card>
  );
}
