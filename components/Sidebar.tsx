"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Kanban,
  CalendarDays,
  Briefcase,
  Wallet,
  Users,
  Newspaper,
  Bell,
  Settings,
  Headset,
  Trophy,
  BarChart3,
  Menu,
  X,
} from "lucide-react";
import clsx from "clsx";
import { THEME_KEY, THEME_CHANGE_EVENT, isThemeMode, type ThemeMode } from "@/lib/theme";
import LumenMark from "@/components/LumenMark";

// Sub-aba de um item do menu: aparece expandida logo abaixo do item pai quando
// a rota atual pertence àquela seção (sem precisar de clique extra pra abrir).
// `value` é o valor da querystring (`item.subParam=value`); `undefined` representa
// a opção "sem filtro" (ex: "Todos"), que não adiciona nada à URL.
// `href`: alternativa a `value` para sub-abas que são ROTAS PRÓPRIAS (ex: Contatos
// e Financeiro, cujos módulos vivem em `/contatos/clientes`, `/financeiro/dre` etc.,
// e não em querystring do item pai). Quando `href` é definido, ele é usado como link
// e como critério de "ativo" no lugar de `subParam`/`value`.
type SubNavItem = {
  label: string;
  value?: string;
  href?: string;
  adminOnly?: boolean;
  // Só aparece quando o usuário tem acesso ao Financeiro (isAdmin OU financeAccess
  // — mesmo critério de `hasFinanceAccess` usado pros itens de topo do menu).
  financeOnly?: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  subParam?: string;
  subItems?: SubNavItem[];
  // Valor considerado "ativo" quando a querystring não traz `subParam` (ex: a
  // página de Configurações cai em "geral" por padrão). Deixe undefined quando
  // a ausência do parâmetro já corresponde a uma sub-aba própria (ex: "Todos").
  subDefaultValue?: string;
};

// Menu reorganizado em categorias: visão geral do dia a dia primeiro, depois
// atendimento ao cliente, depois o núcleo jurídico/financeiro e por fim gestão
// interna do escritório.
const navGroups: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { href: "/painel", label: "Painel", icon: LayoutDashboard },
      { href: "/kanban", label: "Kanban", icon: Kanban },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
    ],
  },
  {
    label: "Atendimento",
    items: [
      { href: "/alertas", label: "Alertas", icon: Bell },
      { href: "/publicacoes", label: "Publicações", icon: Newspaper },
      {
        href: "/atendimento",
        label: "Atendimento",
        icon: Headset,
        subParam: "status",
        subItems: [
          { label: "Todos" },
          { label: "Novo", value: "NOVO" },
          { label: "Em Triagem", value: "EM_TRIAGEM" },
          { label: "Convertido", value: "CONVERTIDO" },
          { label: "Arquivado", value: "ARQUIVADO" },
          { label: "Rascunhos", value: "RASCUNHO" },
        ],
      },
    ],
  },
  {
    label: "Jurídico",
    items: [
      {
        href: "/processos",
        label: "Processos e Casos",
        icon: Briefcase,
        subParam: "status",
        subItems: [
          { label: "Todos" },
          { label: "Ativo", value: "ATIVO" },
          { label: "Suspenso", value: "SUSPENSO" },
          { label: "Encerrado", value: "ENCERRADO" },
          { label: "Arquivado", value: "ARQUIVADO" },
        ],
      },
      {
        href: "/contatos",
        label: "Contatos",
        icon: Users,
        subItems: [
          { label: "Clientes", href: "/contatos/clientes" },
          { label: "Advogados", href: "/contatos/advogados" },
          { label: "Fornecedores", href: "/contatos/fornecedores" },
          { label: "Equipe", href: "/contatos/equipe" },
        ],
      },
      {
        href: "/financeiro",
        label: "Financeiro",
        icon: Wallet,
        adminOnly: true,
        subItems: [
          { label: "Contas a Pagar", href: "/financeiro/contas-a-pagar" },
          { label: "Contas a Receber", href: "/financeiro/contas-a-receber" },
          { label: "Fluxo de Caixa", href: "/financeiro/fluxo-de-caixa" },
          { label: "DRE", href: "/financeiro/dre" },
          { label: "Livro Caixa", href: "/financeiro/livro-caixa" },
        ],
      },
    ],
  },
  {
    label: "Gestão",
    items: [
      {
        href: "/relatorios",
        label: "Relatórios",
        icon: BarChart3,
        subParam: "secao",
        subDefaultValue: "produtividade",
        subItems: [
          { label: "Produtividade", value: "produtividade" },
          { label: "Processos", value: "processos" },
          { label: "Funil Comercial", value: "funil" },
          { label: "Publicações", value: "publicacoes" },
          { label: "Financeiro", value: "financeiro", financeOnly: true },
        ],
      },
      {
        href: "/produtividade",
        label: "Produtividade",
        icon: Trophy,
        subParam: "aba",
        subItems: [
          { label: "Histórico" },
          { label: "Timesheet", value: "timesheet" },
          { label: "Delegar", value: "delegar" },
        ],
      },
      {
        href: "/configuracoes",
        label: "Configurações",
        icon: Settings,
        subParam: "secao",
        subDefaultValue: "geral",
        subItems: [
          { label: "Geral", value: "geral" },
          { label: "Equipe & Acesso", value: "equipe", adminOnly: true },
          { label: "Financeiro", value: "financeiro" },
          { label: "Produtividade", value: "produtividade" },
          { label: "Workflows", value: "workflows" },
          { label: "Blog Jurídico", value: "blog", adminOnly: true },
          { label: "Modelos & Integrações", value: "modelos" },
        ],
      },
    ],
  },
];

