import Link from "next/link";
import { redirect } from "next/navigation";
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
import OfficeSuspendedNotice from "@/components/OfficeSuspendedNotice";
import { UndoToastProvider } from "@/components/UndoToastProvider";
import { getAlertsCount, getTodayAgendaCount } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// Aplica a classe `dark` no <html> de forma síncrona, antes do resto da árvore renderizar,
// para evitar o "flash" de tema errado (padrão comum em apps Next.js com next-themes/dark mode
// manual). Escopo: só o app mobile, então fica só neste layout — mesmos 2 estados do site
// (Manhã/Noite, ver lib/theme.ts), mas com chave de localStorage própria ("rp-mobile-theme",
// não "rp-site-theme") de propósito: o dono do escritório pode querer, por exemplo, o site
// sempre em Noite mas o app mobile em Manhã, sem um afetar o outro — só o NÚMERO de estados
// que agora é igual (até a remodelação do portal em 2026-08, o app mobile tinha um terceiro
// estado próprio, "Tarde"/auto, ver histórico de components/mobile/MobileThemeToggle.tsx).
//
// Usa toggle (não só add) de propósito: o layout raiz do site (app/layout.tsx) roda seu
// próprio script de tema antes deste e pode já ter deixado as classes no <html>. Se este
// script só adicionasse a classe quando escuro, uma visita direta a uma rota /m com o tema
// mobile em "light" herdaria (incorretamente) o que o script do site deixou. Com toggle, este
// script sempre decide o estado final para as rotas /m. Sem preferência salva, o padrão é
// "light" (Manhã), igual ao site. Mesmo padrão de migração do site (ver THEME_INIT_SCRIPT em
// lib/theme.ts): uma preferência salva como "auto" (do extinto modo Tarde) migra para "dark",
// não "light" — quem já tinha optado por um tema mais escuro não perde essa preferência.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("rp-mobile-theme");
    var dark = stored === "dark" || stored === "auto";
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  // Auth (assinatura do token) já é garantida pelo middleware global, que roda no Edge sem
  // acesso ao banco — por isso não pega uma conta desativada DEPOIS de o token já emitido
  // (até 30 dias de validade). O layout do site (app/(app)/layout.tsx) já reconferia isso a
  // cada requisição; aqui não conferia, e um usuário desativado continuava com acesso total
  // pelo PWA até o token expirar.
  const user = await getCurrentUser();
  if (!user || !user.active) redirect("/");

  // Escritório suspenso/cancelado por inadimplência (Painel Mestre): mesmo gate do site
  // (app/(app)/layout.tsx), que faltava aqui — o bloqueio de cobrança só existia no desktop,
  // e o PWA continuava de pé pro escritório inteiro.
  const office = await prisma.office.findUnique({ where: { id: user.officeId }, select: { status: true, name: true } });
  if (office && office.status !== "ATIVA" && !user.isPlatformOwner) {
    return <OfficeSuspendedNotice officeName={office.name} />;
  }

  const hasFinanceAccess = Boolean(user.isAdmin || user.financeAccess);
  // Contagem TOTAL de alertas (menções, prazos vencidos, tarefas delegadas, contas vencidas,
  // publicações não lidas etc. — ver lib/alerts.ts) — alimenta o badge do ícone do PWA
  // (AppBadgeSync) e o badge da aba "Alertas" no menu inferior. A contagem específica de
  // Publicações (usada no card próprio dela) já é buscada por app/m/page.tsx e
  // app/m/publicacoes/page.tsx, não precisa duplicar aqui.
  const [totalAlerts, todayAgendaCount, sessionSeconds] = await Promise.all([
    getAlertsCount(user.officeId, hasFinanceAccess, user.id, user.isAdmin),
    // Compromissos que vencem HOJE (mesmo critério do reforço "Hoje" do Painel) — alimenta a
    // bolinha da aba "Agenda" no menu inferior, separada da bolinha de Alertas.
    getTodayAgendaCount(user.officeId),
    getCurrentSessionElapsedSeconds(user.id),
  ]);

  return (
    <UndoToastProvider>
    <div className="min-h-screen bg-sf-fundo transition-colors">
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <InactivityNotice />
      <AppBadgeSync initialCount={totalAlerts} />
      {/* `sticky` (não `fixed`) de propósito: empilhado num flex-col junto com a faixa de
          suporte abaixo, este bloco fica colado no topo ao rolar sem precisar saber de
          antemão se a faixa vai aparecer ou não — quando ela existe, empurra o cabeçalho pra
          baixo sozinha (ocupa espaço no fluxo normal); quando não existe, o cabeçalho fica
          exatamente onde ficava antes. Isso também elimina o precisar compensar a altura no
          `<main>` com um pt-[52px] fixo (o antigo cabeçalho `fixed` exigia isso). */}
      <div className="sticky top-0 inset-x-0 z-40 flex flex-col">
        <SupportAccessBanner />
        {/* Cabeçalho sempre grafite, nos 2 temas (Manhã/Noite) — mesma casca fixa do Rail
            desktop (DESIGN-SYSTEM.md §3: "grafite nos dois temas"), de propósito sem classes
            `dark:`, pra não mudar de cor junto com o resto da tela. Nome+foto do perfil saiu
            daqui — agora é só logo/nome do escritório + Alertas/Tema, pra bater com a proposta
            de Início nova; Perfil segue acessível por Menu (Mais). */}
        <header className="min-h-[52px] shrink-0 bg-grafite-800 border-b border-white/10 text-white flex items-center justify-between gap-2 px-4 py-2">
          <Link href="/m" className="flex items-center gap-2 min-w-0">
            <LumenMark size={24} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-wide text-white">LÚMEN</span>
                <span className="h-1.5 w-1.5 rounded-full bg-concluido shrink-0" aria-hidden="true" />
              </div>
              {office?.name && (
                <p className="text-[10px] text-white/55 truncate max-w-[160px] leading-tight">{office.name}</p>
              )}
            </div>
          </Link>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              href="/m/alertas"
              aria-label={`Central de Alertas${totalAlerts > 0 ? `, ${totalAlerts} pendente(s)` : ""}`}
              className="relative h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-white/80 hover:text-marca hover:bg-white/10 transition-colors"
            >
              <Bell size={16} />
              {totalAlerts > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-[3px] rounded-full bg-atencao text-white text-[9px] font-bold flex items-center justify-center border border-grafite-800">
                  {totalAlerts > 99 ? "99+" : totalAlerts}
                </span>
              )}
            </Link>
            <MobileThemeToggle />
            {/* Ping silencioso de timesheet: o componente fica "hidden lg:flex" (nunca visível
                na largura do app mobile), mas mantém o mecanismo de contagem de sessão do dia
                rodando aqui também, já que este layout antes não contabilizava tempo de uso. */}
            <TimesheetTimer initialSeconds={sessionSeconds} />
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
