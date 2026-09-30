import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { Mail, Lock } from "lucide-react";
import { Avatar, TituloDeTela } from "@/components/atendimento-app/ui";
import VoltarParaMais from "@/components/atendimento-app/VoltarParaMais";

export const dynamic = "force-dynamic";

export default async function PerfilAppPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  return (
    <div className="animate-fade-in pb-4">
      <VoltarParaMais />
      <TituloDeTela titulo="Perfil" />

      <div className="mx-4 mt-2 space-y-4 rounded-atd-balao bg-atd-pilula p-4">
        <div className="flex items-center gap-4">
          <Avatar nome={viewer.name} tamanho="lg" />
          <div className="min-w-0">
            <p className="break-words text-destaque font-bold text-tx">{viewer.name}</p>
            <p className="text-app-previa text-atd-previa">{viewer.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 break-all text-app-previa text-atd-previa">
          <Mail size={16} aria-hidden="true" className="shrink-0" /> {viewer.email}
        </div>
        <Link href="/configuracoes/comunicados" className="inline-flex min-h-11 items-center gap-2 rounded-atd-pilula bg-atd-pilula-2 px-4 text-corpo font-semibold text-atd-texto-ouro hover:bg-atd-linha-hover">
          <Lock size={16} aria-hidden="true" /> Configurar comunicados
        </Link>
      </div>

      <p className="mt-6 text-center text-app-meta text-atd-terciario">Lúmen Atendimento — Perfil do usuário</p>
    </div>
  );
}
