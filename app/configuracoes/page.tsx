import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardHeader, Badge } from "@/components/ui";
import { createUser, createKanbanColumn, createFinancialCategory } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const [users, columns, categories] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.kanbanColumn.findMany({ orderBy: { order: "asc" } }),
    prisma.financialCategory.findMany({ orderBy: { name: "asc" } }),
  ]);

  async function submitUser(formData: FormData) {
    "use server";
    await createUser({
      name: String(formData.get("name")),
      email: String(formData.get("email")),
      role: String(formData.get("role")),
      oab: String(formData.get("oab") || ""),
      color: String(formData.get("color") || "#0f1f3d"),
    });
  }

  async function submitColumn(formData: FormData) {
    "use server";
    await createKanbanColumn({ name: String(formData.get("name")), color: String(formData.get("color") || "#94a3b8") });
  }

  async function submitCategory(formData: FormData) {
    "use server";
    await createFinancialCategory({ name: String(formData.get("name")), kind: String(formData.get("kind")) });
  }

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <PageHeader title="Configurações" subtitle="Equipe, identidade visual, colunas do Kanban e categorias financeiras" />

      <Card>
        <CardHeader title="Identidade Visual" subtitle="Paleta oficial do escritório" />
        <div className="p-5 flex gap-4 flex-wrap">
          <Swatch color="#0b1730" label="Navy 900" />
          <Swatch color="#152a52" label="Navy 700" />
          <Swatch color="#b8904f" label="Gold 600" />
          <Swatch color="#c6a05c" label="Gold 500" />
          <Swatch color="#f3efe6" label="Fundo (Creme)" border />
        </div>
      </Card>

      <Card>
        <CardHeader title="Equipe" subtitle={`${users.length} membro(s)`} />
        <div className="divide-y divide-navy-800/5">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-5 py-3">
              <span className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: u.color }}>
                {u.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-navy-900">{u.name}</p>
                <p className="text-xs text-navy-800/45">
                  {u.role} {u.oab && `· ${u.oab}`} · {u.email}
                </p>
              </div>
              <Badge color={u.active ? "green" : "slate"}>{u.active ? "Ativo" : "Inativo"}</Badge>
            </div>
          ))}
        </div>
        <form action={submitUser} className="p-5 grid grid-cols-1 sm:grid-cols-5 gap-2 border-t border-navy-800/8">
          <input name="name" required placeholder="Nome" className="cfg-input sm:col-span-2" />
          <input name="email" type="email" required placeholder="E-mail" className="cfg-input sm:col-span-2" />
          <select name="role" className="cfg-input">
            <option value="Advogado">Advogado</option>
            <option value="Sócio">Sócio</option>
            <option value="Estagiário">Estagiário</option>
            <option value="Financeiro">Financeiro</option>
          </select>
          <input name="oab" placeholder="OAB (opcional)" className="cfg-input" />
          <input name="color" type="color" defaultValue="#0f1f3d" className="cfg-input h-9 p-1" />
          <button type="submit" className="sm:col-span-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-3">
            Adicionar membro
          </button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Colunas do Kanban" subtitle="Personalize as etapas do fluxo de trabalho" />
        <div className="divide-y divide-navy-800/5">
          {columns.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
              <p className="text-sm text-navy-900 flex-1">{c.name}</p>
              {c.isDoneCol && <Badge color="green">Coluna de conclusão</Badge>}
            </div>
          ))}
        </div>
        <form action={submitColumn} className="p-5 flex gap-2 border-t border-navy-800/8">
          <input name="name" required placeholder="Nome da nova coluna" className="cfg-input flex-1" />
          <input name="color" type="color" defaultValue="#94a3b8" className="cfg-input h-9 w-16 p-1" />
          <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4">
            Adicionar
          </button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Categorias Financeiras" />
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-x divide-navy-800/5">
          <div className="divide-y divide-navy-800/5">
            <p className="px-5 py-2 text-xs font-semibold text-emerald-700 uppercase">Receitas</p>
            {categories.filter((c) => c.kind === "RECEITA").map((c) => (
              <p key={c.id} className="px-5 py-2 text-sm text-navy-800">{c.name}</p>
            ))}
          </div>
          <div className="divide-y divide-navy-800/5">
            <p className="px-5 py-2 text-xs font-semibold text-red-600 uppercase">Despesas</p>
            {categories.filter((c) => c.kind === "DESPESA").map((c) => (
              <p key={c.id} className="px-5 py-2 text-sm text-navy-800">{c.name}</p>
            ))}
          </div>
        </div>
        <form action={submitCategory} className="p-5 flex gap-2 border-t border-navy-800/8">
          <input name="name" required placeholder="Nome da categoria" className="cfg-input flex-1" />
          <select name="kind" className="cfg-input">
            <option value="RECEITA">Receita</option>
            <option value="DESPESA">Despesa</option>
          </select>
          <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4">
            Adicionar
          </button>
        </form>
      </Card>

      <style>{`
        .cfg-input { border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .cfg-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </div>
  );
}

function Swatch({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <div className="text-center">
      <div className={`h-14 w-14 rounded-lg ${border ? "border border-navy-800/15" : ""}`} style={{ backgroundColor: color }} />
      <p className="text-[11px] text-navy-800/50 mt-1">{label}</p>
      <p className="text-[10px] text-navy-800/35">{color}</p>
    </div>
  );
}
