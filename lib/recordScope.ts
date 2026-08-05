import { prisma } from "@/lib/prisma";

// Metadados puros (lista de scopeType, rótulos, campos revelados) moraram para
// lib/recordScopeMeta.ts para poder ser importados por Client Components sem puxar o Prisma
// Client para o bundle do navegador. Reexportados aqui para quem já importa deste caminho
// (lib/breakGlass.ts, lib/actions/breakGlass.ts) continuar funcionando sem precisar saber da
// divisão.
export {
  RECORD_SCOPE_TYPES,
  RECORD_SCOPE_MODEL,
  RECORD_SCOPE_LABEL,
  FIELD_LABELS,
  isRecordScopeType,
  revealFieldsFor,
  revealFieldKinds,
  type RecordScopeType,
} from "@/lib/recordScopeMeta";

import type { RecordScopeType } from "@/lib/recordScopeMeta";

// Confirma posse: o registro existe e é DAQUELE escritório. Usa o client mascarado normal
// (`prisma`) de propósito — aqui só interessa SE existe (seleciona só `id`, que nunca é
// mascarado), nunca o teor do registro.
export async function isRecordInOffice(scopeType: RecordScopeType, scopeId: string, officeId: string): Promise<boolean> {
  switch (scopeType) {
    case "CASE":
      return Boolean(await prisma.case.findFirst({ where: { id: scopeId, officeId }, select: { id: true } }));
    case "PAYABLE":
      return Boolean(await prisma.payable.findFirst({ where: { id: scopeId, officeId }, select: { id: true } }));
    case "RECEIVABLE":
      return Boolean(await prisma.receivable.findFirst({ where: { id: scopeId, officeId }, select: { id: true } }));
    case "ATTENDANCE":
      return Boolean(await prisma.attendance.findFirst({ where: { id: scopeId, officeId }, select: { id: true } }));
  }
}

// Rótulo legível do registro (para a fila de aprovação do escritório — ver
// components/AccessRequestQueue.tsx). SEMPRE chamado do lado do próprio escritório (nunca sob
// sessão de suporte mascarada: quem lê a fila é o sócio no navegador dele, sem o cookie
// `rp_acting_office`), então o client mascarado normal (`prisma`) já devolve o dado real aqui —
// não há necessidade (nem seria correto) de usar `prismaBase` para isto.
export async function resolveRecordLabel(scopeType: RecordScopeType, scopeId: string, officeId: string): Promise<string | null> {
  switch (scopeType) {
    case "CASE": {
      const rec = await prisma.case.findFirst({ where: { id: scopeId, officeId }, select: { title: true } });
      return rec?.title ?? null;
    }
    case "PAYABLE": {
      const rec = await prisma.payable.findFirst({ where: { id: scopeId, officeId }, select: { description: true } });
      return rec?.description ?? null;
    }
    case "RECEIVABLE": {
      const rec = await prisma.receivable.findFirst({ where: { id: scopeId, officeId }, select: { description: true } });
      return rec?.description ?? null;
    }
    case "ATTENDANCE": {
      const rec = await prisma.attendance.findFirst({ where: { id: scopeId, officeId }, select: { subject: true, clientName: true } });
      return rec ? `${rec.clientName} — ${rec.subject}` : null;
    }
  }
}
