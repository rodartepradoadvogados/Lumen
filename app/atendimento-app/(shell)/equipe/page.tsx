import Link from "next/link";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { prisma } from "@/lib/prisma";
import { Avatar, Selinho, TituloDeTela } from "@/components/atendimento-app/ui";
import VoltarParaMais from "@/components/atendimento-app/VoltarParaMais";

export const dynamic = "force-dynamic";

export default async function EquipeAppPage() {
  const viewer = await exigirAcessoAoAtendimentoNaTela();

  const users = await prisma.user.findMany({
    where: { officeId: viewer.officeId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="animate-fade-in pb-4">
      <VoltarParaMais />
      <TituloDeTela titulo="Equipe" />

      <ul className="mx-4 mt-2 rounded-atd-balao bg-atd-pilula p-1.5">
        {users.map((u) => (
          <li key={u.id}>
            <Link href={`/perfil?id=${u.id}`} className="flex min-h-14 items-center gap-3.5 rounded-atd-balao px-3 py-2 hover:bg-atd-linha-hover">
              <Avatar nome={u.name} tamanho="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-app-nome font-semibold text-tx">{u.name}</span>
                <span className="block truncate text-app-previa text-atd-previa">{u.email}</span>
              </span>
              {u.isAdmin && <Selinho tom="fase">Admin</Selinho>}
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-center text-app-meta text-atd-terciario">Lúmen Atendimento — Equipe do escritório</p>
    </div>
  );
}
