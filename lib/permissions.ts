import { getCurrentUser } from "@/lib/currentUser";

export async function requireFinanceAccess(): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.isAdmin && !user?.financeAccess) {
    throw new Error("Você não tem acesso ao módulo Financeiro.");
  }
}
