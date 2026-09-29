import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { Card } from "@/components/ui";
import MobileNewAttendanceForm from "@/components/mobile/MobileNewAttendanceForm";
import ModuleDisabledNotice from "@/components/ModuleDisabledNotice";
import { getOfficeModules } from "@/lib/officeModules";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NovoAtendimentoAppPage() {
  const viewer = await exigirAcessoAoAtendimentoNaTela();
  const modules = await getOfficeModules(viewer.officeId);
  if (!modules.atendimento) {
    return <ModuleDisabledNotice moduleName="Atendimento" />;
  }
  const [users, driveStatus] = await Promise.all([
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    (async () => ({ connected: true }))(),
  ]);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/atendimento-app" className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2">
        <ArrowLeft size={13} /> Triagem
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Novo Atendimento</h1>
        <p className="text-sm text-tx-2">Registre um novo contato rapidamente</p>
      </div>

      <Card className="p-4">
        <MobileNewAttendanceForm users={users} driveConnected={driveStatus.connected} />
      </Card>
    </div>
  );
}