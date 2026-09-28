// ============================================================================
// QUEM, NA EQUIPE DA LÚMEN, PODE LIBERAR UMA CAMPANHA PAGA.
//
// A especificação fechada do módulo (§6.4) dizia "qualquer funcionário com acesso ao painel
// mestre aprova, sem papel granular". O dono REVISOU essa decisão depois de ver a tela pronta e
// nomeou os quatro papéis: Comercial, Marketing, Financeiro e Sócio. Ficam de fora Suporte N1 e
// Engenharia — quem entra no painel para atender chamado ou investigar defeito não decide sobre
// cobrança de cliente.
//
// Módulo PURO de propósito (sem Prisma, sem cookie): a mesma função responde no servidor, antes
// de gravar, e na tela, para o botão nem aparecer para quem não pode. Uma segunda implementação
// numa das duas pontas é como a trava vira enfeite — a tela esconde o botão e o servidor aceita
// mesmo assim, ou o contrário.
// ============================================================================

/** As chaves são as de PlatformRole.key (ver prisma/schema.prisma e app/api/admin/setup-lumen). */
export const PAPEIS_QUE_APROVAM_CAMPANHA = ["SOCIO", "FINANCEIRO", "COMERCIAL", "MARKETING"] as const;

export const MOTIVO_PAPEL_SEM_APROVACAO =
  "Seu papel na equipe da Lúmen não libera campanha paga — só Comercial, Marketing, Financeiro e Sócio.";

/**
 * FAIL-CLOSED: papel vazio, nulo ou desconhecido NUNCA aprova. Um papel novo criado amanhã no
 * painel (ou um dado torto vindo do banco) começa sem poder liberar cobrança, e alguém precisa
 * vir aqui de propósito para incluí-lo — que é a ordem certa para uma decisão sobre dinheiro.
 */
export function podeAprovarCampanha(papel: string | null | undefined): boolean {
  if (!papel) return false;
  const normalizado = papel.trim().toUpperCase();
  return (PAPEIS_QUE_APROVAM_CAMPANHA as readonly string[]).includes(normalizado);
}
