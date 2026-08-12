import Link from "next/link";
import type { ReactNode } from "react";
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
import RenameCasesToConventionButton from "@/components/RenameCasesToConventionButton";
import MigrarPastasLegadasButton from "@/components/MigrarPastasLegadasButton";
import MigrarPastaMaeButton from "@/components/MigrarPastaMaeButton";
import BlockedProcessNumbersManager from "@/components/BlockedProcessNumbersManager";
import WhatsappConfigForm from "@/components/WhatsappConfigForm";
import SyncPublicationsButton from "@/components/SyncPublicationsButton";
import EmailSendProviderPicker from "@/components/EmailSendProviderPicker";
import StorageProviderPicker from "@/components/StorageProviderPicker";
import BankAccountsManager from "@/components/BankAccountsManager";
import HolidaysManager from "@/components/HolidaysManager";
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
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { PASTA_MAE_PADRAO, PREFIXO_PADRAO } from "@/lib/driveNaming";

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

// Vocabulário único de conexão para os cartões de "Modelos & Integrações": em vez de cada
// integração inventar seu próprio jeito de dizer "conectado" (badge, ícone + texto solto, caixa
// colorida...), todo cartão usa a mesma linha com filete de severidade à esquerda — verde
// (funcionando), vinho (falhando) ou cinza (não configurado ainda).
function StatusLine({ state, children }: { state: "ok" | "erro" | "off"; children: ReactNode }) {
  const tone: Record<typeof state, string> = {
    ok: "border-concluido text-concluido",
    erro: "border-vinho text-vinho",
    off: "border-tx-3 text-tx-2",
  };
  return (
    <p className={`flex items-center gap-2 border-l-[3px] ${tone[state]} bg-sf-apoio rounded-r-md px-3 py-2 text-xs font-medium`}>
      {children}
    </p>
  );
}

// Botão secundário (DESIGN-SYSTEM.md §4): usado nos "Conectar"/"Reconectar" das integrações
// e em outras ações de navegação/consulta que não são a ação primária do cartão.
const SECONDARY_BTN =
  "inline-flex items-center gap-2 bg-sf border border-regua hover:bg-sf-apoio text-tx text-sm font-semibold rounded-lg px-4 py-2.5 w-fit transition-colors";

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

// `requires` substitui o antigo `adminOnly: boolean` para permitir uma exceção pontual: a aba
// "modelos" (Modelos & Integrações) é o motivo nº 1 pelo qual o suporte da plataforma entra em
// modo "atuar como" (CONFIG_INTEGRACAO — ver lib/supportAccessConstants.ts), então ela também
// libera para sessão de suporte mascarada, não só para isAdmin (ver
// lib/supportCapabilities.ts:canConfigureIntegrations). As demais seções continuam exigindo
// isAdmin puro — NÃO estender "admin-ou-suporte" para elas.
const SECOES = [
  { key: "modelos", label: "Modelos & Integrações", requires: "admin-ou-suporte" },
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
  modelos: Plug,
  equipe: Users,
  financeiro: DollarSign,
  geral: SlidersHorizontal,
  workflows: Workflow,
  blog: Newspaper,
  cobranca: CreditCard,
} as const;

