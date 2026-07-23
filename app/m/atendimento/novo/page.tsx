import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import MobileNewAttendanceForm from "@/components/mobile/MobileNewAttendanceForm";
import ModuleDisabledNotice from "@/components/ModuleDisabledNotice";
import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MobileNewAttendancePage() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  const modules = await getOfficeModules(viewer.officeId);
  if (!modules.atendimento) {
    return <ModuleDisabledNotice moduleName="Atendimento" />;
  }

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Novo Atendimento</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">Registre um novo contato rapidamente</p>
      </div>

      <Card className="p-4">
        <MobileNewAttendanceForm />
      </Card>
    </div>
  );
}
