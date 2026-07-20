// Ponte entre o robô Python de captura (DJEN/Datajud, rodando no Railway, que grava
// diretamente nas tabelas "publicacoes"/"andamentos" do mesmo Postgres — espelhadas
// aqui como RoboPublicacao/RoboAndamento) e as tabelas principais do site
// (Publication/Case). Segue o mesmo padrão de lib/jusbrasilEmailSync.ts.

import { prisma } from "@/lib/prisma";

export type RoboBridgeResult = {
  publicacoesCriadas: number;
  andamentosCriados: number;
  semCasoVinculado: number;
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

async function findCaseIdByProcessNumber(processNumeroNormalizado: string | null): Promise<string | null> {
  if (!processNumeroNormalizado) return null;
  const allCases = await prisma.case.findMany({ where: { processNumber: { not: null } }, select: { id: true, processNumber: true } });
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

export async function syncRoboParaSite(): Promise<RoboBridgeResult> {
  const result: RoboBridgeResult = { publicacoesCriadas: 0, andamentosCriados: 0, semCasoVinculado: 0, erros: [] };

  const publicacoesPendentes = await prisma.roboPublicacao.findMany({ where: { statusLido: false } });
  for (const pub of publicacoesPendentes) {
    try {
      const emailMessageId = `djen-${pub.idComunicacao}`;
      const jaExiste = await prisma.publication.findUnique({ where: { emailMessageId } });

      if (!jaExiste) {
        const numeroNormalizado = normalizarNumeroProcesso(pub.numeroProcesso);
        const caseId = await findCaseIdByProcessNumber(numeroNormalizado);
        const lawyerTag = detectLawyerTagFromOab(pub.oab, pub.nomeAdvogado);

        await prisma.publication.create({
          data: {
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
        const caseId = await findCaseIdByProcessNumber(numeroNormalizado);

        await prisma.publication.create({
          data: {
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

  return result;
}
