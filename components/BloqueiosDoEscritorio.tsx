import { prisma } from "@/lib/prisma";
import BloqueiosDoEscritorioManager from "@/components/BloqueiosDoEscritorioManager";

export default async function BloqueiosDoEscritorio({ officeId, isAdmin }: { officeId: string; isAdmin: boolean }) {
  const [processos, regras] = await Promise.all([
    prisma.officeBlockedProcess.findMany({ where: { officeId }, orderBy: { createdAt: "desc" }, select: { id: true, displayNumber: true, motivo: true, createdAt: true } }),
    prisma.emailRemetenteRegra.findMany({ where: { officeId }, orderBy: { createdAt: "desc" }, select: { id: true, padrao: true, acao: true, createdAt: true } }),
  ]);
  return (
    <BloqueiosDoEscritorioManager
      isAdmin={isAdmin}
      processos={processos.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))}
      regras={regras.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
    />
  );
}
