import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card } from "@/components/ui";
import MobileChangePasswordForm from "@/components/mobile/MobileChangePasswordForm";
import NotificationPreferences from "@/components/mobile/NotificationPreferences";
import SyncPublicationsButton from "@/components/SyncPublicationsButton";
import TestDjenButton from "@/components/TestDjenButton";
import TestEmailButton from "@/components/TestEmailButton";
import WhatsappConfigForm from "@/components/WhatsappConfigForm";
import ReorganizeAttachmentsButton from "@/components/ReorganizeAttachmentsButton";
import { getDriveStatus, listGoogleAccounts } from "@/lib/googleDrive";
import { getOfficeModules, hasBlogAccess } from "@/lib/officeModules";
import {
  ArrowLeft,
  User,
  KeyRound,
  Bell,
  Plug,
  Users,
  DollarSign,
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
  type LucideIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MobileConfiguracoes() {
  const viewer = await getCurrentUser();
  if (!viewer) return null;
  const officeId = viewer.officeId;
  const isAdmin = viewer.isAdmin;

  const [modules, blogAccess, driveStatus, googleAccounts, users, whatsappConfig, workflowTemplates, categories, costCenters, blogPending, blogPublished] =
    isAdmin
      ? await Promise.all([
          getOfficeModules(officeId),
          hasBlogAccess(officeId),
          getDriveStatus(officeId),
          listGoogleAccounts(officeId),
          prisma.user.findMany({ where: { officeId, active: true }, select: { id: true, name: true } }),
          prisma.whatsappConfig.findUnique({ where: { officeId } }),
          prisma.workflowTemplate.findMany({ where: { officeId }, select: { name: true, active: true } }),
          prisma.financialCategory.count({ where: { officeId } }),
          prisma.costCenter.count({ where: { officeId } }),
          prisma.blogPost.count({ where: { officeId, status: "AGUARDANDO_REVISAO" } }),
          prisma.blogPost.count({ where: { officeId, status: "PUBLICADO" } }),
        ])
      : [null, false, null, [], [], null, [], 0, 0, 0, 0];

  const initials = viewer.name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  const minhaConexao = googleAccounts.find((a) => a.userId === viewer.id);

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
              <SummaryBody text="Cadastro de membros, credenciais e acesso ao Financeiro. Ajustável só no computador." />
            </Group>
          </details>

          <details className="group">
            <Group icon={DollarSign} title="Financeiro" meta={`${categories} categorias`}>
              <SummaryBody text={`Plano de contas (${categories} categorias) e ${costCenters} centro(s) de custo. Ajustável só no computador.`} />
            </Group>
          </details>

          <details className="group">
            <Group icon={SlidersHorizontal} title="Geral" meta="3 itens">
              <SummaryBody text="Módulos contratados, importação de dados e TaskScore (pontuação por tipo de tarefa). Ajustável só no computador." />
            </Group>
          </details>

          <details className="group">
            <Group icon={Workflow} title="Workflows" meta={`${workflowTemplates.length} modelos`}>
              <SummaryBody
                text={
                  workflowTemplates.length > 0
                    ? workflowTemplates.map((w) => w.name).join(" · ")
                    : "Nenhum workflow cadastrado ainda. Cadastrável só no computador."
                }
              />
            </Group>
          </details>

          {blogAccess && (
            <details className="group">
              <Group icon={Newspaper} title="Blog Jurídico" meta={`${blogPending} pendente(s)`}>
                <SummaryBody text={`${blogPending} matéria(s) aguardando revisão · ${blogPublished} publicada(s). Ajustável só no computador.`} />
              </Group>
            </details>
          )}

          <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40 px-1">
            Só administradores veem este bloco.
          </p>
        </>
      )}
    </div>
  );
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

function SummaryBody({ text }: { text: string }) {
  return (
    <Card className="!rounded-t-none border-t-0">
      <p className="text-xs text-navy-800/60 dark:text-cream-50/60 leading-relaxed p-4">{text}</p>
    </Card>
  );
}
