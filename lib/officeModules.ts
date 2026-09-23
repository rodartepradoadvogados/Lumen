import { prisma } from "@/lib/prisma";

// ============================================================================
// Módulos habilitados por contrato — cada escritório pode ter Financeiro,
// WhatsApp, Atendimento (CRM) e/ou Assessoria Jurídica desligados, conforme o
// que foi contratado. Checado em dois lugares: navegação (esconde o item) e
// dentro dos Server Actions de cada módulo (recusa a operação mesmo se alguém
// tentar chamá-la direto) — mesmo padrão usado para `financeAccess` por usuário.
// ============================================================================

export type OfficeModules = {
  financeiro: boolean;
  whatsapp: boolean;
  atendimento: boolean;
  assessoria: boolean;
};

const DEFAULT_MODULES: OfficeModules = { financeiro: true, whatsapp: true, atendimento: true, assessoria: true };

export async function getOfficeModules(officeId: string): Promise<OfficeModules> {
  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { moduloFinanceiro: true, moduloWhatsapp: true, moduloAtendimento: true, moduloAssessoria: true },
  });
  if (!office) return DEFAULT_MODULES;
  return {
    financeiro: office.moduloFinanceiro,
    whatsapp: office.moduloWhatsapp,
    atendimento: office.moduloAtendimento,
    assessoria: office.moduloAssessoria,
  };
}

// Acesso ao Blog Jurídico não é um módulo contratável como os de cima — é um recurso da
// própria PLATAFORMA, controlado só pelo escritório dono (Rodarte Prado) ou por quem ele
// conceder no futuro. Por isso fica fora de OfficeModules/ModulesManager e não tem toggle na
// tela de Configurações ainda.
export async function hasBlogAccess(officeId: string): Promise<boolean> {
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { blogAccess: true } });
  return office?.blogAccess ?? false;
}

// Escritório dono da plataforma (Rodarte Prado) — fonte única para "qual é o escritório do
// blog/robô/institucional". isInternal, NÃO "o Office mais antigo": um findFirst() sem esse
// filtro já causou matéria do robô sendo associada ao Office errado assim que passou a existir
// mais de um registro na tabela (ver app/api/blog/draft/route.ts, onde o bug foi corrigido
// primeiro). Antes desta função, os pontos de LEITURA pública (app/blog/page.tsx, app/page.tsx)
// não tinham recebido a mesma correção e continuavam resolvendo por `orderBy: createdAt asc` —
// as duas pontas do mesmo fluxo respondiam "qual é o escritório do blog" de formas diferentes, e
// matéria publicada podia ficar invisível na página pública sempre que os dois Office não
// coincidissem (achado A34 da revisão gauntlet).
/**
 * O escritório dono da plataforma — usado pelas páginas públicas do blog e pela rota de rascunho.
 *
 * O `select` NÃO é otimização, é o que impede esta função de derrubar o DEPLOY. Sem ele, o Prisma
 * pede TODAS as colunas de Office; e as páginas do blog são geradas DURANTE O BUILD, contra o
 * banco que ainda está em produção. Como o `package.json` roda `prisma db push` DEPOIS do
 * `next build`, uma coluna nova em Office existe no schema e ainda não existe no banco na hora em
 * que esta consulta roda — o build morre com `P2022: The column Office.<nova> does not exist`, e
 * o deploy inteiro cai por causa de um campo que nem é usado aqui.
 *
 * Foi exatamente isso que aconteceu ao acrescentar `descricaoAtuacao`: o build de staging apontou,
 * e o de produção teria feito o mesmo, porque a ordem do `db push` é a mesma nos dois.
 *
 * Os três chamadores (app/blog/page.tsx, app/blog/[slug]/page.tsx, app/api/blog/draft/route.ts)
 * usam SÓ o `id`. Pedir mais do que se usa era, aqui, pedir para quebrar no dia em que alguém
 * acrescentasse um campo — e esse dia chega sempre.
 */
export async function getPlatformOffice() {
  return prisma.office.findFirst({ where: { isInternal: true }, select: { id: true } });
}
