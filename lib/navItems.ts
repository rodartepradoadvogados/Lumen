import { resolveTwoLevelLabel } from "@/lib/navSections";

// Fallback de resolveTabLabel abaixo — só entra em jogo pra rota que resolveTwoLevelLabel não
// cobre (não é item de nenhuma RAIL_SECTIONS, ex. "/financeiro" bare, sem sub-rota). Casar pelo
// prefixo mais específico primeiro (ex: "/financeiro/dre" antes de "/financeiro") evita que uma
// sub-rota herde o rótulo genérico do pai.
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
  const twoLevel = resolveTwoLevelLabel(pathname);
  if (twoLevel) return twoLevel;
  const match = NAV_LABELS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.label ?? null;
}
