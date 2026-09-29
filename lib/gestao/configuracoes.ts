// O MAPA DE CONFIGURAÇÕES — seis grupos, cada item um destino (consolidado R5 e R6).
//
// Antes: "Geral" era um depósito de ~16 cartões em 5.014px, com menu lateral de 8 itens que não
// batia com o `navSections` (que declarava 5), e seis subpáginas /configuracoes/* soltas, sem a
// casca e com um "← voltar" de 12px. Agora: um menu com seis grupos (do diário ao raro), e as
// subpáginas entram na mesma casca (app/(app)/configuracoes/layout.tsx).
//
// Os itens que são uma PÁGINA própria (`href`) apontam para ela; os demais são `?secao=<chave>` da
// página principal. Nenhum bloco foi apagado: só mudou de lugar e ganhou nome.

export type GrupoDeConfiguracao = "conta" | "escritorio" | "pessoas" | "fluxos" | "dados" | "plano";

export type RequisitoDoItem = "todos" | "admin" | "admin+blog" | "admin+whatsapp" | "admin+atendimento";

export type ItemDeConfiguracao = {
  chave: string;
  rotulo: string;
  grupo: GrupoDeConfiguracao;
  /** Rota própria; sem ela o item é `/configuracoes?secao=<chave>`. */
  href?: string;
  requisito: RequisitoDoItem;
};

export const GRUPOS: { chave: GrupoDeConfiguracao; rotulo: string }[] = [
  { chave: "conta", rotulo: "Minha conta" },
  { chave: "escritorio", rotulo: "Escritório" },
  { chave: "pessoas", rotulo: "Pessoas e acessos" },
  { chave: "fluxos", rotulo: "Fluxos" },
  { chave: "dados", rotulo: "Dados" },
  { chave: "plano", rotulo: "Plano" },
];

export const ITENS: ItemDeConfiguracao[] = [
  { chave: "senha", rotulo: "Senha", grupo: "conta", requisito: "todos" },
  { chave: "comunicados", rotulo: "Comunicados", grupo: "conta", href: "/configuracoes/comunicados", requisito: "todos" },
  { chave: "aplicativo", rotulo: "Aplicativo e bloqueados", grupo: "conta", requisito: "todos" },

  { chave: "identidade", rotulo: "Identidade e atuação", grupo: "escritorio", requisito: "todos" },
  { chave: "timbrado", rotulo: "Papel timbrado e modelos", grupo: "escritorio", requisito: "admin" },
  { chave: "pastas", rotulo: "Pastas do armazenamento", grupo: "escritorio", requisito: "admin" },
  { chave: "financeiro", rotulo: "Financeiro", grupo: "escritorio", requisito: "admin" },

  { chave: "usuarios", rotulo: "Usuários", grupo: "pessoas", href: "/contatos/equipe", requisito: "admin" },
  { chave: "acessos", rotulo: "Acessos da Lúmen", grupo: "pessoas", href: "/configuracoes/acessos", requisito: "todos" },
  { chave: "privacidade", rotulo: "Privacidade e trilha", grupo: "pessoas", href: "/configuracoes/privacidade", requisito: "todos" },

  { chave: "kanban", rotulo: "Kanban e pontos", grupo: "fluxos", requisito: "admin" },
  { chave: "workflows", rotulo: "Workflows", grupo: "fluxos", requisito: "admin" },
  { chave: "blog", rotulo: "Blog jurídico", grupo: "fluxos", requisito: "admin+blog" },
  { chave: "atendente", rotulo: "Atendente de IA", grupo: "fluxos", requisito: "admin+whatsapp" },
  { chave: "recusa", rotulo: "Recusa de leads", grupo: "fluxos", requisito: "admin+atendimento" },

  { chave: "importar", rotulo: "Importar", grupo: "dados", href: "/configuracoes/importar", requisito: "todos" },
  { chave: "exportar", rotulo: "Exportar", grupo: "dados", requisito: "admin" },

  { chave: "modulos", rotulo: "Módulos contratados", grupo: "plano", requisito: "admin" },
  { chave: "cobranca", rotulo: "Cobrança", grupo: "plano", requisito: "admin" },
];

/** Os nomes antigos de `?secao=` (8 abas) e para onde cada um vai. `null` = a página redireciona. */
export const SECAO_LEGADA: Record<string, string | null> = {
  geral: "senha",
  equipe: null,
  financeiro: "financeiro",
  workflows: "workflows",
  blog: "blog",
  atendente: "atendente",
  atendimento: "recusa",
  cobranca: "cobranca",
};

export type ContextoDeConfiguracao = { isAdmin: boolean; blog: boolean; whatsapp: boolean; atendimento: boolean };

export function itemVisivelEmConfiguracao(item: ItemDeConfiguracao, ctx: ContextoDeConfiguracao): boolean {
  switch (item.requisito) {
    case "todos":
      return true;
    case "admin":
      return ctx.isAdmin;
    case "admin+blog":
      return ctx.isAdmin && ctx.blog;
    case "admin+whatsapp":
      return ctx.isAdmin && ctx.whatsapp;
    case "admin+atendimento":
      return ctx.isAdmin && ctx.atendimento;
  }
}

export function hrefDoItem(item: ItemDeConfiguracao): string {
  return item.href ?? `/configuracoes?secao=${item.chave}`;
}

/** O item ativo: pela rota própria (a mais longa que casa) ou por `?secao=`. */
export function itemAtivo(pathname: string, secao: string | null, itens: ItemDeConfiguracao[]): ItemDeConfiguracao | null {
  const porRota = itens
    .filter((i) => i.href && (pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => (b.href!.length - a.href!.length))[0];
  if (porRota) return porRota;
  if (pathname !== "/configuracoes") return null;
  const chave = secao && secao in SECAO_LEGADA ? (SECAO_LEGADA[secao] ?? secao) : secao;
  return itens.find((i) => !i.href && i.chave === chave) ?? itens.find((i) => !i.href) ?? null;
}
