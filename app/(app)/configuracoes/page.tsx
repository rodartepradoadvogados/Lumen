import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardHeader, Badge } from "@/components/ui";
import {
  createUser,
  deleteUser,
  createKanbanColumn,
  deleteKanbanColumn,
  createFinancialCategory,
  deleteFinancialCategory,
  createCostCenter,
  deleteCostCenter,
} from "@/lib/actions/settings";
import DeleteButton from "@/components/DeleteButton";
import TestEmailButton from "@/components/TestEmailButton";
import { Upload } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

type Cat = {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
};

function sortByCode(a: { code: string }, b: { code: string }) {
  const pa = a.code.split(".").map(Number);
  const pb = b.code.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function CategoryTree({ categories, parentId, depth = 0 }: { categories: Cat[]; parentId: string | null; depth?: number }) {
  const children = categories.filter((c) => c.parentId === parentId).sort(sortByCode);
  if (children.length === 0) return null;
  return (
    <>
      {children.map((c) => (
        <div key={c.id}>
          <div className="flex items-center gap-2 px-5 py-2 hover:bg-cream-50" style={{ paddingLeft: `${20 + depth * 20}px` }}>
            <span className="text-[11px] text-navy-800/35 w-16 shrink-0 font-mono">{c.code}</span>
            <span className="text-sm text-navy-800 flex-1">{c.name}</span>
            <DeleteButton
              id={c.id}
              confirmMessage={`Excluir a categoria "${c.name}"? Só é possível se não houver subcategorias ou lançamentos vinculados.`}
              action={deleteFinancialCategory}
            />
          </div>
          <CategoryTree categories={categories} parentId={c.id} depth={depth + 1} />
        </div>
      ))}
    </>
  );
}

export default async function ConfiguracoesPage() {
  const [viewer, users, columns, categories, costCenters] = await Promise.all([
    getCurrentUser(),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.kanbanColumn.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { tasks: true } } } }),
    prisma.financialCategory.findMany(),
    prisma.costCenter.findMany({ orderBy: { name: "asc" } }),
  ]);
  const isAdmin = viewer?.isAdmin ?? false;

  const allCategoriesForParentSelect = [...categories].sort(sortByCode);

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
    await createFinancialCategory({
      name: String(formData.get("name")),
      kind: String(formData.get("kind")),
      parentId: String(formData.get("parentId") || "") || undefined,
    });
  }

  async function submitCostCenter(formData: FormData) {
    "use server";
    await createCostCenter({ name: String(formData.get("name")), notes: String(formData.get("notes") || "") });
  }

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <PageHeader title="Configurações" subtitle="Equipe, identidade visual, colunas do Kanban, plano de contas e importação" />

      <Card>
        <CardHeader title="E-mail Diário da Agenda" subtitle="Envio automático todos os dias às 5h (Brasília) para jairo@ e rodrigo@rodarteprado.com.br" />
        <div className="p-5">
          <TestEmailButton />
        </div>
      </Card>

      <Card>
        <CardHeader title="Importação de Dados" subtitle="Traga contatos, processos e agenda de uma planilha" />
        <div className="p-5">
          <Link
            href="/configuracoes/importar"
            className="flex items-center gap-2 justify-center bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit"
          >
            <Upload size={16} /> Importar Contatos / Processos / Agenda
          </Link>
        </div>
      </Card>

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
                  {u.username && ` · login: ${u.username}`}
                </p>
              </div>
              <Badge color={u.active ? "green" : "slate"}>{u.active ? "Ativo" : "Inativo"}</Badge>
              {u.isAdmin && <Badge color="gold">Admin</Badge>}
              {isAdmin && !u.isAdmin && u.active && (
                <DeleteButton
                  id={u.id}
                  confirmMessage={`Remover "${u.name}" da equipe? Ele(a) perderá o acesso ao sistema.`}
                  action={deleteUser}
                />
              )}
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
              <span className="text-xs text-navy-800/35">{c._count.tasks} tarefa(s)</span>
              <DeleteButton
                id={c.id}
                confirmMessage={`Excluir a coluna "${c.name}"? Só é possível se não houver tarefas nela.`}
                action={deleteKanbanColumn}
              />
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

      {isAdmin && (
      <>
      <Card>
        <CardHeader title="Plano de Contas" subtitle="Grupos e subgrupos de receitas e despesas" />
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-x divide-navy-800/5">
          <div>
            <p className="px-5 py-2 text-xs font-semibold text-emerald-700 uppercase">Receitas</p>
            {categories.filter((c) => c.kind === "RECEITA" && !c.parentId).sort(sortByCode).map((root) => (
              <CategoryTree key={root.id} categories={categories} parentId={root.id} depth={0} />
            ))}
          </div>
          <div>
            <p className="px-5 py-2 text-xs font-semibold text-red-600 uppercase">Despesas</p>
            {categories.filter((c) => c.kind === "DESPESA" && !c.parentId).sort(sortByCode).map((root) => (
              <CategoryTree key={root.id} categories={categories} parentId={root.id} depth={0} />
            ))}
          </div>
        </div>
        <form action={submitCategory} className="p-5 flex gap-2 flex-wrap border-t border-navy-800/8">
          <input name="name" required placeholder="Nome da nova categoria/conta" className="cfg-input flex-1 min-w-[180px]" />
          <select name="kind" className="cfg-input">
            <option value="RECEITA">Receita</option>
            <option value="DESPESA">Despesa</option>
          </select>
          <select name="parentId" className="cfg-input min-w-[200px]">
            <option value="">Nível raiz (novo grupo)</option>
            {allCategoriesForParentSelect.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4">
            Adicionar
          </button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Centros de Custo" />
        <div className="divide-y divide-navy-800/5">
          {costCenters.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
              <p className="text-sm text-navy-900 flex-1">{c.name}</p>
              <DeleteButton
                id={c.id}
                confirmMessage={`Excluir o centro de custo "${c.name}"? Só é possível se não houver lançamentos vinculados.`}
                action={deleteCostCenter}
              />
            </div>
          ))}
        </div>
        <form action={submitCostCenter} className="p-5 flex gap-2 border-t border-navy-800/8">
          <input name="name" required placeholder="Nome do centro de custo" className="cfg-input flex-1" />
          <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4">
            Adicionar
          </button>
        </form>
      </Card>
      </>
      )}

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
