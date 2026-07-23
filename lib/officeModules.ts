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
