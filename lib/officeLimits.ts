import { prisma } from "@/lib/prisma";

// Conta as OABs efetivamente monitoradas de um escritório — mesma fonte que o robô Python usa
// pra saber o que buscar (robo-publicacoes/src/config.py:carregar_oabs_do_banco: usuários
// ativos com OAB preenchida), só que agrupada por escritório. Não existe uma lista separada de
// "OABs autorizadas": usar outra fonte aqui divergiria do que é de fato monitorado.
export async function contarOabsMonitoradas(officeId: string): Promise<number> {
  const rows = await prisma.user.findMany({
    where: { officeId, active: true, oab: { not: null } },
    select: { oab: true },
    distinct: ["oab"],
  });
  return rows.filter((r) => r.oab && r.oab.trim() !== "").length;
}

// "Processo" no sentido do plano (Standard "até 200 processos" etc.) é Judicial ou
// Administrativo — mesma taxonomia que lib/caseNatureza.ts já define e que a tela de Processos
// já usa; Caso/Atendimento (o resto de Case.type) não entra na conta.
export async function contarProcessos(officeId: string): Promise<number> {
  return prisma.case.count({ where: { officeId, type: { in: ["JUDICIAL", "ADMINISTRATIVO"] } } });
}
