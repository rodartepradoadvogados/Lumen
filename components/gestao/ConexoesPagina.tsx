import type { ReactNode } from "react";
import PaginaGestao from "@/components/gestao/PaginaGestao";

export type GuiaDeConexoes = "ativas" | "disponiveis" | "log" | "relatorio-pastas";

const GUIAS: { chave: GuiaDeConexoes; rotulo: string; href: string }[] = [
  { chave: "ativas", rotulo: "Ativas", href: "/conexoes" },
  { chave: "disponiveis", rotulo: "Disponíveis", href: "/conexoes?guia=disponiveis" },
  { chave: "log", rotulo: "Webhooks e log", href: "/conexoes?guia=log" },
  { chave: "relatorio-pastas", rotulo: "Relatório de pastas", href: "/conexoes/relatorio-pastas" },
];

// A casca de toda página de Conexões: o mesmo título e as mesmas quatro guias. "Ativas" e
// "Disponíveis" separam o que funciona do que ainda não foi ligado (antes tinham o mesmo peso e um
// 503 no log ficava escondido ao lado de nove cartões "não configurado").
export default function ConexoesPagina({
  ativa,
  frase,
  resposta,
  contadores,
  leitura = false,
  children,
}: {
  ativa: GuiaDeConexoes;
  frase: ReactNode;
  /** A primeira coisa que a página diz (a saúde das integrações). */
  resposta?: ReactNode;
  contadores?: Partial<Record<GuiaDeConexoes, number>>;
  leitura?: boolean;
  children: ReactNode;
}) {
  return (
    <PaginaGestao
      trilha={[{ label: "Gestão", href: "/indicadores" }, { label: "Conexões", href: "/conexoes" }, { label: GUIAS.find((g) => g.chave === ativa)!.rotulo }]}
      titulo="Conexões"
      frase={frase}
      leitura={leitura}
      subnavRotulo="Conexões"
      subnav={GUIAS.map((g) => ({ href: g.href, label: g.rotulo, ativo: g.chave === ativa, contador: contadores?.[g.chave] }))}
    >
      {resposta}
      {children}
    </PaginaGestao>
  );
}
