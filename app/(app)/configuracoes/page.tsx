import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, CardHeader, Badge } from "@/components/ui";
import {
  createKanbanColumn,
  deleteKanbanColumn,
  createFinancialCategory,
  deleteFinancialCategory,
  createCostCenter,
  deleteCostCenter,
} from "@/lib/actions/settings";
import DeleteButton from "@/components/DeleteButton";
import UserRow from "@/components/UserRow";
import AddUserForm from "@/components/AddUserForm";
import TimbradoForm from "@/components/TimbradoForm";
import NomeacaoDriveForm from "@/components/NomeacaoDriveForm";
import DocumentTemplatesManager from "@/components/DocumentTemplatesManager";
import ImportManualModal from "@/components/ImportManualModal";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import TaskTypePointsManager from "@/components/TaskTypePointsManager";
import WorkflowsManager from "@/components/WorkflowsManager";
import BlogReviewManager from "@/components/BlogReviewManager";
import BlogPublishedManager from "@/components/BlogPublishedManager";
import PhotoLibraryManager from "@/components/PhotoLibraryManager";
import BlockedProcessNumbersManager from "@/components/BlockedProcessNumbersManager";
import BankAccountsManager from "@/components/BankAccountsManager";
import HolidaysManager from "@/components/HolidaysManager";
import InstallAppButton from "@/components/InstallAppButton";
import { Upload, Users, DollarSign, SlidersHorizontal, Workflow, Newspaper, ShieldCheck, CreditCard, Download, Bell } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";
import { getDriveStatus } from "@/lib/googleDrive";
import { getOfficeModules, hasBlogAccess } from "@/lib/officeModules";
import ModulesManager from "@/components/ModulesManager";
import { getOwnOfficeBilling } from "@/lib/actions/subscriptionBilling";
import OfficeBillingSummary from "@/components/OfficeBillingSummary";
import { PASTA_MAE_PADRAO, PREFIXO_PADRAO } from "@/lib/driveNaming";

export const dynamic = "force-dynamic";

type Cat = {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
};

// Botão secundário (DESIGN-SYSTEM.md §4): usado em ações de navegação/consulta que não são a
// ação primária do cartão.
const SECONDARY_BTN =
  "inline-flex items-center gap-2 h-8 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx text-sm font-semibold px-4 w-fit transition-colors";

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
          <div className="flex items-center gap-2 px-5 py-2 hover:bg-sf-apoio" style={{ paddingLeft: `${20 + depth * 20}px` }}>
            <span className="text-[11px] text-tx-3 w-16 shrink-0 font-mono">{c.code}</span>
            <span className="text-sm text-tx flex-1">{c.name}</span>
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

// A antiga aba "Modelos & Integrações" (requires: "admin-ou-suporte" — único motivo pelo qual o
// suporte da plataforma entrava em modo "atuar como", CONFIG_INTEGRACAO, ver
// lib/supportAccessConstants.ts) saiu daqui inteira (documento 04 do handoff do redesenho
// Modernist, PR13 do plano de execução): DJEN/Datajud/Asaas/BTG/Drive/OneDrive/Dropbox/e-mail/
// WhatsApp/API keys viraram a rota /conexoes (que já checa canConfigureIntegrations por conta
// própria); Modelos de Documento, Exportar Dados e Colunas do Kanban migraram para "Geral"
// abaixo; conexões PESSOAIS (Google/Outlook por pessoa) foram para /perfil. Todas as seções que
// sobram exigem isAdmin puro (ou "none" — Geral é visível a todo mundo).
const SECOES = [
  { key: "equipe", label: "Equipe", requires: "admin" },
  { key: "financeiro", label: "Financeiro", requires: "admin" },
  { key: "geral", label: "Geral", requires: "none" },
  { key: "workflows", label: "Workflows", requires: "admin" },
  { key: "blog", label: "Blog Jurídico", requires: "admin" },
  // Fase 3 (Asaas) — autoatendimento: qualquer admin do próprio escritório vê a PRÓPRIA
  // cobrança (ciclo, forma de pagamento, Pix/QR pendente, histórico de faturas). Nada aqui
  // exige ser platform owner — quem configura isso é o Painel Mestre (/painel-mestre/assinaturas).
  { key: "cobranca", label: "Cobrança", requires: "admin" },
] as const;

const SECAO_ICONS = {
  equipe: Users,
  financeiro: DollarSign,
  geral: SlidersHorizontal,
  workflows: Workflow,
  blog: Newspaper,
  cobranca: CreditCard,
} as const;

