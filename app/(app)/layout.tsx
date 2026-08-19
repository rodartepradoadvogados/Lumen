import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import ClaudeAssistantWidget from "@/components/ClaudeAssistantWidget";
import InactivityNotice from "@/components/InactivityNotice";
import AppBadgeSync from "@/components/AppBadgeSync";
import ActingOfficeBanner from "@/components/ActingOfficeBanner";
import SupportAccessBanner from "@/components/SupportAccessBanner";
import OfficeSuspendedNotice from "@/components/OfficeSuspendedNotice";
import { UndoToastProvider } from "@/components/UndoToastProvider";
import { AnotacoesProvider } from "@/components/anotacoes/AnotacoesContext";
import AnotacoesPanel from "@/components/anotacoes/AnotacoesPanel";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { getOfficeModules } from "@/lib/officeModules";
import { getAlertsCount, getTodayAgendaCount } from "@/lib/alerts";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { countUnreadPublicationGroups } from "@/lib/publicationGrouping";

// TopBar consulta o banco em toda renderização (alertas, usuário logado) — nunca pré-renderizar estaticamente.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // O middleware só valida a assinatura do token (roda no Edge, sem acesso ao banco).
  // Aqui confirmamos que o usuário da sessão ainda existe/está ativo antes de liberar o app.
  const user = await getCurrentUser();
  if (!user || !user.active) {
    redirect("/");
  }

  // Escritório suspenso/cancelado (inadimplência — ver Painel Mestre): ninguém do escritório
  // entra, exceto platform owners (Jairo/Rodrigo), que precisam poder acessar pra resolver
  // isso com o dono do escritório. Não checa pro escritório interno (Rodarte Prado nunca é
  // bloqueado, mas a query roda igual — é barata e evita duplicar a lógica de "é interno").
  const office = await prisma.office.findUnique({ where: { id: user.officeId }, select: { status: true, name: true } });
  if (office && office.status !== "ATIVA" && !user.isPlatformOwner) {
    return <OfficeSuspendedNotice officeName={office.name} />;
  }

  const hasFinanceAccess = user.isAdmin || user.financeAccess;
  const [unreadPublicationsRaw, totalAlerts, todayAgendaCount, modules, blockedSet] = await Promise.all([
    prisma.publication.findMany({
      where: { officeId: user.officeId, reads: { none: { userId: user.id } } },
      select: { id: true, processNumberRaw: true, publishedAt: true },
    }),
    // Contagem TOTAL de alertas (menções, prazos vencidos, tarefas delegadas, contas
    // vencidas, publicações não lidas etc. — ver lib/alerts.ts) — alimenta o badge do ícone
    // do PWA (AppBadgeSync) e o badge do item "Alertas" na Sidebar, diferente de
    // `unreadPublications` acima, que é específico da aba/menu Publicações.
    getAlertsCount(user.officeId, hasFinanceAccess, user.id, user.isAdmin),
    // Quantos compromissos vencem HOJE (mesmo critério do reforço "Hoje" do Painel, ver
    // getTodayItems) — alimenta a bolinha do item "Agenda" na Sidebar. Escritório inteiro, não
    // só do usuário: os outros badges da Sidebar (Publicações, Alertas) também são do escritório,
    // e a Agenda em si já lista os compromissos de todo mundo por padrão.
    getTodayAgendaCount(user.officeId),
    getOfficeModules(user.officeId),
    getBlockedProcessNumberSet(user.id),
  ]);
  // Bloqueio de processo é por usuário — não conta pro badge de quem bloqueou. Contagem por
  // GRUPO (mesmo processo), não por linha — ver lib/publicationGrouping.ts: elimina a
  // duplicidade do badge quando o mesmo evento chega por mais de uma fonte (DJEN + Datajud +
  // e-mail do Jusbrasil...), mesmo problema resolvido na listagem de /publicacoes.
  const unreadPublications = countUnreadPublicationGroups(unreadPublicationsRaw.filter((p) => !isBlockedForViewer(p.processNumberRaw, blockedSet)));

  return (
    <UndoToastProvider>
      {/* AnotacoesProvider (painel global "Anotações", faixa retrátil na borda direita) precisa
          envolver tanto o AppShell (que renderiza o próprio painel) quanto o ClaudeAssistantWidget
          (que lê o contexto só para se deslocar quando o painel está aberto — ver
          components/anotacoes/AnotacoesContext.tsx). */}
      <AnotacoesProvider>
        {/* AppShell (client) é quem de fato monta sidebar/topbar/faixas — aqui só resolve os dados
            server-side de sempre e repassa como children/props. Guarda também as abas internas
            (duplo clique num item da Sidebar) — ver components/AppShell.tsx. */}
        <AppShell
          sidebarProps={{
            hasFinanceAccess,
            unreadPublications,
            totalAlerts,
            todayAgendaCount,
            modules,
          }}
          topBar={<TopBar hasFinanceAccess={hasFinanceAccess} modules={modules} />}
          supportBanner={<SupportAccessBanner />}
          inactivityNotice={<InactivityNotice />}
          badgeSync={<AppBadgeSync initialCount={totalAlerts} />}
          actingBanner={user.actingAsOffice ? <ActingOfficeBanner officeName={user.actingAsOffice.name} /> : null}
          claudeWidget={<ClaudeAssistantWidget userName={user.name} />}
          anotacoesPanel={<AnotacoesPanel />}
        >
          {children}
        </AppShell>
      </AnotacoesProvider>
    </UndoToastProvider>
  );
}
