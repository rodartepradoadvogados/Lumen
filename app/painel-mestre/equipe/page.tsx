import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";
import PlatformMemberRow from "@/components/painelMestre/PlatformMemberRow";
import NewPlatformMemberModal from "@/components/painelMestre/NewPlatformMemberModal";

export const dynamic = "force-dynamic";

export default async function EquipeLumenPage() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer) redirect("/");
  if (!viewer.isPlatformOwner) redirect("/painel");

  const [members, roles, eligibleUsers] = await Promise.all([
    prisma.platformMember.findMany({
      include: { user: { select: { name: true, email: true } }, role: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.platformRole.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { platformMember: null },
      select: { id: true, name: true, email: true, office: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const roleOptions = roles.map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl font-bold text-navy-900 dark:text-cream-50">Equipe Lúmen</h1>
          <p className="text-sm text-navy-800/55 dark:text-cream-50/55 mt-1">
            Quadro e papéis da empresa — preparação para o controle de acesso por sigilo, ainda não ativo
          </p>
        </div>
        <NewPlatformMemberModal eligibleUsers={eligibleUsers} roles={roleOptions} />
      </div>

      <LumenPanel>
        <LumenPanelHeader title="Membros" subtitle={`${members.length} membro(s) cadastrado(s)`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold text-cream-50/40 uppercase tracking-wide border-b border-white/10">
                <th className="px-5 py-2.5 font-semibold">Nome</th>
                <th className="px-3 py-2.5 font-semibold">E-mail</th>
                <th className="px-3 py-2.5 font-semibold">Papel</th>
                <th className="px-3 py-2.5 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {members.map((m) => (
                <PlatformMemberRow
                  key={m.id}
                  member={{
                    id: m.id,
                    name: m.user?.name ?? m.name ?? "—",
                    email: m.user?.email ?? m.email ?? "—",
                    roleId: m.roleId,
                    active: m.active,
                  }}
                  roles={roleOptions}
                />
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-cream-50/40 text-sm">
                    Nenhum membro cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LumenPanel>
    </div>
  );
}
