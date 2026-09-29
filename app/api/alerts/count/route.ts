import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getAlertsCount } from "@/lib/alerts";
import { recorteDosAlertasDeAtendimento } from "@/lib/acessoAtendimento";
import { podeAcessarAba } from "@/lib/peticionamentoAcesso";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ count: 0 });

  const hasFinanceAccess = Boolean(viewer.isAdmin || viewer.financeAccess);
  // Mesmos dois recortes de TODO outro chamador (sino do site, do /m, painel, push): sem eles o
  // padrão é fail-closed e o contador do app esconderia os alertas de Atendimento e de minuta
  // de quem PODE vê-los.
  const count = await getAlertsCount(
    viewer.officeId,
    hasFinanceAccess,
    viewer.id,
    viewer.isAdmin,
    recorteDosAlertasDeAtendimento(viewer, viewer.id),
    podeAcessarAba(viewer),
  );

  return NextResponse.json({ count });
}