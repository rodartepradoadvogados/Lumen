import { redirect } from "next/navigation";

// A Produtividade agora vive em Indicadores > Produtividade. Este arquivo existe só para que
// nenhum link salvo (guia aberta, favorito, e-mail) quebre: preserva o mês e o filtro e traduz as
// abas antigas (Histórico -> "Por pessoa", Timesheet -> "Tempo no sistema", Delegar -> /delegar).
export default function ProdutividadeAntiga({ searchParams }: { searchParams: { mes?: string; aba?: string; responsibleId?: string } }) {
  if (searchParams.aba === "delegar") redirect("/delegar");
  const p = new URLSearchParams();
  p.set("visao", searchParams.aba === "timesheet" ? "tempo" : searchParams.responsibleId ? "pessoa" : "equipe");
  if (searchParams.mes) p.set("mes", searchParams.mes);
  if (searchParams.responsibleId) p.set("responsibleId", searchParams.responsibleId);
  redirect(`/indicadores/produtividade?${p.toString()}`);
}
