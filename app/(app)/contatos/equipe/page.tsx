import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import UserRow from "@/components/UserRow";
import { createUser } from "@/lib/actions/settings";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Esta página não tem estilo próprio para .cfg-input (essa classe só existe no <style> injetado
// por app/(app)/configuracoes/page.tsx) — os campos usam os tokens diretamente em vez de
// depender de CSS que pode não estar carregado.
const fieldCls = "border border-regua-forte px-3 py-2 text-sm bg-sf text-tx";

export default async function EquipePage() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  const users = await prisma.user.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } });
  const isAdmin = !!viewer.isAdmin;

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
      <Link href="/contatos" className="text-xs font-semibold text-tx-3 hover:text-tx">
        ← Contatos
      </Link>
      <PageHeader title="Equipe" subtitle={`${users.length} membro(s)`} />

      <Card>
        {users.length === 0 ? (
          <EmptyState title="Nenhum membro cadastrado" />
        ) : (
          <div className="divide-y divide-regua">
            {users.map((u) => (
              <UserRow key={u.id} user={u} canManage={isAdmin} />
            ))}
          </div>
        )}
        {isAdmin && (
          <form action={submitUser} className="p-5 grid grid-cols-1 sm:grid-cols-5 gap-2 border-t border-regua">
            <input name="name" required placeholder="Nome" className={`${fieldCls} sm:col-span-2`} />
            <input name="email" type="email" required placeholder="E-mail" className={`${fieldCls} sm:col-span-2`} />
            <select name="role" className={fieldCls}>
              <option value="Advogado">Advogado</option>
              <option value="Sócio">Sócio</option>
              <option value="Estagiário">Estagiário</option>
              <option value="Financeiro">Financeiro</option>
              <option value="Recepcionista">Recepcionista</option>
              <option value="Marketing">Marketing</option>
              <option value="Contador">Contador</option>
            </select>
            <input name="oab" placeholder="OAB (opcional)" className={fieldCls} />
            <input name="color" type="color" defaultValue="#0f1f3d" className={`${fieldCls} h-9 p-1`} />
            <button type="submit" className="sm:col-span-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-3 transition-colors">
              Adicionar membro
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
