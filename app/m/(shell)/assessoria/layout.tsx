import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import ModuleDisabledNotice from "@/components/ModuleDisabledNotice";

// Mesmo gate de app/(app)/assessoria/layout.tsx, que faltava aqui: só a listagem (page.tsx)
// checava o módulo — /m/assessoria/[id] abria mesmo com Assessoria Jurídica desligada.
export default async function MobileAssessoriaLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  const modules = await getOfficeModules(user.officeId);
  if (!modules.assessoria) {
    return <ModuleDisabledNotice moduleName="Assessoria Jurídica" />;
  }

  return <>{children}</>;
}
