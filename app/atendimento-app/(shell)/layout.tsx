import { getCurrentUser } from "@/lib/currentUser";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PWA_APPS } from "@/lib/pwaApps";
import { podeVerAtendimentos, SEM_ACESSO_AO_ATENDIMENTO } from "@/lib/acessoAtendimento";
import AtendimentoAppShell from "./AtendimentoAppShell";

export const dynamic = "force-dynamic";

export default async function AtendimentoAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !user.active) redirect(PWA_APPS.atendimento.entrar);

  const office = await prisma.office.findUnique({ where: { id: user.officeId }, select: { status: true, name: true } });
  if (office && office.status !== "ATIVA" && !user.isPlatformOwner) {
    return <div className="p-8 text-center text-tx-2">Escritório suspenso. Contate o administrador.</div>;
  }

  // Sem acesso ao Atendimento: nenhum filho é renderizado (as páginas também barram por conta
  // própria, e as ações/rotas conferem de novo — esta é só a mensagem que a pessoa lê).
  if (!podeVerAtendimentos(user)) {
    return <div className="p-8 text-center text-tx-2">{SEM_ACESSO_AO_ATENDIMENTO}</div>;
  }

  return <AtendimentoAppShell officeName={office?.name}>{children}</AtendimentoAppShell>;
}