import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import PaginaGestao from "@/components/gestao/PaginaGestao";

export type GuiaDePessoas = "clientes" | "advogados" | "fornecedores" | "equipe" | "duplicados";

const ROTULO: Record<GuiaDePessoas, string> = {
  clientes: "Clientes",
  advogados: "Advogados externos",
  fornecedores: "Fornecedores",
  equipe: "Equipe",
  duplicados: "Duplicados",
};

// A casca de toda página de Pessoas (antes "Contatos"): um só título, cinco guias com contagem, e a
// rota de entrada abre direto em Clientes. O hub de quatro cartões custava um clique e deixava 40%
// da tela vazia. As contagens são reais (uma consulta por guia) e só a guia Duplicados, que é
// ferramenta de administrador, fica sem número.
export default async function PessoasPagina({
  ativa,
  officeId,
  isAdmin,
  frase,
  acao,
  leitura = false,
  children,
}: {
  ativa: GuiaDePessoas;
  officeId: string;
  isAdmin: boolean;
  frase: ReactNode;
  acao?: ReactNode;
  leitura?: boolean;
  children: ReactNode;
}) {
  const [clientes, advogados, fornecedores, equipe] = await Promise.all([
    prisma.client.count({ where: { officeId } }),
    prisma.lawyer.count({ where: { officeId } }),
    prisma.supplier.count({ where: { officeId } }),
    prisma.user.count({ where: { officeId } }),
  ]);
  const itens = [
    { chave: "clientes" as const, href: "/contatos/clientes", contador: clientes },
    { chave: "advogados" as const, href: "/contatos/advogados", contador: advogados },
    { chave: "fornecedores" as const, href: "/contatos/fornecedores", contador: fornecedores },
    { chave: "equipe" as const, href: "/contatos/equipe", contador: equipe },
    ...(isAdmin ? [{ chave: "duplicados" as const, href: "/contatos/duplicados", contador: undefined }] : []),
  ];
  return (
    <PaginaGestao
      trilha={[{ label: "Gestão", href: "/indicadores" }, { label: "Pessoas", href: "/contatos/clientes" }, { label: ROTULO[ativa] }]}
      titulo="Pessoas"
      frase={frase}
      acao={acao}
      leitura={leitura}
      subnavRotulo="Pessoas"
      subnav={itens.map((i) => ({ href: i.href, label: ROTULO[i.chave], contador: i.contador, ativo: i.chave === ativa }))}
    >
      {children}
    </PaginaGestao>
  );
}
