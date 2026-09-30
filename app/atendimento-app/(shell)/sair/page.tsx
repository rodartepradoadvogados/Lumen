import Link from "next/link";
import { TituloDeTela } from "@/components/atendimento-app/ui";
import VoltarParaMais from "@/components/atendimento-app/VoltarParaMais";
import { logout } from "@/lib/actions/auth";
import FormularioDeSair from "@/components/atendimento-app/FormularioDeSair";
import { PWA_APPS } from "@/lib/pwaApps";

export const dynamic = "force-dynamic";

// O link "Sair do Atendimento" (app/atendimento-app/(shell)/mais/page.tsx) apontava para uma rota
// que não existia — caía em [id] e virava 404. Esta página confirma e encerra a sessão voltando
// para a tela de entrada do PRÓPRIO app (dentro do escopo), não para a homepage.
export default function SairAtendimentoPage() {
  return (
    <div className="animate-fade-in pb-4">
      <VoltarParaMais />
      <TituloDeTela titulo="Sair" />
      <div className="mx-4 mt-2 space-y-4 rounded-atd-balao bg-atd-pilula p-5 text-center">
        <p className="text-app-nome font-semibold text-tx">Encerrar a sessão neste dispositivo?</p>
        <FormularioDeSair action={logout.bind(null, PWA_APPS.atendimento.entrar)} />
        <Link href="/atendimento-app/mais" className="inline-flex min-h-11 items-center rounded-atd-pilula px-4 text-corpo font-semibold text-atd-texto-ouro hover:bg-atd-linha-hover">
          Cancelar
        </Link>
      </div>
    </div>
  );
}
