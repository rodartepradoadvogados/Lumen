import Link from "next/link";
import { LogOut } from "lucide-react";
import { Card } from "@/components/ui";
import { logout } from "@/lib/actions/auth";
import { PWA_APPS } from "@/lib/pwaApps";

export const dynamic = "force-dynamic";

// O link "Sair do Atendimento" (app/atendimento-app/(shell)/mais/page.tsx) apontava para uma rota
// que não existia — caía em [id] e virava 404. Esta página confirma e encerra a sessão voltando
// para a tela de entrada do PRÓPRIO app (dentro do escopo), não para a homepage.
export default function SairAtendimentoPage() {
  return (
    <div className="py-6 space-y-4">
      <Card className="p-5 space-y-4 text-center">
        <p className="font-medium text-tx">Encerrar a sessão neste dispositivo?</p>
        <form action={logout.bind(null, PWA_APPS.atendimento.entrar)}>
          <button type="submit" className="w-full h-11 flex items-center justify-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx font-extrabold text-sm">
            <LogOut size={16} /> Sair
          </button>
        </form>
        <Link href="/atendimento-app/mais" className="inline-block text-xs font-semibold text-tx-2 underline underline-offset-2">Cancelar</Link>
      </Card>
    </div>
  );
}
