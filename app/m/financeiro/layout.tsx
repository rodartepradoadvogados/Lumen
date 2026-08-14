import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import { EmptyState } from "@/components/ui";
import ModuleDisabledNotice from "@/components/ModuleDisabledNotice";
import { ShieldAlert } from "lucide-react";

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
    return (
      <div className="p-4 max-w-[600px] mx-auto animate-fade-in">
        <div className="bg-sf rounded-xl border border-regua shadow-card p-8 text-center">
          <ShieldAlert size={28} className="mx-auto text-tx-3 mb-3" />
          <EmptyState title="Acesso restrito" subtitle="Você não tem acesso ao módulo Financeiro. Fale com um administrador." />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
