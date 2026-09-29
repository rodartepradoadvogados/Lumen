import Link from "next/link";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { prisma } from "@/lib/prisma";
import { ArrowLeft, Users, Shield } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EquipeAppPage() {
  const viewer = await exigirAcessoAoAtendimentoNaTela();

  const users = await prisma.user.findMany({
    where: { officeId: viewer.officeId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/atendimento-app/mais" className="inline-flex min-h-11 items-center gap-1 text-corpo font-semibold text-tx-2">
        <ArrowLeft size={13} /> Mais
      </Link>

      <h1 className="text-xl font-bold text-tx">Equipe</h1>

      <div className="bg-sf-apoio border border-regua rounded-[2px] divide-y divide-regua">
        {users.map((u) => (
          <Link key={u.id} href={`/perfil?id=${u.id}`} className="flex items-center gap-3 p-3 hover:bg-sf transition-colors">
            <div className="h-10 w-10 rounded-full bg-ouro-bg flex items-center justify-center shrink-0">
              <Users size={18} className="text-ouro-acento" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-tx truncate">{u.name}</p>
              <p className="text-xs text-tx-2 truncate">{u.email}</p>
            </div>
            {u.isAdmin && (
              <Shield size={16} className="text-ouro-acento shrink-0" />
            )}
          </Link>
        ))}
      </div>

      <p className="text-xs text-tx-3 text-center mt-4">Lúmen Atendimento — Equipe do escritório</p>
    </div>
  );
}