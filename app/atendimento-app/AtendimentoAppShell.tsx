"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus, MessageSquare, LayoutDashboard, Users, Settings } from "lucide-react";
import { ReactNode } from "react";

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("rp-atendimento-theme");
    var el = document.getElementById("atendimento-shell");
    if (el && (stored === "dark" || stored === "auto")) el.classList.add("atendimento-dark");
  } catch (e) {}
})();
`;

export default function AtendimentoAppShell({ officeName, children }: { officeName?: string; children: ReactNode }) {
  return (
    <>
    {/* eslint-disable-next-line react/no-danger */}
    <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
    <script dangerouslySetInnerHTML={{ __html: `
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw-atendimento.js', {scope: '/atendimento-app/'}).catch(()=>{});
      }
    `}} />
    <div id="atendimento-shell" className="atendimento-shell min-h-screen bg-sf-fundo transition-colors">
      <AtendimentoAppHeader officeName={officeName} />
      <main className="pb-20 min-h-screen max-w-md mx-auto px-4">{children}</main>
      <AtendimentoAppBottomNav />
    </div>
    </>
  );
}

function AtendimentoAppHeader({ officeName }: { officeName?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("rp-atendimento-theme") as "light" | "dark" | "auto" | null;
    const isDark = stored === "dark" || (stored === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setTheme(isDark ? "dark" : "light");
    document.getElementById("atendimento-shell")?.classList.toggle("atendimento-dark", isDark);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("rp-atendimento-theme", newTheme);
    document.getElementById("atendimento-shell")?.classList.toggle("atendimento-dark", newTheme === "dark");
  };

  return (
    <header className="sticky top-0 z-40 min-h-[56px] bg-grafite-800 border-b border-gaveta-linha text-gaveta-tinta flex items-center justify-between gap-2 px-4 py-2">
      <Link href="/atendimento-app" className="flex items-center gap-2 min-w-0">
        <svg width="28" height="28" viewBox="0 0 120 120" className="shrink-0">
          <rect width="120" height="120" rx="27" fill="#c9962f"/>
          <rect x="4.5" y="4.5" width="111" height="111" rx="23" fill="none" stroke="#16191d" strokeOpacity=".35" strokeWidth="1.3"/>
          <rect x="33" y="30" width="54" height="60" rx="3" fill="#16191d"/>
          <rect x="50" y="30" width="6" height="46" fill="#c9962f"/>
          <rect x="50" y="72" width="37" height="6" fill="#c9962f"/>
          <rect x="50" y="72" width="6" height="6" fill="#cd5f77"/>
          <rect x="33" y="88" width="54" height="2.4" fill="#cd5f77"/>
        </svg>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold tracking-wide text-gaveta-tinta">ATENDIMENTO</span>
            <span className="h-1.5 w-1.5 rounded-full bg-concluido shrink-0" aria-hidden="true" />
          </div>
          {officeName && <p className="text-corpo text-gaveta-tinta-2 truncate max-w-[160px] leading-tight">{officeName}</p>}
        </div>
      </Link>
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={toggleTheme} aria-label={theme === "light" ? "Tema escuro" : "Tema claro"} className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-gaveta-tinta-2 hover:text-ouro-acento hover:bg-gaveta-fundo transition-colors">
          {theme === "light" ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
        </button>
        <Link href="/atendimento-app/mais" aria-label="Menu" className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-gaveta-tinta-2 hover:text-ouro-acento hover:bg-gaveta-fundo transition-colors">
          <Menu size={20} />
        </Link>
      </div>
    </header>
  );
}

function AtendimentoAppBottomNav() {
  const pathname = usePathname();
  const items = [
    { href: "/atendimento-app", label: "Triagem", Icon: LayoutDashboard },
    { href: "/atendimento-app/funil", label: "Funil", Icon: Users },
    { href: null, label: "", Icon: Plus, central: true },
    { href: "/atendimento-app/conversas", label: "Conversas", Icon: MessageSquare },
    { href: "/atendimento-app/mais", label: "Mais", Icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 h-[76px] bg-sf border-t-2 border-regua-forte flex items-center z-40">
      {items.map(({ href, label, Icon, central }) => {
        const active = href !== null && (pathname === href || pathname.startsWith(`${href}/`));
        if (central) {
          return (
            <Link key="central" href="/atendimento-app/novo" className="flex-1 flex items-center justify-center" aria-label="Novo Atendimento">
              <span className="h-[52px] w-[52px] bg-ouro-acento text-ouro-tx rounded-[2px] flex items-center justify-center">
                <Icon size={24} />
              </span>
            </Link>
          );
        }
        return (
          <Link key={href} href={href as string} className="flex-1 flex flex-col items-center justify-center gap-0.5">
            <span className="relative">
              <span className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${active ? "bg-ouro-acento" : ""}`}>
                <Icon size={19} className={active ? "text-ouro-tx" : "text-tx-2"} />
              </span>
            </span>
            <span className={`text-corpo font-medium leading-none ${active ? "text-tx" : "text-tx-2"}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}