import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import ModuleDisabledNotice from "@/components/ModuleDisabledNotice";
import AccessRestrictedNotice from "@/components/AccessRestrictedNotice";

// Mesmo gate de app/(app)/financeiro/layout.tsx, que faltava aqui: só o hub (page.tsx)
// desenhava um aviso quando o módulo estava desligado ou faltava financeAccess — as 7 páginas
// dentro de /m/financeiro (despesas, receitas, dre, livro-caixa, fluxo-de-caixa, relatorios,
// contas-a-pagar, contas-a-receber) não herdavam nada disso: quem tivesse o link direto abria
// mesmo com o módulo cancelado ou sem acesso ao Financeiro.
export default async function MobileFinanceiroLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  const modules = await getOfficeModules(user.officeId);
  if (!modules.financeiro) {
    return <ModuleDisabledNotice moduleName="Financeiro" />;
  }

  if (!user.isAdmin && !user.financeAccess) {
    return <AccessRestrictedNotice moduleName="Financeiro" />;
  }

  return <>{children}</>;
}
