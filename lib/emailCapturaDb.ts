// Ponte entre o critério PURO de captura de e-mail (lib/emailCaptura.ts) e o banco: carrega, UMA vez
// por varredura e por escritório, as regras de remetente, os processos cadastrados e os bloqueados.
// Usado pelo Gmail (lib/jusbrasilEmailSync.ts) e pelo Outlook (lib/outlookEmailSync.ts), para as duas
// caixas decidirem exatamente igual.

import { prisma } from "@/lib/prisma";
import { decidirEmail, type DecisaoEmail, type EntradaEmail, type RegrasDoEscritorio } from "@/lib/emailCaptura";
import { chaveDoProcesso } from "@/lib/processKey";

export type ContextoDoEscritorio = {
  regras: RegrasDoEscritorio;
  // Chaves (lib/processKey.ts) dos processos cadastrados no escritório.
  casos: Set<string>;
  // Chaves dos processos que o escritório inteiro bloqueou ("Não é do escritório").
  bloqueados: Set<string>;
};

export async function carregarContextoDoEscritorio(officeId: string): Promise<ContextoDoEscritorio> {
  const [regras, casos, bloqueados] = await Promise.all([
    prisma.emailRemetenteRegra.findMany({ where: { officeId }, select: { padrao: true, acao: true } }),
    prisma.case.findMany({ where: { officeId, processNumber: { not: null } }, select: { processNumber: true } }),
    prisma.officeBlockedProcess.findMany({ where: { officeId }, select: { processKey: true } }),
  ]);
  const casosSet = new Set<string>();
  for (const c of casos) {
    const k = chaveDoProcesso(c.processNumber);
    if (k) casosSet.add(k);
  }
  return {
    regras: {
      permitir: regras.filter((r) => r.acao === "PERMITIR").map((r) => r.padrao),
      negar: regras.filter((r) => r.acao === "NEGAR").map((r) => r.padrao),
    },
    casos: casosSet,
    bloqueados: new Set(bloqueados.map((b) => b.processKey)),
  };
}

/** Endereços que o PRÓPRIO Lúmen usa para enviar e-mail (nunca são publicação). */
export function enderecosDoSistema(): string[] {
  return [process.env.EMAIL_USER, process.env.EMAIL_FROM].filter((v): v is string => Boolean(v)).map((v) => v.toLowerCase());
}

export function decidirComContexto(entrada: Omit<EntradaEmail, "regras" | "processoCadastrado" | "enderecosDoSistema">, ctx: ContextoDoEscritorio): DecisaoEmail {
  return decidirEmail({
    ...entrada,
    regras: ctx.regras,
    enderecosDoSistema: enderecosDoSistema(),
    processoCadastrado: (numero) => {
      const k = chaveDoProcesso(numero);
      return Boolean(k && ctx.casos.has(k));
    },
  });
}

export function estaBloqueado(ctx: ContextoDoEscritorio, numero: string | null | undefined): boolean {
  const k = chaveDoProcesso(numero);
  return Boolean(k && ctx.bloqueados.has(k));
}

// Quarentena guarda o MÍNIMO do corpo (LGPD): o suficiente para decidir "é publicação?", não o e-mail
// inteiro. Quem promove um item recebe o conteúdo completo na próxima varredura? Não: o que fica é
// este trecho, e é com ele que a pessoa decide.
export const TAMANHO_MAXIMO_DA_QUARENTENA = 1000;
