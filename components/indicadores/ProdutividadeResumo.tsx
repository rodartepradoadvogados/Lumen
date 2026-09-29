import Link from "next/link";
import { Info } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";

export type LinhaDePontos = { userId: string; nome: string; pontos: number };

// Produtividade em pontos no período comum — barras em ardósia, o mesmo número da tela de
// Produtividade (uma só definição: lib/gestao/pontos.ts). O rodapé diz o que são os pontos.
export default function ProdutividadeResumo({ linhas, comoSeCalcula, rotuloDoPeriodo }: { linhas: LinhaDePontos[]; comoSeCalcula: string; rotuloDoPeriodo: string }) {
  const max = Math.max(1, ...linhas.map((l) => l.pontos));
  const ordenadas = [...linhas].sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome, "pt-BR"));
  return (
    <Card>
      <CardHeader title="Produtividade" subtitle={`Pontos por pessoa · ${rotuloDoPeriodo}`} />
      <div className="p-5">
        {ordenadas.length === 0 ? (
          <p className="text-sm text-tx-2">Nenhuma tarefa concluída no período.</p>
        ) : (
          <ul className="space-y-2.5">
            {ordenadas.map((l) => (
              <li key={l.userId} className="grid grid-cols-[minmax(0,7rem)_1fr_2.5rem] items-center gap-3 text-sm">
                <span className="truncate text-tx-2">{l.nome}</span>
                <span className="h-2.5 bg-sf-apoio rounded-sm overflow-hidden" aria-hidden="true">
                  <span className="block h-full bg-faixa-ardosia rounded-sm" style={{ width: `${(l.pontos / max) * 100}%`, minWidth: l.pontos > 0 ? 3 : 0 }} />
                </span>
                <span className="text-right font-semibold tabular-nums text-tx">{l.pontos}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 flex items-start gap-2 text-sm text-tx-2">
          <Info size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
          <span>{comoSeCalcula}</span>
        </p>
        <p className="mt-3">
          <Link href="/indicadores/produtividade" className="text-sm font-semibold text-marca-tx hover:underline">
            Ver a produtividade
          </Link>
        </p>
      </div>
    </Card>
  );
}
