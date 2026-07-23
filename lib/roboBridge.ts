// Ponte entre o robô Python de captura (DJEN/Datajud, rodando no Railway, que grava
// diretamente nas tabelas "publicacoes"/"andamentos" do mesmo Postgres — espelhadas
// aqui como RoboPublicacao/RoboAndamento) e as tabelas principais do site
// (Publication/Case). Segue o mesmo padrão de lib/jusbrasilEmailSync.ts.

import { prisma } from "@/lib/prisma";
import { broadcastPushIfEnabled } from "@/lib/push";

export type RoboBridgeResult = {
  publicacoesCriadas: number;
  andamentosCriados: number;
  semCasoVinculado: number;
  processosMonitoradosCriados: number;
  erros: string[];
};

const JAIRO_OAB_RE = /78[.\s]?295/;
const RODRIGO_OAB_RE = /32[.\s]?943/;

// Número CNJ completo tem exatamente 20 dígitos: NNNNNNN-DD.AAAA.J.TR.OOOO
// (7 + 2 + 4 + 1 + 2 + 4). Só aceitamos o formato completo — não tentamos
// "meio-CNJ" solto, para evitar falso-positivo de vínculo com o Case errado.
export function normalizarNumeroProcesso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 20) return null;
  return digits;
}

// A partir da OAB (ou, na falta dela, do nome do advogado) informada pelo robô,
// identifica qual advogado do escritório está associado à publicação/andamento.
function detectLawyerTagFromOab(oab: string | null | undefined, nomeAdvogado: string | null | undefined): string | null {
  const oabText = oab ?? "";
  const hasJairo = JAIRO_OAB_RE.test(oabText);
  const hasRodrigo = RODRIGO_OAB_RE.test(oabText);
  if (hasJairo && hasRodrigo) return "Jairo e Rodrigo";
  if (hasJairo) return "Jairo";
  if (hasRodrigo) return "Rodrigo";
  return nomeAdvogado ?? null;
}

async function findCaseIdByProcessNumber(processNumeroNormalizado: string | null, officeId: string): Promise<string | null> {
  if (!processNumeroNormalizado) return null;
  const allCases = await prisma.case.findMany({ where: { officeId, processNumber: { not: null } }, select: { id: true, processNumber: true } });
  const found = allCases.find((c) => c.processNumber && normalizarNumeroProcesso(c.processNumber) === processNumeroNormalizado);
  return found?.id ?? null;
}

