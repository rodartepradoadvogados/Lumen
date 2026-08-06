import Link from "next/link";
import { Bell } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";
import { getCurrentSessionElapsedSeconds } from "@/lib/timesheet";
import { prisma } from "@/lib/prisma";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import InstallPrompt from "@/components/mobile/InstallPrompt";
import MobileThemeToggle from "@/components/mobile/MobileThemeToggle";
import TimesheetTimer from "@/components/TimesheetTimer";
import InactivityNotice from "@/components/InactivityNotice";
import AppBadgeSync from "@/components/AppBadgeSync";
import LumenMark from "@/components/LumenMark";
import SupportAccessBanner from "@/components/SupportAccessBanner";
import { UndoToastProvider } from "@/components/UndoToastProvider";
import { getAlertsCount, getTodayAgendaCount } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// Aplica as classes `dark`/`theme-tarde` no <html> de forma síncrona, antes do resto da
// árvore renderizar, para evitar o "flash" de tema errado (padrão comum em apps Next.js com
// next-themes/dark mode manual). Escopo: só o app mobile, então fica só neste layout — mesmos
// 3 estados do site (Dia/Tarde/Noite, ver lib/theme.ts), mas com chave de localStorage própria
// ("rp-mobile-theme", não "rp-site-theme") de propósito: o dono do escritório pode querer,
// por exemplo, o site sempre em Noite mas o app mobile em Dia, sem um afetar o outro.
//
// Usa toggle (não só add) de propósito: o layout raiz do site (app/layout.tsx) roda seu
// próprio script de tema antes deste e pode já ter deixado as classes no <html>. Se este
// script só adicionasse a classe quando escuro, uma visita direta a uma rota /m com o tema
// mobile em "light" herdaria (incorretamente) o que o script do site deixou. Com toggle, este
// script sempre decide o estado final para as rotas /m. Sem preferência salva, o padrão é
// "light" (Dia), igual ao site.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("rp-mobile-theme");
    var mode = stored === "light" || stored === "dark" || stored === "auto" ? stored : "light";
    var dark = mode === "dark" || mode === "auto";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("theme-tarde", mode === "auto");
  } catch (e) {}
})();
`;

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  // Auth já é garantida pelo middleware global; aqui só lemos o usuário para o cabeçalho.
  const user = await getCurrentUser();
  const hasFinanceAccess = user ? Boolean(user.isAdmin || user.financeAccess) : false;
  // Contagem TOTAL de alertas (menções, prazos vencidos, tarefas delegadas, contas vencidas,
  // publicações não lidas etc. — ver lib/alerts.ts) — alimenta o badge do ícone do PWA
  // (AppBadgeSync) e o badge da aba "Alertas" no menu inferior. A contagem específica de
  // Publicações (usada no card próprio dela) já é buscada por app/m/page.tsx e
  // app/m/publicacoes/page.tsx, não precisa duplicar aqui.
  const [totalAlerts, todayAgendaCount, sessionSeconds, office] = await Promise.all([
    user ? getAlertsCount(user.officeId, hasFinanceAccess, user.id, user.isAdmin) : Promise.resolve(0),
    // Compromissos que vencem HOJE (mesmo critério do reforço "Hoje" do Painel) — alimenta a
    // bolinha da aba "Agenda" no menu inferior, separada da bolinha de Alertas.
    user ? getTodayAgendaCount(user.officeId) : Promise.resolve(0),
    user ? getCurrentSessionElapsedSeconds(user.id) : Promise.resolve(0),
    user ? prisma.office.findUnique({ where: { id: user.officeId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  return (
    <UndoToastProvider>
    <div className="min-h-screen bg-cream-100 dark:bg-navy-950 transition-colors">
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      {user && <InactivityNotice />}
      <AppBadgeSync initialCount={totalAlerts} />
      {/* `sticky` (não `fixed`) de propósito: empilhado num flex-col junto com a faixa de
          suporte abaixo, este bloco fica colado no topo ao rolar sem precisar saber de
          antemão se a faixa vai aparecer ou não — quando ela existe, empurra o cabeçalho pra
          baixo sozinha (ocupa espaço no fluxo normal); quando não existe, o cabeçalho fica
          exatamente onde ficava antes. Isso também elimina o precisar compensar a altura no
          `<main>` com um pt-[52px] fixo (o antigo cabeçalho `fixed` exigia isso). */}
      <div className="sticky top-0 inset-x-0 z-40 flex flex-col">
        <SupportAccessBanner />
        {/* Cabeçalho sempre navy, nos 3 temas (Dia/Tarde/Noite) — de propósito sem classes
            `dark:`, senão o Tarde tingiria o cabeçalho de bordô junto com os cards (mesmo
            motivo pelo qual components/Sidebar.tsx alterna a cor via JS, não via `dark:`).
            Nome+foto do perfil saiu daqui — agora é só logo/nome do escritório + Alertas/Tema,
            pra bater com a proposta de Início nova; Perfil segue acessível por Menu (Mais). */}
        <header className="min-h-[52px] shrink-0 bg-navy-900 border-b border-white/10 text-cream-50 flex items-center justify-between gap-2 px-4 py-2">
          <Link href="/m" className="flex items-center gap-2 min-w-0">
            <LumenMark size={24} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-serif text-sm font-bold tracking-wide text-cream-50">LÚMEN</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
              </div>
              {office?.name && (
                <p className="text-[10px] text-cream-50/55 truncate max-w-[160px] leading-tight">{office.name}</p>
              )}
            </div>
          </Link>
          <div className="flex items-center gap-1.5 shrink-0">
            {user && (
              <Link
                href="/m/alertas"
                aria-label={`Central de Alertas${totalAlerts > 0 ? `, ${totalAlerts} pendente(s)` : ""}`}
                className="relative h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-cream-50/80 hover:text-gold-400 hover:bg-white/10 transition-colors"
              >
                <Bell size={16} />
                {totalAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-bordo-600 text-white text-[9px] font-bold flex items-center justify-center border border-navy-900">
                    {totalAlerts > 99 ? "99+" : totalAlerts}
                  </span>
                )}
              </Link>
            )}
            <MobileThemeToggle />
            {/* Ping silencioso de timesheet: o componente fica "hidden lg:flex" (nunca visível
                na largura do app mobile), mas mantém o mecanismo de contagem de sessão do dia
                rodando aqui também, já que este layout antes não contabilizava tempo de uso. */}
            {user && <TimesheetTimer initialSeconds={sessionSeconds} />}
          </div>
        </header>
      </div>

      <main className="pb-20 min-h-screen">{children}</main>

      <MobileBottomNav alertsCount={totalAlerts} todayAgendaCount={todayAgendaCount} />
      <InstallPrompt />
    </div>
    </UndoToastProvider>
  );
}
