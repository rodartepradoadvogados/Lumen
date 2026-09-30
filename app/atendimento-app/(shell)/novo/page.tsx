import { prisma } from "@/lib/prisma";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
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
    <header className="shrink-0 bg-atd-tela pt-[env(safe-area-inset-top)]">
      <div className="flex min-h-14 items-center pl-1 pr-3">
        <BotaoVoltar tela="novo" rotulo="Voltar" className="!rounded-full !text-tx hover:!bg-atd-linha-hover" />
        <h1 className="min-w-0 flex-1 truncate px-2 text-app-nome font-bold text-tx">Novo atendimento</h1>
      </div>
    </header>
  );

  if (!modules.atendimento) {
    return (
      <div className="fixed inset-0 z-40 flex justify-center bg-atd-tela">
        <div className="flex h-full w-full max-w-md flex-col">
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
    <div className="fixed inset-0 z-40 flex justify-center bg-atd-tela">
      <div className="flex h-full w-full max-w-md flex-col bg-atd-tela">
        {cabecalho}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1 animate-fade-in">
          <p className="px-1 text-corpo text-atd-previa">Registre um novo contato rapidamente</p>
          <MobileNewAttendanceForm users={users} driveConnected={driveStatus.connected} variante="app" />
        </div>
      </div>
    </div>
  );
}