// dataDisponibilizacao/dataMovimentacao vêm como string livre do robô — tenta parsear
// como data válida; se não der, cai pra dataCaptura (quando o robô salvou o registro).
function parseDataOuFallback(raw: string | null | undefined, fallback: Date): Date {
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

// Alimenta o robô Python (tabela processos_monitorados/RoboProcessoMonitorado) com os
// números de processo já cadastrados nos Casos do site — assim o Datajud (que já
// funciona, ao contrário do DJEN, hoje bloqueado por IP) passa a acompanhar andamentos
// de todos os processos do escritório, mesmo enquanto a descoberta automática via DJEN
// não funcionar. Idempotente (skipDuplicates): não sobrescreve processos já monitorados,
// sejam eles descobertos via DJEN ou cadastrados manualmente pelo próprio robô.
async function seedProcessosMonitoradosFromCases(officeId: string): Promise<number> {
  const casos = await prisma.case.findMany({
    where: { officeId, processNumber: { not: null } },
    select: { processNumber: true },
  });

  const numerosValidos = new Set<string>();
  for (const c of casos) {
    if (c.processNumber && normalizarNumeroProcesso(c.processNumber)) {
      numerosValidos.add(c.processNumber);
    }
  }
  if (numerosValidos.size === 0) return 0;

  const { count } = await prisma.roboProcessoMonitorado.createMany({
    data: Array.from(numerosValidos).map((numeroProcesso) => ({
      numeroProcesso,
      origem: "site",
    })),
    skipDuplicates: true,
  });
  return count;
}

// TODO(multi-tenant / Fase 4): o robô Python (robo-publicacoes/) escreve num conjunto único e
// global de tabelas (RoboPublicacao/RoboAndamento/RoboProcessoMonitorado), sem noção de
// escritório — ele monitora só as OABs configuradas nele mesmo. Enquanto isso não for resolvido
// (robô precisa aprender a operar por tenant), esta ponte só pode atender UM escritório por vez.
export async function syncRoboParaSite(): Promise<RoboBridgeResult> {
  const result: RoboBridgeResult = {
    publicacoesCriadas: 0,
    andamentosCriados: 0,
    semCasoVinculado: 0,
    processosMonitoradosCriados: 0,
    erros: [],
  };

  const office = await prisma.office.findFirst({ orderBy: { createdAt: "asc" } });
  if (!office) {
    result.erros.push("Nenhum escritório cadastrado.");
    return result;
  }

  try {
    result.processosMonitoradosCriados = await seedProcessosMonitoradosFromCases(office.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "erro desconhecido";
    result.erros.push(`[seed processos monitorados] ${message}`);
  }

  const publicacoesPendentes = await prisma.roboPublicacao.findMany({ where: { statusLido: false } });
  for (const pub of publicacoesPendentes) {
    try {
      const emailMessageId = `djen-${pub.idComunicacao}`;
      const jaExiste = await prisma.publication.findUnique({ where: { emailMessageId } });

      if (!jaExiste) {
        const numeroNormalizado = normalizarNumeroProcesso(pub.numeroProcesso);
        const caseId = await findCaseIdByProcessNumber(numeroNormalizado, office.id);
        const lawyerTag = detectLawyerTagFromOab(pub.oab, pub.nomeAdvogado);

        await prisma.publication.create({
          data: {
            officeId: office.id,
            kind: "PUBLICACAO",
            source: "DJEN",
            content: pub.teor ?? pub.tipoComunicacao ?? "(sem teor)",
            publishedAt: parseDataOuFallback(pub.dataDisponibilizacao, pub.dataCaptura),
            emailMessageId,
            processNumberRaw: pub.numeroProcesso,
            caseId,
            lawyerTag,
          },
        });
        result.publicacoesCriadas++;
        if (!caseId) result.semCasoVinculado++;
      }

      // Só marca como lido depois de garantir que a Publication foi criada ou já
      // existia — nunca antes, para não perder dado em caso de erro no meio do caminho.
      await prisma.roboPublicacao.update({ where: { idComunicacao: pub.idComunicacao }, data: { statusLido: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      result.erros.push(`[publicacao ${pub.idComunicacao}] ${message}`);
    }
  }

  const andamentosPendentes = await prisma.roboAndamento.findMany({ where: { statusLido: false } });
  for (const and of andamentosPendentes) {
    try {
      const emailMessageId = `datajud-${and.numeroProcesso}-${and.dataMovimentacao}-${and.codigoMovimento}`;
      const jaExiste = await prisma.publication.findUnique({ where: { emailMessageId } });

      if (!jaExiste) {
        const numeroNormalizado = normalizarNumeroProcesso(and.numeroProcesso);
        const caseId = await findCaseIdByProcessNumber(numeroNormalizado, office.id);

        await prisma.publication.create({
          data: {
            officeId: office.id,
            kind: "ANDAMENTO",
            source: "DATAJUD",
            content: and.descricaoMovimento ?? and.codigoMovimento,
            publishedAt: parseDataOuFallback(and.dataMovimentacao, and.dataCaptura),
            emailMessageId,
            processNumberRaw: and.numeroProcesso,
            caseId,
          },
        });
        result.andamentosCriados++;
        if (!caseId) result.semCasoVinculado++;
      }

      await prisma.roboAndamento.update({ where: { id: and.id }, data: { statusLido: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      result.erros.push(`[andamento ${and.id}] ${message}`);
    }
  }

  // Um resumo só por tipo (não uma notificação por publicação) — evita inundar quem
  // ativou notificações caso o robô traga muitas de uma vez num único ciclo.
  if (result.publicacoesCriadas > 0 || result.andamentosCriados > 0) {
    const activeUserIds = (await prisma.user.findMany({ where: { active: true, officeId: office.id }, select: { id: true } })).map((u) => u.id);
    if (result.publicacoesCriadas > 0) {
      broadcastPushIfEnabled(activeUserIds, "publicacoes", {
        title: "Novas publicações",
        body: `${result.publicacoesCriadas} nova(s) publicação(ões) recebida(s).`,
        url: "/m/publicacoes",
      }).catch(() => {});
    }
    if (result.andamentosCriados > 0) {
      broadcastPushIfEnabled(activeUserIds, "andamentos", {
        title: "Novos andamentos processuais",
        body: `${result.andamentosCriados} novo(s) andamento(s) recebido(s).`,
        url: "/m/publicacoes",
      }).catch(() => {});
    }
  }

  return result;
}
