import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, taskTypeLabels } from "@/components/ui";
import MobileChangePasswordForm from "@/components/mobile/MobileChangePasswordForm";
import NotificationPreferences from "@/components/mobile/NotificationPreferences";
import SyncPublicationsButton from "@/components/SyncPublicationsButton";
import TestDjenButton from "@/components/TestDjenButton";
import TestEmailButton from "@/components/TestEmailButton";
import WhatsappConfigForm from "@/components/WhatsappConfigForm";
import ReorganizeAttachmentsButton from "@/components/ReorganizeAttachmentsButton";
import WorkflowsManager from "@/components/WorkflowsManager";
import OfficeBillingSummary from "@/components/OfficeBillingSummary";
import BlogReviewManager from "@/components/BlogReviewManager";
import BlogPublishedManager from "@/components/BlogPublishedManager";
import PhotoLibraryManager from "@/components/PhotoLibraryManager";
import { getDriveStatus, listGoogleAccounts } from "@/lib/googleDrive";
import { getOfficeModules, hasBlogAccess, type OfficeModules } from "@/lib/officeModules";
import { getOwnOfficeBilling } from "@/lib/actions/subscriptionBilling";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import {
  ArrowLeft,
  User,
  KeyRound,
  Bell,
  ShieldCheck,
  Plug,
  Users,
  SlidersHorizontal,
  Workflow,
  Newspaper,
  HardDrive,
  Gavel,
  CalendarClock,
  MessageCircle,
  FolderCog,
  CheckCircle2,
  ChevronRight,
  Upload,
  CreditCard,
  Globe,
  type LucideIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

const TASK_TYPES_ORDER = ["TAREFA", "EVENTO", "AUDIENCIA", "PERICIA", "PRAZO"];
const ROLE_OPTIONS = ["Advogado", "Sócio", "Estagiário", "Financeiro", "Recepcionista", "Marketing", "Contador"];

const MODULE_LABELS: Record<keyof OfficeModules, string> = {
  financeiro: "Financeiro",
  whatsapp: "WhatsApp",
  atendimento: "Atendimento",
  assessoria: "Assessoria Jurídica",
};

export default async function MobileConfiguracoes({
  searchParams,
}: {
  searchParams: { blogTab?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) return null;
  const officeId = viewer.officeId;
  const isAdmin = viewer.isAdmin;
  // Distinto de isAdmin: também true para o suporte da plataforma em sessão mascarada — só abre
  // o grupo "Modelos & Integrações" abaixo (motivo nº 1 pelo qual o suporte entra, ver
  // lib/supportCapabilities.ts). Todos os outros grupos deste bloco (Equipe, Geral, Workflows,
  // Blog, Cobrança) continuam exigindo isAdmin puro.
  const canConfig = canConfigureIntegrations(viewer);

  const [
    modules,
    blogAccess,
    driveStatus,
    googleAccounts,
    users,
    whatsappConfig,
    workflowTemplates,
    taskTypePoints,
    blogPendingRaw,
    blogPublishedRaw,
    photosRaw,
    roboExecucaoLogs,
    processosMonitoradosCount,
    ownBilling,
  ] = canConfig
    ? await Promise.all([
        getOfficeModules(officeId),
        hasBlogAccess(officeId),
        getDriveStatus(officeId),
        listGoogleAccounts(officeId),
        prisma.user.findMany({ where: { officeId, active: true }, select: { id: true, name: true, role: true } }),
        prisma.whatsappConfig.findUnique({ where: { officeId } }),
        prisma.workflowTemplate.findMany({
          where: { officeId },
          orderBy: { createdAt: "asc" },
          include: { steps: { orderBy: { order: "asc" } } },
        }),
        prisma.taskTypePoints.findMany({ where: { officeId } }),
        // Registros completos (não só contagem) — igual ao computador (app/(app)/configuracoes/
        // page.tsx): permite revisar/publicar/editar direto daqui, não só ver o número.
        prisma.blogPost.findMany({ where: { officeId, status: "AGUARDANDO_REVISAO" }, orderBy: { createdAt: "asc" } }),
        prisma.blogPost.findMany({ where: { officeId, status: "PUBLICADO" }, orderBy: { publishedAt: "desc" } }),
        prisma.photo.findMany({ where: { officeId }, orderBy: { createdAt: "desc" } }),
        // Tabelas globais espelhadas do robô Python (sem officeId) — só pra mostrar o status
        // real das últimas execuções, igual ao card equivalente no computador.
        prisma.roboExecucaoLog.findMany({ orderBy: { executadoEm: "desc" }, take: 10 }),
        prisma.roboProcessoMonitorado.count(),
        getOwnOfficeBilling(),
      ])
    : [null, false, null, [], [], null, [], [], [], [], [], [], 0, { subscription: null, invoices: [] }];

  const photos = photosRaw.map((p) => ({
    id: p.id,
    url: p.url,
    category: p.category,
    court: p.court,
    caption: p.caption,
    createdAt: p.createdAt.toISOString(),
  }));
  const blogTab =
    searchParams.blogTab === "publicadas" ? "publicadas" : searchParams.blogTab === "fotos" ? "fotos" : "revisao";

  const initials = viewer.name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  const minhaConexao = googleAccounts.find((a) => a.userId === viewer.id);
  const ultimoLogDatajud = roboExecucaoLogs.find((l) => l.fonte === "DATAJUD");
  const taskTypePointsRows = TASK_TYPES_ORDER.map((type) => {
    const found = taskTypePoints.find((p) => p.type === type);
    return { type, points: found?.points ?? 10 };
  });

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Configurações</h1>
        <p className="text-sm text-tx-2">Perfil e preferências da conta</p>
      </div>

      <div className="flex items-center gap-3 px-1">
        <div className="h-12 w-12 rounded-full bg-grafite-700 text-marca flex items-center justify-center text-sm font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-tx leading-tight truncate">{viewer.name}</p>
          <p className="text-xs text-tx-2 truncate">{viewer.email}</p>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-regua">
          <User size={16} className="text-marca-tx" />
          <h3 className="font-bold text-tx text-sm">Minha conta</h3>
        </div>
        <div className="divide-y divide-regua">
          <Field label="Cargo" value={viewer.role} />
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <KeyRound size={14} className="text-tx-2" />
              <span className="text-sm font-medium text-tx">Trocar minha senha</span>
            </div>
            <MobileChangePasswordForm />
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-regua">
          <Bell size={16} className="text-marca-tx" />
          <h3 className="font-bold text-tx text-sm">Notificações</h3>
        </div>
        <NotificationPreferences />
      </Card>

      {/* Visível a QUALQUER usuário do escritório, não só admin — mesmo critério da versão
          desktop (app/(app)/configuracoes/acessos/page.tsx): transparência sobre o acesso do
          suporte da Lúmen não é um privilégio de administrador. */}
      <Link href="/m/configuracoes/acessos" className="block">
        <Card className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-marca-tx" />
            <h3 className="font-bold text-tx text-sm">Acessos da Lúmen</h3>
          </div>
          <ChevronRight size={14} className="text-tx-3 shrink-0" />
        </Card>
      </Link>

      {canConfig && driveStatus && (
        <>
          <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide px-1 pt-2">
            Administração
          </p>

          <details className="group" open>
            <Group icon={Plug} title="Modelos & Integrações" meta="8 itens">
              <Card className=" border-t-0">
                {/* Mesmas 3 categorias do site (Conexões / Captura automática / Documentos e
                    pastas — "Fluxo de trabalho" fica de fora aqui porque as colunas do Kanban só
                    são configuráveis no computador, ver ConfiguracoesPage). Antes era uma lista
                    só, linear, com os 8 itens abaixo sem nenhum agrupamento — a auditoria de
                    navegação (2026-08) apontou que essa era a única seção do app que não
                    acompanhou a reorganização que o site já tinha. */}
                <div className="px-4 pt-4 pb-1">
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-marca-tx">Conexões</p>
                  <p className="text-[11px] text-tx-2 mt-0.5">Contas de Google usadas pelo escritório</p>
                </div>

                <div className="p-4 border-t border-regua">
                  <p className="text-xs font-semibold text-tx-2 mb-2">Drive e e-mail</p>
                  {driveStatus.connected ? (
                    <div className="flex items-center gap-2 text-xs text-tx mb-2">
                      <CheckCircle2 size={14} className="text-concluido shrink-0" />
                      <span className="truncate">Conectado como <strong>{driveStatus.accountEmail}</strong></span>
                    </div>
                  ) : (
                    <p className="text-xs text-tx-2 mb-2">Nenhuma conta conectada ainda.</p>
                  )}
                  <a
                    href="/api/google/connect"
                    className="inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-2 w-fit"
                  >
                    <HardDrive size={13} /> {driveStatus.connected ? "Reconectar" : "Conectar"} Google
                  </a>
                </div>

                <div className="p-4 border-t border-regua">
                  <p className="text-xs font-semibold text-tx-2 mb-2">Publicações e andamentos processuais de e-mail</p>
                  <div className="space-y-1.5 mb-3">
                    {users.map((u) => {
                      const found = googleAccounts.find((a) => a.userId === u.id);
                      return (
                        <div key={u.id} className="flex items-center gap-1.5 text-xs">
                          <CheckCircle2 size={12} className={found ? "text-concluido shrink-0" : "text-tx-3 shrink-0"} />
                          <span className={found ? "text-tx" : "text-tx-2"}>{u.name}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-tx-2 mb-2">
                    {minhaConexao ? <>Sua conta: <strong>{minhaConexao.accountEmail}</strong></> : "Você ainda não conectou seu e-mail."}
                  </p>
                  <a
                    href="/api/google/connect?mode=jusbrasil"
                    className="inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-2 w-fit"
                  >
                    <HardDrive size={13} /> {minhaConexao ? "Reconectar" : "Conectar"} meu e-mail
                  </a>
                </div>

                <div className="px-4 pt-4 pb-1 border-t border-regua mt-1">
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-marca-tx">Captura automática</p>
                  <p className="text-[11px] text-tx-2 mt-0.5">De onde publicações, andamentos e mensagens chegam sozinhos</p>
                </div>

                <div className="p-4 border-t border-regua">
                  <p className="text-xs font-semibold text-tx-2 mb-1">Sincronizar publicações e andamentos</p>
                  <SyncPublicationsButton />
                </div>

                <div className="p-4 border-t border-regua">
                  <p className="text-xs font-semibold text-tx-2 mb-1 flex items-center gap-1.5"><Gavel size={13} /> DJEN (CNJ)</p>
                  <p className="text-[11px] text-tx-2 mb-2">OABs cadastradas em Equipe, no computador.</p>
                  <TestDjenButton />
                </div>

                <div className="p-4 border-t border-regua">
                  <p className="text-xs font-semibold text-tx-2 mb-1">Datajud — Andamentos (CNJ)</p>
                  <p className="text-[11px] text-tx-2 mb-2">
                    {processosMonitoradosCount} processo(s) monitorado(s) — API oficial, não sofre o bloqueio do DJEN.
                  </p>
                  {ultimoLogDatajud ? (
                    <p className={`text-[11px] px-2.5 py-1.5 rounded-md ${ultimoLogDatajud.sucesso ? "bg-concluido-bg text-concluido" : "bg-urgente-bg text-urgente"}`}>
                      Última execução {formatRelativeTimeMobile(ultimoLogDatajud.executadoEm)}: {ultimoLogDatajud.sucesso ? "sucesso" : "falhou"}
                    </p>
                  ) : (
                    <p className="text-[11px] text-aviso">Nenhuma execução registrada ainda.</p>
                  )}
                </div>

                <div className="p-4 border-t border-regua">
                  <p className="text-xs font-semibold text-tx-2 mb-1 flex items-center gap-1.5"><CalendarClock size={13} /> E-mail diário da agenda</p>
                  <TestEmailButton />
                </div>

                {modules?.whatsapp && (
                  <div className="p-4 border-t border-regua">
                    <p className="text-xs font-semibold text-tx-2 mb-2 flex items-center gap-1.5"><MessageCircle size={13} /> WhatsApp</p>
                    <WhatsappConfigForm connected={Boolean(whatsappConfig)} displayPhone={whatsappConfig?.displayPhone ?? null} />
                  </div>
                )}

                {driveStatus.connected && (
                  <>
                    <div className="px-4 pt-4 pb-1 border-t border-regua mt-1">
                      <p className="text-[10.5px] font-bold uppercase tracking-wide text-marca-tx">Documentos e pastas</p>
                      <p className="text-[11px] text-tx-2 mt-0.5">Organização do armazenamento</p>
                    </div>
                    <div className="p-4 border-t border-regua">
                      <p className="text-xs font-semibold text-tx-2 mb-2 flex items-center gap-1.5"><FolderCog size={13} /> Anexos do Drive</p>
                      <ReorganizeAttachmentsButton />
                    </div>
                  </>
                )}
              </Card>
            </Group>
          </details>

          {isAdmin && (
          <details className="group">
            <Group icon={Users} title="Equipe" meta={`${users.length} pessoas`}>
              <Card className=" border-t-0">
                <div className="divide-y divide-regua">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <span className="text-sm text-tx">{u.name}</span>
                      <span className="text-[11px] text-tx-2">{u.role}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-tx-2 p-4 pt-3 border-t border-regua">
                  Cadastro de membros, credenciais e acesso ao Financeiro é ajustável só no computador.
                </p>
              </Card>
            </Group>
          </details>
          )}

          {isAdmin && (
          <details className="group">
            <Group icon={SlidersHorizontal} title="Geral" meta="3 itens">
              <Card className=" border-t-0">
                <div className="p-4">
                  <p className="text-xs font-semibold text-tx-2 mb-2">Módulos contratados</p>
                  <div className="space-y-1.5">
                    {Object.entries(MODULE_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-tx-2">{label}</span>
                        <Badge color={modules?.[key as keyof typeof MODULE_LABELS] ? "green" : "slate"}>
                          {modules?.[key as keyof typeof MODULE_LABELS] ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-tx-2 mt-2">Liga/desliga só no computador.</p>
                </div>

                <div className="p-4 border-t border-regua">
                  <p className="text-xs font-semibold text-tx-2 mb-1.5 flex items-center gap-1.5"><Upload size={13} /> Importação de Dados</p>
                  <p className="text-[11px] text-tx-2 leading-relaxed">
                    Traz Processos/Casos/Atendimentos, Agenda, Financeiro e Contatos de uma planilha (.xlsx ou .csv) — cada tipo
                    tem um modelo próprio pra baixar, com as colunas esperadas (ex.: cliente, partes, tribunal, valor). Clientes e
                    partes citados na planilha são cadastrados automaticamente. O envio do arquivo é feito só pelo computador,
                    em Configurações → Geral → Importação de Dados.
                  </p>
                </div>

                <div className="p-4 border-t border-regua">
                  <p className="text-xs font-semibold text-tx-2 mb-2">TaskScore — como está configurado</p>
                  <div className="space-y-1.5">
                    {taskTypePointsRows.map((row) => (
                      <div key={row.type} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-tx-2">{taskTypeLabels[row.type] ?? row.type}</span>
                        <span className="font-semibold text-tx">{row.points} pts</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-tx-2 mt-2">Pontos por tarefa concluída. Ajustável só no computador.</p>
                </div>
              </Card>
            </Group>
          </details>
          )}

          {isAdmin && (
          <details className="group">
            <Group icon={Workflow} title="Workflows" meta={`${workflowTemplates.length} modelos`}>
              <Card className=" border-t-0">
                <div className="p-4">
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
            </Group>
          </details>
          )}

          {/* Fallback pra abrir o site completo (desktop) direto do app mobile — útil quando o
              PWA instalado no computador abre errado, ou quando alguém do celular precisa mesmo
              da versão completa por algum motivo pontual. Visível a QUALQUER usuário (não só
              admin), de propósito: é uma saída de emergência, não um recurso de administração. */}
          <a
            href="/painel"
            className="flex items-center justify-between gap-2 px-4 py-3.5 bg-sf border border-regua"
          >
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-marca-tx" />
              <h3 className="font-bold text-tx text-sm">Acessar site completo</h3>
            </div>
            <ChevronRight size={14} className="text-tx-3 shrink-0" />
          </a>

          {isAdmin && blogAccess && (
            <details className="group">
              <Group icon={Newspaper} title="Blog Jurídico" meta={`${blogPendingRaw.length} pendente(s)`}>
                <Card className=" border-t-0">
                  <div className="p-4 flex gap-2 flex-wrap">
                    <Link
                      href="/m/configuracoes?blogTab=revisao"
                      className={`text-xs font-semibold px-3 py-1.5 transition-colors ${
                        blogTab === "revisao" ? "bg-acao text-acao-tx" : "bg-sf-apoio text-tx-2 border border-regua"
                      }`}
                    >
                      Revisão {blogPendingRaw.length > 0 && `(${blogPendingRaw.length})`}
                    </Link>
                    <Link
                      href="/m/configuracoes?blogTab=publicadas"
                      className={`text-xs font-semibold px-3 py-1.5 transition-colors ${
                        blogTab === "publicadas" ? "bg-acao text-acao-tx" : "bg-sf-apoio text-tx-2 border border-regua"
                      }`}
                    >
                      Publicadas ({blogPublishedRaw.length})
                    </Link>
                    <Link
                      href="/m/configuracoes?blogTab=fotos"
                      className={`text-xs font-semibold px-3 py-1.5 transition-colors ${
                        blogTab === "fotos" ? "bg-acao text-acao-tx" : "bg-sf-apoio text-tx-2 border border-regua"
                      }`}
                    >
                      Fotos ({photos.length})
                    </Link>
                  </div>
                  <div className="border-t border-regua">
                    {blogTab === "revisao" ? (
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
                    ) : blogTab === "publicadas" ? (
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
                    ) : (
                      <PhotoLibraryManager photos={photos} />
                    )}
                  </div>
                </Card>
              </Group>
            </details>
          )}

          {isAdmin && (
          <details className="group">
            <Group
              icon={CreditCard}
              title="Cobrança"
              meta={ownBilling.subscription ? "configurada" : "não configurada"}
            >
              <Card className=" border-t-0">
                <div className="p-4">
                  <OfficeBillingSummary billing={ownBilling} />
                </div>
              </Card>
            </Group>
          </details>
          )}

          <p className="text-[11px] text-tx-2 px-1">
            {isAdmin ? "Só administradores veem este bloco." : "Bloco liberado apenas para configurar integrações."}
          </p>
        </>
      )}

    </div>
  );
}

function formatRelativeTimeMobile(date: Date): string {
  const minutos = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.round(horas / 24);
  return `há ${dias} dia(s)`;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-xs text-tx-2">{label}</span>
      <span className="text-sm font-medium text-tx truncate">{value || "—"}</span>
    </div>
  );
}

function Group({ icon: Icon, title, meta, children }: { icon: LucideIcon; title: string; meta: string; children: React.ReactNode }) {
  return (
    <>
      <summary className="list-none cursor-pointer marker:content-none">
        <div className="flex items-center gap-2 px-4 py-3.5 bg-sf border border-regua group-open:border-b-0">
          <Icon size={16} className="text-marca-tx shrink-0" />
          <h3 className="font-bold text-tx text-sm flex-1">{title}</h3>
          <span className="text-[10px] text-tx-2 font-medium">{meta}</span>
          <ChevronRight size={14} className="text-tx-3 transition-transform group-open:rotate-90 shrink-0" />
        </div>
      </summary>
      {children}
    </>
  );
}
