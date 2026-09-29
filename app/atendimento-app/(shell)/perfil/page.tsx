import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { ArrowLeft, User, Mail, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PerfilAppPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/atendimento-app/mais" className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2">
        <ArrowLeft size={13} /> Mais
      </Link>

      <h1 className="text-xl font-bold text-tx">Perfil</h1>

      <div className="bg-sf-apoio border border-regua rounded-[2px] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-ouro-bg flex items-center justify-center shrink-0">
            <User size={24} className="text-ouro-acento" />
          </div>
          <div>
            <p className="font-semibold text-tx">{viewer.name}</p>
            <p className="text-xs text-tx-2">{viewer.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-tx-2">
          <Mail size={14} /> {viewer.email}
        </div>
        <div className="pt-2 border-t border-regua">
          <Link href="/configuracoes/comunicados" className="inline-flex items-center gap-2 text-sm font-medium text-ouro-acento hover:underline">
            <Lock size={14} /> Configurar comunicados
          </Link>
        </div>
      </div>

      <p className="text-xs text-tx-3 text-center mt-4">Lúmen Atendimento — Perfil do usuário</p>
    </div>
  );
}