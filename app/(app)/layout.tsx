import { Suspense } from "react";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import ClaudeAssistantWidget from "@/components/ClaudeAssistantWidget";
import InactivityNotice from "@/components/InactivityNotice";
import SiteBackgroundLayer from "@/components/SiteBackgroundLayer";
import AppBadgeSync from "@/components/AppBadgeSync";
import ActingOfficeBanner from "@/components/ActingOfficeBanner";
import SupportAccessBanner from "@/components/SupportAccessBanner";
import { UndoToastProvider } from "@/components/UndoToastProvider";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { getOfficeModules } from "@/lib/officeModules";
import { getAlertsCount } from "@/lib/alerts";
import { getBlockedProcessNumberSet, isBlockedForViewer } from "@/lib/blockedProcessNumbers";
import { Lock } from "lucide-react";

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50 dark:bg-navy-950 p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-bordo-700/10 dark:bg-bordo-400/15 flex items-center justify-center">
            <Lock size={22} className="text-bordo-700 dark:text-bordo-400" />
          </div>
          <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Acesso temporariamente suspenso</h1>
          <p className="text-sm text-navy-800/60 dark:text-cream-50/60">
            O acesso do escritório <strong>{office.name}</strong> está suspenso. Entre em contato com o Rodarte Prado Advogados
            para regularizar a situação e liberar o acesso novamente.
          </p>
        </div>
      </div>
    );
  }

  const hasFinanceAccess = user.isAdmin || user.financeAccess;
  const [unreadPublicationsRaw, totalAlerts, modules, blockedSet] = await Promise.all([
    prisma.publication.findMany({
      where: { officeId: user.officeId, reads: { none: { userId: user.id } } },
      select: { processNumberRaw: true },
    }),
    // Contagem TOTAL de alertas (menções, prazos vencidos, tarefas delegadas, contas
    // vencidas, publicações não lidas etc. — ver lib/alerts.ts) — alimenta o badge do ícone
    // do PWA (AppBadgeSync) e o badge do item "Alertas" na Sidebar, diferente de
    // `unreadPublications` acima, que é específico da aba/menu Publicações.
    getAlertsCount(user.officeId, hasFinanceAccess, user.id, user.isAdmin),
    getOfficeModules(user.officeId),
    getBlockedProcessNumberSet(user.id),
  ]);
  // Bloqueio de processo é por usuário — não conta pro badge de quem bloqueou.
  const unreadPublications = unreadPublicationsRaw.filter((p) => !isBlockedForViewer(p.processNumberRaw, blockedSet)).length;

  return (
    <UndoToastProvider>
      {/* Coluna vertical: faixa de suporte (se houver sessão ativa) acima de tudo, inclusive
          acima da sidebar — depois o corpo do app (sidebar + conteúdo) ocupando o resto da
          altura. Fica fora do "flex h-screen" original de propósito, pra faixa nunca competir
          por altura fixa com sidebar/conteúdo (ela só aparece quando existe sessão). */}
      <div className="flex flex-col h-screen overflow-hidden">
        <SupportAccessBanner />
        <div className="flex flex-1 overflow-hidden">
          <InactivityNotice />
          <AppBadgeSync initialCount={totalAlerts} />
          <Suspense fallback={null}>
            <Sidebar
              hasFinanceAccess={hasFinanceAccess}
              isAdmin={user.isAdmin}
              unreadPublications={unreadPublications}
              totalAlerts={totalAlerts}
              modules={modules}
            />
          </Suspense>
          <div className="flex-1 flex flex-col min-w-0 relative">
            <Suspense fallback={null}>
              <SiteBackgroundLayer />
            </Suspense>
            {user.actingAsOffice && <ActingOfficeBanner officeName={user.actingAsOffice.name} />}
            <TopBar />
            <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
          </div>
          <ClaudeAssistantWidget userName={user.name} />
        </div>
      </div>
    </UndoToastProvider>
  );
}
