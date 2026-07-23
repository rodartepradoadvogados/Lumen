import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import ModuleDisabledNotice from "@/components/ModuleDisabledNotice";

export default async function AssessoriaLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  const modules = await getOfficeModules(user.officeId);
  if (!modules.assessoria) {
    return <ModuleDisabledNotice moduleName="Assessoria Jurídica" />;
  }

  return <>{children}</>;
}
