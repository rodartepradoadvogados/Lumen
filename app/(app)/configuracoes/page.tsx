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
import ImportManualModal from "@/components/ImportManualModal";
import ChangePasswordForm from "@/components/ChangePasswordForm";
import TestDjenButton from "@/components/TestDjenButton";
import TaskTypePointsManager from "@/components/TaskTypePointsManager";
import WorkflowsManager from "@/components/WorkflowsManager";
import BlogReviewManager from "@/components/BlogReviewManager";
import BlogPublishedManager from "@/components/BlogPublishedManager";
import PhotoLibraryManager from "@/components/PhotoLibraryManager";
import ReorganizeAttachmentsButton from "@/components/ReorganizeAttachmentsButton";
import MigrarPastasLegadasButton from "@/components/MigrarPastasLegadasButton";
import WhatsappConfigForm from "@/components/WhatsappConfigForm";
import SyncPublicationsButton from "@/components/SyncPublicationsButton";
import EmailSendProviderPicker from "@/components/EmailSendProviderPicker";
import StorageProviderPicker from "@/components/StorageProviderPicker";
import { Upload, HardDrive, CheckCircle2, AlertTriangle, MessageCircle, Plug, Users, DollarSign, SlidersHorizontal, Workflow, Newspaper, ShieldCheck, CreditCard } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";
import { getDriveStatus, listGoogleAccounts } from "@/lib/googleDrive";
import { isMicrosoftConfigured, listMicrosoftAccounts } from "@/lib/microsoftGraph";
import { getOneDriveStatus } from "@/lib/oneDriveStorage";
import { isDropboxConfigured } from "@/lib/dropbox";
import { getDropboxStatus } from "@/lib/dropboxStorage";
import { getOfficeModules, hasBlogAccess } from "@/lib/officeModules";
import ModulesManager from "@/components/ModulesManager";
import { getOwnOfficeBilling } from "@/lib/actions/subscriptionBilling";
import OfficeBillingSummary from "@/components/OfficeBillingSummary";

export const dynamic = "force-dynamic";

type Cat = {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
};

// Formata "há Xh"/"há X dia(s)" a partir de um timestamp — usado nos cards de status do
// robô (DJEN/Datajud), pra mostrar quando foi a última execução sem precisar de libs extra.
function formatRelativeTime(date: Date): string {
  const minutos = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.round(horas / 24);
  return `há ${dias} dia(s)`;
}

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
          <div className="flex items-center gap-2 px-5 py-2 hover:bg-cream-50 dark:hover:bg-white/5" style={{ paddingLeft: `${20 + depth * 20}px` }}>
            <span className="text-[11px] text-navy-800/35 dark:text-cream-50/35 w-16 shrink-0 font-mono">{c.code}</span>
            <span className="text-sm text-navy-800 dark:text-cream-50 flex-1">{c.name}</span>
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
  { key: "modelos", label: "Modelos & Integrações", adminOnly: true },
  { key: "equipe", label: "Equipe", adminOnly: true },
  { key: "financeiro", label: "Financeiro", adminOnly: true },
  { key: "geral", label: "Geral", adminOnly: false },
  { key: "workflows", label: "Workflows", adminOnly: true },
  { key: "blog", label: "Blog Jurídico", adminOnly: true },
  // Fase 3 (Asaas) — autoatendimento: qualquer admin do próprio escritório vê a PRÓPRIA
  // cobrança (ciclo, forma de pagamento, Pix/QR pendente, histórico de faturas). Nada aqui
  // exige ser platform owner — quem configura isso é o Painel Mestre (/painel-mestre/assinaturas).
  { key: "cobranca", label: "Cobrança", adminOnly: true },
] as const;

const SECAO_ICONS = {
  modelos: Plug,
  equipe: Users,
  financeiro: DollarSign,
  geral: SlidersHorizontal,
  workflows: Workflow,
  blog: Newspaper,
  cobranca: CreditCard,
} as const;

