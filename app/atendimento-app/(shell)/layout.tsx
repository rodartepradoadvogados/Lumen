import { getCurrentUser } from "@/lib/currentUser";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PWA_APPS } from "@/lib/pwaApps";
import AtendimentoAppShell from "./AtendimentoAppShell";

export const dynamic = "force-dynamic";

export default async function AtendimentoAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !user.active) redirect(PWA_APPS.atendimento.entrar);

  const office = await prisma.office.findUnique({ where: { id: user.officeId }, select: { status: true, name: true } });
  if (office && office.status !== "ATIVA" && !user.isPlatformOwner) {
    return <div className="p-8 text-center text-tx-2">Escritório suspenso. Contate o administrador.</div>;
  }

  return <AtendimentoAppShell officeName={office?.name}>{children}</AtendimentoAppShell>;
}