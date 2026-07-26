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
import { getDriveStatus, listGoogleAccounts } from "@/lib/googleDrive";
import { getOfficeModules, hasBlogAccess, type OfficeModules } from "@/lib/officeModules";
import { getOwnOfficeBilling } from "@/lib/actions/subscriptionBilling";
import {
  ArrowLeft,
  User,
  KeyRound,
  Bell,
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

export default async function MobileConfiguracoes() {
  const viewer = await getCurrentUser();
  if (!viewer) return null;
  const officeId = viewer.officeId;
  const isAdmin = viewer.isAdmin;

  const [
    modules,
    blogAccess,
    driveStatus,
    googleAccounts,
    users,
    whatsappConfig,
    workflowTemplates,
    taskTypePoints,
    blogPending,
    blogPublished,
    roboExecucaoLogs,
    processosMonitoradosCount,
    ownBilling,
  ] = isAdmin
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
        prisma.blogPost.count({ where: { officeId, status: "AGUARDANDO_REVISAO" } }),
        prisma.blogPost.count({ where: { officeId, status: "PUBLICADO" } }),
        // Tabelas globais espelhadas do robô Python (sem officeId) — só pra mostrar o status
        // real das últimas execuções, igual ao card equivalente no computador.
        prisma.roboExecucaoLog.findMany({ orderBy: { executadoEm: "desc" }, take: 10 }),
        prisma.roboProcessoMonitorado.count(),
        getOwnOfficeBilling(),
      ])
    : [null, false, null, [], [], null, [], [], 0, 0, [], 0, { subscription: null, invoices: [] }];

  const initials = viewer.name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  const minhaConexao = googleAccounts.find((a) => a.userId === viewer.id);
  const ultimoLogDatajud = roboExecucaoLogs.find((l) => l.fonte === "DATAJUD");
  const taskTypePointsRows = TASK_TYPES_ORDER.map((type) => {
    const found = taskTypePoints.find((p) => p.type === type);
    return { type, points: found?.points ?? 10 };
  });

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
        <ArrowLeft size={13} /> Início
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Configurações</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">Perfil e preferências da conta</p>
      </div>

      <div className="flex items-center gap-3 px-1">
        <div className="h-12 w-12 rounded-full bg-navy-800 text-gold-400 flex items-center justify-center text-sm font-serif font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-serif font-bold text-navy-900 dark:text-cream-50 leading-tight truncate">{viewer.name}</p>
          <p className="text-xs text-navy-800/45 dark:text-cream-50/45 truncate">{viewer.email}</p>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-navy-800/8 dark:border-white/10">
          <User size={16} className="text-gold-600" />
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Minha conta</h3>
        </div>
        <div className="divide-y divide-navy-800/5 dark:divide-white/10">
          <Field label="Cargo" value={viewer.role} />
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <KeyRound size={14} className="text-navy-800/40 dark:text-cream-50/40" />
              <span className="text-sm font-medium text-navy-900 dark:text-cream-50">Trocar minha senha</span>
            </div>
            <MobileChangePasswordForm />
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-navy-800/8 dark:border-white/10">
          <Bell size={16} className="text-gold-600" />
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm">Notificações</h3>
        </div>
        <NotificationPreferences />
      </Card>

      {isAdmin && driveStatus && (
        <>
          <p className="text-xs font-semibold text-navy-800/40 dark:text-cream-50/40 uppercase tracking-wide px-1 pt-2">
            Administração
          </p>

          <details className="group" open>
            <Group icon={Plug} title="Modelos & Integrações" meta="8 itens">
              <Card className="!rounded-t-none border-t-0">
                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-1">Sincronizar publicações e andamentos</p>
                    <SyncPublicationsButton />
                  </div>
                </div>

                <div className="p-4 border-t border-navy-800/8 dark:border-white/10">
                  <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-2">Drive e e-mail</p>
                  {driveStatus.connected ? (
                    <div className="flex items-center gap-2 text-xs text-navy-900 dark:text-cream-50 mb-2">
                      <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="truncate">Conectado como <strong>{driveStatus.accountEmail}</strong></span>
                    </div>
                  ) : (
                    <p className="text-xs text-navy-800/60 dark:text-cream-50/60 mb-2">Nenhuma conta conectada ainda.</p>
                  )}
                  <a
                    href="/api/google/connect"
                    className="inline-flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold rounded-lg px-3 py-2 w-fit"
                  >
                    <HardDrive size={13} /> {driveStatus.connected ? "Reconectar" : "Conectar"} Google
                  </a>
                </div>

                <div className="p-4 border-t border-navy-800/8 dark:border-white/10">
                  <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-2">Publicações e andamentos processuais de e-mail</p>
                  <div className="space-y-1.5 mb-3">
                    {users.map((u) => {
                      const found = googleAccounts.find((a) => a.userId === u.id);
                      return (
                        <div key={u.id} className="flex items-center gap-1.5 text-xs">
                          <CheckCircle2 size={12} className={found ? "text-emerald-600 dark:text-emerald-400 shrink-0" : "text-navy-800/25 dark:text-cream-50/25 shrink-0"} />
                          <span className={found ? "text-navy-900 dark:text-cream-50" : "text-navy-800/45 dark:text-cream-50/45"}>{u.name}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 mb-2">
                    {minhaConexao ? <>Sua conta: <strong>{minhaConexao.accountEmail}</strong></> : "Você ainda não conectou seu e-mail."}
                  </p>
                  <a
                    href="/api/google/connect?mode=jusbrasil"
                    className="inline-flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold rounded-lg px-3 py-2 w-fit"
                  >
                    <HardDrive size={13} /> {minhaConexao ? "Reconectar" : "Conectar"} meu e-mail
                  </a>
                </div>

                <div className="p-4 border-t border-navy-800/8 dark:border-white/10">
                  <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-1 flex items-center gap-1.5"><Gavel size={13} /> DJEN (CNJ)</p>
                  <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 mb-2">OABs cadastradas em Equipe, no computador.</p>
                  <TestDjenButton />
                </div>

                <div className="p-4 border-t border-navy-800/8 dark:border-white/10">
                  <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-1">Datajud — Andamentos (CNJ)</p>
                  <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 mb-2">
                    {processosMonitoradosCount} processo(s) monitorado(s) — API oficial, não sofre o bloqueio do DJEN.
                  </p>
                  {ultimoLogDatajud ? (
                    <p className={`text-[11px] rounded-lg px-2.5 py-1.5 ${ultimoLogDatajud.sucesso ? "bg-emerald-50 dark:bg-emerald-400/10 text-emerald-800 dark:text-emerald-300" : "bg-red-50 dark:bg-bordo-400/10 text-red-700 dark:text-bordo-400"}`}>
                      Última execução {formatRelativeTimeMobile(ultimoLogDatajud.executadoEm)}: {ultimoLogDatajud.sucesso ? "sucesso" : "falhou"}
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">Nenhuma execução registrada ainda.</p>
                  )}
                </div>

                <div className="p-4 border-t border-navy-800/8 dark:border-white/10">
                  <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-1 flex items-center gap-1.5"><CalendarClock size={13} /> E-mail diário da agenda</p>
                  <TestEmailButton />
                </div>

                {modules?.whatsapp && (
                  <div className="p-4 border-t border-navy-800/8 dark:border-white/10">
                    <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-2 flex items-center gap-1.5"><MessageCircle size={13} /> WhatsApp</p>
                    <WhatsappConfigForm connected={Boolean(whatsappConfig)} displayPhone={whatsappConfig?.displayPhone ?? null} />
                  </div>
                )}

                {driveStatus.connected && (
                  <div className="p-4 border-t border-navy-800/8 dark:border-white/10">
                    <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-2 flex items-center gap-1.5"><FolderCog size={13} /> Anexos do Drive</p>
                    <ReorganizeAttachmentsButton />
                  </div>
                )}
              </Card>
            </Group>
          </details>

          <details className="group">
            <Group icon={Users} title="Equipe" meta={`${users.length} pessoas`}>
              <Card className="!rounded-t-none border-t-0">
                <div className="divide-y divide-navy-800/5 dark:divide-white/10">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <span className="text-sm text-navy-900 dark:text-cream-50">{u.name}</span>
                      <span className="text-[11px] text-navy-800/45 dark:text-cream-50/45">{u.role}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 p-4 pt-3 border-t border-navy-800/8 dark:border-white/10">
                  Cadastro de membros, credenciais e acesso ao Financeiro é ajustável só no computador.
                </p>
              </Card>
            </Group>
          </details>

          <details className="group">
            <Group icon={SlidersHorizontal} title="Geral" meta="3 itens">
              <Card className="!rounded-t-none border-t-0">
                <div className="p-4">
                  <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-2">Módulos contratados</p>
                  <div className="space-y-1.5">
                    {Object.entries(MODULE_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-navy-800 dark:text-cream-50/85">{label}</span>
                        <Badge color={modules?.[key as keyof typeof MODULE_LABELS] ? "green" : "slate"}>
                          {modules?.[key as keyof typeof MODULE_LABELS] ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 mt-2">Liga/desliga só no computador.</p>
                </div>

                <div className="p-4 border-t border-navy-800/8 dark:border-white/10">
                  <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-1.5 flex items-center gap-1.5"><Upload size={13} /> Importação de Dados</p>
                  <p className="text-[11px] text-navy-800/60 dark:text-cream-50/60 leading-relaxed">
                    Traz Processos/Casos/Atendimentos, Agenda, Financeiro e Contatos de uma planilha (.xlsx ou .csv) — cada tipo
                    tem um modelo próprio pra baixar, com as colunas esperadas (ex.: cliente, partes, tribunal, valor). Clientes e
                    partes citados na planilha são cadastrados automaticamente. O envio do arquivo é feito só pelo computador,
                    em Configurações → Geral → Importação de Dados.
                  </p>
                </div>

                <div className="p-4 border-t border-navy-800/8 dark:border-white/10">
                  <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-2">TaskScore — como está configurado</p>
                  <div className="space-y-1.5">
                    {taskTypePointsRows.map((row) => (
                      <div key={row.type} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-navy-800 dark:text-cream-50/85">{taskTypeLabels[row.type] ?? row.type}</span>
                        <span className="font-semibold text-navy-900 dark:text-cream-50">{row.points} pts</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 mt-2">Pontos por tarefa concluída. Ajustável só no computador.</p>
                </div>
              </Card>
            </Group>
          </details>

          <details className="group">
            <Group icon={Workflow} title="Workflows" meta={`${workflowTemplates.length} modelos`}>
              <Card className="!rounded-t-none border-t-0">
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

          {blogAccess && (
            <details className="group">
              <Group icon={Newspaper} title="Blog Jurídico" meta={`${blogPending} pendente(s)`}>
                <Card className="!rounded-t-none border-t-0">
                  <p className="text-xs text-navy-800/60 dark:text-cream-50/60 leading-relaxed p-4">
                    {blogPending} matéria(s) aguardando revisão · {blogPublished} publicada(s). Ajustável só no computador.
                  </p>
                </Card>
              </Group>
            </details>
          )}

          <details className="group">
            <Group
              icon={CreditCard}
              title="Cobrança"
              meta={ownBilling.subscription ? "configurada" : "não configurada"}
            >
              <Card className="!rounded-t-none border-t-0">
                <div className="p-4">
                  <OfficeBillingSummary billing={ownBilling} />
                </div>
              </Card>
            </Group>
          </details>

          <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40 px-1">
            Só administradores veem este bloco.
          </p>
        </>
      )}

      <style>{`
        .cfg-input { border: 1px solid rgba(15,31,61,0.15); border-radius: 0.5rem; padding: 0.4rem 0.6rem; font-size: 0.8rem; background: transparent; color: inherit; }
        .cfg-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
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
      <span className="text-xs text-navy-800/50 dark:text-cream-50/50">{label}</span>
      <span className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{value || "—"}</span>
    </div>
  );
}

function Group({ icon: Icon, title, meta, children }: { icon: LucideIcon; title: string; meta: string; children: React.ReactNode }) {
  return (
    <>
      <summary className="list-none cursor-pointer marker:content-none">
        <div className="flex items-center gap-2 px-4 py-3.5 bg-white dark:bg-navy-900 border border-navy-800/8 dark:border-white/10 rounded-xl group-open:rounded-b-none group-open:border-b-0">
          <Icon size={16} className="text-gold-600 shrink-0" />
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-sm flex-1">{title}</h3>
          <span className="text-[10px] text-navy-800/40 dark:text-cream-50/40 font-medium">{meta}</span>
          <ChevronRight size={14} className="text-navy-800/30 dark:text-cream-50/30 transition-transform group-open:rotate-90 shrink-0" />
        </div>
      </summary>
      {children}
    </>
  );
}