export default function Sidebar({
  hasFinanceAccess = true,
  isAdmin = false,
  unreadPublications = 0,
}: {
  hasFinanceAccess?: boolean;
  isAdmin?: boolean;
  unreadPublications?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Modo de tema exato ("light"/"auto"/"dark"), sincronizado via THEME_CHANGE_EVENT
  // (disparado por components/ThemeToggle.tsx) — necessário porque a classe `dark` do <html>
  // só expõe um binário (escuro ou não) e o pedido é: barra lateral clara SÓ no modo "light"
  // ("Dia"); em "auto" ("Tarde") e "dark" ("Noite") ela continua navy, idêntica a hoje. Começa
  // em "auto" (o default seguro, igual ao comportamento atual antes desta mudança) e só é
  // ajustado depois do mount, pra evitar mismatch de hidratação — mesmo padrão da flag
  // `mounted` em components/ThemeToggle.tsx.
  const [themeMode, setThemeMode] = useState<ThemeMode>("auto");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch {
      // localStorage indisponível (modo privado etc.) — segue com "auto".
    }
    setThemeMode(isThemeMode(stored) ? stored : "auto");

    function handleThemeChange(event: Event) {
      const detail = (event as CustomEvent<ThemeMode>).detail;
      if (isThemeMode(detail)) setThemeMode(detail);
    }
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, []);

  const isLightForced = themeMode === "light";

  useEffect(() => {
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams.toString()]);

  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || hasFinanceAccess),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 h-9 w-9 flex items-center justify-center rounded-lg bg-navy-900 text-cream-50 shadow-pop"
        aria-label="Abrir menu"
      >
        <Menu size={18} />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-navy-950/50" onClick={() => setOpen(false)} />
      )}

      <aside
        className={clsx(
          "w-64 shrink-0 flex flex-col h-full fixed md:static top-0 left-0 z-50 transition-transform duration-200 md:translate-x-0",
          isLightForced ? "bg-cream-50 text-navy-900 border-r border-navy-900/10" : "bg-navy-900 text-cream-100",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className={clsx("px-6 py-6 border-b relative", isLightForced ? "border-navy-900/10" : "border-white/10")}>
          <button
            onClick={() => setOpen(false)}
            className={clsx(
              "md:hidden absolute top-4 right-4",
              isLightForced ? "text-navy-800/60 hover:text-navy-900" : "text-cream-100/60 hover:text-cream-50"
            )}
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
          <div className="flex justify-center mb-2">
            <LumenMark size={40} />
          </div>
          <h1 className="font-serif text-xl font-bold tracking-wide text-center leading-tight">LÚMEN</h1>
          <p
            className={clsx(
              "text-center text-[11px] tracking-[0.3em] font-medium mt-0.5",
              isLightForced ? "text-gold-700" : "text-gold-500"
            )}
          >
            GESTÃO JURÍDICA
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-thin">
          {groups.map((group, groupIndex) => (
            <div key={group.label ?? "principal"} className={groupIndex === 0 ? "space-y-0.5" : "space-y-0.5 mt-4"}>
              {group.label && (
                <p
                  className={clsx(
                    "text-[10px] font-semibold tracking-widest uppercase px-3 mb-1",
                    isLightForced ? "text-navy-800/40" : "text-cream-100/40"
                  )}
                >
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const active = pathname?.startsWith(item.href);
                const Icon = item.icon;
                const visibleSubItems =
                  item.subItems?.filter((sub) => (!sub.adminOnly || isAdmin) && (!sub.financeOnly || hasFinanceAccess)) ?? [];
                // Sub-abas expandem sozinhas quando a rota atual já pertence a essa
                // seção — sem exigir um clique extra só pra abrir o submenu.
                const expanded = active && visibleSubItems.length > 0;
                const currentSubValue = item.subParam ? searchParams.get(item.subParam) ?? item.subDefaultValue : undefined;

                return (
                  <div key={item.href}>
                    <Link
                      href={item.href}
                      className={clsx(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm border-l-2 transition-colors",
                        active
                          ? isLightForced
                            ? "bg-bordo-600/10 text-navy-900 font-semibold border-bordo-700"
                            : "bg-bordo-600/15 text-bordo-400 font-semibold border-bordo-600"
                          : isLightForced
                          ? "text-navy-800/70 font-medium border-transparent hover:bg-navy-900/5 hover:text-navy-900"
                          : "text-cream-100/80 font-medium border-transparent hover:bg-white/5 hover:text-cream-50"
                      )}
                    >
                      <Icon size={18} strokeWidth={2} />
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/publicacoes" && unreadPublications > 0 && (
                        <span className="bg-gold-600 text-white rounded-full text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center">
                          {unreadPublications > 99 ? "99+" : unreadPublications}
                        </span>
                      )}
                    </Link>

                    {visibleSubItems.length > 0 && (
                      <div
                        className={clsx(
                          "grid transition-[grid-template-rows,opacity] duration-200 ease-in-out",
                          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="pt-0.5 pb-1 pl-4 space-y-0.5">
                            {visibleSubItems.map((sub) => {
                              // Sub-abas com `href` são rotas próprias (Contatos, Financeiro);
                              // as demais seguem o padrão de querystring já existente.
                              const subHref = sub.href ?? `${item.href}${sub.value ? `?${item.subParam}=${sub.value}` : ""}`;
                              const subActive = sub.href
                                ? expanded && (pathname === sub.href || pathname?.startsWith(`${sub.href}/`))
                                : expanded && currentSubValue === (sub.value ?? undefined);
                              return (
                                <Link
                                  key={sub.label}
                                  href={subHref}
                                  className={clsx(
                                    "block pl-6 pr-3 py-1.5 rounded-md text-[13px] transition-colors",
                                    subActive
                                      ? isLightForced
                                        ? "bg-bordo-600/10 text-navy-900 font-semibold"
                                        : "bg-navy-700/40 text-bordo-400 font-semibold"
                                      : isLightForced
                                      ? "text-navy-800/70 hover:bg-navy-900/5 hover:text-navy-900"
                                      : "text-cream-100/70 hover:bg-navy-700/25 hover:text-cream-50"
                                  )}
                                >
                                  {sub.label}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div
          className={clsx(
            "px-4 py-4 border-t text-[11px]",
            isLightForced ? "border-navy-900/10 text-navy-800/50" : "border-white/10 text-cream-100/50"
          )}
        >
          Sistema Interno · v0.1
        </div>
      </aside>
    </>
  );
}
