import Link from "next/link";
import { Card } from "@/components/ui";
import MobileNewAttendanceForm from "@/components/mobile/MobileNewAttendanceForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default function MobileNewAttendancePage() {
  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link
        href="/m"
        className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Novo Atendimento</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">Registre um novo contato rapidamente</p>
      </div>

      <Card className="p-4">
        <MobileNewAttendanceForm />
      </Card>
    </div>
  );
}
