"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Bell, Newspaper, Menu } from "lucide-react";

// Barra com 5 abas fixas (Início, Agenda, Alertas, Publicações, Menu). Início já foi tirada
// daqui uma vez (o logo/nome do escritório no cabeçalho levava pra lá, ver app/m/layout.tsx) —
// voltou porque a auditoria de navegação (2026-08) achou que ninguém descobria sozinho que o
// logo era clicável: sem NENHUM afordance visual de botão, "tocar o logo pra voltar" não é um
// gesto que se aprende por tentativa, é conhecimento que só quem já usou apps assim tem. Uma
// aba fixa, rotulada, é o jeito mais garantido de resolver "como eu volto pro início" — mesmo
// custando 1 ícone a mais na barra. O link do logo em app/m/layout.tsx continua existindo (não
// atrapalha), só deixou de ser o ÚNICO caminho.
//
// Processos segue fora daqui (fica a 1 toque na grade da Início e no Menu, ver
// app/m/mais/page.tsx) — abrir espaço pra ele empurraria a barra pra 6 abas, e ele já tem 2
// caminhos sem estar preso a nenhuma tela específica primeiro. Alertas e Publicações usam o
// MESMO ícone da grade da Início — reforça que é o mesmo destino, não um atalho novo pra aprender.
//
// Ícone ativo fica em DOURADO de propósito (não bordô, que virou a cor de ação em todo o
// resto do app com a Fase 3 da Início — ver app/m/page.tsx) — decisão explícita do dono do
// escritório: bordô em todo lugar faria o item ativo da barra se misturar com os cartões de
// "criar". Dourado aqui não é decorativo, é sinal de "onde eu estou" — papel diferente de
// "ação", por isso pode usar a cor que em todo resto do app ficou reservada só a acento.
const items = [
  { href: "/m", label: "Início", Icon: Home, exact: true, badge: null },
  { href: "/m/agenda", label: "Agenda", Icon: Calendar, exact: false, badge: "agenda" as const },
  { href: "/m/alertas", label: "Alertas", Icon: Bell, exact: false, badge: "alerts" as const },
  { href: "/m/publicacoes", label: "Publicações", Icon: Newspaper, exact: false, badge: null },
  { href: "/m/mais", label: "Menu", Icon: Menu, exact: false, badge: null },
];

export default function MobileBottomNav({ alertsCount, todayAgendaCount = 0 }: { alertsCount: number; todayAgendaCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 h-16 bg-sf border-t border-regua flex z-40">
      {items.map(({ href, label, Icon, exact, badge }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        // "agenda" conta compromissos de HOJE (ver getTodayAgendaCount) — conceito diferente de
        // "alerts" (menções, prazos vencidos, tarefas delegadas etc.), por isso cada aba lê a
        // sua própria prop em vez de dividir alertsCount entre as duas.
        const badgeCount = badge === "agenda" ? todayAgendaCount : badge === "alerts" ? alertsCount : 0;
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5"
          >
            <span className="relative">
              <span
                className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                  active ? "bg-marca" : ""
                }`}
              >
                <Icon
                  size={19}
                  className={active ? "text-marca-tx" : "text-tx-2"}
                />
              </span>
              {badge && badgeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-vinho-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </span>
            <span
              className={`text-[10px] font-medium leading-none ${
                active ? "text-tx" : "text-tx-2"
              }`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
