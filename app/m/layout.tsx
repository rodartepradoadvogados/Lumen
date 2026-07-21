import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import InstallPrompt from "@/components/mobile/InstallPrompt";
import MobileThemeToggle from "@/components/mobile/MobileThemeToggle";

export const dynamic = "force-dynamic";

// Aplica a classe `dark` no <html> de forma síncrona, antes do resto da árvore renderizar,
// para evitar o "flash" de tema claro em quem já escolheu o escuro (padrão comum em apps Next.js
// com next-themes/dark mode manual). Escopo: só o app mobile, então fica só neste layout.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("rp-mobile-theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
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
  const [user, unreadCount] = await Promise.all([
    getCurrentUser(),
    prisma.publication.count({ where: { read: false } }),
  ]);

  return (
    <div className="min-h-screen bg-cream-100 dark:bg-navy-950 transition-colors">
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />

      <header className="fixed top-0 inset-x-0 h-[52px] bg-navy-900 dark:bg-navy-950 dark:border-b dark:border-white/10 text-cream-50 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-gold-500" />
          <span className="font-serif text-sm font-bold tracking-wide text-cream-50">RODARTE PRADO</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MobileThemeToggle />
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
  );
}
