import Link from "next/link";
import { X } from "lucide-react";

// A faixa que aparece quando a lista foi aberta já filtrada por um nome — é o que acontece quando
// alguém clica no nome do contato dentro de um atendimento (ver QuemEEsteNumero.tsx).
//
// POR QUE ELA EXISTE. Uma lista que chega filtrada sem dizer que está filtrada é a receita do
// "cadastrei e não aparece": a pessoa vê um registro onde havia trezentos e conclui que o sistema
// perdeu os dados. A faixa diz o que foi aplicado e dá a saída em um clique.
export default function FiltradoPorNome({ q, href, total }: { q: string; href: string; total: number }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border border-regua bg-sf-apoio px-3 py-2">
      <p className="text-xs text-tx-2">
        Filtrado por <strong className="text-tx">{q}</strong> · {total} encontrado(s)
      </p>
      <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-tx-3 hover:text-tx">
        <X size={13} /> Ver todos
      </Link>
    </div>
  );
}
