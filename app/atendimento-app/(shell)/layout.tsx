import { getCurrentUser } from "@/lib/currentUser";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PWA_APPS } from "@/lib/pwaApps";
import { logout } from "@/lib/actions/auth";
import { nivelDeAcessoAoAtendimento, SEM_ACESSO_AO_ATENDIMENTO } from "@/lib/acessoAtendimento";
import { SCRIPT_INICIAL_DO_TEMA } from "@/lib/temaDoAtendimentoApp";
import AtendimentoAppShell from "./AtendimentoAppShell";

export const dynamic = "force-dynamic";

export default async function AtendimentoAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !user.active) redirect(PWA_APPS.atendimento.entrar);

  const office = await prisma.office.findUnique({ where: { id: user.officeId }, select: { status: true, name: true } });
  if (office && office.status !== "ATIVA" && !user.isPlatformOwner) {
    return <div className="p-8 text-center text-tx-2">Escritório suspenso. Contate o administrador.</div>;
  }

  // Sem acesso ao Atendimento: nenhum filho é renderizado — sem barra, sem lista, sem contagem (as
  // páginas também barram por conta própria, e as ações/rotas conferem de novo: esta é só a tela
  // que a pessoa lê). Fica o botão Sair, para ela poder entrar com outra conta.
  const nivel = nivelDeAcessoAoAtendimento(user);
  if (nivel === "nenhum") {
    return (
      <div id="atendimento-shell" className="atendimento-shell min-h-dvh bg-atd-tela text-tx">
        {/* eslint-disable-next-line react/no-danger -- texto fixo do próprio código */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_INICIAL_DO_TEMA }} />
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 py-10 text-center">
          <h1 className="text-guia font-bold text-tx">Sem acesso ao Atendimento</h1>
          <p className="text-corpo text-tx-2">{SEM_ACESSO_AO_ATENDIMENTO}</p>
          <p className="text-corpo text-tx-2">Para liberar, peça a um sócio administrador.</p>
          <form action={logout.bind(null, PWA_APPS.atendimento.entrar)}>
            <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[2px] bg-acao px-4 text-corpo font-bold text-acao-tx hover:bg-acao-hover">
              <LogOut size={18} aria-hidden="true" /> Sair
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <AtendimentoAppShell officeName={office?.name} nivel={nivel}>
      {children}
    </AtendimentoAppShell>
  );
}
