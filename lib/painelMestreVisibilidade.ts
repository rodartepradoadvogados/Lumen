// ============================================================================
// A ESCADA DE VISIBILIDADE, aplicada ao agente do Painel Mestre (F7).
//
// `PlatformRole.maxVisibility` (prisma/schema.prisma) já existe e já é a régua que o resto do
// produto usa: ABERTO | VIDRO_FOSCO | QUEBRA_VIDRO. NINGUÉM alcança COFRE — nem sócio (o
// comentário do próprio schema é literal nisso). Este arquivo não inventa uma régua nova: só dá
// ORDEM aos quatro nomes, para que "esta ferramenta exige VIDRO_FOSCO" vire uma comparação, e não
// um `if` escrito à mão em cada ferramenta (que um dia alguém escreveria ao contrário).
//
// LEI 1 DO AGENTE ("ele herda a credencial de quem perguntou"): toda ferramenta do agente declara
// o nível que exige, e `alcancaNivel` decide se o `PlatformViewer` da pergunta chega lá. Não
// existe caminho para uma ferramenta ser oferecida a alguém cujo papel não alcança o nível dela —
// a checagem mora aqui, não em cada `executar`, pelo mesmo motivo de lib/nivelFinanceiro.ts: uma
// trava numa função pura, testável sem banco, é uma trava; uma trava copiada em sete `executar`
// diferentes é sete chances de esquecer numa oitava ferramenta.
//
// COFRE nunca é EXIGIDO por nenhuma ferramenta deste agente, de propósito: não existe, hoje, uma
// pergunta de chat que devesse abrir a porta mais alta da casa. Quebra-vidro POR REGISTRO
// (lib/breakGlass.ts) continua sendo um ATO deliberado e logado por registro, feito pela tela —
// nunca algo que uma pergunta em linguagem natural aciona sozinha. Ver o comentário de
// `consultar_atividade_do_escritorio` em lib/painelMestreFerramentas.ts para o motivo por extenso.
// ============================================================================

export type NivelDeVisibilidade = "ABERTO" | "VIDRO_FOSCO" | "QUEBRA_VIDRO" | "COFRE";

// A ORDEM É A REGRA. Mudar a posição de um nome aqui muda quem alcança o quê em todo o agente.
const ESCADA: readonly NivelDeVisibilidade[] = ["ABERTO", "VIDRO_FOSCO", "QUEBRA_VIDRO", "COFRE"];

/**
 * O `PlatformViewer.maxVisibility` alcança o nível exigido?
 *
 * FAIL-CLOSED: um `max` que não é um dos quatro nomes conhecidos (papel corrompido, campo vazio,
 * valor novo que ninguém ensinou à escada ainda) NUNCA alcança nada — nem o nível mais baixo,
 * ABERTO. Um papel desconhecido começa sem acesso nenhum ao agente, e alguém precisa vir aqui de
 * propósito para incluí-lo, na mesma ordem de lib/aprovacaoDeCampanha.ts:podeAprovarCampanha.
 */
export function alcancaNivel(max: string | null | undefined, exigido: NivelDeVisibilidade): boolean {
  const i = ESCADA.indexOf((max ?? "") as NivelDeVisibilidade);
  if (i < 0) return false;
  return i >= ESCADA.indexOf(exigido);
}

/** A frase que o agente devolve quando o papel de quem perguntou não alcança a ferramenta. */
export function motivoNivelInsuficiente(exigido: NivelDeVisibilidade): string {
  if (exigido === "ABERTO") {
    return "Seu papel na equipe da Lúmen não tem acesso ao Painel Mestre.";
  }
  if (exigido === "VIDRO_FOSCO") {
    return "Esta consulta olha para dentro de um escritório específico — seu papel na equipe da Lúmen não alcança esse nível.";
  }
  return "Esta consulta exige um nível de acesso que nenhum papel da equipe da Lúmen alcança.";
}