// Rótulo legível de cada provedor de armazenamento — usado nos textos de "Pastas no
// armazenamento", que precisam dizer "no Google Drive"/"no Dropbox" em vez do valor cru do banco.
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
    bankAccounts,
    holidaysRaw,
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
      prisma.office.findUnique({ where: { id: officeId }, select: { storageProvider: true, timbradoUrl: true, timbradoNomeArquivo: true, timbradoFormato: true, drivePastaMae: true, drivePrefixo: true } }),
      getOneDriveStatus(officeId),
      getDropboxStatus(officeId),
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
  // Distinto de isAdmin: também true para o suporte da plataforma em sessão mascarada ("atuar
  // como" — ver lib/currentUser.ts). Só abre a aba "Modelos & Integrações" (e as ações de
  // integração dentro dela) — nunca as demais seções, que continuam checando `isAdmin` puro.
  const canConfig = canConfigureIntegrations(viewer);

  const taskTypePointsRows = TASK_TYPES_ORDER.map((type) => {
    const found = taskTypePoints.find((p) => p.type === type);
    return { type, points: found?.points ?? 10 };
  });

  // Se houver retorno da conexão do Google Drive/Outlook/Dropbox, o card fica na aba "Modelos &
  // Integrações" (onde os 3 cartões de confirmação vivem — ver mais abaixo) — os 3 provedores
  // contam aqui, não só o Google: a Sidebar (components/Sidebar.tsx) espelha esta mesma condição
  // para o submenu "Configurações" acender "Modelos & Integrações" em vez de "Geral" nesse
  // retorno (bug real: reconectar Outlook/Dropbox mostrava o card de sucesso na aba certa, mas o
  // menu lateral continuava destacando "Geral").
  const defaultSecao = searchParams.google || searchParams.microsoft || searchParams.dropbox ? "modelos" : "geral";
  const requestedSecao = searchParams.secao || defaultSecao;
  const availableSecoes = SECOES.filter((s) => {
    const allowed = s.requires === "none" ? true : s.requires === "admin-ou-suporte" ? canConfig : isAdmin;
    return allowed && (s.key !== "blog" || blogAccess);
  });
  const secao = availableSecoes.some((s) => s.key === requestedSecao) ? requestedSecao : "geral";
  const viewerInitials = viewer.name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  const ultimoLogDatajud = roboExecucaoLogs.find((l) => l.fonte === "DATAJUD");
  const ultimoLogDjen = roboExecucaoLogs.find((l) => l.fonte === "DJEN");

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

      {canConfig && (
        <div className="flex lg:hidden gap-2 flex-wrap">
          {availableSecoes.map((s) => (
            <Link
              key={s.key}
              href={`/configuracoes?secao=${s.key}`}
              className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
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
      {canConfig && (
        <aside className="hidden lg:block w-56 shrink-0 bg-grafite-800 rounded-2xl overflow-hidden sticky top-6">
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
            className="flex items-center gap-2 justify-center bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2.5 w-fit transition-colors"
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
          não na navegação lateral (que só aparece para admin/suporte — ver `canConfig &&` no
          <aside> acima). */}
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
                    ? "bg-acao text-acao-tx"
                    : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"
                }`}
              >
                Revisão Pendente {blogPendingRaw.length > 0 && `(${blogPendingRaw.length})`}
              </Link>
              <Link
                href="/configuracoes?secao=blog&blogTab=publicadas"
                className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors ${
                  blogTab === "publicadas"
                    ? "bg-acao text-acao-tx"
                    : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"
                }`}
              >
                Matérias Publicadas ({blogPublishedRaw.length})
              </Link>
              <Link
                href="/configuracoes?secao=blog&blogTab=fotos"
                className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors ${
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

      {canConfig && secao === "modelos" && (
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

      {/* Painel "Contas conectadas" (redesenho aprovado — ver figura 11 · Modelos & Integrações):
          reúne as cinco integrações de conta em um único cartão, na mesma ordem da proposta —
          Google, Outlook, publicações por e-mail por usuário, armazenamento de anexos, envio de
          e-mail no Atendimento. Cada uma mantém seu rótulo, subtítulo e funcionalidade originais,
          só a casca em cartões separados é que vira seções dentro de um cartão só. */}
      {canConfig && secao === "modelos" && viewer && (() => {
        const minhaConexao = googleAccounts.find((a) => a.userId === viewer.id);
        const minhaConexaoMs = microsoftAccounts.find((a) => a.userId === viewer.id);
        return (
          <Card>
            <CardHeader title="Contas conectadas" subtitle="Google, Outlook, publicações por e-mail, armazenamento de anexos e envio de e-mail no Atendimento" />
            <div className="divide-y divide-regua">
              {/* Google — Drive e e-mail */}
              <div className="p-5 space-y-3">
                <div>
                  <p className="text-[15px] font-semibold text-tx">Google — Drive e e-mail</p>
                  <p className="text-xs text-tx-2 mt-0.5">
                    Necessária para anexar documentos (quando o armazenamento escolhido for Google Drive, ver &ldquo;Armazenamento de anexos&rdquo; abaixo) e sincronizar as publicações/andamentos que chegam por e-mail. O e-mail (leitura de publicações e envio no Atendimento) já aceita Outlook também — ver abaixo.
                  </p>
                </div>
                {searchParams.google === "conectado" && <StatusLine state="ok">Google conectado com sucesso!</StatusLine>}
                {searchParams.google === "erro" && (
                  <StatusLine state="erro">Erro ao conectar: {searchParams.msg || "tente novamente."}</StatusLine>
                )}
                {driveStatus.connected ? (
                  <StatusLine state="ok">
                    Conectado como <strong>{driveStatus.accountEmail}</strong>
                  </StatusLine>
                ) : (
                  <StatusLine state="off">Nenhuma conta conectada ainda.</StatusLine>
                )}
                <a href="/api/google/connect" className={SECONDARY_BTN}>
                  <HardDrive size={16} /> {driveStatus.connected ? "Reconectar" : "Conectar"} Google (Drive + Gmail)
                </a>
                {driveStatus.connected && (
                  <p className="text-[11px] text-tx-3">
                    Se a conexão foi feita antes desta atualização, clique em &ldquo;Reconectar&rdquo; para autorizar também o acesso de leitura ao Gmail (necessário para as publicações por e-mail) e o acesso completo ao Drive (necessário para mover/organizar pastas de processo que já existiam antes do Lúmen — sem isso, a migração de pastas legadas em &ldquo;Manutenção do Drive&rdquo;, mais abaixo, só consegue simular, não aplicar).
                  </p>
                )}
              </div>

              {/* Outlook (Microsoft) */}
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-[15px] font-semibold text-tx">Outlook (Microsoft)</p>
                  <p className="text-xs text-tx-2 mt-0.5">
                    Alternativa ao Google acima: recebe publicações/andamentos por e-mail e permite enviar e-mail no Atendimento usando a conta Outlook da própria pessoa. Para armazenamento (OneDrive), veja &ldquo;Armazenamento de anexos&rdquo; abaixo — é uma conexão separada, do escritório. O calendário do Outlook ainda não está integrado.
                  </p>
                </div>
                {!isMicrosoftConfigured() && <StatusLine state="off">Ainda não configurado na plataforma — falta registrar o app no Azure AD (ver README_MICROSOFT.md).</StatusLine>}
                {searchParams.microsoft === "conectado" && <StatusLine state="ok">Microsoft conectado com sucesso!</StatusLine>}
                {searchParams.microsoft === "erro" && (
                  <StatusLine state="erro">Erro ao conectar: {searchParams.msg || "tente novamente."}</StatusLine>
                )}
                <div className="space-y-2">
                  {microsoftAccounts.length === 0 ? (
                    <p className="text-sm text-tx-2">Nenhuma conta Microsoft conectada ainda.</p>
                  ) : (
                    microsoftAccounts.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 size={16} className="text-concluido shrink-0" />
                        <span className="text-tx">
                          {a.ownerName ?? a.accountEmail} <span className="text-tx-3">— {a.accountEmail}</span>
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <div className="pt-3 border-t border-regua">
                  <p className="text-xs text-tx-2 mb-2">
                    {minhaConexaoMs ? (
                      <>Sua conta conectada: <strong>{minhaConexaoMs.accountEmail}</strong></>
                    ) : (
                      "Você ainda não conectou sua conta Microsoft."
                    )}
                  </p>
                  <a href="/api/microsoft/connect" className={SECONDARY_BTN}>
                    <HardDrive size={16} /> {minhaConexaoMs ? "Reconectar" : "Conectar"} minha conta Microsoft
                  </a>
                  <p className="text-[11px] text-tx-3 mt-2">
                    Cada pessoa só pode conectar/reconectar a própria conta — não é possível reconectar a conta de outra pessoa.
                  </p>
                </div>
              </div>

              {/* Publicações por e-mail — por usuário */}
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-[15px] font-semibold text-tx">Publicações por e-mail — por usuário</p>
                  <p className="text-xs text-tx-2 mt-0.5">
                    Captura publicações, intimações, despachos e andamentos processuais (Projudi, eProc, DJEN, PJE, Datajud, eSaj, entre outros) recebidos por e-mail — cada pessoa só conecta a própria caixa
                  </p>
                </div>
                <div className="space-y-2">
                  {users.filter((u) => u.active).map((u) => {
                    const found = googleAccounts.find((a) => a.userId === u.id);
                    return (
                      <div key={u.id} className="flex items-center gap-2 text-sm">
                        {found ? (
                          <CheckCircle2 size={16} className="text-concluido shrink-0" />
                        ) : (
                          <AlertTriangle size={16} className="text-tx-3 shrink-0" />
                        )}
                        <span className={found ? "text-tx" : "text-tx-3"}>
                          {u.name}
                          {found ? <span className="text-tx-3"> — {found.accountEmail}</span> : " (ainda não conectou o e-mail)"}
                        </span>
                      </div>
                    );
                  })}
                  {googleAccounts.filter((a) => !a.userId).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 size={16} className="text-concluido shrink-0" />
                      <span className="text-tx">
                        {a.accountEmail}
                        {a.isPrimaryDrive && <span className="text-tx-3"> (conta principal do Drive)</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-regua">
                  <p className="text-xs text-tx-2 mb-2">
                    {minhaConexao ? (
                      <>Sua conta conectada: <strong>{minhaConexao.accountEmail}</strong></>
                    ) : (
                      "Você ainda não conectou seu e-mail."
                    )}
                  </p>
                  <a href="/api/google/connect?mode=jusbrasil" className={SECONDARY_BTN}>
                    <HardDrive size={16} /> {minhaConexao ? "Reconectar" : "Conectar"} meu e-mail
                  </a>
                  <p className="text-[11px] text-tx-3 mt-2">
                    Cada pessoa só pode conectar/reconectar o próprio e-mail por aqui — não é possível reconectar o e-mail de outra pessoa.
                  </p>
                </div>
              </div>

              {/* Armazenamento de anexos */}
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-[15px] font-semibold text-tx">Armazenamento de anexos</p>
                  <p className="text-xs text-tx-2 mt-0.5">
                    Por padrão, anexos de Processos/Atendimentos/Assessoria ficam no Google Drive. Cada escritório pode trocar para OneDrive ou Dropbox.
                  </p>
                </div>
                {!isMicrosoftConfigured() && <StatusLine state="off">OneDrive ainda não configurado na plataforma — falta registrar o app no Azure AD (ver README_MICROSOFT.md).</StatusLine>}
                {!isDropboxConfigured() && <StatusLine state="off">Dropbox ainda não configurado na plataforma — falta registrar o app no Dropbox App Console (ver README_MICROSOFT.md).</StatusLine>}
                {searchParams.microsoft === "onedrive-conectado" && <StatusLine state="ok">OneDrive conectado com sucesso!</StatusLine>}
                {searchParams.dropbox === "conectado" && <StatusLine state="ok">Dropbox conectado com sucesso!</StatusLine>}
                {searchParams.dropbox === "erro" && (
                  <StatusLine state="erro">Erro ao conectar: {searchParams.msg || "tente novamente."}</StatusLine>
                )}
                <StorageProviderPicker
                  current={storageProvider}
                  isAdmin={canConfig}
                  oneDriveConnected={oneDriveStatus.connected}
                  dropboxConnected={dropboxStatus.connected}
                />
                {storageProvider === "ONEDRIVE" && (
                  <div className="pt-3 border-t border-regua space-y-2">
                    {oneDriveStatus.connected ? (
                      <StatusLine state="ok">
                        Conectado como <strong>{oneDriveStatus.accountEmail}</strong>
                      </StatusLine>
                    ) : (
                      <StatusLine state="off">Nenhuma conta OneDrive conectada ainda.</StatusLine>
                    )}
                    <a href="/api/microsoft/connect?mode=onedrive" className={SECONDARY_BTN}>
                      <HardDrive size={16} /> {oneDriveStatus.connected ? "Reconectar" : "Conectar"} OneDrive
                    </a>
                  </div>
                )}
                {storageProvider === "DROPBOX" && (
                  <div className="pt-3 border-t border-regua space-y-2">
                    {dropboxStatus.connected ? (
                      <StatusLine state="ok">
                        Conectado como <strong>{dropboxStatus.accountEmail}</strong>
                      </StatusLine>
                    ) : (
                      <StatusLine state="off">Nenhuma conta Dropbox conectada ainda.</StatusLine>
                    )}
                    <a href="/api/dropbox/connect" className={SECONDARY_BTN}>
                      <HardDrive size={16} /> {dropboxStatus.connected ? "Reconectar" : "Conectar"} Dropbox
                    </a>
                  </div>
                )}
              </div>

              {/* Envio de e-mail no Atendimento */}
              <div className="p-5">
                <div className="mb-3">
                  <p className="text-[15px] font-semibold text-tx">Envio de e-mail no Atendimento</p>
                  <p className="text-xs text-tx-2 mt-0.5">
                    Conectar Google e/ou Microsoft acima não liga o envio sozinho — escolha qual dos dois usar. Sem escolha, o botão de enviar e-mail no Atendimento dá erro.
                  </p>
                </div>
                <EmailSendProviderPicker
                  current={viewer.emailSendProvider ?? null}
                  googleConnected={googleAccounts.some((a) => a.userId === viewer.id)}
                  microsoftConnected={microsoftAccounts.some((a) => a.userId === viewer.id)}
                />
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Painel "Robôs de captura": cada linha traz o filete de severidade à esquerda —
          --concluido funcionando, --urgente falhando, --tx-3 não configurado/sem execução — e a
          última execução como subtítulo, exatamente como na figura 11 do redesenho aprovado. */}
      {canConfig && secao === "modelos" && (
        <Card>
          <CardHeader title="Robôs de captura" subtitle="DJEN, Datajud, e-mail diário da agenda e WhatsApp — origem automática de publicações, andamentos e mensagens" />
          <div className="p-5 space-y-3">
            {/* DJEN */}
            <div className={`border-l-[3px] rounded-r-lg bg-sf-apoio p-4 space-y-3 ${ultimoLogDjen ? (ultimoLogDjen.sucesso ? "border-concluido" : "border-urgente") : "border-tx-3"}`}>
              <div>
                <p className="text-sm font-semibold text-tx">DJEN — Diário de Justiça Eletrônico Nacional (CNJ)</p>
                <p className="text-xs text-tx-2 mt-0.5">
                  {ultimoLogDjen
                    ? `Última execução ${formatRelativeTime(ultimoLogDjen.executadoEm)} — ${ultimoLogDjen.sucesso ? "sem falha registrada" : "falhou (provável bloqueio de IP, ver abaixo)"}.`
                    : "Nenhuma execução registrada ainda."}
                </p>
              </div>
              <p className="text-xs text-tx-2">
                Fonte oficial e gratuita de intimações/citações por OAB — em avaliação como alternativa ao Jusbrasil por e-mail. As OABs consultadas são as cadastradas em{" "}
                <Link href="/configuracoes?secao=equipe" className="text-acao font-semibold hover:underline">Equipe &amp; Acesso</Link> (campo OAB de cada pessoa ativa). Para acompanhar mais um advogado, cadastre a OAB dele lá.
              </p>
              <TestDjenButton />
            </div>

            {/* Datajud */}
            <div className={`border-l-[3px] rounded-r-lg bg-sf-apoio p-4 space-y-3 ${ultimoLogDatajud ? (ultimoLogDatajud.sucesso ? "border-concluido" : "border-urgente") : "border-tx-3"}`}>
              <div>
                <p className="text-sm font-semibold text-tx">Datajud — Andamentos Processuais (CNJ)</p>
                <p className="text-xs text-tx-2 mt-0.5">
                  {ultimoLogDatajud
                    ? `Última execução ${formatRelativeTime(ultimoLogDatajud.executadoEm)}: ${ultimoLogDatajud.sucesso ? "sucesso" : "falhou"}${ultimoLogDatajud.detalhe ? ` — ${ultimoLogDatajud.detalhe}` : ""}`
                    : "Nenhuma execução registrada ainda."}
                </p>
              </div>
              <p className="text-xs text-tx-2">
                API oficial do CNJ, autenticada por chave — não sofre o bloqueio de IP que o DJEN sofre. Consulta os andamentos de todo processo já cadastrado no site com número de processo preenchido. Hoje: <strong>{processosMonitoradosCount} processo(s) monitorado(s)</strong>.
              </p>
              {roboExecucaoLogs.filter((l) => l.fonte === "DATAJUD").length > 1 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-tx-2 font-semibold">Histórico recente</summary>
                  <ul className="mt-2 space-y-1">
                    {roboExecucaoLogs.filter((l) => l.fonte === "DATAJUD").slice(0, 5).map((l) => (
                      <li key={l.id} className="text-tx-2">
                        {formatRelativeTime(l.executadoEm)} — {l.sucesso ? "sucesso" : "falha"}{l.detalhe ? ` — ${l.detalhe}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            {/* E-mail Diário da Agenda */}
            <div className="border-l-[3px] border-tx-3 rounded-r-lg bg-sf-apoio p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-tx">E-mail Diário da Agenda</p>
                <p className="text-xs text-tx-2 mt-0.5">Sem execução monitorada — use o teste manual abaixo para conferir agora.</p>
              </div>
              <p className="text-xs text-tx-2">
                Envio automático todos os dias às 5h (Brasília) para os administradores do escritório — inclui as tarefas do dia e as publicações/andamentos capturados no dia.
              </p>
              <TestEmailButton />
            </div>

            {/* WhatsApp */}
            {modules.whatsapp && (
              <div className={`border-l-[3px] rounded-r-lg bg-sf-apoio p-4 space-y-3 ${whatsappConfig ? "border-concluido" : "border-tx-3"}`}>
                <div>
                  <p className="text-sm font-semibold text-tx">WhatsApp</p>
                  <p className="text-xs text-tx-2 mt-0.5">
                    {whatsappConfig ? `Número configurado${whatsappConfig.displayPhone ? ` — ${whatsappConfig.displayPhone}` : ""}.` : "Número não configurado neste escritório."}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <MessageCircle size={18} className="text-tx-3 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <WhatsappConfigForm connected={Boolean(whatsappConfig)} displayPhone={whatsappConfig?.displayPhone ?? null} />
                    <p className="text-[11px] text-tx-3 mt-3">
                      O Phone Number ID e o Access Token são gerados ao cadastrar um número na Cloud API do WhatsApp (Meta for Developers). O webhook e o token de verificação são compartilhados pela plataforma — só o número precisa ser cadastrado aqui.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Painel "Manutenção do Drive": organização de anexos, pastas fora do lugar, e a Tarefa A
          — a migração da pasta-mãe do Lúmen (lib/actions/driveParentMigration.ts), que antes não
          tinha nenhuma interface que a chamasse. */}
      {canConfig && secao === "modelos" && driveStatus.connected && (
        <Card>
          <CardHeader title="Manutenção do Drive" subtitle="Organização de anexos, pastas fora do lugar e migração da pasta-mãe do Lúmen" />
          <div className="divide-y divide-regua">
            <div className="p-5 space-y-3">
              <div>
                <p className="text-[15px] font-semibold text-tx">Organização de anexos no Drive</p>
                <p className="text-xs text-tx-2 mt-0.5">
                  Anexos de Processos e Atendimentos ficam em uma pasta por processo/atendimento, com subpasta por categoria de documento — em vez de uma única pasta plana
                </p>
              </div>
              <ReorganizeAttachmentsButton />
            </div>

            <div className="p-5 space-y-3">
              <div>
                <p className="text-[15px] font-semibold text-tx">Pastas de processo fora do lugar no Drive</p>
                <p className="text-xs text-tx-2 mt-0.5">
                  Corrige pastas de Processo/Atendimento que ficaram apontando para a raiz antiga do Drive depois da migração para o Lúmen multi-tenant — move a pasta para a raiz correta sem alterar nenhum link já salvo
                </p>
              </div>
              <MigrarPastasLegadasButton />
            </div>

            <div className="p-5 space-y-3">
              <div>
                <p className="text-[15px] font-semibold text-tx">Migração da pasta-mãe do Lúmen</p>
                <p className="text-xs text-tx-2 mt-0.5">
                  Move as raízes &ldquo;Lúmen - *&rdquo; soltas na raiz do Drive para dentro da pasta-mãe &ldquo;Lúmen&rdquo; e audita as pastas antigas &ldquo;RP Financeiro - *&rdquo;: o que corresponde a um registro do sistema é movido para o lugar certo, o que não corresponde é só relatado — nunca apagado.
                </p>
              </div>
              <MigrarPastaMaeButton />
            </div>

            <div className="p-5 space-y-1.5">
              <p className="text-[15px] font-semibold text-tx">Onde cada processo, caso e assessoria está sendo salvo</p>
              <p className="text-xs text-tx-2">
                Lista de todos os ativos com o caminho de pasta que a convenção do sistema usa, e se ela já existe ou nasce no primeiro anexo
              </p>
              <Link href="/configuracoes/relatorio-pastas" className="inline-block text-xs font-semibold text-acao hover:underline mt-1">
                Ver relatório →
              </Link>
            </div>
          </div>
        </Card>
      )}

      {isAdmin && secao === "modelos" && (
        <Card>
          <CardHeader
            title="Nomenclatura de processos"
            subtitle='Todo processo novo com cliente e parte adversa cadastrados já nasce com o título "Cliente x Parte Adversa" — este botão aplica o mesmo padrão aos processos já existentes'
          />
          <div className="p-5">
            <RenameCasesToConventionButton />
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

      {secao === "geral" && (
      <Card>
        <CardHeader
          title="Processos Bloqueados"
          subtitle='Processos que você optou por deixar de acompanhar (botão "Bloquear" em Publicações/Andamentos, disponível só para processos ainda não cadastrados) — some só da sua fila, os demais advogados do escritório continuam recebendo normalmente, até você reverter o bloqueio aqui'
        />
        <BlockedProcessNumbersManager items={blockedProcessNumbers} />
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

      {isAdmin && secao === "modelos" && (
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
          <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 transition-colors">
            Adicionar
          </button>
        </form>
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
          <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 transition-colors">
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
          <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 transition-colors">
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
      <div className={`h-14 w-14 rounded-lg ${border ? "border border-regua-forte" : ""}`} style={{ backgroundColor: color }} />
      <p className="text-[11px] text-tx-3 mt-1">{label}</p>
    </div>
  );
}