// Rótulo legível de cada provedor de armazenamento — usado no texto de "Pastas no
// armazenamento", que precisa dizer "no Google Drive"/"no Dropbox" em vez do valor cru do banco.
const STORAGE_LABELS: Record<string, string> = {
  GOOGLE_DRIVE: "Google Drive",
  ONEDRIVE: "OneDrive",
  DROPBOX: "Dropbox",
};

const TASK_TYPES_ORDER = ["TAREFA", "EVENTO", "AUDIENCIA", "PERICIA", "PRAZO"];
const ROLE_OPTIONS = ["Advogado", "Sócio", "Estagiário", "Financeiro", "Recepcionista", "Marketing", "Contador"];

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: { secao?: string; blogTab?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return null;
  }
  const officeId = viewer.officeId;

  const [
    users,
    columns,
    categories,
    costCenters,
    bankAccounts,
    holidaysRaw,
    driveStatus,
    documentTemplates,
    taskTypePoints,
    workflowTemplates,
    blogPendingRaw,
    blogPublishedRaw,
    photosRaw,
    modules,
    blogAccess,
    office,
    ownBilling,
    blockedProcessNumbersRaw,
  ] = await Promise.all([
      prisma.user.findMany({ where: { officeId }, orderBy: { createdAt: "asc" } }),
      prisma.kanbanColumn.findMany({ where: { officeId }, orderBy: { order: "asc" }, include: { _count: { select: { tasks: true } } } }),
      prisma.financialCategory.findMany({ where: { officeId } }),
      prisma.costCenter.findMany({ where: { officeId }, orderBy: { name: "asc" } }),
      prisma.bankAccount.findMany({ where: { officeId }, orderBy: { name: "asc" } }),
      // Feriados locais (Fase 4 — apuração do êxito) usados por lib/prazos.ts:addDiasUteis no
      // cálculo do trânsito em julgado presumido; os nacionais não ficam aqui (calculados em
      // código, ver HolidaysManager).
      prisma.holiday.findMany({ where: { officeId }, orderBy: { date: "asc" } }),
      // Só para o driveConnected de DocumentTemplatesManager abaixo (Geral) — o resto do status
      // de conexão do Drive (contas, reconectar) vive em /conexoes desde o PR13.
      getDriveStatus(officeId),
      prisma.documentTemplate.findMany({ where: { officeId }, orderBy: { name: "asc" } }),
      prisma.taskTypePoints.findMany({ where: { officeId } }),
      prisma.workflowTemplate.findMany({
        where: { officeId },
        orderBy: { createdAt: "asc" },
        include: { steps: { orderBy: { order: "asc" } } },
      }),
      prisma.blogPost.findMany({ where: { officeId, status: "AGUARDANDO_REVISAO" }, orderBy: { createdAt: "asc" } }),
      prisma.blogPost.findMany({ where: { officeId, status: "PUBLICADO" }, orderBy: { publishedAt: "desc" } }),
      prisma.photo.findMany({ where: { officeId }, orderBy: { createdAt: "desc" } }),
      getOfficeModules(officeId),
      hasBlogAccess(officeId),
      prisma.office.findUnique({ where: { id: officeId }, select: { storageProvider: true, timbradoUrl: true, timbradoNomeArquivo: true, timbradoFormato: true, drivePastaMae: true, drivePrefixo: true } }),
      getOwnOfficeBilling(),
      // Bloqueio é por usuário — cada advogado só vê (e só pode reverter) os próprios bloqueios.
      prisma.blockedProcessNumber.findMany({
        where: { userId: viewer.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
  const storageProvider = office?.storageProvider ?? "GOOGLE_DRIVE";
  const blockedProcessNumbers = blockedProcessNumbersRaw.map((b) => ({
    id: b.id,
    displayNumber: b.displayNumber,
    createdAt: b.createdAt.toISOString(),
  }));

  const holidays = holidaysRaw.map((h) => ({ id: h.id, date: h.date.toISOString().slice(0, 10), name: h.name, scope: h.scope }));

  const photos = photosRaw.map((p) => ({
    id: p.id,
    url: p.url,
    category: p.category,
    court: p.court,
    caption: p.caption,
    createdAt: p.createdAt.toISOString(),
  }));
  const isAdmin = viewer?.isAdmin ?? false;

  const taskTypePointsRows = TASK_TYPES_ORDER.map((type) => {
    const found = taskTypePoints.find((p) => p.type === type);
    return { type, points: found?.points ?? 10 };
  });

  const requestedSecao = searchParams.secao || "geral";
  const availableSecoes = SECOES.filter((s) => {
    const allowed = s.requires === "none" ? true : isAdmin;
    return allowed && (s.key !== "blog" || blogAccess);
  });
  const secao = availableSecoes.some((s) => s.key === requestedSecao) ? requestedSecao : "geral";

  const viewerInitials = viewer.name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  const allCategoriesForParentSelect = [...categories].sort(sortByCode);

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
    <div className="p-6 max-w-[1320px] mx-auto animate-fade-in space-y-6">
      <PageHeader
        title="Configurações"
        subtitle={isAdmin ? "Equipe, identidade visual, colunas do Kanban, plano de contas e importação" : "Importação de dados e sua senha"}
      />

      {isAdmin && (
        <div className="flex lg:hidden gap-2 flex-wrap">
          {availableSecoes.map((s) => (
            <Link
              key={s.key}
              href={`/configuracoes?secao=${s.key}`}
              className={`text-sm font-semibold px-4 py-2 transition-colors ${
                secao === s.key ? "bg-acao text-acao-tx" : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      )}

      <div className="flex gap-6 items-start">
      {/* O rail lateral é sempre grafite sólido nos dois temas (mesmo padrão do NavRail/casca —
          DESIGN-SYSTEM.md §3), então o texto aqui é propositalmente sempre claro, sem variante
          dark: própria. */}
      {isAdmin && (
        <aside className="hidden lg:block w-56 shrink-0 bg-grafite-800 overflow-hidden sticky top-6">
          <nav className="p-3 space-y-1">
            {availableSecoes.map((s) => {
              const Icon = SECAO_ICONS[s.key];
              const active = secao === s.key;
              return (
                <Link
                  key={s.key}
                  href={`/configuracoes?secao=${s.key}`}
                  className={`flex items-center gap-2.5 px-3 py-2.5 text-sm border-l-2 transition-colors ${
                    active
                      ? "bg-marca-bg text-white font-semibold border-marca"
                      : "text-white/70 font-medium border-transparent hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={16} className={active ? "text-marca" : "text-white/45"} />
                  {s.label}
                </Link>
              );
            })}
          </nav>
          <div className="px-4 py-4 border-t border-white/10 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-white/10 text-marca flex items-center justify-center text-xs font-bold shrink-0">
              {viewerInitials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{viewer.name}</p>
              <p className="text-[10px] text-white/50 truncate">{viewer.role}</p>
            </div>
          </div>
        </aside>
      )}

      <div className="flex-1 min-w-0 space-y-6">

      {isAdmin && secao === "geral" && (
      <Card>
        <CardHeader title="Módulos Contratados" subtitle="Contratação e cancelamento de módulo são feitos pela Lúmen, não aqui" />
        <ModulesManager modules={modules} />
      </Card>
      )}

      {secao === "geral" && (
      <Card>
        <CardHeader title="Importação de Dados" subtitle="Traga contatos, processos e agenda de uma planilha" />
        <div className="p-5 flex flex-wrap gap-3">
          <Link
            href="/configuracoes/importar"
            className="flex items-center gap-2 justify-center bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2.5 w-fit transition-colors"
          >
            <Upload size={16} /> Importar Contatos / Processos / Agenda
          </Link>
          <ImportManualModal />
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

      {/* Visível a QUALQUER pessoa do escritório, não só admin — é o ponto da transparência
          (ver especificação do Passo 2). Por isso fica na seção "geral" (requires: "none"), e
          não na navegação lateral (que só aparece pra admin — ver `isAdmin &&` no <aside> acima;
          quem só tem "geral" não precisa de nav pra trocar de aba, já está na única que existe). */}
      {secao === "geral" && (
      <Card>
        <CardHeader title="Acessos da Lúmen" subtitle="Veja quando e por quê o suporte da Lúmen acessou os dados do seu escritório" />
        <div className="p-5">
          <Link href="/configuracoes/acessos" className={SECONDARY_BTN}>
            <ShieldCheck size={16} /> Ver histórico de acessos
          </Link>
        </div>
      </Card>
      )}

      {/* Documento 07 (Fase 4 — Privacidade e LGPD): máscara padrão, revelação com motivo/prazo e
          pedido do titular — mesma visibilidade de transparência da "Acessos da Lúmen" acima. */}
      {secao === "geral" && (
      <Card>
        <CardHeader title="Privacidade e trilha" subtitle="Máscara de dado sensível, revelação com motivo e pedido do titular (LGPD)" />
        <div className="p-5">
          <Link href="/configuracoes/privacidade" className={SECONDARY_BTN}>
            <ShieldCheck size={16} /> Abrir privacidade e trilha
          </Link>
        </div>
      </Card>
      )}

      {/* Documento 06 (Fase 3 — Comunicados): pessoal (cada usuário define o próprio horário e
          exceções) — visível pra qualquer um, mesmo padrão de "Privacidade e trilha" acima. */}
      {secao === "geral" && (
      <Card>
        <CardHeader title="Comunicados" subtitle="Resumo diário no horário que você escolher, com exceção curta pro que não pode esperar" />
        <div className="p-5">
          <Link href="/configuracoes/comunicados" className={SECONDARY_BTN}>
            <Bell size={16} /> Configurar comunicados
          </Link>
        </div>
      </Card>
      )}

      {isAdmin && blogAccess && secao === "blog" && (() => {
        const blogTab =
          searchParams.blogTab === "publicadas" ? "publicadas" : searchParams.blogTab === "fotos" ? "fotos" : "revisao";
        return (
          <>
            <div className="flex gap-2 flex-wrap">
              <Link
                href="/configuracoes?secao=blog&blogTab=revisao"
                className={`text-xs font-semibold px-3.5 py-1.5 transition-colors ${
                  blogTab === "revisao"
                    ? "bg-acao text-acao-tx"
                    : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"
                }`}
              >
                Revisão Pendente {blogPendingRaw.length > 0 && `(${blogPendingRaw.length})`}
              </Link>
              <Link
                href="/configuracoes?secao=blog&blogTab=publicadas"
                className={`text-xs font-semibold px-3.5 py-1.5 transition-colors ${
                  blogTab === "publicadas"
                    ? "bg-acao text-acao-tx"
                    : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"
                }`}
              >
                Matérias Publicadas ({blogPublishedRaw.length})
              </Link>
              <Link
                href="/configuracoes?secao=blog&blogTab=fotos"
                className={`text-xs font-semibold px-3.5 py-1.5 transition-colors ${
                  blogTab === "fotos"
                    ? "bg-acao text-acao-tx"
                    : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"
                }`}
              >
                Fotos ({photos.length})
              </Link>
            </div>

            {blogTab === "revisao" ? (
              <Card>
                <CardHeader
                  title="Revisão de Publicação Definitiva"
                  subtitle="Rascunhos enviados pelo robô de conteúdo jurídico — revise, edite se necessário, adicione a imagem e confirme para publicar"
                />
                <BlogReviewManager
                  posts={blogPendingRaw.map((p) => ({
                    id: p.id,
                    slug: p.slug,
                    title: p.title,
                    area: p.area,
                    type: p.type,
                    summary: p.summary,
                    content: p.content,
                    sources: p.sources,
                    imageUrl: p.imageUrl,
                    createdAt: p.createdAt.toISOString(),
                  }))}
                  photos={photos}
                />
              </Card>
            ) : blogTab === "publicadas" ? (
              <Card>
                <CardHeader title="Matérias Publicadas" subtitle="Visíveis publicamente em /blog — sem necessidade de login" />
                <BlogPublishedManager
                  posts={blogPublishedRaw.map((p) => ({
                    id: p.id,
                    slug: p.slug,
                    title: p.title,
                    area: p.area,
                    type: p.type,
                    imageUrl: p.imageUrl,
                    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
                  }))}
                  photos={photos}
                />
              </Card>
            ) : (
              <Card>
                <CardHeader
                  title="Biblioteca de Fotos"
                  subtitle="Envie fotos categorizadas por área jurídica — usadas para ilustrar o blog e como fundo decorativo do sistema"
                />
                <PhotoLibraryManager photos={photos} />
              </Card>
            )}
          </>
        );
      })()}

      {/* Modelos de Documento, Exportar Dados e Colunas do Kanban vieram da extinta aba "Modelos
          & Integrações" (documento 04 do handoff do redesenho Modernist, PR13 do plano de
          execução) — o resto dela (Contas conectadas, Robôs de captura, Sincronizar publicações,
          Manutenção do Drive, Nomenclatura de processos) foi embutido em /conexoes (PR11) ou
          /perfil (conexões pessoais), então saiu daqui sem virar card novo em lugar nenhum. */}
      {isAdmin && secao === "geral" && (
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
          <CardHeader
            title="Exportar Dados do Escritório"
            subtitle="Planilha com todos os dados de negócio (usuários, clientes, processos, atendimentos, tarefas, financeiro, publicações, assessoria e anexos) do seu escritório — serve como cópia de segurança que pode ser gerada a qualquer momento"
          />
          <div className="p-5">
            <a
              href="/api/admin/export-office"
              className="inline-flex items-center gap-2 h-8 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 w-fit transition-colors"
            >
              <Download size={16} /> Exportar planilha (.xlsx)
            </a>
          </div>
        </Card>
      )}

      {isAdmin && secao === "geral" && (
      <Card>
        <CardHeader title="Colunas do Kanban" subtitle="Personalize as etapas do fluxo de trabalho" />
        <div className="divide-y divide-regua">
          {columns.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
              <p className="text-sm text-tx flex-1">{c.name}</p>
              {c.isDoneCol && <Badge color="green">Coluna de conclusão</Badge>}
              <span className="text-xs text-tx-3">{c._count.tasks} tarefa(s)</span>
              <DeleteButton
                id={c.id}
                confirmMessage={`Excluir a coluna "${c.name}"? Só é possível se não houver tarefas nela.`}
                action={deleteKanbanColumn}
              />
            </div>
          ))}
        </div>
        <form action={submitColumn} className="p-5 flex gap-2 border-t border-regua">
          <input name="name" required placeholder="Nome da nova coluna" className="cfg-input flex-1" />
          <input name="color" type="color" defaultValue="#94a3b8" className="cfg-input h-9 w-16 p-1" />
          <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 transition-colors">
            Adicionar
          </button>
        </form>
      </Card>
      )}

      {isAdmin && secao === "geral" && (
      <Card>
        <CardHeader
          title="TaskScore — Pontuação por Tipo de Tarefa"
          subtitle="Pontos atribuídos automaticamente a cada tarefa concluída, conforme o tipo. Alimenta o ranking da página Produtividade."
        />
        <TaskTypePointsManager items={taskTypePointsRows} />
      </Card>
      )}

      {secao === "geral" && (
      <Card>
        <CardHeader
          title="Processos Bloqueados"
          subtitle='Processos que você optou por deixar de acompanhar (botão "Bloquear" em Publicações/Andamentos, disponível só para processos ainda não cadastrados) — some só da sua fila, os demais advogados do escritório continuam recebendo normalmente, até você reverter o bloqueio aqui'
        />
        <BlockedProcessNumbersManager items={blockedProcessNumbers} />
      </Card>
      )}

      {secao === "geral" && (
      <Card>
        <CardHeader
          title="Aplicativo para computador"
          subtitle="Instala o Lúmen como um app próprio no Chrome/Edge — janela separada, ícone na barra de tarefas, sem a barra de endereço do navegador. Mesmo mecanismo do app instalável no celular."
        />
        <div className="p-5">
          <InstallAppButton />
        </div>
      </Card>
      )}

      {isAdmin && secao === "geral" && (
      <Card>
        <CardHeader title="Identidade Visual" subtitle="Paleta oficial do escritório — manual da marca v2" />
        {/* Cores lidas das variáveis CSS (app/globals.css), não cravadas aqui — por isso o
            swatch já troca sozinho de Manhã pra Noite junto com o resto da tela. */}
        <div className="p-5 flex gap-4 flex-wrap">
          <Swatch color="var(--grafite-800)" label="Grafite 800" />
          <Swatch color="var(--grafite-500)" label="Grafite 500" />
          <Swatch color="var(--marca)" label="Marca (Ouro)" />
          <Swatch color="var(--vinho)" label="Vinho" />
          <Swatch color="var(--sf-fundo)" label="Fundo" border />
        </div>
      </Card>
      )}

      {isAdmin && secao === "geral" && (
      <Card>
        <CardHeader
          title="Pastas no armazenamento"
          subtitle={`Como as pastas deste escritório se chamam no ${STORAGE_LABELS[storageProvider] ?? storageProvider} · vale para as pastas criadas daqui pra frente`}
        />
        <NomeacaoDriveForm
          pastaMae={office?.drivePastaMae ?? PASTA_MAE_PADRAO}
          prefixo={office?.drivePrefixo ?? PREFIXO_PADRAO}
          provedor={STORAGE_LABELS[storageProvider] ?? storageProvider}
        />
      </Card>
      )}

      {isAdmin && secao === "geral" && (
      <Card>
        <CardHeader
          title="Papel timbrado dos relatórios"
          subtitle="O relatório em Word é gerado dentro deste arquivo (ex.: Relatórios → Personalizado)"
        />
        <TimbradoForm
          timbradoUrl={office?.timbradoUrl ?? null}
          timbradoNomeArquivo={office?.timbradoNomeArquivo ?? null}
          timbradoFormato={office?.timbradoFormato ?? null}
        />
      </Card>
      )}

      {isAdmin && secao === "equipe" && (
      <Card>
        <CardHeader title="Equipe (usuários)" subtitle={`${users.length} membro(s) · edite telefone, defina credenciais de acesso e conceda/revogue acesso ao Financeiro`} />
        <div className="divide-y divide-regua">
          {users.map((u) => (
            <UserRow key={u.id} user={u} canManage={isAdmin} />
          ))}
        </div>
        <AddUserForm />
      </Card>
      )}


      {isAdmin && secao === "financeiro" && (
      <>
      <Card>
        <CardHeader title="Plano de Contas" subtitle="Grupos e subgrupos de receitas e despesas" />
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-x divide-regua">
          <div>
            <p className="px-5 py-2 text-xs font-semibold text-concluido uppercase">Receitas</p>
            {categories.filter((c) => c.kind === "RECEITA" && !c.parentId).sort(sortByCode).map((root) => (
              <CategoryTree key={root.id} categories={categories} parentId={root.id} depth={0} />
            ))}
          </div>
          <div>
            <p className="px-5 py-2 text-xs font-semibold text-urgente uppercase">Despesas</p>
            {categories.filter((c) => c.kind === "DESPESA" && !c.parentId).sort(sortByCode).map((root) => (
              <CategoryTree key={root.id} categories={categories} parentId={root.id} depth={0} />
            ))}
          </div>
        </div>
        <form action={submitCategory} className="p-5 flex gap-2 flex-wrap border-t border-regua">
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
          <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 transition-colors">
            Adicionar
          </button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Centros de Custo" />
        <div className="divide-y divide-regua">
          {costCenters.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
              <p className="text-sm text-tx flex-1">{c.name}</p>
              <DeleteButton
                id={c.id}
                confirmMessage={`Excluir o centro de custo "${c.name}"? Só é possível se não houver lançamentos vinculados.`}
                action={deleteCostCenter}
              />
            </div>
          ))}
        </div>
        <form action={submitCostCenter} className="p-5 flex gap-2 border-t border-regua">
          <input name="name" required placeholder="Nome do centro de custo" className="cfg-input flex-1" />
          <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 transition-colors">
            Adicionar
          </button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Contas Bancárias" subtitle="Usadas na baixa de Contas a Pagar/Receber e no Lançamento de Honorários" />
        <BankAccountsManager
          accounts={bankAccounts.map((b) => ({
            id: b.id,
            name: b.name,
            bank: b.bank,
            agency: b.agency,
            accountNumber: b.accountNumber,
            type: b.type,
            initialBalance: b.initialBalance,
            notes: b.notes,
            active: b.active,
          }))}
        />
      </Card>

      <Card>
        <CardHeader
          title="Feriados"
          subtitle="Feriados locais (estadual, municipal ou forense) usados no cálculo do trânsito em julgado presumido, na apuração do êxito"
        />
        <HolidaysManager holidays={holidays} />
      </Card>
      </>
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

      {isAdmin && secao === "cobranca" && (
      <Card>
        <CardHeader
          title="Cobrança"
          subtitle="Ciclo, forma de pagamento e faturas da mensalidade do Lúmen deste escritório"
        />
        <div className="p-5">
          <OfficeBillingSummary billing={ownBilling} />
        </div>
      </Card>
      )}

      </div>
      </div>

      <style>{`
        .cfg-input { border: 1px solid var(--regua-forte); border-radius: 0.3125rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; background: var(--sf-superficie); color: var(--tx); }
        .cfg-input:focus { outline: none; box-shadow: 0 0 0 2px var(--acao-bg); }
        .cfg-input::placeholder { color: var(--tx-3); }
      `}</style>
    </div>
  );
}

function Swatch({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <div className="text-center">
      <div className={`h-14 w-14 ${border ? "border border-regua-forte" : ""}`} style={{ backgroundColor: color }} />
      <p className="text-[11px] text-tx-3 mt-1">{label}</p>
    </div>
  );
}
