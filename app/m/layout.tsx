import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { getTodayElapsedSeconds } from "@/lib/timesheet";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import InstallPrompt from "@/components/mobile/InstallPrompt";
import MobileThemeToggle from "@/components/mobile/MobileThemeToggle";
import TimesheetTimer from "@/components/TimesheetTimer";
import InactivityNotice from "@/components/InactivityNotice";
import AppBadgeSync from "@/components/AppBadgeSync";
import LumenMark from "@/components/LumenMark";
import { UndoToastProvider } from "@/components/UndoToastProvider";

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

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  // Auth já é garantida pelo middleware global; aqui só lemos o usuário para o cabeçalho.
  const user = await getCurrentUser();
  const [unreadCount, todaySeconds] = await Promise.all([
    user ? prisma.publication.count({ where: { read: false, officeId: user.officeId } }) : Promise.resolve(0),
    user ? getTodayElapsedSeconds(user.id) : Promise.resolve(0),
  ]);

  return (
    <UndoToastProvider>
    <div className="min-h-screen bg-cream-100 dark:bg-navy-950 transition-colors">
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      {user && <InactivityNotice />}
      <AppBadgeSync initialCount={unreadCount} />
      {/* Cabeçalho sempre navy, nos 3 temas (Dia/Tarde/Noite) — de propósito sem classes
          `dark:`, senão o Tarde tingiria o cabeçalho de bordô junto com os cards (mesmo
          motivo pelo qual components/Sidebar.tsx alterna a cor via JS, não via `dark:`). */}
      <header className="fixed top-0 inset-x-0 h-[52px] bg-navy-900 border-b border-white/10 text-cream-50 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-1.5">
          <LumenMark size={22} />
          <span className="font-serif text-sm font-bold tracking-wide text-cream-50">LÚMEN</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MobileThemeToggle />
          {/* Ping silencioso de timesheet: o componente fica "hidden lg:flex" (nunca visível
              na largura do app mobile), mas mantém o mecanismo de contagem de sessão do dia
              rodando aqui também, já que este layout antes não contabilizava tempo de uso. */}
          {user && <TimesheetTimer initialSeconds={todaySeconds} />}
          {user && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-cream-50/70 max-w-[120px] truncate">{user.name.split(" ")[0]}</span>
              <span className="h-8 w-8 rounded-full bg-navy-700 dark:bg-navy-800 text-gold-400 flex items-center justify-center text-[11px] font-bold">
                {initials(user.name)}
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="pt-[52px] pb-20 min-h-screen">{children}</main>

      <MobileBottomNav unreadCount={unreadCount} />
      <InstallPrompt />
    </div>
    </UndoToastProvider>
  );
}
