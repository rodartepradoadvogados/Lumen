// Lista enxuta rota -> rótulo, usada SÓ pra renomear a aba interna (ver components/AppShell.tsx
// e components/TabTitleSync.tsx) conforme a navegação acontece dentro dela. É separada da lista
// rica de components/Sidebar.tsx (que carrega ícone, sub-abas, gating de módulo/admin) porque aqui
// só interessa "que rota é essa, que nome ela tem" — casar pelo prefixo mais específico primeiro
// (ex: "/financeiro/dre" antes de "/financeiro") evita que uma sub-rota herde o rótulo genérico do pai.
const NAV_LABELS: { href: string; label: string }[] = [
  { href: "/painel", label: "Painel" },
  { href: "/kanban", label: "Kanban" },
  { href: "/agenda", label: "Agenda" },
  { href: "/alertas", label: "Alertas" },
  { href: "/publicacoes", label: "Publicações" },
  { href: "/atendimento", label: "Atendimento" },
  { href: "/processos", label: "Processos e Casos" },
  { href: "/assessoria", label: "Assessoria Jurídica" },
  { href: "/contatos/clientes", label: "Clientes" },
  { href: "/contatos/advogados", label: "Advogados" },
  { href: "/contatos/fornecedores", label: "Fornecedores" },
  { href: "/contatos/equipe", label: "Equipe" },
  { href: "/contatos", label: "Contatos" },
  { href: "/financeiro/despesas", label: "Despesas" },
  { href: "/financeiro/receitas", label: "Receitas" },
  { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa" },
  { href: "/financeiro/dre", label: "DRE" },
  { href: "/financeiro/livro-caixa", label: "Livro Caixa" },
  { href: "/financeiro", label: "Financeiro" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/produtividade", label: "Produtividade" },
  { href: "/configuracoes", label: "Configurações" },
].sort((a, b) => b.href.length - a.href.length);

export function resolveTabLabel(pathname: string): string | null {
  const match = NAV_LABELS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.label ?? null;
}
