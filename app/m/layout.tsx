import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import InstallPrompt from "@/components/mobile/InstallPrompt";

export const dynamic = "force-dynamic";

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
    <div className="min-h-screen bg-cream-100">
      <header className="fixed top-0 inset-x-0 h-[52px] bg-navy-900 text-cream-50 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-gold-500" />
          <span className="font-serif text-sm font-bold tracking-wide text-cream-50">RODARTE PRADO</span>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-cream-50/70 max-w-[120px] truncate">{user.name.split(" ")[0]}</span>
            <span className="h-8 w-8 rounded-full bg-navy-700 text-gold-400 flex items-center justify-center text-[11px] font-bold">
              {initials(user.name)}
            </span>
          </div>
        )}
      </header>

      <main className="pt-[52px] pb-20 min-h-screen">{children}</main>

      <MobileBottomNav unreadCount={unreadCount} />
      <InstallPrompt />
    </div>
  );
}
