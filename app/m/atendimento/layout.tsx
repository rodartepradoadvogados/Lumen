import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import ModuleDisabledNotice from "@/components/ModuleDisabledNotice";

// Mesmo gate de app/(app)/atendimento/layout.tsx, que faltava aqui: só a listagem (page.tsx)
// checava o módulo — /m/atendimento/[id] e /m/atendimento/novo abriam mesmo com Atendimento
// desligado.
export default async function MobileAtendimentoLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  const modules = await getOfficeModules(user.officeId);
  if (!modules.atendimento) {
    return <ModuleDisabledNotice moduleName="Atendimento" />;
  }

  return <>{children}</>;
}
