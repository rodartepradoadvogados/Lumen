import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui";

export default function ModuleDisabledNotice({ moduleName }: { moduleName: string }) {
  return (
    <div className="p-6 max-w-[600px] mx-auto animate-fade-in">
      <div className="bg-white dark:bg-navy-900 rounded-xl border border-navy-800/8 dark:border-white/10 shadow-card p-10 text-center">
        <ShieldAlert size={32} className="mx-auto text-navy-800/30 dark:text-cream-50/30 mb-3" />
        <EmptyState
          title="Módulo não disponível"
          subtitle={`O módulo ${moduleName} não está incluído no plano deste escritório. Fale com um administrador para contratá-lo.`}
        />
      </div>
    </div>
  );
}
