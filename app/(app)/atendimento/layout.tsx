import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import ModuleDisabledNotice from "@/components/ModuleDisabledNotice";

export default async function AtendimentoLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  const modules = await getOfficeModules(user.officeId);
  if (!modules.atendimento) {
    return <ModuleDisabledNotice moduleName="Atendimento" />;
  }

  return <>{children}</>;
}
