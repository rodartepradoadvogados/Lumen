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

// Quantos e-mails de captura de publicações (GoogleCredential.syncJusbrasil=true — inclui tanto
// as contas pessoais de advogados quanto as caixas compartilhadas que o admin conecta) o
// escritório já tem hoje — comparado contra limiteEmailsPublicacoes() abaixo antes de permitir
// conectar mais uma caixa compartilhada (ver app/api/google/callback/route.ts, mode
// "jusbrasil-shared").
export async function contarEmailsPublicacoes(officeId: string): Promise<number> {
  return prisma.googleCredential.count({ where: { officeId, syncJusbrasil: true } });
}

// Quantos e-mails de captura de publicações o plano do escritório permite — número de "OABs
// monitoradas" do catálogo de vendas (Plan.maxOabs, ex.: "Gold: até 5 OABs") MAIS 1, porque a
// conta principal do Google Drive do escritório também entra automaticamente nessa varredura
// (GoogleCredential.syncJusbrasil nasce true por padrão mesmo na conexão do Drive — ver
// lib/googleDrive.ts:saveTokensFromCode) e ocupa uma vaga na contagem de
// contarEmailsPublicacoes() sem ser, de fato, o e-mail de um dos advogados cobertos pelo plano.
// Segue a mesma regra de precedência já documentada no comentário de Office.oabLimit em
// prisma/schema.prisma: em plano fixo vale o limite do próprio Plan; só no Sob Medida
// (Plan.isCustom) o override em Office.oabLimit é lido. `null` = sem limite definido (nenhum
// plano atribuído ao escritório ainda, ou Sob Medida sem oabLimit configurado) — trata como "sem
// teto" em vez de bloquear, mesmo critério de app/page.tsx ao exibir "Até N OABs" (só mostra
// quando maxOabs != null).
export async function limiteEmailsPublicacoes(officeId: string): Promise<number | null> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { oabLimit: true, plan: { select: { isCustom: true, maxOabs: true } } },
  });
  if (!office?.plan) return null;
  const baseOabs = office.plan.isCustom ? office.oabLimit : office.plan.maxOabs;
  return baseOabs == null ? null : baseOabs + 1;
}
