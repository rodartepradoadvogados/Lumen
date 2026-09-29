import type { ReactNode } from "react";
import Trilha, { type PassoDaTrilha } from "@/components/gestao/Trilha";
import SubNav, { type ItemDaSubNav } from "@/components/gestao/SubNav";

// O GABARITO ÚNICO de página da Gestão (consolidado R1; plano da Gestão, seção 3):
//
//   Trilha       20px, sempre presente
//   Título       28/700 — o NOME DO DESTINO (Indicadores, Pessoas, Conexões, Configurações), que não
//                muda ao trocar de guia; quem diz "onde" é a guia ativa
//   Frase        uma só, 15px
//   Ação         à direita, no máximo uma em bordô
//   SubNav       40px, um estilo (components/gestao/SubNav.tsx)
//   Conteúdo     cartões com espaçamento de 24px
//
// `leitura` usa a medida de formulário (900px) para as telas que são só campo.
export default function PaginaGestao({
  trilha,
  titulo,
  frase,
  acao,
  subnav,
  subnavRotulo,
  leitura = false,
  children,
}: {
  trilha: PassoDaTrilha[];
  titulo: string;
  frase?: ReactNode;
  acao?: ReactNode;
  subnav?: ItemDaSubNav[];
  subnavRotulo?: string;
  leitura?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={leitura ? "tela-leitura" : "tela"} data-gabarito="gestao">
      <header>
        <Trilha passos={trilha} />
        <div className="mt-1 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-autuacao font-bold text-tx leading-tight">{titulo}</h1>
            {frase && <p className="text-corpo text-tx-2 mt-1 max-w-[68ch]">{frase}</p>}
          </div>
          {acao}
        </div>
      </header>
      {subnav && subnav.length > 0 && (
        <div className="mt-4">
          <SubNav rotulo={subnavRotulo ?? "Guias desta página"} itens={subnav} />
        </div>
      )}
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}
