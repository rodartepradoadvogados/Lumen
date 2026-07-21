import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import UserRow from "@/components/UserRow";
import { createUser } from "@/lib/actions/settings";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

export default async function EquipePage() {
  const [viewer, users] = await Promise.all([getCurrentUser(), prisma.user.findMany({ orderBy: { name: "asc" } })]);
  const isAdmin = !!viewer?.isAdmin;

  async function submitUser(formData: FormData) {
    "use server";
    const result = await createUser({
      name: String(formData.get("name")),
      email: String(formData.get("email")),
      role: String(formData.get("role")),
      oab: String(formData.get("oab") || ""),
      color: String(formData.get("color") || "#0f1f3d"),
    });
    if (result?.error) {
      console.error(result.error);
    }
  }

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in">
      <Link href="/contatos" className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50">
        ← Contatos
      </Link>
      <PageHeader title="Equipe" subtitle={`${users.length} membro(s)`} />

      <Card>
        {users.length === 0 ? (
          <EmptyState title="Nenhum membro cadastrado" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {users.map((u) => (
              <UserRow key={u.id} user={u} canManage={isAdmin} />
            ))}
          </div>
        )}
        {isAdmin && (
          <form action={submitUser} className="p-5 grid grid-cols-1 sm:grid-cols-5 gap-2 border-t border-navy-800/8 dark:border-white/10">
            <input name="name" required placeholder="Nome" className="cfg-input sm:col-span-2 dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
            <input name="email" type="email" required placeholder="E-mail" className="cfg-input sm:col-span-2 dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
            <select name="role" className="cfg-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50">
              <option value="Advogado">Advogado</option>
              <option value="Sócio">Sócio</option>
              <option value="Estagiário">Estagiário</option>
              <option value="Financeiro">Financeiro</option>
              <option value="Recepcionista">Recepcionista</option>
              <option value="Marketing">Marketing</option>
              <option value="Contador">Contador</option>
            </select>
            <input name="oab" placeholder="OAB (opcional)" className="cfg-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
            <input name="color" type="color" defaultValue="#0f1f3d" className="cfg-input h-9 p-1 dark:bg-navy-800 dark:border-white/15" />
            <button type="submit" className="sm:col-span-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-3">
              Adicionar membro
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
