import { prisma } from "@/lib/prisma";
import { stageOptions } from "@/lib/funil";
import { DIA_MS } from "@/lib/gestao/dias";

// FUNIL COMERCIAL na Visão geral — posição atual por estágio, conversão dos DECIDIDOS e propostas
// paradas. "Conversão" = fechados sobre (fechados + perdidos), com o n à vista: 6 de 9 é 67%, mas
// dizer só "67%" esconde que são nove casos.

export function conversaoDosDecididos(fechados: number, perdidos: number): { percentual: number | null; decididos: number } {
  const decididos = fechados + perdidos;
  return { percentual: decididos === 0 ? null : Math.round((fechados / decididos) * 100), decididos };
}

export function propostasParadas(propostas: { stageChangedAt: Date | null; createdAt: Date }[], agora: Date, dias = 7): number {
  return propostas.filter((p) => agora.getTime() - (p.stageChangedAt ?? p.createdAt).getTime() > dias * DIA_MS).length;
}

export async function resumoDoFunil(officeId: string, agora: Date = new Date()) {
  const atendimentos = await prisma.attendance.findMany({
    where: { officeId, status: { not: "ARQUIVADO" } },
    select: { stage: true, stageChangedAt: true, createdAt: true },
  });
  const porEstagio = stageOptions.map((estagio) => ({
    estagio,
    quantidade: atendimentos.filter((a) => (stageOptions.includes(a.stage) ? a.stage : "NOVO") === estagio).length,
  }));
  const fechados = porEstagio.find((e) => e.estagio === "FECHADO")?.quantidade ?? 0;
  const perdidos = porEstagio.find((e) => e.estagio === "PERDIDO")?.quantidade ?? 0;
  return {
    total: atendimentos.length,
    porEstagio,
    conversao: conversaoDosDecididos(fechados, perdidos),
    propostasParadas: propostasParadas(atendimentos.filter((a) => a.stage === "PROPOSTA"), agora),
  };
}
