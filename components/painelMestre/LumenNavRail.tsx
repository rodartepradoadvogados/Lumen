"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Building2, Wallet, Users, Activity, ShieldCheck, Scale, Tag, Menu, X } from "lucide-react";
import LumenMark from "@/components/LumenMark";

type NavItem = { label: string; href: string; icon: LucideIcon; comingSoon?: boolean };
type NavGroup = { label: string; items: NavItem[] };

// Financeiro Lúmen e Equipe Lúmen (Administração) ganharam página na Fase 2; os três itens de
// Operação ganharam a deles na Fase 3 (Produto e robôs, Cofre de acesso, Confiança e LGPD).
// Nenhum item deste rail tem mais comingSoon: true.
//
// "Assinaturas" saiu do rail nesta rodada (reforma do Painel da Empresa, ver
// .impeccable/plano-painel-mestre/andamento-painel-mestre.md) — a página própria virou aba
// "Cobrança & Assinatura" dentro de cada escritório (app/painel-mestre/[officeId]/page.tsx); o
// selo de saúde que justificava uma tela à parte agora aparece na própria lista de Escritórios.
const GROUPS: NavGroup[] = [
  {
    label: "Negócio",
    items: [
      { label: "Cockpit", href: "/painel-mestre", icon: LayoutDashboard },
      { label: "Escritórios", href: "/painel-mestre/escritorios", icon: Building2 },
      { label: "Preços", href: "/painel-mestre/precos", icon: Tag },
    ],
  },
  {
    label: "Administração",
    items: [
      { label: "Financeiro Lúmen", href: "/painel-mestre/financeiro", icon: Wallet },
      { label: "Equipe Lúmen", href: "/painel-mestre/equipe", icon: Users },
    ],
  },
  {
    label: "Operação",
    items: [
      { label: "Produto e robôs", href: "/painel-mestre/produto", icon: Activity },
      { label: "Cofre de acesso", href: "/painel-mestre/cofre", icon: ShieldCheck },
      { label: "Confiança e LGPD", href: "/painel-mestre/confianca", icon: Scale },
    ],
  },
];

export default function LumenNavRail() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Fecha a gaveta ao navegar — mesmo padrão de components/Sidebar.tsx (o rail do lado
  // escritório), que já resolve isso do mesmo jeito para a versão estreita de tela.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 h-9 w-9 flex items-center justify-center bg-gaveta text-gaveta-tinta border border-gaveta-linha"
        aria-label="Abrir menu do Painel da Empresa"
      >
        <Menu size={18} />
      </button>

      {open && <div className="md:hidden fixed inset-0 z-40 bg-gaveta-fundo/60" onClick={() => setOpen(false)} />}

      <nav
        className={`w-56 shrink-0 bg-gaveta border-r border-gaveta-linha flex flex-col h-full fixed md:static top-0 left-0 z-50 overflow-y-auto scrollbar-thin transition-transform duration-200 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 py-5 border-b border-gaveta-linha relative">
          <button
            onClick={() => setOpen(false)}
            className="md:hidden absolute top-4 right-4 text-gaveta-tinta-2 hover:text-gaveta-tinta"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-2">
            <LumenMark size={28} />
            <span className="text-lg font-semibold text-gaveta-tinta">LÚMEN</span>
          </div>
          <p className="text-etiqueta font-semibold uppercase tracking-wide text-gaveta-tinta/40 mt-1.5">
            Painel da Empresa
          </p>
        </div>

        <div className="flex-1 py-4 space-y-6">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-4 text-etiqueta font-semibold uppercase tracking-wide text-gaveta-tinta/35 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5 px-2">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 text-sm border-l-2 transition-colors ${
                        active
                          ? "border-marca-tx bg-gaveta-fundo text-gaveta-tinta font-semibold"
                          : "border-transparent text-gaveta-tinta-2 hover:bg-gaveta-fundo hover:text-gaveta-tinta"
                      }`}
                    >
                      <Icon size={16} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.comingSoon && (
                        <span className="text-etiqueta font-semibold uppercase tracking-wide text-gaveta-tinta/30">
                          em breve
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
