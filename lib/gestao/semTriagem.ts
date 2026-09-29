import { prisma } from "@/lib/prisma";
import { DIA_MS, hojeCalendario } from "@/lib/gestao/dias";
import { diaDeBrasilia } from "@/lib/horaDeBrasilia";

// "SEM TRIAGEM", DEFINIDO UMA VEZ. A fila de Publicações mostrava 46 e Relatórios mostrava 42
// "pendente" — duas leituras do mesmo conceito. Aqui: publicação com `triageStatus === "PENDENTE"`,
// no escritório inteiro, sem recorte de período (o que ainda não foi triado continua pendente por
// mais antigo que seja). A idade da mais antiga é dada em dias corridos até hoje.

export type ResumoSemTriagem = { total: number; maisAntigaEm: Date | null; diasDaMaisAntiga: number | null };

export function resumirSemTriagem(publicadas: { publishedAt: Date }[], hoje: Date): ResumoSemTriagem {
  if (publicadas.length === 0) return { total: 0, maisAntigaEm: null, diasDaMaisAntiga: null };
  const maisAntiga = publicadas.reduce((a, b) => (b.publishedAt < a.publishedAt ? b : a));
  const [ano, mes, d] = diaDeBrasilia(maisAntiga.publishedAt).split("-").map(Number);
  const dia = new Date(Date.UTC(ano, mes - 1, d));
  return { total: publicadas.length, maisAntigaEm: maisAntiga.publishedAt, diasDaMaisAntiga: Math.max(0, Math.round((hoje.getTime() - dia.getTime()) / DIA_MS)) };
}

export async function publicacoesSemTriagem(officeId: string, agora: Date = new Date()): Promise<ResumoSemTriagem> {
  const pendentes = await prisma.publication.findMany({ where: { officeId, triageStatus: "PENDENTE" }, select: { publishedAt: true } });
  return resumirSemTriagem(pendentes, hojeCalendario(agora));
}
