import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui";

// Mesmo texto/visual que app/(app)/financeiro/layout.tsx já usava inline para "sem
// isAdmin/financeAccess" — extraído para reuso em app/m/financeiro/layout.tsx e nas páginas de
// lançamento dentro de um processo (despesa/honorários), que antes usavam notFound() para o
// mesmo cenário de permissão (achado A49 da revisão gauntlet: notFound() é para "não existe",
// não para "sem acesso").
export default function AccessRestrictedNotice({ moduleName }: { moduleName?: string }) {
  return (
    <div className="p-6 max-w-[600px] mx-auto animate-fade-in">
      <div className="bg-sf rounded-xl border border-regua shadow-card p-10 text-center">
        <ShieldAlert size={32} className="mx-auto text-tx-3 mb-3" />
        <EmptyState
          title="Acesso restrito"
          subtitle={`Você não tem acesso${moduleName ? ` ao módulo ${moduleName}` : " a esta área"}. Fale com um administrador.`}
        />
      </div>
    </div>
  );
}
