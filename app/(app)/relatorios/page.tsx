import { redirect } from "next/navigation";

// Os Relatórios agora vivem em Indicadores. Redireciona preservando a seção e o período, para que
// nenhum link salvo quebre: ?secao=produtividade -> /indicadores/produtividade; sem seção ->
// a Visão geral.
export default function RelatoriosAntigo({ searchParams }: { searchParams: { secao?: string; meses?: string } }) {
  const secao = searchParams.secao;
  const validas = ["produtividade", "processos", "funil", "publicacoes", "financeiro", "personalizado"];
  if (!secao || !validas.includes(secao)) redirect("/indicadores");
  const meses = searchParams.meses && ["3", "6", "12"].includes(searchParams.meses) ? `?meses=${searchParams.meses}` : "";
  redirect(`/indicadores/${secao}${secao === "produtividade" ? "" : meses}`);
}