const TASK_TYPES_ORDER = ["TAREFA", "EVENTO", "AUDIENCIA", "PERICIA", "PRAZO"];
const ROLE_OPTIONS = ["Advogado", "Sócio", "Estagiário", "Financeiro", "Recepcionista", "Marketing", "Contador"];

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: { google?: string; microsoft?: string; dropbox?: string; msg?: string; secao?: string; blogTab?: string };
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
    driveStatus,
    documentTemplates,
    taskTypePoints,
    workflowTemplates,
    googleAccounts,
    microsoftAccounts,
    blogPendingRaw,
    blogPublishedRaw,
    photosRaw,
    whatsappConfig,
    modules,
    blogAccess,
    roboExecucaoLogs,
    processosMonitoradosCount,
    office,
    oneDriveStatus,
    dropboxStatus,
    ownBilling,
  ] = await Promise.all([
      prisma.user.findMany({ where: { officeId }, orderBy: { createdAt: "asc" } }),
      prisma.kanbanColumn.findMany({ where: { officeId }, orderBy: { order: "asc" }, include: { _count: { select: { tasks: true } } } }),
      prisma.financialCategory.findMany({ where: { officeId } }),
      prisma.costCenter.findMany({ where: { officeId }, orderBy: { name: "asc" } }),
      getDriveStatus(officeId),
      prisma.documentTemplate.findMany({ where: { officeId }, orderBy: { name: "asc" } }),
      prisma.taskTypePoints.findMany({ where: { officeId } }),
      prisma.workflowTemplate.findMany({
        where: { officeId },
        orderBy: { createdAt: "asc" },
        include: { steps: { orderBy: { order: "asc" } } },
      }),
      listGoogleAccounts(officeId),
      listMicrosoftAccounts(officeId),
      prisma.blogPost.findMany({ where: { officeId, status: "AGUARDANDO_REVISAO" }, orderBy: { createdAt: "asc" } }),
      prisma.blogPost.findMany({ where: { officeId, status: "PUBLICADO" }, orderBy: { publishedAt: "desc" } }),
      prisma.photo.findMany({ where: { officeId }, orderBy: { createdAt: "desc" } }),
      prisma.whatsappConfig.findUnique({ where: { officeId } }),
      getOfficeModules(officeId),
      hasBlogAccess(officeId),
      // Tabelas globais espelhadas do robô Python (não têm officeId — ver TODO em
      // lib/roboBridge.ts). Usadas só pra mostrar o status real das últimas execuções.
      prisma.roboExecucaoLog.findMany({ orderBy: { executadoEm: "desc" }, take: 10 }),
      prisma.roboProcessoMonitorado.count(),
      prisma.office.findUnique({ where: { id: officeId }, select: { storageProvider: true } }),
      getOneDriveStatus(officeId),
      getDropboxStatus(officeId),
      getOwnOfficeBilling(),
    ]);
  const storageProvider = office?.storageProvider ?? "GOOGLE_DRIVE";

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

  // Se houver retorno da conexão do Google Drive, o card fica na aba "Modelos & Integrações"
  const defaultSecao = searchParams.google ? "modelos" : "geral";
  const requestedSecao = searchParams.secao || defaultSecao;
  const availableSecoes = SECOES.filter((s) => (!s.adminOnly || isAdmin) && (s.key !== "blog" || blogAccess));
  const secao = availableSecoes.some((s) => s.key === requestedSecao) ? requestedSecao : "geral";
  const viewerInitials = viewer.name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  const ultimoLogDatajud = roboExecucaoLogs.find((l) => l.fonte === "DATAJUD");
  const ultimoLogDjen = roboExecucaoLogs.find((l) => l.fonte === "DJEN");

  const allCategoriesForParentSelect = [...categories].sort(sortByCode);

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
              className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
                secao === s.key
                  ? "bg-navy-900 text-white"
                  : "bg-white dark:bg-navy-900 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/5"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      )}

      <div className="flex gap-6 items-start">
      {/* Sempre navy sólido (sem dark:), mesmo em modo Dia/Tarde/Noite — o texto aqui é
          propositalmente sempre cream (sem dark: também), então NÃO pode usar dark:bg-*: no
          modo Tarde o CSS de app/globals.css (.dark.theme-tarde) reescreve dark:bg-navy-900/950
          para um bordô quase transparente, mas não mexe em texto sem o prefixo dark:, deixando
          texto cream sobre fundo agora claro. Mesmo padrão do menu lateral principal (Sidebar.tsx). */}
      {isAdmin && (
        <aside className="hidden lg:block w-56 shrink-0 bg-navy-900 rounded-2xl overflow-hidden sticky top-6">
          <nav className="p-3 space-y-1">
            {availableSecoes.map((s) => {
              const Icon = SECAO_ICONS[s.key];
              const active = secao === s.key;
              return (
                <Link
                  key={s.key}
                  href={`/configuracoes?secao=${s.key}`}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm border-l-2 transition-colors ${
                    active
                      ? "bg-gold-500/10 text-cream-50 font-semibold border-gold-400"
                      : "text-cream-100/70 font-medium border-transparent hover:bg-white/5 hover:text-cream-50"
                  }`}
                >
                  <Icon size={16} className={active ? "text-gold-400" : "text-cream-100/45"} />
                  {s.label}
                </Link>
              );
            })}
          </nav>
          <div className="px-4 py-4 border-t border-white/10 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-white/10 text-gold-400 flex items-center justify-center text-xs font-serif font-bold shrink-0">
              {viewerInitials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-cream-50 truncate">{viewer.name}</p>
              <p className="text-[10px] text-cream-100/50 truncate">{viewer.role}</p>
            </div>
          </div>
        </aside>
      )}

      <div className="flex-1 min-w-0 space-y-6">

      {isAdmin && secao === "geral" && (
      <Card>
        <CardHeader title="Módulos Contratados" subtitle="Liga/desliga módulos conforme o plano contratado — desligar não apaga nenhum dado já existente" />
        <ModulesManager modules={modules} />
      </Card>
      )}

      {secao === "geral" && (
      <Card>
        <CardHeader title="Importação de Dados" subtitle="Traga contatos, processos e agenda de uma planilha" />
        <div className="p-5 flex flex-wrap gap-3">
          <Link
            href="/configuracoes/importar"
            className="flex items-center gap-2 justify-center bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit"
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
          (ver especificação do Passo 2). Por isso fica na seção "geral" (sem adminOnly), e não
          na navegação lateral (que só aparece para admin — ver `isAdmin &&` no <aside> acima). */}
      {secao === "geral" && (
      <Card>
        <CardHeader title="Acessos da Lúmen" subtitle="Veja quando e por quê o suporte da Lúmen acessou os dados do seu escritório" />
        <div className="p-5">
          <Link
            href="/configuracoes/acessos"
            className="inline-flex items-center gap-2 justify-center bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit"
          >
            <ShieldCheck size={16} /> Ver histórico de acessos
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
                className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors ${
                  blogTab === "revisao"
                    ? "bg-navy-800 text-white"
                    : "bg-white dark:bg-navy-900 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/5"
                }`}
              >
                Revisão Pendente {blogPendingRaw.length > 0 && `(${blogPendingRaw.length})`}
              </Link>
              <Link
                href="/configuracoes?secao=blog&blogTab=publicadas"
                className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors ${
                  blogTab === "publicadas"
                    ? "bg-navy-800 text-white"
                    : "bg-white dark:bg-navy-900 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/5"
                }`}
              >
                Matérias Publicadas ({blogPublishedRaw.length})
              </Link>
              <Link
                href="/configuracoes?secao=blog&blogTab=fotos"
                className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors ${
                  blogTab === "fotos"
                    ? "bg-navy-800 text-white"
                    : "bg-white dark:bg-navy-900 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/5"
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

      {isAdmin && secao === "modelos" && (
        <Card>
          <CardHeader
            title="Sincronizar publicações e andamentos processuais"
            subtitle="Varre agora os e-mails conectados (Jusbrasil e outras fontes) e busca o que o robô de DJEN/Datajud já capturou — sem esperar o próximo ciclo automático"
          />
          <div className="p-5">
            <SyncPublicationsButton />
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && (
        <Card>
          <CardHeader
            title="Integração com Drive e e-mail"
            subtitle="Necessária para anexar documentos (quando o armazenamento escolhido for Google Drive, ver o card “Armazenamento de anexos” abaixo) e sincronizar as publicações/andamentos que chegam por e-mail. O e-mail (leitura de publicações e envio no Atendimento) já aceita Outlook também — ver o card abaixo."
          />
          <div className="p-5 space-y-3">
            {searchParams.google === "conectado" && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/15 border border-emerald-200 dark:border-emerald-400/20 rounded-lg px-3 py-2">Google conectado com sucesso!</p>
            )}
            {searchParams.google === "erro" && (
              <p className="text-xs text-red-700 dark:text-bordo-400 bg-red-50 dark:bg-bordo-400/15 border border-red-200 dark:border-bordo-400/20 rounded-lg px-3 py-2">
                Erro ao conectar: {searchParams.msg || "tente novamente."}
              </p>
            )}
            {driveStatus.connected ? (
              <div className="flex items-center gap-2 text-sm text-navy-900 dark:text-cream-50">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                Conectado como <strong>{driveStatus.accountEmail}</strong>
              </div>
            ) : (
              <p className="text-sm text-navy-800/60 dark:text-cream-50/60">Nenhuma conta conectada ainda.</p>
            )}
            <a
              href="/api/google/connect"
              className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit"
            >
              <HardDrive size={16} /> {driveStatus.connected ? "Reconectar" : "Conectar"} Google (Drive + Gmail)
            </a>
            {driveStatus.connected && (
              <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                Se a conexão foi feita antes desta atualização, clique em &ldquo;Reconectar&rdquo; para autorizar também o acesso de leitura ao Gmail (necessário para as publicações por e-mail).
              </p>
            )}
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && viewer && (() => {
        const minhaConexao = googleAccounts.find((a) => a.userId === viewer.id);
        return (
          <Card>
            <CardHeader
              title="Publicações e andamentos processuais de e-mail"
              subtitle="Captura publicações, intimações, despachos e andamentos processuais (Projudi, eProc, DJEN, PJE, Datajud, eSaj, entre outros) recebidos por e-mail — cada pessoa só conecta a própria caixa"
            />
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                {users.filter((u) => u.active).map((u) => {
                  const found = googleAccounts.find((a) => a.userId === u.id);
                  return (
                    <div key={u.id} className="flex items-center gap-2 text-sm">
                      {found ? (
                        <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle size={16} className="text-amber-500 dark:text-amber-400 shrink-0" />
                      )}
                      <span className={found ? "text-navy-900 dark:text-cream-50" : "text-navy-800/50 dark:text-cream-50/50"}>
                        {u.name}
                        {found ? (
                          <span className="text-navy-800/45 dark:text-cream-50/45"> — {found.accountEmail}</span>
                        ) : (
                          " (ainda não conectou o e-mail)"
                        )}
                      </span>
                    </div>
                  );
                })}
                {googleAccounts.filter((a) => !a.userId).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-navy-900 dark:text-cream-50">
                      {a.accountEmail}
                      {a.isPrimaryDrive && <span className="text-navy-800/45 dark:text-cream-50/45"> (conta principal do Drive)</span>}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-navy-800/8 dark:border-white/10">
                <p className="text-xs text-navy-800/60 dark:text-cream-50/60 mb-2">
                  {minhaConexao ? (
                    <>Sua conta conectada: <strong>{minhaConexao.accountEmail}</strong></>
                  ) : (
                    "Você ainda não conectou seu e-mail."
                  )}
                </p>
                <a
                  href="/api/google/connect?mode=jusbrasil"
                  className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit"
                >
                  <HardDrive size={16} /> {minhaConexao ? "Reconectar" : "Conectar"} meu e-mail
                </a>
                <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-2">
                  Cada pessoa só pode conectar/reconectar o próprio e-mail por aqui — não é possível reconectar o e-mail de outra pessoa.
                </p>
              </div>
            </div>
          </Card>
        );
      })()}

      {isAdmin && secao === "modelos" && viewer && (() => {
        const minhaConexaoMs = microsoftAccounts.find((a) => a.userId === viewer.id);
        return (
          <Card>
            <CardHeader
              title="Outlook (Microsoft)"
              subtitle="Alternativa ao Google acima: recebe publicações/andamentos por e-mail e permite enviar e-mail no Atendimento usando a conta Outlook da própria pessoa. Para armazenamento (OneDrive), veja o card “Armazenamento de anexos” abaixo — é uma conexão separada, do escritório. O calendário do Outlook ainda não está integrado."
            />
            <div className="p-5 space-y-4">
              {!isMicrosoftConfigured() && (
                <p className="text-xs text-navy-800/60 dark:text-cream-50/60 bg-cream-100 dark:bg-white/5 border border-navy-800/8 dark:border-white/10 rounded-lg px-3 py-2">
                  Ainda não configurado na plataforma — falta registrar o app no Azure AD (ver README_MICROSOFT.md).
                </p>
              )}
              {searchParams.microsoft === "conectado" && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/15 border border-emerald-200 dark:border-emerald-400/20 rounded-lg px-3 py-2">Microsoft conectado com sucesso!</p>
              )}
              {searchParams.microsoft === "erro" && (
                <p className="text-xs text-red-700 dark:text-bordo-400 bg-red-50 dark:bg-bordo-400/15 border border-red-200 dark:border-bordo-400/20 rounded-lg px-3 py-2">
                  Erro ao conectar: {searchParams.msg || "tente novamente."}
                </p>
              )}
              <div className="space-y-2">
                {microsoftAccounts.length === 0 ? (
                  <p className="text-sm text-navy-800/60 dark:text-cream-50/60">Nenhuma conta Microsoft conectada ainda.</p>
                ) : (
                  microsoftAccounts.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-navy-900 dark:text-cream-50">
                        {a.ownerName ?? a.accountEmail} <span className="text-navy-800/45 dark:text-cream-50/45">— {a.accountEmail}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="pt-3 border-t border-navy-800/8 dark:border-white/10">
                <p className="text-xs text-navy-800/60 dark:text-cream-50/60 mb-2">
                  {minhaConexaoMs ? (
                    <>Sua conta conectada: <strong>{minhaConexaoMs.accountEmail}</strong></>
                  ) : (
                    "Você ainda não conectou sua conta Microsoft."
                  )}
                </p>
                <a
                  href="/api/microsoft/connect"
                  className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit"
                >
                  <HardDrive size={16} /> {minhaConexaoMs ? "Reconectar" : "Conectar"} minha conta Microsoft
                </a>
                <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-2">
                  Cada pessoa só pode conectar/reconectar a própria conta — não é possível reconectar a conta de outra pessoa.
                </p>
              </div>
            </div>
          </Card>
        );
      })()}

      {isAdmin && secao === "modelos" && (
        <Card>
          <CardHeader
            title="Armazenamento de anexos"
            subtitle="Por padrão, anexos de Processos/Atendimentos/Assessoria ficam no Google Drive. Cada escritório pode trocar para OneDrive ou Dropbox."
          />
          <div className="p-5 space-y-4">
            {!isMicrosoftConfigured() && (
              <p className="text-xs text-navy-800/60 dark:text-cream-50/60 bg-cream-100 dark:bg-white/5 border border-navy-800/8 dark:border-white/10 rounded-lg px-3 py-2">
                OneDrive ainda não configurado na plataforma — falta registrar o app no Azure AD (ver README_MICROSOFT.md).
              </p>
            )}
            {!isDropboxConfigured() && (
              <p className="text-xs text-navy-800/60 dark:text-cream-50/60 bg-cream-100 dark:bg-white/5 border border-navy-800/8 dark:border-white/10 rounded-lg px-3 py-2">
                Dropbox ainda não configurado na plataforma — falta registrar o app no Dropbox App Console (ver README_MICROSOFT.md).
              </p>
            )}
            {searchParams.microsoft === "onedrive-conectado" && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/15 border border-emerald-200 dark:border-emerald-400/20 rounded-lg px-3 py-2">OneDrive conectado com sucesso!</p>
            )}
            {searchParams.dropbox === "conectado" && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/15 border border-emerald-200 dark:border-emerald-400/20 rounded-lg px-3 py-2">Dropbox conectado com sucesso!</p>
            )}
            {searchParams.dropbox === "erro" && (
              <p className="text-xs text-red-700 dark:text-bordo-400 bg-red-50 dark:bg-bordo-400/15 border border-red-200 dark:border-bordo-400/20 rounded-lg px-3 py-2">
                Erro ao conectar: {searchParams.msg || "tente novamente."}
              </p>
            )}
            <StorageProviderPicker
              current={storageProvider}
              isAdmin={isAdmin}
              oneDriveConnected={oneDriveStatus.connected}
              dropboxConnected={dropboxStatus.connected}
            />
            {storageProvider === "ONEDRIVE" && (
              <div className="pt-3 border-t border-navy-800/8 dark:border-white/10">
                {oneDriveStatus.connected ? (
                  <div className="flex items-center gap-2 text-sm text-navy-900 dark:text-cream-50 mb-2">
                    <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                    Conectado como <strong>{oneDriveStatus.accountEmail}</strong>
                  </div>
                ) : (
                  <p className="text-sm text-navy-800/60 dark:text-cream-50/60 mb-2">Nenhuma conta OneDrive conectada ainda.</p>
                )}
                <a
                  href="/api/microsoft/connect?mode=onedrive"
                  className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit"
                >
                  <HardDrive size={16} /> {oneDriveStatus.connected ? "Reconectar" : "Conectar"} OneDrive
                </a>
              </div>
            )}
            {storageProvider === "DROPBOX" && (
              <div className="pt-3 border-t border-navy-800/8 dark:border-white/10">
                {dropboxStatus.connected ? (
                  <div className="flex items-center gap-2 text-sm text-navy-900 dark:text-cream-50 mb-2">
                    <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                    Conectado como <strong>{dropboxStatus.accountEmail}</strong>
                  </div>
                ) : (
                  <p className="text-sm text-navy-800/60 dark:text-cream-50/60 mb-2">Nenhuma conta Dropbox conectada ainda.</p>
                )}
                <a
                  href="/api/dropbox/connect"
                  className="inline-flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2.5 w-fit"
                >
                  <HardDrive size={16} /> {dropboxStatus.connected ? "Reconectar" : "Conectar"} Dropbox
                </a>
              </div>
            )}
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && viewer && (
        <Card>
          <CardHeader
            title="Envio de e-mail no Atendimento"
            subtitle="Conectar Google e/ou Microsoft acima não liga o envio sozinho — escolha qual dos dois usar. Sem escolha, o botão de enviar e-mail no Atendimento dá erro."
          />
          <div className="p-5">
            <EmailSendProviderPicker
              current={viewer.emailSendProvider ?? null}
              googleConnected={googleAccounts.some((a) => a.userId === viewer.id)}
              microsoftConnected={microsoftAccounts.some((a) => a.userId === viewer.id)}
            />
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
            <p className="text-xs text-navy-800/60 dark:text-cream-50/60">
              As OABs consultadas são as cadastradas em <Link href="/configuracoes?secao=equipe" className="text-gold-700 dark:text-gold-400 font-semibold hover:underline">Equipe &amp; Acesso</Link> (campo OAB de cada pessoa ativa). Para acompanhar mais um advogado, cadastre a OAB dele lá.
            </p>
            {ultimoLogDjen && (
              <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                Última execução do robô: {formatRelativeTime(ultimoLogDjen.executadoEm)} —{" "}
                {ultimoLogDjen.sucesso ? "sem falha registrada" : "falhou (provável bloqueio de IP, ver abaixo)"}.
              </p>
            )}
            <TestDjenButton />
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && (
        <Card>
          <CardHeader
            title="Datajud — Andamentos Processuais (CNJ)"
            subtitle="API oficial do CNJ, autenticada por chave — não sofre o bloqueio de IP que o DJEN sofre"
          />
          <div className="p-5 space-y-3">
            <p className="text-xs text-navy-800/60 dark:text-cream-50/60">
              Consulta os andamentos de todo processo já cadastrado no site com número de processo preenchido — não depende do
              DJEN para descobrir o que monitorar. Hoje: <strong>{processosMonitoradosCount} processo(s) monitorado(s)</strong>.
            </p>
            {ultimoLogDatajud ? (
              <div className={`text-xs rounded-lg px-3 py-2 ${ultimoLogDatajud.sucesso ? "bg-emerald-50 dark:bg-emerald-400/10 text-emerald-800 dark:text-emerald-300" : "bg-red-50 dark:bg-bordo-400/10 text-red-700 dark:text-bordo-400"}`}>
                Última execução {formatRelativeTime(ultimoLogDatajud.executadoEm)}: {ultimoLogDatajud.sucesso ? "sucesso" : "falhou"}
                {ultimoLogDatajud.detalhe && <> — {ultimoLogDatajud.detalhe}</>}
              </div>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-400">Nenhuma execução registrada ainda.</p>
            )}
            {roboExecucaoLogs.filter((l) => l.fonte === "DATAJUD").length > 1 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-navy-800/50 dark:text-cream-50/50 font-semibold">Histórico recente</summary>
                <ul className="mt-2 space-y-1">
                  {roboExecucaoLogs.filter((l) => l.fonte === "DATAJUD").slice(0, 5).map((l) => (
                    <li key={l.id} className="text-navy-800/60 dark:text-cream-50/60">
                      {formatRelativeTime(l.executadoEm)} — {l.sucesso ? "sucesso" : "falha"}{l.detalhe ? ` — ${l.detalhe}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && (
        <Card>
          <CardHeader title="E-mail Diário da Agenda" subtitle="Envio automático todos os dias às 5h (Brasília) para os administradores do escritório — inclui as tarefas do dia e as publicações/andamentos capturados no dia" />
          <div className="p-5">
            <TestEmailButton />
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && modules.whatsapp && (
        <Card>
          <CardHeader
            title="WhatsApp"
            subtitle="Número da Cloud API (Meta) deste escritório — usado para receber e responder mensagens de clientes em Atendimento"
          />
          <div className="p-5 flex items-start gap-3">
            <MessageCircle size={18} className="text-navy-800/40 dark:text-cream-50/40 shrink-0 mt-0.5" />
            <div className="flex-1">
              <WhatsappConfigForm connected={Boolean(whatsappConfig)} displayPhone={whatsappConfig?.displayPhone ?? null} />
              <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-3">
                O Phone Number ID e o Access Token são gerados ao cadastrar um número na Cloud API do WhatsApp (Meta for Developers). O webhook e o token de verificação são compartilhados pela plataforma — só o número precisa ser cadastrado aqui.
              </p>
            </div>
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && driveStatus.connected && (
        <Card>
          <CardHeader
            title="Organização de anexos no Drive"
            subtitle="Anexos de Processos e Atendimentos ficam em uma pasta por processo/atendimento, com subpasta por categoria de documento — em vez de uma única pasta plana"
          />
          <div className="p-5">
            <ReorganizeAttachmentsButton />
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && driveStatus.connected && (
        <Card>
          <CardHeader
            title="Pastas de processo fora do lugar no Drive"
            subtitle="Corrige pastas de Processo/Atendimento que ficaram apontando para a raiz antiga do Drive depois da migração para o Lúmen multi-tenant — move a pasta para a raiz correta sem alterar nenhum link já salvo"
          />
          <div className="p-5">
            <MigrarPastasLegadasButton />
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
        <CardHeader
          title="TaskScore — Pontuação por Tipo de Tarefa"
          subtitle="Pontos atribuídos automaticamente a cada tarefa concluída, conforme o tipo. Alimenta o ranking da página Produtividade."
        />
        <TaskTypePointsManager items={taskTypePointsRows} />
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
        <CardHeader title="Equipe (usuários)" subtitle={`${users.length} membro(s) · edite telefone, defina credenciais de acesso e conceda/revogue acesso ao Financeiro`} />
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {users.map((u) => (
            <UserRow key={u.id} user={u} canManage={isAdmin} />
          ))}
        </div>
        <form action={submitUser} className="p-5 grid grid-cols-1 sm:grid-cols-5 gap-2 border-t border-navy-800/8 dark:border-white/10">
          <input name="name" required placeholder="Nome" className="cfg-input sm:col-span-2 dark:bg-navy-800 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
          <input name="email" type="email" required placeholder="E-mail" className="cfg-input sm:col-span-2 dark:bg-navy-800 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
          <select name="role" className="cfg-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50">
            <option value="Advogado">Advogado</option>
            <option value="Sócio">Sócio</option>
            <option value="Estagiário">Estagiário</option>
            <option value="Financeiro">Financeiro</option>
            <option value="Recepcionista">Recepcionista</option>
            <option value="Marketing">Marketing</option>
            <option value="Contador">Contador</option>
          </select>
          <input name="oab" placeholder="OAB (opcional)" className="cfg-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
          <input name="color" type="color" defaultValue="#0f1f3d" className="cfg-input h-9 p-1 dark:bg-navy-800 dark:border-white/15" />
          <button type="submit" className="sm:col-span-2 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-3">
            Adicionar membro
          </button>
        </form>
      </Card>
      )}

      {isAdmin && secao === "modelos" && (
      <Card>
        <CardHeader title="Colunas do Kanban" subtitle="Personalize as etapas do fluxo de trabalho" />
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {columns.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
              <p className="text-sm text-navy-900 dark:text-cream-50 flex-1">{c.name}</p>
              {c.isDoneCol && <Badge color="green">Coluna de conclusão</Badge>}
              <span className="text-xs text-navy-800/35 dark:text-cream-50/35">{c._count.tasks} tarefa(s)</span>
              <DeleteButton
                id={c.id}
                confirmMessage={`Excluir a coluna "${c.name}"? Só é possível se não houver tarefas nela.`}
                action={deleteKanbanColumn}
              />
            </div>
          ))}
        </div>
        <form action={submitColumn} className="p-5 flex gap-2 border-t border-navy-800/8 dark:border-white/10">
          <input name="name" required placeholder="Nome da nova coluna" className="cfg-input flex-1 dark:bg-navy-800 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
          <input name="color" type="color" defaultValue="#94a3b8" className="cfg-input h-9 w-16 p-1 dark:bg-navy-800 dark:border-white/15" />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-x divide-navy-800/5 dark:divide-white/10">
          <div>
            <p className="px-5 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Receitas</p>
            {categories.filter((c) => c.kind === "RECEITA" && !c.parentId).sort(sortByCode).map((root) => (
              <CategoryTree key={root.id} categories={categories} parentId={root.id} depth={0} />
            ))}
          </div>
          <div>
            <p className="px-5 py-2 text-xs font-semibold text-red-600 dark:text-bordo-400 uppercase">Despesas</p>
            {categories.filter((c) => c.kind === "DESPESA" && !c.parentId).sort(sortByCode).map((root) => (
              <CategoryTree key={root.id} categories={categories} parentId={root.id} depth={0} />
            ))}
          </div>
        </div>
        <form action={submitCategory} className="p-5 flex gap-2 flex-wrap border-t border-navy-800/8 dark:border-white/10">
          <input name="name" required placeholder="Nome da nova categoria/conta" className="cfg-input flex-1 min-w-[180px] dark:bg-navy-800 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
          <select name="kind" className="cfg-input dark:bg-navy-800 dark:border-white/15 dark:text-cream-50">
            <option value="RECEITA">Receita</option>
            <option value="DESPESA">Despesa</option>
          </select>
          <select name="parentId" className="cfg-input min-w-[200px] dark:bg-navy-800 dark:border-white/15 dark:text-cream-50">
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
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          {costCenters.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
              <p className="text-sm text-navy-900 dark:text-cream-50 flex-1">{c.name}</p>
              <DeleteButton
                id={c.id}
                confirmMessage={`Excluir o centro de custo "${c.name}"? Só é possível se não houver lançamentos vinculados.`}
                action={deleteCostCenter}
              />
            </div>
          ))}
        </div>
        <form action={submitCostCenter} className="p-5 flex gap-2 border-t border-navy-800/8 dark:border-white/10">
          <input name="name" required placeholder="Nome do centro de custo" className="cfg-input flex-1 dark:bg-navy-800 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
          <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4">
            Adicionar
          </button>
        </form>
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
        .cfg-input { border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; background: #fff; color: #14213d; }
        .cfg-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
        .dark .cfg-input { background: #111a35; border-color: rgba(255,255,255,0.15); color: #f1ece0; }
      `}</style>
    </div>
  );
}

function Swatch({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <div className="text-center">
      <div className={`h-14 w-14 rounded-lg ${border ? "border border-navy-800/15 dark:border-white/15" : ""}`} style={{ backgroundColor: color }} />
      <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 mt-1">{label}</p>
      <p className="text-[10px] text-navy-800/35 dark:text-cream-50/35">{color}</p>
    </div>
  );
}
