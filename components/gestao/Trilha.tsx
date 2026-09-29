import Link from "next/link";
import { ChevronRight } from "lucide-react";

// A TRILHA fica SEMPRE acima do título, com 20px de altura fixa, para o título ficar no mesmo
// ponto em toda página de Gestão (gabarito único, consolidado R1). Antes cada página decidia se
// havia "← voltar" (12px, cinza) e onde: Equipe, Comunicados e as subpáginas de Configurações
// tinham; Indicadores e Conexões não, e o título pulava.
export type PassoDaTrilha = { label: string; href?: string };

export default function Trilha({ passos }: { passos: PassoDaTrilha[] }) {
  return (
    <nav aria-label="Você está em" className="h-5 flex items-center">
      <ol className="flex items-center gap-1 text-etiqueta text-tx-3 min-w-0">
        {passos.map((p, i) => {
          const ultimo = i === passos.length - 1;
          return (
            <li key={`${p.label}-${i}`} className="flex items-center gap-1 min-w-0">
              {p.href && !ultimo ? (
                <Link href={p.href} className="hover:text-tx hover:underline truncate">
                  {p.label}
                </Link>
              ) : (
                <span aria-current={ultimo ? "page" : undefined} className={ultimo ? "text-tx-2 truncate" : "truncate"}>
                  {p.label}
                </span>
              )}
              {!ultimo && <ChevronRight size={12} aria-hidden="true" className="shrink-0" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
