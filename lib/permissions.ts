import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";

export async function requireFinanceAccess(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sessão inválida.");
  const modules = await getOfficeModules(user.officeId);
  if (!modules.financeiro) {
    throw new Error("O módulo Financeiro não está incluído no plano deste escritório.");
  }
  if (!user.isAdmin && !user.financeAccess) {
    throw new Error("Você não tem acesso ao módulo Financeiro.");
  }
}
