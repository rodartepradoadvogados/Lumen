import Link from "next/link";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import type { ItemDeFechamento } from "@/lib/gestao/fecharMes";

// "Fechar o mês": o que costuma ficar para trás na virada, com a fila de origem a um clique.
// Quando tudo está zerado, diz isso em texto (nunca um cartão vazio).
export default function FecharOMes({ itens, mes }: { itens: ItemDeFechamento[]; mes: string }) {
  const pendentes = itens.filter((i) => i.quantidade > 0);
  return (
    <Card>
      <CardHeader title="Fechar o mês" subtitle={mes} />
      <div className="p-5">
        {pendentes.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-tx-2">
            <CheckCircle2 size={16} aria-hidden="true" className="text-concluido" /> Nada pendente para fechar.
          </p>
        ) : (
          <ul className="divide-y divide-regua">
            {pendentes.map((i) => (
              <li key={i.chave}>
                <Link href={i.href} className="flex items-center gap-3 py-3 text-sm text-tx hover:bg-sf-apoio -mx-2 px-2">
                  <span className="min-w-[2.5rem] text-guia font-bold tabular-nums">{i.quantidade}</span>
                  <span className="flex-1">{i.rotulo}</span>
                  <ChevronRight size={16} aria-hidden="true" className="text-tx-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
