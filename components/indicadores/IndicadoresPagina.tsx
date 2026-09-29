import type { ReactNode } from "react";
import PaginaGestao from "@/components/gestao/PaginaGestao";

export const GUIAS_DE_INDICADORES = [
  { chave: "visao-geral", rotulo: "Visão geral", href: "/indicadores" },
  { chave: "produtividade", rotulo: "Produtividade", href: "/indicadores/produtividade" },
  { chave: "processos", rotulo: "Processos", href: "/indicadores/processos" },
  { chave: "funil", rotulo: "Funil comercial", href: "/indicadores/funil" },
  { chave: "publicacoes", rotulo: "Publicações", href: "/indicadores/publicacoes" },
  { chave: "financeiro", rotulo: "Financeiro", href: "/indicadores/financeiro", soFinanceiro: true },
  { chave: "personalizado", rotulo: "Personalizado", href: "/indicadores/personalizado" },
] as const;

export type GuiaDeIndicadores = (typeof GUIAS_DE_INDICADORES)[number]["chave"];

// A casca de TODA página de Indicadores: mesmo título (o destino), mesma trilha, mesmas guias. O
// que muda de uma página para outra é só a frase, a ação e o conteúdo.
export default function IndicadoresPagina({
  ativa,
  temAcessoAoFinanceiro,
  frase,
  acao,
  children,
}: {
  ativa: GuiaDeIndicadores;
  temAcessoAoFinanceiro: boolean;
  frase: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
}) {
  const guia = GUIAS_DE_INDICADORES.find((g) => g.chave === ativa)!;
  return (
    <PaginaGestao
      trilha={[{ label: "Gestão", href: "/indicadores" }, { label: "Indicadores", href: "/indicadores" }, { label: guia.rotulo }]}
      titulo="Indicadores"
      frase={frase}
      acao={acao}
      subnavRotulo="Indicadores"
      subnav={GUIAS_DE_INDICADORES.filter((g) => !("soFinanceiro" in g) || temAcessoAoFinanceiro).map((g) => ({
        href: g.href,
        label: g.rotulo,
        ativo: g.chave === ativa,
      }))}
    >
      {children}
    </PaginaGestao>
  );
}
