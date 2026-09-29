import { prisma } from "@/lib/prisma";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { Card } from "@/components/ui";
import MobileNewAttendanceForm from "@/components/mobile/MobileNewAttendanceForm";
import ModuleDisabledNotice from "@/components/ModuleDisabledNotice";
import BotaoVoltar from "@/components/atendimento-app/BotaoVoltar";
import { getOfficeModules } from "@/lib/officeModules";

export const dynamic = "force-dynamic";

// O "+": novo atendimento, em TELA CHEIA (sem a barra inferior — ver lib/navegacaoDoAtendimentoApp.ts).
// O formulário é o que já existia; só ganha um cabeçalho com "voltar" no lugar da barra.
export default async function NovoAtendimentoAppPage() {
  const viewer = await exigirAcessoAoAtendimentoNaTela();
  const modules = await getOfficeModules(viewer.officeId);
  const cabecalho = (
    <header className="atd-hdr shrink-0 border-b-2 border-ouro-acento bg-atd-hdr text-atd-hdr-tx pt-[env(safe-area-inset-top)]">
      <div className="flex min-h-[60px] items-center pl-0.5 pr-3">
        <BotaoVoltar tela="novo" rotulo="Voltar" />
        <h1 className="min-w-0 flex-1 truncate px-1.5 text-destaque font-semibold">Novo atendimento</h1>
      </div>
    </header>
  );

  if (!modules.atendimento) {
    return (
      <div className="fixed inset-0 z-40 flex justify-center bg-sf-fundo">
        <div className="flex h-full w-full max-w-md flex-col border-x border-regua">
          {cabecalho}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ModuleDisabledNotice moduleName="Atendimento" />
          </div>
        </div>
      </div>
    );
  }
  const [users, driveStatus] = await Promise.all([
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    (async () => ({ connected: true }))(),
  ]);

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-sf-fundo">
      <div className="flex h-full w-full max-w-md flex-col border-x border-regua bg-sf-fundo">
        {cabecalho}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-fade-in">
          <p className="text-sm text-tx-2">Registre um novo contato rapidamente</p>
          <Card className="p-4">
            <MobileNewAttendanceForm users={users} driveConnected={driveStatus.connected} />
          </Card>
        </div>
      </div>
    </div>
  );
}
