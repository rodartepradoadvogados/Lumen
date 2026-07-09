import { Search, Bell, Plus, LogOut } from "lucide-react";
import Link from "next/link";
import { getAlerts } from "@/lib/alerts";
import { getCurrentUser } from "@/lib/currentUser";
import { logout } from "@/lib/actions/auth";

export default async function TopBar() {
  const [alerts, user] = await Promise.all([getAlerts(), getCurrentUser()]);
  const highCount = alerts.filter((a) => a.severity === "alta").length;
  const initials = user
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("")
    : "??";

  return (
    <header className="h-16 shrink-0 bg-cream-50/80 backdrop-blur border-b border-gold-500/20 flex items-center justify-between px-6 gap-4">
      <div className="flex-1 max-w-md relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-800/40" />
        <input
          type="text"
          placeholder="Pesquisar processo, contato ou tarefa..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-navy-800/10 bg-white text-sm text-navy-900 placeholder:text-navy-800/40 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
        />
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/processos/novo"
          className="hidden sm:flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-cream-50 text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Novo Caso
        </Link>

        <Link href="/alertas" className="relative p-2 rounded-lg hover:bg-navy-900/5 transition-colors">
          <Bell size={20} className="text-navy-800" />
          {alerts.length > 0 && (
            <span className={`absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white ${highCount > 0 ? "bg-red-600" : "bg-gold-600"}`}>
              {alerts.length > 9 ? "9+" : alerts.length}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 pl-3 border-l border-navy-800/10">
          <div className="h-8 w-8 rounded-full bg-navy-800 text-gold-400 flex items-center justify-center text-xs font-semibold">
            {initials}
          </div>
          <div className="hidden md:block leading-tight">
            <p className="text-sm font-medium text-navy-900">{user?.name ?? "Não identificado"}</p>
            <p className="text-[11px] text-navy-800/50">{user?.role ?? ""}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              title="Sair"
              className="p-2 rounded-lg hover:bg-navy-900/5 transition-colors text-navy-800/50 hover:text-navy-900"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
