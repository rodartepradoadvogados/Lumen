import { getCurrentUser } from "@/lib/currentUser";
import { EmptyState } from "@/components/ui";
import { ShieldAlert } from "lucide-react";

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user?.isAdmin && !user?.financeAccess) {
    return (
      <div className="p-6 max-w-[600px] mx-auto animate-fade-in">
        <div className="bg-white rounded-xl border border-navy-800/8 shadow-card p-10 text-center">
          <ShieldAlert size={32} className="mx-auto text-navy-800/30 mb-3" />
          <EmptyState title="Acesso restrito" subtitle="Você não tem acesso ao módulo Financeiro. Fale com Jairo ou Rodrigo." />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
