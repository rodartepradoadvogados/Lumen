import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardHeader, Badge } from "@/components/ui";
import {
  createUser,
  createKanbanColumn,
  deleteKanbanColumn,
  createFinancialCategory,
  deleteFinancialCategory,
  createCostCenter,
  deleteCostCenter,
} from "@/lib/actions/settings";
import DeleteButton from "@/components/DeleteButton";
import UserRow from "@/components/UserRow";
import TestEmailButton from "@/components/TestEmailButton";
import DocumentTemplatesManager from "@/components/DocumentTemplatesManager";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import TestDjenButton from "@/components/TestDjenButton";
import TaskTypePointsManager from "@/components/TaskTypePointsManager";
import WorkflowsManager from "@/components/WorkflowsManager";
import { Upload, HardDrive, CheckCircle2, AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";
import { getDriveStatus, listGoogleAccounts } from "@/lib/googleDrive";

export const dynamic = "force-dynamic";

// E-mails que devem estar conectados para a captura de publicações do Jusbrasil
// (um por advogado do escritório). Usado só para exibir o checklist em
// Configurações — cada pessoa ainda precisa clicar em "Conectar meu e-mail" ela
// mesma (login do Google não pode ser feito por outra pessoa).
const JUSBRASIL_TARGET_EMAILS = ["rodartepradoadvogados@gmail.com", "jairodarte@gmail.com", "pradoadvogado@gmail.com"];

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

const SECOES = [
  { key: "geral", label: "Geral", adminOnly: false },
  { key: "equipe", label: "Equipe & Acesso", adminOnly: true },
  { key: "financeiro", label: "Financeiro", adminOnly: true },
  { key: "produtividade", label: "Produtividade", adminOnly: true },
  { key: "workflows", label: "Workflows", adminOnly: true },
  { key: "modelos", label: "Modelos & Integrações", adminOnly: true },
] as const;

const TASK_TYPES_ORDER = ["TAREFA", "EVENTO", "AUDIENCIA", "PERICIA", "PRAZO"];
const ROLE_OPTIONS = ["Advogado", "Sócio", "Estagiário", "Financeiro", "Recepcionista", "Marketing", "Contador"];

export default async function ConfiguracoesPage({ searchParams }: { searchParams: { google?: string; msg?: string; secao?: string } }) {
  const [viewer, users, columns, categories, costCenters, driveStatus, documentTemplates, taskTypePoints, workflowTemplates, googleAccounts] = await Promise.all([
    getCurrentUser(),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.kanbanColumn.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { tasks: true } } } }),
    prisma.financialCategory.findMany(),
    prisma.costCenter.findMany({ orderBy: { name: "asc" } }),
    getDriveStatus(),
    prisma.documentTemplate.findMany({ orderBy: { name: "asc" } }),
    prisma.taskTypePoints.findMany(),
    prisma.workflowTemplate.findMany({
      orderBy: { createdAt: "asc" },
      include: { steps: { orderBy: { order: "asc" } } },
    }),
    listGoogleAccounts(),
  ]);
  const isAdmin = viewer?.isAdmin ?? false;

  const taskTypePointsRows = TASK_TYPES_ORDER.map((type) => {
    const found = taskTypePoints.find((p) => p.type === type);
    return { type, points: found?.points ?? 10 };
  });

  // Se houver retorno da conexão do Google Drive, o card fica na aba "Modelos & Integrações"
  const defaultSecao = searchParams.google ? "modelos" : "geral";
  const requestedSecao = searchParams.secao || defaultSecao;
  const availableSecoes = SECOES.filter((s) => !s.adminOnly || isAdmin);
  const secao = availableSecoes.some((s) => s.key === requestedSecao) ? requestedSecao : "geral";

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
      <PageHeader
        title="Configurações"
        subtitle={isAdmin ? "Equipe, identidade visual, colunas do Kanban, plano de contas e importação" : "Importação de dados e sua senha"}
      />

      {isAdmin && (
        <div className="flex gap-2 flex-wrap">
          {availableSecoes.map((s) => (
            <Link
              key={s.key}
              href={`/configuracoes?secao=${s.key}`}
              className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
                secao === s.key ? "bg-navy-900 text-white" : "bg-white text-navy-800/60 border border-navy-800/10 hover:bg-cream-100"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      )}

      {secao === "geral" && (
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
      )}

      {secao === "geral" && (
      <Card>
        <CardHeader title="Alterar Senha" subtitle="Sua senha de acesso ao sistema" />
        <div className="p-5">
          <ChangePasswordForm />
        </div>
      </Card>
      )}

      {isAdmin && secao === "geral" && (
      <Card>
        <CardHeader title="E-mail Diário da Agenda" subtitle="Envio automático todos os dias às 5h (Brasília) para jairo@ e rodrigo@rodarteprado.com.br" />
        <div className="p-5">
          <TestEmailButton />
        </div>
      </Card>
      )}

      {secao === "geral" && viewer && (() => {
        const minhaConexao = googleAccounts.find((a) => a.userId === viewer.id);
        return (
          <Card>
            <CardHeader
              title="Minha sincronização do Jusbrasil"
              subtitle="Conecte seu próprio e-mail para que as publicações que chegam nele sejam capturadas automaticamente"
            />
            <div className="p-5 space-y-3">
              {minhaConexao ? (
                <div className="flex items-center gap-2 text-sm text-navy-900">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  Conectado como <strong>{minhaConexao.accountEmail}</strong>
                </div>
              ) : (
                <p className="text-sm text-navy-800/60">Você ainda não conectou nenhum e-mail para o Jusbrasil.</p>
              )}
              <a
                href="/api/google/connect?mode=jusbrasil"
                className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit"
              >
                <HardDrive size={16} /> {minhaConexao ? "Reconectar" : "Conectar"} meu e-mail
              </a>
            </div>
          </Card>
        );
      })()}

      {isAdmin && secao === "modelos" && (
        <Card>
          <CardHeader
            title="Integração com Google (Drive + Gmail)"
            subtitle="Necessária para anexar documentos e para sincronizar as publicações/andamentos que chegam por e-mail da Jusbrasil"
          />
          <div className="p-5 space-y-3">
            {searchParams.google === "conectado" && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">Google conectado com sucesso!</p>
            )}
            {searchParams.google === "erro" && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Erro ao conectar: {searchParams.msg || "tente novamente."}
              </p>
            )}
            {driveStatus.connected ? (
              <div className="flex items-center gap-2 text-sm text-navy-900">
                <CheckCircle2 size={16} className="text-emerald-600" />
                Conectado como <strong>{driveStatus.accountEmail}</strong>
              </div>
            ) : (
              <p className="text-sm text-navy-800/60">Nenhuma conta conectada ainda.</p>
            )}
            <a
              href="/api/google/connect"
              className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit"
            >
              <HardDrive size={16} /> {driveStatus.connected ? "Reconectar" : "Conectar"} Google
            </a>
            {driveStatus.connected && (
              <p className="text-[11px] text-navy-800/45">
                Se a conexão foi feita antes desta atualização, clique em &ldquo;Reconectar&rdquo; para autorizar também o acesso de leitura ao Gmail (necessário para o Jusbrasil).
              </p>
            )}
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && (
        <Card>
          <CardHeader
            title="Contas conectadas para o Jusbrasil"
            subtitle="Cada advogado conecta o próprio e-mail em Configurações → Geral; publicações de todas as contas abaixo são capturadas"
          />
          <div className="p-5 space-y-2">
            {JUSBRASIL_TARGET_EMAILS.map((email) => {
              const found = googleAccounts.find((a) => a.accountEmail === email);
              return (
                <div key={email} className="flex items-center gap-2 text-sm">
                  {found ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                  )}
                  <span className={found ? "text-navy-900" : "text-navy-800/50"}>
                    {email}
                    {found?.ownerName && <span className="text-navy-800/45"> — {found.ownerName}</span>}
                    {!found && " (ainda não conectado)"}
                  </span>
                </div>
              );
            })}
            {googleAccounts.filter((a) => !JUSBRASIL_TARGET_EMAILS.includes(a.accountEmail)).map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span className="text-navy-900">
                  {a.accountEmail}
                  {a.ownerName && <span className="text-navy-800/45"> — {a.ownerName}</span>}
                  {a.isPrimaryDrive && <span className="text-navy-800/45"> (conta principal do Drive)</span>}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && (
        <Card>
          <CardHeader
            title="DJEN — Diário de Justiça Eletrônico Nacional (CNJ)"
            subtitle="Fonte oficial e gratuita de intimações/citações por OAB — em avaliação como alternativa ao Jusbrasil por e-mail"
          />
          <div className="p-5 space-y-3">
            <p className="text-xs text-navy-800/60">
              As OABs consultadas são as cadastradas em <Link href="/configuracoes?secao=equipe" className="text-gold-700 font-semibold hover:underline">Equipe &amp; Acesso</Link> (campo OAB de cada pessoa ativa). Para acompanhar mais um advogado, cadastre a OAB dele lá.
            </p>
            <TestDjenButton />
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && (
        <Card>
          <CardHeader
            title="Modelos de Documento"
            subtitle="Contratos, procurações, declarações e petições — usados no botão “Gerar Documento” de cada processo/atendimento"
          />
          <div className="p-5">
            <DocumentTemplatesManager
              templates={documentTemplates.map((t) => ({ id: t.id, name: t.name, category: t.category, driveUrl: t.driveUrl }))}
              driveConnected={driveStatus.connected}
            />
          </div>
        </Card>
      )}

      {isAdmin && secao === "geral" && (
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
      )}

      {isAdmin && secao === "equipe" && (
      <Card>
        <CardHeader title="Sócios — Equipe e Controle de Acesso" subtitle={`${users.length} membro(s) · edite telefone, defina credenciais de acesso e conceda/revogue acesso ao Financeiro`} />
        <div className="divide-y divide-navy-800/5">
          {users.map((u) => (
            <UserRow key={u.id} user={u} canManage={isAdmin} />
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
            <option value="Recepcionista">Recepcionista</option>
            <option value="Marketing">Marketing</option>
            <option value="Contador">Contador</option>
          </select>
          <input name="oab" placeholder="OAB (opcional)" className="cfg-input" />
          <input name="color" type="color" defaultValue="#0f1f3d" className="cfg-input h-9 p-1" />
          <button type="submit" className="sm:col-span-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-3">
            Adicionar membro
          </button>
        </form>
      </Card>
      )}

      {isAdmin && secao === "modelos" && (
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
      )}

      {isAdmin && secao === "financeiro" && (
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

      {isAdmin && secao === "produtividade" && (
      <Card>
        <CardHeader
          title="TaskScore — Pontuação por Tipo de Tarefa"
          subtitle="Pontos atribuídos automaticamente a cada tarefa concluída, conforme o tipo. Alimenta o ranking da página Produtividade."
        />
        <TaskTypePointsManager items={taskTypePointsRows} />
      </Card>
      )}

      {isAdmin && secao === "workflows" && (
      <Card>
        <CardHeader
          title="Workflows"
          subtitle="Cadeias padronizadas de tarefas aplicadas manualmente a um processo (botão “Aplicar Workflow” na aba Atividades)"
        />
        <div className="p-5">
          <WorkflowsManager
            templates={workflowTemplates.map((t) => ({
              id: t.id,
              name: t.name,
              area: t.area,
              description: t.description,
              active: t.active,
              steps: t.steps.map((s) => ({
                id: s.id,
                order: s.order,
                title: s.title,
                taskType: s.taskType,
                offsetDays: s.offsetDays,
                priority: s.priority,
                role: s.role,
                points: s.points,
              })),
            }))}
            roles={ROLE_OPTIONS}
          />
        </div>
      </Card>
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
